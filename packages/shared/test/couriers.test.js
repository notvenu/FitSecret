import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerFor, bucket, parseShiprocket, parseDelhivery } from '../couriers.js';

test('provider and status buckets', () => {
  assert.equal(providerFor('Shiprocket (Xpressbees)'), 'shiprocket');
  assert.equal(providerFor('DELHIVERY'), 'delhivery');
  assert.equal(providerFor('DTDC'), null);
  assert.equal(bucket('Out For Delivery'), 'out_for_delivery');
  assert.equal(bucket('Delivered'), 'delivered');
  assert.equal(bucket('Undelivered - Customer not available'), 'failed');
  assert.equal(bucket('RTO Initiated'), 'rto');
  assert.equal(bucket('Shipment Picked Up'), 'picked_up');
  assert.equal(bucket('Reached at destination hub'), 'in_transit');
});

test('Shiprocket tracking (plain and keyed by AWB)', () => {
  const td = { track_status: 1, shipment_status: 18, track_url: 'https://shiprocket.co/tracking/123', etd: '2026-10-25 18:00:00',
    shipment_track: [{ awb_code: '123', current_status: 'OUT FOR DELIVERY', origin: 'Hyderabad', destination: 'Vijayawada', edd: null, delivered_date: null, courier_name: 'Xpressbees' }],
    shipment_track_activities: [
      { date: '2026-10-23 09:10:00', status: 'X-PPOM', activity: 'Picked up', location: 'Hyderabad', 'sr-status-label': 'PICKED UP' },
      { date: '2026-10-24 08:00:00', status: 'X-DDD3FD', activity: 'Out for delivery', location: 'Vijayawada', 'sr-status-label': 'OUT FOR DELIVERY' },
    ] };
  for (const json of [{ tracking_data: td }, { 123: { tracking_data: td } }]) {
    const t = parseShiprocket(json, '123');
    assert.equal(t.status, 'out_for_delivery');
    assert.equal(t.edd, '2026-10-25');
    assert.equal(t.events[0].status, 'OUT FOR DELIVERY', 'newest first');
    assert.equal(t.courier, 'Xpressbees');
  }
  assert.equal(parseShiprocket({ tracking_data: { track_status: 0, error: 'Aahh! There is no activities found in our DB.' } }, '9').status, 'booked');
  assert.equal(parseShiprocket({ message: 'Unauthenticated' }, '9'), null);
});

test('Delhivery tracking', () => {
  const json = { ShipmentData: [{ Shipment: { AWB: '555', Origin: 'Bhiwandi', Destination: 'Vijayawada', ExpectedDeliveryDate: '2026-10-26T00:00:00',
    Status: { Status: 'Delivered', StatusType: 'DL', StatusDateTime: '2026-10-25T14:20:00', StatusLocation: 'Vijayawada', Instructions: 'Delivered to consignee' },
    Scans: [{ ScanDetail: { Scan: 'Manifested', ScanDateTime: '2026-10-22T10:00:00', ScannedLocation: 'Bhiwandi', Instructions: 'Shipment manifested' } },
      { ScanDetail: { Scan: 'Delivered', ScanDateTime: '2026-10-25T14:20:00', ScannedLocation: 'Vijayawada', Instructions: 'Delivered to consignee' } }] } }] };
  const t = parseDelhivery(json, '555');
  assert.equal(t.status, 'delivered');
  assert.equal(t.events.length, 2);
  assert.equal(t.events[0].status, 'Delivered');
  assert.equal(t.edd, '2026-10-26');
  assert.equal(parseDelhivery({ ShipmentData: [] }, '1'), null);
  assert.equal(parseDelhivery({ ShipmentData: [{ Shipment: { AWB: '1', Status: { Status: 'In Transit', StatusType: 'UD' }, Scans: [] } }] }, '1').status, 'in_transit');
});

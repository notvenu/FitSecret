// Courier tracking → one shape the website shows. The website's /api/shipment route calls the courier (keys stay server-side)
// and passes the raw JSON through these pure parsers. Parsers are defensive: courier JSON shapes vary between accounts/versions.
//
// Shiprocket:  POST https://apiv2.shiprocket.in/v1/external/auth/login {email,password} → {token}  (Bearer, valid ~10 days)
//              GET  https://apiv2.shiprocket.in/v1/external/courier/track/awb/{awb}
// Delhivery:   GET  https://track.delhivery.com/api/v1/packages/json/?waybill={awb}   header Authorization: Token <key>
//              (staging-express.delhivery.com for staging; limit 750 requests / 5 min / IP)

export const COURIERS = ['Shiprocket', 'Delhivery', 'DTDC', 'Blue Dart', 'India Post', 'Other'];

// Which live-tracking provider handles an order's courier field. Shiprocket ships via many couriers, so staff pick "Shiprocket".
export function providerFor(courier) {
  const c = String(courier || '').toLowerCase();
  if (c.includes('shiprocket')) return 'shiprocket';
  if (c.includes('delhivery')) return 'delhivery';
  return null;
}

// Common status buckets so the website can show one progress bar whatever the courier.
const BUCKETS = [
  ['delivered', /\bdelivered\b(?!.*(not|un|fail|attempt))/i],
  ['rto', /\brto\b|return(ed)? to origin|returned/i],
  ['failed', /undelivered|not delivered|delivery failed|failed attempt|attempt(ed)? fail|ndr|refused|cancel/i],
  ['out_for_delivery', /out for delivery|\bofd\b|dispatched for delivery/i],
  ['in_transit', /transit|shipped|dispatched|reached|arrived|forwarded|connected|bag(ged)?|hub|in transit/i],
  ['picked_up', /picked|pickup done|manifest/i],
  ['booked', /pending|booked|manifested|pickup scheduled|label|awb assigned|ready/i],
];
export function bucket(text) {
  for (const [k, re] of BUCKETS) if (re.test(String(text || ''))) return k;
  return 'in_transit';
}
export const BUCKET_LABEL = {
  booked: 'Shipment booked', picked_up: 'Picked up', in_transit: 'In transit', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', failed: 'Delivery attempt failed', rto: 'Returning to us',
};

const iso = (s) => {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T'));
  return Number.isNaN(+d) ? String(s) : d.toISOString();
};
// a date-only value (expected delivery) keeps the courier's calendar day; no timezone shift
const day = (s) => (!s ? null : /^\d{4}-\d\d-\d\d/.test(String(s)) ? String(s).slice(0, 10) : String(iso(s)).slice(0, 10));
const byNewest = (a, b) => String(b.at).localeCompare(String(a.at));

// Finds tracking_data whether the reply is {tracking_data} or keyed by AWB / shipment id: {"123": {tracking_data}}.
function findTracking(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.tracking_data) return json.tracking_data;
  for (const v of Object.values(json)) if (v && typeof v === 'object' && v.tracking_data) return v.tracking_data;
  return null;
}

export function parseShiprocket(json, awb) {
  const t = findTracking(json);
  if (!t) return null;
  if (t.error && !(t.shipment_track_activities || []).length) return { provider: 'shiprocket', awb, status: 'booked', label: BUCKET_LABEL.booked, note: String(t.error), events: [] };
  const track = (t.shipment_track || [])[0] || {};
  const events = (t.shipment_track_activities || []).map((a) => ({
    at: iso(a.date), status: a['sr-status-label'] && a['sr-status-label'] !== 'NA' ? a['sr-status-label'] : a.activity || a.status, detail: a.activity || '', location: a.location || '',
  })).filter((e) => e.status).sort(byNewest);
  const latest = track.current_status || events[0]?.status || '';
  const status = track.delivered_date ? 'delivered' : bucket(latest);
  return {
    provider: 'shiprocket', awb: track.awb_code || awb, status, label: BUCKET_LABEL[status], current: latest || null,
    edd: day(track.edd || t.etd), delivered_at: iso(track.delivered_date) || null, origin: track.origin || null, destination: track.destination || null,
    courier: track.courier_name || null, url: t.track_url || null, events,
  };
}

export function parseDelhivery(json, awb) {
  const s = json?.ShipmentData?.[0]?.Shipment;
  if (!s) return null;
  const st = s.Status || {};
  const events = (s.Scans || []).map((x) => x.ScanDetail || x).map((d) => ({
    at: iso(d.ScanDateTime || d.StatusDateTime), status: d.Scan || d.Status, detail: d.Instructions || '', location: d.ScannedLocation || d.StatusLocation || '',
  })).filter((e) => e.status).sort(byNewest);
  const latest = [st.Status, st.Instructions].filter(Boolean).join(' · ');
  const status = /^delivered$/i.test(st.Status || '') ? 'delivered' : /^rto$/i.test(st.StatusType || '') ? 'rto' : bucket(latest || events[0]?.status);
  return {
    provider: 'delhivery', awb: s.AWB || awb, status, label: BUCKET_LABEL[status], current: latest || null,
    edd: day(s.ExpectedDeliveryDate || s.PromisedDeliveryDate), delivered_at: status === 'delivered' ? iso(st.StatusDateTime) : null,
    origin: s.Origin || null, destination: s.Destination || null, courier: 'Delhivery', url: `https://www.delhivery.com/track/package/${encodeURIComponent(s.AWB || awb)}`, events,
  };
}

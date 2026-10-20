import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcLine, calcInvoice, fyLabel, toLocal, toWire } from '../index.js';
import { SEED_ITEMS, uuidFrom } from '../seed.js';

test('inclusive line splits GST out of price', () => {
  assert.deepEqual(calcLine({ qty: 1, rate: 118, gst_rate: 18 }), { taxable: 100, tax: 18, total: 118 });
});

test('exclusive line adds GST on top', () => {
  assert.deepEqual(calcLine({ qty: 2, rate: 50, gst_rate: 18 }, false), { taxable: 100, tax: 18, total: 118 });
});

test('discount applies before tax', () => {
  assert.equal(calcLine({ qty: 1, rate: 200, discount_pct: 10, gst_rate: 0 }).total, 180);
});

test('invoice: intra-state splits CGST/SGST, rounds to rupee', () => {
  const r = calcInvoice([{ qty: 1, rate: 3599, gst_rate: 18 }, { qty: 3, rate: 399.5, gst_rate: 5 }]);
  assert.equal(r.cgst, r.sgst);
  assert.equal(round(r.taxable + r.cgst + r.sgst + r.round_off), r.total);
  assert.equal(r.igst, 0);
  assert.equal(r.total, Math.round(3599 + 1198.5));
  assert.equal(Math.abs(r.round_off) <= 0.5, true);
});

test('invoice: inter-state uses IGST', () => {
  const r = calcInvoice([{ qty: 1, rate: 118, gst_rate: 18 }], { interState: true });
  assert.equal(r.igst, 18); assert.equal(r.cgst, 0);
});

test('financial year label', () => {
  assert.equal(fyLabel('2026-03-31'), '25-26');
  assert.equal(fyLabel('2026-04-01'), '26-27');
});

test('wire <-> local roundtrip', () => {
  const row = { ...SEED_ITEMS[0], created_at: '2026-01-01T00:00:00+00:00', updated_at: '2026-01-01T00:00:00Z', deleted: false };
  const local = toLocal('items', row);
  assert.equal(local.online, 1); assert.equal(typeof local.goals, 'string');
  assert.equal(local.created_at, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(toWire('items', local).goals, row.goals);
});

test('seed ids are stable uuids', () => {
  assert.match(uuidFrom('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(SEED_ITEMS.map((i) => i.id)).size, SEED_ITEMS.length);
});

const round = (n) => Math.round(n * 100) / 100;

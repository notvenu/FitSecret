// POS API over HTTP against an in-memory SQLite DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.FITSECRET_DATA = join(tmpdir(), 'fitsecret-test-' + process.pid);
const D = await import('../server/db.js');
const { createApp } = await import('../server/index.js');

let server, base, admin, cashier, items, db;
const api = (token) => async (path, body, method) => {
  const r = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', 'x-token': token || '' }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error || r.status), { status: r.status });
  return j;
};

before(async () => {
  db = D.openDb(':memory:');
  const sync = { kick() {}, run: async () => {}, status: () => ({ state: 'off' }), configure: async () => {} };
  server = createApp(db, sync).listen(0);
  base = `http://localhost:${server.address().port}`;
  const anon = api();
  assert.equal((await anon('/api/bootstrap')).setup, true);
  await anon('/api/setup', { branch: { name: 'FitSecret Vijayawada', code: 'VJA', state_code: '37' }, admin: { name: 'Owner', pin: '1234' }, demo: true });
  const { users } = await anon('/api/bootstrap');
  await assert.rejects(anon('/api/login', { user_id: users[0].id, pin: '0000' }), /Wrong PIN/);
  admin = api((await anon('/api/login', { user_id: users[0].id, pin: '1234' })).token);
  const { id } = await admin('/api/users', { name: 'Counter 1', pin: '1111', role: 'cashier' });
  cashier = api((await anon('/api/login', { user_id: id, pin: '1111' })).token);
  items = await admin('/api/items');
  // real catalogue ships without cost prices; give the first few one so P&L has COGS
  for (const it of items.slice(0, 5)) await admin('/api/t/items', { id: it.id, purchase_price: Math.round(it.sale_price * 0.7), gst_rate: 18 });
  items = await admin('/api/items');
});
after(() => server.close());

const stockOf = async (id) => (await admin('/api/items')).find((i) => i.id === id).stock;

test('api requires login', async () => {
  await assert.rejects(api()('/api/items'), (e) => e.status === 401);
});

test('cash sale: GST split, FEFO batches, numbering, stock out', async () => {
  const it = items[0];
  await admin('/api/stock/adjust', { item_id: it.id, qty: 2, batch_no: 'EARLY', expiry: '2026-12-01' });
  const before = await stockOf(it.id);
  const inv = await cashier('/api/invoices', { lines: [{ item_id: it.id, qty: 3 }], payments: [{ mode: 'cash', amount: 99999 }] });
  assert.match(inv.no, /^VJA\/\d\d-\d\d\/0001$/);
  assert.equal(inv.status, 'paid');
  assert.equal(inv.paid, inv.total); // change handed back, not recorded
  assert.equal(inv.cgst, inv.sgst);
  assert.equal(await stockOf(it.id), before - 3);
  const b = await admin(`/api/items/${it.id}/batches`);
  assert.ok(!b.find((x) => x.batch_no === 'EARLY'), 'earliest-expiry batch sold first');
  const inv2 = await cashier('/api/invoices', { lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'upi', amount: 1e6 }] });
  assert.match(inv2.no, /\/0002$/);
});

test('credit sale needs a customer; partial payment tracked in party balance', async () => {
  await assert.rejects(cashier('/api/invoices', { lines: [{ item_id: items[1].id, qty: 1 }] }), /Select a customer/);
  const party = await cashier('/api/t/parties', { name: 'Gym Partner', type: 'customer', phone: '9876543210', state_code: '36' });
  const inv = await cashier('/api/invoices', { party_id: party.id, lines: [{ item_id: items[1].id, qty: 2 }], payments: [{ mode: 'cash', amount: 1000 }] });
  assert.equal(inv.status, 'partial');
  assert.ok(inv.igst > 0 && inv.cgst === 0, 'Telangana customer -> IGST');
  let p = (await admin('/api/parties')).find((x) => x.id === party.id);
  assert.equal(p.balance, inv.total - 1000);
  await cashier('/api/payments', { party_id: party.id, invoice_id: inv.id, direction: 'in', amount: inv.total - 1000 });
  p = (await admin('/api/parties')).find((x) => x.id === party.id);
  assert.equal(p.balance, 0);
  assert.equal((await admin(`/api/invoices/${inv.id}`)).status, 'paid');
  const led = await admin(`/api/parties/${party.id}/ledger`);
  assert.equal(led.rows.at(-1).balance, 0);
});

test('purchase adds batch stock and updates cost; cancel reverses', async () => {
  const sup = await admin('/api/t/parties', { name: 'Nutrition Distributor', type: 'supplier', state_code: '37' });
  const it = items[2], before = await stockOf(it.id);
  const pur = await admin('/api/invoices', { type: 'purchase', no: 'SUP-778', party_id: sup.id, lines: [{ item_id: it.id, qty: 10, rate: 1000, batch_no: 'P1', expiry: '2028-01-01' }] });
  assert.equal(pur.no, 'SUP-778');
  assert.equal(pur.total, 11800); // exclusive GST 18%
  assert.equal(await stockOf(it.id), before + 10);
  assert.equal((await admin('/api/items')).find((i) => i.id === it.id).purchase_price, 1000);
  await assert.rejects(cashier(`/api/invoices/${pur.id}/cancel`, {}), (e) => e.status === 403);
  await admin(`/api/invoices/${pur.id}/cancel`, {});
  assert.equal(await stockOf(it.id), before);
});

test('sale return puts stock back; estimate does not touch stock', async () => {
  const it = items[3], before = await stockOf(it.id);
  await cashier('/api/invoices', { type: 'estimate', lines: [{ item_id: it.id, qty: 1 }] });
  assert.equal(await stockOf(it.id), before);
  await cashier('/api/invoices', { type: 'sale_return', lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'cash', amount: 1e6 }] });
  assert.equal(await stockOf(it.id), before + 1);
});

test('duplicate barcode rejected; cashier cannot edit items', async () => {
  await admin('/api/t/items', { id: items[0].id, barcode: '8901234567890' });
  await assert.rejects(admin('/api/t/items', { name: 'Dup', barcode: '8901234567890' }), /Barcode already used/);
  await assert.rejects(cashier('/api/t/items', { name: 'X' }), (e) => e.status === 403);
});

test('reports run', async () => {
  const d = await admin('/api/reports/dashboard');
  assert.ok(d.today.t > 0 && d.today.n >= 2);
  const range = '?from=2000-01-01&to=2100-01-01';
  const g = await admin('/api/reports/gst' + range);
  assert.ok(g.hsn.length && g.b2c.length);
  const pl = await admin('/api/reports/pnl' + range);
  assert.ok(pl.revenue > 0 && pl.cogs > 0);
  assert.equal((await admin('/api/reports/stock')).length, items.length);
  await admin('/api/reports/daybook');
  await admin('/api/reports/expiry?days=3650');
  await admin('/api/t/expenses', { category: 'Rent', amount: 15000, mode: 'bank' });
  assert.equal((await admin('/api/reports/pnl' + range)).expenses, 15000);
  assert.equal((await admin('/api/invoices?type=sale')).length >= 3, true);
});

test('online order: auto-invoiced as soon as it arrives, COD collected on delivery, no double stock deduction', async () => {
  const branch = D.getMeta(db, 'branch_id'), it = items[4];
  D.adjustStock(db, branch, { item_id: it.id, qty: -2, note: 'simulate pulled order reservation' });
  const addr = JSON.stringify({ line1: '12 MG Road', city: 'Hyderabad', state: 'Telangana', pincode: '500001' });
  const o = D.save(db, 'orders', { order_no: 'FS2610190001', branch_id: branch, name: 'Priya', phone: '+91 98765 11111', address: JSON.parse(addr),
    status: 'placed', payment_method: 'cod', payment_status: 'pending', total: it.sale_price * 2 });
  D.save(db, 'order_lines', { order_id: o.id, item_id: it.id, name: it.name, qty: 2, price: it.sale_price, total: it.sale_price * 2 });
  const before = await stockOf(it.id);

  assert.equal(D.processOnlineOrders(db, branch), 1, 'what sync does after pulling');
  const invId = D.get(db, 'orders', o.id).invoice_id;
  let inv = await admin(`/api/invoices/${invId}`);
  assert.equal(inv.order_id, o.id);
  assert.equal(inv.status, 'unpaid', 'COD is a due until delivered');
  assert.ok(inv.igst > 0, 'Telangana address -> IGST');
  assert.equal(await stockOf(it.id), before, 'stock not deducted twice');
  const party = (await admin('/api/parties')).find((p) => p.id === inv.party_id);
  assert.equal(party.phone, '9876511111');
  assert.equal(D.processOnlineOrders(db, branch), 0, 'idempotent');
  assert.equal((await cashier(`/api/orders/${o.id}/invoice`, {})).id, invId);

  await cashier(`/api/orders/${o.id}`, { status: 'packed' });
  await cashier(`/api/orders/${o.id}`, { status: 'delivered' });
  inv = await admin(`/api/invoices/${invId}`);
  assert.equal(inv.status, 'paid');
  assert.equal(inv.payments[0].mode, 'cod');
  const row = (await cashier('/api/orders')).find((x) => x.id === o.id);
  assert.equal(row.payment_status, 'paid');
  assert.deepEqual(row.events.map((e) => e.status), ['packed', 'delivered']);

  const dash = await admin('/api/reports/dashboard');
  assert.ok(dash.month.online >= inv.total && dash.month.counter > 0, 'dashboard splits online and counter');
  assert.ok(dash.recent.some((r) => r.online));
  assert.ok((await admin('/api/invoices?type=sale&from=2000-01-01&to=2100-01-01')).some((r) => r.online && r.id === invId));
});

test('cancelling an online order cancels its invoice and returns stock', async () => {
  const branch = D.getMeta(db, 'branch_id'), it = items[3];
  const o = D.save(db, 'orders', { order_no: 'FS2610190002', branch_id: branch, name: 'Ravi', phone: '9000011111', status: 'placed', payment_method: 'online', payment_status: 'paid', total: it.sale_price });
  D.save(db, 'order_lines', { order_id: o.id, item_id: it.id, name: it.name, qty: 1, price: it.sale_price, total: it.sale_price });
  D.adjustStock(db, branch, { item_id: it.id, qty: -1, note: 'reservation' });
  D.processOnlineOrders(db, branch);
  const invId = D.get(db, 'orders', o.id).invoice_id;
  assert.equal((await admin(`/api/invoices/${invId}`)).status, 'paid', 'prepaid order invoiced as paid');
  const before = await stockOf(it.id);
  await cashier(`/api/orders/${o.id}`, { status: 'cancelled' });
  assert.equal((await admin(`/api/invoices/${invId}`)).status, 'cancelled');
  assert.equal(await stockOf(it.id), before + 1);
});

test('orders awaiting online payment are not invoiced', async () => {
  const branch = D.getMeta(db, 'branch_id');
  const o = D.save(db, 'orders', { order_no: 'FS2610190003', branch_id: branch, name: 'X', phone: '9000022222', status: 'pending_payment', payment_method: 'online', payment_status: 'pending', total: 10 });
  D.processOnlineOrders(db, branch);
  assert.equal(D.get(db, 'orders', o.id).invoice_id, null);
});

test('every write is queued for sync', async () => {
  assert.ok(db.prepare('select count(*) n from outbox').get().n > 50);
});

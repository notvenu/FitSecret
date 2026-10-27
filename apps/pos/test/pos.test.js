// POS API over HTTP against an in-memory SQLite DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { round2 } from '@fitsecret/shared';
import { PRESETS } from '@fitsecret/shared/permissions';
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
  // the tests' cashier has the Senior cashier set plus offers (approving near-expiry offers); a login with no set is the minimum
  const { id } = await admin('/api/users', { name: 'Counter 1', pin: '1111', role: 'cashier', perms: { ...PRESETS.senior[2], offers: true } });
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

test('sale order converts once into a sale; only the sale moves stock', async () => {
  const it = items[3], before = await stockOf(it.id);
  const cust = await cashier('/api/t/parties', { name: 'Order Customer', type: 'customer', state_code: '37' });
  const so = await cashier('/api/invoices', { type: 'sale_order', party_id: cust.id, lines: [{ item_id: it.id, qty: 2 }] });
  assert.equal(so.status, 'open');
  assert.ok(so.no.includes('-SO/'));
  assert.equal(await stockOf(it.id), before);
  const sale = await cashier('/api/invoices', { type: 'sale', from_id: so.id, party_id: cust.id, lines: [{ item_id: it.id, qty: 2 }], payments: [{ mode: 'upi', amount: 1e6 }] });
  assert.equal((await admin(`/api/invoices/${so.id}`)).status, 'converted');
  assert.equal(await stockOf(it.id), before - 2);
  await assert.rejects(cashier('/api/invoices', { type: 'sale', from_id: so.id, party_id: cust.id, lines: [{ item_id: it.id, qty: 1 }] }), /already converted/);
  const st = await admin(`/api/reports/x/party_statement?party_id=${cust.id}`);
  assert.equal(st.at(-1).balance, 0, 'order adds nothing; paid sale nets to zero');
  assert.ok(sale.notes.includes(so.no));
});

test('cash & bank: add, transfer, balances; cashier blocked', async () => {
  const bal = async (m) => (await admin('/api/reports/x/cash_bank')).find((r) => r.mode === m)?.balance || 0;
  const c0 = await bal('cash'), b0 = await bal('bank');
  await admin('/api/cash', { kind: 'add', mode: 'cash', amount: 5000 });
  await admin('/api/cash', { kind: 'transfer', mode: 'cash', to_mode: 'bank', amount: 3000 });
  assert.equal(await bal('cash'), c0 + 2000);
  assert.equal(await bal('bank'), b0 + 3000);
  await assert.rejects(cashier('/api/cash', { kind: 'add', amount: 1 }), (e) => e.status === 403);
  await assert.rejects(cashier('/api/reports/x/item_pnl'), /Not allowed|Admin only/);
});

test('barcode import: add_stock adds to existing items, opening_stock only to new ones', async () => {
  const it = items[4], before = await stockOf(it.id);
  const [, made] = await admin('/api/t/items/bulk', { rows: [{ id: it.id, name: it.name, add_stock: 5 }, { name: 'Scanned New', barcode: '8909990001112', gst_rate: 18, sale_price: 100, opening_stock: 4 }] });
  assert.equal(await stockOf(it.id), before + 5);
  assert.equal(await stockOf(made.id), 4);
});

test('bulk import is all-or-nothing, sets opening stock; recycle bin restores', async () => {
  await assert.rejects(admin('/api/t/items/bulk', { rows: [{ name: 'Good One', sale_price: 100 }, { name: '' }] }), /Row 2/);
  assert.equal((await admin('/api/items')).some((i) => i.name === 'Good One'), false);
  const [a] = await admin('/api/t/items/bulk', { rows: [{ name: 'Imported Bar', sale_price: 120, opening_stock: 24 }] });
  assert.equal(await stockOf(a.id), 24);
  await admin(`/api/t/items/${a.id}`, null, 'DELETE');
  assert.ok((await admin('/api/trash')).some((r) => r.id === a.id));
  await admin('/api/trash/restore', { table: 'items', id: a.id });
  assert.ok((await admin('/api/items')).some((i) => i.id === a.id));
  await assert.rejects(cashier('/api/t/parties/bulk', { rows: [] }), (e) => e.status === 403);
});

test('gold: journals must balance, balance sheet balances, loyalty points capped at what was earned', async () => {
  const acc = await admin('/api/t/accounts', { name: 'Shop furniture', type: 'fixed_asset', opening_balance: 0 });
  await assert.rejects(admin('/api/t/journals', { lines: [{ account: 'acc:' + acc.id, debit: 100 }, { account: 'mode:cash', credit: 90 }] }), /must be equal/);
  await assert.rejects(admin('/api/t/journals', { lines: [{ account: 'acc:nope', debit: 100 }, { account: 'mode:cash', credit: 100 }] }), /Unknown account/);
  const j = await admin('/api/t/journals', { note: 'Bought racks', lines: [{ account: 'acc:' + acc.id, debit: 2500 }, { account: 'mode:cash', credit: 2500 }] });
  assert.match(j.no, /^JE-/);
  await assert.rejects(cashier('/api/t/journals', { lines: [] }), (e) => e.status === 403);
  const bs = await admin('/api/reports/balance-sheet');
  const tot = (a) => Math.round(a.reduce((s, x) => s + x.amount, 0) * 100);
  assert.equal(tot(bs.assets), tot(bs.liabilities));
  assert.equal(bs.assets.find((x) => x.name === 'Shop furniture').amount, 2500);

  const branch = (await admin('/api/bootstrap')).branch;
  await admin('/api/t/branches', { id: branch.id, settings: { loyalty: { enabled: true, earn_per_100: 1, point_value: 1 } } });
  const cust = await cashier('/api/t/parties', { name: 'Loyal Lifter', type: 'customer', state_code: '37' });
  await admin('/api/invoices', { party_id: cust.id, lines: [{ item_id: items[1].id, qty: 1, rate: 1000 }], payments: [{ mode: 'cash', amount: 1000 }] }); // owner may lower a price
  const pts = (await cashier('/api/reports/x/loyalty')).find((x) => x.party_id === cust.id);
  assert.equal(pts.balance, 10);
  await assert.rejects(admin('/api/invoices', { party_id: cust.id, lines: [{ item_id: items[1].id, qty: 1, rate: 100 }], payments: [{ mode: 'points', amount: 11 }, { mode: 'cash', amount: 89 }] }), /Only ₹10/);
  await admin('/api/invoices', { party_id: cust.id, lines: [{ item_id: items[1].id, qty: 1, rate: 100 }], payments: [{ mode: 'points', amount: 10 }, { mode: 'cash', amount: 90 }] });
  assert.equal((await cashier('/api/reports/x/loyalty')).find((x) => x.party_id === cust.id).balance, 0); // 10 redeemed, 0.9 earned on the 90 paid
  assert.ok(!(await admin('/api/reports/x/cash_bank')).some((m) => m.mode === 'points'), 'points are not money');
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

test('stock transfer moves stock to another branch; verify finds no mismatches', async () => {
  const it = items[1], before = await stockOf(it.id);
  const other = await admin('/api/t/branches', { name: 'FitSecret Guntur', code: 'GNT', state_code: '37' });
  await admin('/api/stock/adjust', { item_id: it.id, qty: 2, to_branch: other.id });
  assert.equal(await stockOf(it.id), before - 2);
  assert.equal(db.prepare('select sum(qty) q from stock_movements where branch_id = ? and item_id = ?').get(other.id, it.id).q, 2);
  await assert.rejects(admin('/api/stock/adjust', { item_id: it.id, qty: 1, to_branch: D.getMeta(db, 'branch_id') }), /another branch/);
  const bad = (await admin('/api/reports/x/verify')).filter((x) => /≠|not moved/.test(x.check));
  assert.deepEqual(bad, [], 'invoices, payments and stock agree after every test above');
});

test('Vyapar extras: prefix, TCS, due date, ship-to, TDS, serial + mfg, ledger ignores orders, tax reports, Tally', async () => {
  const br = (await admin('/api/bootstrap')).branch;
  await admin('/api/t/branches', { id: br.id, settings: { ...br.settings, prefixes: { sale_return: 'RET' } } });
  const p = await admin('/api/t/parties', { type: 'customer', name: 'Gym Partner', gstin: '37ABCDE1234F1Z5', state_code: '37', payment_terms: 30,
    shipping_address: 'Gym, MG Road', group_name: 'Gyms', extra: { Trainer: 'Ravi' } });
  const sup = await admin('/api/t/parties', { type: 'supplier', name: 'Distributor X', state_code: '37' });
  const it = items[2];
  await admin('/api/invoices', { type: 'purchase', party_id: sup.id, lines: [{ item_id: it.id, qty: 5, rate: 100, batch_no: 'M1', expiry: '2027-06-30', mfg: '2026-06-01' }] });
  assert.equal((await admin(`/api/items/${it.id}/batches`)).find((b) => b.batch_no === 'M1').mfg, '2026-06-01');

  await admin('/api/t/items', { id: it.id, mrp: 1200 }); // nothing sells above MRP
  const inv = await admin('/api/invoices', { party_id: p.id, date: '2026-10-01', tcs_rate: 1, lines: [{ item_id: it.id, qty: 1, rate: 1000, serial: 'SN-1' }] });
  assert.deepEqual([inv.tcs, inv.total, inv.due_date, inv.ship_to, inv.lines[0].serial], [10, 1010, '2026-10-31', 'Gym, MG Road', 'SN-1']);
  assert.deepEqual(inv.party_extra, { Trainer: 'Ravi' });
  await admin('/api/payments', { party_id: p.id, invoice_id: inv.id, direction: 'in', amount: 990, tds: 20, mode: 'bank' });
  assert.equal((await admin('/api/invoices/' + inv.id)).status, 'paid', 'TDS settles the bill');
  assert.equal((await admin('/api/parties')).find((x) => x.id === p.id).balance, 0);

  const ret = await admin('/api/invoices', { type: 'sale_return', party_id: p.id, lines: [{ item_id: it.id, qty: 1, rate: 1000 }], payments: [{ mode: 'cash', amount: 1000 }] });
  assert.match(ret.no, /^RET\/\d\d-\d\d\/0001$/);
  await admin('/api/invoices', { type: 'sale_order', party_id: p.id, lines: [{ item_id: it.id, qty: 1, rate: 500 }] });
  const led = await admin(`/api/parties/${p.id}/ledger`);
  assert.ok(!led.rows.some((r) => r.type === 'sale_order'), 'orders are not money');
  assert.equal(led.rows.at(-1).balance, 0);

  const all = 'from=2000-01-01&to=2100-01-01';
  assert.equal((await admin(`/api/reports/x/tds_receivable?${all}`))[0].tds, 20);
  assert.equal((await admin(`/api/reports/x/form_27eq?${all}`))[0].tcs, 10);
  assert.ok((await admin(`/api/reports/x/gstr9?${all}`)).find((r) => r.table === '4N').taxable > 0);
  assert.ok((await admin(`/api/reports/x/by_party_group?${all}`)).find((r) => r.party_group === 'Gyms'));
  const { toTallyXml } = await import('@fitsecret/shared/tally');
  assert.match(toTallyXml((await admin(`/api/reports/x/tally_export?${all}`))[0]), /VOUCHERNUMBER>RET\//);
  assert.deepEqual((await admin('/api/reports/x/verify')).filter((x) => /≠|not moved/.test(x.check)), []);
  await assert.rejects(admin('/api/invoices', { currency: 'USD', lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'cash', amount: 1e5 }] }), /USD exchange rate/);
});

test('online orders: cancelling a prepaid order asks for a refund; staff notes and inbox rows are kept', async () => {
  const branch = D.getMeta(db, 'branch_id'), it = items[3];
  const o = D.save(db, 'orders', { order_no: 'FS2610220009', branch_id: branch, name: 'Prepaid', phone: '9000033333', status: 'placed', payment_method: 'online', payment_status: 'paid', total: it.sale_price });
  D.save(db, 'order_lines', { order_id: o.id, item_id: it.id, name: it.name, qty: 1, price: it.sale_price, total: it.sale_price });
  await cashier(`/api/orders/${o.id}`, { status: 'cancelled', internal_note: 'Out of stock at packing' });
  let row = D.getWire(db, 'orders', o.id);
  assert.deepEqual([row.payment_status, row.internal_note], ['refund_pending', 'Out of stock at packing']);
  await cashier(`/api/orders/${o.id}`, { refund: 'done' });
  assert.equal(D.getWire(db, 'orders', o.id).payment_status, 'refunded');
  const f = D.save(db, 'feedback', { kind: 'message', name: 'Asha', phone: '9000000077', body: 'Vegan protein?', status: 'new' });
  await cashier('/api/t/feedback', { id: f.id, status: 'done' });
  assert.equal((await cashier('/api/t/feedback')).find((x) => x.id === f.id).status, 'done');
});

test('staff and bank accounts on the POS server: attendance per day, payroll, admin only, bank:<id> mode', async () => {
  const emp = await admin('/api/t/employees', { name: 'Sita', pay_type: 'daily', salary: 800 });
  await assert.rejects(cashier('/api/t/employees', { name: 'X' }), (e) => e.status === 403);
  await admin('/api/t/attendance', { employee_id: emp.id, date: '2026-09-10', status: 'present' });
  await admin('/api/t/attendance', { employee_id: emp.id, date: '2026-09-10', status: 'half' });
  await admin('/api/t/attendance', { employee_id: emp.id, date: '2026-09-11', status: 'off' });
  await admin('/api/t/expenses', { category: 'Staff advance', employee_id: emp.id, amount: 300, mode: 'cash', date: '2026-09-12' });
  const r = (await admin('/api/reports/x/staff_month?month=2026-09')).find((x) => x.name === 'Sita');
  assert.deepEqual([r.half, r.off, r.payable_days, r.earned, r.advance, r.balance], [1, 1, 1.5, 1200, 300, 900]);
  await assert.rejects(cashier('/api/reports/x/staff_month?month=2026-09'), /Not allowed|Admin only/);

  const b = (await admin('/api/bootstrap')).branch;
  await admin('/api/t/branches', { id: b.id, settings: { ...b.settings, banks: [{ id: 'sbi', name: 'SBI Savings', opening: 0 }] } });
  const sale = await admin('/api/invoices', { lines: [{ item_id: items[3].id, qty: 1 }], payments: [{ mode: 'bank:sbi', amount: 99999 }] });
  assert.equal(sale.status, 'paid');
  assert.equal((await admin('/api/reports/x/cash_bank')).find((x) => x.mode === 'bank:sbi').balance, sale.total);
  await assert.rejects(admin('/api/t/journals', { lines: [{ account: 'mode:bank:nope', debit: 1 }, { account: 'mode:cash', credit: 1 }] }), /Unknown account/);
});

test('return against a bill: same party, capped at sold qty, credit spent on an exchange sale', async () => {
  const it = items[4], cust = await cashier('/api/t/parties', { name: 'Exchange Buyer', type: 'customer', phone: '9000011111', state_code: '37' });
  const sale = await cashier('/api/invoices', { party_id: cust.id, lines: [{ item_id: it.id, qty: 2 }], payments: [{ mode: 'cash', amount: 1e6 }] });
  await assert.rejects(cashier('/api/invoices', { type: 'sale_return', ref_id: sale.id, lines: [{ item_id: it.id, qty: 3 }] }), /only 2 left to return/);
  await assert.rejects(cashier('/api/invoices', { type: 'sale_return', ref_id: sale.id, lines: [{ item_id: items[0].id, qty: 1 }] }), /not on/);
  const before = await stockOf(it.id);
  const cn = await cashier('/api/invoices', { type: 'sale_return', ref_id: sale.id, party_id: null, lines: [{ item_id: it.id, qty: 1, rate: sale.lines[0].rate }],
    payments: [{ mode: 'exchange', amount: 1e6 }] });
  assert.equal(cn.ref_no, sale.no);
  assert.equal(cn.party_id, cust.id, 'return goes to the original party');
  assert.equal(await stockOf(it.id), before + 1);
  await assert.rejects(cashier('/api/invoices', { type: 'sale_return', ref_id: sale.id, lines: [{ item_id: it.id, qty: 2 }] }), /only 1 left/);
  await assert.rejects(admin(`/api/invoices/${sale.id}/cancel`, {}), /Cancel the return first/);
  // exchange: credit note pays part of a new sale, never more than its credit
  await assert.rejects(cashier('/api/invoices', { lines: [{ item_id: items[1].id, qty: 5 }], payments: [{ mode: 'exchange', amount: cn.total + 1 }], exchange_from: cn.id }), /exchange credit left/);
  await assert.rejects(cashier('/api/invoices', { lines: [{ item_id: items[1].id, qty: 5 }], payments: [{ mode: 'exchange', amount: 10 }] }), /needs the sale return/);
  const ex = await cashier('/api/invoices', { lines: [{ item_id: items[1].id, qty: 5 }], exchange_from: cn.id, payments: [{ mode: 'exchange', amount: cn.total }, { mode: 'cash', amount: 1e6 }] });
  assert.equal(ex.status, 'paid');
  await assert.rejects(admin(`/api/invoices/${cn.id}/cancel`, {}), /already spent/);
  const cash = await admin('/api/reports/x/cash_bank');
  assert.ok(!cash.some((r) => r.mode === 'exchange'), 'exchange credit is not money');
});

test('edit a bill: same number, stock rebuilt, extra money recorded, audit trail kept', async () => {
  const it = items[1], cust = await cashier('/api/t/parties', { name: 'Edit Buyer', type: 'customer', phone: '9000022222', state_code: '37' });
  const s0 = await stockOf(it.id);
  const inv = await cashier('/api/invoices', { party_id: cust.id, lines: [{ item_id: it.id, qty: 3 }], payments: [{ mode: 'cash', amount: 1e6 }] });
  await assert.rejects(cashier('/api/invoices', { edit_id: inv.id, lines: [{ item_id: it.id, qty: 1 }] }), /not allowed to edit saved bills/);
  // smaller bill: stock comes back, the cash paid is trimmed to the new total
  const e1 = await admin('/api/invoices', { edit_id: inv.id, party_id: cust.id, lines: [{ item_id: it.id, qty: 1 }], reason: 'typed 3 instead of 1' });
  assert.equal(e1.id, inv.id);
  assert.equal(e1.no, inv.no);
  assert.equal(await stockOf(it.id), s0 - 1);
  assert.equal(e1.paid, e1.total);
  assert.equal(round2(e1.payments.reduce((s, p) => s + p.amount, 0)), e1.total);
  // bigger bill: unpaid difference stays on the customer's account unless collected now
  const e2 = await admin('/api/invoices', { edit_id: inv.id, party_id: cust.id, lines: [{ item_id: it.id, qty: 2 }] });
  assert.equal(e2.status, 'partial');
  assert.equal((await admin('/api/parties')).find((p) => p.id === cust.id).balance, round2(e2.total - e2.paid));
  const audit = await admin('/api/reports/x/audit?from=2000-01-01&to=2100-01-01');
  const mine = audit.filter((a) => a.bill === inv.no);
  assert.equal(mine.length, 2);
  assert.ok(mine.some((a) => a.reason === 'typed 3 instead of 1'));
  await admin(`/api/invoices/${inv.id}/cancel`, { reason: 'customer left' });
  assert.ok((await admin('/api/reports/x/audit?from=2000-01-01&to=2100-01-01')).some((a) => a.bill === inv.no && a.action === 'cancel' && a.reason === 'customer left'));
  await assert.rejects(admin('/api/invoices', { edit_id: inv.id, lines: [{ item_id: it.id, qty: 1 }] }), /cancelled bill cannot be edited/);
});

test('bill discount lowers GST; cashier discount limit', async () => {
  const it = items[0];
  const plain = await cashier('/api/invoices', { type: 'estimate', lines: [{ item_id: it.id, qty: 2, rate: 1180, gst_rate: 18 }] });
  const off = await cashier('/api/invoices', { type: 'estimate', bill_discount: 236, lines: [{ item_id: it.id, qty: 2, rate: 1180, gst_rate: 18 }] });
  assert.equal(off.total, plain.total - 236);
  assert.equal(off.taxable, 1800); // (2360 - 236) / 1.18
  assert.equal(off.bill_discount, 236);
  const br = (await admin('/api/bootstrap')).branch;
  await admin('/api/t/branches', { id: br.id, settings: { ...br.settings, perms: { max_discount: 5 } } });
  await assert.rejects(cashier('/api/invoices', { type: 'estimate', bill_discount: 236, lines: [{ item_id: it.id, qty: 2, rate: 1180 }] }), /above 5% needs the owner/);
  await admin('/api/invoices', { type: 'estimate', bill_discount: 236, lines: [{ item_id: it.id, qty: 2, rate: 1180 }] }); // owner is never limited
  await admin('/api/t/branches', { id: br.id, settings: br.settings });
});

test('day close: shortage posted so books match the drawer; bank reconciliation', async () => {
  const day = await admin('/api/reports/x/day_close');
  const cash = day.modes.find((m) => m.mode === 'cash');
  assert.ok(day.sales.n > 0);
  await assert.rejects(cashier('/api/dayclose', { counted: { upi: 10 } }), /Count the cash/);
  const z = await cashier('/api/dayclose', { counted: { cash: cash.closing - 50 }, note: 'short by 50' });
  assert.equal(z.diff, -50);
  const after = await admin('/api/reports/x/day_close');
  assert.equal(after.modes.find((m) => m.mode === 'cash').closing, round2(cash.closing - 50));
  assert.equal(after.closed.id, z.id);
  const p = (await admin('/api/t/payments')).find((x) => x.mode === 'upi');
  await assert.rejects(cashier('/api/payments/reconcile', { ids: [p.id] }), (e) => e.status === 403);
  const [r] = await admin('/api/payments/reconcile', { ids: [p.id], date: '2026-10-01' });
  assert.equal(r.reconciled, '2026-10-01');
});

test('follow-ups: refill due from the item refill days; lapsed customers', async () => {
  const it = items[2];
  await admin('/api/t/items', { id: it.id, refill_days: 30 });
  const cust = await cashier('/api/t/parties', { name: 'Refill Rao', type: 'customer', phone: '9000033333', state_code: '37' });
  const d = new Date(Date.now() - 27 * 864e5).toLocaleDateString('en-CA');
  await cashier('/api/invoices', { party_id: cust.id, date: d, lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'cash', amount: 1e6 }] });
  const r = (await admin('/api/reports/x/refills')).find((x) => x.party_id === cust.id);
  assert.equal(r.days_left, 3);
  const old = await cashier('/api/t/parties', { name: 'Gone Gupta', type: 'customer', phone: '9000044444', state_code: '37' });
  await cashier('/api/invoices', { party_id: old.id, date: new Date(Date.now() - 90 * 864e5).toLocaleDateString('en-CA'), lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'cash', amount: 1e6 }] });
  const lapsed = await admin('/api/reports/x/lapsed');
  assert.ok(lapsed.some((x) => x.party_id === old.id) && !lapsed.some((x) => x.party_id === cust.id));
});

test('GSTR-1 JSON: B2B, B2CS net of credit notes, HSN, documents issued', async () => {
  const br = (await admin('/api/bootstrap')).branch;
  await admin('/api/t/branches', { id: br.id, gstin: '37ABCDE1234F1Z5' });
  const b2b = await cashier('/api/t/parties', { name: 'Gym Co', type: 'customer', gstin: '37AAACG1234A1Z2', state_code: '37' });
  const m = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const inv = await cashier('/api/invoices', { party_id: b2b.id, lines: [{ item_id: items[0].id, qty: 1 }], payments: [{ mode: 'cash', amount: 1e6 }] });
  const j = await admin(`/api/reports/x/gstr1_json?from=${m}-01&to=${m}-31`);
  assert.equal(j.gstin, '37ABCDE1234F1Z5');
  assert.equal(j.fp, m.slice(5) + m.slice(0, 4));
  const b = j.b2b.find((x) => x.ctin === '37AAACG1234A1Z2').inv.find((x) => x.inum === inv.no);
  assert.equal(b.itms[0].itm_det.txval, inv.taxable);
  assert.equal(round2(b.itms[0].itm_det.camt + b.itms[0].itm_det.samt), round2(inv.cgst + inv.sgst));
  assert.ok(j.b2cs.length && j.hsn.hsn_b2c.length && j.hsn.hsn_b2b.length);
  assert.ok(j.doc_issue.doc_det.find((x) => x.doc_num === 1).docs[0].cancel >= 1, 'cancelled bills counted');
  await admin('/api/t/branches', { id: br.id, gstin: br.gstin || '' });
});

test('payments can be corrected or deleted; the bill they paid follows', async () => {
  const cust = await cashier('/api/t/parties', { name: 'Pay Fix', type: 'customer', phone: '9000055555', state_code: '37' });
  const inv = await cashier('/api/invoices', { party_id: cust.id, lines: [{ item_id: items[3].id, qty: 1 }], payments: [{ mode: 'cash', amount: 100 }] });
  const pay = inv.payments[0];
  await assert.rejects(cashier(`/api/payments/${pay.id}`, { amount: 50 }), (e) => e.status === 403);
  await admin(`/api/payments/${pay.id}`, { amount: inv.total, mode: 'upi', reason: 'typed wrong' });
  let now = await admin(`/api/invoices/${inv.id}`);
  assert.equal(now.status, 'paid');
  assert.equal(now.payments[0].mode, 'upi');
  await admin(`/api/payments/${pay.id}`, { deleted: true });
  now = await admin(`/api/invoices/${inv.id}`);
  assert.equal(now.paid, 0);
  assert.equal(now.status, 'unpaid');
  assert.equal((await admin('/api/parties')).find((p) => p.id === cust.id).balance, inv.total);
  const audit = await admin('/api/reports/x/audit?from=2000-01-01&to=2100-01-01');
  assert.ok(audit.some((a) => a.action === 'edit payment' && a.reason === 'typed wrong') && audit.some((a) => a.action === 'delete payment'));
});

test('undo a wrong stock correction, never a bill movement', async () => {
  const it = items[4], s0 = await stockOf(it.id);
  await admin('/api/stock/adjust', { item_id: it.id, qty: 50, note: 'typo' });
  assert.equal(await stockOf(it.id), s0 + 50);
  const moves = await admin(`/api/items/${it.id}/movements`);
  const adj = moves.find((m) => m.ref_type === 'adjust' && m.qty === 50);
  await assert.rejects(cashier(`/api/stock/movements/${adj.id}/undo`, {}), (e) => e.status === 403);
  await admin(`/api/stock/movements/${adj.id}/undo`, {});
  assert.equal(await stockOf(it.id), s0);
  const sold = moves.find((m) => m.ref_type === 'sale');
  if (sold) await assert.rejects(admin(`/api/stock/movements/${sold.id}/undo`, {}), /Edit or cancel the bill/);
});

test('deletes: blocked while money or records depend on the row, otherwise to the recycle bin', async () => {
  const owes = (await admin('/api/parties')).find((p) => p.balance > 0);
  await assert.rejects(admin(`/api/t/parties/${owes.id}`, null, 'DELETE'), /owes you/);
  const clean = await admin('/api/t/parties', { name: 'Delete Me', type: 'customer', state_code: '37' });
  await admin(`/api/t/parties/${clean.id}`, null, 'DELETE');
  assert.ok(!(await admin('/api/parties')).some((p) => p.id === clean.id));
  assert.ok((await admin('/api/trash')).some((r) => r.id === clean.id));
  const acc = await admin('/api/t/accounts', { name: 'Owner capital', type: 'capital', opening_balance: 0 });
  await admin('/api/t/journals', { date: '2026-10-01', note: 'capital', lines: [{ account: 'mode:cash', debit: 1000 }, { account: 'acc:' + acc.id, credit: 1000 }] });
  await assert.rejects(admin(`/api/t/accounts/${acc.id}`, null, 'DELETE'), /Journal entries use/);
  const cat = items.find((i) => i.category_id).category_id;
  await assert.rejects(admin(`/api/t/categories/${cat}`, null, 'DELETE'), /in this category/);
  const emp = await admin('/api/t/employees', { name: 'Temp Helper', pay_type: 'daily', salary: 500 });
  await admin(`/api/t/employees/${emp.id}`, null, 'DELETE');
  assert.ok(!(await admin('/api/t/employees')).some((e) => e.id === emp.id));
  const item = await admin('/api/t/items', { name: 'Wrong Item', sale_price: 10, gst_rate: 18 });
  await admin(`/api/t/items/${item.id}`, null, 'DELETE');
  await admin('/api/trash/restore', { table: 'items', id: item.id });
  assert.ok((await admin('/api/items')).some((i) => i.id === item.id), 'restored from the recycle bin');
});

test('insights report', async () => {
  const ins = await admin('/api/reports/x/insights');
  assert.deepEqual(Object.keys(ins), ['sales', 'stock', 'profit', 'customers', 'money', 'staff', 'online']);
  assert.ok(ins.sales.kpis.length && ins.stock.insights.every((x) => x.title && x.level));
});

test('expired batches are never sold; near-expiry offers stay above cost and need no discount permission once approved', async () => {
  const it = await admin('/api/t/items', { name: 'Offer Whey 1kg', sale_price: 2360, mrp: 2500, purchase_price: 1500, gst_rate: 18 });
  const old = new Date(Date.now() - 5 * 864e5).toLocaleDateString('en-CA'), soon = new Date(Date.now() + 20 * 864e5).toLocaleDateString('en-CA');
  await admin('/api/stock/adjust', { item_id: it.id, qty: 2, batch_no: 'OLD', expiry: old });
  await admin('/api/stock/adjust', { item_id: it.id, qty: 3, batch_no: 'SOON', expiry: soon });
  const row = (await admin('/api/items')).find((x) => x.id === it.id);
  assert.equal(row.expired_qty, 2);
  assert.equal(row.next_expiry, soon, 'next sellable batch skips the expired one');
  // below cost (1500 + 18% = 1770 → at most 25% off 2360) is refused
  await assert.rejects(cashier('/api/t/offers', { kind: 'expiry', item_id: it.id, batch_no: 'SOON', expiry: soon, discount_pct: 30 }), /below cost/);
  await assert.rejects(cashier('/api/t/offers', { kind: 'expiry', item_id: it.id, batch_no: 'OLD', expiry: old, discount_pct: 10 }), /expired/);
  const offer = await cashier('/api/t/offers', { kind: 'expiry', item_id: it.id, batch_no: 'SOON', expiry: soon, discount_pct: 20, approved_by: 'Counter 1' });
  const br = (await admin('/api/bootstrap')).branch;
  await admin('/api/t/branches', { id: br.id, settings: { ...br.settings, perms: { max_discount: 5 } } });
  await assert.rejects(cashier('/api/invoices', { lines: [{ item_id: it.id, qty: 1, discount_pct: 20 }], payments: [{ mode: 'cash', amount: 1e6 }] }), /above 5%/);
  const sale = await cashier('/api/invoices', { lines: [{ item_id: it.id, qty: 1, discount_pct: 20, offer_id: offer.id, note: 'Near-expiry offer 20% off' }], payments: [{ mode: 'cash', amount: 1e6 }] });
  assert.equal(sale.lines[0].note, 'Near-expiry offer 20% off');
  assert.equal(sale.lines[0].sold_batches, 'SOON', 'the expired batch was skipped');
  await admin('/api/t/offers', { id: offer.id, active: false });
  await assert.rejects(cashier('/api/invoices', { lines: [{ item_id: it.id, qty: 1, discount_pct: 20, offer_id: offer.id }], payments: [{ mode: 'cash', amount: 1e6 }] }), /offer on .* has ended/);
  await admin('/api/t/branches', { id: br.id, settings: br.settings });
});

test('combos: never below cost, only the real saving can be claimed on a bill; certificates need a link or file', async () => {
  const a = await admin('/api/t/items', { name: 'Combo Whey', sale_price: 2000, purchase_price: 1200, gst_rate: 18 });
  const b = await admin('/api/t/items', { name: 'Combo Shaker', sale_price: 400, purchase_price: 150, gst_rate: 18 });
  await assert.rejects(admin('/api/t/offers', { kind: 'combo', name: 'Starter', items: [{ item_id: a.id, qty: 1 }], price: 1500 }), /two different items/);
  await assert.rejects(admin('/api/t/offers', { kind: 'combo', name: 'Starter', items: [{ item_id: a.id, qty: 1 }, { item_id: b.id, qty: 1 }], price: 1500 }), /below what these items cost/);
  await admin('/api/t/offers', { kind: 'combo', name: 'Starter', items: [{ item_id: a.id, qty: 1 }, { item_id: b.id, qty: 1 }], price: 2100 });
  const lines = [{ item_id: a.id, qty: 1 }, { item_id: b.id, qty: 1 }];
  await assert.rejects(cashier('/api/invoices', { lines, combo_discount: 500, payments: [{ mode: 'cash', amount: 1e6 }] }), /combo discount/);
  const ok = await cashier('/api/invoices', { lines, combo_discount: 300, bill_discount: 300, payments: [{ mode: 'cash', amount: 1e6 }] });
  assert.equal(ok.total, 2100);
  await assert.rejects(admin('/api/t/certificates', { item_id: a.id, title: 'Lab report', url: 'not a link' }), /link/);
  await assert.rejects(cashier('/api/t/certificates', { item_id: a.id, title: 'Lab report', url: 'https://x.test/r.pdf' }), /Add & edit items/);
  const cert = await admin('/api/t/certificates', { item_id: a.id, batch_no: 'B1', kind: 'lab', title: 'Lab report', url: 'https://example.com/lab.pdf' });
  assert.equal(cert.batch_no, 'B1');
  await assert.rejects(cashier(`/api/t/certificates/${cert.id}`, null, 'DELETE'), (e) => e.status === 403);
});

test('prices at the counter: never above MRP; a cashier lowering one needs the owner PIN (checked, rate-limited, logged)', async () => {
  const it = await admin('/api/t/items', { name: 'Price Whey', sale_price: 2000, mrp: 2500, purchase_price: 1200, gst_rate: 18 });
  await admin('/api/stock/adjust', { item_id: it.id, qty: 20 });
  await assert.rejects(admin('/api/invoices', { lines: [{ item_id: it.id, qty: 1, rate: 2600 }], payments: [{ mode: 'cash', amount: 1e6 }] }), /above the MRP/);
  await cashier('/api/invoices', { lines: [{ item_id: it.id, qty: 1, rate: 2400 }], payments: [{ mode: 'cash', amount: 1e6 }] }); // raising up to MRP is fine
  const low = { lines: [{ item_id: it.id, qty: 1, rate: 1800 }], payments: [{ mode: 'cash', amount: 1e6 }], party_name: ' Walk-in Arjun ', party_phone: '+91 98765 11111' };
  await assert.rejects(cashier('/api/invoices', low), /^Error: APPROVAL: Lower price needs the owner’s PIN: Price Whey at ₹1800 \(usual ₹2000\)/);
  const { users } = await api()('/api/bootstrap');
  const owner = users.find((u) => u.role === 'admin');
  await assert.rejects(cashier('/api/invoices', { ...low, approval: { user_id: owner.id, pin: '9999' } }), /Wrong owner PIN/);
  const ok = await cashier('/api/invoices', { ...low, approval: { user_id: owner.id, pin: '1234' } });
  assert.equal(ok.lines[0].rate, 1800);
  assert.deepEqual([ok.party_name, ok.party_phone, ok.party_id], ['Walk-in Arjun', '9876511111', null], 'walk-in details kept on the bill only');
  const log = (await admin('/api/reports/x/audit?from=2000-01-01&to=2100-01-01')).find((a) => a.bill === ok.no && a.action === 'price lowered');
  assert.equal(log.reason, `approved by ${owner.name}`);
  const br = (await admin('/api/bootstrap')).branch;
  await admin('/api/t/branches', { id: br.id, settings: { ...br.settings, perms: { price_edit: 'never' } } });
  await assert.rejects(cashier('/api/invoices', low), /Only the owner can lower prices/);
  await admin('/api/t/branches', { id: br.id, settings: { ...br.settings, perms: { price_edit: 'free', max_discount: 5 } } });
  await cashier('/api/invoices', low); // free mode: saved, still logged
  await assert.rejects(cashier('/api/invoices', { lines: [{ item_id: it.id, qty: 1, discount_pct: 20 }], payments: [{ mode: 'cash', amount: 1e6 }] }), /^Error: APPROVAL: Discount above 5%/);
  await cashier('/api/invoices', { lines: [{ item_id: it.id, qty: 1, discount_pct: 20 }], payments: [{ mode: 'cash', amount: 1e6 }], approval: { user_id: owner.id, pin: '1234' } });
  // counter coupons: checked on the server, website-only ones refused, and they don't count against the 5% limit
  await admin('/api/t/coupons', { code: 'SHOP15', kind: 'percent', value: 15, active: true, channel: 'counter' });
  await admin('/api/t/coupons', { code: 'WEBONLY', kind: 'percent', value: 10, active: true, channel: 'online' });
  await assert.rejects(cashier('/api/invoices', { coupon: 'WEBONLY', bill_discount: 200, lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'cash', amount: 1e6 }] }), /website orders only/);
  const c = await cashier('/api/invoices', { coupon: 'SHOP15', bill_discount: 300, lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'cash', amount: 1e6 }] });
  assert.equal(c.total, 1700);
  await admin('/api/t/branches', { id: br.id, settings: br.settings });
});

test('branches & warehouses: transfer with FEFO batches, never more than the source has; restock and cross-branch reports', async () => {
  const br = (await admin('/api/bootstrap')).branch;
  const wh = await admin('/api/t/branches', { name: 'Gollapudi Warehouse', code: 'WH1', kind: 'warehouse', state_code: '37' });
  const it = await admin('/api/t/items', { name: 'Loc Whey', sale_price: 2000, purchase_price: 1200, gst_rate: 18, low_stock: 5 });
  await admin('/api/stock/adjust', { item_id: it.id, qty: 6, batch_no: 'LATE', expiry: '2099-12-31' });
  await admin('/api/stock/adjust', { item_id: it.id, qty: 4, batch_no: 'SOON', expiry: '2098-01-31' });
  await assert.rejects(admin('/api/stock/transfer', { from: br.id, to: wh.id, lines: [{ item_id: it.id, qty: 11 }] }), /only 10 at/);
  await assert.rejects(admin('/api/stock/transfer', { from: br.id, to: br.id, lines: [{ item_id: it.id, qty: 1 }] }), /same place/);
  await assert.rejects(cashier('/api/stock/transfer', { from: br.id, to: wh.id, lines: [{ item_id: it.id, qty: 1 }] }), /Not allowed for Counter 1: Transfer stock/);
  const t = await admin('/api/stock/transfer', { from: br.id, to: wh.id, lines: [{ item_id: it.id, qty: 7 }], note: 'Overflow' });
  assert.match(t.no, /^TR-\d{4}$/);
  const m = (await admin('/api/reports/x/stock_matrix')).rows.find((r) => r.item_id === it.id);
  assert.deepEqual([m.qty[br.id], m.qty[wh.id], m.total], [3, 7, 10]);
  const moved = (await admin('/api/reports/x/transfers')).find((x) => x.no === t.no);
  assert.deepEqual([moved.from, moved.to, moved.units], [br.name, 'Gollapudi Warehouse', 7]);
  // the store is now at 3 (alert 5): bring it back to 10 from the warehouse
  const r = (await admin('/api/reports/x/restock')).find((x) => x.item_id === it.id);
  assert.deepEqual([r.stock, r.need, r.from, r.qty], [3, 7, wh.id, 7]);
  const loc = await admin('/api/reports/x/locations');
  assert.equal(loc.find((x) => x.id === wh.id).kind, 'warehouse');
  assert.ok((await admin('/api/reports/x/branch_sales?from=2000-01-01&to=2100-01-01')).some((x) => x.branch === 'Gollapudi Warehouse'));
  // the owner can list every location's bills from this counter
  assert.ok(Array.isArray(await admin('/api/invoices?type=sale&branch=all')));
});

test('companies: branches belong to one, items can be limited to some, bills by company, a company with branches cannot be deleted', async () => {
  const br = (await admin('/api/bootstrap')).branch;
  const a = await admin('/api/t/companies', { name: 'Fit Secrets', legal_name: 'Fit Secrets Nutrition Pvt Ltd', gstin: '37ABCDE1234F1Z5', state_code: '37' });
  const b = await admin('/api/t/companies', { name: 'Green Basket', state_code: '36' });
  await assert.rejects(cashier('/api/t/companies', { name: 'Nope' }), /Admin only/);
  await admin('/api/t/branches', { id: br.id, company_id: a.id });
  const hyd = await admin('/api/t/branches', { name: 'Green Basket Hyd', code: 'GBH', company_id: b.id, state_code: '36' });
  const mine = await admin('/api/t/items', { name: 'Co Whey', sale_price: 1000, company_ids: [a.id] });
  const theirs = await admin('/api/t/items', { name: 'Co Millets', sale_price: 200, company_ids: [b.id] });
  const shared = await admin('/api/t/items', { name: 'Co Almonds', sale_price: 500 });
  const names = (l) => l.filter((i) => i.name.startsWith('Co ')).map((i) => i.name).sort();
  assert.deepEqual(names(await cashier('/api/items')), ['Co Almonds', 'Co Whey']); // this counter is in Fit Secrets
  assert.deepEqual(names(await admin('/api/items?all=1')), ['Co Almonds', 'Co Millets', 'Co Whey']);
  const boot = await admin('/api/bootstrap');
  assert.deepEqual(boot.companies.map((c) => c.name).filter((n) => ['Fit Secrets', 'Green Basket'].includes(n)), ['Fit Secrets', 'Green Basket']);
  const inv = await admin('/api/invoices', { lines: [{ item_id: shared.id, qty: 1 }], payments: [{ mode: 'cash', amount: 500 }] });
  assert.ok((await admin(`/api/invoices?type=sale&branch=co:${a.id}`)).some((i) => i.id === inv.id));
  assert.ok(!(await admin(`/api/invoices?type=sale&branch=co:${b.id}`)).some((i) => i.id === inv.id));
  await assert.rejects(admin('/api/t/companies/' + b.id, null, 'DELETE'), /in this company/);
  await admin('/api/t/branches/' + hyd.id, null, 'DELETE');
  await admin('/api/t/companies/' + b.id, null, 'DELETE');
  await admin('/api/t/branches', { id: br.id, company_id: null }); // leave the shared test branch as it was
  void mine; void theirs;
});

test('logins: a cashier works only at the branches on their login, switches between those, and is locked out if the counter moves', async () => {
  const anon = api();
  const here = (await admin('/api/bootstrap')).branch;
  const other = await admin('/api/t/branches', { name: 'Login Test Branch', code: 'LTB', state_code: '37' });
  const away = await admin('/api/users', { name: 'Away Only', pin: '2222', role: 'cashier', branches: [other.id] });
  const both = await admin('/api/users', { name: 'Both Places', pin: '3333', role: 'cashier', branches: [here.id, other.id] });
  assert.ok(!(await anon('/api/bootstrap')).users.some((u) => u.id === away.id), 'not offered on a counter they cannot use');
  await assert.rejects(anon('/api/login', { user_id: away.id, pin: '2222' }), /does not work at/);
  assert.deepEqual((await admin('/api/users')).find((u) => u.id === both.id).branches.sort(), [here.id, other.id].sort());
  const b = api((await anon('/api/login', { user_id: both.id, pin: '3333' })).token);
  await assert.rejects(cashier('/api/branch/use', { id: other.id }), /cannot work at/); // an unrestricted cashier never moves the counter
  await b('/api/branch/use', { id: other.id }); // the counter is now the other branch
  const a = api((await anon('/api/login', { user_id: away.id, pin: '2222' })).token);
  await a('/api/items');
  await admin('/api/branch/use', { id: here.id }); // owner moves it back: Away Only is signed out
  await assert.rejects(a('/api/items'), /does not work at this branch/);
  await b('/api/items'); // still fine here
  await admin('/api/users', { id: away.id, name: 'Away Only', role: 'cashier', active: 0 });
  await admin('/api/users', { id: both.id, name: 'Both Places', role: 'cashier', active: 0 });
});

test('permissions: each cashier login has its own set, checked by the server; cost stays hidden and unchanged; changes apply at once', async () => {
  const anon = api();
  const it = await admin('/api/t/items', { name: 'Perm Whey', sale_price: 1000, purchase_price: 700, gst_rate: 18 });
  await admin('/api/stock/adjust', { item_id: it.id, qty: 5 });
  const { id } = await admin('/api/users', { name: 'Till Only', pin: '4444', role: 'cashier', perms: { dayclose: true } }); // the "Counter only" set
  const t = api((await anon('/api/login', { user_id: id, pin: '4444' })).token);
  await t('/api/invoices', { lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'cash', amount: 1000 }] }); // billing is always allowed
  await assert.rejects(t('/api/invoices', { type: 'purchase', lines: [{ item_id: it.id, qty: 1, rate: 700 }] }), /Purchases/);
  await assert.rejects(t('/api/invoices', { type: 'estimate', lines: [{ item_id: it.id, qty: 1 }] }), /Estimates/);
  await assert.rejects(t('/api/payments', { direction: 'in', amount: 10, mode: 'cash' }), /Payments in & out/);
  await assert.rejects(t('/api/t/items', { name: 'Sneaky' }), /Add & edit items/);
  await assert.rejects(t('/api/stock/adjust', { item_id: it.id, qty: 1 }), /Correct stock/);
  await assert.rejects(t('/api/reports/x/sale'), /Reports/);
  await assert.rejects(t('/api/orders'), /Online store/);
  assert.equal((await t('/api/items')).find((i) => i.id === it.id).purchase_price, null, 'cost hidden');
  await assert.rejects(t('/api/reports/dashboard'), /Reports/); // Home shows the counter tiles instead
  await assert.rejects(t('/api/t/payments'), /Payments/);
  assert.equal((await t('/api/t/employees')).find((e) => 'salary' in e), undefined, 'names only, no salaries');
  // the owner allows editing items (still no cost): the change applies without signing in again, and cost cannot be overwritten
  await admin('/api/users', { id, name: 'Till Only', role: 'cashier', perms: { dayclose: true, items: true, items_edit: true } });
  await t('/api/t/items', { id: it.id, sale_price: 1100, purchase_price: null });
  const saved = (await admin('/api/items')).find((i) => i.id === it.id);
  assert.deepEqual([saved.sale_price, saved.purchase_price], [1100, 700]);
  await assert.rejects(t('/api/t/items/' + it.id, null, 'DELETE'), /Delete records/);
  // a login with no set saved gets the minimum: billing, day close, items, adding a customer
  const { id: plain } = await admin('/api/users', { name: 'Plain', pin: '5555', role: 'cashier' });
  const pl = api((await anon('/api/login', { user_id: plain, pin: '5555' })).token);
  await pl('/api/items');
  await assert.rejects(pl('/api/reports/x/sale'), /Reports/);
  await assert.rejects(pl('/api/t/offers', { kind: 'combo', name: 'x' }), /Offers/);
  await admin('/api/users', { id: plain, name: 'Plain', role: 'cashier', active: 0 });
  await admin('/api/users', { id, name: 'Till Only', role: 'cashier', active: 0 });
  await assert.rejects(t('/api/items'), /Login required/); // turned off: signed out at once
});

test('PIN guessing: 5 wrong PINs lock that login for a while, even with the right PIN; others still sign in', async () => {
  const anon = api();
  const { id } = await admin('/api/users', { name: 'Guess Target', pin: '6789', role: 'cashier' });
  for (let i = 0; i < 4; i++) await assert.rejects(anon('/api/login', { user_id: id, pin: '0000' }), /Wrong PIN/);
  await assert.rejects(anon('/api/login', { user_id: id, pin: '0000' }), /Locked/);
  await assert.rejects(anon('/api/login', { user_id: id, pin: '6789' }), /Too many wrong PINs\. Try again in 5 minutes/);
  const owner = (await anon('/api/bootstrap')).users.find((u) => u.role === 'admin');
  assert.ok((await anon('/api/login', { user_id: owner.id, pin: '1234' })).token, 'another login is not blocked');
  await admin('/api/users', { id, name: 'Guess Target', role: 'cashier', active: 0 });
});

test('cheques: received → deposited → bounced puts the due back and undoes the deposit; issued → cleared; UPI lands in its bank', async () => {
  const b = (await admin('/api/bootstrap')).branch;
  await admin('/api/t/branches', { id: b.id, settings: { ...b.settings, banks: [{ id: 'chq1', name: 'HDFC Chq', takes_upi: true, takes_bank: true, opening: 0 }] } });
  const bal = async () => Object.fromEntries((await admin('/api/reports/x/cash_bank')).map((r) => [r.mode, r.balance]));
  const cust = await admin('/api/t/parties', { type: 'customer', name: 'Cheque Ravi', state_code: '37' });
  const sup = await admin('/api/t/parties', { type: 'supplier', name: 'Cheque Supplier', state_code: '37' });
  const due = async (id) => (await admin('/api/parties')).find((p) => p.id === id).balance;
  const it = await admin('/api/t/items', { name: 'Cheque Whey', sale_price: 3000, gst_rate: 18 });
  await admin('/api/stock/adjust', { item_id: it.id, qty: 5 });
  const inv = await admin('/api/invoices', { party_id: cust.id, lines: [{ item_id: it.id, qty: 1 }], payments: [] }); // on credit
  const before = await bal();
  const p = await admin('/api/payments', { party_id: cust.id, invoice_id: inv.id, direction: 'in', amount: 3000, mode: 'cheque', ref: '000123', ref_date: '2099-01-10' });
  await assert.rejects(admin(`/api/cheques/${p.id}`, { action: 'deposit', to_mode: 'bank:chq1' }), /dated 2099-01-10/); // post-dated: not before its date
  let reg = (await admin('/api/cheques')).find((c) => c.id === p.id);
  assert.deepEqual([reg.ref, reg.status, reg.post_dated, reg.bill], ['000123', 'pending', true, inv.no]);
  assert.equal(await due(cust.id), 0);
  await assert.rejects(admin(`/api/cheques/${p.id}`, { action: 'deposit', to_mode: 'cash', date: '2099-01-10' }), /bank account/);
  await admin(`/api/cheques/${p.id}`, { action: 'deposit', to_mode: 'bank:chq1', date: '2099-01-10' });
  let now = await bal();
  assert.equal(round2((now['bank:chq1'] || 0) - (before['bank:chq1'] || 0)), 3000, 'money is in the bank');
  assert.equal(round2((now.cheque || 0) - (before.cheque || 0)), 0, 'no longer a cheque in hand');
  await admin(`/api/cheques/${p.id}`, { action: 'bounce' });
  now = await bal();
  assert.equal(round2((now['bank:chq1'] || 0) - (before['bank:chq1'] || 0)), 0, 'deposit reversed');
  assert.equal(await due(cust.id), 3000, 'the customer owes again');
  assert.equal((await admin('/api/invoices/' + inv.id)).status, 'unpaid');
  reg = (await admin('/api/cheques')).find((c) => c.id === p.id);
  assert.equal(reg.status, 'bounced', 'kept in the register');
  await assert.rejects(admin(`/api/cheques/${p.id}`, { action: 'deposit', to_mode: 'bank:chq1' }), /not found|bounced/);
  // a cheque we give a supplier leaves the bank when cleared
  const q = await admin('/api/payments', { party_id: sup.id, direction: 'out', amount: 500, mode: 'cheque', ref: '777' });
  await admin(`/api/cheques/${q.id}`, { action: 'clear', to_mode: 'bank:chq1' });
  now = await bal();
  assert.equal(round2((now['bank:chq1'] || 0) - (before['bank:chq1'] || 0)), -500);
  assert.equal(round2((now.cheque || 0) - (before.cheque || 0)), 0);
  // UPI received now shows in the bank marked for UPI
  await admin('/api/invoices', { lines: [{ item_id: it.id, qty: 1 }], payments: [{ mode: 'upi', amount: 3000 }] });
  now = await bal();
  assert.equal(round2((now['bank:chq1'] || 0) - (before['bank:chq1'] || 0)), 2500);
  // and so does a customer's bank transfer paid as plain "Bank"
  await admin('/api/payments', { party_id: cust.id, direction: 'in', amount: 1000, mode: 'bank' });
  now = await bal();
  assert.equal(round2((now['bank:chq1'] || 0) - (before['bank:chq1'] || 0)), 3500);
  await admin('/api/t/branches', { id: b.id, settings: b.settings });
});

test('security: saves cannot delete, cashiers cannot set a party\'s money terms, the lock screen gets no settings', async () => {
  const anon = api();
  const pre = await anon('/api/bootstrap');
  assert.deepEqual([pre.branch.settings, pre.branches, pre.sync.email], [{}, [], undefined], 'nothing private before a PIN');
  assert.ok(pre.users.length && pre.branch.name);
  assert.ok((await admin('/api/bootstrap')).branches.length, 'signed in: everything');
  const p = await cashier('/api/t/parties', { type: 'customer', name: 'Sec Party', state_code: '37' });
  await cashier('/api/t/parties', { id: p.id, deleted: true });
  assert.ok((await admin('/api/parties')).some((x) => x.id === p.id), 'a save never deletes');
  await assert.rejects(cashier('/api/t/parties', { id: p.id, price_discount: 90 }), /Only the owner/);
  await assert.rejects(cashier('/api/t/parties', { id: p.id, opening_balance: -5000 }), /Only the owner/);
  await assert.rejects(cashier('/api/t/parties', { type: 'customer', name: 'Sec Two', rates: { x: 1 } }), /Only the owner/);
  await cashier('/api/t/parties', { id: p.id, name: 'Sec Party Renamed', price_discount: 0, opening_balance: 0 }); // unchanged terms are fine
  await admin('/api/t/parties', { id: p.id, price_discount: 5 });
});

test('a login limited to some branches cannot open bills of other branches', async () => {
  const anon = api();
  const here = (await admin('/api/bootstrap')).branch;
  const inv = await admin('/api/invoices', { lines: [{ item_id: items[0].id, qty: 1 }], payments: [{ mode: 'cash', amount: 1e6 }] });
  const away = await admin('/api/t/branches', { name: 'Bills Away', code: 'BAW', state_code: '37' });
  const { id } = await admin('/api/users', { name: 'Away Bills', pin: '8642', role: 'cashier', branches: [away.id] });
  await admin('/api/branch/use', { id: away.id });
  const a = api((await anon('/api/login', { user_id: id, pin: '8642' })).token);
  await assert.rejects(a('/api/invoices/' + inv.id), /Not found/);
  await admin('/api/branch/use', { id: here.id });
  await admin('/api/users', { id, name: 'Away Bills', role: 'cashier', active: 0 });
});

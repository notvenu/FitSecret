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
  await assert.rejects(cashier('/api/reports/x/item_pnl'), /Admin only/);
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
  await cashier('/api/invoices', { party_id: cust.id, lines: [{ item_id: items[1].id, qty: 1, rate: 1000 }], payments: [{ mode: 'cash', amount: 1000 }] });
  const pts = (await cashier('/api/reports/x/loyalty')).find((x) => x.party_id === cust.id);
  assert.equal(pts.balance, 10);
  await assert.rejects(cashier('/api/invoices', { party_id: cust.id, lines: [{ item_id: items[1].id, qty: 1, rate: 100 }], payments: [{ mode: 'points', amount: 11 }, { mode: 'cash', amount: 89 }] }), /Only ₹10/);
  await cashier('/api/invoices', { party_id: cust.id, lines: [{ item_id: items[1].id, qty: 1, rate: 100 }], payments: [{ mode: 'points', amount: 10 }, { mode: 'cash', amount: 90 }] });
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

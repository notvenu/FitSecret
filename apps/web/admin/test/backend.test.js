// The /admin back end against the real migration SQL in PGlite (Supabase auth stubbed), same approach as apps/pos/test/sync.test.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { setClient } from '../session.js';
import { call } from '../backend.js';

const STAFF = '11111111-1111-4111-a111-111111111111';
const CUSTOMER = '22222222-2222-4222-a222-222222222222';
const STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`;
const SIG = { sync_push: ['p::jsonb'], sync_pull: ['p_since::bigint', 'p_limit::int'], place_order: ['p::jsonb'], store_info: [],
  check_coupon: ['p_code::text', 'p_subtotal::numeric', 'p_phone::text'], submit_feedback: ['p::jsonb'] };

let pg;
// Call an RPC as a given Supabase role/user, like PostgREST would.
const rpc = (role, sub) => async (name, args) => {
  const sig = SIG[name];
  const vals = sig.map((s) => { const v = args[s.split('::')[0]]; return typeof v === 'object' ? JSON.stringify(v) : v; });
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub || '']);
  await pg.exec(`set role ${role}`);
  try {
    return (await pg.query(`select ${name}(${sig.map((s, i) => `$${i + 1}::${s.split('::')[1]}`).join(',')}) r`, vals)).rows[0].r;
  } finally { await pg.exec('reset role'); }
};

before(async () => {
  pg = await PGlite.create();
  await pg.exec(STUB);
  for (const f of ['0001_init.sql', '0002_gold.sql', '0003_vyapar_rest.sql', '0004_online_store.sql', '0005_online_inbox.sql']) await pg.exec(readFileSync(new URL('../../../../supabase/migrations/' + f, import.meta.url), 'utf8'));
  await pg.exec(`insert into auth.users values ('${STAFF}'), ('${CUSTOMER}'); insert into staff (user_id, name, role) values ('${STAFF}', 'Test', 'admin');`);
  const asStaff = rpc('authenticated', STAFF);
  setClient({
    auth: { getSession: async () => ({ data: { session: { user: { id: STAFF, email: 'staff@test.in' } } } }), signOut: async () => {} },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Test', role: 'admin', branch_id: null } }) }) }) }),
    rpc: async (name, args) => { try { return { data: await asStaff(name, args), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
  });
});

const stockOf = async (id) => (await call('/items')).find((i) => i.id === id).stock;

test('setup, purchase, sale (FEFO), reports, cancel; everything lands in Postgres', async () => {
  assert.equal((await call('/bootstrap')).setup, true);
  await call('/setup', { branch: { name: 'Fit Secrets', code: 'VJA', state_code: '37', is_online: true } });
  assert.equal((await call('/bootstrap')).setup, false);

  const item = await call('/t/items', { name: 'Whey 1kg', sale_price: 2000, mrp: 2500, gst_rate: 18, hsn: '2106', online: true, low_stock: 2, barcode: 'X1' });
  await assert.rejects(call('/t/items', { name: 'Dup', barcode: 'X1' }), /Barcode already used/);
  const sup = await call('/t/parties', { type: 'supplier', name: 'Distributor', state_code: '37' });

  const pur = await call('/invoices', { type: 'purchase', party_id: sup.id, no: 'S-1', payments: [{ amount: 11800 }],
    lines: [{ item_id: item.id, qty: 4, rate: 1000, gst_rate: 18, batch_no: 'LATE', expiry: '2028-01-01' }, { item_id: item.id, qty: 6, rate: 1000, gst_rate: 18, batch_no: 'EARLY', expiry: '2027-01-01' }] });
  assert.equal(pur.status, 'paid');
  assert.equal(await stockOf(item.id), 10);

  const sale = await call('/invoices', { lines: [{ item_id: item.id, qty: 8 }], payments: [{ mode: 'upi', amount: 99999 }] });
  assert.match(sale.no, /^VJA\/\d\d-\d\d\/0001$/);
  assert.equal(sale.total, 16000);
  assert.equal(sale.paid, 16000); // change is not kept
  assert.deepEqual((await call(`/items/${item.id}/batches`)).map((b) => [b.batch_no, b.qty]), [['LATE', 2]]); // earliest expiry sold first

  const dash = await call('/reports/dashboard');
  assert.equal(dash.today.t, 16000);
  assert.equal(dash.low_list[0].qty, 2);
  const range = '?from=2000-01-01&to=2999-12-31';
  assert.equal((await call('/reports/gst' + range)).totals.find((t) => t.type === 'sale').taxable, 13559.32); // 16000 / 1.18
  assert.equal((await call('/reports/pnl' + range)).revenue, 13559.32);
  assert.equal((await call('/reports/daybook')).cash.find((c) => c.mode === 'upi').net, 16000);
  assert.equal((await call(`/parties/${sup.id}/ledger`)).rows.at(-1).balance, 0);

  // a failing write leaves nothing behind, locally or in Postgres
  const count = async () => (await pg.query('select count(*) n from invoices')).rows[0].n;
  const had = await count();
  await assert.rejects(call('/invoices', { lines: [{ item_id: item.id, qty: 1 }], payments: [] }), /Select a customer/);
  assert.equal(await count(), had);

  await call(`/invoices/${sale.id}/cancel`, {});
  assert.equal(await stockOf(item.id), 10);
  assert.equal((await pg.query('select status from invoices where id = $1', [sale.id])).rows[0].status, 'cancelled');
});

test('website order: place_order reserves stock; invoice, COD collection and cancel work from the admin screens', async () => {
  const [branch] = await call('/t/branches');
  await pg.query('update shop_config set online_branch_id = $1 where id = 1', [branch.id]);
  const item = (await call('/items'))[0];
  const placed = await rpc('anon', null)('place_order', { p: { name: 'Ravi Kumar', phone: '9876543210', items: [{ item_id: item.id, qty: 1 }], payment_method: 'cod',
    address: { line1: '12 MG Road', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '520010' } } });
  await call('/sync/now', {});
  assert.equal(await stockOf(item.id), 9);

  const [order] = await call('/orders?status=placed');
  assert.equal(order.id, placed.id);
  const delivered = await call(`/orders/${order.id}`, { status: 'delivered' });
  assert.equal(delivered.payment_status, 'paid'); // COD collected on delivery
  const inv = await call(`/invoices/${delivered.invoice_id}`);
  assert.equal(inv.status, 'paid');
  assert.equal(inv.party_name, 'Ravi Kumar');
  assert.equal(await stockOf(item.id), 9); // the invoice did not take stock a second time

  await call(`/orders/${order.id}`, { status: 'cancelled' });
  assert.equal((await call(`/invoices/${delivered.invoice_id}`)).status, 'cancelled');
  assert.equal(await stockOf(item.id), 10);
});

test('Vyapar extras in /admin: prefix, TCS, due date, mfg batches, TDS, branch transfer; columns land in Postgres', async () => {
  const [branch] = await call('/t/branches');
  await call('/t/branches', { id: branch.id, settings: { ...branch.settings, prefixes: { sale: 'FS-INV' } } });
  const item = (await call('/items'))[0];
  const p = await call('/t/parties', { type: 'customer', name: 'Gym Co', state_code: '37', payment_terms: 15, shipping_address: 'Gym, MG Road' });
  const sup = await call('/t/parties', { type: 'supplier', name: 'Dist 2', state_code: '37' });
  await call('/invoices', { type: 'purchase', party_id: sup.id, lines: [{ item_id: item.id, qty: 2, rate: 100, batch_no: 'MF', expiry: '2029-01-01', mfg: '2026-05-01' }] });
  assert.equal((await call(`/items/${item.id}/batches`)).find((b) => b.batch_no === 'MF').mfg, '2026-05-01');
  const inv = await call('/invoices', { party_id: p.id, date: '2026-10-01', tcs_rate: 1, lines: [{ item_id: item.id, qty: 1, rate: 1000, serial: 'IMEI-9' }] });
  assert.match(inv.no, /^FS-INV\/\d\d-\d\d\/0001$/);
  assert.deepEqual([inv.tcs, inv.total, inv.due_date, inv.ship_to], [10, 1010, '2026-10-16', 'Gym, MG Road']);
  await call('/payments', { party_id: p.id, invoice_id: inv.id, direction: 'in', amount: 1000, tds: 10, mode: 'bank' });
  assert.equal((await call(`/invoices/${inv.id}`)).status, 'paid');
  assert.equal((await call('/parties')).find((x) => x.id === p.id).balance, 0);
  const row = (await pg.query('select tcs, due_date::text d, ship_to from invoices where id = $1', [inv.id])).rows[0];
  assert.deepEqual([Number(row.tcs), row.d, row.ship_to], [10, '2026-10-16', 'Gym, MG Road']);
  assert.equal((await pg.query('select serial from invoice_lines where invoice_id = $1', [inv.id])).rows[0].serial, 'IMEI-9');

  const b2 = await call('/t/branches', { name: 'Guntur', code: 'GNT', state_code: '37' });
  const before = await stockOf(item.id);
  await call('/stock/adjust', { item_id: item.id, qty: 1, to_branch: b2.id });
  assert.equal(await stockOf(item.id), before - 1);
});

test('Online Store: store settings + coupons are enforced by place_order; the invoice matches what the customer paid', async () => {
  const anon = rpc('anon', null);
  const online = (await pg.query('select online_branch_id id from shop_config')).rows[0].id;
  const branch = (await call('/t/branches')).find((b) => b.id === online);
  await call('/t/branches', { id: branch.id, settings: { ...branch.settings, store: { shipping_fee: 60, free_shipping_above: 5000, min_order: 100, announcement: 'Diwali sale' } } });
  await assert.rejects(call('/t/coupons', { code: 'x', kind: 'percent', value: 10 }), /3-20 letters/);
  await call('/t/coupons', { code: 'diwali10', kind: 'percent', value: 10, max_discount: 150, public: true, usage_limit: 2, per_phone: 1 });
  await assert.rejects(call('/t/coupons', { code: 'DIWALI10', kind: 'flat', value: 5 }), /already exists/);

  const info = await anon('store_info', {});
  assert.equal(info.announcement, 'Diwali sale');
  assert.equal(Number(info.shipping_fee), 60);
  assert.deepEqual(info.coupons.map((c) => c.code), ['DIWALI10']);
  assert.equal(Number((await anon('check_coupon', { p_code: 'diwali10', p_subtotal: 1000, p_phone: null })).discount), 100);

  const item = (await call('/items')).find((i) => i.stock > 2);
  const order = (phone, coupon) => anon('place_order', { p: { name: 'Coupon Buyer', phone, coupon, payment_method: 'cod', items: [{ item_id: item.id, qty: 1 }],
    address: { line1: '12 MG Road', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '520010' } } });
  const o = await order('9876500001', 'Diwali10');
  const disc = Math.min(Math.round(item.sale_price * 10) / 100, 150);
  assert.equal(Number(o.discount), disc);
  assert.equal(Number(o.total), Math.round((item.sale_price - disc + 60) * 100) / 100, 'discount off, shipping on the rest');
  await assert.rejects(order('9876500001', 'DIWALI10'), /COUPON_ALREADY_USED/);
  await order('9876500002', 'DIWALI10');
  await assert.rejects(order('9876500003', 'DIWALI10'), /COUPON_USED_UP/);

  await call('/sync/now', {});
  const placed = (await call('/orders?status=placed')).find((x) => x.id === o.id);
  assert.equal(placed.coupon, 'DIWALI10');
  const inv = await call(`/orders/${o.id}/invoice`, {});
  assert.ok(Math.abs(inv.total - (Number(o.total) - 60)) <= 1, `invoice ${inv.total} = goods after discount`);

  await call('/t/branches', { id: branch.id, settings: { ...branch.settings, store: { open: false } } });
  await assert.rejects(order('9876500004'), /STORE_CLOSED/);
  await call('/t/branches', { id: branch.id, settings: { ...branch.settings, store: { open: true, min_order: 1e6 } } });
  await assert.rejects(order('9876500004'), /MIN_ORDER/);
});

test('Inbox: reviews need approval (verified buyer flagged), restock requests dedupe, refunds tracked on prepaid cancels', async () => {
  const anon = rpc('anon', null);
  const online = (await pg.query('select online_branch_id id from shop_config')).rows[0].id;
  const br = (await call('/t/branches')).find((x) => x.id === online);
  await call('/t/branches', { id: br.id, settings: { ...br.settings, store: {} } }); // previous test left a huge minimum order
  const item = (await call('/items')).find((i) => i.stock > 1 && i.online);
  const review = (phone, extra = {}) => anon('submit_feedback', { p: { kind: 'review', item_id: item.id, name: 'Kiran Kumar', phone, rating: 5, body: 'Great taste, mixes well.', ...extra } });
  await assert.rejects(review('123'), /INVALID_PHONE/);
  await assert.rejects(review('9876511111', { rating: 9 }), /BAD_RATING/);
  await assert.rejects(review('9876511111', { body: 'ok' }), /REVIEW_TOO_SHORT/);

  // a delivered order makes the reviewer a verified buyer
  const placed = await anon('place_order', { p: { name: 'Kiran Kumar', phone: '9876511111', payment_method: 'online', items: [{ item_id: item.id, qty: 1 }],
    address: { line1: '12 MG Road', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '520010' } } });
  await pg.query("update orders set status = 'delivered', payment_status = 'paid' where id = $1", [placed.id]);
  const r = await review('9876511111');
  assert.equal((await pg.query('select verified, status from feedback where id = $1', [r.id])).rows[0].verified, true);
  assert.equal((await pg.query('select count(*)::int n from shop_reviews')).rows[0].n, 0, 'hidden until approved');
  await call('/sync/now', {});
  await call('/t/feedback', { id: r.id, status: 'approved', reply: 'Thank you!' });
  const shown = (await pg.query('select name, rating, reply, verified from shop_reviews')).rows;
  assert.deepEqual(shown, [{ name: 'Kiran', rating: 5, reply: 'Thank you!', verified: true }], 'first name only, no phone');

  const a = await anon('submit_feedback', { p: { kind: 'restock', item_id: item.id, name: 'Asha', phone: '9000000077' } });
  const b = await anon('submit_feedback', { p: { kind: 'restock', item_id: item.id, name: 'Asha', phone: '9000000077' } });
  assert.equal(a.id, b.id, 'same request not stored twice');
  await anon('submit_feedback', { p: { kind: 'message', name: 'Asha', phone: '9000000077', body: 'Do you have vegan protein?' } });
  for (let i = 0; i < 10; i++) await anon('submit_feedback', { p: { kind: 'message', name: 'Spam', phone: '9000000088', body: 'hello ' + i } });
  await assert.rejects(anon('submit_feedback', { p: { kind: 'message', name: 'Spam', phone: '9000000088', body: 'hello 10' } }), /TOO_MANY/);

  // prepaid order cancelled → refund pending → refunded; internal note kept
  const p2 = await anon('place_order', { p: { name: 'Refund Me', phone: '9876522222', payment_method: 'online', items: [{ item_id: item.id, qty: 1 }],
    address: { line1: '12 MG Road', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '520010' } } });
  await pg.query("update orders set status = 'placed', payment_status = 'paid' where id = $1", [p2.id]);
  await call('/sync/now', {});
  await call(`/orders/${p2.id}`, { status: 'cancelled', internal_note: 'Customer changed mind' });
  let o = (await call('/orders')).find((x) => x.id === p2.id);
  assert.deepEqual([o.payment_status, o.internal_note], ['refund_pending', 'Customer changed mind']);
  await call(`/orders/${p2.id}`, { refund: 'done' });
  o = (await call('/orders')).find((x) => x.id === p2.id);
  assert.equal(o.payment_status, 'refunded');
});

// Supabase side against the real migration SQL in PGlite (auth stubbed): the website's functions (orders, coupons, combos,
// loyalty, inbox) and the /admin Online Orders console, including what an "orders" login can NOT do.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { setClient } from '../session.js';
import { call } from '../backend.js';

const COUNTER = '11111111-1111-4111-a111-111111111111'; // the POS sync account (role staff)
const CONSOLE = '33333333-3333-4333-a333-333333333333'; // an Online Orders console login (role orders)
const CUSTOMER = '22222222-2222-4222-a222-222222222222';
const STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`;
const SIG = { sync_push: ['p::jsonb'], sync_pull: ['p_since::bigint', 'p_limit::int'], place_order: ['p::jsonb'], store_info: [],
  check_coupon: ['p_code::text', 'p_subtotal::numeric', 'p_phone::text'], submit_feedback: ['p::jsonb'],
  staff_orders: ['p_status::text'], staff_update_order: ['p_id::uuid', 'p::jsonb'], staff_inbox: [], staff_inbox_update: ['p_id::uuid', 'p::jsonb'] };

let pg, online;
// Call an RPC as a given Supabase role/user, like PostgREST would.
const rpc = (role, sub, email) => async (name, args = {}) => {
  const sig = SIG[name];
  const vals = sig.map((s) => { const v = args[s.split('::')[0]]; return v && typeof v === 'object' ? JSON.stringify(v) : v ?? null; });
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [sub || '', email ? JSON.stringify({ email }) : '']);
  await pg.exec(`set role ${role}`);
  try { return (await pg.query(`select ${name}(${sig.map((s, i) => `$${i + 1}::${s.split('::')[1]}`).join(',')}) r`, vals)).rows[0].r; }
  finally { await pg.exec('reset role'); }
};
const anon = rpc('anon', null);
const counter = rpc('authenticated', COUNTER);
const id = () => crypto.randomUUID();
const push = (p) => counter('sync_push', { p }); // seed data the way a POS counter does
const ADDR = { line1: '12 MG Road', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '520010' };
const order = (extra) => anon('place_order', { p: { name: 'Ravi Kumar', phone: '9876543210', payment_method: 'cod', address: ADDR, ...extra } });
async function item(name, price, qty = 20, extra = {}) {
  const it = { id: id(), name, slug: name.toLowerCase().replace(/\W+/g, '-'), sale_price: price, purchase_price: price / 2, gst_rate: 18, online: true, ...extra };
  await push({ items: [it], stock_movements: [{ id: id(), branch_id: online, item_id: it.id, qty, ref_type: 'adjust' }] });
  return it;
}
const stock = async (itemId) => Number((await pg.query('select coalesce(sum(qty), 0) n from stock_movements where item_id = $1 and not deleted', [itemId])).rows[0].n);
const setStore = async (store, extra = {}) => pg.query("update branches set settings = $2::jsonb where id = $1", [online, JSON.stringify({ store, ...extra })]);

before(async () => {
  pg = await PGlite.create();
  await pg.exec(STUB);
  for (const f of readdirSync(new URL('../../../../supabase/migrations/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort())
    await pg.exec(readFileSync(new URL('../../../../supabase/migrations/' + f, import.meta.url), 'utf8'));
  await pg.exec(`insert into auth.users values ('${COUNTER}'), ('${CONSOLE}'), ('${CUSTOMER}');
    insert into staff (user_id, name, role) values ('${COUNTER}', 'Counter', 'staff'), ('${CONSOLE}', 'Ravi', 'orders');`);
  online = id();
  await push({ branches: [{ id: online, code: 'VJA', name: 'Fit Secrets', state_code: '37', is_online: true, settings: {} }] });
  await pg.query('update shop_config set online_branch_id = $1 where id = 1', [online]);
  // the console's Supabase client, signed in as the orders login
  const asConsole = rpc('authenticated', CONSOLE);
  setClient({
    auth: { getSession: async () => ({ data: { session: { user: { id: CONSOLE, email: 'ravi@shop.in' } } } }), signOut: async () => {} },
    from: (t) => (t === 'staff' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Ravi', role: 'orders' } }) }) }) }
      : { select: async () => ({ data: (await pg.query('select id, name, slug, group_key, stock from shop_items')).rows, error: null }) }),
    rpc: async (name, args) => { try { return { data: await asConsole(name, args), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
  });
});

test('orders console: an orders login moves website orders along; stock, COD, refunds and history follow', async () => {
  const it = await item('Console Whey', 1500, 10);
  const o = await order({ items: [{ item_id: it.id, qty: 2 }] });
  assert.equal(await stock(it.id), 8, 'reserved when placed');
  const [first] = await call('/orders?status=placed');
  assert.deepEqual([first.id, first.lines.length, first.events.length], [o.id, 1, 1]);
  await call(`/orders/${o.id}`, { status: 'confirmed' });
  await call(`/orders/${o.id}`, { status: 'shipped', courier: 'Delhivery', awb: 'AWB1', tracking_url: 'https://www.delhivery.com/track/package/AWB1' });
  await assert.rejects(call(`/orders/${o.id}`, { tracking_url: 'javascript:alert(1)' }), /https/);
  const done = await call(`/orders/${o.id}`, { status: 'delivered' });
  assert.deepEqual([done.status, done.payment_status, done.awb], ['delivered', 'paid', 'AWB1'], 'COD collected on delivery');
  assert.deepEqual((await call('/orders')).find((x) => x.id === o.id).events.map((e) => e.status), ['placed', 'confirmed', 'shipped', 'delivered']);
  assert.match((await call('/orders')).find((x) => x.id === o.id).events[1].note, /Ravi/);

  // a prepaid order cancelled: stock back, refund pending, then refunded; a cancelled order can't move on
  const p = await order({ payment_method: 'online', items: [{ item_id: it.id, qty: 1 }] });
  await pg.query("update orders set status = 'placed', payment_status = 'paid' where id = $1", [p.id]);
  assert.equal(await stock(it.id), 7);
  const c = await call(`/orders/${p.id}`, { status: 'cancelled', internal_note: 'Customer changed mind' });
  assert.deepEqual([c.payment_status, c.internal_note, await stock(it.id)], ['refund_pending', 'Customer changed mind', 8]);
  await call(`/orders/${p.id}`, { status: 'cancelled' }); // again: stock not returned twice
  assert.equal(await stock(it.id), 8);
  await assert.rejects(call(`/orders/${p.id}`, { status: 'packed' }), /cancelled/);
  assert.equal((await call(`/orders/${p.id}`, { refund: 'done' })).payment_status, 'refunded');
});

test('orders console: that login cannot read or change anything else, and the public cannot use the console', async () => {
  const asConsole = rpc('authenticated', CONSOLE);
  await assert.rejects(asConsole('sync_pull', { p_since: 0, p_limit: 10 }), /not authorized/);
  await assert.rejects(asConsole('sync_push', { p: { items: [{ id: id(), name: 'Sneaky' }] } }), /not authorized/);
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [CONSOLE]);
  await pg.exec('set role authenticated');
  try {
    for (const t of ['items', 'parties', 'invoices', 'payments', 'employees', 'branches', 'orders']) assert.equal((await pg.query(`select count(*)::int n from ${t}`)).rows[0].n, 0, `${t} hidden`);
    await assert.rejects(pg.query("insert into coupons (id, code, kind, value) values (gen_random_uuid(), 'FREE', 'flat', 999)"));
  } finally { await pg.exec('reset role'); }
  await assert.rejects(anon('staff_orders', {}), /not authorized|permission denied/);
  await assert.rejects(anon('staff_update_order', { p_id: id(), p: { status: 'delivered' } }), /not authorized|permission denied/);
  await assert.rejects(call('/invoices'), /Not part of the online orders console/);
  assert.ok((await counter('sync_pull', { p_since: 0, p_limit: 5 })).rows.length, 'the POS sync account still syncs');
});

test('inbox: reviews need approval (verified buyer flagged), restock requests dedupe, messages are rate limited', async () => {
  const it = await item('Review Whey', 1200);
  const review = (phone, extra = {}) => anon('submit_feedback', { p: { kind: 'review', item_id: it.id, name: 'Kiran Kumar', phone, rating: 5, body: 'Great taste, mixes well.', ...extra } });
  await assert.rejects(review('123'), /INVALID_PHONE/);
  await assert.rejects(review('9876511111', { rating: 9 }), /BAD_RATING/);
  await assert.rejects(review('9876511111', { body: 'ok' }), /REVIEW_TOO_SHORT/);
  const placed = await order({ name: 'Kiran Kumar', phone: '9876511111', items: [{ item_id: it.id, qty: 1 }] });
  await pg.query("update orders set status = 'delivered' where id = $1", [placed.id]);
  const r = await review('9876511111');
  assert.equal((await pg.query('select verified from feedback where id = $1', [r.id])).rows[0].verified, true);
  assert.equal((await pg.query('select count(*)::int n from shop_reviews')).rows[0].n, 0, 'hidden until approved');
  assert.ok((await call('/t/feedback')).some((f) => f.id === r.id), 'the console sees it');
  await call('/t/feedback', { id: r.id, status: 'approved', reply: 'Thank you!' });
  assert.deepEqual((await pg.query('select name, rating, reply, verified from shop_reviews')).rows, [{ name: 'Kiran', rating: 5, reply: 'Thank you!', verified: true }], 'first name only, no phone');
  await assert.rejects(call('/t/feedback', { id: r.id, status: 'deleted' }), /BAD_STATUS/);
  assert.ok((await call('/items')).some((x) => x.id === it.id && x.stock > 0), 'product names and website stock for the inbox');

  const a = await anon('submit_feedback', { p: { kind: 'restock', item_id: it.id, name: 'Asha', phone: '9000000077' } });
  const b = await anon('submit_feedback', { p: { kind: 'restock', item_id: it.id, name: 'Asha', phone: '9000000077' } });
  assert.equal(a.id, b.id, 'same request not stored twice');
  for (let i = 0; i < 10; i++) await anon('submit_feedback', { p: { kind: 'message', name: 'Spam', phone: '9000000088', body: 'hello ' + i } });
  await assert.rejects(anon('submit_feedback', { p: { kind: 'message', name: 'Spam', phone: '9000000088', body: 'hello 10' } }), /TOO_MANY/);
});

test('store settings and coupons are enforced by place_order', async () => {
  await setStore({ shipping_fee: 60, free_shipping_above: 5000, min_order: 100, announcement: 'Diwali sale' });
  await push({ coupons: [{ id: id(), code: 'DIWALI10', kind: 'percent', value: 10, max_discount: 150, public: true, active: true, usage_limit: 2, per_phone: 1 }] });
  const info = await anon('store_info', {});
  assert.deepEqual([info.announcement, Number(info.shipping_fee)], ['Diwali sale', 60]);
  assert.ok(info.coupons.some((c) => c.code === 'DIWALI10'));
  assert.equal(Number((await anon('check_coupon', { p_code: 'diwali10', p_subtotal: 1000, p_phone: null })).discount), 100);
  const it = await item('Coupon Whey', 1000);
  const buy = (phone, coupon) => order({ name: 'Coupon Buyer', phone, coupon, items: [{ item_id: it.id, qty: 1 }] });
  const o = await buy('9876500001', 'Diwali10');
  assert.deepEqual([Number(o.discount), Number(o.total)], [100, 960], 'discount off, shipping on the rest');
  await assert.rejects(buy('9876500001', 'DIWALI10'), /COUPON_ALREADY_USED/);
  await buy('9876500002', 'DIWALI10');
  await assert.rejects(buy('9876500003', 'DIWALI10'), /COUPON_USED_UP/);
  await setStore({ open: false });
  await assert.rejects(buy('9876500004'), /STORE_CLOSED/);
  await setStore({ open: true, min_order: 1e6 });
  await assert.rejects(buy('9876500004'), /MIN_ORDER/);
  await setStore({});
});

test('bulk price and regular-buyer rates: charged only to the signed-in buyer', async () => {
  const whey = await item('Bulk Whey', 1000, 40, { wholesale_price: 900, wholesale_min_qty: 3 });
  const bar = await item('Bulk Bar', 500, 40);
  await push({ parties: [{ id: id(), type: 'customer', name: 'Iron Gym', email: 'Gym@Iron.in', state_code: '37', price_discount: 10, rates: { [whey.id]: 850 } }] });
  const buy = (qw, qb) => ({ name: 'Iron Gym', phone: '9000012345', payment_method: 'cod', address: ADDR, items: [{ item_id: whey.id, qty: qw }, { item_id: bar.id, qty: qb }] });
  const prices = async (oid) => (await pg.query('select l.price from order_lines l join items i on i.id = l.item_id where order_id = $1 order by i.name desc', [oid])).rows.map((r) => +r.price);
  const guest = await anon('place_order', { p: buy(3, 1) });
  assert.deepEqual(await prices(guest.id), [900, 500], 'guest: bulk price from 3, list price otherwise');
  const gym = await rpc('authenticated', CUSTOMER, 'gym@iron.in')('place_order', { p: buy(1, 2) });
  assert.deepEqual(await prices(gym.id), [850, 450], 'buyer: own rate, 10% off the rest');
  const other = await rpc('authenticated', CUSTOMER, 'someone@else.in')('place_order', { p: buy(1, 1) });
  assert.deepEqual(await prices(other.id), [1000, 500]);
  await assert.rejects(anon('place_order', { p: buy(101, 1) }), /INVALID_QTY/);
});

test('loyalty points: one balance across counter and website; a signed-in customer spends them at checkout, once', async () => {
  await setStore({}, { loyalty: { enabled: true, earn_per_100: 5, point_value: 1 } });
  const it = await item('Points Whey', 1000);
  const cust = id();
  await push({ parties: [{ id: cust, type: 'customer', name: 'Points Priya', phone: '9000077777', email: 'priya@points.in', state_code: '37' }],
    invoices: [{ id: id(), branch_id: online, type: 'sale', no: 'C-1', date: '2026-10-01', party_id: cust, total: 2000, paid: 2000, status: 'paid' }] }); // counter sale: 100 points
  const me = rpc('authenticated', CUSTOMER, 'priya@points.in');
  const points = async () => (await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ email: 'priya@points.in' })]),
    (await pg.query('select my_points() r')).rows[0].r?.value);
  assert.equal(await points(), 100);
  const buy = { name: 'Priya', phone: '9000077777', payment_method: 'cod', address: ADDR, items: [{ item_id: it.id, qty: 1 }], points: 500 };
  await assert.rejects(anon('place_order', { p: buy }), /POINTS_SIGN_IN/, 'a phone number alone cannot spend points');
  const o = await me('place_order', { p: buy });
  assert.deepEqual([+o.points, +o.total], [100, 900], 'capped at what she has; 1000 (free delivery) − 100');
  assert.equal(await points(), 0, 'already used, even before the order is billed');
  // the POS bills the order: the points become a 'points' payment and she earns on what she paid (900 × 5%)
  const inv = id();
  await push({ invoices: [{ id: inv, branch_id: online, type: 'sale', no: 'W-1', date: '2026-10-02', party_id: cust, total: 1000, paid: 1000, status: 'paid', order_id: o.id }],
    payments: [{ id: id(), branch_id: online, party_id: cust, invoice_id: inv, direction: 'in', amount: 100, mode: 'points', date: '2026-10-02' }] });
  await pg.query('update orders set invoice_id = $2 where id = $1', [o.id, inv]);
  assert.equal(await points(), 45);
});

test('combos online: biggest saving first, each unit once; counter-only coupons and combos do nothing online', async () => {
  const a = await item('Web Whey', 2000, 10), b = await item('Web Shaker', 400, 10);
  const combo = id();
  await push({ offers: [{ id: combo, kind: 'combo', name: 'Gym starter', items: [{ item_id: a.id, qty: 1 }, { item_id: b.id, qty: 1 }], price: 2100, active: true },
    { id: id(), kind: 'combo', name: 'Shop only', items: [{ item_id: a.id, qty: 1 }, { item_id: b.id, qty: 1 }], price: 1500, active: true, channel: 'counter' }],
    coupons: [{ id: id(), code: 'INSTORE', kind: 'flat', value: 100, active: true, public: true, channel: 'counter' }] });
  const o = await order({ items: [{ item_id: a.id, qty: 2 }, { item_id: b.id, qty: 1 }] });
  assert.equal(Number(o.combo_discount), 300, 'one shaker → one combo set; the counter-only combo is never used online');
  assert.equal(Number(o.total), 2000 * 2 + 400 - 300);
  assert.ok((await pg.query('select id from shop_combos')).rows.some((x) => x.id === combo));
  const also = (await pg.query('select item_id from also_bought($1::uuid[])', [[a.id]])).rows.map((r) => r.item_id);
  assert.ok(also.includes(b.id), 'bought together on that order');
  await assert.rejects(order({ coupon: 'INSTORE', items: [{ item_id: a.id, qty: 1 }] }), /COUPON_INVALID/);
  assert.equal((await anon('store_info', {})).coupons.find((c) => c.code === 'INSTORE')?.channel, 'counter', 'shown as in store only');
});

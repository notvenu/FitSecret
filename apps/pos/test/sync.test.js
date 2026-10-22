// End-to-end sync: two SQLite devices <-> real migration SQL running in PGlite (Postgres in WASM) with Supabase auth stubbed.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { TABLES, columnsOf } from '@fitsecret/shared';
import * as D from '../server/db.js';
import { pushOnce, pullOnce } from '../server/sync.js';

const STAFF = '11111111-1111-4111-a111-111111111111';
const CUSTOMER = '22222222-2222-4222-a222-222222222222';
const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`;

let pg;
// Call an RPC as a given Supabase role/user, like PostgREST would.
const call = (role, sub) => async (name, args) => {
  const sig = { sync_push: ['p::jsonb'], sync_pull: ['p_since::bigint', 'p_limit::int'], place_order: ['p::jsonb'], track_order: ['p_order_no', 'p_phone'], confirm_payment: ['p_order::uuid', 'p_ref'] }[name];
  const vals = sig.map((s) => { const v = args[s.split('::')[0]]; return typeof v === 'object' ? JSON.stringify(v) : v; });
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub || '']);
  await pg.exec(`set role ${role}`);
  try {
    const r = await pg.query(`select ${name}(${sig.map((s, i) => `$${i + 1}${s.includes('::') ? '::' + s.split('::')[1] : ''}`).join(',')}) r`, vals);
    return r.rows[0].r;
  } finally { await pg.exec('reset role'); }
};
const staff = call('authenticated', STAFF);

function device(branchId) {
  const db = D.openDb(':memory:');
  if (branchId) D.setMeta(db, 'branch_id', branchId);
  return db;
}

before(async () => {
  pg = await PGlite.create();
  await pg.exec(SUPABASE_STUB);
  for (const f of ['0001_init.sql', '0002_gold.sql', '0003_vyapar_rest.sql', '0004_online_store.sql', '0005_online_inbox.sql']) await pg.exec(readFileSync(new URL('../../../supabase/migrations/' + f, import.meta.url), 'utf8'));
  await pg.exec(`insert into auth.users values ('${STAFF}'), ('${CUSTOMER}'); insert into staff (user_id, name, role) values ('${STAFF}', 'Sync', 'admin');`);
});

test('postgres columns match shared TABLES', async () => {
  for (const t of Object.keys(TABLES)) {
    const { rows } = await pg.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name <> 'seq'`, [t]);
    assert.deepEqual(rows.map((r) => r.column_name).sort(), Object.keys(columnsOf(t)).sort(), t);
  }
});

let A, B, branch, item;
test('device A bills offline, pushes; device B pulls identical state', async () => {
  A = device();
  branch = D.save(A, 'branches', { code: 'VJA', name: 'Vijayawada', state_code: '37', is_online: true });
  D.setMeta(A, 'branch_id', branch.id);
  item = D.save(A, 'items', { name: 'Whey 1kg', sale_price: 2000, purchase_price: 1500, mrp: 2500, gst_rate: 18, online: true, goals: ['muscle-gain'] });
  D.adjustStock(A, branch.id, { item_id: item.id, qty: 10, batch_no: 'B1', expiry: '2027-12-31' });
  const inv = D.createInvoice(A, branch.id, { name: 'Ravi' }, { lines: [{ item_id: item.id, qty: 2 }], payments: [{ mode: 'upi', amount: 4000 }] });
  assert.equal(inv.total, 4000);

  assert.ok(A.prepare('select count(*) n from outbox').get().n > 0);
  await pushOnce(A, staff);
  assert.equal(A.prepare('select count(*) n from outbox').get().n, 0);

  B = device(branch.id);
  await pullOnce(B, staff);
  assert.equal(D.stockMap(B, branch.id)[item.id], 8);
  assert.equal(D.invoiceWithLines(B, inv.id).lines.length, 1);
  assert.deepEqual(D.getWire(B, 'items', item.id).goals, ['muscle-gain']);
  assert.equal(B.prepare('select count(*) n from outbox').get().n, 0, 'pulled rows must not be re-queued');
});

test('last write wins on concurrent edits', async () => {
  D.save(A, 'items', { id: item.id, sale_price: 2100 });
  await new Promise((r) => setTimeout(r, 5));
  D.save(B, 'items', { id: item.id, sale_price: 2200 }); // later edit
  await pushOnce(B, staff);
  await pushOnce(A, staff); // older edit arrives late -> ignored by server
  await pullOnce(A, staff);
  await pullOnce(B, staff);
  assert.equal(D.get(A, 'items', item.id).sale_price, 2200);
  assert.equal(D.get(B, 'items', item.id).sale_price, 2200);
});

test('failed push keeps the outbox intact (offline billing is safe)', async () => {
  D.save(A, 'parties', { name: 'Offline Customer', type: 'customer' });
  const n = A.prepare('select count(*) n from outbox').get().n;
  await assert.rejects(pushOnce(A, async () => { throw new Error('fetch failed'); }));
  assert.equal(A.prepare('select count(*) n from outbox').get().n, n);
  await pushOnce(A, staff);
});

test('non-staff cannot use sync', async () => {
  await assert.rejects(call('authenticated', CUSTOMER)('sync_pull', { p_since: 0, p_limit: 10 }), /not authorized/);
  await assert.rejects(call('anon')('sync_push', { p: {} }), /permission denied/);
});

test('storefront: anon sees shop_items with stock, never purchase prices or raw items', async () => {
  await pg.exec(`update shop_config set online_branch_id = '${branch.id}'`);
  await pg.exec('set role anon');
  try {
    const { rows } = await pg.query('select * from shop_items');
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].stock), 8);
    assert.ok(!('purchase_price' in rows[0]));
    assert.equal((await pg.query('select * from items')).rows.length, 0);
    assert.equal((await pg.query('select * from invoices')).rows.length, 0);
  } finally { await pg.exec('reset role'); }
});

test('online order -> reserves stock -> POS ships -> customer tracks', async () => {
  const anon = call('anon');
  const order = { name: 'Priya', phone: '+91 98765 43210', address: { line1: '12 MG Road', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '520010' },
    items: [{ item_id: item.id, qty: 3 }], payment_method: 'cod' };
  await assert.rejects(anon('place_order', { p: { ...order, items: [{ item_id: item.id, qty: 9 }] } }), /OUT_OF_STOCK/);
  await assert.rejects(anon('place_order', { p: { ...order, phone: '123' } }), /INVALID_PHONE/);
  const placed = await call('authenticated', CUSTOMER)('place_order', { p: order });
  assert.match(placed.order_no, /^FS\d{10}$/);
  assert.equal(Number(placed.total), 3 * 2200 + 0); // above free-shipping threshold

  await pullOnce(A, staff);
  assert.equal(D.stockMap(A, branch.id)[item.id], 5);
  const o = D.get(A, 'orders', placed.id);
  assert.equal(o.status, 'placed');
  D.updateOrder(A, o.id, { status: 'shipped', courier: 'Delhivery', awb: 'DL123' }, { name: 'Ravi' });
  await pushOnce(A, staff);

  const t = await anon('track_order', { p_order_no: placed.order_no.toLowerCase(), p_phone: '9876543210' });
  assert.equal(t.order.status, 'shipped');
  assert.equal(t.order.awb, 'DL123');
  assert.deepEqual(t.events.map((e) => e.status), ['placed', 'shipped']);
  assert.equal(await anon('track_order', { p_order_no: placed.order_no, p_phone: '9999999999' }), null);

  // customer sees own order via RLS, other customers don't
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [CUSTOMER]);
  await pg.exec('set role authenticated');
  assert.equal((await pg.query('select * from orders')).rows.length, 1);
  await pg.exec('reset role');

  // cancellation on POS returns stock everywhere
  D.updateOrder(A, o.id, { status: 'cancelled' });
  await pushOnce(A, staff);
  await pullOnce(B, staff);
  assert.equal(D.stockMap(B, branch.id)[item.id], 8);
});

test('online payment: pending until server confirms; only service role may confirm', async () => {
  const p = await call('anon')('place_order', { p: { name: 'Kiran', phone: '9876500000', address: { line1: '5 Ring Road', pincode: '520008' },
    items: [{ item_id: item.id, qty: 1 }], payment_method: 'online' } });
  await assert.rejects(call('authenticated', CUSTOMER)('confirm_payment', { p_order: p.id, p_ref: 'x' }), /permission denied/);
  await call('service_role')('confirm_payment', { p_order: p.id, p_ref: 'pay_123' });
  const t = await call('anon')('track_order', { p_order_no: p.order_no, p_phone: '9876500000' });
  assert.equal(t.order.payment_status, 'paid');
  assert.equal(t.order.status, 'placed');
});

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
const SIG = { sync_push: ['p::jsonb'], sync_pull: ['p_since::bigint', 'p_limit::int'], place_order: ['p::jsonb'] };

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
  await pg.exec(readFileSync(new URL('../../../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8'));
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

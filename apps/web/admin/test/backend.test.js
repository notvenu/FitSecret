// /admin back end against an in-memory stand-in for Supabase (tables + sync_push). Checks the logic the Online Store
// screens rely on; the SQL side (RLS, sync_push) is covered where the migrations live.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setClient } from '../session.js';
import { call } from '../backend.js';

const OWNER = 'u-owner', STAFF = 'u-staff', BR = 'b-online';
let db, user, pushes;
const row = (r) => ({ deleted: false, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...r });

function fakeClient() {
  const from = (t) => {
    let rows = [...(db[t] || [])];
    const b = {
      select: () => b, order: () => b,
      eq: (k, v) => { rows = rows.filter((r) => r[k] === v); return b; },
      in: (k, vs) => { rows = rows.filter((r) => vs.includes(r[k])); return b; },
      range: (a, z) => { rows = rows.slice(a, z + 1); return b; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok, ko) => Promise.resolve({ data: rows, error: null }).then(ok, ko),
    };
    return b;
  };
  return {
    from,
    rpc: async (name, { p }) => {
      assert.equal(name, 'sync_push');
      pushes.push(p);
      for (const [t, rs] of Object.entries(p)) for (const r of rs) {
        db[t] ||= [];
        const i = db[t].findIndex((x) => x.id === r.id);
        if (i < 0) db[t].push(r); else db[t][i] = r;
      }
      return { data: { ok: true }, error: null };
    },
    auth: { getSession: async () => ({ data: { session: { user: { id: user, email: 'x@y.z' } } } }), signOut: async () => {} },
  };
}

beforeEach(() => {
  pushes = [];
  user = OWNER;
  db = {
    staff: [{ user_id: OWNER, name: 'Owner', role: 'admin' }, { user_id: STAFF, name: 'Ravi', role: 'orders' }],
    shop_config: [{ id: 1, online_branch_id: BR }],
    branches: [row({ id: BR, name: 'MG Road', is_online: true, settings: { store: { open: true } } })],
    categories: [row({ id: 'c1', name: 'Whey', slug: 'whey', sort: 1 })],
    items: [row({ id: 'i1', name: 'Whey 1kg', category_id: 'c1', sale_price: 2000, purchase_price: 1200, online: true })],
    stock_movements: [row({ id: 'm1', branch_id: BR, item_id: 'i1', qty: 10 }), row({ id: 'm2', branch_id: BR, item_id: 'i1', qty: -2 }), row({ id: 'm3', branch_id: 'other', item_id: 'i1', qty: 50 })],
    orders: [row({ id: 'o1', order_no: 'FS1', branch_id: BR, status: 'placed', payment_method: 'online', payment_status: 'paid', total: 4000 })],
    order_lines: [row({ id: 'l1', order_id: 'o1', item_id: 'i1', qty: 2, price: 2000, total: 4000 })],
    order_events: [row({ id: 'e1', order_id: 'o1', status: 'placed' })],
  };
  setClient(fakeClient());
});

test('bootstrap: the owner gets every screen, fulfilled from the online branch', async () => {
  const b = await call('/bootstrap');
  assert.equal(b.user.role, 'admin');
  assert.equal(b.branch.id, BR);
  assert.equal(b.branch.settings.store.open, true);
});

test('cancelling a paid order puts its stock back, logs the event and flags the refund, in one push', async () => {
  const o = await call('/orders/o1', { status: 'cancelled' });
  assert.equal(o.status, 'cancelled');
  assert.equal(o.payment_status, 'refund_pending');
  assert.equal(pushes.length, 1);
  assert.deepEqual(pushes[0].stock_movements.map((m) => [m.item_id, m.qty, m.ref_type, m.branch_id]), [['i1', 2, 'order_cancel', BR]]);
  assert.equal(pushes[0].order_events[0].status, 'cancelled');
  const list = await call('/orders');
  assert.deepEqual(list[0].events.map((e) => e.status), ['placed', 'cancelled']);
});

test('saving merges into the existing row and stamps updated_at', async () => {
  const c = await call('/t/categories', { id: 'c1', name: 'Whey protein' });
  assert.equal(c.slug, 'whey');
  assert.equal(c.created_at, '2026-01-01T00:00:00.000Z');
  assert.ok(c.updated_at > c.created_at);
});

test('items: stock is the online branch only, and cost price never leaves the server', async () => {
  const [i] = await call('/items');
  assert.equal(i.stock, 8);
  assert.equal(i.purchase_price, null);
  assert.equal(i.category, 'Whey');
});

test('only the owner can change products, categories and store settings', async () => {
  user = STAFF;
  await assert.rejects(call('/t/items', { id: 'i1', online: false }), /Only the owner/);
  await assert.rejects(call('/t/branches', { id: BR, settings: {} }), /Only the owner/);
  assert.equal(pushes.length, 0);
});

test('reports load the tables they ask for', async () => {
  const r = await call('/reports/x/combo_ideas');
  assert.ok(r);
});

test('POS-only work is refused', async () => {
  await assert.rejects(call('/invoices', { lines: [] }), /POS counter/);
  await assert.rejects(call('/orders/o1/invoice', {}), /POS counter/);
});

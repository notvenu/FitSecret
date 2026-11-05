// /admin back end: the POS "Online Store" section (apps/pos/ui/src/pages/Online.jsx) running on Supabase instead of the
// POS server. Same routes as apps/pos/server/index.js, answered from the cloud copy of the synced tables. Every write goes
// through sync_push (full rows, last-write-wins), so it reaches the store's POS on its next pull, like a change made at
// another counter. Billing, stock counts, cash and invoices stay on the POS: an order's invoice is made by the counter.
// JSX-free so the test can run it in Node.
import { TABLES, toWire, today, ORDER_LABEL, deleteBlocker } from '@fitsecret/shared';
import { runReport } from '@fitsecret/shared/reports';
import { checkCoupon } from '@fitsecret/shared/store';
import { checkOffer } from '@fitsecret/shared/offers';
import { sb, UserError, loadMe, signOut } from './session.js';

export const CLOUD = true;

const fail = (error) => { throw new UserError(error.message, /JWT|not authorized|permission denied/i.test(error.message) ? 401 : 400); };
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) fail(error);
  return data;
}
// PostgREST returns at most 1000 rows per request; page through.
async function all(t, where = (q) => q, cols = '*') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await where(sb.from(t).select(cols).eq('deleted', false)).order('id').range(from, from + 999);
    if (error) fail(error);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const one = async (t, id) => { const { data, error } = await sb.from(t).select('*').eq('id', id).maybeSingle(); if (error) fail(error); return data; };

// Same merge as the POS's db.save: keep what's there, apply the patch, stamp the times, push the whole row.
async function save(t, patch, was) {
  if (!TABLES[t]) throw new UserError('Unknown table ' + t);
  was ??= patch.id ? await one(t, patch.id) : null;
  const ts = new Date().toISOString();
  const row = toWire(t, { ...was, ...patch, id: patch.id || crypto.randomUUID(), created_at: was?.created_at || ts, updated_at: ts,
    deleted: patch.deleted ?? was?.deleted ?? false });
  await rpc('sync_push', { p: { [t]: [row] } });
  return row;
}

// Shared code (reports, coupon and delete checks) reads tables synchronously through rows(t). Run it, note which tables it
// asked for, fetch those and run again; a handful of passes at most.
export async function withRows(fn, cache = {}) {
  for (let pass = 0; pass < 6; pass++) {
    const miss = new Set();
    let out, err;
    try { out = fn((t) => (t in cache ? cache[t] : (miss.add(t), []))); } catch (e) { err = e; }
    if (!miss.size) { if (err) throw err.user || err instanceof UserError ? new UserError(err.message) : err; return out; }
    await Promise.all([...miss].map(async (t) => { cache[t] = TABLES[t] ? await all(t) : []; }));
  }
  throw new UserError('Report needs too many tables');
}

let ctx = null; // { me, branch } for this session
async function context() {
  const me = await loadMe();
  if (!me) throw new UserError('Sign in again', 401);
  if (ctx?.me === me) return ctx;
  const [{ data: cfg }, branches] = await Promise.all([sb.from('shop_config').select('online_branch_id').maybeSingle(), all('branches')]);
  const branch = branches.find((b) => b.id === cfg?.online_branch_id) || branches.find((b) => b.is_online) || null;
  return (ctx = { me, branches, branch });
}
const branchId = async () => (await context()).branch?.id ?? null;
const ownerOnly = async () => { if ((await context()).me.role !== 'admin') throw new UserError('Only the owner can change this'); };

// Tables this console may write (the Online Store screens) and who: 'admin' = owner only.
const WRITABLE = { categories: 'admin', items: 'admin', coupons: null, offers: null, feedback: null, branches: 'admin', parties: null };

async function writeRow(t, body) {
  delete body.deleted;
  if (WRITABLE[t] === 'admin') await ownerOnly();
  const was = body.id ? await one(t, body.id) : null;
  if ('branch_id' in TABLES[t] && !body.branch_id && !was) body.branch_id = await branchId();
  if (t === 'coupons') body = await withRows((rows) => checkCoupon({ active: true, ...was, ...body }, rows('coupons').filter((c) => c.id !== body.id)));
  if (t === 'offers') {
    const items = Object.fromEntries((await all('items')).map((i) => [i.id, i]));
    try { body = checkOffer({ active: true, ...was, ...body }, (id) => items[id], today()); } catch (e) { throw new UserError(e.message); }
  }
  if (['categories', 'items', 'parties', 'branches'].includes(t) && ((!was && !body.name) || (body.name !== undefined && !String(body.name).trim()))) throw new UserError('Name required');
  return save(t, body, was);
}

const ROUTES = {
  'GET /bootstrap': async () => {
    const me = await loadMe();
    if (!me) return { setup: false, user: null, users: [], branches: [], companies: [], sync: { state: 'online', configured: true } };
    const { branches, branch } = await context();
    const site = typeof location !== 'undefined' ? location.origin : '';
    const ob = branch ? { ...branch, settings: { ...branch.settings, store: { site_url: site, ...branch.settings?.store } } }
      : { id: null, name: 'Online store (no branch synced yet)', is_online: true, settings: { store: { site_url: site } } };
    return { setup: false, user: me, users: [], branches: branches.map((b) => (b.id === ob.id ? ob : b)), companies: [], branch: ob, sync: { state: 'online', configured: true } };
  },
  'POST /logout': async () => { ctx = null; await signOut(); return { ok: true }; },
  'GET /sync': async () => ({ state: 'online', configured: true }),
  'POST /sync/now': async () => ({ state: 'online', configured: true }),

  'GET /orders': async (q) => {
    const st = q.get('status');
    const orders = (await all('orders', (x) => (st ? x.eq('status', st) : x))).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300);
    const ids = orders.map((o) => o.id);
    const by = async (t) => { const m = {}; for (let i = 0; i < ids.length; i += 100) for (const r of await all(t, (x) => x.in('order_id', ids.slice(i, i + 100)))) (m[r.order_id] ||= []).push(r); return m; };
    const [lines, events] = await Promise.all([by('order_lines'), by('order_events')]);
    return orders.map((o) => ({ ...o, lines: lines[o.id] || [], events: (events[o.id] || []).sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
  },
  // Same rules as the POS's updateOrder: cancelling puts the stock back and flags a prepaid order for refund.
  'POST /orders/:id': async (q, body, id) => {
    const { status, courier, awb, tracking_url, note, internal_note, refund } = body || {};
    if (status && !ORDER_LABEL[status]) throw new UserError('Bad status');
    if (tracking_url && !/^https:\/\//.test(tracking_url)) throw new UserError('The tracking link must start with https://');
    const o = await one('orders', id);
    if (!o) throw new UserError('Order not found');
    const { me } = await context();
    const ts = new Date().toISOString();
    const row = (t, r) => toWire(t, { id: crypto.randomUUID(), created_at: ts, updated_at: ts, deleted: false, ...r });
    const push = { orders: [], order_events: [], stock_movements: [] };
    if (status === 'cancelled' && o.status !== 'cancelled')
      for (const l of await all('order_lines', (x) => x.eq('order_id', id)))
        push.stock_movements.push(row('stock_movements', { branch_id: o.branch_id, item_id: l.item_id, qty: l.qty, ref_type: 'order_cancel', ref_id: id, note: o.order_no }));
    const patch = { ...o };
    for (const [k, v] of Object.entries({ courier, awb, tracking_url, internal_note })) if (v !== undefined) patch[k] = v;
    if (status === 'cancelled' && o.status !== 'cancelled' && o.payment_status === 'paid' && o.payment_method === 'online') patch.payment_status = 'refund_pending';
    if (refund === 'done' && o.payment_status === 'refund_pending') patch.payment_status = 'refunded';
    if (status) { patch.status = status; if (status === 'delivered' && o.payment_method === 'cod') patch.payment_status = 'paid'; }
    push.orders.push(toWire('orders', { ...patch, updated_at: ts }));
    if (status && status !== o.status) push.order_events.push(row('order_events', { order_id: id, status, note: note || `by ${me.name}` }));
    for (const k of Object.keys(push)) if (!push[k].length) delete push[k];
    await rpc('sync_push', { p: push });
    return push.orders[0];
  },
  'POST /orders/:id/invoice': async () => { throw new UserError('Invoices are made at the POS counter'); },

  'GET /items': async () => {
    const [items, cats, moves] = await Promise.all([all('items'), all('categories'), branchId().then((b) => (b ? all('stock_movements', (x) => x.eq('branch_id', b), 'item_id, qty') : []))]);
    const cat = Object.fromEntries(cats.map((c) => [c.id, c.name])), stock = {};
    for (const m of moves) stock[m.item_id] = (stock[m.item_id] || 0) + Number(m.qty);
    return items.sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ ...i, purchase_price: null, category: cat[i.category_id] || null, stock: stock[i.id] || 0, next_expiry: null, expired_qty: 0 }));
  },
  // ponytail: no running balances here (they need every invoice and payment); the Customers screen shows them as blank.
  'GET /parties': async () => (await all('parties')).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ ...p, balance: null })),

  'GET /t/:table': async (q, body, t) => {
    if (!TABLES[t]) throw new UserError('Unknown table');
    const b = 'branch_id' in TABLES[t] && t !== 'orders' ? await branchId() : null;
    const rows = await all(t, (x) => (b ? x.eq('branch_id', b) : x));
    return rows.sort((x, y) => (y.created_at || '').localeCompare(x.created_at || '')).slice(0, 1000).map((r) => (t === 'items' ? { ...r, purchase_price: null } : r));
  },
  'POST /t/:table': (q, body, t) => { if (!(t in WRITABLE)) throw new UserError('Not part of the online store'); return writeRow(t, { ...body }); },
  'POST /t/:table/bulk': async (q, body, t) => {
    if (!(t in WRITABLE)) throw new UserError('Not part of the online store');
    const out = [];
    for (const [i, r] of (body.rows || []).entries()) {
      try { out.push(await writeRow(t, { ...r })); } catch (e) { throw new UserError(`Row ${i + 1}${r.name ? ` (${r.name})` : ''}: ${e.message}`); }
    }
    return out;
  },
  'DELETE /t/:table/:id': async (q, body, t, id) => {
    if (!(t in WRITABLE)) throw new UserError('Not part of the online store');
    if (WRITABLE[t] === 'admin') await ownerOnly();
    const why = await withRows((rows) => deleteBlocker(t, id, rows, () => 0));
    if (why) throw new UserError(why);
    return save(t, { id, deleted: true });
  },

  'GET /reports/x/:name': async (q, body, name) => {
    const { me } = await context();
    return withRows((rows) => runReport(name, rows, ctx.branch?.id, Object.fromEntries(q), me.role === 'admin' ? 'admin' : 'cashier'));
  },
  // Certificates and banner images go straight to storage, as the POS server does when it mirrors uploads.
  'POST /files': async (q, file) => {
    const name = `${Date.now()}-${(file.name || 'file').replace(/[^\w.-]+/g, '_')}`;
    const { error } = await sb.storage.from('certificates').upload(name, file, { contentType: file.type, upsert: false });
    if (error) fail(error);
    return { url: sb.storage.from('certificates').getPublicUrl(name).data.publicUrl };
  },
};

const compiled = Object.entries(ROUTES).map(([k, fn]) => {
  const [verb, pat] = k.split(' ');
  return { verb, re: new RegExp('^' + pat.replace(/:\w+/g, '([^/]+)') + '$'), fn, open: k === 'GET /bootstrap' };
});

export async function call(path, body, method) {
  if (!sb) throw new UserError('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY in apps/web/.env.local).', 500);
  const [p, qs] = path.split('?'), verb = method || (body ? 'POST' : 'GET');
  for (const r of compiled) {
    const m = r.verb === verb && r.re.exec(p);
    if (!m) continue;
    if (!r.open && !(await loadMe())) throw new UserError('Sign in again', 401);
    return r.fn(new URLSearchParams(qs), body, ...m.slice(1).map(decodeURIComponent));
  }
  throw new UserError('Not available in the online admin. Use the POS counter for this.', 404);
}

// /admin back end: the Online Orders console. Staff sign in with Supabase and work on website orders and the inbox only,
// through the staff_* database functions (migration 0015), which check the staff row themselves. Nothing else is reachable
// from here: billing, stock, money and settings live on the POS counters.
import { sb, UserError, loadMe, signOut } from './session.js';

export const CLOUD = true;

const ERRORS = { ORDER_CANCELLED: 'This order is cancelled', BAD_TRACKING_URL: 'The tracking link must start with https://', ORDER_NOT_FOUND: 'Order not found' };
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new UserError(ERRORS[error.message] || error.message, /JWT|not authorized/i.test(error.message) ? 401 : 400);
  return data;
}

const ROUTES = {
  'GET /bootstrap': async () => {
    const me = await loadMe();
    return { setup: false, user: me, users: [], branches: [], companies: [], sync: { state: 'online', configured: true },
      branch: { id: 'online', name: 'Online orders', settings: { store: { site_url: typeof location !== 'undefined' ? location.origin : '' } } } };
  },
  'POST /logout': async () => { await signOut(); return { ok: true }; },
  'GET /orders': (q) => rpc('staff_orders', { p_status: q.get('status') || null }),
  'POST /orders/:id': (q, body, id) => rpc('staff_update_order', { p_id: id, p: body || {} }),
  'GET /t/feedback': () => rpc('staff_inbox', {}),
  'POST /t/feedback': (q, body) => rpc('staff_inbox_update', { p_id: body.id, p: body }),
  // product names and website stock for the inbox: the public product list, nothing more
  'GET /items': async () => { const { data, error } = await sb.from('shop_items').select('id, name, slug, group_key, stock'); if (error) throw new UserError(error.message); return data; },
  'GET /sync': async () => ({ state: 'online', configured: true }),
  'POST /sync/now': async () => ({ state: 'online', configured: true }),
};

export async function call(path, body, method) {
  const [p, qs] = path.split('?'), verb = method || (body ? 'POST' : 'GET');
  for (const [k, fn] of Object.entries(ROUTES)) {
    const [v, pat] = k.split(' '), m = new RegExp('^' + pat.replace(/:\w+/g, '([^/]+)') + '$').exec(p);
    if (v === verb && m) {
      if (k !== 'GET /bootstrap' && !(await loadMe())) throw new UserError('Sign in again', 401);
      return fn(new URLSearchParams(qs), body, ...m.slice(1));
    }
  }
  throw new UserError('Not part of the online orders console', 404);
}

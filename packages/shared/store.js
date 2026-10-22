// Online store rules shared by the POS server, /admin and tests. Postgres (supabase/migrations/0004_online_store.sql)
// enforces the same rules in place_order / _coupon_discount; keep the two in step.
import { round2 } from './index.js';

// Store settings live in the online branch's settings.store (synced), so any counter or /admin can edit them.
export const STORE_DEFAULTS = {
  open: true, shipping_fee: 49, free_shipping_above: 999, cod_enabled: true, cod_limit: 10000, min_order: 0,
  announcement: '', banners: [], // banners: [{ title, subtitle, image, link }]
};
export const storeSettings = (branch) => ({ ...STORE_DEFAULTS, ...branch?.settings?.store });

// Validates a coupon row before it is saved. others = the other live coupons (codes must be unique). Throws user-facing Error.
export function checkCoupon(c, others = []) {
  const code = String(c.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new Error('Coupon code: 3-20 letters or numbers, no spaces');
  if (others.some((o) => o.id !== c.id && String(o.code).toUpperCase() === code)) throw new Error(`Coupon ${code} already exists`);
  if (!['percent', 'flat'].includes(c.kind)) throw new Error('Pick % off or ₹ off');
  const value = Number(c.value);
  if (!(value > 0) || (c.kind === 'percent' && value > 90)) throw new Error(c.kind === 'percent' ? 'Discount must be 1-90%' : 'Enter the ₹ amount off');
  if (c.starts && c.ends && c.ends < c.starts) throw new Error('End date is before the start date');
  const n = (v) => (v === '' || v == null ? null : Number(v));
  return { ...c, code, value, min_order: n(c.min_order), max_discount: n(c.max_discount), usage_limit: n(c.usage_limit), per_phone: n(c.per_phone) };
}

// Discount for a cart. used / usedByPhone = non-cancelled orders that already used this code. Throws an error CODE like place_order.
export function couponDiscount(c, subtotal, { today, used = 0, usedByPhone = 0 }) {
  if (!c || c.deleted || !c.active) throw new Error('COUPON_INVALID');
  if ((c.starts && today < c.starts) || (c.ends && today > c.ends)) throw new Error('COUPON_EXPIRED');
  if (subtotal < (c.min_order || 0)) throw new Error('COUPON_MIN:' + c.min_order);
  if (c.usage_limit != null && used >= c.usage_limit) throw new Error('COUPON_USED_UP');
  if (c.per_phone != null && usedByPhone >= c.per_phone) throw new Error('COUPON_ALREADY_USED');
  let d = c.kind === 'percent' ? round2((subtotal * c.value) / 100) : c.value;
  if (c.max_discount != null) d = Math.min(d, c.max_discount);
  return round2(Math.min(d, subtotal));
}

// Shipping on the amount after discount, the same as place_order.
export function orderTotals(subtotal, discount, store) {
  const net = round2(subtotal - discount);
  const shipping = net >= store.free_shipping_above ? 0 : store.shipping_fee;
  return { net, shipping, total: round2(net + shipping) };
}

// Website customers, one per phone, from orders (cancelled excluded from spend).
export function customersFromOrders(orders) {
  const m = new Map();
  for (const o of orders) {
    const k = o.phone || o.email || o.id;
    const c = m.get(k) || { phone: o.phone, name: o.name, email: o.email, account: false, orders: 0, spent: 0, cancelled: 0, first: o.created_at, last: o.created_at, city: o.address?.city };
    c.orders++;
    if (o.status === 'cancelled') c.cancelled++; else if (o.status !== 'pending_payment') c.spent = round2(c.spent + o.total);
    c.account ||= !!o.user_id;
    if (o.created_at > c.last) Object.assign(c, { last: o.created_at, name: o.name || c.name, email: o.email || c.email, city: o.address?.city || c.city });
    if (o.created_at < c.first) c.first = o.created_at;
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => b.spent - a.spent);
}

export const COUPON_ERRORS = {
  COUPON_INVALID: 'That coupon code is not valid.', COUPON_EXPIRED: 'That coupon has expired.', COUPON_USED_UP: 'That coupon has been fully used.',
  COUPON_ALREADY_USED: 'You have already used this coupon.', COUPON_MIN: 'Add a little more to use this coupon: minimum order ₹',
};
export const couponError = (msg) => {
  const [k, v] = String(msg).split(':');
  return COUPON_ERRORS[k] ? COUPON_ERRORS[k] + (k === 'COUPON_MIN' ? v : '') : null;
};

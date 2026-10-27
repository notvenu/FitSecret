// Offers: combos (a set of items for one price) and near-expiry offers (a % off one batch until it expires).
// Rules written once for the POS, /admin and the website; place_order in supabase/migrations/0008_variants_offers.sql
// applies combos the same way (greedy, biggest saving first), so the cart and the order always agree.
import { round2 } from './index.js';

// How much a basket saves with the active combos. lines: [{ item_id, qty, price }] (price = unit price before the combo).
// combos: [{ id, name, items: [{ item_id, qty }], price }]. Each unit counts towards one combo only; best saving first.
// perItem: the saving spread over the combo's items by value, so billing can show it as line discounts (GST stays right per rate).
export function comboDiscount(lines, combos = []) {
  const left = new Map(), price = new Map();
  for (const l of lines) { left.set(l.item_id, (left.get(l.item_id) || 0) + Number(l.qty)); price.set(l.item_id, Number(l.price)); }
  const value = (c) => c.items.reduce((s, x) => (price.has(x.item_id) ? s + price.get(x.item_id) * x.qty : NaN), 0);
  const ranked = combos.map((c) => ({ c, saving: round2(value(c) - Number(c.price)) })).filter((x) => x.saving > 0).sort((a, b) => b.saving - a.saving);
  const applied = [], perItem = {};
  let total = 0;
  for (const { c, saving } of ranked) {
    const sets = Math.min(...c.items.map((x) => Math.floor((left.get(x.item_id) || 0) / x.qty)));
    if (!(sets > 0)) continue;
    for (const x of c.items) left.set(x.item_id, left.get(x.item_id) - sets * x.qty);
    const v = value(c);
    for (const x of c.items) perItem[x.item_id] = round2((perItem[x.item_id] || 0) + (sets * saving * price.get(x.item_id) * x.qty) / v);
    applied.push({ id: c.id, name: c.name, sets, saving: round2(sets * saving) });
    total = round2(total + sets * saving);
  }
  return { total, applied, perItem };
}

const dmy = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
// What the bill and the shelf label say. Food law needs the expiry date visible and the label untouched; saying why it's cheaper keeps it honest.
export const expiryNote = (o) => `Near-expiry offer ${o.discount_pct}% off · Expires ${dmy(o.expiry)}${o.batch_no ? ` · Batch ${o.batch_no}` : ''}`;

export const EXPIRY_DEFAULTS = { window: 90, min_margin: 5, steps: [[15, 35], [30, 25], [60, 15], [90, 10]] }; // [days left or fewer, % off]

// Suggested near-expiry offers. batches: [{ item_id, batch_no, expiry, qty }] with stock; items: Map(id → item); offers: saved offers rows.
// The discount grows as expiry nears but never takes the price below cost + min_margin % (cost is before GST, prices include it).
// Batches that can't be discounted profitably are suggested for return; expired ones must come off the shelf.
export function expiryOffers({ batches, items, offers = [], today, cfg = {} }) {
  const c = { ...EXPIRY_DEFAULTS, ...cfg };
  const steps = [...c.steps].sort((a, b) => a[0] - b[0]);
  const days = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5);
  const saved = (b) => offers.find((o) => o.kind === 'expiry' && !o.deleted && o.item_id === b.item_id && (o.batch_no || '') === (b.batch_no || '') && o.expiry === b.expiry);
  const out = [];
  for (const b of batches) {
    if (!(b.qty > 0) || !b.expiry) continue;
    const it = items.get(b.item_id);
    if (!it) continue;
    const left = days(b.expiry), o = saved(b);
    const base = { item_id: it.id, item: it.name, batch_no: b.batch_no || '', expiry: b.expiry, days_left: left, qty: b.qty, price: Number(it.sale_price) || 0, mrp: Number(it.mrp) || 0, offer: o || null };
    if (left < 0) { out.push({ ...base, status: 'expired', advice: 'Expired: take it off the shelf. Return it to the supplier or write it off with Stock ± (reason: expired). Expired food must not be sold.' }); continue; }
    if (left > c.window) continue;
    if (o?.active) { out.push({ ...base, status: 'live', pct: Number(o.discount_pct), offer_price: round2(base.price * (1 - o.discount_pct / 100)) }); continue; }
    if (o && !o.active) continue; // dismissed
    const target = (steps.find(([d]) => left <= d) || steps.at(-1))[1];
    const gst = Number(it.gst_rate) || 0, cost = Number(it.purchase_price) || 0;
    const floor = cost > 0 ? cost * (1 + c.min_margin / 100) * (1 + gst / 100) : 0; // lowest price incl. GST that keeps the margin
    const room = cost > 0 && base.price > 0 ? Math.max(0, (1 - floor / base.price) * 100) : target;
    const pct = Math.floor(Math.min(target, cost > 0 ? room : Math.min(target, 10)));
    if (pct < 3) { out.push({ ...base, status: 'return', advice: cost > 0 ? `Even ${target}% off would sell below cost + ${c.min_margin}%. Ask the supplier to take it back or exchange it.` : 'No purchase cost recorded, so a safe discount can’t be worked out. Enter the cost in Items → Edit.' }); continue; }
    const offer_price = Math.round(base.price * (1 - pct / 100)), taxable = offer_price / (1 + gst / 100);
    out.push({ ...base, status: 'suggested', pct, offer_price, no_cost: !(cost > 0),
      margin_pct: cost > 0 ? round2(((taxable - cost) / taxable) * 100) : null, recovered: round2(offer_price * b.qty), at_risk: round2((cost > 0 ? cost * (1 + gst / 100) : base.price) * b.qty) });
  }
  return out.sort((a, b) => a.days_left - b.days_left);
}

// Checks an offer row before it's saved (both back ends). item(id) → item row. Throws an Error meant for the user.
// Offers may cut margin, never sell at a loss: an expiry offer stays at or above cost (incl. GST); a combo at or above the items' total cost.
export function checkOffer(o, item, today) {
  if (o.deleted) return o;
  const costIncl = (it) => (Number(it?.purchase_price) || 0) * (1 + (Number(it?.gst_rate) || 0) / 100);
  if (o.channel && !['both', 'counter', 'online'].includes(o.channel)) throw new Error('Pick where the offer applies');
  if (o.kind === 'expiry') {
    const it = item(o.item_id);
    if (!it) throw new Error('Pick the item');
    if (!o.expiry) throw new Error('Expiry date missing');
    if (o.expiry < today && o.active !== false) throw new Error('This batch has expired. Expired items cannot be sold, so no offer can be made');
    const pct = Number(o.discount_pct);
    if (!(pct > 0 && pct <= 90)) throw new Error('Discount must be between 1 and 90%');
    if (costIncl(it) > 0 && it.sale_price * (1 - pct / 100) < costIncl(it) - 0.01) throw new Error(`${pct}% off sells ${it.name} below cost. The most you can give is ${Math.floor((1 - costIncl(it) / it.sale_price) * 100)}%`);
    return { ...o, discount_pct: pct, ends: o.expiry, channel: 'counter' }; // tied to a batch on this shop's shelf
  }
  if (o.kind === 'combo') {
    const list = (o.items || []).map((x) => ({ item_id: x.item_id, qty: Math.max(1, Math.round(Number(x.qty) || 1)) })).filter((x) => x.item_id);
    if (new Set(list.map((x) => x.item_id)).size < 2) throw new Error('A combo needs at least two different items');
    if (!String(o.name || '').trim()) throw new Error('Give the combo a name');
    const its = list.map((x) => item(x.item_id));
    if (its.some((x) => !x)) throw new Error('An item in the combo no longer exists');
    const value = round2(list.reduce((s, x, i) => s + its[i].sale_price * x.qty, 0)), cost = round2(list.reduce((s, x, i) => s + costIncl(its[i]) * x.qty, 0));
    const price = Number(o.price);
    if (!(price > 0)) throw new Error('Enter the combo price');
    if (price >= value) throw new Error(`The combo price must be less than the items bought separately (₹${value})`);
    if (cost > 0 && price < cost - 0.01) throw new Error(`₹${price} is below what these items cost you (₹${cost}). Raise the price`);
    if (o.starts && o.ends && o.ends < o.starts) throw new Error('End date is before the start date');
    return { ...o, name: String(o.name).trim(), items: list, price };
  }
  throw new Error('Unknown offer type');
}

// Offers in force today. kind = 'combo' | 'expiry'.
// channel: 'counter' or 'online' keeps out offers meant only for the other one (empty channel = both).
export const forChannel = (o, channel) => !channel || !o.channel || o.channel === 'both' || o.channel === channel;
export const liveOffers = (offers, kind, today, channel) => offers.filter((o) => !o.deleted && o.active && o.kind === kind && forChannel(o, channel)
  && (!o.starts || o.starts <= today) && (!o.ends || o.ends >= today));

// ₹ of a bill's discount that approved offers and combos account for (it doesn't count against a cashier's discount limit).
// lines: [{ item_id, name, qty, rate, discount_pct, offer_id? }]. A line claiming an expiry offer must point at a live one for that item;
// a combo claim can't be more than the combos on the bill allow. Throws Error meant for the user.
export function offerAllowance(lines, offers, date, comboClaim = 0) {
  let allowed = 0;
  for (const l of lines) {
    if (!l.offer_id) continue;
    const o = offers.find((x) => x.id === l.offer_id);
    if (!o || o.deleted || !o.active || o.kind !== 'expiry' || o.item_id !== l.item_id || o.expiry < date) throw new Error(`The near-expiry offer on ${l.name} has ended. Remove the discount and save again`);
    allowed += (l.qty * l.rate * Math.min(Number(l.discount_pct) || 0, o.discount_pct)) / 100;
  }
  if (comboClaim > 0) {
    const max = comboDiscount(lines.map((l) => ({ item_id: l.item_id, qty: l.qty, price: l.rate })), liveOffers(offers, 'combo', date, 'counter')).total;
    if (comboClaim > max + 1) throw new Error('The combo discount doesn’t match the combos on this bill');
    allowed += comboClaim;
  }
  return round2(allowed);
}

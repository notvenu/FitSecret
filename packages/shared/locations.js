// Branches and warehouses: stock per location, transfers between them, restock suggestions and cross-location summaries.
// Pure functions over wire rows, used by the counter server (SQLite) and the cloud admin backend alike.
import { round2 } from './index.js';

export const KINDS = { store: 'Store / branch', warehouse: 'Warehouse' };
// Companies: an item with company_ids is sold only by those companies (empty = all of them).
export const sellsIn = (item, companyId) => !companyId || !item.company_ids?.length || item.company_ids.includes(companyId);
export const companyOf = (branch, companies = []) => companies.find((c) => c.id === branch?.company_id && !c.deleted) || null;
export const kindOf = (b) => (b?.kind === 'warehouse' ? 'warehouse' : 'store');

const live = (rows) => rows.filter((r) => !r.deleted);
const key = (branch, item) => `${branch}\0${item}`;

// Stock on hand per location and item: Map "branch\0item" -> qty
export function stockAt(movements) {
  const m = new Map();
  for (const r of live(movements)) m.set(key(r.branch_id, r.item_id), (m.get(key(r.branch_id, r.item_id)) || 0) + Number(r.qty));
  return m;
}

// Batches of one item at one location with stock left, earliest expiry first (unbatched / no expiry last). Expired ones are left out.
export function batchesAt(movements, branch, item, today) {
  const g = new Map();
  for (const r of live(movements)) {
    if (r.branch_id !== branch || r.item_id !== item) continue;
    const k = `${r.batch_no || ''}\0${r.expiry || ''}`;
    const b = g.get(k) || { batch_no: r.batch_no || null, expiry: r.expiry || null, qty: 0 };
    b.qty = round2(b.qty + Number(r.qty));
    g.set(k, b);
  }
  return [...g.values()].filter((b) => b.qty > 0 && !(b.expiry && b.expiry < today))
    .sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
}

// A transfer: every line leaves `from` and arrives at `to` with the same batch and expiry. Without a batch the earliest-expiring
// batches go first (FEFO). A location can't send more than it has (expired packs never move). Returns the stock movement rows.
export function planTransfer({ from, to, lines, movements, items, branches, today, note }) {
  const name = (id) => branches.find((b) => b.id === id)?.name;
  if (!name(from) || !name(to)) throw new Error('Pick where the stock comes from and where it goes');
  if (from === to) throw new Error('From and To are the same place');
  const want = (lines || []).filter((l) => l.item_id && Number(l.qty) > 0);
  if (!want.length) throw new Error('Add at least one item and quantity');
  const ref_id = globalThis.crypto.randomUUID();
  const done = new Set(movements.filter((m) => m.ref_type === 'transfer' && m.ref_id).map((m) => m.ref_id)).size;
  const no = `TR-${String(done + 1).padStart(4, '0')}`;
  const text = `${no} · ${name(from)} → ${name(to)}${note ? ` · ${String(note).slice(0, 120)}` : ''}`;
  const out = [];
  for (const l of want) {
    const it = items.find((i) => i.id === l.item_id);
    if (!it) throw new Error('Item not found');
    let left = round2(Number(l.qty));
    const pool = batchesAt(movements, from, l.item_id, today).filter((b) => !l.batch_no || b.batch_no === l.batch_no);
    const have = round2(pool.reduce((s, b) => s + b.qty, 0));
    if (have < left) throw new Error(`${it.name}: only ${have} at ${name(from)}${l.batch_no ? ` in batch ${l.batch_no}` : ''} (unexpired)`);
    for (const b of pool) {
      if (left <= 0) break;
      const q = Math.min(left, b.qty);
      left = round2(left - q);
      const m = { item_id: l.item_id, batch_no: b.batch_no, expiry: b.expiry, ref_type: 'transfer', ref_id, note: text };
      out.push({ ...m, branch_id: from, qty: -q }, { ...m, branch_id: to, qty: q });
    }
  }
  return { no, ref_id, moves: out };
}

// What a store should get back on the shelf: items at or below their low-stock alert, enough to reach twice the alert,
// from the location that has the most (warehouses first). from = a fixed source, or empty for the best one per item.
export function restockPlan({ to, from, movements, items, branches }) {
  const stock = stockAt(movements);
  const others = live(branches).filter((b) => b.id !== to && (!from || b.id === from))
    .sort((a, b) => (kindOf(a) === 'warehouse' ? 0 : 1) - (kindOf(b) === 'warehouse' ? 0 : 1));
  const co = branches.find((b) => b.id === to)?.company_id;
  return live(items).filter((i) => i.active !== false && Number(i.low_stock) > 0 && sellsIn(i, co)).flatMap((i) => {
    const here = round2(stock.get(key(to, i.id)) || 0);
    if (here > Number(i.low_stock)) return [];
    const need = round2(Number(i.low_stock) * 2 - here);
    const src = others.map((b) => ({ b, q: round2(stock.get(key(b.id, i.id)) || 0) })).filter((x) => x.q > 0)
      .sort((x, y) => (kindOf(x.b) === 'warehouse' ? 0 : 1) - (kindOf(y.b) === 'warehouse' ? 0 : 1) || y.q - x.q)[0];
    return [{ item_id: i.id, name: i.name, sku: i.sku || '', stock: here, low_stock: Number(i.low_stock), need,
      from: src?.b.id || null, from_name: src?.b.name || '', available: src?.q || 0, qty: src ? Math.min(need, src.q) : 0 }];
  }).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

// One row per location: what it holds, what's running low, and (stores) what it sold.
export function locationSummary(rows, today) {
  const items = new Map(live(rows('items')).map((i) => [i.id, i]));
  const stock = stockAt(rows('stock_movements'));
  const month = today.slice(0, 7);
  const inv = live(rows('invoices')).filter((i) => i.status !== 'cancelled');
  return live(rows('branches')).map((b) => {
    let units = 0, value = 0, low = 0, skus = 0;
    for (const [id, it] of items) {
      const q = stock.get(key(b.id, id)) || 0;
      if (q > 0) { units += q; value += q * (Number(it.purchase_price) || 0); skus++; }
      if (kindOf(b) === 'store' && Number(it.low_stock) > 0 && q <= Number(it.low_stock) && it.active !== false && sellsIn(it, b.company_id)) low++; // shelves only, and only what its company sells
    }
    const sales = inv.filter((i) => i.branch_id === b.id && i.type === 'sale');
    const sum = (xs) => round2(xs.reduce((s, i) => s + Number(i.total), 0));
    return { id: b.id, name: b.name, code: b.code, kind: kindOf(b), company_id: b.company_id || null, gstin: b.gstin || '', address: b.address || '', units: round2(units), value: round2(value), skus, low,
      sales_today: sum(sales.filter((i) => i.date === today)), sales_month: sum(sales.filter((i) => i.date.slice(0, 7) === month)),
      bills_month: sales.filter((i) => i.date.slice(0, 7) === month).length };
  });
}

// Item × location quantities (the "Stock by location" table).
export function stockMatrix(rows) {
  const stock = stockAt(rows('stock_movements'));
  const branches = live(rows('branches')).map((b) => ({ id: b.id, name: b.name, code: b.code, kind: kindOf(b) }));
  const list = live(rows('items')).filter((i) => i.active !== false).map((i) => {
    const qty = Object.fromEntries(branches.map((b) => [b.id, round2(stock.get(key(b.id, i.id)) || 0)]));
    return { item_id: i.id, name: i.name, sku: i.sku || '', low_stock: Number(i.low_stock) || 0, qty, total: round2(Object.values(qty).reduce((s, q) => s + q, 0)) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { branches, rows: list };
}

// Past transfers, newest first: one row per transfer with its lines.
export function transferList(rows) {
  const items = new Map(rows('items').map((i) => [i.id, i.name]));
  const branches = new Map(rows('branches').map((b) => [b.id, b.name]));
  const g = new Map();
  for (const m of live(rows('stock_movements')).filter((x) => x.ref_type === 'transfer')) {
    const k = m.ref_id || `${m.created_at?.slice(0, 19)}\0${m.item_id}`; // transfers made before transfer numbers: one row per item
    const t = g.get(k) || { id: k, at: m.created_at, note: m.note || '', from: '', to: '', units: 0, lines: new Map() };
    if (Number(m.qty) < 0) t.from = branches.get(m.branch_id) || '';
    else { t.to = branches.get(m.branch_id) || ''; t.units = round2(t.units + Number(m.qty)); t.lines.set(m.item_id, round2((t.lines.get(m.item_id) || 0) + Number(m.qty))); }
    g.set(k, t);
  }
  return [...g.values()].map((t) => ({ ...t, no: /^TR-\d+/.exec(t.note)?.[0] || '—', items: [...t.lines].map(([id, q]) => `${q} × ${items.get(id) || 'Removed item'}`).join(', '), lines: undefined }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// Sales by branch for a date range (Reports → Sales by Branch).
export function salesByBranch(rows, { from = '0000', to = '9999' } = {}) {
  const inv = live(rows('invoices')).filter((i) => i.status !== 'cancelled' && i.date >= from && i.date <= to);
  const co = new Map(live(rows('companies') || []).map((c) => [c.id, c.name]));
  return live(rows('branches')).map((b) => {
    const mine = inv.filter((i) => i.branch_id === b.id);
    const s = mine.filter((i) => i.type === 'sale'), r = mine.filter((i) => i.type === 'sale_return'), p = mine.filter((i) => i.type === 'purchase');
    const sum = (xs) => round2(xs.reduce((t, i) => t + Number(i.total), 0));
    return { company: co.get(b.company_id) || '', branch: b.name, kind: KINDS[kindOf(b)], bills: s.length, sales: sum(s), returns: sum(r), net_sales: round2(sum(s) - sum(r)),
      avg_bill: s.length ? round2(sum(s) / s.length) : 0, purchases: sum(p) };
  });
}

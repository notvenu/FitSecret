// /admin back end: the POS server's API re-implemented on top of Supabase, running in the browser. No SQLite.
// Same tables and sync RPCs as the POS: sync_pull keeps an in-memory copy of the data, every write is one atomic sync_push.
// Roles are enforced here and by Supabase RLS (staff only); a hostile staff account could still call the RPCs directly.
import { TABLES, columnsOf, calcInvoice, fyLabel, today, round2, STATES, ORDER_LABEL } from '@fitsecret/shared';
import { SEED_CATEGORIES, SEED_ITEMS } from '@fitsecret/shared/seed';
import { sb, me, UserError, loadMe, signOut, projectUrl } from './session.js';

export const CLOUD = true;

// ---------- in-memory replica ----------
const S = Object.fromEntries(Object.keys(TABLES).map((t) => [t, new Map()]));
const TS = Object.fromEntries(Object.keys(TABLES).map((t) => [t, Object.entries(columnsOf(t)).filter(([, ty]) => ty === 'ts').map(([c]) => c)]));
let cursor = 0, lastPull = 0, lastSync = null, syncError = null;
const live = (t) => [...S[t].values()].filter((r) => !r.deleted);
const get = (t, id) => (id ? S[t].get(id) : undefined);
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const byName = (a, b) => String(a.name).localeCompare(String(b.name));

const authErr = (e) => e?.status === 401 || e?.code === 'PGRST301' || /JWT/i.test(e?.message || '');
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) { syncError = error.message; throw new UserError(error.message, authErr(error) ? 401 : 500); }
  syncError = null;
  return data;
}

async function pull() {
  for (;;) {
    const d = await rpc('sync_pull', { p_since: cursor, p_limit: 1000 });
    for (const { t, r } of d.rows) {
      if (!S[t]) continue;
      for (const c of TS[t]) if (r[c]) r[c] = new Date(r[c]).toISOString(); // one format so string compare == time compare
      const old = S[t].get(r.id);
      if (!old || old.updated_at <= r.updated_at) S[t].set(r.id, r);
    }
    cursor = d.cursor;
    if (!d.more) break;
  }
  lastPull = Date.now(); lastSync = new Date().toISOString();
}
const refresh = (force) => (force || Date.now() - lastPull > 1500 ? pull() : undefined);

// One write = one sync_push (a single Postgres transaction). save() stages rows; on failure the local copy is rolled back.
let tx = null;
function save(t, patch) {
  if (!tx) throw new Error('save() outside write()');
  const old = S[t].get(patch.id), ts = new Date().toISOString();
  const merged = { ...old, ...patch, id: patch.id || crypto.randomUUID(), created_at: old?.created_at || ts, updated_at: ts, deleted: patch.deleted ?? old?.deleted ?? false };
  const row = Object.fromEntries(Object.keys(columnsOf(t)).map((c) => [c, merged[c] ?? null]));
  tx.undo.push([t, row.id, old]);
  tx.batch.set(t + ':' + row.id, { t, row }); // same row twice in one push is a Postgres error, so keep only the last
  S[t].set(row.id, row);
  return row;
}
async function write(fn) {
  const cur = (tx = { undo: [], batch: new Map() });
  try {
    const r = fn();
    if (cur.batch.size) {
      const p = {};
      for (const { t, row } of cur.batch.values()) (p[t] ??= []).push(row);
      await rpc('sync_push', { p });
    }
    return r;
  } catch (e) {
    for (const [t, id, old] of cur.undo.reverse()) (old ? S[t].set(id, old) : S[t].delete(id));
    throw e;
  } finally { tx = null; }
}

// ---------- stock ----------
function stockMap(branch) {
  const m = {};
  for (const r of live('stock_movements')) if (r.branch_id === branch) m[r.item_id] = (m[r.item_id] || 0) + r.qty;
  for (const k in m) m[k] = round2(m[k]);
  return m;
}
function batches(branch, item) {
  const g = new Map();
  for (const m of live('stock_movements')) {
    if (m.branch_id !== branch || m.item_id !== item) continue;
    const k = (m.batch_no || '') + '\0' + (m.expiry || ''), e = g.get(k) || { batch_no: m.batch_no, expiry: m.expiry, qty: 0 };
    e.qty += m.qty; g.set(k, e);
  }
  return [...g.values()].map((b) => ({ ...b, qty: Math.round(b.qty * 1000) / 1000 })).filter((b) => b.qty !== 0)
    .sort((a, b) => (a.expiry == null) - (b.expiry == null) || String(a.expiry).localeCompare(String(b.expiry)) || String(a.batch_no).localeCompare(String(b.batch_no)));
}
const move = (branch, m) => save('stock_movements', { branch_id: branch, ...m });

// ---------- invoices ----------
const TYPES = {
  sale: { sign: -1, pay: 'in', prefix: '' }, sale_return: { sign: 1, pay: 'out', prefix: 'CN' }, purchase: { sign: 1, pay: 'out', prefix: 'PB' },
  purchase_return: { sign: -1, pay: 'in', prefix: 'DN' }, estimate: { sign: 0, pay: null, prefix: 'EST' },
};

function nextNo(branch, type, date) {
  const prefix = `${get('branches', branch)?.code || 'FS'}${TYPES[type].prefix ? '-' + TYPES[type].prefix : ''}/${fyLabel(date)}/`;
  const last = Math.max(0, ...[...S.invoices.values()].filter((i) => i.branch_id === branch && i.type === type && i.no?.startsWith(prefix)).map((i) => parseInt(i.no.slice(prefix.length)) || 0));
  return prefix + String(last + 1).padStart(4, '0');
}

function createInvoice(branch, user, body) {
  const type = body.type || 'sale', T = TYPES[type];
  if (!T) throw new UserError('Bad invoice type');
  if (!Array.isArray(body.lines) || !body.lines.length) throw new UserError('Add at least one item');
  const br = get('branches', branch), party = body.party_id ? get('parties', body.party_id) : null;
  if (body.party_id && !party) throw new UserError('Party not found');
  if (type.startsWith('purchase') && !party) throw new UserError('Select a supplier');
  const inclusive = body.tax_inclusive ?? !type.startsWith('purchase');
  const interState = !!(party?.state_code && br?.state_code && party.state_code !== br.state_code);
  const date = body.date || today();

  const lines = body.lines.map((l) => {
    const item = get('items', l.item_id);
    if (!item) throw new UserError('Item not found');
    const qty = Number(l.qty), rate = Number(l.rate ?? (type.startsWith('purchase') ? item.purchase_price : item.sale_price));
    if (!(qty > 0) || !(rate >= 0)) throw new UserError(`Invalid qty/rate for ${item.name}`);
    return { item_id: item.id, name: item.name, hsn: item.hsn, batch_no: l.batch_no || null, expiry: l.expiry || null, qty, rate,
      mrp: item.mrp, discount_pct: Number(l.discount_pct) || 0, gst_rate: Number(l.gst_rate ?? item.gst_rate) || 0, cost: item.purchase_price || 0 };
  });
  const calc = calcInvoice(lines, { inclusive, interState });
  const payments = (body.payments || []).filter((p) => Number(p.amount) > 0);
  const paid = round2(Math.min(sum(payments, (p) => Number(p.amount)), calc.total)); // excess = change returned
  if (T.pay && paid < calc.total && !party) throw new UserError('Select a customer for credit / partial payment');

  const inv = save('invoices', {
    branch_id: branch, type, no: (type === 'purchase' && body.no) || nextNo(branch, type, date), date,
    party_id: party?.id || null, party_name: party?.name || body.party_name || 'Cash Sale', party_phone: party?.phone || body.party_phone || null,
    party_gstin: party?.gstin || null, party_state: party?.state_code || br?.state_code || null, tax_inclusive: inclusive,
    subtotal: calc.subtotal, discount: calc.discount, taxable: calc.taxable, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
    round_off: calc.round_off, total: calc.total, paid: T.pay ? paid : 0,
    status: !T.pay ? 'estimate' : paid >= calc.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    notes: body.notes || null, order_id: body.order_id || null, created_by: user?.name || null,
  });
  calc.lines.forEach((l, i) => {
    save('invoice_lines', { ...l, invoice_id: inv.id, sort: i });
    if (!T.sign || body.skip_stock) return;
    if (T.sign < 0 && !l.batch_no) {
      // FEFO: earliest-expiring batches first; any shortfall goes negative on the unbatched bucket.
      let left = l.qty;
      for (const b of batches(branch, l.item_id).filter((b) => b.qty > 0)) {
        const take = Math.min(left, b.qty);
        move(branch, { item_id: l.item_id, qty: -take, batch_no: b.batch_no, expiry: b.expiry, ref_type: type, ref_id: inv.id });
        if (!(left = round2(left - take))) break;
      }
      if (left > 0) move(branch, { item_id: l.item_id, qty: -left, ref_type: type, ref_id: inv.id });
    } else {
      move(branch, { item_id: l.item_id, qty: T.sign * l.qty, batch_no: l.batch_no, expiry: l.expiry, ref_type: type, ref_id: inv.id });
    }
    if (type === 'purchase') save('items', { id: l.item_id, purchase_price: inclusive ? round2(l.taxable / l.qty) : round2(l.rate * (1 - l.discount_pct / 100)) });
  });
  if (T.pay) {
    let remaining = calc.total;
    for (const p of payments) {
      const amt = round2(Math.min(Number(p.amount), remaining));
      if (amt <= 0) break;
      remaining = round2(remaining - amt);
      save('payments', { branch_id: branch, party_id: party?.id || null, invoice_id: inv.id, direction: T.pay, amount: amt, mode: p.mode || 'cash', date });
    }
  }
  return invoiceWithLines(inv.id);
}

function invoiceWithLines(id) {
  const inv = get('invoices', id);
  if (!inv) return null;
  return { ...inv, lines: live('invoice_lines').filter((l) => l.invoice_id === id).sort((a, b) => a.sort - b.sort), payments: live('payments').filter((p) => p.invoice_id === id) };
}

function cancelInvoice(id) {
  const inv = get('invoices', id);
  if (!inv) throw new UserError('Invoice not found');
  if (inv.status === 'cancelled') return invoiceWithLines(id);
  for (const m of live('stock_movements').filter((m) => m.ref_id === id)) save('stock_movements', { id: m.id, deleted: true });
  for (const p of live('payments').filter((p) => p.invoice_id === id)) save('payments', { id: p.id, deleted: true });
  save('invoices', { id, status: 'cancelled', paid: 0 });
  return invoiceWithLines(id);
}

function recordPayment(branch, body) {
  const amount = round2(body.amount);
  if (!(amount > 0)) throw new UserError('Enter an amount');
  if (!body.party_id || !get('parties', body.party_id)) throw new UserError('Select a party');
  if (!['in', 'out'].includes(body.direction)) throw new UserError('Bad direction');
  const p = save('payments', { branch_id: branch, party_id: body.party_id, invoice_id: body.invoice_id || null, direction: body.direction,
    amount, mode: body.mode || 'cash', date: body.date || today(), note: body.note || null });
  if (body.invoice_id) {
    const inv = get('invoices', body.invoice_id), paid = round2((inv.paid || 0) + amount);
    save('invoices', { id: inv.id, paid, status: paid >= inv.total ? 'paid' : 'partial' });
  }
  return p;
}

function adjustStock(branch, { item_id, qty, batch_no, expiry, note }) {
  qty = Number(qty);
  if (!get('items', item_id)) throw new UserError('Item not found');
  if (!qty) throw new UserError('Quantity cannot be zero');
  move(branch, { item_id, qty, batch_no: batch_no || null, expiry: expiry || null, ref_type: 'adjust', note: note || null });
}

// ---------- online orders ----------
function updateOrder(id, { status, courier, awb, tracking_url, note }, user) {
  const o = get('orders', id);
  if (!o) throw new UserError('Order not found');
  if (status === 'cancelled' && o.status !== 'cancelled') {
    for (const l of live('order_lines').filter((l) => l.order_id === id)) move(o.branch_id, { item_id: l.item_id, qty: l.qty, ref_type: 'order_cancel', ref_id: id, note: o.order_no });
  }
  const patch = { id };
  if (courier !== undefined) patch.courier = courier;
  if (awb !== undefined) patch.awb = awb;
  if (tracking_url !== undefined) patch.tracking_url = tracking_url;
  if (status) {
    patch.status = status;
    if (status === 'delivered' && o.payment_method === 'cod') patch.payment_status = 'paid';
  }
  save('orders', patch);
  if (status && status !== o.status) save('order_events', { order_id: id, status, note: note || (user ? `by ${user.name}` : null) });
}

// Online customer -> party (matched by phone) so online sales show in ledgers, dues and GST place-of-supply.
function customerForOrder(o) {
  const phone = String(o.phone || '').replace(/\D/g, '').slice(-10);
  const found = phone && live('parties').find((p) => p.type === 'customer' && String(p.phone || '').replace(/[ +]/g, '').slice(-10) === phone);
  if (found) return found.id;
  const a = o.address || {};
  const state = Object.entries(STATES).find(([, n]) => n.toLowerCase() === String(a.state || '').toLowerCase())?.[0] || '37';
  return save('parties', { type: 'customer', name: o.name || 'Online customer', phone, email: o.email || null, state_code: state, opening_balance: 0,
    address: [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ') }).id;
}

// GST invoice for an online order (stock was already reserved when the order was placed).
function invoiceFromOrder(branch, user, id) {
  const o = get('orders', id);
  if (!o) throw new UserError('Order not found');
  if (o.invoice_id && get('invoices', o.invoice_id)) return invoiceWithLines(o.invoice_id);
  if (['pending_payment', 'cancelled'].includes(o.status)) throw new UserError('Order is not confirmed yet');
  const lines = live('order_lines').filter((l) => l.order_id === id).map((l) => ({ item_id: l.item_id, qty: l.qty, rate: l.price }));
  if (!lines.length) throw new UserError('Order has no items yet');
  const inv = createInvoice(o.branch_id || branch, user || { name: 'Website' }, {
    type: 'sale', lines, party_id: customerForOrder(o), order_id: o.id, skip_stock: true, date: new Date(o.created_at).toLocaleDateString('en-CA'),
    payments: o.payment_status === 'paid' ? [{ mode: o.payment_method === 'online' ? 'online' : 'cod', amount: Infinity }] : [], // COD stays due until delivered
    notes: `Online order ${o.order_no}${o.shipping ? ` · shipping ₹${o.shipping} collected separately` : ''}`,
  });
  save('orders', { id, invoice_id: inv.id });
  return inv;
}

// Keeps an order's invoice in step with the order: invoice once placed, collect COD on delivery, cancel with the order.
function syncOrderInvoice(branch, id) {
  const o = get('orders', id);
  if (!o || o.deleted) return;
  const inv = o.invoice_id ? get('invoices', o.invoice_id) : null;
  if (o.status === 'cancelled') { if (inv && inv.status !== 'cancelled') cancelInvoice(inv.id); return; }
  if (o.status === 'pending_payment') return;
  const current = inv || invoiceFromOrder(branch, null, id), due = round2(current.total - (current.paid || 0));
  if (due > 0 && (o.payment_status === 'paid' || o.status === 'delivered')) {
    recordPayment(o.branch_id || branch, { party_id: current.party_id, invoice_id: current.id, direction: 'in', amount: due,
      mode: o.payment_method === 'online' ? 'online' : 'cod', date: today(), note: `Order ${o.order_no}` });
  }
}

// ---------- reports (same numbers as apps/pos/server/reports.js) ----------
const ago = (days) => new Date(Date.now() - days * 864e5).toLocaleDateString('en-CA');
const liveInv = () => live('invoices').filter((i) => i.status !== 'cancelled' && i.status !== 'estimate');
const group = (rows, key) => { const m = new Map(); for (const r of rows) { const k = key(r); (m.get(k) || m.set(k, []).get(k)).push(r); } return m; };
const r2sum = (rows, f) => round2(sum(rows, f));

function partyBalances() {
  const add = new Map(), sign = { sale: 1, purchase_return: 1, sale_return: -1, purchase: -1 };
  const bump = (id, v) => id && add.set(id, (add.get(id) || 0) + v);
  for (const i of liveInv()) bump(i.party_id, (sign[i.type] || 0) * i.total);
  for (const y of live('payments')) bump(y.party_id, y.direction === 'in' ? -y.amount : y.amount);
  return live('parties').sort(byName).map((p) => ({ id: p.id, name: p.name, type: p.type, phone: p.phone, balance: round2((p.opening_balance || 0) + (add.get(p.id) || 0)) }));
}

function expiry(branch, days = 60) {
  const until = new Date(Date.now() + days * 864e5).toLocaleDateString('en-CA');
  const g = group(live('stock_movements').filter((m) => m.branch_id === branch && m.expiry), (m) => `${m.item_id}\0${m.batch_no}\0${m.expiry}`);
  return [...g.values()].map((ms) => ({ item_id: ms[0].item_id, name: get('items', ms[0].item_id)?.name, batch_no: ms[0].batch_no, expiry: ms[0].expiry, qty: Math.round(sum(ms, (m) => m.qty) * 1000) / 1000 }))
    .filter((b) => b.qty > 0 && b.expiry <= until && b.name).sort((a, b) => a.expiry.localeCompare(b.expiry));
}

function pnl(branch, { from, to }) {
  const inv = liveInv().filter((i) => i.branch_id === branch && i.date >= from && i.date <= to);
  const lines = (type) => { const ids = new Set(inv.filter((i) => i.type === type).map((i) => i.id)); return live('invoice_lines').filter((l) => ids.has(l.invoice_id)); };
  const s = (type) => { const l = lines(type); return { rev: r2sum(l, (x) => x.taxable), cogs: r2sum(l, (x) => x.cost * x.qty) }; };
  const sale = s('sale'), ret = s('sale_return');
  const exp = [...group(live('expenses').filter((e) => e.branch_id === branch && e.date >= from && e.date <= to), (e) => e.category).entries()]
    .map(([category, es]) => ({ category, amount: r2sum(es, (e) => e.amount) }));
  const revenue = round2(sale.rev - ret.rev), cogs = round2(sale.cogs - ret.cogs), expenses = round2(sum(exp, (e) => e.amount));
  return { revenue, cogs, gross: round2(revenue - cogs), expenses, expense_breakup: exp, net: round2(revenue - cogs - expenses) };
}

function dashboard(branch) {
  const d = today(), month = d.slice(0, 7);
  const lastMonth = new Date(new Date(d).getFullYear(), new Date(d).getMonth() - 1, 15).toLocaleDateString('en-CA').slice(0, 7);
  const sales = liveInv().filter((i) => i.branch_id === branch && i.type === 'sale');
  const split = (f) => {
    const a = sales.filter(f), on = a.filter((i) => i.order_id), off = a.filter((i) => !i.order_id);
    return { t: r2sum(a, (i) => i.total), n: a.length, counter: r2sum(off, (i) => i.total), counter_n: off.length, online: r2sum(on, (i) => i.total), online_n: on.length };
  };
  const bal = partyBalances(), stock = stockMap(branch), items = live('items');
  const monthPnl = pnl(branch, { from: month + '-01', to: month + '-31' });
  const todays = split((i) => i.date === d), monthS = split((i) => i.date.slice(0, 7) === month), lastS = split((i) => i.date.slice(0, 7) === lastMonth);
  const q = (i) => stock[i.id] || 0;
  const purch = liveInv().filter((i) => i.branch_id === branch && i.type === 'purchase' && i.date.slice(0, 7) === month);
  const ist = (o) => new Date(new Date(o.created_at).getTime() + 330 * 60000).toISOString().slice(0, 10);
  const orders = live('orders').filter((o) => o.branch_id === branch);
  const todayOrders = orders.filter((o) => o.status !== 'cancelled' && ist(o) === d);
  const lineRows = (since) => {
    const ids = new Map(sales.filter((i) => i.date >= since).map((i) => [i.id, i]));
    return live('invoice_lines').filter((l) => ids.has(l.invoice_id));
  };
  const l30 = lineRows(ago(30));
  const catName = (l) => { const c = get('categories', get('items', l.item_id)?.category_id), pc = get('categories', c?.parent_id); return pc?.name ?? c?.name ?? 'Other'; };
  const top = (rows, key, label) => [...group(rows, key).values()].map((ls) => ({ name: label(ls[0]), qty: sum(ls, (l) => l.qty), total: r2sum(ls, (l) => l.total) }))
    .sort((a, b) => b.total - a.total).slice(0, 6);
  const exp = expiry(branch, 60);

  return {
    today: { ...todays, avg: todays.n ? round2(todays.t / todays.n) : 0 }, month: monthS, last_month: lastS.t,
    growth: lastS.t ? round2(((monthS.t - lastS.t) / lastS.t) * 100) : null,
    gross_profit_month: monthPnl.gross, net_profit_month: monthPnl.net,
    purchases_month: { t: r2sum(purch, (i) => i.total), n: purch.length },
    expenses_month: r2sum(live('expenses').filter((e) => e.branch_id === branch && e.date.slice(0, 7) === month), (e) => e.amount),
    receivable: round2(sum(bal.filter((b) => b.balance > 0), (b) => b.balance)),
    payable: round2(-sum(bal.filter((b) => b.balance < 0), (b) => b.balance)),
    top_dues: bal.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5),
    stock_value: round2(sum(items, (i) => Math.max(0, q(i)) * (i.purchase_price || 0))),
    stock_retail: round2(sum(items, (i) => Math.max(0, q(i)) * (i.sale_price || 0))),
    stock_units: round2(sum(items, (i) => Math.max(0, q(i)))),
    missing_cost: items.filter((i) => !(i.purchase_price > 0)).length, // profit / stock-at-cost are understated until purchases are entered
    out_of_stock: items.filter((i) => q(i) <= 0).length,
    low_stock: items.filter((i) => q(i) > 0 && q(i) <= (i.low_stock || 0)).length,
    low_list: items.filter((i) => q(i) <= (i.low_stock || 0)).sort((a, b) => q(a) - q(b)).slice(0, 6).map((i) => ({ id: i.id, name: i.name, qty: q(i) })),
    expiring: exp.length, expiring_list: exp.slice(0, 6),
    orders: Object.fromEntries([...group(orders, (o) => o.status)].map(([s, os]) => [s, os.length])),
    orders_today: { n: todayOrders.length, t: r2sum(todayOrders, (o) => o.total) },
    payments_today: [...group(live('payments').filter((y) => y.branch_id === branch && y.date === d), (y) => y.mode)]
      .map(([mode, ys]) => ({ mode, net: r2sum(ys, (y) => (y.direction === 'in' ? y.amount : -y.amount)), n: ys.length })).sort((a, b) => b.net - a.net),
    series: [...group(sales.filter((i) => i.date >= ago(29)), (i) => i.date)].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, is]) => ({ date, counter: r2sum(is.filter((i) => !i.order_id), (i) => i.total), online: r2sum(is.filter((i) => i.order_id), (i) => i.total) })),
    top: top(l30, (l) => l.item_id, (l) => l.name),
    top_categories: top(l30, catName, catName),
    recent: live('invoices').filter((i) => i.branch_id === branch && i.type === 'sale').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)
      .map((i) => ({ id: i.id, no: i.no, date: i.date, party_name: i.party_name, total: i.total, paid: i.paid, status: i.status, online: i.order_id != null })),
  };
}

function register(branch, { type = 'sale', from, to, q }) {
  const n = String(q || '').toLowerCase();
  return live('invoices').filter((i) => i.branch_id === branch && i.type === type && i.date >= (from || '0000') && i.date <= (to || '9999')
    && (!n || [i.no, i.party_name, i.party_phone].some((v) => String(v ?? '').toLowerCase().includes(n))))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 500)
    .map((i) => ({ id: i.id, no: i.no, date: i.date, type: i.type, party_name: i.party_name, party_phone: i.party_phone, total: i.total, paid: i.paid, status: i.status, online: i.order_id != null }));
}

function daybook(branch, date) {
  const pay = live('payments').filter((y) => y.branch_id === branch && y.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    invoices: live('invoices').filter((i) => i.branch_id === branch && i.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((i) => ({ no: i.no, type: i.type, party_name: i.party_name, total: i.total, paid: i.paid, status: i.status })),
    payments: pay.map((y) => ({ direction: y.direction, amount: y.amount, mode: y.mode, note: y.note, party: get('parties', y.party_id)?.name, invoice_no: get('invoices', y.invoice_id)?.no })),
    expenses: live('expenses').filter((e) => e.branch_id === branch && e.date === date).map((e) => ({ category: e.category, amount: e.amount, mode: e.mode, note: e.note })),
    cash: [...group(pay, (y) => y.mode)].map(([mode, ys]) => ({ mode, net: r2sum(ys, (y) => (y.direction === 'in' ? y.amount : -y.amount)) })),
  };
}

// GSTR-1 style summary: B2B invoices, B2C by rate, HSN summary, credit notes, plus input tax from purchases.
function gst(branch, { from, to }) {
  const inv = live('invoices').filter((i) => i.branch_id === branch && i.status !== 'cancelled' && i.date >= from && i.date <= to);
  const ofType = (...ts) => inv.filter((i) => ts.includes(i.type));
  const linesOf = (is) => { const m = new Map(is.map((i) => [i.id, i])); return live('invoice_lines').filter((l) => m.has(l.invoice_id)).map((l) => ({ l, i: m.get(l.invoice_id) })); };
  const pick = (i) => ({ no: i.no, date: i.date, party_name: i.party_name, taxable: i.taxable, cgst: i.cgst, sgst: i.sgst, igst: i.igst, total: i.total });
  const byDate = (a, b) => a.date.localeCompare(b.date);
  return {
    b2b: ofType('sale').filter((i) => i.party_gstin).sort(byDate).map((i) => ({ ...pick(i), party_gstin: i.party_gstin, party_state: i.party_state })),
    b2c: [...group(linesOf(ofType('sale').filter((i) => !i.party_gstin)), ({ l }) => l.gst_rate)]
      .map(([rate, x]) => ({ rate, taxable: r2sum(x, ({ l }) => l.taxable), tax: r2sum(x, ({ l }) => l.tax) })).sort((a, b) => a.rate - b.rate),
    hsn: [...group(linesOf(ofType('sale', 'sale_return')), ({ l }) => `${l.hsn}|${l.gst_rate}`).values()].map((x) => {
      const sg = ({ i }) => (i.type === 'sale' ? 1 : -1);
      return { hsn: x[0].l.hsn, rate: x[0].l.gst_rate, qty: sum(x, (e) => sg(e) * e.l.qty), taxable: r2sum(x, (e) => sg(e) * e.l.taxable), tax: r2sum(x, (e) => sg(e) * e.l.tax) };
    }).sort((a, b) => String(a.hsn).localeCompare(String(b.hsn))),
    credit_notes: ofType('sale_return').sort(byDate).map(pick),
    totals: [...group(ofType('sale', 'sale_return', 'purchase', 'purchase_return'), (i) => i.type)]
      .map(([type, is]) => ({ type, taxable: r2sum(is, (i) => i.taxable), cgst: r2sum(is, (i) => i.cgst), sgst: r2sum(is, (i) => i.sgst), igst: r2sum(is, (i) => i.igst) })),
  };
}

function stockSummary(branch) {
  const stock = stockMap(branch);
  return live('items').sort(byName).map((i) => ({ id: i.id, name: i.name, sku: i.sku, brand: i.brand, mrp: i.mrp, sale_price: i.sale_price, purchase_price: i.purchase_price,
    low_stock: i.low_stock, category: get('categories', i.category_id)?.name, qty: stock[i.id] || 0, value: round2((stock[i.id] || 0) * (i.purchase_price || 0)) }));
}

function ledger(party_id) {
  const p = get('parties', party_id);
  if (!p) return null;
  const rows = [
    ...liveInv().filter((i) => i.party_id === party_id).map((i) => ({ date: i.date, created_at: i.created_at, ref: i.no, type: i.type, amt: ['sale', 'purchase_return'].includes(i.type) ? i.total : -i.total })),
    ...live('payments').filter((y) => y.party_id === party_id).map((y) => ({ date: y.date, created_at: y.created_at, ref: y.mode, type: 'payment_' + y.direction, amt: y.direction === 'in' ? -y.amount : y.amount })),
  ].sort((a, b) => (a.date + a.created_at).localeCompare(b.date + b.created_at));
  let bal = p.opening_balance || 0;
  return { party: p, opening: bal, rows: rows.map((r) => ({ ...r, balance: (bal = round2(bal + r.amt)) })) };
}

// ---------- router ----------
const ROUTES = [];
// role: 'open' = no login, null = any staff, 'admin' = admins only
const R = (method, pattern, role, fn) => ROUTES.push({ method, role, fn, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') });
const branchId = () => {
  const bs = live('branches').sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (me?.branch_id && S.branches.get(me.branch_id)?.id) || bs[0]?.id;
};
const status = () => ({ state: syncError ? 'error' : 'online', pending: 0, lastSync, error: syncError, configured: true, url: projectUrl, email: me?.email });
const WRITABLE = { categories: 'admin', items: 'admin', parties: null, expenses: null, branches: 'admin' };
const NAMED = ['categories', 'items', 'parties', 'branches'];

R('GET', '/bootstrap', 'open', async () => {
  if (!(await loadMe())) return { setup: false, branch: null, user: null, users: [], branches: [], sync: status() };
  await refresh(true);
  const branches = live('branches');
  return { setup: !branches.length, branch: get('branches', branchId()) || null, user: me, users: [], branches, sync: status() };
});
R('POST', '/logout', 'open', async () => { await signOut(); for (const m of Object.values(S)) m.clear(); cursor = 0; return { ok: true }; });

R('POST', '/setup', null, ({ body }) => write(() => {
  if (live('branches').length) throw new UserError('Already set up');
  const { branch: b = {}, catalog, demoStock } = body;
  if (!b.name || !/^[A-Z0-9]{2,5}$/.test(b.code || '')) throw new UserError('Branch name and 2-5 letter code required');
  const saved = save('branches', { state_code: '37', ...b });
  if (catalog) {
    for (const c of SEED_CATEGORIES) save('categories', c);
    const exp = new Date(Date.now() + 400 * 864e5).toLocaleDateString('en-CA');
    SEED_ITEMS.forEach((it, i) => {
      save('items', it);
      if (demoStock) save('stock_movements', { branch_id: saved.id, item_id: it.id, qty: 6 + ((i * 7) % 20), batch_no: 'B' + (100 + i), expiry: exp, ref_type: 'opening' });
    });
  }
  return { ok: true };
}));

R('GET', '/items', null, ({ branch }) => {
  const stock = stockMap(branch);
  return live('items').sort(byName).map((i) => ({ ...i, category: get('categories', i.category_id)?.name ?? null, stock: stock[i.id] || 0 }));
});
R('GET', '/items/:id/batches', null, ({ params, branch }) => batches(branch, params.id));
R('GET', '/items/:id/movements', null, ({ params, branch }) =>
  live('stock_movements').filter((m) => m.item_id === params.id && m.branch_id === branch).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200)
    .map((m) => ({ ...m, invoice_no: get('invoices', m.ref_id)?.no ?? null })));
R('POST', '/stock/adjust', 'admin', ({ body, branch }) => write(() => { adjustStock(branch, body); return { ok: true }; }));

R('GET', '/parties', null, () => {
  const bal = Object.fromEntries(partyBalances().map((b) => [b.id, b.balance]));
  return live('parties').sort(byName).map((p) => ({ ...p, balance: bal[p.id] || 0 }));
});
R('GET', '/parties/:id/ledger', null, ({ params }) => ledger(params.id));

R('GET', '/t/:table', null, ({ params: { table: t }, branch }) => {
  if (!TABLES[t]) throw new UserError('Unknown table');
  const scoped = 'branch_id' in TABLES[t] && t !== 'orders';
  return live(t).filter((r) => !scoped || r.branch_id === branch).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 1000);
});
R('POST', '/t/:table', null, ({ params: { table: t }, body, branch, user }) => {
  if (!(t in WRITABLE)) throw new UserError('Unknown table', 404);
  if (WRITABLE[t] === 'admin' && user.role !== 'admin') throw new UserError('Admin only', 403);
  return write(() => {
    if (t === 'items' && body.barcode && live('items').some((i) => i.barcode === body.barcode && i.id !== body.id)) {
      throw new UserError(`Barcode already used by ${live('items').find((i) => i.barcode === body.barcode && i.id !== body.id).name}`);
    }
    const isNew = !body.id || !get(t, body.id);
    if ('branch_id' in TABLES[t] && !body.branch_id && isNew) body.branch_id = branch;
    if (t === 'expenses' && !(Number(body.amount) > 0)) throw new UserError('Enter an amount');
    if (t === 'expenses') body.date ||= today();
    if (NAMED.includes(t) && ((isNew && !body.name) || (body.name !== undefined && !String(body.name).trim()))) throw new UserError('Name required');
    return save(t, body);
  });
});
R('DELETE', '/t/:table/:id', 'admin', ({ params: { table: t, id } }) => {
  if (!(t in WRITABLE)) throw new UserError('Unknown table', 404);
  return write(() => save(t, { id, deleted: true }));
});

R('POST', '/invoices', null, ({ body, branch, user }) => write(() => createInvoice(branch, user, body)));
R('GET', '/invoices', null, ({ query, branch }) => register(branch, query));
R('GET', '/invoices/:id', null, ({ params }) => invoiceWithLines(params.id) || Promise.reject(new UserError('Not found', 404)));
R('POST', '/invoices/:id/cancel', 'admin', ({ params }) => write(() => cancelInvoice(params.id)));
R('POST', '/payments', null, ({ body, branch }) => write(() => recordPayment(branch, body)));

R('GET', '/orders', null, ({ query }) =>
  live('orders').filter((o) => !query.status || o.status === query.status).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300)
    .map((o) => ({ ...o, lines: live('order_lines').filter((l) => l.order_id === o.id),
      events: live('order_events').filter((e) => e.order_id === o.id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(({ status, note, created_at }) => ({ status, note, created_at })) })));
R('POST', '/orders/:id', null, ({ params, body, branch, user }) => {
  if (body.status && !ORDER_LABEL[body.status]) throw new UserError('Bad status');
  return write(() => { updateOrder(params.id, body, user); syncOrderInvoice(branch, params.id); return get('orders', params.id); }); // invoice / COD payment / cancellation follow the order
});
R('POST', '/orders/:id/invoice', null, ({ params, branch, user }) => write(() => invoiceFromOrder(branch, user, params.id)));

R('GET', '/reports/dashboard', null, ({ branch }) => dashboard(branch));
R('GET', '/reports/daybook', null, ({ query, branch }) => daybook(branch, query.date || today()));
R('GET', '/reports/gst', 'admin', ({ query, branch }) => gst(branch, query));
R('GET', '/reports/stock', null, ({ branch }) => stockSummary(branch));
R('GET', '/reports/expiry', null, ({ query, branch }) => expiry(branch, Number(query.days) || 60));
R('GET', '/reports/pnl', 'admin', ({ query, branch }) => pnl(branch, query));

// Staff, PINs, device sync and backups belong to the offline POS; here Supabase Auth and the cloud itself replace them.
R('GET', '/users', 'admin', () => []);
R('GET', '/sync', null, () => status());
R('POST', '/sync/now', null, async () => { await refresh(true); return status(); });

export function call(path, body, method) {
  method ||= body ? 'POST' : 'GET';
  const [p, qs] = path.split('?');
  const hit = ROUTES.find((r) => r.method === method && r.re.test(p));
  if (!hit) return Promise.reject(new UserError('Not found: ' + path, 404));
  const run = async () => {
    if (hit.role !== 'open') {
      if (!(await loadMe())) throw new UserError('Login required', 401);
      if (hit.role === 'admin' && me.role !== 'admin') throw new UserError('Admin only', 403);
      await refresh(method !== 'GET');
    }
    return hit.fn({ params: p.match(hit.re).groups || {}, query: Object.fromEntries(new URLSearchParams(qs)), body: body || {}, user: me, branch: branchId() });
  };
  const res = queue.then(run);
  queue = res.catch(() => {}); // one call at a time: write() uses a single staging area
  return res;
}
let queue = Promise.resolve();

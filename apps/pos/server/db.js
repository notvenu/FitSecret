// Local offline-first store. SQLite is the source of truth for this branch; sync.js mirrors it to Supabase.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { TABLES, columnsOf, toLocal, toWire, calcInvoice, fyLabel, today, round2, STATES } from '@fitsecret/shared';

const SQL_TYPE = { uuid: 'text', text: 'text', int: 'integer', num: 'real', bool: 'integer', json: 'text', ts: 'text', date: 'text' };
export const now = () => new Date().toISOString();
export class UserError extends Error {}

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;
    create table if not exists meta (k text primary key, v text);
    create table if not exists outbox (id integer primary key autoincrement, tbl text not null, row_id text not null);
    create table if not exists users (id text primary key, name text not null, pin text not null, role text not null, active integer default 1);`);
  for (const t of Object.keys(TABLES)) {
    const cols = columnsOf(t);
    db.exec(`create table if not exists ${t} (${Object.entries(cols)
      .map(([c, ty]) => (c === 'id' ? 'id text primary key' : `${c} ${SQL_TYPE[ty]}`)).join(', ')})`);
    const have = new Set(db.prepare(`pragma table_info(${t})`).all().map((r) => r.name));
    for (const [c, ty] of Object.entries(cols)) if (!have.has(c)) db.exec(`alter table ${t} add column ${c} ${SQL_TYPE[ty]}`);
    // Every local write lands in the outbox unless we're applying rows pulled from the cloud.
    for (const ev of ['insert', 'update'])
      db.exec(`create trigger if not exists ${t}_${ev}_outbox after ${ev} on ${t}
        when (select v from meta where k = 'applying') is null
        begin insert into outbox (tbl, row_id) values ('${t}', new.id); end`);
  }
  db.exec(`create index if not exists sm_item on stock_movements (item_id, branch_id);
    create index if not exists inv_date on invoices (branch_id, date);
    create index if not exists il_inv on invoice_lines (invoice_id);
    create index if not exists pay_party on payments (party_id);
    create index if not exists items_barcode on items (barcode);
    create index if not exists ol_order on order_lines (order_id);`);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const getMeta = (db, k) => db.prepare('select v from meta where k = ?').get(k)?.v ?? null;
export const setMeta = (db, k, v) =>
  v == null ? db.prepare('delete from meta where k = ?').run(k) : db.prepare('insert into meta (k, v) values (?, ?) on conflict (k) do update set v = excluded.v').run(k, String(v));

export const get = (db, t, id) => (id ? db.prepare(`select * from ${t} where id = ?`).get(id) : undefined);
export const getWire = (db, t, id) => { const r = get(db, t, id); return r && toWire(t, r); };

// Insert or merge-update one row of a synced table. `patch` is wire-format (bools/objects).
export function save(db, t, patch) {
  if (!TABLES[t]) throw new UserError('Unknown table ' + t);
  const existing = patch.id ? get(db, t, patch.id) : undefined;
  const ts = now();
  const row = toLocal(t, {
    ...(existing ? toWire(t, existing) : {}), ...patch,
    id: patch.id || randomUUID(), created_at: existing?.created_at || ts, updated_at: ts,
    deleted: patch.deleted ?? (existing ? !!existing.deleted : false),
  });
  const cols = Object.keys(row);
  db.prepare(`insert into ${t} (${cols.join(',')}) values (${cols.map((c) => ':' + c).join(',')})
    on conflict (id) do update set ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(',')}`).run(row);
  return toWire(t, row);
}

// Apply rows pulled from the cloud: last-write-wins, never re-queued to the outbox.
export function applyRemote(db, rows) {
  tx(db, () => {
    setMeta(db, 'applying', 1);
    const stmts = {};
    for (const { t, r } of rows) {
      if (!TABLES[t]) continue;
      const row = toLocal(t, r), cols = Object.keys(row);
      stmts[t] ??= db.prepare(`insert into ${t} (${cols.join(',')}) values (${cols.map((c) => ':' + c).join(',')})
        on conflict (id) do update set ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(',')}
        where excluded.updated_at >= ${t}.updated_at`);
      stmts[t].run(row);
    }
    setMeta(db, 'applying', null);
  });
}

// ---------- Users ----------
const hashPin = (pin, salt = randomBytes(16).toString('hex')) => salt + ':' + scryptSync(String(pin), salt, 32).toString('hex');
export function checkPin(stored, pin) {
  const [salt, h] = stored.split(':');
  return timingSafeEqual(Buffer.from(h, 'hex'), scryptSync(String(pin), salt, 32));
}
export function saveUser(db, { id, name, pin, role = 'cashier', active = 1 }) {
  if (!name) throw new UserError('Name required');
  if (pin != null && !/^\d{4,6}$/.test(String(pin))) throw new UserError('PIN must be 4-6 digits');
  if (!id && pin == null) throw new UserError('PIN required');
  if (!['admin', 'cashier'].includes(role)) throw new UserError('Bad role');
  if (id) {
    db.prepare('update users set name = ?, role = ?, active = ? where id = ?').run(name, role, active ? 1 : 0, id);
    if (pin != null) db.prepare('update users set pin = ? where id = ?').run(hashPin(pin), id);
    return id;
  }
  id = randomUUID();
  db.prepare('insert into users (id, name, pin, role) values (?, ?, ?, ?)').run(id, name, hashPin(pin), role);
  return id;
}

// ---------- Stock ----------
export function stockMap(db, branch) {
  return Object.fromEntries(db.prepare('select item_id, sum(qty) q from stock_movements where branch_id = ? and deleted = 0 group by item_id')
    .all(branch).map((r) => [r.item_id, round2(r.q)]));
}
export function batches(db, branch, item) {
  return db.prepare(`select batch_no, expiry, round(sum(qty), 3) qty from stock_movements
    where branch_id = ? and item_id = ? and deleted = 0 group by coalesce(batch_no, ''), coalesce(expiry, '')
    having sum(qty) <> 0 order by expiry is null, expiry, batch_no`).all(branch, item);
}
function move(db, branch, m) {
  save(db, 'stock_movements', { branch_id: branch, ...m });
}

// ---------- Invoices ----------
const TYPES = {
  sale: { sign: -1, pay: 'in', prefix: '' },
  sale_return: { sign: 1, pay: 'out', prefix: 'CN' },
  purchase: { sign: 1, pay: 'out', prefix: 'PB' },
  purchase_return: { sign: -1, pay: 'in', prefix: 'DN' },
  estimate: { sign: 0, pay: null, prefix: 'EST' },
};

function nextNo(db, branch, type, date) {
  const code = get(db, 'branches', branch)?.code || 'FS';
  const prefix = `${code}${TYPES[type].prefix ? '-' + TYPES[type].prefix : ''}/${fyLabel(date)}/`;
  const last = db.prepare(`select max(cast(substr(no, ?) as integer)) n from invoices where branch_id = ? and type = ? and no like ? || '%'`)
    .get(prefix.length + 1, branch, type, prefix)?.n || 0;
  return prefix + String(last + 1).padStart(4, '0');
}

export function createInvoice(db, branch, user, body) {
  const type = body.type || 'sale';
  const T = TYPES[type];
  if (!T) throw new UserError('Bad invoice type');
  if (!Array.isArray(body.lines) || !body.lines.length) throw new UserError('Add at least one item');
  const br = get(db, 'branches', branch);
  const party = body.party_id ? get(db, 'parties', body.party_id) : null;
  if (body.party_id && !party) throw new UserError('Party not found');
  if (type.startsWith('purchase') && !party) throw new UserError('Select a supplier');
  const inclusive = body.tax_inclusive ?? !type.startsWith('purchase');
  const interState = !!(party?.state_code && br?.state_code && party.state_code !== br.state_code);
  const date = body.date || today();

  const lines = body.lines.map((l) => {
    const item = get(db, 'items', l.item_id);
    if (!item) throw new UserError('Item not found');
    const qty = Number(l.qty), rate = Number(l.rate ?? (type.startsWith('purchase') ? item.purchase_price : item.sale_price));
    if (!(qty > 0) || !(rate >= 0)) throw new UserError(`Invalid qty/rate for ${item.name}`);
    return {
      item_id: item.id, name: item.name, hsn: item.hsn, batch_no: l.batch_no || null, expiry: l.expiry || null, qty, rate,
      mrp: item.mrp, discount_pct: Number(l.discount_pct) || 0, gst_rate: Number(l.gst_rate ?? item.gst_rate) || 0, cost: item.purchase_price || 0,
    };
  });
  const calc = calcInvoice(lines, { inclusive, interState });
  const payments = (body.payments || []).filter((p) => Number(p.amount) > 0);
  const paid = round2(Math.min(payments.reduce((s, p) => s + Number(p.amount), 0), calc.total)); // excess = change returned
  if (T.pay && paid < calc.total && !party) throw new UserError('Select a customer for credit / partial payment');

  return tx(db, () => {
    const inv = save(db, 'invoices', {
      branch_id: branch, type, no: (type === 'purchase' && body.no) || nextNo(db, branch, type, date), date,
      party_id: party?.id || null, party_name: party?.name || body.party_name || 'Cash Sale', party_phone: party?.phone || body.party_phone || null,
      party_gstin: party?.gstin || null, party_state: party?.state_code || br?.state_code || null, tax_inclusive: inclusive,
      subtotal: calc.subtotal, discount: calc.discount, taxable: calc.taxable, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
      round_off: calc.round_off, total: calc.total, paid: T.pay ? paid : 0,
      status: !T.pay ? 'estimate' : paid >= calc.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      notes: body.notes || null, order_id: body.order_id || null, created_by: user?.name || null,
    });
    calc.lines.forEach((l, i) => {
      save(db, 'invoice_lines', { ...l, invoice_id: inv.id, sort: i });
      if (!T.sign || body.skip_stock) return;
      if (T.sign < 0 && !l.batch_no) {
        // FEFO: sell earliest-expiring batches first; any shortfall goes negative on the unbatched bucket.
        let left = l.qty;
        for (const b of batches(db, branch, l.item_id).filter((b) => b.qty > 0)) {
          const take = Math.min(left, b.qty);
          move(db, branch, { item_id: l.item_id, qty: -take, batch_no: b.batch_no, expiry: b.expiry, ref_type: type, ref_id: inv.id });
          if (!(left = round2(left - take))) break;
        }
        if (left > 0) move(db, branch, { item_id: l.item_id, qty: -left, ref_type: type, ref_id: inv.id });
      } else {
        move(db, branch, { item_id: l.item_id, qty: T.sign * l.qty, batch_no: l.batch_no, expiry: l.expiry, ref_type: type, ref_id: inv.id });
      }
      if (type === 'purchase') {
        const cost = inclusive ? round2(l.taxable / l.qty) : round2(l.rate * (1 - l.discount_pct / 100));
        save(db, 'items', { id: l.item_id, purchase_price: cost });
      }
    });
    if (T.pay) {
      let remaining = calc.total;
      for (const p of payments) {
        const amt = round2(Math.min(Number(p.amount), remaining));
        if (amt <= 0) break;
        remaining = round2(remaining - amt);
        save(db, 'payments', { branch_id: branch, party_id: party?.id || null, invoice_id: inv.id, direction: T.pay, amount: amt, mode: p.mode || 'cash', date });
      }
    }
    return invoiceWithLines(db, inv.id);
  });
}

export function invoiceWithLines(db, id) {
  const inv = getWire(db, 'invoices', id);
  if (!inv) return null;
  inv.lines = db.prepare('select * from invoice_lines where invoice_id = ? and deleted = 0 order by sort').all(id).map((r) => toWire('invoice_lines', r));
  inv.payments = db.prepare('select * from payments where invoice_id = ? and deleted = 0').all(id).map((r) => toWire('payments', r));
  return inv;
}

export function cancelInvoice(db, id) {
  const inv = get(db, 'invoices', id);
  if (!inv) throw new UserError('Invoice not found');
  if (inv.status === 'cancelled') return invoiceWithLines(db, id);
  return tx(db, () => {
    for (const m of db.prepare('select id from stock_movements where ref_id = ? and deleted = 0').all(id)) save(db, 'stock_movements', { id: m.id, deleted: true });
    for (const p of db.prepare('select id from payments where invoice_id = ? and deleted = 0').all(id)) save(db, 'payments', { id: p.id, deleted: true });
    save(db, 'invoices', { id, status: 'cancelled', paid: 0 });
    return invoiceWithLines(db, id);
  });
}

// Payment in/out against a party (optionally a specific invoice).
export function recordPayment(db, branch, body) {
  const amount = round2(body.amount);
  if (!(amount > 0)) throw new UserError('Enter an amount');
  if (!body.party_id || !get(db, 'parties', body.party_id)) throw new UserError('Select a party');
  if (!['in', 'out'].includes(body.direction)) throw new UserError('Bad direction');
  return tx(db, () => {
    const p = save(db, 'payments', { branch_id: branch, party_id: body.party_id, invoice_id: body.invoice_id || null, direction: body.direction,
      amount, mode: body.mode || 'cash', date: body.date || today(), note: body.note || null });
    if (body.invoice_id) {
      const inv = get(db, 'invoices', body.invoice_id);
      const paid = round2((inv.paid || 0) + amount);
      save(db, 'invoices', { id: inv.id, paid, status: paid >= inv.total ? 'paid' : 'partial' });
    }
    return p;
  });
}

export function adjustStock(db, branch, { item_id, qty, batch_no, expiry, note }) {
  qty = Number(qty);
  if (!get(db, 'items', item_id)) throw new UserError('Item not found');
  if (!qty) throw new UserError('Quantity cannot be zero');
  move(db, branch, { item_id, qty, batch_no: batch_no || null, expiry: expiry || null, ref_type: 'adjust', note: note || null });
}

// ---------- Online orders ----------
export function updateOrder(db, id, { status, courier, awb, tracking_url, note }, user) {
  const o = get(db, 'orders', id);
  if (!o) throw new UserError('Order not found');
  return tx(db, () => {
    if (status === 'cancelled' && o.status !== 'cancelled') {
      for (const l of db.prepare('select item_id, qty from order_lines where order_id = ? and deleted = 0').all(id))
        move(db, o.branch_id, { item_id: l.item_id, qty: l.qty, ref_type: 'order_cancel', ref_id: id, note: o.order_no });
    }
    const patch = { id };
    if (courier !== undefined) patch.courier = courier;
    if (awb !== undefined) patch.awb = awb;
    if (tracking_url !== undefined) patch.tracking_url = tracking_url;
    if (status) {
      patch.status = status;
      if (status === 'delivered' && o.payment_method === 'cod') patch.payment_status = 'paid';
    }
    save(db, 'orders', patch);
    if (status && status !== o.status) save(db, 'order_events', { order_id: id, status, note: note || (user ? `by ${user.name}` : null) });
    return getWire(db, 'orders', id);
  });
}

// Online customer -> party (matched by phone), so online sales show in ledgers, dues and GST place-of-supply.
function customerForOrder(db, o) {
  const phone = String(o.phone || '').replace(/\D/g, '').slice(-10);
  const found = phone && db.prepare("select id from parties where deleted = 0 and type = 'customer' and substr(replace(replace(phone, ' ', ''), '+', ''), -10) = ?").get(phone);
  if (found) return found.id;
  const a = o.address ? JSON.parse(o.address) : {};
  const state = Object.entries(STATES).find(([, n]) => n.toLowerCase() === String(a.state || '').toLowerCase())?.[0] || '37';
  return save(db, 'parties', {
    type: 'customer', name: o.name || 'Online customer', phone, email: o.email || null, state_code: state, opening_balance: 0,
    address: [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', '),
  }).id;
}

// Creates the GST invoice for an online order (stock was already reserved when the order was placed).
export function invoiceFromOrder(db, branch, user, id) {
  const o = get(db, 'orders', id);
  if (!o) throw new UserError('Order not found');
  if (o.invoice_id && get(db, 'invoices', o.invoice_id)) return invoiceWithLines(db, o.invoice_id);
  if (['pending_payment', 'cancelled'].includes(o.status)) throw new UserError('Order is not confirmed yet');
  const lines = db.prepare('select item_id, qty, price from order_lines where order_id = ? and deleted = 0').all(id)
    .map((l) => ({ item_id: l.item_id, qty: l.qty, rate: l.price }));
  if (!lines.length) throw new UserError('Order has no items yet');
  const paid = o.payment_status === 'paid';
  const inv = createInvoice(db, o.branch_id || branch, user || { name: 'Website' }, {
    type: 'sale', lines, party_id: customerForOrder(db, o), order_id: o.id, skip_stock: true,
    date: new Date(o.created_at).toLocaleDateString('en-CA'),
    payments: paid ? [{ mode: o.payment_method === 'online' ? 'online' : 'cod', amount: Infinity }] : [], // COD stays due until delivered
    notes: `Online order ${o.order_no}${o.shipping ? ` · shipping ₹${o.shipping} collected separately` : ''}`,
  });
  save(db, 'orders', { id, invoice_id: inv.id });
  return inv;
}

// Keeps an order's invoice in step with the order: invoice once placed, collect COD on delivery, cancel with the order.
export function syncOrderInvoice(db, branch, id) {
  const o = get(db, 'orders', id);
  if (!o || o.deleted) return;
  const inv = o.invoice_id ? get(db, 'invoices', o.invoice_id) : null;
  if (o.status === 'cancelled') {
    if (inv && inv.status !== 'cancelled') cancelInvoice(db, inv.id);
    return;
  }
  if (o.status === 'pending_payment') return;
  const current = inv || invoiceFromOrder(db, branch, null, id);
  const due = round2(current.total - (current.paid || 0));
  if (due > 0 && (o.payment_status === 'paid' || o.status === 'delivered')) {
    recordPayment(db, o.branch_id || branch, { party_id: current.party_id, invoice_id: current.id, direction: 'in', amount: due,
      mode: o.payment_method === 'online' ? 'online' : 'cod', date: today(), note: `Order ${o.order_no}` });
  }
}

// Run after every sync pull: brings every online order of this branch into invoices/reports.
export function processOnlineOrders(db, branch, log = console) {
  let n = 0;
  for (const { id } of db.prepare("select id from orders where deleted = 0 and branch_id = ? and status <> 'pending_payment'").all(branch)) {
    const before = get(db, 'orders', id);
    try {
      syncOrderInvoice(db, branch, id);
      if (get(db, 'orders', id).invoice_id !== before.invoice_id) n++;
    } catch (e) { log.warn?.(`[orders] ${before.order_no}: ${e.message}`); }
  }
  return n;
}

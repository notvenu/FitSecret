// Read-only reports over the local SQLite copy. All amounts exclude cancelled invoices and estimates.
import { round2, today } from '@fitsecret/shared';
import { stockMap } from './db.js';

const LIVE = `deleted = 0 and status not in ('cancelled', 'estimate')`;
const all = (db, sql, ...a) => db.prepare(sql).all(...a);
const one = (db, sql, ...a) => db.prepare(sql).get(...a);

// Positive = party owes us; negative = we owe them.
const BALANCE_SQL = `
  select p.id, p.name, p.type, p.phone, round(coalesce(p.opening_balance, 0)
    + coalesce((select sum(case type when 'sale' then total when 'purchase_return' then total when 'sale_return' then -total when 'purchase' then -total end)
                from invoices i where i.party_id = p.id and i.deleted = 0 and i.status not in ('cancelled', 'estimate')), 0)
    - coalesce((select sum(case direction when 'in' then amount else -amount end) from payments y where y.party_id = p.id and y.deleted = 0), 0), 2) balance
  from parties p where p.deleted = 0`;

export function partyBalances(db) {
  return all(db, BALANCE_SQL + ' order by p.name');
}

const ago = (days) => new Date(Date.now() - days * 864e5).toLocaleDateString('en-CA');

// Everything the owner wants at a glance. Online sales are invoices linked to an order (see db.processOnlineOrders).
export function dashboard(db, branch) {
  const d = today(), month = d.slice(0, 7);
  const lastMonth = new Date(new Date(d).getFullYear(), new Date(d).getMonth() - 1, 15).toLocaleDateString('en-CA').slice(0, 7);
  const sale = `branch_id = ? and type = 'sale' and ${LIVE}`;
  const split = (where, ...a) => one(db, `select round(coalesce(sum(total), 0), 2) t, count(*) n,
      round(coalesce(sum(case when order_id is null then total end), 0), 2) counter, count(case when order_id is null then 1 end) counter_n,
      round(coalesce(sum(case when order_id is not null then total end), 0), 2) online, count(case when order_id is not null then 1 end) online_n
    from invoices where ${sale} and ${where}`, branch, ...a);
  const bal = partyBalances(db);
  const stock = stockMap(db, branch);
  const items = all(db, 'select id, name, low_stock, purchase_price, sale_price from items where deleted = 0');
  const monthPnl = pnl(db, branch, { from: month + '-01', to: month + '-31' });
  const todays = split('date = ?', d), monthS = split('substr(date, 1, 7) = ?', month), lastS = split('substr(date, 1, 7) = ?', lastMonth);

  return {
    today: { ...todays, avg: todays.n ? round2(todays.t / todays.n) : 0 },
    month: monthS,
    last_month: lastS.t,
    growth: lastS.t ? round2(((monthS.t - lastS.t) / lastS.t) * 100) : null,
    gross_profit_month: monthPnl.gross,
    net_profit_month: monthPnl.net,
    purchases_month: one(db, `select round(coalesce(sum(total), 0), 2) t, count(*) n from invoices where branch_id = ? and type = 'purchase' and ${LIVE} and substr(date, 1, 7) = ?`, branch, month),
    expenses_month: one(db, `select round(coalesce(sum(amount), 0), 2) t from expenses where branch_id = ? and deleted = 0 and substr(date, 1, 7) = ?`, branch, month).t,
    receivable: round2(bal.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0)),
    payable: round2(-bal.filter((b) => b.balance < 0).reduce((s, b) => s + b.balance, 0)),
    top_dues: bal.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5),
    stock_value: round2(items.reduce((s, i) => s + Math.max(0, stock[i.id] || 0) * (i.purchase_price || 0), 0)),
    stock_retail: round2(items.reduce((s, i) => s + Math.max(0, stock[i.id] || 0) * (i.sale_price || 0), 0)),
    stock_units: round2(items.reduce((s, i) => s + Math.max(0, stock[i.id] || 0), 0)),
    missing_cost: items.filter((i) => !(i.purchase_price > 0)).length, // profit/stock-at-cost are understated until purchases are entered
    out_of_stock: items.filter((i) => (stock[i.id] || 0) <= 0).length,
    low_stock: items.filter((i) => (stock[i.id] || 0) > 0 && (stock[i.id] || 0) <= (i.low_stock || 0)).length,
    low_list: items.filter((i) => (stock[i.id] || 0) <= (i.low_stock || 0)).sort((a, b) => (stock[a.id] || 0) - (stock[b.id] || 0)).slice(0, 6)
      .map((i) => ({ id: i.id, name: i.name, qty: stock[i.id] || 0 })),
    expiring: expiry(db, branch, 60).length,
    expiring_list: expiry(db, branch, 60).slice(0, 6),
    orders: Object.fromEntries(all(db, `select status, count(*) n from orders where deleted = 0 and branch_id = ? group by status`, branch).map((r) => [r.status, r.n])),
    orders_today: one(db, `select count(*) n, round(coalesce(sum(total), 0), 2) t from orders where deleted = 0 and branch_id = ? and status <> 'cancelled' and date(created_at, '+330 minutes') = ?`, branch, d),
    payments_today: all(db, `select mode, round(sum(case direction when 'in' then amount else -amount end), 2) net, count(*) n from payments
                             where branch_id = ? and deleted = 0 and date = ? group by mode order by net desc`, branch, d),
    series: all(db, `select date, round(sum(case when order_id is null then total else 0 end), 2) counter, round(sum(case when order_id is not null then total else 0 end), 2) online
                     from invoices where ${sale} and date >= ? group by date order by date`, branch, ago(29)),
    top: all(db, `select l.name, sum(l.qty) qty, round(sum(l.total), 2) total from invoice_lines l join invoices i on i.id = l.invoice_id
                  where i.branch_id = ? and i.type = 'sale' and i.deleted = 0 and i.status not in ('cancelled','estimate') and i.date >= ? and l.deleted = 0
                  group by l.item_id order by total desc limit 6`, branch, ago(30)),
    top_categories: all(db, `select coalesce(pc.name, c.name, 'Other') name, round(sum(l.total), 2) total from invoice_lines l
                  join invoices i on i.id = l.invoice_id left join items it on it.id = l.item_id left join categories c on c.id = it.category_id left join categories pc on pc.id = c.parent_id
                  where i.branch_id = ? and i.type = 'sale' and i.deleted = 0 and i.status not in ('cancelled','estimate') and i.date >= ? and l.deleted = 0
                  group by 1 order by total desc limit 6`, branch, ago(30)),
    recent: all(db, `select id, no, date, party_name, total, paid, status, order_id is not null online from invoices
                     where branch_id = ? and deleted = 0 and type = 'sale' order by created_at desc limit 8`, branch),
  };
}

export function register(db, branch, { type = 'sale', from, to, q }) {
  return all(db, `select id, no, date, type, party_name, party_phone, total, paid, status, order_id is not null online from invoices
    where branch_id = ? and deleted = 0 and type = ? and date between ? and ? and (? is null or no like ? or party_name like ? or party_phone like ?)
    order by date desc, created_at desc limit 500`, branch, type, from || '0000', to || '9999', q || null, `%${q}%`, `%${q}%`, `%${q}%`);
}

export function daybook(db, branch, date = today()) {
  return {
    invoices: all(db, `select no, type, party_name, total, paid, status from invoices where branch_id = ? and deleted = 0 and date = ? order by created_at`, branch, date),
    payments: all(db, `select y.direction, y.amount, y.mode, y.note, p.name party, i.no invoice_no from payments y
                       left join parties p on p.id = y.party_id left join invoices i on i.id = y.invoice_id
                       where y.branch_id = ? and y.deleted = 0 and y.date = ? order by y.created_at`, branch, date),
    expenses: all(db, `select category, amount, mode, note from expenses where branch_id = ? and deleted = 0 and date = ?`, branch, date),
    cash: all(db, `select mode, round(sum(case direction when 'in' then amount else -amount end), 2) net from payments
                   where branch_id = ? and deleted = 0 and date = ? group by mode`, branch, date),
  };
}

// GSTR-1 style summary: B2B invoices, B2C by rate, HSN summary, credit notes. Plus input tax from purchases (3B helper).
export function gst(db, branch, { from, to }) {
  const r = [branch, from, to];
  const w = `i.branch_id = ? and i.deleted = 0 and i.status <> 'cancelled' and i.date between ? and ?`;
  return {
    b2b: all(db, `select no, date, party_name, party_gstin, party_state, taxable, cgst, sgst, igst, total from invoices i
                  where ${w} and type = 'sale' and coalesce(party_gstin, '') <> '' order by date`, ...r),
    b2c: all(db, `select l.gst_rate rate, round(sum(l.taxable), 2) taxable, round(sum(l.tax), 2) tax from invoice_lines l join invoices i on i.id = l.invoice_id
                  where ${w} and i.type = 'sale' and coalesce(i.party_gstin, '') = '' and l.deleted = 0 group by l.gst_rate order by rate`, ...r),
    hsn: all(db, `select l.hsn, l.gst_rate rate, sum(case i.type when 'sale' then l.qty else -l.qty end) qty,
                  round(sum(case i.type when 'sale' then l.taxable else -l.taxable end), 2) taxable,
                  round(sum(case i.type when 'sale' then l.tax else -l.tax end), 2) tax
                  from invoice_lines l join invoices i on i.id = l.invoice_id
                  where ${w} and i.type in ('sale', 'sale_return') and l.deleted = 0 group by l.hsn, l.gst_rate order by l.hsn`, ...r),
    credit_notes: all(db, `select no, date, party_name, taxable, cgst, sgst, igst, total from invoices i where ${w} and type = 'sale_return' order by date`, ...r),
    totals: all(db, `select type, round(sum(taxable), 2) taxable, round(sum(cgst), 2) cgst, round(sum(sgst), 2) sgst, round(sum(igst), 2) igst
                     from invoices i where ${w} and type in ('sale', 'sale_return', 'purchase', 'purchase_return') group by type`, ...r),
  };
}

export function stockSummary(db, branch) {
  const stock = stockMap(db, branch);
  return all(db, `select i.id, i.name, i.sku, i.brand, i.mrp, i.sale_price, i.purchase_price, i.low_stock, c.name category
                  from items i left join categories c on c.id = i.category_id where i.deleted = 0 order by i.name`)
    .map((i) => ({ ...i, qty: stock[i.id] || 0, value: round2((stock[i.id] || 0) * (i.purchase_price || 0)) }));
}

export function expiry(db, branch, days = 60) {
  const until = new Date(Date.now() + days * 864e5).toLocaleDateString('en-CA');
  return all(db, `select m.item_id, i.name, m.batch_no, m.expiry, round(sum(m.qty), 3) qty from stock_movements m join items i on i.id = m.item_id
                  where m.branch_id = ? and m.deleted = 0 and m.expiry is not null group by m.item_id, m.batch_no, m.expiry
                  having sum(m.qty) > 0 and m.expiry <= ? order by m.expiry`, branch, until);
}

export function pnl(db, branch, { from, to }) {
  const r = [branch, from, to];
  const w = `i.branch_id = ? and i.deleted = 0 and i.status not in ('cancelled', 'estimate') and i.date between ? and ?`;
  const s = (type) => one(db, `select round(coalesce(sum(l.taxable), 0), 2) rev, round(coalesce(sum(l.cost * l.qty), 0), 2) cogs
    from invoice_lines l join invoices i on i.id = l.invoice_id where ${w} and i.type = ? and l.deleted = 0`, ...r, type);
  const sale = s('sale'), ret = s('sale_return');
  const exp = all(db, `select category, round(sum(amount), 2) amount from expenses where branch_id = ? and deleted = 0 and date between ? and ? group by category`, ...r);
  const revenue = round2(sale.rev - ret.rev), cogs = round2(sale.cogs - ret.cogs), expenses = round2(exp.reduce((a, e) => a + e.amount, 0));
  return { revenue, cogs, gross: round2(revenue - cogs), expenses, expense_breakup: exp, net: round2(revenue - cogs - expenses) };
}

export function ledger(db, party_id) {
  const p = one(db, 'select * from parties where id = ?', party_id);
  if (!p) return null;
  const rows = [
    ...all(db, `select date, created_at, no ref, type, total amt from invoices where party_id = ? and deleted = 0 and status not in ('cancelled','estimate')`, party_id)
      .map((r) => ({ ...r, amt: ['sale', 'purchase_return'].includes(r.type) ? r.amt : -r.amt })),
    ...all(db, `select date, created_at, mode ref, 'payment_' || direction type, amount amt from payments where party_id = ? and deleted = 0`, party_id)
      .map((r) => ({ ...r, amt: r.type === 'payment_in' ? -r.amt : r.amt })),
  ].sort((a, b) => (a.date + a.created_at).localeCompare(b.date + b.created_at));
  let bal = p.opening_balance || 0;
  return { party: p, opening: bal, rows: rows.map((r) => ({ ...r, balance: (bal = round2(bal + r.amt)) })) };
}

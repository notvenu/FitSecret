// Vyapar-style reports, written once over plain rows so the POS server (SQLite) and /admin (Supabase replica) give identical numbers.
// rows(t) must return the live (deleted = false) rows of a synced table in wire format.
// ponytail: every report scans the whole table in memory; fine for one shop's volume, move to SQL per report if it gets slow.
import { round2 } from './index.js';

const sum = (a, f) => round2(a.reduce((s, x) => s + (Number(f(x)) || 0), 0));
const group = (a, key) => { const m = new Map(); for (const x of a) { const k = key(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; };
const inRange = (d, { from, to }) => d >= (from || '0000') && d <= (to || '9999');
const byDate = (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at).localeCompare(String(b.created_at));
const STOCK_TYPES = ['sale', 'purchase', 'sale_return', 'purchase_return'];
const PAY_SIGN = { sale: 1, purchase_return: 1, sale_return: -1, purchase: -1 }; // + = party owes us
export const DOC_TYPES = ['estimate', 'sale_order', 'proforma', 'delivery_challan', 'purchase_order']; // no stock, no money

function load(rows, branch) {
  const invoices = rows('invoices').filter((i) => i.branch_id === branch && i.status !== 'cancelled');
  const inv = new Map(invoices.map((i) => [i.id, i]));
  const items = new Map(rows('items').map((i) => [i.id, i]));
  const cats = new Map(rows('categories').map((c) => [c.id, c]));
  const lines = rows('invoice_lines').filter((l) => inv.has(l.invoice_id)).map((l) => ({ ...l, inv: inv.get(l.invoice_id) }));
  const catOf = (item_id) => { const c = cats.get(items.get(item_id)?.category_id); return cats.get(c?.parent_id)?.name || c?.name || 'Other'; };
  const journals = rows('journals').filter((j) => j.branch_id === branch);
  return {
    invoices, lines, items, catOf, journals,
    settings: rows('branches').find((b) => b.id === branch)?.settings || {},
    accounts: rows('accounts').filter((a) => a.branch_id === branch),
    jlines: journals.flatMap((j) => (j.lines || []).map((l) => ({ ...l, debit: +l.debit || 0, credit: +l.credit || 0, date: j.date, created_at: j.created_at, no: j.no, note: j.note }))),
    money: invoices.filter((i) => STOCK_TYPES.includes(i.type)),
    parties: rows('parties'),
    payments: rows('payments').filter((p) => p.branch_id === branch),
    expenses: rows('expenses').filter((e) => e.branch_id === branch),
    moves: rows('stock_movements').filter((m) => m.branch_id === branch),
  };
}

export function partyBalances(d, to = '9999') {
  const add = new Map();
  for (const i of d.money) if (i.party_id && i.date <= to) add.set(i.party_id, (add.get(i.party_id) || 0) + PAY_SIGN[i.type] * i.total);
  for (const y of d.payments) if (y.party_id && y.date <= to) add.set(y.party_id, (add.get(y.party_id) || 0) + (y.direction === 'in' ? -1 : 1) * (y.amount + (y.tds || 0)));
  return d.parties.map((p) => ({ ...p, balance: round2((p.opening_balance || 0) + (add.get(p.id) || 0)) }));
}

// Money in/out per payment mode: payments (incl. cash adjustments with no party), expenses and journal lines on a mode.
// Loyalty points redeemed are recorded as payments in mode 'points' but are not money, so they stay out.
function cashRows(d) {
  const inv = new Map(d.invoices.map((i) => [i.id, i]));
  return [
    ...d.jlines.filter((l) => String(l.account).startsWith('mode:')).map((l) => ({ date: l.date, created_at: l.created_at, mode: l.account.slice(5), type: 'journal',
      ref: [l.no, l.note].filter(Boolean).join(' · '), in: l.debit, out: l.credit })),
    ...d.payments.filter((y) => y.mode !== 'points').map((y) => {
      const i = inv.get(y.invoice_id);
      return { date: y.date, created_at: y.created_at, mode: y.mode || 'cash', type: i ? i.type.replace(/_/g, ' ') : y.party_id ? `payment ${y.direction}` : 'adjustment',
        ref: i ? `${i.no}${i.party_id ? '' : ` · ${i.party_name}`}` : y.note || '', party_id: y.party_id, in: y.direction === 'in' ? y.amount : 0, out: y.direction === 'out' ? y.amount : 0 };
    }),
    ...d.expenses.map((e) => ({ date: e.date, created_at: e.created_at, mode: e.mode || 'cash', type: 'expense', ref: [e.category, e.note].filter(Boolean).join(' · '), in: 0, out: e.amount })),
  ].sort(byDate);
}

const itemAgg = (lines, key, label) => [...group(lines, key)].map(([k, ls]) => {
  const s = ls.filter((l) => l.inv.type === 'sale'), r = ls.filter((l) => l.inv.type === 'sale_return');
  const sales = round2(sum(s, (l) => l.taxable) - sum(r, (l) => l.taxable)), cost = round2(sum(s, (l) => l.cost * l.qty) - sum(r, (l) => l.cost * l.qty));
  return { [label]: k, qty: round2(sum(s, (l) => l.qty) - sum(r, (l) => l.qty)), sales, cost, profit: round2(sales - cost), margin_pct: sales ? round2(((sales - cost) / sales) * 100) : 0 };
}).filter((x) => x.qty || x.sales).sort((a, b) => b.profit - a.profit);

// ---------- Accounting ----------
export const ACCOUNT_TYPES = {
  fixed_asset: ['Fixed Assets', 'asset'], current_asset: ['Current Assets', 'asset'], capital: ['Capital', 'equity'], loan: ['Loans (Liability)', 'liability'],
  current_liability: ['Current Liabilities', 'liability'], income: ['Indirect Income', 'income'], expense: ['Indirect Expenses', 'expense'],
};
export const MODE_NAMES = { cash: 'Cash in hand', upi: 'UPI', card: 'Card / POS machine', bank: 'Bank', cheque: 'Cheques' };
const DEBIT_SIDE = ['asset', 'expense'];
// Balance on the account's natural side (debit for assets/expenses, credit for the rest).
export function accountBalance(a, jlines, to = '9999') {
  const net = sum(jlines.filter((l) => l.account === 'acc:' + a.id && l.date <= to), (l) => l.debit - l.credit);
  return round2((a.opening_balance || 0) + (DEBIT_SIDE.includes(ACCOUNT_TYPES[a.type]?.[1]) ? net : -net));
}

// Every ledger as of a date, on its natural side. Opening Balance Equity balances the books, as in Vyapar.
function ledgers(d, to = '9999') {
  const L = [];
  const add = (side, grp, name, amount, key) => amount && L.push({ side, group: grp, name, amount: round2(amount), key });
  for (const [mode, rs] of group(cashRows(d).filter((r) => r.date <= to), (r) => r.mode)) add('asset', 'Cash & Bank', MODE_NAMES[mode] || mode, sum(rs, (r) => r.in - r.out), 'mode:' + mode);
  const bal = partyBalances(d, to);
  add('asset', 'Current Assets', 'Sundry Debtors (receivable)', sum(bal.filter((b) => b.balance > 0), (b) => b.balance));
  add('liability', 'Current Liabilities', 'Sundry Creditors (payable)', -sum(bal.filter((b) => b.balance < 0), (b) => b.balance));
  const qty = new Map();
  for (const m of d.moves) if (String(m.created_at).slice(0, 10) <= to) qty.set(m.item_id, (qty.get(m.item_id) || 0) + m.qty);
  add('asset', 'Current Assets', 'Closing stock (at cost)', sum([...qty], ([id, q]) => Math.max(0, q) * (d.items.get(id)?.purchase_price || 0)));
  const upto = d.money.filter((i) => i.date <= to), tax = (t) => sum(upto.filter((i) => i.type === t), (i) => i.cgst + i.sgst + i.igst);
  const gst = round2(tax('sale') - tax('sale_return') - tax('purchase') + tax('purchase_return'));
  if (gst > 0) add('liability', 'Duties & Taxes', 'GST payable', gst); else add('asset', 'Duties & Taxes', 'GST input credit', -gst);
  // TDS deducted by customers / TCS paid to suppliers are claimed back; TDS we deducted / TCS we collected are owed to the government
  const pay = d.payments.filter((y) => y.date <= to && y.tds), tcs = (t) => sum(upto.filter((i) => i.type === t), (i) => i.tcs);
  add('asset', 'Duties & Taxes', 'TDS receivable', sum(pay.filter((y) => y.direction === 'in'), (y) => y.tds));
  add('liability', 'Duties & Taxes', 'TDS payable', sum(pay.filter((y) => y.direction === 'out'), (y) => y.tds));
  add('liability', 'Duties & Taxes', 'TCS payable', tcs('sale') - tcs('sale_return'));
  add('asset', 'Duties & Taxes', 'TCS receivable', tcs('purchase') - tcs('purchase_return'));
  for (const a of d.accounts) { const [g, side] = ACCOUNT_TYPES[a.type] || ['Other', 'asset']; add(side, g, a.name, accountBalance(a, d.jlines, to), 'acc:' + a.id); }
  // Trading + P&L to date (COGS at cost when sold, same as the Profit & Loss report)
  const ln = d.lines.filter((l) => l.inv.date <= to);
  const net = (k) => sum(ln.filter((l) => l.inv.type === 'sale'), k) - sum(ln.filter((l) => l.inv.type === 'sale_return'), k);
  add('income', 'Sales', 'Sales (net of returns, excl. GST)', net((l) => l.taxable));
  add('expense', 'Cost of goods sold', 'Cost of goods sold', net((l) => l.cost * l.qty));
  for (const [cat, es] of group(d.expenses.filter((e) => e.date <= to), (e) => e.category)) add('expense', 'Expenses', cat, sum(es, (e) => e.amount));
  const tot = (side) => sum(L.filter((x) => x.side === side), (x) => x.amount);
  const profit = round2(tot('income') - tot('expense'));
  add('equity', 'Capital', 'Opening Balance Equity', round2(tot('asset') - tot('liability') - tot('equity') - profit));
  return { L, profit };
}

export function balanceSheet(rows, branch, to) {
  const { L, profit } = ledgers(load(rows, branch), to);
  const pick = (sides) => L.filter((x) => sides.includes(x.side)).map(({ group: g, name, amount, key }) => ({ group: g, name, amount, key }));
  const liabilities = [...pick(['equity', 'liability']), ...(profit ? [{ group: 'Reserves & Surplus', name: 'Net profit to date', amount: profit }] : [])];
  return { assets: pick(['asset']), liabilities, total: sum(pick(['asset']), (x) => x.amount) };
}

function tdsRows(d, p, direction) {
  const party = new Map(d.parties.map((x) => [x.id, x]));
  return d.payments.filter((y) => y.tds && y.direction === direction && inRange(y.date, p)).sort(byDate)
    .map((y) => ({ date: y.date, party: party.get(y.party_id)?.name || '', pan: party.get(y.party_id)?.gstin?.slice(2, 12) || '', amount: y.amount, tds: y.tds }));
}

const invRow = (i) => ({ date: i.date, no: i.no, party: i.party_name, total: i.total, paid: i.paid, balance: round2(i.total - (i.paid || 0)), status: i.status, channel: i.order_id ? 'online' : 'counter' });

// params: what the UI asks for. money: columns shown as ₹. total: columns summed in the footer.
export const REPORTS = {
  // ---- Transaction ----
  sale: { title: 'Sale', group: 'Transaction report', params: ['range'], money: ['total', 'paid', 'balance'], total: ['total', 'paid', 'balance'],
    run: (d, p) => d.invoices.filter((i) => i.type === 'sale' && inRange(i.date, p)).sort(byDate).map(invRow) },
  purchase: { title: 'Purchase', group: 'Transaction report', params: ['range'], money: ['total', 'paid', 'balance'], total: ['total', 'paid', 'balance'],
    run: (d, p) => d.invoices.filter((i) => i.type === 'purchase' && inRange(i.date, p)).sort(byDate).map(invRow) },
  all_txns: { title: 'All Transactions', group: 'Transaction report', params: ['range'], money: ['amount'],
    run: (d, p) => {
      const name = new Map(d.parties.map((x) => [x.id, x.name]));
      return [
        ...d.invoices.filter((i) => inRange(i.date, p)).map((i) => ({ date: i.date, created_at: i.created_at, type: i.type.replace(/_/g, ' '), ref: i.no, party: i.party_name, amount: i.total, status: i.status })),
        ...d.payments.filter((y) => inRange(y.date, p) && !y.invoice_id).map((y) => ({ date: y.date, created_at: y.created_at, type: y.party_id ? `payment ${y.direction}` : `cash ${y.direction}`, ref: y.mode, party: name.get(y.party_id) || y.note || '', amount: y.amount, status: '' })),
        ...d.expenses.filter((e) => inRange(e.date, p)).map((e) => ({ date: e.date, created_at: e.created_at, type: 'expense', ref: e.mode, party: e.category, amount: e.amount, status: '' })),
      ].sort(byDate).map(({ created_at, ...r }) => r);
    } },
  bill_profit: { title: 'Bill Wise Profit', group: 'Transaction report', admin: true, params: ['range'], money: ['sale', 'cost', 'profit'], total: ['sale', 'cost', 'profit'],
    run: (d, p) => [...group(d.lines.filter((l) => l.inv.type === 'sale' && inRange(l.inv.date, p)), (l) => l.inv.id).values()].map((ls) => {
      const sale = sum(ls, (l) => l.taxable), cost = sum(ls, (l) => l.cost * l.qty);
      return { date: ls[0].inv.date, no: ls[0].inv.no, party: ls[0].inv.party_name, sale, cost, profit: round2(sale - cost), margin_pct: sale ? round2(((sale - cost) / sale) * 100) : 0 };
    }).sort(byDate) },
  cash_flow: { title: 'Cash flow', group: 'Transaction report', params: ['range'], money: ['money_in', 'money_out', 'net', 'running'], total: ['money_in', 'money_out', 'net'],
    run: (d, p) => {
      const all = cashRows(d);
      let run = sum(all.filter((r) => r.date < (p.from || '0000')), (r) => r.in - r.out);
      return [...group(all.filter((r) => inRange(r.date, p)), (r) => r.date)].map(([date, rs]) => {
        const i = sum(rs, (r) => r.in), o = sum(rs, (r) => r.out);
        return { date, money_in: i, money_out: o, net: round2(i - o), running: (run = round2(run + i - o)) };
      });
    } },
  // ---- Party ----
  party_statement: { title: 'Party Statement', group: 'Party report', params: ['party', 'range'], money: ['debit', 'credit', 'balance'], total: ['debit', 'credit'],
    run: (d, p) => {
      const party = d.parties.find((x) => x.id === p.party_id);
      if (!party) return [];
      const rows = [
        ...d.money.filter((i) => i.party_id === party.id).map((i) => ({ date: i.date, created_at: i.created_at, type: i.type.replace(/_/g, ' '), ref: i.no, amt: PAY_SIGN[i.type] * i.total })),
        ...d.payments.filter((y) => y.party_id === party.id).map((y) => ({ date: y.date, created_at: y.created_at, type: `payment ${y.direction}`, ref: y.mode + (y.tds ? ` + TDS ${y.tds}` : ''), amt: (y.direction === 'in' ? -1 : 1) * (y.amount + (y.tds || 0)) })),
      ].sort(byDate);
      let bal = party.opening_balance || 0;
      const out = [];
      for (const r of rows) {
        bal = round2(bal + r.amt);
        if (inRange(r.date, p)) out.push({ date: r.date, type: r.type, ref: r.ref, debit: r.amt > 0 ? r.amt : 0, credit: r.amt < 0 ? -r.amt : 0, balance: bal });
        else if (r.date < (p.from || '0000')) out.length = 0;
      }
      const opening = round2(bal - sum(out, (r) => r.debit - r.credit));
      return [{ date: p.from || '', type: 'opening balance', ref: '', debit: 0, credit: 0, balance: opening }, ...out];
    } },
  party_pnl: { title: 'Party wise Profit & Loss', group: 'Party report', admin: true, params: ['range'], money: ['sales', 'cost', 'profit'], total: ['sales', 'cost', 'profit'],
    run: (d, p) => itemAgg(d.lines.filter((l) => l.inv.type.startsWith('sale') && inRange(l.inv.date, p)), (l) => l.inv.party_name, 'party') },
  all_parties: { title: 'All parties', group: 'Party report', params: [], money: ['receivable', 'payable'], total: ['receivable', 'payable'],
    run: (d) => partyBalances(d).sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ name: x.name, type: x.type, phone: x.phone, gstin: x.gstin, receivable: x.balance > 0 ? x.balance : 0, payable: x.balance < 0 ? -x.balance : 0 })) },
  party_by_item: { title: 'Party Report By Item', group: 'Party report', params: ['item', 'range'], money: ['sale_amount', 'purchase_amount'], total: ['sale_qty', 'sale_amount', 'purchase_qty', 'purchase_amount'],
    run: (d, p) => [...group(d.lines.filter((l) => l.item_id === p.item_id && inRange(l.inv.date, p)), (l) => l.inv.party_name)].map(([party, ls]) => {
      const s = ls.filter((l) => l.inv.type === 'sale'), b = ls.filter((l) => l.inv.type === 'purchase');
      return { party, sale_qty: sum(s, (l) => l.qty), sale_amount: sum(s, (l) => l.total), purchase_qty: sum(b, (l) => l.qty), purchase_amount: sum(b, (l) => l.total) };
    }) },
  by_party: { title: 'Sale Purchase By Party', group: 'Party report', params: ['range'], money: ['sale', 'purchase'], total: ['sale', 'purchase'],
    run: (d, p) => [...group(d.money.filter((i) => inRange(i.date, p)), (i) => i.party_name)].map(([party, is]) => ({
      party, sale: round2(sum(is.filter((i) => i.type === 'sale'), (i) => i.total) - sum(is.filter((i) => i.type === 'sale_return'), (i) => i.total)),
      purchase: round2(sum(is.filter((i) => i.type === 'purchase'), (i) => i.total) - sum(is.filter((i) => i.type === 'purchase_return'), (i) => i.total)),
    })).sort((a, b) => b.sale - a.sale) },
  // ---- GST ----
  gstr2: { title: 'GSTR 2 (purchases)', group: 'GST reports', admin: true, params: ['range'], money: ['taxable', 'cgst', 'sgst', 'igst', 'total'], total: ['taxable', 'cgst', 'sgst', 'igst', 'total'],
    run: (d, p) => d.invoices.filter((i) => i.type.startsWith('purchase') && i.type !== 'purchase_order' && inRange(i.date, p)).sort(byDate).map((i) => ({
      date: i.date, no: i.no, type: i.type === 'purchase' ? 'bill' : 'debit note', supplier: i.party_name, gstin: i.party_gstin, taxable: i.taxable, cgst: i.cgst, sgst: i.sgst, igst: i.igst, total: i.total })) },
  gstr3b: { title: 'GSTR 3B', group: 'GST reports', admin: true, params: ['range'], money: ['taxable', 'igst', 'cgst', 'sgst'],
    run: (d, p) => {
      const t = (type) => d.money.filter((i) => i.type === type && inRange(i.date, p));
      const net = (a, b, k) => round2(sum(t(a), (i) => i[k]) - sum(t(b), (i) => i[k]));
      const row = (section, a, b) => ({ section, taxable: net(a, b, 'taxable'), igst: net(a, b, 'igst'), cgst: net(a, b, 'cgst'), sgst: net(a, b, 'sgst') });
      const out = row('3.1(a) Outward taxable supplies (sales − credit notes)', 'sale', 'sale_return');
      const itc = row('4(A)(5) Eligible ITC (purchases − debit notes)', 'purchase', 'purchase_return');
      return [out, itc, { section: 'Net tax payable', taxable: 0, igst: round2(out.igst - itc.igst), cgst: round2(out.cgst - itc.cgst), sgst: round2(out.sgst - itc.sgst) }];
    } },
  gst_rate: { title: 'GST Rate Report', group: 'Taxes', admin: true, params: ['range'], money: ['sale_taxable', 'sale_tax', 'purchase_taxable', 'purchase_tax'], total: ['sale_taxable', 'sale_tax', 'purchase_taxable', 'purchase_tax'],
    run: (d, p) => [...group(d.lines.filter((l) => STOCK_TYPES.includes(l.inv.type) && inRange(l.inv.date, p)), (l) => l.gst_rate)].sort(([a], [b]) => a - b).map(([rate, ls]) => {
      const n = (type, ret, k) => round2(sum(ls.filter((l) => l.inv.type === type), (l) => l[k]) - sum(ls.filter((l) => l.inv.type === ret), (l) => l[k]));
      return { rate: rate + '%', sale_taxable: n('sale', 'sale_return', 'taxable'), sale_tax: n('sale', 'sale_return', 'tax'), purchase_taxable: n('purchase', 'purchase_return', 'taxable'), purchase_tax: n('purchase', 'purchase_return', 'tax') };
    }) },
  // ---- Item / stock ----
  item_batch: { title: 'Item Batch Report', group: 'Item/ Stock report', params: [], total: ['qty'],
    run: (d) => [...group(d.moves, (m) => `${m.item_id}\0${m.batch_no || ''}\0${m.expiry || ''}`).values()].map((ms) => ({
      item: d.items.get(ms[0].item_id)?.name, batch: ms[0].batch_no || '—', expiry: ms[0].expiry || '—', qty: sum(ms, (m) => m.qty) })).filter((x) => x.qty && x.item)
      .sort((a, b) => a.item.localeCompare(b.item) || a.expiry.localeCompare(b.expiry)) },
  item_by_party: { title: 'Item Report By Party', group: 'Item/ Stock report', params: ['party', 'range'], money: ['sale_amount', 'purchase_amount'], total: ['sale_qty', 'sale_amount', 'purchase_qty', 'purchase_amount'],
    run: (d, p) => [...group(d.lines.filter((l) => l.inv.party_id === p.party_id && inRange(l.inv.date, p)), (l) => l.name)].map(([item, ls]) => {
      const s = ls.filter((l) => l.inv.type === 'sale'), b = ls.filter((l) => l.inv.type === 'purchase');
      return { item, sale_qty: sum(s, (l) => l.qty), sale_amount: sum(s, (l) => l.total), purchase_qty: sum(b, (l) => l.qty), purchase_amount: sum(b, (l) => l.total) };
    }) },
  item_pnl: { title: 'Item Wise Profit And Loss', group: 'Item/ Stock report', admin: true, params: ['range'], money: ['sales', 'cost', 'profit'], total: ['qty', 'sales', 'cost', 'profit'],
    run: (d, p) => itemAgg(d.lines.filter((l) => l.inv.type.startsWith('sale') && inRange(l.inv.date, p)), (l) => l.name, 'item') },
  category_pnl: { title: 'Item Category Wise Profit And Loss', group: 'Item/ Stock report', admin: true, params: ['range'], money: ['sales', 'cost', 'profit'], total: ['qty', 'sales', 'cost', 'profit'],
    run: (d, p) => itemAgg(d.lines.filter((l) => l.inv.type.startsWith('sale') && inRange(l.inv.date, p)), (l) => d.catOf(l.item_id), 'category') },
  stock_detail: { title: 'Stock Detail', group: 'Item/ Stock report', params: ['range'], total: ['opening', 'stock_in', 'stock_out', 'closing'],
    run: (d, p) => [...group(d.moves, (m) => m.item_id)].map(([id, ms]) => {
      const before = (m) => String(m.created_at).slice(0, 10) < (p.from || '0000'), during = (m) => inRange(String(m.created_at).slice(0, 10), p);
      const opening = sum(ms.filter(before), (m) => m.qty), sin = sum(ms.filter((m) => during(m) && m.qty > 0), (m) => m.qty), sout = -sum(ms.filter((m) => during(m) && m.qty < 0), (m) => m.qty);
      return { item: d.items.get(id)?.name, opening, stock_in: sin, stock_out: sout, closing: round2(opening + sin - sout) };
    }).filter((x) => x.item && (x.opening || x.stock_in || x.stock_out)).sort((a, b) => a.item.localeCompare(b.item)) },
  item_detail: { title: 'Item Detail', group: 'Item/ Stock report', params: ['item', 'range'], total: ['stock_in', 'stock_out'],
    run: (d, p) => {
      const inv = new Map(d.invoices.map((i) => [i.id, i]));
      let bal = 0;
      return d.moves.filter((m) => m.item_id === p.item_id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => ({
        date: m.created_at.slice(0, 10), type: m.ref_type, ref: inv.get(m.ref_id)?.no || m.note || '', batch: m.batch_no || '',
        stock_in: m.qty > 0 ? m.qty : 0, stock_out: m.qty < 0 ? -m.qty : 0, closing: (bal = round2(bal + m.qty)) })).filter((r) => inRange(r.date, p));
    } },
  by_category: { title: 'Sale/ Purchase Report By Item Category', group: 'Item/ Stock report', params: ['range'], money: ['sale_amount', 'purchase_amount'], total: ['sale_qty', 'sale_amount', 'purchase_qty', 'purchase_amount'],
    run: (d, p) => [...group(d.lines.filter((l) => ['sale', 'purchase'].includes(l.inv.type) && inRange(l.inv.date, p)), (l) => d.catOf(l.item_id))].map(([category, ls]) => {
      const s = ls.filter((l) => l.inv.type === 'sale'), b = ls.filter((l) => l.inv.type === 'purchase');
      return { category, sale_qty: sum(s, (l) => l.qty), sale_amount: sum(s, (l) => l.total), purchase_qty: sum(b, (l) => l.qty), purchase_amount: sum(b, (l) => l.total) };
    }).sort((a, b) => b.sale_amount - a.sale_amount) },
  stock_by_category: { title: 'Stock Summary Report By Item Category', group: 'Item/ Stock report', params: [], money: ['stock_value', 'sale_value'], total: ['items', 'qty', 'stock_value', 'sale_value'],
    run: (d) => [...group([...group(d.moves, (m) => m.item_id)].map(([id, ms]) => ({ it: d.items.get(id), qty: sum(ms, (m) => m.qty) })).filter((x) => x.it && x.qty > 0), (x) => d.catOf(x.it.id))]
      .map(([category, xs]) => ({ category, items: xs.length, qty: sum(xs, (x) => x.qty), stock_value: sum(xs, (x) => x.qty * (x.it.purchase_price || 0)), sale_value: sum(xs, (x) => x.qty * (x.it.sale_price || 0)) }))
      .sort((a, b) => b.stock_value - a.stock_value) },
  item_discount: { title: 'Item Wise Discount', group: 'Item/ Stock report', params: ['range'], money: ['gross', 'discount', 'net'], total: ['qty', 'gross', 'discount', 'net'],
    run: (d, p) => [...group(d.lines.filter((l) => l.inv.type === 'sale' && l.discount_pct > 0 && inRange(l.inv.date, p)), (l) => l.name)].map(([item, ls]) => {
      const gross = sum(ls, (l) => l.qty * l.rate), net = sum(ls, (l) => l.total);
      return { item, qty: sum(ls, (l) => l.qty), gross, discount: round2(gross - net), net };
    }).sort((a, b) => b.discount - a.discount) },
  // ---- Business status ----
  discount: { title: 'Discount Report', group: 'Business Status', params: ['range'], money: ['discount', 'total'], total: ['discount', 'total'],
    run: (d, p) => d.invoices.filter((i) => i.type === 'sale' && i.discount > 0 && inRange(i.date, p)).sort(byDate).map((i) => ({ date: i.date, no: i.no, party: i.party_name, discount: i.discount, total: i.total })) },
  bank_statement: { title: 'Bank Statement', group: 'Business Status', params: ['mode', 'range'], money: ['money_in', 'money_out', 'balance'], total: ['money_in', 'money_out'],
    run: (d, p) => {
      const name = new Map(d.parties.map((x) => [x.id, x.name]));
      let bal = 0;
      return cashRows(d).filter((r) => r.mode === (p.mode || 'bank')).map((r) => ({ date: r.date, type: r.type, party: name.get(r.party_id) || '', ref: r.ref,
        money_in: r.in, money_out: r.out, balance: (bal = round2(bal + r.in - r.out)) })).filter((r) => inRange(r.date, p));
    } },
  staff_sales: { title: 'Sales by Staff', group: 'Business Status', params: ['range'], money: ['total'], total: ['bills', 'total'],
    run: (d, p) => [...group(d.invoices.filter((i) => i.type === 'sale' && !i.order_id && inRange(i.date, p)), (i) => i.created_by || '—')]
      .map(([staff, is]) => ({ staff, bills: is.length, total: sum(is, (i) => i.total) })).sort((a, b) => b.total - a.total) },
  // ---- Expense ----
  expense: { title: 'Expense', group: 'Expense report', params: ['range'], money: ['amount'], total: ['amount'],
    run: (d, p) => d.expenses.filter((e) => inRange(e.date, p)).sort(byDate).map((e) => ({ date: e.date, category: e.category, note: e.note, mode: e.mode, amount: e.amount })) },
  expense_category: { title: 'Expense Category Report', group: 'Expense report', params: ['range'], money: ['amount'], total: ['count', 'amount'],
    run: (d, p) => [...group(d.expenses.filter((e) => inRange(e.date, p)), (e) => e.category)].map(([category, es]) => ({ category, count: es.length, amount: sum(es, (e) => e.amount) }))
      .sort((a, b) => b.amount - a.amount) },
  // ---- Orders ----
  orders: { title: 'Sale/ Purchase Orders', group: 'Sale/ Purchase Order report', params: ['range'], money: ['total'], total: ['total'],
    run: (d, p) => d.invoices.filter((i) => ['sale_order', 'purchase_order'].includes(i.type) && inRange(i.date, p)).sort(byDate)
      .map((i) => ({ date: i.date, no: i.no, type: i.type.replace('_', ' '), party: i.party_name, total: i.total, status: i.status })) },
  order_items: { title: 'Sale/ Purchase Order Item', group: 'Sale/ Purchase Order report', params: ['range'], money: ['amount'], total: ['qty', 'amount'],
    run: (d, p) => [...group(d.lines.filter((l) => ['sale_order', 'purchase_order'].includes(l.inv.type) && l.inv.status === 'open' && inRange(l.inv.date, p)), (l) => `${l.inv.type}\0${l.name}`).values()]
      .map((ls) => ({ type: ls[0].inv.type.replace('_', ' '), item: ls[0].name, qty: sum(ls, (l) => l.qty), amount: sum(ls, (l) => l.total) })) },
  // ---- Accounting ----
  trial_balance: { title: 'Trial Balance Report', group: 'Transaction report', admin: true, params: ['to'], money: ['debit', 'credit'], total: ['debit', 'credit'],
    run: (d, p) => ledgers(d, p.to).L.map((x) => {
      const dr = DEBIT_SIDE.includes(x.side) ? x.amount : -x.amount;
      return { group: x.group, account: x.name, debit: dr > 0 ? dr : 0, credit: dr < 0 ? -dr : 0 };
    }) },
  account_statement: { title: 'Account Statement', hidden: true, admin: true, params: ['account', 'range'], money: ['debit', 'credit', 'balance'], total: ['debit', 'credit'],
    run: (d, p) => {
      const a = d.accounts.find((x) => 'acc:' + x.id === p.account);
      if (!a) return [];
      const dr = DEBIT_SIDE.includes(ACCOUNT_TYPES[a.type]?.[1]) ? 1 : -1;
      let bal = a.opening_balance || 0;
      const out = [{ date: '', type: 'Opening balance', ref: '', note: '', debit: 0, credit: 0, balance: bal }];
      for (const l of d.jlines.filter((x) => x.account === p.account).sort(byDate)) {
        bal = round2(bal + dr * (l.debit - l.credit));
        if (inRange(l.date, p)) out.push({ date: l.date, type: 'Journal', ref: l.no, note: l.note || '', debit: l.debit, credit: l.credit, balance: bal });
        else if (l.date < (p.from || '0000')) out[0].balance = bal;
      }
      return out;
    } },
  ledgers: { title: 'Chart of Accounts', hidden: true, admin: true, params: [], run: (d) => ledgers(d).L },
  // ---- Loyalty (Vyapar: Parties → Loyalty Points) ----
  loyalty: { title: 'Loyalty Points', hidden: true, params: [], money: ['value'],
    run: (d) => {
      const cfg = d.settings.loyalty || {};
      if (!cfg.enabled) return [];
      const redeemed = new Map(), earned = new Map();
      const pts = d.payments.filter((y) => y.mode === 'points' && y.party_id);
      for (const y of pts) redeemed.set(y.party_id, (redeemed.get(y.party_id) || 0) + ((y.direction === 'in' ? 1 : -1) * y.amount) / (cfg.point_value || 1));
      const paidByPoints = new Map(pts.filter((y) => y.invoice_id).map((y) => [y.invoice_id, y.amount]));
      for (const i of d.money) if (i.party_id && (i.type === 'sale' || i.type === 'sale_return')) {
        const base = i.total - (paidByPoints.get(i.id) || 0); // no points earned on the part paid with points
        earned.set(i.party_id, (earned.get(i.party_id) || 0) + (i.type === 'sale' ? 1 : -1) * Math.floor((base * (cfg.earn_per_100 || 0)) / 100));
      }
      return d.parties.filter((p) => earned.has(p.id) || redeemed.has(p.id)).map((p) => {
        const e = Math.max(0, earned.get(p.id) || 0), r = round2(redeemed.get(p.id) || 0), b = Math.max(0, Math.floor(e - r));
        return { party_id: p.id, name: p.name, phone: p.phone, earned: e, redeemed: r, balance: b, value: round2(b * (cfg.point_value || 0)) };
      }).sort((a, b) => b.balance - a.balance);
    } },
  by_party_group: { title: 'Sale Purchase By Party Group', group: 'Party report', params: ['range'], money: ['sale_amount', 'purchase_amount'], total: ['parties', 'sale_amount', 'purchase_amount'],
    run: (d, p) => {
      const grp = new Map(d.parties.map((x) => [x.id, x.group_name || 'No group']));
      return [...group(d.money.filter((i) => i.party_id && ['sale', 'purchase'].includes(i.type) && inRange(i.date, p)), (i) => grp.get(i.party_id) || 'No group')]
        .map(([party_group, is]) => ({ party_group, parties: new Set(is.map((i) => i.party_id)).size,
          sale_amount: sum(is.filter((i) => i.type === 'sale'), (i) => i.total), purchase_amount: sum(is.filter((i) => i.type === 'purchase'), (i) => i.total) }))
        .sort((a, b) => b.sale_amount - a.sale_amount);
    } },
  // ---- GST annual return: the GSTR-9 tables this data can fill (4: outward, 6: ITC, 9: tax payable). HSN (table 17) is in the GSTR-1 report.
  gstr9: { title: 'GSTR 9 (annual summary)', group: 'GST reports', admin: true, params: ['range'], money: ['taxable', 'igst', 'cgst', 'sgst'],
    run: (d, p) => {
      const inv = d.money.filter((i) => inRange(i.date, p));
      const row = (table, description, is, sign = 1) => ({ table, description, ...Object.fromEntries(['taxable', 'igst', 'cgst', 'sgst'].map((k) => [k, round2(sign * sum(is, (i) => i[k]))])) });
      const b2c = row('4A', 'Supplies to unregistered persons (B2C)', inv.filter((i) => i.type === 'sale' && !i.party_gstin));
      const b2b = row('4B', 'Supplies to registered persons (B2B)', inv.filter((i) => i.type === 'sale' && i.party_gstin));
      const cn = row('4I', 'Credit notes issued (sale returns)', inv.filter((i) => i.type === 'sale_return'), -1);
      const net = (table, description, rs) => ({ table, description, ...Object.fromEntries(['taxable', 'igst', 'cgst', 'sgst'].map((k) => [k, round2(rs.reduce((s, r) => s + r[k], 0))])) });
      const out = net('4N', 'Total outward supplies (4A + 4B − 4I)', [b2c, b2b, cn]);
      const itc = row('6B', 'ITC on inward supplies (purchases)', inv.filter((i) => i.type === 'purchase'));
      const dn = row('6H', 'ITC reversed on debit notes (purchase returns)', inv.filter((i) => i.type === 'purchase_return'), -1);
      return [b2c, b2b, cn, out, itc, dn, net('6O', 'Net ITC availed (6B − 6H)', [itc, dn]), { ...net('9', 'Tax payable on outward supplies', [out]), taxable: null }];
    } },
  // ---- TDS / TCS (Vyapar's Taxes reports). PAN is characters 3-12 of the GSTIN.
  tds_receivable: { title: 'TDS Receivable', group: 'Taxes', params: ['range'], money: ['amount', 'tds'], total: ['amount', 'tds'],
    run: (d, p) => tdsRows(d, p, 'in') },
  tds_payable: { title: 'TDS Payable', group: 'Taxes', params: ['range'], money: ['amount', 'tds'], total: ['amount', 'tds'],
    run: (d, p) => tdsRows(d, p, 'out') },
  tcs_receivable: { title: 'TCS Receivable', group: 'Taxes', params: ['range'], money: ['total', 'tcs'], total: ['total', 'tcs'],
    run: (d, p) => d.money.filter((i) => i.tcs && i.type.startsWith('purchase') && inRange(i.date, p)).sort(byDate)
      .map((i) => ({ date: i.date, no: i.no, party: i.party_name, type: i.type.replace('_', ' '), total: i.total, tcs: (i.type === 'purchase' ? 1 : -1) * i.tcs })) },
  form_27eq: { title: 'Form No. 27EQ', group: 'Taxes', params: ['range'], money: ['collected_on', 'tcs'], total: ['bills', 'collected_on', 'tcs'],
    run: (d, p) => [...group(d.money.filter((i) => i.tcs && i.type.startsWith('sale') && inRange(i.date, p)), (i) => i.party_id || i.party_name)].map(([, is]) => {
      const s = (i) => (i.type === 'sale' ? 1 : -1);
      return { party: is[0].party_name, pan: is[0].party_gstin?.slice(2, 12) || '', bills: is.length, collected_on: sum(is, (i) => s(i) * (i.total - i.tcs)), tcs: sum(is, (i) => s(i) * i.tcs) };
    }) },
  // Utilities → Export To Tally: everything toTallyXml (tally.js) needs for a date range.
  tally_export: { title: 'Export To Tally', hidden: true, admin: true, params: ['range'],
    run: (d, p) => {
      const party = new Map(d.parties.map((x) => [x.id, x]));
      return [{
        parties: [...new Set(d.money.map((i) => i.party_id).concat(d.payments.map((y) => y.party_id)).filter(Boolean))].map((id) => party.get(id)).filter(Boolean),
        invoices: d.money.filter((i) => inRange(i.date, p)).sort(byDate).map((i) => ({ ...i, party: party.get(i.party_id)?.name })),
        payments: d.payments.filter((y) => inRange(y.date, p) && (y.party_id || y.mode !== 'points')).sort(byDate)
          .map((y) => ({ ...y, party: party.get(y.party_id)?.name, ledger: 'Owner Capital' })), // party-less = cash added/withdrawn by the owner
        expenses: d.expenses.filter((e) => inRange(e.date, p)).sort(byDate),
      }];
    } },
  // Vyapar's Utilities → Verify My Data: things that are internally inconsistent or will make reports wrong.
  verify: { title: 'Verify My Data', hidden: true, admin: true, params: [],
    run: (d) => {
      const out = [], add = (check, ref, detail) => out.push({ check, ref, detail });
      const linesOf = group(d.lines, (l) => l.invoice_id), movesOf = group(d.moves.filter((m) => m.ref_id), (m) => m.ref_id);
      const paysOf = group(d.payments.filter((y) => y.invoice_id), (y) => y.invoice_id);
      const SIGN = { sale: -1, purchase_return: -1, purchase: 1, sale_return: 1 };
      for (const i of d.invoices) {
        const ls = linesOf.get(i.id) || [];
        if (Math.abs(sum(ls, (l) => l.total) + (i.tcs || 0) - i.total) > 0.51) add('Invoice total ≠ its items', i.no, `Total ${i.total}, items add to ${sum(ls, (l) => l.total)}`);
        if (!SIGN[i.type]) continue;
        const pays = sum(paysOf.get(i.id) || [], (y) => y.amount + (y.tds || 0));
        if (Math.abs(i.paid - Math.min(pays, i.total)) > 0.01) add('Paid amount ≠ payments', i.no, `Shows paid ${i.paid}, payments recorded ${pays}`);
        // online-order invoices take stock at the order, not the invoice
        if (!i.order_id && Math.abs(sum(movesOf.get(i.id) || [], (m) => m.qty) - SIGN[i.type] * sum(ls, (l) => l.qty)) > 0.001) add('Stock not moved for invoice', i.no, `${i.type.replace('_', ' ')} on ${i.date}`);
      }
      const stock = new Map([...group(d.moves, (m) => m.item_id)].map(([id, ms]) => [id, sum(ms, (m) => m.qty)]));
      for (const it of d.items.values()) {
        if (stock.get(it.id) < 0) add('Negative stock', it.name, `Stock ${stock.get(it.id)}: a purchase or opening stock is missing`);
        if ((stock.get(it.id) || 0) > 0 && !(it.purchase_price > 0)) add('No purchase price', it.name, 'Profit and stock value are overstated');
        if (!it.hsn) add('No HSN code', it.name, 'Needed for GSTR-1 HSN summary');
      }
      for (const p of d.parties) if (p.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(p.gstin)) add('Invalid GSTIN', p.name, p.gstin);
      return out;
    } },
  // Party-wise item rates: the last rate this party was billed for each item.
  party_rates: { title: 'Party rates', hidden: true, params: ['party'],
    run: (d, p) => [...group(d.lines.filter((l) => l.inv.party_id === p.party_id && !l.inv.type.endsWith('return')).sort((a, b) => byDate(a.inv, b.inv)), (l) => l.item_id)]
      .map(([item_id, ls]) => ({ item_id, rate: ls.at(-1).rate, date: ls.at(-1).inv.date })) },
  // Not a table on its own: balances for the Cash & Bank screen.
  cash_bank: { title: 'Cash & Bank balances', hidden: true, params: [], money: ['balance'],
    run: (d) => [...group(cashRows(d), (r) => r.mode)].map(([mode, rs]) => ({ mode, money_in: sum(rs, (r) => r.in), money_out: sum(rs, (r) => r.out), balance: sum(rs, (r) => r.in - r.out) })) },
};

// Journal entry rules (Vyapar: debits must equal credits). Returns the cleaned lines or throws a message.
export function checkJournal(body, accounts) {
  const lines = (body.lines || []).map((l) => ({ account: String(l.account || ''), debit: round2(+l.debit || 0), credit: round2(+l.credit || 0) }))
    .filter((l) => l.account && (l.debit || l.credit));
  if (lines.length < 2) throw new Error('A journal needs at least two lines');
  for (const l of lines) {
    if (l.debit < 0 || l.credit < 0 || (l.debit && l.credit)) throw new Error('Each line is either a debit or a credit');
    const ok = l.account.startsWith('mode:') ? MODE_NAMES[l.account.slice(5)] : accounts.some((a) => 'acc:' + a.id === l.account);
    if (!ok) throw new Error('Unknown account in journal');
  }
  const dr = sum(lines, (l) => l.debit), cr = sum(lines, (l) => l.credit);
  if (dr !== cr) throw new Error(`Debit ₹${dr} and credit ₹${cr} must be equal`);
  return lines;
}

// Points a customer can still redeem, in rupees. Billing and Payment-In check this before accepting mode 'points'.
export function pointsValue(rows, branch, party_id) {
  return REPORTS.loyalty.run(load(rows, branch), {}).find((x) => x.party_id === party_id)?.value || 0;
}

export function runReport(name, rows, branch, params = {}, role = 'admin') {
  const r = REPORTS[name];
  if (!r) throw Object.assign(new Error('Unknown report'), { user: true });
  if (r.admin && role !== 'admin') throw Object.assign(new Error('Admin only'), { user: true, status: 403 });
  return r.run(load(rows, branch), params);
}

// Insights: what the numbers mean and what to do about them, worked out from the shop's own data (offline, no AI needed).
// d = the loaded data from reports.js load(); extra = results of other reports (refills, lapsed) so they aren't computed twice.
// Each section: { kpis: [{ label, value, kind: money|pct|num|text, sub }], insights: [Insight] }
// Insight: { id, level: bad|warn|good|info, title, detail, action?: { label, href }, table?: { columns, rows, money } }
// Severity drives order and colour; `title` says what is happening, `detail` why it matters and what to do.
// ponytail: plain heuristics with fixed thresholds (10 days of cover, 60 days unsold, 12% margin...); tune the T table, not the code.
import { round2, today as todayFn, addDays } from './index.js';

export const INSIGHT_SECTIONS = {
  sales: 'Sales', stock: 'Stock', profit: 'Profit', customers: 'Customers', money: 'Money', staff: 'Staff', online: 'Online store',
};
const T = { coverDays: 10, deadDays: 60, overstockDays: 120, lowMargin: 12, highDiscount: 8, overdueDays: 30, minQty: 3 };
const LEVEL = { bad: 0, warn: 1, good: 2, info: 3 }; // problems, then wins, then background

const sum = (a, f) => round2(a.reduce((s, x) => s + (Number(f(x)) || 0), 0));
const group = (a, key) => { const m = new Map(); for (const x of a) { const k = key(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; };
const pct = (a, b) => (b ? round2((a / b) * 100) : 0);
const change = (now, before) => (before ? round2(((now - before) / before) * 100) : null);
const rs = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const istHour = (ts) => (new Date(ts).getUTCHours() + 5 + (new Date(ts).getUTCMinutes() + 30 >= 60 ? 1 : 0)) % 24; // created_at is UTC; the shop is IST

export function insights(d, p = {}, extra = {}) {
  const now = p.today || todayFn();
  const from = (n) => addDays(now, -n);
  const month = now.slice(0, 7), dom = +now.slice(8, 10);
  const lastMonthStart = new Date(+now.slice(0, 4), +now.slice(5, 7) - 2, 1).toLocaleDateString('en-CA');
  const lastMonthSameDay = addDays(lastMonthStart, dom - 1);
  const sales = d.invoices.filter((i) => i.type === 'sale');
  const returns = d.invoices.filter((i) => i.type === 'sale_return');
  const saleLines = d.lines.filter((l) => l.inv.type === 'sale');
  const inRange = (date, a, b) => date >= a && date <= b;
  const stock = new Map();
  const firstIn = new Map(); // when stock first arrived: new stock isn't "dead" just because it hasn't sold yet
  for (const m of d.moves) {
    stock.set(m.item_id, (stock.get(m.item_id) || 0) + m.qty);
    const day = (m.created_at || '').slice(0, 10);
    if (m.qty > 0 && day && (!firstIn.has(m.item_id) || day < firstIn.get(m.item_id))) firstIn.set(m.item_id, day);
  }
  const stockOf = (id) => round2(stock.get(id) || 0);
  const item = (id) => d.items.get(id) || {};
  const out = Object.fromEntries(Object.keys(INSIGHT_SECTIONS).map((k) => [k, { kpis: [], insights: [] }]));
  const add = (s, x) => out[s].insights.push(x);

  // ---------------- Sales ----------------
  {
    const mtd = sales.filter((i) => i.date.startsWith(month)), lmtd = sales.filter((i) => inRange(i.date, lastMonthStart, lastMonthSameDay));
    const t = sum(mtd, (i) => i.total), lt = sum(lmtd, (i) => i.total), ch = change(t, lt);
    const last30 = sales.filter((i) => i.date > from(30)), prev30 = sales.filter((i) => inRange(i.date, from(60), from(31)));
    const avg = last30.length ? round2(sum(last30, (i) => i.total) / last30.length) : 0, pavg = prev30.length ? round2(sum(prev30, (i) => i.total) / prev30.length) : 0;
    out.sales.kpis.push({ label: 'Sales this month', value: t, kind: 'money', sub: ch == null ? `${mtd.length} bills` : `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}% vs same days last month` },
      { label: 'Average bill (30 days)', value: avg, kind: 'money', sub: pavg ? `${change(avg, pavg) >= 0 ? '▲' : '▼'} ${Math.abs(change(avg, pavg))}% vs the 30 days before` : '' },
      { label: 'Bills a day (30 days)', value: round2(last30.length / 30), kind: 'num' },
      { label: 'Returns (30 days)', value: pct(sum(returns.filter((i) => i.date > from(30)), (i) => i.total), sum(last30, (i) => i.total)), kind: 'pct', sub: 'of sales' });
    if (ch != null && lt > 0) add('sales', ch <= -10
      ? { id: 'pace', impact: Math.max(0, lt - t), level: 'bad', title: `Sales are ${Math.abs(ch)}% behind last month`, detail: `${rs(t)} so far against ${rs(lt)} by this day last month. Check the falling items below, message lapsed customers (Follow-ups) and consider an offer on your slowest day.`, action: { label: 'Open Follow-ups', href: '#/followups?tab=lapsed' } }
      : ch >= 10 ? { id: 'pace', impact: Math.max(0, lt - t), level: 'good', title: `Sales are up ${ch}% on last month`, detail: `${rs(t)} so far against ${rs(lt)} by this day last month. Keep the fast movers in stock (see Stock).` }
        : { id: 'pace', impact: Math.max(0, lt - t), level: 'info', title: `Sales are level with last month (${ch >= 0 ? '+' : ''}${ch}%)`, detail: `${rs(t)} so far against ${rs(lt)} by this day last month.` });
    // weekday pattern over 8 weeks
    const wk = sales.filter((i) => i.date > from(56));
    if (wk.length >= 10) {
      const byDay = DAYS.map((n, k) => ({ day: n, sales: sum(wk.filter((i) => new Date(i.date + 'T00:00').getDay() === k), (i) => i.total) }));
      const sorted = [...byDay].sort((a, b) => b.sales - a.sales), best = sorted[0], worst = sorted.at(-1);
      add('sales', { id: 'weekday', level: 'info', title: `${best.day} is your strongest day, ${worst.day} the weakest`, detail: `Over the last 8 weeks ${best.day} brought ${rs(best.sales)} against ${rs(worst.sales)} on ${worst.day}. Put more staff on ${best.day}s; try a “${worst.day} special” offer or a WhatsApp broadcast to lift the slow day.`,
        table: { columns: ['day', 'sales'], money: ['sales'], rows: byDay } });
    }
    // busiest hours at the counter
    const counter = last30.filter((i) => !i.order_id && i.created_at);
    if (counter.length >= 10) {
      const hours = Array.from({ length: 24 }, (_, h) => ({ h, n: counter.filter((i) => istHour(i.created_at) === h).length }));
      const peak = hours.map((x, h) => ({ h, n: x.n + (hours[h + 1]?.n || 0) })).sort((a, b) => b.n - a.n)[0];
      add('sales', { id: 'hours', level: 'info', title: `Rush hour is ${peak.h}:00–${peak.h + 2}:00`, detail: `${peak.n} of ${counter.length} counter bills in the last 30 days were made then. Keep a second person at the counter and stock the shelves before it starts.`,
        table: { columns: ['hour', 'bills'], rows: hours.filter((x) => x.n).map((x) => ({ hour: `${x.h}:00`, bills: x.n })) } });
    }
    // rising / falling items
    const q = (ls) => { const m = new Map(); for (const l of ls) m.set(l.item_id, (m.get(l.item_id) || 0) + l.qty); return m; };
    const a = q(saleLines.filter((l) => l.inv.date > from(30))), b = q(saleLines.filter((l) => inRange(l.inv.date, from(60), from(31))));
    const moves = [...new Set([...a.keys(), ...b.keys()])].map((id) => ({ item: item(id).name || '?', now: round2(a.get(id) || 0), before: round2(b.get(id) || 0) }))
      .filter((x) => x.now + x.before >= T.minQty).map((x) => ({ ...x, change_pct: x.before ? change(x.now, x.before) : 100 }));
    const up = moves.filter((x) => x.now > x.before).sort((x, y) => y.now - y.before - (x.now - x.before)).slice(0, 8);
    const down = moves.filter((x) => x.now < x.before).sort((x, y) => x.now - x.before - (y.now - y.before)).slice(0, 8);
    if (up.length) add('sales', { id: 'rising', level: 'good', title: `${up[0].item} is picking up`, detail: `${up.length} item${up.length > 1 ? 's sell' : ' sells'} more than the month before. Make sure they don't run out and keep them at eye level.`, table: { columns: ['item', 'now', 'before', 'change_pct'], rows: up } });
    if (down.length) add('sales', { id: 'falling', impact: 0, level: 'warn', title: `${down[0].item} is slowing down`, detail: `${down.length} item${down.length > 1 ? 's sell' : ' sells'} less than the month before. Check price against the website / competitors, move them to the counter, or bundle them with a fast mover.`, table: { columns: ['item', 'now', 'before', 'change_pct'], rows: down } });
    // bought together → combo ideas
    const bills = group(saleLines.filter((l) => l.inv.date > from(90)), (l) => l.invoice_id), pairs = new Map();
    for (const ls of bills.values()) {
      const ids = [...new Set(ls.map((l) => l.item_id))].sort();
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = ids[i] + '|' + ids[j]; pairs.set(k, (pairs.get(k) || 0) + 1); }
    }
    const top = [...pairs].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => { const [x, y] = k.split('|'); return { items: `${item(x).name} + ${item(y).name}`, bills: n }; });
    if (top.length) add('sales', { id: 'combos', level: 'info', title: 'Combo ideas from what people buy together', detail: `“${top[0].items}” were on the same bill ${top[0].bills} times in 90 days. Offer these as combos (a small discount on the pair) to raise the average bill.`, table: { columns: ['items', 'bills'], rows: top } });
  }

  // ---------------- Stock ----------------
  {
    const sold30 = new Map(), last = new Map();
    for (const l of saleLines) {
      if (l.inv.date > from(30)) sold30.set(l.item_id, (sold30.get(l.item_id) || 0) + l.qty);
      if (!last.has(l.item_id) || l.inv.date > last.get(l.item_id)) last.set(l.item_id, l.inv.date);
    }
    const all = [...d.items.values()].map((i) => {
      const qty = stockOf(i.id), perDay = round2((sold30.get(i.id) || 0) / 30), cost = Number(i.purchase_price) || 0;
      return { id: i.id, item: i.name, stock: qty, per_day: perDay, cover_days: perDay ? Math.floor(qty / perDay) : null, last_sold: last.get(i.id) || null, value: round2(Math.max(qty, 0) * (cost || Number(i.sale_price) || 0)), cost };
    });
    const out_ = all.filter((x) => x.per_day > 0 && x.cover_days < T.coverDays).sort((a, b) => a.cover_days - b.cover_days)
      .map((x) => ({ item: x.item, stock: x.stock, per_day: x.per_day, days_left: Math.max(0, x.cover_days), order_qty: Math.ceil(x.per_day * 30 - Math.max(0, x.stock)),
        lost: round2(x.per_day * Math.max(0, 30 - Math.max(0, x.cover_days)) * (Number(item(x.id).sale_price) || 0)) })); // sales missed in a month if not reordered
    const dead = all.filter((x) => x.stock > 0 && (firstIn.get(x.id) || now) < from(T.deadDays) && (!x.last_sold || x.last_sold < from(T.deadDays))).sort((a, b) => b.value - a.value)
      .map((x) => ({ item: x.item, stock: x.stock, last_sold: x.last_sold || 'never', value: x.value }));
    const over = all.filter((x) => x.per_day > 0 && x.cover_days > T.overstockDays).sort((a, b) => b.value - a.value)
      .map((x) => ({ item: x.item, stock: x.stock, per_day: x.per_day, cover_days: x.cover_days, value: x.value }));
    const until = addDays(now, 60), batches = group(d.moves.filter((m) => m.expiry), (m) => `${m.item_id}|${m.batch_no || ''}|${m.expiry}`);
    const expiring = [...batches].map(([k, ms]) => { const [id, batch, exp] = k.split('|'); return { item: item(id).name, batch, expiry: exp, qty: sum(ms, (m) => m.qty), price: Number(item(id).sale_price) || 0 }; })
      .filter((x) => x.qty > 0 && x.expiry <= until).sort((a, b) => a.expiry.localeCompare(b.expiry)).map(({ price, ...x }) => ({ ...x, value: round2(x.qty * price) }));
    const noCost = all.filter((x) => x.stock > 0 && !x.cost).length;
    const deadValue = sum(dead, (x) => x.value);
    out.stock.kpis.push({ label: 'Running out (< 10 days)', value: out_.length, kind: 'num', sub: 'items selling now' },
      { label: 'Not sold in 60 days', value: deadValue, kind: 'money', sub: `${dead.length} items holding cash` },
      { label: 'Expiring in 60 days', value: sum(expiring, (x) => x.value), kind: 'money', sub: `${expiring.length} batches` },
      { label: 'Items with no cost price', value: noCost, kind: 'num', sub: 'profit can’t be measured' });
    if (out_.length) add('stock', { id: 'reorder', impact: sum(out_, (r) => r.lost), level: 'bad', title: `${out_.length} selling item${out_.length > 1 ? 's' : ''} will run out within ${T.coverDays} days`, detail: `${out_[0].item} ${out_[0].days_left ? `has about ${out_[0].days_left} days left at today's pace` : 'is already out of stock'}. Order roughly a month's worth (order qty below) before the weekend rush.`, action: { label: 'Create purchase order', href: '#/bill/purchase_order?low=1' }, table: { columns: ['item', 'stock', 'per_day', 'days_left', 'order_qty'], rows: out_ } });
    if (dead.length) add('stock', { id: 'dead', impact: deadValue, level: deadValue > 50000 ? 'bad' : 'warn', title: `${rs(deadValue)} is stuck in items that haven't sold for ${T.deadDays} days`, detail: `${dead.length} items. Run a clearance offer, bundle them with best sellers, move them online, or return them to the supplier while you still can.`, action: { label: 'Create an offer', href: '#/online/offers' }, table: { columns: ['item', 'stock', 'last_sold', 'value'], money: ['value'], rows: dead } });
    if (expiring.length) add('stock', { id: 'expiry', impact: sum(expiring, (x) => x.value), level: expiring.some((x) => x.expiry <= addDays(now, 15)) ? 'bad' : 'warn', title: `${expiring.length} batch${expiring.length > 1 ? 'es expire' : ' expires'} within 60 days`, detail: `Worth ${rs(sum(expiring, (x) => x.value))} at selling price. Billing already suggests a discount on these; push them to regulars first (they sell earliest-expiry first automatically).`, action: { label: 'Review near-expiry offers', href: '#/online/offers?tab=expiry' }, table: { columns: ['item', 'batch', 'expiry', 'qty', 'value'], money: ['value'], rows: expiring } });
    if (over.length) add('stock', { id: 'overstock', level: 'info', title: `${over.length} item${over.length > 1 ? 's have' : ' has'} more than ${T.overstockDays} days of stock`, detail: `${over[0].item}: ${over[0].cover_days} days at today's pace. Skip them on the next order and use the cash for fast movers.`, table: { columns: ['item', 'stock', 'per_day', 'cover_days', 'value'], money: ['value'], rows: over } });
    if (noCost) add('stock', { id: 'nocost', impact: 0, level: 'warn', title: `${noCost} items in stock have no purchase cost`, detail: 'Profit and stock value are overstated until costs are entered. Enter the next supplier bill as a Purchase (it fills the cost), or set it in Items → Edit.', action: { label: 'Open Items', href: '#/items' } });
  }

  // ---------------- Profit ----------------
  {
    const margin = (ls) => { const rev = sum(ls, (l) => l.taxable), cost = sum(ls, (l) => l.cost * l.qty); return { rev, cost, gp: round2(rev - cost), pct: pct(rev - cost, rev) }; };
    const costed = saleLines.filter((l) => l.cost > 0);
    const m = margin(costed.filter((l) => l.inv.date.startsWith(month))), lm = margin(costed.filter((l) => inRange(l.inv.date, lastMonthStart, addDays(month + '-01', -1))));
    const exp = sum(d.expenses.filter((e) => e.date.startsWith(month)), (e) => e.amount);
    const gross30 = sum(saleLines.filter((l) => l.inv.date > from(30)), (l) => l.qty * l.rate), net30 = sum(saleLines.filter((l) => l.inv.date > from(30)), (l) => l.total);
    const disc = pct(gross30 - net30, gross30);
    out.profit.kpis.push({ label: 'Gross margin this month', value: m.pct, kind: 'pct', sub: lm.rev ? `${m.pct >= lm.pct ? '▲' : '▼'} from ${lm.pct}% last month` : 'items with a cost price' },
      { label: 'Gross profit this month', value: m.gp, kind: 'money' },
      { label: 'Expenses this month', value: exp, kind: 'money', sub: m.gp ? `${pct(exp, m.gp)}% of gross profit` : '' },
      { label: 'Discount given (30 days)', value: disc, kind: 'pct', sub: `${rs(gross30 - net30)} off list price` });
    if (lm.rev && m.rev && m.pct < lm.pct - 2) add('profit', { id: 'margin', impact: round2(((lm.pct - m.pct) / 100) * m.rev), level: 'warn', title: `Margin fell from ${lm.pct}% to ${m.pct}%`, detail: 'Either more discount is going out or costs went up without a price change. Check the low-margin items and the discount figures below.' });
    const byItem = [...group(costed.filter((l) => l.inv.date > from(30)), (l) => l.item_id)].map(([id, ls]) => ({ item: item(id).name, qty: sum(ls, (l) => l.qty), ...margin(ls) }))
      .filter((x) => x.rev > 0);
    const low = byItem.filter((x) => x.pct < T.lowMargin).sort((a, b) => b.rev - a.rev).map((x) => ({ item: x.item, qty: x.qty, sales: x.rev, profit: x.gp, margin_pct: x.pct }));
    if (low.length) add('profit', { id: 'lowmargin', impact: round2(sum(low, (x) => (x.sales * (T.lowMargin - x.margin_pct)) / 100)), level: low.some((x) => x.profit < 0) ? 'bad' : 'warn', title: `${low.length} item${low.length > 1 ? 's sell' : ' sells'} under ${T.lowMargin}% margin`, detail: `${low[0].item} made ${low[0].margin_pct}% on ${rs(low[0].sales)} of sales. Raise the price to MRP, stop discounting it, or ask the distributor for a better rate.`, table: { columns: ['item', 'qty', 'sales', 'profit', 'margin_pct'], money: ['sales', 'profit'], rows: low } });
    const best = byItem.filter((x) => x.qty >= 2).sort((a, b) => b.gp - a.gp).slice(0, 8).map((x) => ({ item: x.item, qty: x.qty, profit: x.gp, margin_pct: x.pct }));
    if (best.length) add('profit', { id: 'earners', level: 'good', title: `${best[0].item} earns you the most`, detail: 'These make the most profit in rupees. Never let them run out, place them where people see them first, and recommend them at the counter.', table: { columns: ['item', 'qty', 'profit', 'margin_pct'], money: ['profit'], rows: best } });
    if (disc >= T.highDiscount) {
      const byStaff = [...group(d.invoices.filter((i) => i.type === 'sale' && i.date > from(30)), (i) => i.salesperson || i.created_by || '—')]
        .map(([staff, is]) => ({ staff, bills: is.length, discount: sum(is, (i) => i.discount), discount_pct: pct(sum(is, (i) => i.discount), sum(is, (i) => i.subtotal)) })).sort((a, b) => b.discount_pct - a.discount_pct);
      add('profit', { id: 'discount', impact: round2(gross30 - net30), level: 'warn', title: `${disc}% of list price went out as discount in 30 days`, detail: `That's ${rs(gross30 - net30)}. Set a cashier discount limit (Settings → Staff & permissions) and keep bigger discounts for regulars and combos.`, action: { label: 'Set a discount limit', href: '#/settings?s=staff' }, table: { columns: ['staff', 'bills', 'discount', 'discount_pct'], money: ['discount'], rows: byStaff } });
    }
    const cats = [...group(costed.filter((l) => l.inv.date > from(90)), (l) => d.catOf(l.item_id))].map(([category, ls]) => ({ category, ...margin(ls) })).filter((x) => x.rev > 0).sort((a, b) => b.pct - a.pct)
      .map((x) => ({ category: x.category, sales: x.rev, profit: x.gp, margin_pct: x.pct }));
    if (cats.length > 1) add('profit', { id: 'categories', level: 'info', title: `${cats[0].category} has the best margin (${cats[0].margin_pct}%), ${cats.at(-1).category} the lowest (${cats.at(-1).margin_pct}%)`, detail: 'Over 90 days. Grow the high-margin categories with shelf space and staff recommendations; review prices in the low ones.', table: { columns: ['category', 'sales', 'profit', 'margin_pct'], money: ['sales', 'profit'], rows: cats } });
    if (m.gp && exp > m.gp) add('profit', { id: 'expenses', impact: round2(exp - m.gp), level: 'bad', title: 'Expenses are higher than gross profit this month', detail: `${rs(exp)} of expenses against ${rs(m.gp)} gross profit: the shop is losing money this month so far. Check Reports → Expense Category.`, action: { label: 'Expense report', href: '#/reports?r=expense_category' } });
  }

  // ---------------- Customers ----------------
  {
    const s90 = sales.filter((i) => i.date > from(90)), named = s90.filter((i) => i.party_id);
    const visits = group(named, (i) => i.party_id), repeat = [...visits.values()].filter((v) => v.length >= 2).length;
    const walkIn = pct(sum(s90.filter((i) => !i.party_id), (i) => i.total), sum(s90, (i) => i.total));
    const firstSeen = new Map();
    for (const i of sales) if (i.party_id && (!firstSeen.has(i.party_id) || i.date < firstSeen.get(i.party_id))) firstSeen.set(i.party_id, i.date);
    const newThisMonth = [...firstSeen.values()].filter((x) => x.startsWith(month)).length;
    const refills = extra.refills || [], lapsed = extra.lapsed || [];
    out.customers.kpis.push({ label: 'Come back again (90 days)', value: pct(repeat, visits.size), kind: 'pct', sub: `${repeat} of ${visits.size} named customers` },
      { label: 'Walk-in sales (no name)', value: walkIn, kind: 'pct', sub: 'can’t be followed up' },
      { label: 'New customers this month', value: newThisMonth, kind: 'num' },
      { label: 'Refills due this week', value: refills.length, kind: 'num' });
    if (refills.length) add('customers', { id: 'refills', impact: round2(refills.length * (named.length ? sum(named, (i) => i.total) / named.length : 0)), level: 'warn', title: `${refills.length} customer${refills.length > 1 ? 's are' : ' is'} about to run out`, detail: 'Their last pack should be finishing this week. A WhatsApp now usually brings them back to you instead of an online store.', action: { label: 'Message them', href: '#/followups?tab=refills' }, table: { columns: ['name', 'item', 'last_bought', 'days_left'], rows: refills, pii: true } });
    if (lapsed.length) add('customers', { id: 'lapsed', impact: round2(sum(lapsed, (x) => x.spent / Math.max(1, x.bills))), level: 'warn', title: `${lapsed.length} regular${lapsed.length > 1 ? 's have' : ' has'} stopped coming`, detail: `They spent ${rs(sum(lapsed, (x) => x.spent))} with you before and nothing in 60 days. Send a “we miss you” message with a small offer.`, action: { label: 'Message them', href: '#/followups?tab=lapsed' }, table: { columns: ['name', 'last_visit', 'bills', 'spent'], money: ['spent'], rows: lapsed, pii: true } });
    if (walkIn >= 50) add('customers', { id: 'walkin', level: 'info', title: `${walkIn}% of sales have no customer name`, detail: 'Type the phone number on the bill (F3) for regular buyers: you get refill reminders, loyalty points and their buying history, and they come back more.' });
    const top = [...visits].map(([id, is]) => ({ name: d.parties.find((x) => x.id === id)?.name || is[0].party_name, bills: is.length, spent: sum(is, (i) => i.total) })).sort((a, b) => b.spent - a.spent);
    const top5 = sum(top.slice(0, 5), (x) => x.spent), share = pct(top5, sum(named, (i) => i.total));
    if (top.length >= 5) add('customers', { id: 'top', level: share > 50 ? 'warn' : 'info', title: `Your top 5 customers bring ${share}% of named sales`, detail: share > 50 ? 'A lot depends on a few people. Give them special rates (Parties → Edit → Regular buyer rates) and look after them personally.' : 'Thank them with loyalty points or special rates so they stay.', table: { columns: ['name', 'bills', 'spent'], money: ['spent'], rows: top.slice(0, 10), pii: true } });
  }

  // ---------------- Money ----------------
  {
    const paidMap = (i) => round2(i.total - (i.paid || 0));
    const open = sales.filter((i) => i.party_id && paidMap(i) > 0.5);
    const overdue = open.filter((i) => (i.due_date || addDays(i.date, T.overdueDays)) < now).map((i) => ({ bill: i.no, customer: i.party_name, date: i.date, due: paidMap(i), days: Math.round((new Date(now) - new Date(i.date)) / 864e5) })).sort((a, b) => b.due - a.due);
    const pay30 = d.payments.filter((y) => y.direction === 'in' && y.date > from(30) && !['points', 'exchange'].includes(y.mode));
    const mix = [...group(pay30, (y) => (y.mode.startsWith('bank') ? 'bank' : y.mode))].map(([mode, ys]) => ({ mode, amount: sum(ys, (y) => y.amount), share_pct: pct(sum(ys, (y) => y.amount), sum(pay30, (y) => y.amount)) })).sort((a, b) => b.amount - a.amount);
    const closes = d.closes.filter((c) => c.date > from(30)), short = closes.filter((c) => c.diff < 0);
    const lastWeek = Array.from({ length: 7 }, (_, k) => addDays(now, -k - 1)), open7 = lastWeek.filter((day) => sales.some((i) => i.date === day) && !d.closes.some((c) => c.date === day));
    out.money.kpis.push({ label: 'To collect', value: sum(open, paidMap), kind: 'money', sub: `${open.length} unpaid bills` },
      { label: 'Overdue (30+ days)', value: sum(overdue, (x) => x.due), kind: 'money', sub: `${overdue.length} bills` },
      { label: 'Paid by UPI (30 days)', value: mix.find((x) => x.mode === 'upi')?.share_pct || 0, kind: 'pct' },
      { label: 'Cash short (30 days)', value: -sum(short, (c) => c.diff), kind: 'money', sub: `${short.length} of ${closes.length} day closes` });
    if (overdue.length) add('money', { id: 'overdue', impact: sum(overdue, (x) => x.due), level: 'bad', title: `${rs(sum(overdue, (x) => x.due))} is overdue from ${new Set(overdue.map((x) => x.customer)).size} customer${new Set(overdue.map((x) => x.customer)).size > 1 ? 's' : ''}`, detail: `The oldest bill is ${overdue.reduce((a, x) => Math.max(a, x.days), 0)} days old. Send reminders (Follow-ups → Payment due) and stop credit for customers past their limit.`, action: { label: 'Send reminders', href: '#/followups?tab=dues' }, table: { columns: ['bill', 'customer', 'date', 'days', 'due'], money: ['due'], rows: overdue, pii: true } });
    if (short.length >= 2) add('money', { id: 'shortages', impact: -sum(short, (c) => c.diff), level: 'warn', title: `Cash came up short on ${short.length} days this month`, detail: `${rs(-sum(short, (c) => c.diff))} in total. Count the drawer at shift change, and check edits and cancels in the audit trail on those days.`, action: { label: 'Audit trail', href: '#/reports?r=audit' }, table: { columns: ['date', 'closed_by', 'diff'], money: ['diff'], rows: short.map((c) => ({ date: c.date, closed_by: c.closed_by, diff: c.diff })) } });
    if (open7.length) add('money', { id: 'unclosed', level: 'info', title: `The day wasn't closed on ${open7.length} of the last 7 days`, detail: 'Closing the day takes a minute and catches cash mistakes the same evening, while people still remember.', action: { label: 'Day close', href: '#/dayclose' } });
    if (mix.length) add('money', { id: 'mix', level: 'info', title: `${mix[0].mode.toUpperCase()} is how most customers pay (${mix[0].share_pct}%)`, detail: 'Put your UPI QR on every bill (Settings → Bill printing) so customers can pay dues on their own.', table: { columns: ['mode', 'amount', 'share_pct'], money: ['amount'], rows: mix } });
  }

  // ---------------- Staff ----------------
  {
    const s30 = sales.filter((i) => i.date > from(30) && !i.order_id);
    const by = [...group(s30, (i) => i.salesperson || i.created_by || '—')].map(([staff, is]) => ({ staff, bills: is.length, sales: sum(is, (i) => i.total), avg_bill: round2(sum(is, (i) => i.total) / is.length), discount_pct: pct(sum(is, (i) => i.discount), sum(is, (i) => i.subtotal)) })).sort((a, b) => b.sales - a.sales);
    const edits = [...group(d.audit.filter((a) => a.created_at.slice(0, 10) > from(30)), (a) => a.by || '—')].map(([by_, as]) => ({ staff: by_, edits: as.filter((a) => a.action === 'edit').length, cancels: as.filter((a) => a.action === 'cancel').length, other: as.filter((a) => !['edit', 'cancel'].includes(a.action)).length }));
    out.staff.kpis.push({ label: 'People billing (30 days)', value: by.length, kind: 'num' },
      { label: 'Top seller', value: by[0]?.staff || '—', kind: 'text', sub: by[0] ? rs(by[0].sales) : '' },
      { label: 'Edits & cancels (30 days)', value: sum(edits, (x) => x.edits + x.cancels), kind: 'num' });
    if (by.length > 1) {
      const avg = round2(sum(by, (x) => x.avg_bill) / by.length), best = [...by].sort((a, b) => b.avg_bill - a.avg_bill)[0];
      add('staff', { id: 'avgbill', level: 'info', title: `${best.staff} sells the biggest bills (${rs(best.avg_bill)} average)`, detail: `The team average is ${rs(avg)}. Have them show others how they suggest add-ons (shaker, creatine with whey); a small incentive helps (Settings → Staff & permissions).`, table: { columns: ['staff', 'bills', 'sales', 'avg_bill', 'discount_pct'], money: ['sales', 'avg_bill'], rows: by } });
    } else if (by.length) add('staff', { id: 'avgbill', level: 'info', title: `${by[0].staff} made all counter bills in 30 days`, detail: 'Give each person their own login (Settings → Staff & permissions) to see who sells what and pay incentives fairly.' });
    const flagged = edits.filter((x) => x.edits + x.cancels >= 5);
    if (flagged.length) add('staff', { id: 'edits', level: 'warn', title: `${flagged[0].staff} edited or cancelled ${flagged[0].edits + flagged[0].cancels} bills in 30 days`, detail: 'Frequent changes are usually training gaps, sometimes worse. Read the reasons in the audit trail.', action: { label: 'Audit trail', href: '#/reports?r=audit' }, table: { columns: ['staff', 'edits', 'cancels', 'other'], rows: edits } });
  }

  // ---------------- Online store ----------------
  {
    const s30 = sales.filter((i) => i.date > from(30)), web = s30.filter((i) => i.order_id);
    const orders = d.orders || [], pending = orders.filter((o) => ['placed', 'confirmed'].includes(o.status)), refunds = orders.filter((o) => o.payment_status === 'refund_pending');
    const stale = pending.filter((o) => o.created_at.slice(0, 10) < from(1));
    out.online.kpis.push({ label: 'Website share (30 days)', value: pct(sum(web, (i) => i.total), sum(s30, (i) => i.total)), kind: 'pct', sub: `${web.length} orders` },
      { label: 'Orders to ship', value: pending.length, kind: 'num' }, { label: 'Refunds owed', value: refunds.length, kind: 'num' });
    if (stale.length) add('online', { id: 'stale', impact: sum(stale, (o) => o.total), level: 'bad', title: `${stale.length} website order${stale.length > 1 ? 's are' : ' is'} more than a day old and not packed`, detail: 'Late dispatch is the top reason for cancellations and bad reviews. Pack and ship them first today.', action: { label: 'Open orders', href: '#/online/orders' }, table: { columns: ['order', 'placed', 'total'], money: ['total'], rows: stale.map((o) => ({ order: o.order_no, placed: o.created_at.slice(0, 10), total: o.total })) } });
    if (refunds.length) add('online', { id: 'refunds', impact: sum(refunds, (o) => o.total), level: 'warn', title: `${refunds.length} cancelled prepaid order${refunds.length > 1 ? 's are' : ' is'} waiting for a refund`, detail: 'Refund them in Razorpay and mark them refunded, before the customer has to ask.', action: { label: 'Open orders', href: '#/online/orders' } });
    if (!web.length && s30.length > 20) add('online', { id: 'noweb', level: 'info', title: 'No website sales in the last 30 days', detail: 'Share the shop link on WhatsApp status and on bills, and publish your best sellers with photos (Online Store → Products).', action: { label: 'Online Store', href: '#/online/products' } });
  }

  for (const s of Object.values(out)) s.insights.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
  return out;
}

// Top findings across sections for the overview / dashboard: problems first, then wins.
export function topInsights(all, sections = Object.keys(INSIGHT_SECTIONS), n = 6) {
  return sections.flatMap((s) => (all[s]?.insights || []).map((x) => ({ ...x, section: s }))).sort((a, b) => LEVEL[a.level] - LEVEL[b.level]).slice(0, n);
}

// ---------------- Weekly plan (free, offline, no AI model) ----------------
// The findings, ranked by how urgent they are and how much money is at stake, each turned into concrete steps.
// Deterministic: the same figures always give the same plan, and every line can be traced back to a number on the Insights page.
const STEPS = {
  pace: ['Message regulars who stopped coming (Follow-ups → Not seen lately)', 'Run a one-day offer on your slowest weekday', 'Check the falling items for price or stock problems'],
  reorder: ['Open “Create purchase order”; it lists these items with quantities', 'Send it to the distributor today', 'Ask for delivery before the weekend rush'],
  dead: ['Take the five costliest items in the table', 'Make a combo with a best seller, or give 10–15% off (Online Store → Offers)', 'Ask the supplier whether the rest can be returned or exchanged'],
  expiry: ['Open Online Store → Offers → Near-expiry and approve the suggested offers', 'Keep these packs at the counter where customers see them', 'Tell your regulars on WhatsApp'],
  overstock: ['Leave these items off the next order', 'Use the money for the items running out'],
  nocost: ['Enter the next supplier bills as Purchases (that fills the cost)', 'For older stock, type the cost in Items → Edit'],
  margin: ['Compare last month’s and this month’s discount figures', 'Check for supplier price rises that were not passed on'],
  lowmargin: ['Raise these items to MRP or stop discounting them', 'Ask the distributor for a better rate on the biggest sellers'],
  earners: ['Keep these always in stock', 'Place them at eye level and recommend them at the counter'],
  discount: ['Set a cashier discount limit (Settings → Staff & permissions)', 'Keep bigger discounts for combos and regulars'],
  expenses: ['Open Reports → Expense Category Report', 'Cut or delay the biggest optional expense this month'],
  refills: ['Open Follow-ups → Refills due', 'Send the ready WhatsApp message to each one', 'Keep their usual pack aside'],
  lapsed: ['Open Follow-ups → Not seen lately', 'Send a “we miss you” message with a small offer'],
  walkin: ['Ask for the phone number on every bill (F3)', 'Mention loyalty points so customers want to give it'],
  top: ['Give your top customers special rates (Parties → Edit → Regular buyer rates)', 'Thank them personally on their next visit'],
  overdue: ['Open Follow-ups → Payment due and send reminders', 'Call the three biggest amounts', 'Stop new credit for customers past their limit'],
  shortages: ['Count the drawer at every shift change', 'Read the audit trail for those days'],
  unclosed: ['Close the day every evening (Sale → Day Close)'],
  combos: ['Create the top pair as a combo (Online Store → Offers → Combos)', 'Put the pair together on the shelf'],
  falling: ['Compare the price with the website and nearby shops', 'Move them to the counter or bundle them with a fast mover'],
  rising: ['Order a little extra of these', 'Keep them visible'],
  weekday: ['Put an extra person on the busy day', 'Try an offer or a WhatsApp broadcast on the slow day'],
  hours: ['Have two people at the counter in the rush hour', 'Restock shelves before it starts'],
  edits: ['Read the reasons in Reports → Audit Trail', 'Show the cashier how to bill correctly the first time'],
  avgbill: ['Have the best seller show others how they suggest add-ons', 'Consider a small incentive (Settings → Staff & permissions)'],
  stale: ['Open Online Store → Orders', 'Pack and ship the oldest orders first today'],
  refunds: ['Refund them in Razorpay', 'Mark them refunded in Online Store → Orders'],
  noweb: ['Share the shop link on WhatsApp status and on bills', 'Publish best sellers with photos (Online Store → Products)'],
  mix: ['Put your UPI QR on every bill (Settings → Bill printing)'],
  categories: ['Give the high-margin categories more shelf space', 'Review prices in the low-margin category'],
};
const PRIORITY_OF = { bad: 'high', warn: 'medium', good: 'low', info: 'low' };
export function weeklyPlan(all, sections = Object.keys(INSIGHT_SECTIONS), n = 8) {
  return sections.flatMap((s) => (all[s]?.insights || []).map((x) => ({ ...x, section: s })))
    .filter((x) => x.level !== 'info' || STEPS[x.id])
    .sort((a, b) => LEVEL[a.level] - LEVEL[b.level] || (b.impact || 0) - (a.impact || 0))
    .slice(0, n)
    .map((x) => ({ id: `${x.section}:${x.id}`, section: x.section, priority: PRIORITY_OF[x.level], title: x.title, why: x.detail, impact: x.impact || 0,
      steps: STEPS[x.id] || (x.action ? [x.action.label] : []), action: x.action }));
}

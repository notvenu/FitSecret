import { useState } from 'react';
import { inr, today, round2 } from '@fitsecret/shared';
import { useApi, downloadCsv } from '../api.js';
import { Btn, Field, Table, Money, Loading, Badge, cx } from '../ui.jsx';
import { REPORTS as SHARED } from '@fitsecret/shared/reports';

// Vyapar's report list. Built-in screens (day book, P&L, GSTR-1, stock...) plus the shared table reports in packages/shared/reports.js.
const BUILTIN = {
  daybook: ['Day book', 'Transaction report'], pnl: ['Profit And Loss', 'Transaction report', true], balance_sheet: ['Balance Sheet', 'Transaction report', true], balances: ['Outstanding balances', 'Party report'],
  gst: ['GSTR-1, GSTR-3B & HSN Summary', 'GST reports', true], stock: ['Stock summary', 'Item/ Stock report'], low: ['Low Stock Summary', 'Item/ Stock report'],
  expiry: ['Expiring batches', 'Item/ Stock report'],
};
const GROUPS = ['Transaction report', 'Party report', 'GST reports', 'Item/ Stock report', 'Business Status', 'Taxes', 'Expense report', 'Sale/ Purchase Order report'];
const LIST = GROUPS.map((g) => [g, [
  ...Object.entries(BUILTIN).filter(([, [, gr]]) => gr === g).map(([k, [t, , admin]]) => ({ k, t, admin })),
  ...Object.entries(SHARED).filter(([, r]) => r.group === g && !r.hidden).map(([k, r]) => ({ k, t: r.title, admin: r.admin })),
]]);

export default function Reports({ user, route }) {
  const [r, setR] = useState(route?.query.r || 'sale');
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [date, setDate] = useState(today());
  const qs = `from=${range.from}&to=${range.to}`;
  const ok = (x) => !x.admin || user.role === 'admin';
  const title = BUILTIN[r]?.[0] || SHARED[r]?.title;
  return (
    <div className="flex h-full">
      <nav className="w-60 shrink-0 overflow-y-auto border-r border-line bg-white py-2 text-[13px]">
        {LIST.map(([g, rs]) => rs.some(ok) && (
          <div key={g} className="mb-1">
            <div className="bg-brand/15 px-4 py-1.5 text-xs font-semibold text-brand-d">{g}</div>
            {rs.filter(ok).map((x) => (
              <button key={x.k} onClick={() => setR(x.k)} className={cx('block w-full px-4 py-1.5 text-left', r === x.k ? 'bg-brand/30 font-semibold text-ink' : 'text-black/70 hover:bg-paper')}>{x.t}</button>
            ))}
          </div>
        ))}
      </nav>
      <div className="rise min-w-0 flex-1 overflow-y-auto p-5 lg:p-7">
        <h1 className="display mb-4 text-2xl">{title}</h1>
        {['pnl', 'gst'].includes(r) && (
          <div className="mb-3 flex gap-2">
            <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
        )}
        {r === 'daybook' && <><Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3 max-w-48" /><DayBook date={date} /></>}
        {r === 'pnl' && <Pnl qs={qs} />}
        {r === 'balance_sheet' && <BalanceSheet />}
        {r === 'gst' && <Gst qs={qs} />}
        {r === 'stock' && <Stock />}
        {r === 'low' && <Stock low />}
        {r === 'expiry' && <Expiry />}
        {r === 'balances' && <Balances />}
        {SHARED[r] && <Generic key={r} name={r} range={range} setRange={setRange} />}
      </div>
    </div>
  );
}

const human = (k) => k.replace(/_pct$/, ' %').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Generic({ name, range, setRange }) {
  const R = SHARED[name];
  const [p, setP] = useState({ party: '', item: '', mode: 'bank' });
  const parties = useApi(R.params.includes('party') ? '/parties' : null);
  const items = useApi(R.params.includes('item') ? '/items' : null);
  const party = parties.data?.find((x) => x.name === p.party), item = items.data?.find((x) => x.name === p.item);
  const need = (R.params.includes('party') && !party) || (R.params.includes('item') && !item);
  const qs = new URLSearchParams({ ...(R.params.includes('range') && range), ...(R.params.includes('to') && { to: range.to }), ...(party && { party_id: party.id }), ...(item && { item_id: item.id }), ...(R.params.includes('mode') && { mode: p.mode }) });
  const { data, error } = useApi(need ? null : `/reports/x/${name}?${qs}`);
  const cols = data?.[0] ? Object.keys(data[0]) : [];
  const fmt = (k, v) => (R.money?.includes(k) ? <Money v={v} /> : typeof v === 'number' ? v.toLocaleString('en-IN') : v);
  return <>
    <div className="mb-3 flex flex-wrap items-end gap-2">
      {R.params.includes('party') && <><datalist id="rep-parties">{parties.data?.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        <Field label="Party" list="rep-parties" value={p.party} onChange={(e) => setP({ ...p, party: e.target.value })} placeholder="Type a party name" className="w-64" /></>}
      {R.params.includes('item') && <><datalist id="rep-items">{items.data?.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        <Field label="Item" list="rep-items" value={p.item} onChange={(e) => setP({ ...p, item: e.target.value })} placeholder="Type an item name" className="w-80" /></>}
      {R.params.includes('mode') && <Field label="Account"><select className="input" value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value })}>{['cash', 'upi', 'card', 'bank', 'cheque'].map((m) => <option key={m}>{m}</option>)}</select></Field>}
      {R.params.includes('to') && <Field label="As of" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />}
      {R.params.includes('range') && <>
        <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </>}
    </div>
    {need ? <div className="card py-16 text-center text-sm text-black/45">Pick {R.params.includes('party') ? 'a party' : 'an item'} to see this report</div>
      : error ? <div className="card p-6 text-sm text-red-600">{error.message}</div> : (
      <Section title={`${data?.length ?? '…'} rows`} rows={data} name={name}>
        <Table rows={data} empty="Nothing in this period" columns={cols.map((k) => ({ k, label: human(k), right: typeof data[0][k] === 'number', r: (x) => fmt(k, x[k]) }))} />
        {R.total && data?.length > 0 && (
          <div className="flex flex-wrap justify-end gap-6 border-t border-black/8 px-4 py-2 text-sm font-semibold">
            {R.total.map((k) => <span key={k}>{human(k)} {fmt(k, data.reduce((s, x) => s + (x[k] || 0), 0))}</span>)}
          </div>
        )}
      </Section>
    )}
  </>;
}

const Section = ({ title, rows, name, children }) => (
  <div className="card mb-4">
    <div className="flex items-center justify-between border-b border-black/8 px-4 py-2.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows && <Btn size="sm" onClick={() => downloadCsv(name || title, rows)}>CSV</Btn>}
    </div>
    {children}
  </div>
);

function DayBook({ date }) {
  const { data } = useApi('/reports/daybook?date=' + date);
  if (!data) return <Loading />;
  return <>
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {data.cash.map((c) => <div key={c.mode} className="card p-3"><div className="text-xs uppercase text-black/50">{c.mode} net</div><Money v={c.net} className="text-lg font-semibold" /></div>)}
    </div>
    <Section title="Invoices" rows={data.invoices}><Table rows={data.invoices} columns={[
      { k: 'no', label: 'No' }, { k: 'type', label: 'Type' }, { k: 'party_name', label: 'Party' },
      { k: 'status', label: 'Status' }, { k: 'total', label: 'Total', right: true, r: (x) => <Money v={x.total} /> }]} /></Section>
    <Section title="Payments" rows={data.payments}><Table rows={data.payments} columns={[
      { k: 'direction', label: 'In/Out' }, { k: 'party', label: 'Party' }, { k: 'invoice_no', label: 'Invoice' }, { k: 'mode', label: 'Mode' },
      { k: 'amount', label: 'Amount', right: true, r: (x) => <Money v={x.amount} className={x.direction === 'out' ? 'text-red-600' : ''} /> }]} /></Section>
    <Section title="Expenses" rows={data.expenses}><Table rows={data.expenses} columns={[
      { k: 'category', label: 'Category' }, { k: 'note', label: 'Note' }, { k: 'mode', label: 'Mode' }, { k: 'amount', label: 'Amount', right: true, r: (x) => <Money v={x.amount} /> }]} /></Section>
  </>;
}

function Pnl({ qs }) {
  const { data } = useApi('/reports/pnl?' + qs);
  if (!data) return <Loading />;
  const L = ({ k, v, b, neg }) => <div className={cx('flex justify-between px-4 py-2.5', b && 'bg-paper font-semibold')}><span>{k}</span><span className={cx('tabular-nums', neg && 'text-red-600')}>{inr(v)}</span></div>;
  return (
    <div className="card max-w-lg divide-y divide-black/5 text-sm">
      <L k="Net sales (excl. GST)" v={data.revenue} />
      <L k="Cost of goods sold" v={-data.cogs} neg />
      <L k="Gross profit" v={data.gross} b />
      {data.expense_breakup.map((e) => <L key={e.category} k={`  ${e.category}`} v={-e.amount} neg />)}
      <L k="Net profit" v={data.net} b />
      <div className="px-4 py-2 text-xs text-black/45">Gross margin {data.revenue ? ((data.gross / data.revenue) * 100).toFixed(1) : 0}% · COGS uses item cost at time of sale</div>
    </div>
  );
}

function Gst({ qs }) {
  const { data } = useApi('/reports/gst?' + qs);
  if (!data) return <Loading />;
  const t = Object.fromEntries(data.totals.map((x) => [x.type, x]));
  const tax = (x) => (x ? x.cgst + x.sgst + x.igst : 0);
  const out = tax(t.sale) - tax(t.sale_return), inp = tax(t.purchase) - tax(t.purchase_return);
  // ponytail: all sales land in 3.1(a); nil-rated/exempt split (3.1(c)) needs a per-line breakup if the CA asks for it
  const net = (a, b) => Object.fromEntries(['taxable', 'igst', 'cgst', 'sgst'].map((k) => [k, round2((t[a]?.[k] || 0) - (t[b]?.[k] || 0))]));
  const gstr3b = [{ row: '3.1(a) Outward taxable supplies', ...net('sale', 'sale_return') }, { row: '4(A)(5) Eligible ITC, all other', ...net('purchase', 'purchase_return') }];
  return <>
    <div className="mb-4 grid grid-cols-3 gap-3">
      <div className="card p-3"><div className="text-xs text-black/50">Output tax</div><Money v={out} className="text-lg font-semibold" /></div>
      <div className="card p-3"><div className="text-xs text-black/50">Input tax credit</div><Money v={inp} className="text-lg font-semibold" /></div>
      <div className="card p-3"><div className="text-xs text-black/50">Net GST payable</div><Money v={out - inp} className="text-lg font-semibold" /></div>
    </div>
    <Section title="GSTR-3B summary" rows={gstr3b} name="gstr3b"><Table rows={gstr3b} columns={[
      { k: 'row', label: 'Table' }, { k: 'taxable', label: 'Taxable', right: true, r: (x) => <Money v={x.taxable} /> }, { k: 'igst', label: 'IGST', right: true, r: (x) => <Money v={x.igst} /> },
      { k: 'cgst', label: 'CGST', right: true, r: (x) => <Money v={x.cgst} /> }, { k: 'sgst', label: 'SGST', right: true, r: (x) => <Money v={x.sgst} /> }]} /></Section>
    <Section title="B2B invoices (with GSTIN)" rows={data.b2b} name="gstr1-b2b"><Table rows={data.b2b} empty="No B2B invoices" columns={[
      { k: 'no', label: 'No' }, { k: 'date', label: 'Date' }, { k: 'party_gstin', label: 'GSTIN' }, { k: 'taxable', label: 'Taxable', right: true },
      { k: 'cgst', label: 'CGST', right: true }, { k: 'sgst', label: 'SGST', right: true }, { k: 'igst', label: 'IGST', right: true }, { k: 'total', label: 'Total', right: true }]} /></Section>
    <Section title="B2C summary by rate" rows={data.b2c} name="gstr1-b2c"><Table rows={data.b2c} columns={[
      { k: 'rate', label: 'Rate', r: (x) => x.rate + '%' }, { k: 'taxable', label: 'Taxable', right: true }, { k: 'tax', label: 'Tax', right: true }]} /></Section>
    <Section title="HSN summary" rows={data.hsn} name="gstr1-hsn"><Table rows={data.hsn} columns={[
      { k: 'hsn', label: 'HSN' }, { k: 'rate', label: 'Rate', r: (x) => x.rate + '%' }, { k: 'qty', label: 'Qty', right: true },
      { k: 'taxable', label: 'Taxable', right: true }, { k: 'tax', label: 'Tax', right: true }]} /></Section>
    <Section title="Credit notes" rows={data.credit_notes} name="gstr1-cdnr"><Table rows={data.credit_notes} empty="None" columns={[
      { k: 'no', label: 'No' }, { k: 'date', label: 'Date' }, { k: 'party_name', label: 'Party' }, { k: 'total', label: 'Total', right: true }]} /></Section>
  </>;
}

function Stock({ low }) {
  const { data } = useApi('/reports/stock');
  const rows = low ? data?.filter((i) => i.qty <= (i.low_stock || 0)) : data;
  return (
    <Section title={low ? 'Low stock — reorder' : 'Stock summary'} rows={rows} name="stock">
      <Table rows={rows} empty="All stocked up 💪" columns={[
        { k: 'name', label: 'Item' }, { k: 'category', label: 'Category' },
        { k: 'qty', label: 'Qty', right: true, r: (i) => <Badge c={i.qty <= 0 ? 'red' : i.qty <= (i.low_stock || 0) ? 'amber' : 'green'}>{i.qty}</Badge> },
        ...(low ? [{ k: 'low_stock', label: 'Alert at', right: true }] : [{ k: 'value', label: 'Value (cost)', right: true, r: (i) => <Money v={i.value} /> }]),
      ]} />
      {!low && rows && <div className="border-t border-black/8 px-4 py-2 text-right text-sm font-semibold">Total <Money v={rows.reduce((s, i) => s + Math.max(0, i.value), 0)} /></div>}
    </Section>
  );
}

function Expiry() {
  const [days, setDays] = useState(90);
  const { data } = useApi('/reports/expiry?days=' + days);
  const t = today();
  return (
    <Section title={`Batches expiring within ${days} days`} rows={data} name="expiry">
      <div className="flex gap-1 px-4 pt-3">{[30, 60, 90, 180].map((d) => <Btn key={d} size="sm" v={d === days ? 'primary' : 'outline'} onClick={() => setDays(d)}>{d}d</Btn>)}</div>
      <Table rows={data} empty="Nothing expiring soon" columns={[
        { k: 'name', label: 'Item' }, { k: 'batch_no', label: 'Batch' },
        { k: 'expiry', label: 'Expiry', r: (x) => <Badge c={x.expiry < t ? 'red' : 'amber'}>{x.expiry < t ? 'EXPIRED ' : ''}{x.expiry}</Badge> },
        { k: 'qty', label: 'Qty', right: true }]} />
    </Section>
  );
}

function Balances() {
  const { data } = useApi('/parties');
  const rows = data?.filter((p) => p.balance !== 0).sort((a, b) => b.balance - a.balance);
  return (
    <Section title="Outstanding balances" rows={rows} name="balances">
      <Table rows={rows} empty="All settled" columns={[
        { k: 'name', label: 'Party' }, { k: 'type', label: 'Type' }, { k: 'phone', label: 'Phone' },
        { k: 'balance', label: 'Balance', right: true, r: (p) => <Money v={p.balance} className={p.balance > 0 ? 'text-amber-700' : 'text-sky-700'} /> }]} />
    </Section>
  );
}

// Vyapar-style two-column balance sheet. Opening Balance Equity absorbs opening stock/balances entered without a source entry.
function BalanceSheet() {
  const [to, setTo] = useState(today());
  const { data } = useApi('/reports/balance-sheet?to=' + to);
  const Side = ({ title, rows }) => {
    const groups = [...new Set(rows.map((r) => r.group))];
    return (
      <div className="card">
        <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold">{title}</h3>
        {groups.map((g) => (
          <div key={g}>
            <div className="flex justify-between bg-brand/15 px-4 py-1.5 text-xs font-semibold text-brand-d"><span>{g}</span><Money v={rows.filter((r) => r.group === g).reduce((s, r) => s + r.amount, 0)} /></div>
            {rows.filter((r) => r.group === g).map((r) => <div key={r.name} className="flex justify-between border-t border-line px-4 py-1.5 pl-7 text-sm"><span>{r.name}</span><Money v={r.amount} className={r.amount < 0 ? 'text-red-600' : ''} /></div>)}
          </div>
        ))}
        <div className="flex justify-between border-t-2 border-ink px-4 py-2.5 font-semibold"><span>Total</span><Money v={rows.reduce((s, r) => s + r.amount, 0)} /></div>
      </div>
    );
  };
  return <>
    <Field label="As of" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mb-3 max-w-48" />
    {!data ? <Loading /> : <div className="grid gap-4 lg:grid-cols-2"><Side title="Liabilities & Equity" rows={data.liabilities} /><Side title="Assets" rows={data.assets} /></div>}
    <p className="mt-3 text-xs text-black/45">Stock is valued at each item's latest purchase cost. Net profit uses cost at the time of sale, same as the Profit &amp; Loss report.</p>
  </>;
}

import { useState } from 'react';
import { inr, today } from '@fitsecret/shared';
import { useApi, downloadCsv } from '../api.js';
import { Btn, Field, Page, Table, Money, Loading, Badge, cx } from '../ui.jsx';

const REPORTS = [
  ['daybook', 'Day book'], ['pnl', 'Profit & Loss', 'admin'], ['gst', 'GST (GSTR-1)', 'admin'], ['stock', 'Stock summary'],
  ['low', 'Low stock'], ['expiry', 'Expiring soon'], ['balances', 'Party balances'],
];

export default function Reports({ user }) {
  const [r, setR] = useState('daybook');
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [date, setDate] = useState(today());
  const qs = `from=${range.from}&to=${range.to}`;
  return (
    <Page title="Reports">
      <div className="flex flex-col gap-5 lg:flex-row">
        <nav className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-48 lg:flex-col">
          {REPORTS.filter(([, , role]) => !role || user.role === 'admin').map(([k, l]) => (
            <button key={k} onClick={() => setR(k)} className={cx('rounded-full px-3.5 py-2 text-left text-sm', r === k ? 'bg-ink text-white' : 'hover:bg-black/5')}>{l}</button>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          {['pnl', 'gst'].includes(r) && (
            <div className="mb-3 flex gap-2">
              <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </div>
          )}
          {r === 'daybook' && <><Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3 max-w-48" /><DayBook date={date} /></>}
          {r === 'pnl' && <Pnl qs={qs} />}
          {r === 'gst' && <Gst qs={qs} />}
          {r === 'stock' && <Stock />}
          {r === 'low' && <Stock low />}
          {r === 'expiry' && <Expiry />}
          {r === 'balances' && <Balances />}
        </div>
      </div>
    </Page>
  );
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
  return <>
    <div className="mb-4 grid grid-cols-3 gap-3">
      <div className="card p-3"><div className="text-xs text-black/50">Output tax</div><Money v={out} className="text-lg font-semibold" /></div>
      <div className="card p-3"><div className="text-xs text-black/50">Input tax credit</div><Money v={inp} className="text-lg font-semibold" /></div>
      <div className="card p-3"><div className="text-xs text-black/50">Net GST payable</div><Money v={out - inp} className="text-lg font-semibold" /></div>
    </div>
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

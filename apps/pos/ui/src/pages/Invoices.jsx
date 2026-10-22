import { useState } from 'react';
import { inr, today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Page, Table, Badge, STATUS_C, cx } from '../ui.jsx';

const monthStart = () => today().slice(0, 8) + '01';
export const TYPE_LABEL = {
  sale: 'Sale Invoices', estimate: 'Estimate/ Quotation', proforma: 'Proforma Invoice', sale_order: 'Sale Order', delivery_challan: 'Delivery Challan',
  sale_return: 'Sale Return/ Credit Note', purchase: 'Purchase Bills', purchase_order: 'Purchase Order', purchase_return: 'Purchase Return/ Dr. Note',
};
// Documents that become a real bill later. Delivery challan / proforma / estimate become a sale; purchase order a purchase bill.
const CONVERTS = { estimate: 'sale', proforma: 'sale', sale_order: 'sale', delivery_challan: 'sale', purchase_order: 'purchase' };
const overdue = (r) => r.due_date && r.due_date < today() && r.paid < r.total && r.status !== 'cancelled';

export default function Invoices({ user, route }) {
  const type = TYPE_LABEL[route.query.type] ? route.query.type : 'sale';
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [q, setQ] = useState(route.query.q || '');
  const list = useApi(`/invoices?type=${type}&from=${range.from}&to=${range.to}&q=${encodeURIComponent(q)}`);
  const [open, setOpen] = useState(null);
  const view = (id) => api('/invoices/' + id).then(setOpen, fail);
  const live = list.data?.filter((r) => r.status !== 'cancelled') || [];
  const total = live.reduce((s, r) => s + r.total, 0), paid = live.reduce((s, r) => s + r.paid, 0);
  const isDoc = !!CONVERTS[type];

  return (
    <Page title={TYPE_LABEL[type]} actions={<>
      <Btn onClick={() => downloadCsv(`${type}-${range.from}-${range.to}`, list.data)}>Export</Btn>
      <a href={`#/bill/${type}`} className={cx('rounded-full px-4.5 py-2 text-sm font-bold text-white hover:brightness-110', type.startsWith('purchase') ? 'bg-flame' : 'bg-brand-d')}>+ Add {TYPE_LABEL[type].split('/')[0].replace(/s$/, '')}</a>
    </>}>
      <div className="card mb-3 flex flex-wrap gap-8 px-5 py-3">
        <div><div className="text-xs text-black/50">Total {isDoc ? 'value' : type.startsWith('purchase') ? 'purchase' : 'sales'} amount</div><Money v={total} className="text-2xl font-bold" /></div>
        {!isDoc && <><div><div className="text-xs text-black/50">{type.startsWith('purchase') || type === 'sale_return' ? 'Paid' : 'Received'}</div><Money v={paid} className="text-lg font-semibold text-emerald-700" /></div>
          <div><div className="text-xs text-black/50">Balance</div><Money v={total - paid} className="text-lg font-semibold text-amber-700" /></div></>}
        {isDoc && <div><div className="text-xs text-black/50">Open</div><span className="text-lg font-semibold">{live.filter((r) => r.status === 'open' || r.status === 'estimate').length}</span></div>}
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <input className="input max-w-xs" placeholder="Invoice no, party, phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ml-auto text-sm text-black/50">{live.length} entries</div>
      </div>
      <div className="card">
        <Table rows={list.data} onRow={(r) => view(r.id)} columns={[
          { k: 'no', label: 'No.', r: (r) => <span className="font-mono text-xs">{r.no}</span> },
          { k: 'date', label: 'Date' },
          { k: 'party_name', label: 'Party', r: (r) => <>{r.party_name} <span className="text-black/40">{r.party_phone}</span></> },
          { k: 'online', label: 'Channel', r: (r) => (r.online ? <Badge c="brand">Online</Badge> : <Badge>Counter</Badge>) },
          { k: 'status', label: 'Status', r: (r) => <><Badge c={STATUS_C[r.status]}>{r.status}</Badge>{overdue(r) && <Badge c="red">overdue</Badge>}</> },
          { k: 'due_date', label: 'Due', r: (r) => (r.paid < r.total && r.due_date ? <span className={overdue(r) ? 'font-medium text-red-600' : ''}>{r.due_date}</span> : '') },
          { k: 'paid', label: 'Paid', right: true, r: (r) => <Money v={r.paid} /> },
          { k: 'total', label: 'Total', right: true, r: (r) => <Money v={r.total} className="font-medium" /> },
        ]} />
      </div>
      {open && <InvoiceView inv={open} user={user} onClose={() => setOpen(null)} onChange={(i) => { setOpen(i); list.reload(); }} />}
    </Page>
  );
}

export function InvoiceView({ inv, user, onClose, onChange }) {
  const [pay, setPay] = useState(false);
  const due = Math.max(0, inv.total - inv.paid);
  const print = (fmt) => window.open(`#/print/${inv.id}/${fmt}`, '_blank', fmt === 'thermal' ? 'width=420,height=700' : 'width=900,height=900');
  const wa = `https://wa.me/91${(inv.party_phone || '').replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
    `Thank you for shopping at FitSecret!\nInvoice ${inv.no} dated ${inv.date}\nAmount: ${inr(inv.total)}${due ? `\nBalance due: ${inr(due)}` : ''}`)}`;
  const cancel = async () => {
    if (!confirm(`Cancel ${inv.no}? Stock and payments will be reversed.`)) return;
    try { onChange(await api(`/invoices/${inv.id}/cancel`, {})); toast('Invoice cancelled'); } catch (e) { fail(e); }
  };
  const receive = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/payments', { party_id: inv.party_id, invoice_id: inv.id, direction: inv.type.startsWith('purchase') ? 'out' : 'in', amount: +fd.get('amount'), mode: fd.get('mode'), tds: +fd.get('tds') || 0 });
      onChange(await api('/invoices/' + inv.id)); setPay(false); toast('Payment recorded');
    } catch (e) { fail(e); }
  };
  return (
    <Modal wide title={<>{inv.no} <Badge c={STATUS_C[inv.status]}>{inv.status}</Badge></>} onClose={onClose} footer={<>
      {user.role === 'admin' && !['cancelled', 'converted'].includes(inv.status) && <Btn v="ghost" className="mr-auto text-red-600" onClick={cancel}>Cancel</Btn>}
      {CONVERTS[inv.type] && ['open', 'estimate'].includes(inv.status) && <a href={`#/bill/${CONVERTS[inv.type]}?from=${inv.id}`}><Btn v="primary">Convert to {CONVERTS[inv.type] === 'sale' ? 'Sale' : 'Purchase'}</Btn></a>}
      {inv.party_phone && <a href={wa} target="_blank" rel="noreferrer"><Btn>WhatsApp</Btn></a>}
      {!CONVERTS[inv.type] && <a href={`#/bill/${inv.type}?copy=${inv.id}`}><Btn title="Start a new bill with the same party and items">Repeat</Btn></a>}
      {due > 0 && inv.party_id && inv.status !== 'cancelled' && <Btn onClick={() => setPay(true)}>Receive {inr(due)}</Btn>}
      <Btn onClick={() => print('a4')}>Print A4</Btn>
      <Btn v="primary" onClick={() => print('thermal')}>Print receipt</Btn>
    </>}>
      <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
        <div><div className="text-xs text-black/50">Party</div>{inv.party_name}<div className="text-black/50">{inv.party_phone} {inv.party_gstin}</div></div>
        <div><div className="text-xs text-black/50">Date</div>{inv.date}{inv.due_date && <div className={overdue(inv) ? 'text-red-600' : 'text-black/50'}>Due {inv.due_date}</div>}</div>
        <div className="text-right"><div className="text-xs text-black/50">Total</div><Money v={inv.total} className="text-xl font-semibold" /></div>
      </div>
      <Table rows={inv.lines} columns={[
        { k: 'name', label: 'Item' }, { k: 'batch_no', label: 'Batch' }, { k: 'qty', label: 'Qty', right: true },
        { k: 'rate', label: 'Rate', right: true, r: (l) => <Money v={l.rate} /> }, { k: 'gst_rate', label: 'GST', right: true, r: (l) => l.gst_rate + '%' },
        { k: 'total', label: 'Amount', right: true, r: (l) => <Money v={l.total} /> },
      ]} />
      <div className="mt-3 flex justify-end gap-6 text-sm text-black/60">
        <span>Taxable <Money v={inv.taxable} /></span>
        {inv.igst ? <span>IGST <Money v={inv.igst} /></span> : <><span>CGST <Money v={inv.cgst} /></span><span>SGST <Money v={inv.sgst} /></span></>}
        {inv.tcs > 0 && <span>TCS <Money v={inv.tcs} /></span>}
        <span>Paid <Money v={inv.paid} /></span>
      </div>
      {inv.currency && <p className="mt-1 text-right text-sm text-black/55">≈ {inv.currency} {(inv.total / inv.fx_rate).toFixed(2)} at ₹{inv.fx_rate}</p>}
      {inv.ship_to && <p className="mt-2 text-sm"><span className="text-black/50">Ship to:</span> {inv.ship_to}</p>}
      {inv.notes && <p className="mt-2 text-sm text-black/55">{inv.notes}</p>}
      {pay && (
        <form onSubmit={receive} className="mt-4 flex items-end gap-2 rounded-[14px] bg-paper p-3">
          <Field label="Amount" name="amount" defaultValue={due} autoFocus />
          <Field label="Mode"><select name="mode" className="input">{['cash', 'upi', 'card', 'bank'].map((m) => <option key={m}>{m}</option>)}</select></Field>
          {inv.party_gstin && <Field label="TDS deducted" name="tds" placeholder="0" inputMode="decimal" />}
          <Btn v="primary" type="submit">Save</Btn>
        </form>
      )}
    </Modal>
  );
}

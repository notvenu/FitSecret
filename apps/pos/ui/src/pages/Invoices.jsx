import { useState } from 'react';
import { inr, today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Page, Table, Tabs, Badge, STATUS_C } from '../ui.jsx';

const monthStart = () => today().slice(0, 8) + '01';
export const TYPE_LABEL = { sale: 'Sales', purchase: 'Purchases', sale_return: 'Credit notes', purchase_return: 'Debit notes', estimate: 'Estimates' };

export default function Invoices({ user, route }) {
  const [type, setType] = useState(route.query.type || 'sale');
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [q, setQ] = useState('');
  const list = useApi(`/invoices?type=${type}&from=${range.from}&to=${range.to}&q=${encodeURIComponent(q)}`);
  const [open, setOpen] = useState(null);
  const view = (id) => api('/invoices/' + id).then(setOpen, fail);
  const live = list.data?.filter((r) => r.status !== 'cancelled') || [];

  return (
    <Page title="Invoices" actions={<>
      <Btn onClick={() => downloadCsv(`${type}-${range.from}-${range.to}`, list.data)}>Export</Btn>
      <Btn v="brand" onClick={() => (location.hash = `#/bill/${type}`)}>+ New</Btn>
    </>}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Tabs tabs={Object.entries(TYPE_LABEL)} value={type} onChange={setType} />
        <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <input className="input max-w-xs" placeholder="Invoice no, party, phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ml-auto text-right text-sm">
          <div className="text-black/50">{live.length} invoices</div>
          <Money v={live.reduce((s, r) => s + r.total, 0)} className="text-lg font-semibold" />
        </div>
      </div>
      <div className="card">
        <Table rows={list.data} onRow={(r) => view(r.id)} columns={[
          { k: 'no', label: 'No.', r: (r) => <span className="font-mono text-xs">{r.no}</span> },
          { k: 'date', label: 'Date' },
          { k: 'party_name', label: 'Party', r: (r) => <>{r.party_name} <span className="text-black/40">{r.party_phone}</span></> },
          { k: 'online', label: 'Channel', r: (r) => (r.online ? <Badge c="lime">Online</Badge> : <Badge>Counter</Badge>) },
          { k: 'status', label: 'Status', r: (r) => <Badge c={STATUS_C[r.status]}>{r.status}</Badge> },
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
      await api('/payments', { party_id: inv.party_id, invoice_id: inv.id, direction: inv.type.startsWith('purchase') ? 'out' : 'in', amount: +fd.get('amount'), mode: fd.get('mode') });
      onChange(await api('/invoices/' + inv.id)); setPay(false); toast('Payment recorded');
    } catch (e) { fail(e); }
  };
  return (
    <Modal wide title={<>{inv.no} <Badge c={STATUS_C[inv.status]}>{inv.status}</Badge></>} onClose={onClose} footer={<>
      {user.role === 'admin' && inv.status !== 'cancelled' && <Btn v="ghost" className="mr-auto text-red-600" onClick={cancel}>Cancel invoice</Btn>}
      {inv.party_phone && <a href={wa} target="_blank" rel="noreferrer"><Btn>WhatsApp</Btn></a>}
      {due > 0 && inv.party_id && inv.status !== 'cancelled' && <Btn onClick={() => setPay(true)}>Receive {inr(due)}</Btn>}
      <Btn onClick={() => print('a4')}>Print A4</Btn>
      <Btn v="primary" onClick={() => print('thermal')}>Print receipt</Btn>
    </>}>
      <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
        <div><div className="text-xs text-black/50">Party</div>{inv.party_name}<div className="text-black/50">{inv.party_phone} {inv.party_gstin}</div></div>
        <div><div className="text-xs text-black/50">Date</div>{inv.date}</div>
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
        <span>Paid <Money v={inv.paid} /></span>
      </div>
      {inv.notes && <p className="mt-2 text-sm text-black/55">{inv.notes}</p>}
      {pay && (
        <form onSubmit={receive} className="mt-4 flex items-end gap-2 rounded-[14px] bg-paper p-3">
          <Field label="Amount" name="amount" defaultValue={due} autoFocus />
          <Field label="Mode"><select name="mode" className="input">{['cash', 'upi', 'card', 'bank'].map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Btn v="primary" type="submit">Save</Btn>
        </form>
      )}
    </Modal>
  );
}

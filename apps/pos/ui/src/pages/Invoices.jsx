import { useEffect, useState } from 'react';
import { inr, today } from '@fitsecret/shared';
import { ewayJson } from '@fitsecret/shared/gstjson';
import { api, useApi, toast, fail, downloadCsv, shop, go } from '../api.js';
import { can } from '@fitsecret/shared/permissions';
import { Btn, Field, Modal, Money, Table, Badge, STATUS_C, SideNav, SectionPage, cx, ModeOptions } from '../ui.jsx';
import { InsightStrip } from './Insights.jsx';

const monthStart = () => today().slice(0, 8) + '01';
export const TYPE_LABEL = {
  sale: 'Sale Invoices', estimate: 'Estimate/ Quotation', proforma: 'Proforma Invoice', sale_order: 'Sale Order', delivery_challan: 'Delivery Challan',
  sale_return: 'Sale Return/ Credit Note', purchase: 'Purchase Bills', purchase_order: 'Purchase Order', purchase_return: 'Purchase Return/ Dr. Note',
};
// Documents that become a real bill later. Delivery challan / proforma / estimate become a sale; purchase order a purchase bill.
const CONVERTS = { estimate: 'sale', proforma: 'sale', sale_order: 'sale', delivery_challan: 'sale', purchase_order: 'purchase' };
const overdue = (r) => r.due_date && r.due_date < today() && r.paid < r.total && r.status !== 'cancelled';

export default function Invoices({ user, route, branch, boot }) {
  const type = TYPE_LABEL[route.query.type] ? route.query.type : 'sale';
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [q, setQ] = useState(route.query.q || '');
  // The owner can look at another branch's bills, or every branch at once (?branch=all from Branches & warehouses).
  const many = user?.role === 'admin' && (boot?.branches || []).length > 1;
  const [br, setBr] = useState(many ? route.query.branch || '' : '');
  const brName = new Map((boot?.branches || []).map((b) => [b.id, b.name]));
  const list = useApi(`/invoices?type=${type}&from=${range.from}&to=${range.to}&q=${encodeURIComponent(q)}${br ? '&branch=' + br : ''}`);
  const [open, setOpen] = useState(null);
  const view = (id) => api('/invoices/' + id).then(setOpen, fail);
  const live = list.data?.filter((r) => r.status !== 'cancelled') || [];
  const total = live.reduce((s, r) => s + r.total, 0), paid = live.reduce((s, r) => s + r.paid, 0);
  const isDoc = !!CONVERTS[type];

  return (
    <SectionPage nav={<SideNav title="Bills & documents" value={type} onChange={(k) => go('/invoices?type=' + k)} groups={['Sale', 'Purchase'].map((g) => ({ label: g,
      items: Object.entries(TYPE_LABEL).filter(([k]) => k.startsWith('purchase') === (g === 'Purchase') && (k === type || !(branch?.settings?.invoice?.hidden_docs || []).includes(k))).map(([key, label]) => ({ key, label })) }))} />}
      top={<InsightStrip user={user} branch={branch} sections={type === 'sale' ? ['sales'] : []} limit={2} />} title={TYPE_LABEL[type]} hint="Open a bill (↓ then Enter) to print, share, receive money, edit or return items." actions={<>
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
        {many && <Field label="Branch"><select className="input" value={br} onChange={(e) => setBr(e.target.value)}>
          <option value="">{branch?.name} (this counter)</option><option value="all">All companies, all branches</option>
          {(boot.companies || []).length > 0 && <optgroup label="Whole company">{boot.companies.map((c) => <option key={c.id} value={'co:' + c.id}>{c.name} (all its branches)</option>)}</optgroup>}
          <optgroup label="One branch">{boot.branches.filter((b) => b.id !== branch?.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup></select></Field>}
        <div className="ml-auto text-sm text-black/50">{live.length} entries</div>
      </div>
      <div className="card">
        <Table rows={list.data} onRow={(r) => view(r.id)} columns={[
          { k: 'no', label: 'No.', r: (r) => <span className="font-mono text-xs">{r.no}</span> },
          { k: 'date', label: 'Date' },
          ...(br === 'all' || br.startsWith('co:') ? [{ k: 'branch_id', label: 'Branch', r: (r) => brName.get(r.branch_id) || '' }] : []),
          { k: 'party_name', label: 'Party', r: (r) => <>{r.party_name} <span className="text-black/40">{r.party_phone}</span></> },
          { k: 'online', label: 'Channel', r: (r) => (r.online ? <Badge c="brand">Online</Badge> : <Badge>Counter</Badge>) },
          { k: 'status', label: 'Status', r: (r) => <><Badge c={STATUS_C[r.status]}>{r.status}</Badge>{overdue(r) && <Badge c="red">overdue</Badge>}</> },
          { k: 'due_date', label: 'Due', r: (r) => (r.paid < r.total && r.due_date ? <span className={overdue(r) ? 'font-medium text-red-600' : ''}>{r.due_date}</span> : '') },
          { k: 'paid', label: 'Paid', right: true, r: (r) => <Money v={r.paid} /> },
          { k: 'total', label: 'Total', right: true, r: (r) => <Money v={r.total} className="font-medium" /> },
        ]} />
      </div>
      {open && <InvoiceView inv={open} user={user} branch={branch} onClose={() => setOpen(null)} onChange={(i) => { setOpen(i); list.reload(); }} />}
    </SectionPage>
  );
}

// Download a JSON file (GSTR-1, e-way bill) for the government portals.
export function downloadJson(name, data) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: name + '.json' });
  a.click();
  URL.revokeObjectURL(a.href);
}
const RETURNS = { sale: 'sale_return', purchase: 'purchase_return' };

export function InvoiceView({ inv, user, branch, onClose, onChange }) {
  const [pay, setPay] = useState(false);
  const [eway, setEway] = useState(false);
  const live = !['cancelled', 'converted'].includes(inv.status);
  const canEdit = live && !inv.order_id && (can(user, 'edit_bills') || shop.perms?.cashier_edit);
  const due = Math.max(0, inv.total - inv.paid);
  const print = (fmt) => window.open(`#/print/${inv.id}/${fmt}`, '_blank', fmt.startsWith('thermal') ? 'width=420,height=700' : 'width=900,height=900');
  const wa = `https://wa.me/91${(inv.party_phone || '').replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
    `Thank you for shopping at FitSecret!\nInvoice ${inv.no} dated ${inv.date}\nAmount: ${inr(inv.total)}${due ? `\nBalance due: ${inr(due)}` : ''}`)}`;
  const cancel = async () => {
    const reason = prompt(`Cancel ${inv.no}? Stock and payments will be reversed.\n\nReason (kept in the audit trail):`);
    if (reason == null) return;
    try { onChange(await api(`/invoices/${inv.id}/cancel`, { reason })); toast('Invoice cancelled'); } catch (e) { fail(e); }
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
      {can(user, 'cancel_bills') && live && <Btn v="ghost" className="mr-auto text-red-600" onClick={cancel}>Cancel</Btn>}
      {canEdit && <a href={`#/bill/${inv.type}?edit=${inv.id}`}><Btn title="Change items, rates or party. Keeps the same number; the change is logged">Edit</Btn></a>}
      {RETURNS[inv.type] && live && <a href={`#/bill/${RETURNS[inv.type]}?ret=${inv.id}`}><Btn title="Credit / debit note against this bill">Return</Btn></a>}
      {inv.type === 'sale' && live && <Btn onClick={() => setEway(true)} v={inv.total >= 50000 ? 'primary' : 'outline'} title="Needed when goods worth over ₹50,000 move">E-way bill</Btn>}
      {CONVERTS[inv.type] && ['open', 'estimate'].includes(inv.status) && <a href={`#/bill/${CONVERTS[inv.type]}?from=${inv.id}`}><Btn v="primary">Convert to {CONVERTS[inv.type] === 'sale' ? 'Sale' : 'Purchase'}</Btn></a>}
      {inv.party_phone && <a href={wa} target="_blank" rel="noreferrer"><Btn>WhatsApp</Btn></a>}
      {!CONVERTS[inv.type] && <a href={`#/bill/${inv.type}?copy=${inv.id}`}><Btn title="Start a new bill with the same party and items">Repeat</Btn></a>}
      {due > 0 && inv.party_id && inv.status !== 'cancelled' && <Btn onClick={() => setPay(true)}>Receive {inr(due)}</Btn>}
      <Btn onClick={() => print('a4')}>Print A4</Btn>
      <Btn v="primary" onClick={() => print('thermal')}>Print receipt</Btn>
    </>}>
      <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
        <div><div className="text-xs text-black/50">Party</div>{inv.party_name}<div className="text-black/50">{inv.party_phone} {inv.party_gstin}</div></div>
        <div><div className="text-xs text-black/50">Date</div>{inv.date}{inv.due_date && <div className={overdue(inv) ? 'text-red-600' : 'text-black/50'}>Due {inv.due_date}</div>}
          {inv.ref_no && <div className="text-black/50">Against {inv.ref_no} ({inv.ref_date})</div>}</div>
        <div className="text-right"><div className="text-xs text-black/50">Total</div><Money v={inv.total} className="text-xl font-semibold" /></div>
      </div>
      <Table rows={inv.lines} columns={[
        { k: 'name', label: 'Item' }, { k: 'batch_no', label: 'Batch', r: (l) => l.batch_no || l.sold_batches }, { k: 'qty', label: 'Qty', right: true },
        { k: 'rate', label: 'Rate', right: true, r: (l) => <Money v={l.rate} /> }, { k: 'gst_rate', label: 'GST', right: true, r: (l) => l.gst_rate + '%' },
        { k: 'total', label: 'Amount', right: true, r: (l) => <Money v={l.total} /> },
      ]} />
      <div className="mt-3 flex justify-end gap-6 text-sm text-black/60">
        <span>Taxable <Money v={inv.taxable} /></span>
        {inv.igst ? <span>IGST <Money v={inv.igst} /></span> : <><span>CGST <Money v={inv.cgst} /></span><span>SGST <Money v={inv.sgst} /></span></>}
        {inv.bill_discount > 0 && <span>Bill discount <Money v={inv.bill_discount} /></span>}
        {inv.tcs > 0 && <span>TCS <Money v={inv.tcs} /></span>}
        <span>Paid <Money v={inv.paid} /></span>
      </div>
      {inv.currency && <p className="mt-1 text-right text-sm text-black/55">≈ {inv.currency} {(inv.total / inv.fx_rate).toFixed(2)} at ₹{inv.fx_rate}</p>}
      {inv.ship_to && <p className="mt-2 text-sm"><span className="text-black/50">Ship to:</span> {inv.ship_to}</p>}
      {inv.notes && <p className="mt-2 text-sm text-black/55">{inv.notes}</p>}
      {(inv.salesperson || inv.referrer || inv.created_by) && <p className="mt-1 text-xs text-black/45">
        {[inv.created_by && `Billed by ${inv.created_by}`, inv.salesperson && `Salesperson ${inv.salesperson}`, inv.referrer && `Referred by ${inv.referrer}`].filter(Boolean).join(' · ')}</p>}
      {eway && <EwayForm inv={inv} branch={branch} onClose={() => setEway(false)} />}
      {pay && (
        <form onSubmit={receive} className="mt-4 flex items-end gap-2 rounded-[14px] bg-paper p-3">
          <Field label="Amount" name="amount" defaultValue={due} autoFocus />
          <Field label="Mode"><select name="mode" className="input"><ModeOptions /></select></Field>
          {inv.party_gstin && <Field label="TDS deducted" name="tds" placeholder="0" inputMode="decimal" />}
          <Btn v="primary" type="submit">Save</Btn>
        </form>
      )}
    </Modal>
  );
}

// E-way bill: transport details → JSON for ewaybillgst.gov.in → e-Waybill → Bulk generation.
function EwayForm({ inv, branch, onClose }) {
  const [t, setT] = useState({ distance: '', vehicle: '', transporter: '', transporter_id: '', mode: '1', to_pincode: '', from_pincode: '' });
  const [party, setParty] = useState(null);
  useEffect(() => { if (inv.party_id) api('/parties').then((ps) => setParty(ps.find((p) => p.id === inv.party_id) || null), () => {}); }, [inv.party_id]);
  const bind = (k) => ({ value: t[k], onChange: (e) => setT({ ...t, [k]: e.target.value }) });
  const make = () => {
    const j = ewayJson(inv, branch || {}, party, t), b = j.billLists[0];
    if (!b.userGstin) return toast('Add the store GSTIN in Settings first', 'err');
    if (!b.fromPincode || !b.toPincode) return toast('Enter the missing PIN code', 'err');
    if (!(b.transDistance > 0)) return toast('Enter the distance in km', 'err');
    if (b.transMode === 1 && !b.vehicleNo && !b.transporterId) return toast('Enter the vehicle number or transporter ID', 'err');
    downloadJson(`ewaybill-${inv.no.replace(/\//g, '-')}`, j);
    toast('Saved. Upload it at ewaybillgst.gov.in → e-Waybill → Bulk generation');
    onClose();
  };
  return (
    <Modal title={`E-way bill for ${inv.no}`} onClose={onClose} footer={<><Btn onClick={onClose}>Close</Btn><Btn v="primary" onClick={make}>Download JSON</Btn></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Distance (km)" {...bind('distance')} inputMode="numeric" autoFocus />
        <Field label="Mode"><select className="input" {...bind('mode')}><option value="1">Road</option><option value="2">Rail</option><option value="3">Air</option><option value="4">Ship</option></select></Field>
        <Field label="Vehicle no." {...bind('vehicle')} placeholder="AP16AB1234" />
        <Field label="Transporter ID (GSTIN)" {...bind('transporter_id')} hint="Instead of a vehicle no., for courier / transporter" />
        <Field label="Transporter name" {...bind('transporter')} className="col-span-2" />
        <Field label="From PIN (if not in store address)" {...bind('from_pincode')} inputMode="numeric" />
        <Field label="To PIN (if not in ship-to / address)" {...bind('to_pincode')} inputMode="numeric" />
      </div>
      <p className="mt-3 text-xs text-black/50">Needed when goods worth over ₹50,000 move. Distance and vehicle can also be filled in on the portal later (Part B).</p>
    </Modal>
  );
}

import { useState } from 'react';
import { ORDER_FLOW, ORDER_LABEL, inr } from '@fitsecret/shared';
import { COURIERS, providerFor } from '@fitsecret/shared/couriers';
import { api, useApi, toast, fail } from '../api.js';
import { Btn, Field, Page, Badge, Money, Loading, cx } from '../ui.jsx';

export const ORDER_C = { pending_payment: 'grey', placed: 'red', confirmed: 'amber', packed: 'amber', shipped: 'blue', out_for_delivery: 'blue', delivered: 'green', cancelled: 'grey' };
const C = ORDER_C;
const FILTERS = [['', 'All'], ['placed', 'New'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'],
  ['pending_payment', 'Awaiting payment'], ['cancelled', 'Cancelled'], ['refund', 'Refunds due']];
const match = (o, k) => (k === 'refund' ? o.payment_status === 'refund_pending' : !k || o.status === k);
const PAY = { paid: 'text-emerald-700', refund_pending: 'font-semibold text-red-600', refunded: 'text-black/50' };
// Default customer tracking page when staff only type the AWB.
const trackUrl = (courier, awb) => (!awb ? '' : providerFor(courier) === 'delhivery' ? `https://www.delhivery.com/track/package/${awb}`
  : providerFor(courier) === 'shiprocket' ? `https://shiprocket.co/tracking/${awb}` : '');
export const printOrders = (kind, ids) => window.open(`#/online-print/${kind}?ids=${ids.join(',')}`, '_blank', 'width=900,height=900');

// list: the order list loaded by Online Store mode (shared with its badge and dashboard)
export default function Orders({ boot, list: shared, siteUrl }) {
  const own = useApi(shared ? null : '/orders');
  const list = shared || own;
  const [status, setStatus] = useState('placed');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const s = q.trim().toLowerCase();
  const rows = list.data?.filter((o) => (s ? `${o.order_no} ${o.name} ${o.phone} ${o.awb || ''}`.toLowerCase().includes(s) : match(o, status)));
  const n = (k) => list.data?.filter((o) => match(o, k)).length ?? 0;
  const picked = (list.data || []).filter((o) => sel.has(o.id));
  const toggle = (id) => setSel((x) => { const y = new Set(x); y.has(id) ? y.delete(id) : y.add(id); return y; });
  // Move every selected order one step forward (orders needing an AWB to ship are skipped).
  const bulkAdvance = async () => {
    let done = 0, skipped = 0;
    for (const o of picked) {
      const next = ORDER_FLOW[ORDER_FLOW.indexOf(o.status) + 1];
      if (!next || o.status === 'cancelled' || o.status === 'pending_payment' || (next === 'shipped' && !o.awb)) { skipped++; continue; }
      try { await api('/orders/' + o.id, { status: next }); done++; } catch (e) { fail(e); }
    }
    toast(`${done} order${done === 1 ? '' : 's'} moved forward${skipped ? ` · ${skipped} skipped (needs AWB or already done)` : ''}`);
    setSel(new Set()); list.reload();
  };
  return (
    <Page title="Website orders" actions={!shared && <Btn onClick={() => api('/sync/now', {}).then(list.reload, fail)}>↻ Fetch new orders</Btn>}>
      {!boot.sync.configured && <div className="mb-3 rounded-[14px] bg-amber-50 p-3 text-sm text-amber-900">Cloud sync is off — website orders arrive here once Supabase is connected in Settings.</div>}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <input className="input mr-2 max-w-64" placeholder="Search order no, name, phone, AWB" value={q} onChange={(e) => setQ(e.target.value)} />
        {FILTERS.map(([k, l]) => <button key={k} onClick={() => { setStatus(k); setQ(''); setSel(new Set()); }} className={cx('rounded-full px-3 py-1 text-xs font-medium', !s && status === k ? 'bg-ink text-white' : 'bg-black/5')}>
          {l} <span className={cx(['placed', 'refund'].includes(k) && n(k) ? 'font-bold text-red-500' : 'opacity-60')}>{n(k)}</span></button>)}
        {rows?.length > 0 && <button className="ml-auto text-xs font-semibold text-brand-d hover:underline" onClick={() => setSel(sel.size ? new Set() : new Set(rows.map((o) => o.id)))}>{sel.size ? 'Clear selection' : `Select all ${rows.length}`}</button>}
      </div>
      {sel.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] bg-ink px-4 py-2 text-sm text-white">
          <b>{sel.size} selected</b>
          <Btn size="sm" v="brand" onClick={bulkAdvance}>Move to next step</Btn>
          <Btn size="sm" className="!border-white/30 !text-white" onClick={() => printOrders('slips', [...sel])}>Print packing slips</Btn>
          <Btn size="sm" className="!border-white/30 !text-white" onClick={() => printOrders('labels', [...sel])}>Print shipping labels</Btn>
        </div>
      )}
      {!list.data ? <Loading /> : !rows.length ? <div className="py-16 text-center text-sm text-black/45">No orders here</div> : (
        <div className="grid gap-3 xl:grid-cols-2">{rows.map((o) => <OrderCard key={o.id + o.updated_at} o={o} onChange={list.reload} picked={sel.has(o.id)} onPick={() => toggle(o.id)} siteUrl={siteUrl} />)}</div>
      )}
      <datalist id="couriers">{COURIERS.map((c) => <option key={c} value={c} />)}</datalist>
    </Page>
  );
}

function OrderCard({ o, onChange, picked, onPick, siteUrl }) {
  const [ship, setShip] = useState({ courier: o.courier || '', awb: o.awb || '', tracking_url: o.tracking_url || '' });
  const [note, setNote] = useState(o.internal_note || '');
  const next = ORDER_FLOW[ORDER_FLOW.indexOf(o.status) + 1];
  const a = o.address || {};
  const update = async (body, msg = `Order ${o.order_no} updated`) => {
    try { await api('/orders/' + o.id, body); toast(msg); onChange(); } catch (e) { fail(e); }
  };
  const withUrl = () => ({ ...ship, tracking_url: ship.tracking_url || trackUrl(ship.courier, ship.awb) });
  const advance = () => {
    if (next === 'shipped' && !ship.awb) return toast('Enter courier & AWB before shipping', 'err');
    update({ status: next, ...withUrl() });
  };
  const invoice = async () => {
    try { const inv = await api(`/orders/${o.id}/invoice`, {}); window.open(`#/print/${inv.id}/a4`, '_blank'); onChange(); } catch (e) { fail(e); }
  };
  const phone = (o.phone || '').slice(-10);
  const track = siteUrl && `${siteUrl.replace(/\/$/, '')}/track?no=${o.order_no}&phone=${phone}`;
  const wa = (msg) => `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
  return (
    <div className={cx('card rise p-4', picked && 'ring-2 ring-brand')}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-1" checked={picked} onChange={onPick} aria-label={'Select ' + o.order_no} />
          <span><span className="block font-mono text-sm font-semibold">{o.order_no}</span><span className="text-xs text-black/50">{new Date(o.created_at).toLocaleString('en-IN')}</span></span>
        </label>
        <div className="text-right">
          <Badge c={C[o.status]}>{ORDER_LABEL[o.status]}</Badge>
          <div className="mt-1 text-xs"><span className="uppercase">{o.payment_method}</span> · <span className={PAY[o.payment_status] || 'text-amber-700'}>{o.payment_status.replace('_', ' ')}</span></div>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="font-medium">{o.name}</div>
          <div className="text-black/60">{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city} {a.state} {a.pincode}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <a className="text-sky-700 hover:underline" href={`tel:${phone}`}>{o.phone}</a>
            <a className="text-emerald-700 hover:underline" target="_blank" rel="noreferrer"
              href={wa(`Hi ${o.name}, your Fit Secrets order ${o.order_no} is ${ORDER_LABEL[o.status]?.toLowerCase()}.${track && o.awb ? ` Track it here: ${track}` : ''}`)}>WhatsApp</a>
            {track && <a className="text-black/50 hover:underline" target="_blank" rel="noreferrer" href={track}>Customer's tracking page ↗</a>}
          </div>
        </div>
        <ul className="text-xs">
          {o.lines.map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.qty} × {l.name}</span><span className="tabular-nums">{inr(l.total)}</span></li>)}
          {o.discount > 0 && <li className="mt-1 flex justify-between border-t border-black/10 pt-1 text-brand-d"><span>Coupon {o.coupon}</span><span>−{inr(o.discount)}</span></li>}
          <li className={cx('flex justify-between text-black/55', !(o.discount > 0) && 'mt-1 border-t border-black/10 pt-1')}><span>Shipping</span><span>{inr(o.shipping)}</span></li>
          <li className="flex justify-between font-semibold"><span>Total</span><Money v={o.total} /></li>
        </ul>
      </div>
      {o.notes && <p className="mb-2 rounded bg-paper p-2 text-xs"><b>Customer note:</b> {o.notes}</p>}
      {o.payment_status === 'refund_pending' && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-red-50 p-2.5 text-sm text-red-800">
          <span>Prepaid order cancelled: refund {inr(o.total)} in Razorpay{o.payment_ref ? ` (payment ${o.payment_ref})` : ''}.</span>
          <Btn size="sm" onClick={() => confirm(`Mark ${inr(o.total)} as refunded to ${o.name}?`) && update({ refund: 'done' }, 'Marked refunded')}>Mark refunded</Btn>
        </div>
      )}
      {!['delivered', 'cancelled', 'pending_payment'].includes(o.status) && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Field label="Courier" list="couriers" value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.target.value })} placeholder="Shiprocket / Delhivery"
            hint={providerFor(ship.courier) ? 'Live tracking on website' : undefined} />
          <Field label="AWB / tracking no." value={ship.awb} onChange={(e) => setShip({ ...ship, awb: e.target.value.trim() })} />
          <Field label="Tracking link" value={ship.tracking_url} onChange={(e) => setShip({ ...ship, tracking_url: e.target.value })} placeholder={trackUrl(ship.courier, ship.awb) || 'optional'} />
        </div>
      )}
      <details className="mb-3 text-xs" open={!!o.internal_note}>
        <summary className="cursor-pointer text-black/50">Staff note {o.internal_note && '•'}</summary>
        <div className="mt-1 flex gap-2">
          <input className="input py-1 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only staff see this" />
          {note !== (o.internal_note || '') && <Btn size="sm" onClick={() => update({ internal_note: note }, 'Note saved')}>Save</Btn>}
        </div>
      </details>
      <ol className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-black/50">
        {o.events.map((e, i) => <li key={i}>● {ORDER_LABEL[e.status]} <span className="text-black/35">{new Date(e.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span></li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        {next && o.status !== 'cancelled' && o.status !== 'pending_payment' && <Btn v="brand" onClick={advance}>Mark {ORDER_LABEL[next]}</Btn>}
        {['shipped', 'out_for_delivery'].includes(o.status) && <Btn onClick={() => update(withUrl())}>Save tracking</Btn>}
        {o.status !== 'cancelled' && <Btn onClick={invoice}>{o.invoice_id ? 'Print invoice' : 'Generate invoice'}</Btn>}
        {o.status !== 'cancelled' && <Btn v="ghost" onClick={() => printOrders('slips', [o.id])}>Packing slip</Btn>}
        {o.status !== 'cancelled' && <Btn v="ghost" onClick={() => printOrders('labels', [o.id])}>Label</Btn>}
        {!['delivered', 'cancelled', 'shipped', 'out_for_delivery'].includes(o.status) && (
          <Btn v="ghost" className="ml-auto text-red-600" onClick={() => confirm('Cancel order and return stock?') && update({ status: 'cancelled', note: prompt('Reason?') || 'Cancelled by store' })}>Cancel</Btn>
        )}
      </div>
    </div>
  );
}

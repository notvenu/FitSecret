import { useState } from 'react';
import { ORDER_FLOW, ORDER_LABEL, inr } from '@fitsecret/shared';
import { api, useApi, toast, fail } from '../api.js';
import { Btn, Field, Page, Badge, Money, Loading, cx } from '../ui.jsx';

const C = { pending_payment: 'grey', placed: 'red', confirmed: 'amber', packed: 'amber', shipped: 'blue', out_for_delivery: 'blue', delivered: 'green', cancelled: 'grey' };
const FILTERS = [['', 'All'], ['placed', 'New'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];

export default function Orders({ boot }) {
  const [status, setStatus] = useState('placed');
  const list = useApi('/orders' + (status ? '?status=' + status : ''));
  return (
    <Page title="Online Orders" actions={<Btn onClick={() => api('/sync/now', {}).then(list.reload, fail)}>↻ Fetch new orders</Btn>}>
      {!boot.sync.configured && <div className="mb-3 rounded-[14px] bg-amber-50 p-3 text-sm text-amber-900">Cloud sync is off — website orders arrive here once Supabase is connected in Settings.</div>}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={cx('rounded-full px-3 py-1 text-xs font-medium', status === k ? 'bg-ink text-white' : 'bg-black/5')}>{l}</button>)}
      </div>
      {!list.data ? <Loading /> : !list.data.length ? <div className="py-16 text-center text-sm text-black/45">No orders here</div> : (
        <div className="grid gap-3 xl:grid-cols-2">{list.data.map((o) => <OrderCard key={o.id} o={o} onChange={list.reload} />)}</div>
      )}
    </Page>
  );
}

function OrderCard({ o, onChange }) {
  const [ship, setShip] = useState({ courier: o.courier || '', awb: o.awb || '', tracking_url: o.tracking_url || '' });
  const next = ORDER_FLOW[ORDER_FLOW.indexOf(o.status) + 1];
  const a = o.address || {};
  const update = async (body) => {
    try { await api('/orders/' + o.id, body); toast(`Order ${o.order_no} updated`); onChange(); } catch (e) { fail(e); }
  };
  const advance = () => {
    if (next === 'shipped' && !ship.awb) return toast('Enter courier & AWB before shipping', 'err');
    update({ status: next, ...ship });
  };
  const invoice = async () => {
    try { const inv = await api(`/orders/${o.id}/invoice`, {}); window.open(`#/print/${inv.id}/a4`, '_blank'); onChange(); } catch (e) { fail(e); }
  };
  const phone = (o.phone || '').slice(-10);
  return (
    <div className="card rise p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold">{o.order_no}</div>
          <div className="text-xs text-black/50">{new Date(o.created_at).toLocaleString('en-IN')}</div>
        </div>
        <div className="text-right">
          <Badge c={C[o.status]}>{ORDER_LABEL[o.status]}</Badge>
          <div className="mt-1 text-xs"><span className="uppercase">{o.payment_method}</span> · <span className={o.payment_status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>{o.payment_status}</span></div>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="font-medium">{o.name}</div>
          <div className="text-black/60">{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city} {a.state} {a.pincode}</div>
          <div className="mt-1 flex gap-2 text-xs">
            <a className="text-sky-700 hover:underline" href={`tel:${phone}`}>{o.phone}</a>
            <a className="text-emerald-700 hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/91${phone}?text=${encodeURIComponent(`Hi ${o.name}, your FitSecret order ${o.order_no} is ${ORDER_LABEL[o.status]?.toLowerCase()}.`)}`}>WhatsApp</a>
          </div>
        </div>
        <ul className="text-xs">
          {o.lines.map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.qty} × {l.name}</span><span className="tabular-nums">{inr(l.total)}</span></li>)}
          <li className="mt-1 flex justify-between border-t border-black/10 pt-1 text-black/55"><span>Shipping</span><span>{inr(o.shipping)}</span></li>
          <li className="flex justify-between font-semibold"><span>Total</span><Money v={o.total} /></li>
        </ul>
      </div>
      {o.notes && <p className="mb-2 rounded bg-paper p-2 text-xs">{o.notes}</p>}
      {!['delivered', 'cancelled', 'pending_payment'].includes(o.status) && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Field label="Courier" value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.target.value })} placeholder="Delhivery / DTDC" />
          <Field label="AWB / tracking no." value={ship.awb} onChange={(e) => setShip({ ...ship, awb: e.target.value })} />
          <Field label="Tracking link" value={ship.tracking_url} onChange={(e) => setShip({ ...ship, tracking_url: e.target.value })} />
        </div>
      )}
      <ol className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-black/50">
        {o.events.map((e, i) => <li key={i}>● {ORDER_LABEL[e.status]} <span className="text-black/35">{new Date(e.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span></li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        {next && o.status !== 'cancelled' && o.status !== 'pending_payment' && <Btn v="brand" onClick={advance}>Mark {ORDER_LABEL[next]}</Btn>}
        {['shipped', 'out_for_delivery'].includes(o.status) && <Btn onClick={() => update(ship)}>Save tracking</Btn>}
        {o.status !== 'cancelled' && <Btn onClick={invoice}>{o.invoice_id ? 'Print invoice' : 'Generate invoice'}</Btn>}
        {!['delivered', 'cancelled', 'shipped', 'out_for_delivery'].includes(o.status) && (
          <Btn v="ghost" className="ml-auto text-red-600" onClick={() => confirm('Cancel order and return stock?') && update({ status: 'cancelled', note: prompt('Reason?') || 'Cancelled by store' })}>Cancel</Btn>
        )}
      </div>
    </div>
  );
}

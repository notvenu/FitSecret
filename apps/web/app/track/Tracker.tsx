'use client';
import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle, Package, Truck, HouseLine, Receipt, ClipboardText, MapPin, ArrowSquareOut, CircleNotch, XCircle } from '@phosphor-icons/react';
import { inr, ORDER_FLOW, ORDER_LABEL } from '@fitsecret/shared';
import { supabase } from '@/lib/supabase';
import { payOnline, onlinePayments } from '@/lib/pay';

type Track = {
  order: { id: string; order_no: string; name: string; phone: string; email: string | null; status: string; payment_method: string; payment_status: string;
    subtotal: number; shipping: number; total: number; courier: string | null; awb: string | null; tracking_url: string | null; address: Record<string, string>; created_at: string };
  lines: { name: string; variant: string; qty: number; total: number }[];
  events: { status: string; note: string | null; at: string }[];
};
const ICONS = [Receipt, ClipboardText, Package, Truck, MapPin, HouseLine];
const when = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function Tracker({ no: initNo, phone: initPhone, fresh }: { no: string; phone: string; fresh: boolean }) {
  const [no, setNo] = useState(initNo);
  const [phone, setPhone] = useState(initPhone);
  const [t, setT] = useState<Track | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  const sb = supabase();

  const lookup = useCallback(async (n = no, p = phone) => {
    if (!sb) return setErr('Order tracking is available once the online store is live. WhatsApp us for an update.');
    setBusy(true); setErr('');
    const { data, error } = await sb.rpc('track_order', { p_order_no: n, p_phone: p });
    setBusy(false);
    if (error || !data) { setT(null); setErr('No order found. Check the order number and the mobile number used at checkout.'); return; }
    setT(data as Track);
  }, [sb, no, phone]);

  useEffect(() => { if (initNo && initPhone) lookup(initNo, initPhone); }, [initNo, initPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  const o = t?.order;
  const cancelled = o?.status === 'cancelled';
  const step = o ? ORDER_FLOW.indexOf(o.status === 'pending_payment' ? 'placed' : o.status) : -1;
  const at = (s: string) => t?.events.find((e) => e.status === s)?.at;
  const retry = async () => {
    if (!o) return;
    setBusy(true);
    try { if (await payOnline({ id: o.id, name: o.name, phone: o.phone, email: o.email || undefined })) await lookup(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 md:px-6">
      {fresh && o && (
        <motion.div initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mb-10 flex items-center gap-4 rounded-[var(--radius-card)] bg-brand p-6 text-ink md:p-8">
          <CheckCircle size={48} weight="fill" className="shrink-0" />
          <div>
            <h1 className="display text-3xl">Order placed. Thank you, {o.name.split(' ')[0]}!</h1>
            <p className="mt-1 text-ink/70">Order <b>{o.order_no}</b>. We&apos;ll confirm on WhatsApp shortly. Bookmark this page to track it.</p>
          </div>
        </motion.div>
      )}
      {!fresh && <h1 className="display text-4xl md:text-5xl">Track your order</h1>}

      <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="sr-only" htmlFor="ono">Order number</label>
        <input id="ono" className="field uppercase" placeholder="Order number, e.g. FS2610190001" value={no} onChange={(e) => setNo(e.target.value)} required />
        <label className="sr-only" htmlFor="oph">Mobile number</label>
        <input id="oph" className="field" placeholder="Mobile number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <button className="btn-ink py-3" disabled={busy}>{busy ? <CircleNotch className="animate-spin" size={18} /> : 'Track'}</button>
      </form>
      {err && <p role="alert" className="mt-4 text-sm text-danger">{err}</p>}

      {o && (
        <div className="mt-10 grid gap-8 md:grid-cols-[1.3fr_1fr]">
          <section className="rounded-[var(--radius-card)] bg-surface p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-mute">Order {o.order_no}</div>
                <div className="mt-1 display text-2xl">{ORDER_LABEL[o.status]}</div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${o.payment_status === 'paid' ? 'bg-brand text-ink' : 'bg-surface-2 text-mute'}`}>
                {o.payment_method === 'cod' ? 'Cash on delivery' : 'Online'} · {o.payment_status}
              </span>
            </div>

            {o.status === 'pending_payment' && (
              <div className="mt-6 rounded-[10px] bg-danger/10 p-4 text-sm">
                <p>Payment not completed yet. Your items are reserved for a short while.</p>
                {onlinePayments && <button onClick={retry} disabled={busy} className="btn-ink mt-3">Complete payment of {inr(o.total)}</button>}
              </div>
            )}

            {cancelled ? (
              <div className="mt-8 flex items-center gap-3 text-danger"><XCircle size={28} /> This order was cancelled{t!.events.at(-1)?.note ? `: ${t!.events.at(-1)!.note}` : '.'}</div>
            ) : (
              <ol className="relative mt-8">
                {ORDER_FLOW.map((s, i) => {
                  const done = i <= step, Icon = ICONS[i];
                  return (
                    <li key={s} className="relative flex gap-4 pb-7 last:pb-0">
                      {i < ORDER_FLOW.length - 1 && (
                        <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 overflow-hidden rounded bg-line">
                          <motion.span className="block w-full bg-brand" initial={reduce ? false : { height: 0 }} animate={{ height: i < step ? '100%' : 0 }} transition={{ duration: 0.5, delay: 0.15 * i }} />
                        </span>
                      )}
                      <motion.span initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.12 * i, type: 'spring', stiffness: 300, damping: 20 }}
                        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full ${done ? 'bg-brand text-ink' : 'bg-surface-2 text-mute'} ${i === step ? 'ring-4 ring-brand/40' : ''}`}>
                        <Icon size={20} weight={done ? 'fill' : 'regular'} />
                      </motion.span>
                      <div className="pt-2">
                        <div className={done ? 'font-semibold' : 'text-mute'}>{ORDER_LABEL[s]}</div>
                        {at(s) && <div className="text-xs text-mute">{when(at(s)!)}</div>}
                        {s === 'shipped' && done && o.awb && (
                          <div className="mt-2 text-sm">
                            {o.courier} · AWB <span className="font-mono">{o.awb}</span>
                            {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-brand-deep hover:underline">Live tracking <ArrowSquareOut size={14} /></a>}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <aside className="space-y-6 text-sm">
            <div className="rounded-[var(--radius-card)] border border-line p-6">
              <h2 className="mb-4 font-semibold">Items</h2>
              <ul className="space-y-3">
                {t!.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.qty} × {l.name}<span className="block text-xs text-mute">{l.variant}</span></span><span className="tabular-nums">{inr(l.total)}</span></li>)}
              </ul>
              <dl className="mt-4 space-y-1 border-t border-line pt-4">
                <div className="flex justify-between text-mute"><dt>Delivery</dt><dd>{Number(o.shipping) ? inr(o.shipping) : 'Free'}</dd></div>
                <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{inr(o.total)}</dd></div>
              </dl>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line p-6">
              <h2 className="mb-2 font-semibold">Delivering to</h2>
              <p className="leading-relaxed text-mute">{o.name}<br />{o.address.line1}{o.address.line2 && `, ${o.address.line2}`}<br />{o.address.city}, {o.address.state} {o.address.pincode}</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, ExternalLink, Check, XCircle } from 'lucide-react';
import { inr, ORDER_FLOW, ORDER_LABEL } from '@fitsecret/shared';
import type { Tracking } from '@fitsecret/shared/couriers';
import { supabase } from '@/lib/supabase';
import { payOnline } from '@/lib/pay';

type Track = {
  order: { id: string; order_no: string; name: string; phone: string; email: string | null; status: string; payment_method: string; payment_status: string;
    subtotal: number; shipping: number; discount: number; coupon: string | null; total: number; courier: string | null; awb: string | null; tracking_url: string | null; address: Record<string, string>; created_at: string };
  lines: { name: string; variant: string; qty: number; total: number }[];
  events: { status: string; note: string | null; at: string }[];
};
const when = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Order status (STATES §5). Order number + mobile number is the proof, so orders can't be enumerated.
export default function Tracker({ no: initNo, phone: initPhone, fresh }: { no: string; phone: string; fresh: boolean }) {
  const [no, setNo] = useState(initNo);
  const [phone, setPhone] = useState(initPhone);
  const [t, setT] = useState<Track | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Tracking | null>(null);
  const sb = supabase();

  const lookup = useCallback(async (n = no, p = phone) => {
    if (!sb) return setErr('Order tracking opens with the online store. WhatsApp us for an update meanwhile.');
    setBusy(true); setErr('');
    const { data, error } = await sb.rpc('track_order', { p_order_no: n.trim().toUpperCase(), p_phone: p.trim() });
    setBusy(false);
    if (error || !data) { setT(null); setErr('No order matches. Check the order number and the mobile number used at checkout.'); return; }
    setT(data as Track);
    setLive(null);
    if ((data as Track).order.awb) fetch(`/api/shipment?no=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`).then((r) => r.json()).then((j) => setLive(j.tracking || null), () => {});
  }, [sb, no, phone]);
  useEffect(() => { if (initNo && initPhone) lookup(initNo, initPhone); }, [initNo, initPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  const o = t?.order;
  const step = o ? ORDER_FLOW.indexOf(o.status === 'pending_payment' ? 'placed' : o.status) : -1;
  const at = (s: string) => t?.events.find((e) => e.status === s)?.at;
  const retry = async () => {
    if (!o) return;
    setBusy(true);
    try { if (await payOnline({ id: o.id, name: o.name, phone: o.phone, email: o.email || undefined })) await lookup(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="page-top mx-auto max-w-4xl px-4 pb-24 md:px-8">
      {fresh && o && (
        <div className="mb-12 flex flex-col items-center gap-5 rounded-[28px] bg-river p-8 text-center text-chalk md:p-12">
          <span className="stamp relative grid size-24 place-items-center rounded-full bg-haldi text-deep shadow-lift">
            <Check size={44} strokeWidth={2.5} />
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} aria-hidden className="absolute size-1.5 rounded-full bg-haldi-light"
                style={{ animation: `burst 1.2s cubic-bezier(.16,1,.3,1) ${200 + (i % 4) * 30}ms both`, '--a': `${i * 15}deg`, '--d': `${70 + (i % 3) * 24}px` } as React.CSSProperties} />
            ))}
          </span>
          <style>{`@keyframes burst{from{transform:rotate(var(--a)) translateY(0);opacity:1}to{transform:rotate(var(--a)) translateY(calc(var(--d)*-1));opacity:0}}`}</style>
          <h1 className="h2">Order confirmed. Thank you, {o.name.split(' ')[0]}.</h1>
          <p className="text-chalk/80">Order <b className="num text-chalk">{o.order_no}</b>. We&apos;ll message you on {o.phone} as it moves.</p>
        </div>
      )}

      {!fresh && <h1 className="h2">Track your order</h1>}
      <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="sr-only" htmlFor="no">Order number</label>
        <input id="no" className="field num uppercase" placeholder="Order number, e.g. FS2611040001" required value={no} onChange={(e) => setNo(e.target.value)} />
        <label className="sr-only" htmlFor="ph">Mobile number</label>
        <input id="ph" className="field num" placeholder="Mobile number" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="btn btn-dark" disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : 'Track'}</button>
      </form>
      {err && <p role="alert" className="mt-4 text-madder">{err}</p>}

      {o && (
        <div className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="h3">Order <span className="num">{o.order_no}</span></h2>
            <p className="text-sm text-ink-soft">Placed {when(o.created_at)}</p>
          </div>

          {o.status === 'cancelled' ? (
            <p className="mt-6 flex items-center gap-3 rounded-[20px] bg-madder/10 p-5 text-madder"><XCircle /> This order was cancelled. Any amount paid is refunded to the original payment method.</p>
          ) : (
            <ol className="mt-8 grid grid-cols-6 gap-1" aria-label="Order progress">
              {ORDER_FLOW.map((s: string, i: number) => (
                <li key={s} className="relative grid justify-items-center gap-2 text-center" aria-current={i === step ? 'step' : undefined}>
                  {i > 0 && (
                    <span className="absolute top-[11px] right-1/2 left-[-50%] h-0.5 bg-sage" aria-hidden>
                      <span className="block h-full origin-left bg-river transition-transform duration-[600ms] ease-[var(--ease-in-out)]" style={{ transform: `scaleX(${i <= step ? 1 : 0})`, transitionDelay: `${i * 120}ms` }} />
                    </span>
                  )}
                  <span className={`relative grid size-6 place-items-center rounded-full ${i < step ? 'bg-river text-chalk' : i === step ? 'pulse-dot bg-haldi' : 'bg-sage'}`}>{i < step && <Check size={14} />}</span>
                  <span className={`text-[11px] leading-tight md:text-sm ${i <= step ? 'font-semibold' : 'text-ink-soft'}`}>{(ORDER_LABEL as Record<string, string>)[s]}</span>
                  {at(s) && <span className="hidden text-xs text-ink-soft md:block">{when(at(s)!)}</span>}
                </li>
              ))}
            </ol>
          )}

          {o.status === 'pending_payment' && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-haldi/15 p-5">
              <p>Awaiting payment of <b className="num">{inr(o.total)}</b>. Your items are held for a short time.</p>
              <button type="button" onClick={retry} className="btn btn-gold" disabled={busy}>Pay now</button>
            </div>
          )}

          {(live || o.tracking_url) && (
            <section className="mt-8 rounded-[20px] bg-paper p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{live?.label || 'Shipped'}{o.courier && ` · ${o.courier}`}{o.awb && <span className="num font-normal text-ink-soft"> · AWB {o.awb}</span>}</h3>
                {(live?.url || o.tracking_url) && <a href={live?.url || o.tracking_url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-river">Courier site <ExternalLink size={14} /></a>}
              </div>
              {live?.edd && <p className="mt-1 text-sm text-ink-soft">Expected by {new Date(live.edd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
              {live?.events.length ? (
                <ol className="mt-4 grid gap-3 border-l border-line pl-4 text-sm">
                  {live.events.slice(0, 8).map((e, i) => <li key={i}><b>{e.status}</b>{e.location && ` · ${e.location}`}<span className="block text-xs text-ink-soft">{e.at && when(e.at)}{e.detail && ` · ${e.detail}`}</span></li>)}
                </ol>
              ) : null}
            </section>
          )}

          <section className="mt-8 rounded-[20px] bg-paper p-5">
            <ul className="divide-y divide-line">{t!.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-4 py-3 text-sm"><span>{l.name}{l.variant && <span className="text-ink-soft"> · {l.variant}</span>} × {l.qty}</span><span className="num">{inr(l.total)}</span></li>
            ))}</ul>
            <dl className="num mt-3 grid gap-1 border-t border-line pt-3 text-sm">
              {o.discount > 0 && <div className="flex justify-between text-river"><dt>Discount{o.coupon && ` (${o.coupon})`}</dt><dd>−{inr(o.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-soft">Delivery</dt><dd>{o.shipping ? inr(o.shipping) : 'Free'}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total · {o.payment_method === 'cod' ? 'Cash on delivery' : o.payment_status === 'paid' ? 'Paid online' : 'Online'}</dt><dd>{inr(o.total)}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

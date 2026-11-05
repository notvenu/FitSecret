'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Banknote, CreditCard, Lock, Loader2, Tag, X, ShoppingBag } from 'lucide-react';
import { inr, STATES } from '@fitsecret/shared';
import { orderTotals } from '@fitsecret/shared/store';
import { useCart } from '@/components/cart';
import { QtyStepper, ShipProgress, LinePrice } from '@/components/CartDrawer';
import { supabase, orderError } from '@/lib/supabase';
import { payOnline, onlinePayments } from '@/lib/pay';

const SAVED = 'fs_address_v1';

// STATES §3, single page: contact → address → payment → review/place. place_order recomputes every price, discount and stock
// check on the server; the numbers here are a preview. Mobile: the order summary is a collapsible bar above the form.
export default function Checkout() {
  const { lines, subtotal, ready, clear, store, buyer, combo } = useCart();
  const router = useRouter();
  const [f, setF] = useState({ name: '', phone: '', email: '', line1: '', line2: '', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '', notes: '' });
  const [method, setMethod] = useState<'cod' | 'online'>(onlinePayments ? 'online' : 'cod');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponErr, setCouponErr] = useState('');
  const [points, setPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const sb = supabase();

  useEffect(() => {
    try { setF((x) => ({ ...x, ...JSON.parse(localStorage.getItem(SAVED) || '{}'), notes: '' })); } catch {}
    sb?.auth.getUser().then(({ data }) => {
      if (!data.user?.email) return;
      setF((x) => ({ ...x, email: x.email || data.user!.email! }));
      sb.rpc('my_points').then(({ data: p }) => setPoints(Number(p?.value) || 0));
    });
  }, [sb]);

  const t0 = orderTotals(subtotal, combo.total + (coupon?.discount || 0), store);
  const pts = usePoints ? Math.min(points, Math.max(0, t0.total - t0.shipping)) : 0;
  const tot = { ...t0, total: t0.total - pts };
  const codOk = store.cod_enabled && tot.total <= store.cod_limit;
  const short = store.min_order > subtotal ? store.min_order - subtotal : 0;
  useEffect(() => { if (!codOk && onlinePayments) setMethod('online'); }, [codOk]);

  const applyCoupon = async (c = code) => {
    setCouponErr('');
    if (!c.trim()) return setCoupon(null);
    if (!sb) return setCouponErr('Coupons work once online ordering opens.');
    const { data, error } = await sb.rpc('check_coupon', { p_code: c, p_subtotal: subtotal - combo.total, p_phone: f.phone || null });
    if (error) { setCoupon(null); setCouponErr(orderError(error.message)); } else setCoupon({ code: data.code, discount: Number(data.discount) });
  };
  useEffect(() => { if (coupon) applyCoupon(coupon.code); }, [subtotal, combo.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return; // double-submit guard
    setErr('');
    if (!sb) return setErr('Online ordering opens soon. Please call or WhatsApp us to order.');
    setBusy(true);
    try {
      const { name, phone, email, notes, ...address } = f;
      const { data, error } = await sb.rpc('place_order', { p: { name, phone, email, notes, address, payment_method: method, coupon: coupon?.code, points: pts || undefined,
        items: lines.map((l) => ({ item_id: l.id, qty: l.qty })) } });
      if (error) throw new Error(orderError(error.message));
      localStorage.setItem(SAVED, JSON.stringify({ ...f, notes: '' }));
      const phone10 = phone.replace(/\D/g, '').slice(-10);
      clear();
      let paid = method === 'cod';
      if (method === 'online') paid = await payOnline({ id: data.id, name, phone: phone10, email }).catch(() => false);
      router.push(`/track?no=${data.order_no}&phone=${phone10}${paid ? '&new=1' : ''}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  if (ready && !lines.length) {
    return (
      <div className="page-top mx-auto grid max-w-xl justify-items-center gap-6 px-4 pb-24 text-center">
        <ShoppingBag size={48} strokeWidth={1.25} className="text-mist" />
        <h1 className="h2">Your cart is empty</h1>
        <Link href="/shop" className="btn btn-dark">Start shopping</Link>
      </div>
    );
  }

  const summary = (
    <>
      {buyer && <p className="mb-4 rounded-[12px] bg-sage px-3 py-2 text-sm">Your regular-buyer rates are applied{buyer.name ? `, ${buyer.name}` : ''}.</p>}
      <ul className="max-h-80 divide-y divide-line overflow-y-auto">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{l.name}</p>
              {l.variant && <p className="text-xs text-ink-soft">{l.variant}</p>}
              <div className="mt-2"><QtyStepper id={l.id} qty={l.qty} max={Math.min(100, l.stock)} /></div>
            </div>
            <LinePrice l={l} />
          </li>
        ))}
      </ul>
      <div className="mt-4"><ShipProgress subtotal={tot.net} /></div>
      <div className="mt-5">
        {coupon ? (
          <div className="flex items-center justify-between rounded-[12px] border-[1.5px] border-haldi bg-haldi/15 px-3 py-2 text-sm">
            <span className="flex items-center gap-2"><Tag size={16} /><b>{coupon.code}</b> applied · you save {inr(coupon.discount)}</span>
            <button type="button" onClick={() => { setCoupon(null); setCode(''); }} aria-label="Remove coupon" className="grid size-9 place-items-center"><X size={14} /></button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input className="field flex-1 uppercase" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }} aria-label="Coupon code" />
            <button type="button" className="btn btn-ghost px-5" onClick={() => applyCoupon()}>Apply</button>
          </div>
        )}
        {couponErr && <p className="mt-2 text-sm text-madder" role="alert">{couponErr}</p>}
      </div>
      {points > 0 && (
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-[12px] border-[1.5px] border-line px-3 py-2.5 text-sm has-[:checked]:border-haldi">
          <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} className="size-4 accent-[var(--color-river)]" />
          <span>Use my loyalty points <span className="text-ink-soft">· {inr(points)} available</span></span>
        </label>
      )}
      <dl className="num mt-5 grid gap-2 border-t border-line pt-5 text-sm">
        <Row k="Subtotal" v={inr(subtotal)} />
        {combo.applied.map((c) => <Row key={c.id} k={`Combo: ${c.name}${c.sets > 1 ? ` ×${c.sets}` : ''}`} v={`−${inr(c.saving)}`} green />)}
        {coupon && <Row k={`Coupon ${coupon.code}`} v={`−${inr(coupon.discount)}`} green />}
        {pts > 0 && <Row k="Loyalty points" v={`−${inr(pts)}`} green />}
        <Row k="Delivery" v={tot.shipping ? inr(tot.shipping) : 'Free'} />
        <div className="flex justify-between pt-2 text-lg font-bold"><dt>Total</dt><dd>{inr(tot.total)}</dd></div>
      </dl>
    </>
  );

  return (
    <form onSubmit={submit} className="page-top mx-auto grid max-w-[1200px] gap-10 px-4 pb-24 md:grid-cols-12 md:px-8">
      <div className="md:col-span-7">
        <h1 className="h2">Checkout</h1>
        <details className="mt-6 rounded-[20px] bg-paper p-4 md:hidden">
          <summary className="flex items-center justify-between font-semibold">Order summary <span className="num">{inr(tot.total)}</span></summary>
          <div className="pt-4">{summary}</div>
        </details>

        <Step n={1} title="Contact">
          <L label="Full name"><input className="field" required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" /></L>
          <L label="Mobile number" hint="10 digits, for delivery updates"><input className="field" required inputMode="tel" pattern="[+0-9 \-]{10,15}" title="Enter a 10-digit mobile number" value={f.phone} onChange={set('phone')} autoComplete="tel" /></L>
          <div className="sm:col-span-2"><L label="Email (optional)"><input className="field" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></L></div>
        </Step>
        <Step n={2} title="Delivery address">
          <div className="sm:col-span-2"><L label="House / flat, street"><input className="field" required minLength={5} value={f.line1} onChange={set('line1')} autoComplete="address-line1" /></L></div>
          <div className="sm:col-span-2"><L label="Area, landmark (optional)"><input className="field" value={f.line2} onChange={set('line2')} autoComplete="address-line2" /></L></div>
          <L label="City"><input className="field" required value={f.city} onChange={set('city')} autoComplete="address-level2" /></L>
          <L label="Pincode"><input className="field num" required inputMode="numeric" pattern="\d{6}" title="Enter a 6-digit pincode" maxLength={6} value={f.pincode} onChange={set('pincode')} autoComplete="postal-code" /></L>
          <div className="sm:col-span-2"><L label="State">
            <select className="field" value={f.state} onChange={set('state')} autoComplete="address-level1">{Object.values(STATES).sort().map((s) => <option key={s as string}>{s as string}</option>)}</select>
          </L></div>
          <div className="sm:col-span-2"><L label="Delivery notes (optional)"><textarea className="field" rows={2} maxLength={500} value={f.notes} onChange={set('notes')} /></L></div>
        </Step>
        <Step n={3} title="Payment">
          {onlinePayments && <PayOpt on={method === 'online'} onClick={() => setMethod('online')} icon={<CreditCard size={24} />} title="Pay online" sub="UPI, cards, netbanking" />}
          <PayOpt on={method === 'cod'} disabled={!codOk} onClick={() => setMethod('cod')} icon={<Banknote size={24} />} title="Cash on delivery"
            sub={codOk ? 'Pay when it arrives' : store.cod_enabled ? `Available up to ${inr(store.cod_limit)}` : 'Not available right now'} />
        </Step>
      </div>

      <aside className="self-start md:sticky md:top-[calc(var(--nav-h)+1rem)] md:col-span-5">
        <div className="rounded-[20px] bg-paper p-6 shadow-rest">
          <h2 className="h3 mb-4 hidden md:block">Order summary</h2>
          <div className="hidden md:block">{summary}</div>
          {!store.open && <p className="mt-4 rounded-[12px] bg-madder/10 p-3 text-sm text-madder">Online orders are paused right now. Please call or visit the store.</p>}
          {short > 0 && <p className="mt-4 rounded-[12px] bg-sage p-3 text-sm">Minimum order is {inr(store.min_order)}. Add {inr(short)} more.</p>}
          {err && <p role="alert" className="mt-4 rounded-[12px] bg-madder/10 p-3 text-sm text-madder">{err}</p>}
          <button type="submit" disabled={busy || !lines.length || !store.open || short > 0 || (method === 'cod' && !codOk)} className="btn btn-gold mt-5 w-full min-h-14 text-base">
            {busy ? <Loader2 size={20} className="animate-spin" /> : <Lock size={18} />}
            {busy ? (method === 'online' ? 'Waiting for payment…' : 'Placing order…') : method === 'online' ? `Pay ${inr(tot.total)}` : 'Place order'}
          </button>
          <p className="mt-3 text-center text-xs text-ink-soft">Prices include GST. By placing this order you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>
        </div>
      </aside>
    </form>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-10">
      <legend className="mb-5 flex items-center gap-3"><span className="num grid size-8 place-items-center rounded-full bg-river text-sm font-bold text-chalk">{n}</span><span className="h3">{title}</span></legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
const L = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="grid content-start gap-1.5 text-sm"><span className="font-medium">{label}</span>{children}{hint && <span className="text-xs text-ink-soft">{hint}</span>}</label>
);
const Row = ({ k, v, green }: { k: string; v: string; green?: boolean }) => <div className={`flex justify-between ${green ? 'text-river' : ''}`}><dt className={green ? '' : 'text-ink-soft'}>{k}</dt><dd>{v}</dd></div>;

function PayOpt({ on, onClick, icon, title, sub, disabled }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled}
      className={`flex items-center gap-4 rounded-[12px] border-[1.5px] p-4 text-left transition-colors duration-[180ms] disabled:opacity-50 ${on ? 'border-haldi bg-haldi/10' : 'border-line bg-paper hover:border-river'}`}>
      <span className={on ? 'text-river' : 'text-ink-soft'}>{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="text-sm text-ink-soft">{sub}</span></span>
    </button>
  );
}

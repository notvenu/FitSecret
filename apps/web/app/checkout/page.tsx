'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Money, CreditCard, LockSimple, CircleNotch } from '@phosphor-icons/react';
import { inr, STATES } from '@fitsecret/shared';
import { useCart } from '@/components/cart';
import { QtyStepper, ShipProgress, FREE_SHIP } from '@/components/CartDrawer';
import { supabase, orderError } from '@/lib/supabase';
import { payOnline, onlinePayments } from '@/lib/pay';

const SHIP_FEE = 49;
const SAVED = 'fs_address_v1';

export default function Checkout() {
  const { lines, subtotal, ready, clear } = useCart();
  const router = useRouter();
  const [f, setF] = useState({ name: '', phone: '', email: '', line1: '', line2: '', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '', notes: '' });
  const [method, setMethod] = useState<'cod' | 'online'>(onlinePayments ? 'online' : 'cod');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sb = supabase();

  useEffect(() => {
    try { setF((x) => ({ ...x, ...JSON.parse(localStorage.getItem(SAVED) || '{}'), notes: '' })); } catch {}
    sb?.auth.getUser().then(({ data }) => data.user?.email && setF((x) => ({ ...x, email: x.email || data.user!.email! })));
  }, [sb]);

  const ship = subtotal >= FREE_SHIP ? 0 : SHIP_FEE;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!sb) return setErr('Online ordering opens soon. Please call or WhatsApp us to order.');
    setBusy(true);
    try {
      const { name, phone, email, notes, ...address } = f;
      const { data, error } = await sb.rpc('place_order', { p: { name, phone, email, notes, address, payment_method: method, items: lines.map((l) => ({ item_id: l.id, qty: l.qty })) } });
      if (error) throw new Error(orderError(error.message));
      localStorage.setItem(SAVED, JSON.stringify({ ...f, notes: '' }));
      const phone10 = phone.replace(/\D/g, '').slice(-10);
      clear(); // order exists now; stock is reserved
      let paid = method === 'cod';
      if (method === 'online') paid = await payOnline({ id: data.id, name, phone: phone10, email }).catch(() => false);
      router.push(`/track?no=${data.order_no}&phone=${phone10}${paid ? '&new=1' : ''}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  if (ready && !lines.length) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="display text-4xl">Your cart is empty</h1>
        <Link href="/shop" className="btn-ink mt-8">Browse supplements</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 md:grid-cols-[1.25fr_1fr] md:px-6">
      <div>
        <h1 className="display text-4xl">Checkout</h1>
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <L label="Full name"><input className="field" required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" /></L>
          <L label="Mobile number"><input className="field" required inputMode="tel" pattern="[+0-9 ]{10,15}" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="10-digit mobile" /></L>
          <div className="sm:col-span-2"><L label="Email (for order updates, optional)"><input className="field" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></L></div>
          <div className="sm:col-span-2"><L label="House / flat, street"><input className="field" required minLength={5} value={f.line1} onChange={set('line1')} autoComplete="address-line1" /></L></div>
          <div className="sm:col-span-2"><L label="Area, landmark (optional)"><input className="field" value={f.line2} onChange={set('line2')} autoComplete="address-line2" /></L></div>
          <L label="City"><input className="field" required value={f.city} onChange={set('city')} autoComplete="address-level2" /></L>
          <L label="Pincode"><input className="field" required inputMode="numeric" pattern="\d{6}" maxLength={6} value={f.pincode} onChange={set('pincode')} autoComplete="postal-code" /></L>
          <div className="sm:col-span-2"><L label="State">
            <select className="field" value={f.state} onChange={set('state')} autoComplete="address-level1">{Object.values(STATES).sort().map((s) => <option key={s}>{s}</option>)}</select>
          </L></div>
          <div className="sm:col-span-2"><L label="Delivery notes (optional)"><textarea className="field" rows={2} maxLength={500} value={f.notes} onChange={set('notes')} /></L></div>
        </section>

        <fieldset className="mt-10">
          <legend className="mb-4 display text-xl">Payment</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {onlinePayments && (
              <PayOpt on={method === 'online'} onClick={() => setMethod('online')} icon={<CreditCard size={24} />} title="Pay online" sub="UPI, cards, netbanking" />
            )}
            <PayOpt on={method === 'cod'} onClick={() => setMethod('cod')} icon={<Money size={24} />} title="Cash on delivery" sub="Pay when it arrives" />
          </div>
        </fieldset>
      </div>

      <aside className="self-start rounded-[var(--radius-card)] bg-surface p-6 md:sticky md:top-24">
        <h2 className="display text-xl">Order summary</h2>
        <ul className="mt-5 max-h-80 space-y-4 overflow-y-auto pr-1">
          {lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="line-clamp-2 font-medium">{l.name}</div>
                <div className="text-xs text-mute">{l.variant}</div>
                <div className="mt-2"><QtyStepper id={l.id} qty={l.qty} max={l.stock} /></div>
              </div>
              <span className="tabular-nums">{inr(l.price * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5"><ShipProgress subtotal={subtotal} /></div>
        <dl className="mt-5 space-y-2 border-t border-line pt-5 text-sm">
          <div className="flex justify-between"><dt className="text-mute">Subtotal</dt><dd className="tabular-nums">{inr(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-mute">Delivery</dt><dd className="tabular-nums">{ship ? inr(ship) : 'Free'}</dd></div>
          <div className="flex justify-between pt-2 text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">{inr(subtotal + ship)}</dd></div>
        </dl>
        {err && <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}
        <button type="submit" disabled={busy || !lines.length} className="btn-ink mt-5 w-full py-4 text-base">
          {busy ? <CircleNotch size={20} className="animate-spin" /> : <LockSimple size={18} weight="bold" />}
          {method === 'online' ? `Pay ${inr(subtotal + ship)}` : 'Place order'}
        </button>
        <p className="mt-3 text-center text-xs text-mute">Prices include GST. By placing this order you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>
      </aside>
    </form>
  );
}

const L = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="grid gap-2 text-sm"><span className="text-mute">{label}</span>{children}</label>;

function PayOpt({ on, onClick, icon, title, sub }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`flex items-center gap-4 rounded-[10px] border p-4 text-left transition-colors ${on ? 'border-ink bg-brand/10' : 'border-line hover:border-ink'}`}>
      <span className={on ? 'text-brand-deep' : 'text-mute'}>{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="text-sm text-mute">{sub}</span></span>
    </button>
  );
}

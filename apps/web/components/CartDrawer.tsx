'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Minus, Plus, X, ShoppingBag, Truck } from 'lucide-react';
import { useCart, type CartLine } from './cart';
import { useT } from './Lang';
import { Flower } from './Tree';
import { inr0, waLink, WhatsApp } from './ui';
import { GOALS } from '@/lib/goals';

export function QtyStepper({ id, qty, max }: { id: string; qty: number; max: number }) {
  const { setQty } = useCart();
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-paper">
      <button type="button" onClick={() => setQty(id, qty - 1)} className="grid size-9 place-items-center" aria-label="Decrease quantity"><Minus size={14} /></button>
      <span className="num w-7 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
      <button type="button" onClick={() => setQty(id, qty + 1)} disabled={qty >= max} className="grid size-9 place-items-center disabled:opacity-30" aria-label="Increase quantity"><Plus size={14} /></button>
    </span>
  );
}

export function LinePrice({ l }: { l: CartLine }) {
  const { priceOf } = useCart();
  const unit = priceOf(l, l.qty);
  return (
    <span className="num shrink-0 text-right text-sm font-semibold">
      {inr0(unit * l.qty)}
      {unit < l.price && <span className="block text-xs font-normal text-ink-soft line-through">{inr0(l.price * l.qty)}</span>}
    </span>
  );
}

// Free-delivery progress (owner sets the threshold in the POS). A vine grows toward a flower that blooms at 100%.
export function ShipProgress({ subtotal }: { subtotal: number }) {
  const { store } = useCart();
  const t = useT();
  const goal = store.free_shipping_above;
  if (!goal || !store.shipping_fee) return null;
  const pct = Math.min(100, (subtotal / goal) * 100);
  return (
    <div>
      <p className="flex items-center gap-2 text-sm"><Truck size={16} className="text-river" />{pct >= 100 ? <b>{t('cart.free')}</b> : t('cart.away', { p: inr0(goal - subtotal) })}</p>
      {/* A vine grows toward the flower; at 100% the flower blooms */}
      <div className="mt-2 flex items-center gap-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sage">
          <div className="h-full rounded-full bg-leaf transition-[width] duration-700" style={{ width: `${pct}%`, transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)' }} />
        </div>
        <span className={`transition-[transform,filter] duration-[400ms] ease-[var(--ease-stamp)] ${pct >= 100 ? 'scale-110 rotate-[30deg]' : 'scale-75 grayscale'}`}><Flower color="#FFB81F" size={24} /></span>
      </div>
    </div>
  );
}

export function cartMessage(lines: CartLine[], total: number) {
  return `Hi Fit Secrets, I'd like to order:\n${lines.map((l) => `• ${l.name}${l.variant ? ` (${l.variant})` : ''} × ${l.qty}`).join('\n')}\nTotal: ${inr0(total)}\nPincode: `;
}

// Mini-cart: right drawer on desktop, bottom sheet on mobile. Focus is trapped and returned on close.
export default function CartDrawer({ phone }: { phone: string }) {
  const { lines, open, setOpen, subtotal, combo } = useCart();
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const net = subtotal - combo.total;
  return (
    <dialog ref={ref} onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && setOpen(false)} aria-label={t('cart.title')}
      className="fixed m-0 ml-auto mt-auto flex h-[88dvh] max-h-none w-full max-w-none flex-col rounded-t-[28px] bg-chalk p-0 text-ink shadow-lift backdrop:bg-deep/40 backdrop:backdrop-blur-[2px] not-open:hidden
        open:animate-[sheet-up_320ms_var(--ease-out-expo)] md:mt-0 md:h-dvh md:max-w-md md:rounded-none md:rounded-l-[28px] md:open:animate-[sheet-left_320ms_var(--ease-out-expo)]">
      <style>{`@keyframes sheet-up{from{transform:translateY(100%)}}@keyframes sheet-left{from{transform:translateX(100%)}}`}</style>
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="h3">{t('cart.title')}</h2>
        <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full hover:bg-sage" aria-label={t('nav.close')}><X size={20} /></button>
      </header>

      {!lines.length ? (
        <div className="grid flex-1 content-center justify-items-center gap-6 px-6 text-center">
          <ShoppingBag size={48} strokeWidth={1.25} className="text-mist" />
          <p className="max-w-60 text-lg">{t('cart.empty')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {GOALS.map((g) => <Link key={g.slug} href={`/shop?goal=${g.slug}`} onClick={() => setOpen(false)} className="chip">{t(g.label)}</Link>)}
          </div>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
            {lines.map((l) => (
              <li key={l.id} className="flex gap-3 py-4 animate-[rise_320ms_var(--ease-out-expo)]">
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${l.key}`} onClick={() => setOpen(false)} className="line-clamp-2 font-medium hover:underline">{l.name}</Link>
                  {l.variant && <p className="text-sm text-ink-soft">{l.variant}</p>}
                  <div className="mt-2 flex items-center gap-3">
                    <QtyStepper id={l.id} qty={l.qty} max={Math.min(100, l.stock)} />
                  </div>
                </div>
                <LinePrice l={l} />
              </li>
            ))}
          </ul>
          <footer className="space-y-4 border-t border-line px-5 pt-4 pb-safe">
            <ShipProgress subtotal={net} />
            {combo.applied.map((c) => <p key={c.id} className="flex justify-between text-sm text-river"><span>Combo: {c.name}</span><span className="num">−{inr0(c.saving)}</span></p>)}
            <p className="flex justify-between text-lg font-semibold"><span>{t('cart.subtotal')}</span><span className="num">{inr0(net)}</span></p>
            <div className="grid gap-2 pb-2">
              <Link href="/checkout" onClick={() => setOpen(false)} className="btn btn-gold w-full">{t('cart.checkout')}</Link>
              <a href={waLink(phone, cartMessage(lines, net))} target="_blank" rel="noreferrer" className="btn btn-ghost w-full"><WhatsApp size={18} />{t('cart.whatsapp')}</a>
            </div>
          </footer>
        </>
      )}
    </dialog>
  );
}

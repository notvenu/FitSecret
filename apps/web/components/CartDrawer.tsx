'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Minus, Plus } from '@phosphor-icons/react';
import { inr } from '@fitsecret/shared';
import { useCart } from './cart';
import ProductShot from './ProductShot';

export const FREE_SHIP = 999;

export function QtyStepper({ id, qty, max }: { id: string; qty: number; max: number }) {
  const { setQty } = useCart();
  return (
    <div className="inline-flex items-center rounded-full border border-line">
      <button className="grid h-8 w-8 place-items-center" onClick={() => setQty(id, qty - 1)} aria-label="Decrease quantity"><Minus size={14} /></button>
      <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
      <button className="grid h-8 w-8 place-items-center disabled:opacity-30" disabled={qty >= Math.min(max, 20)} onClick={() => setQty(id, qty + 1)} aria-label="Increase quantity"><Plus size={14} /></button>
    </div>
  );
}

export function ShipProgress({ subtotal }: { subtotal: number }) {
  const left = FREE_SHIP - subtotal;
  return (
    <div className="text-sm">
      {left > 0 ? <span>Add <b>{inr(left)}</b> more for free delivery</span> : <span><b>Free delivery</b> unlocked</span>}
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${Math.min(100, (subtotal / FREE_SHIP) * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
    </div>
  );
}

export default function CartDrawer() {
  const { lines, open, setOpen, subtotal } = useCart();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.aside role="dialog" aria-label="Cart" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 280, damping: 34 }}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="display text-3xl">Your cart</h2>
              <button onClick={() => setOpen(false)} aria-label="Close cart" className="rounded-full p-2 hover:bg-surface"><X size={22} /></button>
            </div>
            {!lines.length ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <p className="display text-4xl">Empty shaker</p>
                  <p className="mt-2 text-sm text-mute">Add something worth shaking.</p>
                  <Link href="/shop" onClick={() => setOpen(false)} className="btn-ink mt-6">Shop products</Link>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-line px-5 py-4"><ShipProgress subtotal={subtotal} /></div>
                <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
                  <AnimatePresence initial={false}>
                    {lines.map((l) => (
                      <motion.li key={l.id} layout exit={{ opacity: 0, x: 40 }} className="flex gap-4 py-4">
                        <div className="h-24 w-20 shrink-0 overflow-hidden rounded-[10px] bg-surface"><ProductShot brand={l.brand} name={l.name} size={l.variant.split(' · ')[0]} /></div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/p/${l.key}?v=${l.id}`} onClick={() => setOpen(false)} className="line-clamp-2 text-sm font-semibold hover:underline">{l.name}</Link>
                          <div className="text-xs text-mute">{l.variant}</div>
                          <div className="mt-3 flex items-center justify-between">
                            <QtyStepper id={l.id} qty={l.qty} max={l.stock} />
                            <span className="font-semibold tabular-nums">{inr(l.price * l.qty)}</span>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
                <div className="border-t border-line p-5">
                  <div className="mb-4 flex justify-between text-lg"><span>Subtotal</span><span className="font-bold tabular-nums">{inr(subtotal)}</span></div>
                  <Link href="/checkout" onClick={() => setOpen(false)} className="btn-ink w-full py-4 text-base">Checkout</Link>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

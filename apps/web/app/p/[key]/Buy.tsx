'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { inr } from '@fitsecret/shared';
import type { Product } from '@/lib/catalog';
import { useCart } from '@/components/cart';
import ProductShot from '@/components/ProductShot';

const pct = (mrp: number, p: number) => (mrp > p ? Math.round(((mrp - p) / mrp) * 100) : 0);
const rupees = (n: number) => inr(n).replace('.00', '');

export default function Buy({ p, initial }: { p: Product; initial?: string }) {
  const { add } = useCart();
  const router = useRouter();
  const start = p.variants.find((v) => v.id === initial) || p.variants.find((v) => v.stock > 0) || p.variants[0];
  const [size, setSize] = useState(start.size);
  const [flavour, setFlavour] = useState(start.flavour);
  const [qty, setQty] = useState(1);

  const sizes = [...new Set(p.variants.map((v) => v.size))].filter(Boolean);
  const flavours = [...new Set(p.variants.map((v) => v.flavour))].filter(Boolean);
  const v = useMemo(() => p.variants.find((x) => x.size === size && x.flavour === flavour) || p.variants.find((x) => x.size === size) || p.variants[0], [p, size, flavour]);
  const exists = (s: string, f: string) => p.variants.some((x) => x.size === s && x.flavour === f);
  const off = pct(v.mrp, v.price);
  const line = { id: v.id, key: p.key, name: p.name, variant: [v.size, v.flavour].filter(Boolean).join(' · '), price: v.price, mrp: v.mrp, brand: p.brand, stock: v.stock };
  const pickSize = (s: string) => { setSize(s); if (!exists(s, flavour)) setFlavour(p.variants.find((x) => x.size === s)!.flavour); setQty(1); };
  const opt = (on: boolean) => `rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through ${on ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`;

  return (
    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
      <div className="aspect-square overflow-hidden rounded-[var(--radius-card)] md:sticky md:top-32 md:self-start">
        <AnimatePresence mode="wait">
          <motion.div key={v.id} className="h-full w-full" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <ProductShot brand={p.brand} name={p.name} size={v.size} image={v.image} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div>
        <div className="text-sm font-semibold uppercase tracking-wide text-mute">{p.brand}</div>
        <h1 className="display mt-2 text-[clamp(2.4rem,5vw,4.2rem)]">{p.name.replace(p.brand, '').trim()}</h1>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-3">
          <span className="text-4xl font-bold tabular-nums">{rupees(v.price)}</span>
          {off > 0 && <><span className="text-lg text-mute line-through tabular-nums">{rupees(v.mrp)}</span><span className="font-semibold text-brand-deep">Save {off}%</span></>}
        </div>
        <div className="mt-1 text-xs text-mute">MRP inclusive of all taxes</div>

        {sizes.length > 0 && (
          <fieldset className="mt-8">
            <legend className="mb-3 text-sm font-semibold">Size</legend>
            <div className="flex flex-wrap gap-2">{sizes.map((s) => <button key={s} onClick={() => pickSize(s)} aria-pressed={s === size} className={opt(s === size)}>{s}</button>)}</div>
          </fieldset>
        )}
        {flavours.length > 1 && (
          <fieldset className="mt-6">
            <legend className="mb-3 text-sm font-semibold">Flavour</legend>
            <div className="flex flex-wrap gap-2">
              {flavours.map((f) => <button key={f} disabled={!exists(size, f)} onClick={() => { setFlavour(f); setQty(1); }} aria-pressed={f === flavour} className={opt(f === flavour)}>{f}</button>)}
            </div>
          </fieldset>
        )}

        <p className="mt-6 text-sm font-medium">
          {v.stock <= 0 ? <span className="text-danger">Out of stock</span> : v.stock <= 5 ? <span className="text-danger">Only {v.stock} left</span> : <span className="text-brand-deep">In stock. Ships within 24 hours.</span>}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="inline-flex items-center rounded-full border border-line">
            <button className="h-12 w-12 text-lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
            <span className="w-8 text-center tabular-nums" aria-live="polite">{qty}</span>
            <button className="h-12 w-12 text-lg disabled:opacity-30" disabled={qty >= Math.min(20, v.stock)} onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity">+</button>
          </div>
          <button disabled={v.stock <= 0} onClick={() => add(line, qty)} className="btn-ink h-12 flex-1 px-6">Add to cart</button>
          <button disabled={v.stock <= 0} onClick={() => { add(line, qty, false); router.push('/checkout'); }} className="btn-brand h-12 flex-1 px-6">Buy now</button>
        </div>
      </div>
    </div>
  );
}

'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRef } from 'react';
import { Plus, ImageOff } from 'lucide-react';
import type { Product } from '@/lib/catalog';
import { useCart } from './cart';
import { useT } from './Lang';
import { inr0, pourToCart } from './ui';
import { goalsOf } from '@/lib/goals';

export const lineOf = (p: Product, v: Product['variants'][number]) => ({
  id: v.id, key: p.key, name: p.name, variant: [v.size, v.flavour].filter(Boolean).join(' · '), price: v.price, mrp: v.mrp, brand: p.brand, stock: v.stock,
  bulkPrice: v.bulkPrice, bulkMin: v.bulkMin,
});

// Every tile is the same height: it fills its grid cell, and the brand line and two name lines are always reserved.
// Sticker tile (DESIGN v3 §8): 2px indigo outline, hard print shadow, pack on its goal's colour. Desktop hover lifts the
// sticker and peels the bottom-right corner to reveal quick add (effect #6); touch shows a small lime "+" sticker. Max two badges.
// The whole tile is clickable through a stretched link on the name; the quick-add sits above it.
export default function ProductTile({ p, priority = false }: { p: Product; priority?: boolean }) {
  const t = useT();
  const { add } = useCart();
  const btn = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const single = p.variants.length === 1 ? p.variants[0] : null;
  const off = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const multi = new Set(p.variants.map((v) => v.price)).size > 1;

  const goal = goalsOf(p)[0];

  return (
    <div ref={card}
      className="sticker group relative flex h-full flex-col rounded-[24px] bg-paper p-3 transition-[transform,box-shadow] duration-[350ms] ease-[var(--ease-stamp)] hover:-translate-x-0.5 hover:-translate-y-1 hover:-rotate-1 hover:shadow-[9px_10px_0_rgb(23_35_122/.2)]">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[18px]" style={{ viewTransitionName: `p-${p.key.replace(/[^\w-]/g, '')}`, background: goal ? `color-mix(in srgb, var(--color-goal-${goal}) 22%, white)` : 'var(--color-sky)' }}>
        {p.image ? (
          <Image src={p.image} alt="" fill sizes="(min-width:1200px) 300px, (min-width:768px) 33vw, 50vw" preload={priority} loading={priority ? 'eager' : undefined}
            className="object-contain p-3 mix-blend-multiply transition-transform duration-[600ms] ease-[var(--ease-out-expo)] group-hover:scale-105" />
        ) : <ImageOff className="absolute inset-0 m-auto text-mist" strokeWidth={1.25} />}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {off >= 5 && <span className="rounded-full border-2 border-indigo bg-coral px-2 py-0.5 text-xs font-bold text-paper">−{off}%</span>}
          {p.featured && <span className="rounded-full border-2 border-indigo bg-lime px-2 py-0.5 text-xs font-bold text-indigo">Bestseller</span>}
        </div>
        {p.inStock ? (
          <div className="absolute right-0 bottom-0 z-10">
            {/* the peeling corner: a folded triangle that grows on hover */}
            <span aria-hidden className="pointer-events-none absolute right-0 bottom-0 hidden size-0 rounded-tl-[10px] bg-[linear-gradient(135deg,#fff_49%,rgb(23_35_122/.25)_50%,transparent_51%)] shadow-[-3px_-3px_6px_rgb(23_35_122/.15)] transition-[width,height] duration-[350ms] ease-[var(--ease-stamp)] group-hover:size-16 md:block" />
            <div className="relative p-2 transition-[opacity,transform] duration-[200ms] md:translate-y-2 md:opacity-0 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 md:group-hover:translate-y-0 md:group-hover:opacity-100">
            {single ? (
              <button ref={btn} type="button" onClick={() => { add(lineOf(p, single), 1, false); pourToCart(btn.current); }}
                className="btn btn-dark sticker min-h-10 px-3.5 py-2 text-sm" aria-label={`${t('tile.add')}: ${p.name}`}>
                <Plus size={16} /><span className="hidden sm:inline">{t('tile.add')}</span>
              </button>
            ) : (
              <span className="rounded-full border-2 border-indigo bg-paper px-3 py-1.5 text-xs font-bold text-indigo">{p.variants.length} options</span>
            )}
            </div>
          </div>
        ) : (
          <span className="absolute inset-x-2 bottom-2 rounded-full border-2 border-indigo bg-paper py-1 text-center text-xs font-bold text-indigo">{t('tile.out')}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-1 pt-3">
        <p className="min-h-[1lh] truncate text-xs text-ink-soft">{p.brand}</p>
        <h3 className="line-clamp-2 min-h-[2lh] text-[15px] leading-snug font-semibold">
          <Link href={`/p/${p.key}`} className="after:absolute after:inset-0 after:rounded-[24px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-[3px] focus-visible:after:outline-indigo">{p.name}</Link>
        </h3>
        <p className="mt-auto flex items-baseline gap-2 pt-2">
          {multi && <span className="text-xs text-ink-soft">{t('tile.from')}</span>}
          <span className="num text-lg font-extrabold text-indigo">{inr0(p.price)}</span>
          {off > 0 && <span className="num text-sm text-ink-soft line-through">{inr0(p.mrp)}</span>}
        </p>
      </div>
    </div>
  );
}

export function TileSkeleton() {
  return <div className="sticker rounded-[24px] bg-paper p-3"><div className="skeleton aspect-[4/5] rounded-[18px]" /><div className="skeleton mt-3 h-4 w-3/4 rounded" /><div className="skeleton mt-2 h-5 w-1/3 rounded" /></div>;
}

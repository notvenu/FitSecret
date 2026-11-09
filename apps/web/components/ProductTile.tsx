'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRef } from 'react';
import { Plus, ImageOff, ChevronRight } from 'lucide-react';
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
// Sticker tile (DESIGN v3 §8): 2px indigo outline, hard print shadow, pack on a light tint of its goal's colour. Max two badges.
// Add-to-cart sits beside the price on every screen (hover-only buttons don't exist on phones and are easy to miss on desktop).
// The whole tile is clickable through a stretched link on the name; the add button sits above it.
export default function ProductTile({ p, priority = false }: { p: Product; priority?: boolean }) {
  const t = useT();
  const { add, lines } = useCart();
  const btn = useRef<HTMLButtonElement>(null);
  const single = p.variants.length === 1 ? p.variants[0] : null;
  const off = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const multi = new Set(p.variants.map((v) => v.price)).size > 1;
  const inCart = single ? lines.find((l) => l.id === single.id)?.qty || 0 : 0;
  const goal = goalsOf(p)[0];

  return (
    <div className="sticker group relative flex h-full flex-col rounded-[22px] bg-paper p-2.5 transition-[transform,box-shadow] duration-[350ms] ease-[var(--ease-stamp)] hover:-translate-y-1 hover:shadow-[8px_9px_0_rgb(23_35_122/.2)]">
      <div className="relative aspect-square overflow-hidden rounded-[16px]" style={{ viewTransitionName: `p-${p.key.replace(/[^\w-]/g, '')}`, background: goal ? `color-mix(in srgb, var(--color-goal-${goal}) 14%, white)` : 'var(--color-sky)' }}>
        {p.image ? (
          <Image src={p.image} alt="" fill sizes="(min-width:1280px) 270px, (min-width:640px) 31vw, 46vw" preload={priority} loading={priority ? 'eager' : undefined}
            className={`object-contain p-3 mix-blend-multiply transition-transform duration-[600ms] ease-[var(--ease-out-expo)] group-hover:scale-105 ${p.inStock ? '' : 'opacity-50 grayscale'}`} />
        ) : <ImageOff className="absolute inset-0 m-auto text-mist" strokeWidth={1.25} />}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {off >= 5 && p.inStock && <span className="rounded-full bg-coral px-2 py-0.5 text-xs font-bold text-paper">−{off}%</span>}
          {p.featured && <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-bold text-indigo">{t('tile.best')}</span>}
        </div>
        {!p.inStock && <span className="absolute inset-x-2 bottom-2 rounded-full bg-paper/90 py-1 text-center text-xs font-bold text-indigo">{t('tile.out')}</span>}
      </div>
      <div className="flex flex-1 flex-col px-1 pt-2.5">
        <p className="min-h-[1lh] truncate text-xs font-medium text-ink-soft">{p.brand}</p>
        <h3 className="mt-0.5 line-clamp-2 min-h-[2lh] font-sans! text-sm leading-snug font-semibold! tracking-normal! text-ink md:text-[15px]">
          <Link href={`/p/${p.key}`} className="after:absolute after:inset-0 after:rounded-[22px] focus-visible:outline-none focus-visible:after:outline-[3px] focus-visible:after:outline-indigo">{p.name}</Link>
        </h3>
        {p.variants.length > 1 && <p className="mt-1 text-xs text-ink-soft">{t('tile.options', { n: p.variants.length })}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="min-w-0 leading-tight">
            {multi && <span className="block text-[11px] text-ink-soft">{t('tile.from')}</span>}
            <span className="num text-base font-extrabold text-indigo md:text-lg">{inr0(p.price)}</span>
            {off > 0 && <span className="num block text-xs text-ink-soft line-through sm:ml-1.5 sm:inline">{inr0(p.mrp)}</span>}
          </p>
          {single && p.inStock && (
            <button ref={btn} type="button" onClick={() => { add(lineOf(p, single), 1, false); pourToCart(btn.current); }}
              className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-indigo text-paper transition-colors hover:bg-[#22309A] active:scale-95"
              aria-label={`${t('tile.add')}: ${p.name}`}>
              {inCart ? <span className="num text-sm font-bold">{inCart}</span> : <Plus size={18} strokeWidth={2.5} />}
            </button>
          )}
          {!single && p.inStock && <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-indigo text-indigo" aria-hidden><ChevronRight size={18} /></span>}
        </div>
      </div>
    </div>
  );
}

export function TileSkeleton() {
  return <div className="sticker rounded-[24px] bg-paper p-3"><div className="skeleton aspect-[4/5] rounded-[18px]" /><div className="skeleton mt-3 h-4 w-3/4 rounded" /><div className="skeleton mt-2 h-5 w-1/3 rounded" /></div>;
}

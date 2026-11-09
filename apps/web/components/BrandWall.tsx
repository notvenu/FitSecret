import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { Brand } from '@/lib/catalog';
import type { T } from '@/lib/i18n';
import LOGOS from '@/lib/brand-logos.json';

const logos = LOGOS as Record<string, string>;

// Brands we stock: each card is a pack from that brand (with its logo as a corner badge when we have a sharp one), its name and product count,
// straight to its shop page. Home shows the biggest brands; /brands shows them all (limit omitted).
export default function BrandWall({ brands, t, limit }: { brands: Brand[]; t: T; limit?: number }) {
  const shown = limit ? brands.slice(0, limit) : brands;
  return (
    <section className="mx-auto max-w-[1360px] px-4 pb-20 md:px-8 md:pb-28">
      {limit && (
        <div className="flex items-end justify-between gap-4">
          <div><h2 className="h2">{t('brands.title')}</h2><p className="mt-2 max-w-xl text-ink-soft">{t('brands.sub')}</p></div>
          <Link href="/brands" className="hidden shrink-0 items-center gap-1 font-semibold text-river hover:underline sm:inline-flex">{t('brands.all', { n: brands.length })}<ArrowRight size={16} /></Link>
        </div>
      )}
      <ul className={limit
        ? 'no-scrollbar -mx-4 mt-8 grid snap-x auto-cols-[40%] grid-flow-col gap-3 overflow-x-auto px-4 sm:auto-cols-[28%] md:mx-0 md:grid-flow-row md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-6'
        : 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6'}>
        {shown.map((b) => (
          <li key={b.name} className="snap-start">
            <Link href={`/shop?brand=${encodeURIComponent(b.name)}`}
              className="sticker group flex h-full flex-col rounded-[20px] bg-paper p-2.5 transition-transform duration-[350ms] ease-[var(--ease-stamp)] hover:-translate-y-1">
              <span className="relative block aspect-square overflow-hidden rounded-[14px] bg-sky">
                {b.image && <Image src={b.image} alt="" fill sizes="(min-width:1024px) 200px, (min-width:640px) 28vw, 40vw"
                  className="object-contain p-3 mix-blend-multiply transition-transform duration-[600ms] ease-[var(--ease-out-expo)] group-hover:scale-105" />}
                {logos[b.name] && <span className="sticker absolute top-2 left-2 grid size-11 -rotate-6 place-items-center rounded-[12px] bg-paper p-1 transition-transform duration-[350ms] ease-[var(--ease-stamp)] group-hover:rotate-0">
                  <Image src={logos[b.name]} alt="" width={36} height={36} className="size-full object-contain" /></span>}
              </span>
              <span className="mt-2.5 truncate px-1 font-bold text-indigo">{b.name}</span>
              <span className="num px-1 text-xs text-ink-soft">{t('brands.count', { n: b.count })}</span>
            </Link>
          </li>
        ))}
      </ul>
      {limit && <Link href="/brands" className="btn btn-ghost mt-6 text-indigo sm:hidden">{t('brands.all', { n: brands.length })}<ArrowRight size={16} /></Link>}
    </section>
  );
}

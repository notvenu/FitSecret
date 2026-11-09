import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { Brand } from '@/lib/catalog';
import type { T } from '@/lib/i18n';
import LOGOS from '@/lib/brand-logos.json';

// Two conveyor belts of brand stickers sliding opposite ways (CSS marquee: pauses on hover, still and scrollable with
// reduced motion). Each sticker sits at its own slight tilt; hovering one straightens it, lifts it and peels out its
// product count. Real logos (scripts/fetch-brand-logos.mjs) go on white stickers; brands without a sharp logo get a
// hand-lettered one in the site's palette, so nothing is ever a blurry favicon.
const logos = LOGOS as Record<string, string>;
const PAPERS = ['bg-lime', 'bg-marigold', 'bg-coral text-paper', 'bg-sky', 'bg-leaf text-paper', 'bg-haldi-light'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const tilt = (s: string) => ((Math.abs(hash(s)) % 13) - 6); // −6° … 6°, the same on every visit
// the display face is wide: size the lettering by the longest word so "Nutrition" never gets clipped
const fit = (s: string) => { const l = Math.max(...s.split(/\s+/).map((w) => w.length)); return l <= 5 ? 'text-xl md:text-2xl' : l <= 7 ? 'text-base md:text-lg' : l <= 8 ? 'text-sm md:text-base' : 'text-xs md:text-sm'; };

export default function BrandBelt({ brands, t }: { brands: Brand[]; t: T }) {
  const shown = brands.filter((b) => b.count >= 2).slice(0, 40);
  const rows = [shown.filter((_, i) => i % 2 === 0), shown.filter((_, i) => i % 2 === 1)];
  return (
    <section className="overflow-hidden pb-20 md:pb-28" aria-labelledby="brands-h">
      <div className="mx-auto flex max-w-[1360px] items-end justify-between gap-4 px-4 md:px-8">
        <div><h2 id="brands-h" className="h2">{t('brands.title')}</h2><p className="mt-2 max-w-xl text-ink-soft">{t('brands.sub')}</p></div>
        <Link href="/brands" className="hidden shrink-0 items-center gap-1 font-semibold text-river hover:underline sm:inline-flex">{t('brands.all', { n: brands.length })}<ArrowRight size={16} /></Link>
      </div>
      <div className="brand-belt mt-10 grid gap-6">
        {rows.map((row, r) => (
          // the list is drawn twice so the belt loops seamlessly; the copy is hidden from screen readers and the tab order
          <div key={r} className="marquee gap-6 pr-6 py-4" style={{ animationDuration: `${row.length * 4}s`, animationDirection: r ? 'reverse' : 'normal' }}>
            {[...row, ...row].map((b, i) => <Sticker key={`${b.name}-${i}`} b={b} copy={i >= row.length} t={t} />)}
          </div>
        ))}
      </div>
      <div className="px-4 sm:hidden"><Link href="/brands" className="btn btn-ghost mt-6 text-indigo">{t('brands.all', { n: brands.length })}<ArrowRight size={16} /></Link></div>
    </section>
  );
}

function Sticker({ b, copy, t }: { b: Brand; copy: boolean; t: T }) {
  const logo = logos[b.name];
  const paper = PAPERS[Math.abs(hash(b.name)) % PAPERS.length];
  return (
    <Link href={`/shop?brand=${encodeURIComponent(b.name)}`} aria-hidden={copy || undefined} tabIndex={copy ? -1 : undefined}
      aria-label={copy ? undefined : `${b.name}, ${t('brands.count', { n: b.count })}`}
      className="group relative shrink-0 focus-visible:outline-none" style={{ '--r': `${tilt(b.name)}deg` } as React.CSSProperties}>
      <span className={`sticker grid size-28 place-items-center overflow-hidden rounded-[22px] rotate-[var(--r)] transition-[rotate,scale,box-shadow] duration-[350ms] ease-[var(--ease-stamp)]
        group-hover:scale-110 group-hover:rotate-0 group-focus-visible:rotate-0 group-hover:shadow-[9px_10px_0_rgb(23_35_122/.22)] group-focus-visible:scale-110 group-focus-visible:outline-[3px] group-focus-visible:outline-indigo md:size-32
        ${logo ? 'bg-paper p-3' : `${paper} p-3 text-indigo`}`}>
        {logo
          ? <Image src={logo} alt="" width={104} height={104} className="size-full object-contain" />
          : <span className={`display line-clamp-3 text-center leading-[1.05] ${fit(b.name)}`}>{b.name}</span>}
      </span>
      {/* the peel-out tag */}
      <span className="num pointer-events-none absolute -bottom-3 left-1/2 -translate-x-1/2 translate-y-1 scale-75 rounded-full border-2 border-indigo bg-lime px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-indigo opacity-0 transition-[opacity,translate,scale] duration-[300ms] ease-[var(--ease-stamp)] group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100">
        {t('brands.count', { n: b.count })}
      </span>
    </Link>
  );
}

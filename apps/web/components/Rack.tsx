import Link from 'next/link';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { inr } from '@fitsecret/shared';
import type { Product } from '@/lib/catalog';
import { discount } from '@/lib/catalog';
import CUTOUTS from '@/lib/shelf-cutouts.json';
import ProductShot from './ProductShot';
import QuickAdd from './QuickAdd';
import RackScroller from './RackScroller';
import AisleSign from './AisleSign';

const rupees = (n: number) => inr(n).replace('.00', '');
const cutout = (src: string | null) => (src ? (CUTOUTS as Record<string, string>)[src] : undefined);

// One store aisle (shown inside AisleWalk) drawn as a shop shelf unit: pegboard back, dark uprights, two shelves.
// Packs stand on the shelf as background-free cutouts (scripts/shelf-cutouts.py); without one, the photo stands as a box.
// Each pack has a shelf-edge label (name, price, add); hover/focus lifts it and shows size + offer. Styles: .shelf-* in globals.css.
export default function Rack({ n, slug, name, count, items }: { n: number; slug: string; name: string; count: number; items: Product[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <AisleSign label={`Aisle ${String(n).padStart(2, '0')} · ${count} products`} title={name} />
        </div>
        <Link href={`/shop?category=${slug}`} className="group hidden items-center gap-1 pb-1 text-sm sm:inline-flex font-semibold underline decoration-brand decoration-2 underline-offset-4">
          See the whole aisle <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="shelf-unit mt-4">
        <RackScroller label={`${name} shelf`} className="grid grid-flow-col grid-rows-2 auto-cols-[128px] [--tier:min(136px,15svh)] sm:auto-cols-[150px] md:[--tier:min(170px,17vh)]">
          {items.map((p, i) => <Slot key={p.key} p={p} i={i} />)}
          <li className="rack-in row-span-2 snap-start p-2" style={{ ['--i' as string]: 7 }}>
            <Link href={`/shop?category=${slug}`} className="grid h-full place-items-center rounded-md border-2 border-dashed border-ink/25 bg-white/60 p-4 text-center text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:bg-white hover:text-ink">
              <span>All {count}<br />{name.toLowerCase()}<ArrowUpRight size={16} className="mx-auto mt-2" /></span>
            </Link>
          </li>
        </RackScroller>
      </div>
      <div aria-hidden className="shelf-plinth" />
    </section>
  );
}

export function Slot({ p, i = 0 }: { p: Product; i?: number }) {
  const v = p.variants.find((x) => x.stock > 0) || p.variants[0];
  const src = v.image || p.image;
  const cut = cutout(src);
  const off = discount(p.mrp, p.price);
  const flavours = new Set(p.variants.map((x) => x.flavour).filter(Boolean)).size;
  const meta = [v.size, flavours > 1 ? `${flavours} flavours` : p.variants.length > 1 ? `${p.variants.length} sizes` : ''].filter(Boolean).join(' · ');
  return (
    <li className="shelf-slot rack-in group snap-start" style={{ ['--i' as string]: Math.min(Math.floor(i / 2), 7) }} data-shelf-src={src || undefined}>
      <Link href={`/p/${p.key}`} tabIndex={-1} aria-hidden className={`shelf-space ${p.inStock ? '' : 'shelf-empty'}`}>
        {cut
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/shelf/${cut}`} alt="" loading="lazy" className="shelf-pack shelf-cut" />
          : <span className="shelf-pack shelf-box"><ProductShot brand={p.brand} name={p.name} size={v.size} image={src} sizes="160px" /></span>}
        <span className="shelf-shadow" />
        {(meta || off > 0) && (
          <span className="shelf-chip">{meta}{meta && off > 0 && ' · '}{off > 0 && <b className="text-brand">{off}% off</b>}</span>
        )}
      </Link>
      <div className="shelf-board" />
      <div className="shelf-lip">
        <div className="shelf-label relative">
          <Link href={`/p/${p.key}`} className="block truncate text-[11px] font-medium leading-tight text-ink-soft after:absolute after:inset-0" title={p.name}>{p.name}</Link>
          {meta && <span className="block truncate text-[10px] leading-tight text-mute md:hidden">{meta}</span>}
          <div className="mt-0.5 flex items-center justify-between gap-1">
            {p.inStock
              ? <span className="text-sm font-bold tabular-nums">{rupees(p.price)}{off > 0 && <s className="ml-1 text-[10px] font-normal text-mute">{rupees(p.mrp)}</s>}</span>
              : <span className="text-[11px] font-semibold text-danger">Back soon</span>}
            {p.inStock && (
              <span className="relative z-10">
                <QuickAdd small line={{ id: v.id, key: p.key, name: p.name, variant: [v.size, v.flavour].filter(Boolean).join(' · '), price: v.price, mrp: v.mrp, brand: p.brand, stock: v.stock, bulkPrice: v.bulkPrice, bulkMin: v.bulkMin }} />
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

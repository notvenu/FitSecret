import Link from 'next/link';
import { inr } from '@fitsecret/shared';
import type { Product } from '@/lib/catalog';
import { discount } from '@/lib/catalog';
import ProductShot from './ProductShot';
import QuickAdd from './QuickAdd';

const rupees = (n: number) => inr(n).replace('.00', '');

export default function ProductCard({ p }: { p: Product }) {
  const off = discount(p.mrp, p.price);
  const v = p.variants.find((x) => x.stock > 0) || p.variants[0];
  return (
    <article className="group flex h-full flex-col">
      <Link href={`/p/${p.key}`} className="relative block aspect-[4/5] overflow-hidden rounded-[var(--radius-card)]">
        <div className="h-full w-full transition-transform duration-500 ease-out-expo group-hover:scale-[1.03]">
          <ProductShot brand={p.brand} name={p.name} size={v.size} image={v.image} />
        </div>
        {!p.inStock && <span className="absolute inset-x-0 bottom-0 bg-ink/85 py-2 text-center text-xs font-semibold text-white">Out of stock</span>}
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        <Link href={`/p/${p.key}`} className="line-clamp-2 text-[15px] font-semibold leading-snug hover:underline">{p.name}</Link>
        <span className="mt-1 text-xs text-mute">{p.variants.length > 1 ? `${p.variants.length} sizes` : [p.brand, p.sub].filter(Boolean).join(' · ') || p.category}</span>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 leading-tight">
            <span className="text-lg font-bold tabular-nums">{rupees(p.price)}</span>
            {off > 0 && <><span className="text-sm text-mute line-through tabular-nums">{rupees(p.mrp)}</span><span className="text-sm font-semibold text-brand-deep">{off}% off</span></>}
          </div>
          {p.inStock && <QuickAdd line={{ id: v.id, key: p.key, name: p.name, variant: [v.size, v.flavour].filter(Boolean).join(' · '), price: v.price, mrp: v.mrp, brand: p.brand, stock: v.stock }} />}
        </div>
      </div>
    </article>
  );
}

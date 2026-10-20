import Link from 'next/link';
import type { Metadata } from 'next';
import { getProducts, getCategories, discount, type Product } from '@/lib/catalog';
import ProductCard from '@/components/ProductCard';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Shop supplements', description: 'Supplements, dry fruits, millets, Ayurvedic and organic products. Shop online or visit our Vijayawada store.' };

type SP = { category?: string; sub?: string; goal?: string; brand?: string; q?: string; sort?: string; stock?: string };
const SORTS: [string, string][] = [['', 'Featured'], ['price-asc', 'Price, low to high'], ['price-desc', 'Price, high to low'], ['discount', 'Biggest discount']];
const SORT_FN: Record<string, (a: Product, b: Product) => number> = {
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  discount: (a, b) => discount(b.mrp, b.price) - discount(a.mrp, a.price),
  '': (a, b) => Number(b.inStock) - Number(a.inStock) || Number(b.featured) - Number(a.featured),
};

export default async function Shop({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [all, cats] = await Promise.all([getProducts(), getCategories()]);
  const words = (sp.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const list = all.filter((p) =>
    (!sp.category || p.categorySlug === sp.category) && (!sp.sub || p.subSlug === sp.sub) && (!sp.goal || p.goals.includes(sp.goal)) && (!sp.brand || p.brand === sp.brand) && (!sp.stock || p.inStock) &&
    words.every((w) => `${p.name} ${p.brand} ${p.category} ${p.sub} ${p.variants.map((v) => v.flavour).join(' ')}`.toLowerCase().includes(w)))
    .sort(SORT_FN[sp.sort || ''] || SORT_FN['']);

  const href = (patch: Partial<SP>) => {
    const qs = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]).toString();
    return '/shop' + (qs ? '?' + qs : '');
  };
  const brands = [...new Set(all.map((p) => p.brand).filter(Boolean))].sort();
  const cat = cats.find((c) => c.slug === sp.category);
  const title = sp.q ? `“${sp.q}”` : cat?.subs.find((x) => x.slug === sp.sub)?.name || cat?.name || sp.brand || 'All products';
  const chip = (on: boolean) => `whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <h1 className="display text-[clamp(2.8rem,7vw,6rem)]">{title}</h1>
        <span className="pb-2 text-sm text-mute">{list.length} products</span>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="min-w-0 space-y-8 text-sm lg:sticky lg:top-32 lg:self-start">
          <div>
            <h2 className="mb-3 font-semibold">Category</h2>
            <ul className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
              <li><Link href={href({ category: undefined, sub: undefined })} className={`block whitespace-nowrap rounded-lg px-3 py-1.5 ${!sp.category ? 'bg-ink text-white' : 'hover:bg-surface'}`}>Everything</Link></li>
              {cats.map((c) => (
                <li key={c.slug}>
                  <Link href={href({ category: c.slug, sub: undefined })} className={`flex justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-1.5 ${sp.category === c.slug && !sp.sub ? 'bg-ink text-white' : sp.category === c.slug ? 'font-semibold' : 'hover:bg-surface'}`}>{c.name}<span className="opacity-50">{c.count}</span></Link>
                  {sp.category === c.slug && c.subs.length > 0 && (
                    <ul className="ml-3 mt-1 hidden space-y-0.5 border-l border-line pl-2 lg:block">
                      {c.subs.map((x) => (
                        <li key={x.slug}><Link href={href({ category: c.slug, sub: x.slug })} className={`flex justify-between gap-3 rounded-lg px-2.5 py-1 ${sp.sub === x.slug ? 'bg-ink text-white' : 'text-ink-soft hover:bg-surface'}`}>{x.name}<span className="opacity-50">{x.count}</span></Link></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden lg:block">
            <h2 className="mb-3 font-semibold">Brand</h2>
            <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {brands.map((b) => <li key={b}><Link href={href({ brand: sp.brand === b ? undefined : b })} className={`block rounded-lg px-3 py-1.5 ${sp.brand === b ? 'bg-ink text-white' : 'hover:bg-surface'}`}>{b}</Link></li>)}
            </ul>
          </div>
        </aside>

        <div className="min-w-0">
          {cat && cat.subs.length > 0 && (
            <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
              <Link href={href({ sub: undefined })} scroll={false} className={chip(!sp.sub)}>All {cat.name.toLowerCase()}</Link>
              {cat.subs.map((x) => <Link key={x.slug} href={href({ sub: x.slug })} scroll={false} className={chip(sp.sub === x.slug)}>{x.name}</Link>)}
            </div>
          )}
          {sp.brand && <Link href={href({ brand: undefined })} scroll={false} className={chip(true) + ' inline-block'}>{sp.brand} ✕</Link>}
          <div className="no-scrollbar mt-4 flex items-center gap-4 overflow-x-auto text-sm">
            <span className="text-mute">Sort</span>
            {SORTS.map(([k, l]) => <Link key={k} href={href({ sort: k || undefined })} scroll={false} className={`whitespace-nowrap ${(sp.sort || '') === k ? 'font-semibold underline decoration-brand decoration-2 underline-offset-4' : 'text-mute hover:text-ink'}`}>{l}</Link>)}
          </div>

          {list.length ? (
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
              {list.map((p) => <ProductCard key={p.key} p={p} />)}
            </div>
          ) : (
            <div className="py-24 text-center">
              <p className="display text-5xl">Nothing here</p>
              <p className="mt-3 text-mute">Try a different filter, or WhatsApp us and we&apos;ll source it.</p>
              <Link href="/shop" className="btn-ink mt-6">Clear filters</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

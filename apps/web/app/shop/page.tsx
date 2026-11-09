import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import ProductTile from '@/components/ProductTile';
import Filters, { SortSelect } from './Filters';
import { PRICES, FORMS, DISCOUNTS, listOf } from './prices';
import { attributesOf } from '@fitsecret/shared/finder';
import { getProducts, getCategories, getBrands } from '@/lib/catalog';
import { GOALS, goalBySlug, goalsOf } from '@/lib/goals';
import { searchProducts } from '@/lib/search';
import { getT } from '@/lib/lang';

const PER = 48;
type SP = { goal?: string; category?: string; brand?: string; form?: string; off?: string; best?: string; q?: string; sort?: string; min?: string; max?: string; stock?: string; page?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = sp.category && (await getCategories()).flatMap((c) => [c, ...c.subs]).find((c) => c.slug === sp.category);
  const only = listOf(sp.brand).length === 1 && !sp.form ? listOf(sp.brand)[0] : ''; // a brand page: exactly one brand, nothing else narrowing it
  if (only && !sp.category && !sp.goal) {
    sp.brand = only;
    const n = (await getBrands()).find((b) => b.name === sp.brand)?.count;
    return { title: `${sp.brand} in Vijayawada`, description: `Genuine ${sp.brand}${n ? `, ${n} products` : ''}, bought from the brand or its authorised distributor. Same-day delivery in Vijayawada or pick up at MG Road, Labbipet.`,
      alternates: { canonical: `/shop?brand=${encodeURIComponent(sp.brand)}` } };
  }
  return { title: cat ? cat.name : 'Shop', alternates: { canonical: sp.category ? `/shop?category=${sp.category}` : sp.goal ? `/shop?goal=${sp.goal}` : '/shop' } };
}

export default async function Shop({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [all, cats, brands, t] = await Promise.all([getProducts(), getCategories(), getBrands(), getT()]);
  const goal = goalBySlug(sp.goal);
  const min = Number(sp.min) || 0, max = Number(sp.max) || 0;

  // Facets narrow everything except themselves: each facet's counts come from the other filters, so ticking a brand
  // doesn't make the other brands drop to zero.
  const brandSet = new Set(listOf(sp.brand)), formSet = new Set(listOf(sp.form)), minOff = Number(sp.off) || 0;
  const formOf = new Map(all.map((p) => [p.key, attributesOf(p).form]));
  const offOf = (p: (typeof all)[number]) => (p.mrp > p.price ? ((p.mrp - p.price) / p.mrp) * 100 : 0);
  const base = (sp.q ? searchProducts(all, sp.q) : all).filter((p) => (!goal || goalsOf(p).includes(goal.slug)) && (!min || p.price >= min) && (!max || p.price <= max) && (!sp.stock || p.inStock));
  const pass: Record<string, (p: (typeof all)[number]) => boolean> = {
    category: (p) => !sp.category || p.categorySlug === sp.category || p.subSlug === sp.category,
    brand: (p) => !brandSet.size || brandSet.has(p.brand),
    form: (p) => !formSet.size || formSet.has(formOf.get(p.key)!),
    off: (p) => offOf(p) >= minOff,
    best: (p) => !sp.best || p.featured,
  };
  const keep = (p: (typeof all)[number], skip = '') => Object.entries(pass).every(([k, f]) => k === skip || f(p));
  const list = base.filter((p) => keep(p));
  const count = (skip: string, keys: (p: (typeof all)[number]) => (string | undefined)[]) => {
    const m = new Map<string, number>();
    for (const p of base) if (keep(p, skip)) for (const k of keys(p)) if (k) m.set(k, (m.get(k) || 0) + 1);
    return m;
  };
  const brandCounts = count('brand', (p) => [p.brand]), catCounts = count('category', (p) => [p.categorySlug, p.subSlug]), formCounts = count('form', (p) => [formOf.get(p.key)]);
  const bestCount = base.filter((p) => keep(p, 'best') && p.featured).length; // the toggle hides until the shop features something
  const offCounts = DISCOUNTS.map(([n]) => base.filter((p) => keep(p, 'off') && offOf(p) >= Number(n)).length);

  // Featured: bestsellers, then the shelves in their shop order (supplements first), photo before no photo.
  // Every sort puts out-of-stock products last: nobody wants to scroll past what they can't buy.
  const shelf = new Map(cats.flatMap((c, i) => [[c.slug, i * 100] as const, ...c.subs.map((x, j) => [x.slug, i * 100 + j + 1] as const)]));
  const rank = (p: (typeof list)[number]) => shelf.get(p.subSlug) ?? shelf.get(p.categorySlug) ?? 1e6;
  const sorts: Record<string, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
    low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, name: (a, b) => a.name.localeCompare(b.name),
    off: (a, b) => (b.mrp - b.price) / b.mrp - (a.mrp - a.price) / a.mrp,
    featured: (a, b) => Number(b.featured) - Number(a.featured) || rank(a) - rank(b) || Number(!!b.image) - Number(!!a.image),
  };
  const by = sp.q && !sp.sort ? () => 0 : sorts[sp.sort || 'featured'] || sorts.featured; // a search keeps its relevance order
  const sorted = [...list].sort((a, b) => Number(b.inStock) - Number(a.inStock) || by(a, b));

  const page = Math.max(1, Number(sp.page) || 1);
  const shown = sorted.slice(0, page * PER);
  const href = (patch: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/shop${u.size ? `?${u}` : ''}`;
  };
  const catName = cats.flatMap((c) => [c, ...c.subs]).find((c) => c.slug === sp.category)?.name;
  const priceLabel = PRICES.find(([v]) => v === `${min || 0}-${max || ''}`)?.[1] || `₹${min || 0} – ${max ? `₹${max}` : 'any'}`;
  const active: [string, Partial<SP>][] = [
    ...(catName ? [[catName, { category: undefined }] as [string, Partial<SP>]] : []),
    ...[...brandSet].map((b) => [b, { brand: [...brandSet].filter((x) => x !== b).join(',') || undefined }] as [string, Partial<SP>]),
    ...[...formSet].map((f) => [t(FORMS.find(([v]) => v === f)?.[1] || 'shop.type'), { form: [...formSet].filter((x) => x !== f).join(',') || undefined }] as [string, Partial<SP>]),
    ...(minOff ? [[t('shop.offAtLeast', { n: minOff }), { off: undefined }] as [string, Partial<SP>]] : []),
    ...(sp.best ? [[t('shop.best'), { best: undefined }] as [string, Partial<SP>]] : []),
    ...(min || max ? [[priceLabel, { min: undefined, max: undefined }] as [string, Partial<SP>]] : []),
    ...(sp.stock ? [[t('shop.inStock'), { stock: undefined }] as [string, Partial<SP>]] : []),
  ];
  const title = sp.q ? t('shop.results', { q: sp.q }) : goal ? t(goal.label) : catName || (brandSet.size === 1 ? [...brandSet][0] : '') || t('shop.title');
  const sub = goal && !sp.q ? t(goal.promise) : '';

  return (
    <div className="page-top mx-auto max-w-[1360px] px-4 pb-24 md:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="h2 text-indigo">{title}</h1>
          <p className="mt-1 text-ink-soft">{sub || t('shop.count', { n: list.length })}</p>
        </div>
        <form action="/shop" role="search" className="relative w-full md:max-w-sm">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
          <input name="q" type="search" defaultValue={sp.q} placeholder={t('shop.search')} aria-label={t('shop.search')} className="field min-h-12 pl-11" />
        </form>
      </header>

      <nav aria-label={t('shop.goal')} className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {GOALS.map((g) => <Link key={g.slug} href={href({ goal: goal?.slug === g.slug ? undefined : g.slug })} aria-current={goal?.slug === g.slug} className="chip min-h-10 shrink-0 py-1.5 text-sm">{t(g.label)}</Link>)}
      </nav>

      <div className="mt-4 grid gap-x-10 lg:mt-8 lg:grid-cols-[250px_1fr]">
        <Filters sp={sp} active={active.length}
          cats={cats.map((c) => ({ name: c.name, slug: c.slug, count: catCounts.get(c.slug) || 0, subs: c.subs.map(({ name, slug }) => ({ name, slug, count: catCounts.get(slug) || 0 })).filter((s) => s.count) })).filter((c) => c.count || c.slug === sp.category)}
          brands={brands.map((b) => ({ name: b.name, count: brandCounts.get(b.name) || 0 })).filter((b) => b.count || brandSet.has(b.name))}
          forms={FORMS.map(([v, l]) => ({ value: v, label: t(l), count: formCounts.get(v) || 0 })).filter((f) => f.count || formSet.has(f.value))}
          discounts={DISCOUNTS.map(([v], i) => ({ value: v, count: offCounts[i] }))} bestCount={bestCount} />

        <div className="min-w-0">
          <div className={`min-h-11 flex-wrap items-center gap-2 pt-3 lg:flex lg:pt-0 ${active.length || sp.q ? 'flex' : 'hidden'}`}>
            {active.map(([l, patch]) => (
              <Link key={l} href={href(patch)} className="chip min-h-9 gap-1.5 py-1 text-sm" aria-label={`${t('shop.remove')} ${l}`}>{l}<X size={14} /></Link>
            ))}
            {active.length > 1 && <Link href={href({ category: undefined, brand: undefined, form: undefined, off: undefined, best: undefined, min: undefined, max: undefined, stock: undefined })} className="px-2 text-sm font-semibold text-river underline">{t('shop.clear')}</Link>}
            {sp.q && <Link href={href({ q: undefined })} className="px-2 text-sm font-semibold text-river underline">{t('shop.clearSearch')}</Link>}
            <div className="ml-auto hidden lg:block"><SortSelect sp={sp} /></div>
          </div>

          {shown.length ? (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-4">
              {shown.map((p, i) => <li key={p.key}><ProductTile p={p} priority={i < 4} /></li>)}
            </ul>
          ) : (
            <div className="mt-6 grid justify-items-center gap-4 rounded-[20px] bg-paper p-10 text-center">
              <p className="text-lg font-semibold">{t('shop.none')}</p>
              {sp.q && <p className="max-w-sm text-ink-soft">{t('shop.noneHelp')}</p>}
              <Link href="/shop" className="btn btn-dark">{t('shop.clear')}</Link>
            </div>
          )}
          {shown.length < sorted.length && (
            <div className="mt-10 grid justify-items-center gap-3 text-center">
              <p className="num text-sm text-ink-soft">{t('shop.showing', { n: shown.length, total: sorted.length })}</p>
              <div className="h-1 w-48 overflow-hidden rounded-full bg-line"><div className="h-full bg-river" style={{ width: `${(shown.length / sorted.length) * 100}%` }} /></div>
              <Link href={href({ page: String(page + 1) })} scroll={false} className="btn btn-ghost text-indigo">{t('shop.more')}</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

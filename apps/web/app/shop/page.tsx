import type { Metadata } from 'next';
import Link from 'next/link';
import { X } from 'lucide-react';
import ProductTile from '@/components/ProductTile';
import Filters from './Filters';
import { getProducts, getCategories } from '@/lib/catalog';
import { GOALS, goalBySlug, goalsOf } from '@/lib/goals';
import { searchProducts } from '@/lib/search';
import { getT } from '@/lib/lang';

const PER = 48;
type SP = { goal?: string; category?: string; q?: string; sort?: string; min?: string; max?: string; stock?: string; page?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = sp.category && (await getCategories()).flatMap((c) => [c, ...c.subs]).find((c) => c.slug === sp.category);
  return { title: cat ? cat.name : 'Shop', alternates: { canonical: sp.category ? `/shop?category=${sp.category}` : sp.goal ? `/shop?goal=${sp.goal}` : '/shop' } };
}

export default async function Shop({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [all, cats, t] = await Promise.all([getProducts(), getCategories(), getT()]);
  const goal = goalBySlug(sp.goal);
  const min = Number(sp.min) || 0, max = Number(sp.max) || 0;

  let list = sp.q ? searchProducts(all, sp.q) : all;
  if (goal) list = list.filter((p) => goalsOf(p).includes(goal.slug));
  if (sp.category) list = list.filter((p) => p.categorySlug === sp.category || p.subSlug === sp.category);
  if (min) list = list.filter((p) => p.price >= min);
  if (max) list = list.filter((p) => p.price <= max);
  if (sp.stock) list = list.filter((p) => p.inStock);
  const sorts: Record<string, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
    low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, name: (a, b) => a.name.localeCompare(b.name),
    featured: (a, b) => Number(b.featured) - Number(a.featured) || Number(b.inStock) - Number(a.inStock) || Number(!!b.image) - Number(!!a.image),
  };
  if (!sp.q || sp.sort) list = [...list].sort(sorts[sp.sort || 'featured'] || sorts.featured);

  const page = Math.max(1, Number(sp.page) || 1);
  const shown = list.slice(0, page * PER);
  const href = (patch: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/shop${u.size ? `?${u}` : ''}`;
  };
  const catName = cats.flatMap((c) => [c, ...c.subs]).find((c) => c.slug === sp.category)?.name;
  const active: [string, Partial<SP>][] = [
    ...(goal ? [[t(goal.label), { goal: undefined }] as [string, Partial<SP>]] : []),
    ...(catName ? [[catName, { category: undefined }] as [string, Partial<SP>]] : []),
    ...(sp.q ? [[`“${sp.q}”`, { q: undefined }] as [string, Partial<SP>]] : []),
    ...(min || max ? [[`₹${min || 0}–${max || '∞'}`, { min: undefined, max: undefined }] as [string, Partial<SP>]] : []),
    ...(sp.stock ? [[t('shop.inStock'), { stock: undefined }] as [string, Partial<SP>]] : []),
  ];
  const title = goal ? t(goal.label) : catName || (sp.q ? `“${sp.q}”` : t('shop.title'));

  return (
    <div className="page-top mx-auto max-w-[1360px] px-4 pb-24 md:px-8">
      <h1 className="display-l">{title}</h1>
      {goal && <p className="story mt-3 text-ink-soft">{t(goal.promise)}</p>}

      <nav aria-label={t('shop.goal')} className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {GOALS.map((g) => <Link key={g.slug} href={href({ goal: goal?.slug === g.slug ? undefined : g.slug })} aria-current={goal?.slug === g.slug} className="chip shrink-0">{t(g.label)}</Link>)}
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-[240px_1fr]">
        <Filters sp={sp} cats={cats.map((c) => ({ name: c.name, slug: c.slug, subs: c.subs.map(({ name, slug }) => ({ name, slug })) }))} count={list.length} />

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="num mr-auto text-sm text-ink-soft" aria-live="polite">{t('shop.count', { n: list.length })}</p>
            {active.map(([l, patch]) => (
              <Link key={l} href={href(patch)} className="chip min-h-9 py-1 text-sm" aria-label={`Remove ${l}`}>{l}<X size={14} /></Link>
            ))}
            {active.length > 1 && <Link href="/shop" className="px-2 text-sm font-semibold text-river underline">{t('shop.clear')}</Link>}
          </div>

          {shown.length ? (
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 xl:grid-cols-4">
              {shown.map((p, i) => <li key={p.key}><ProductTile p={p} priority={i < 4} /></li>)}
            </ul>
          ) : (
            <div className="mt-10 grid justify-items-center gap-4 rounded-[20px] bg-paper p-10 text-center">
              <p className="text-lg">{t('shop.none')}</p>
              <Link href="/shop" className="btn btn-dark">{t('shop.clear')}</Link>
            </div>
          )}
          {shown.length < list.length && (
            <div className="mt-10 text-center"><Link href={href({ page: String(page + 1) })} scroll={false} className="btn btn-ghost">Show more ({list.length - shown.length})</Link></div>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { STORE } from '@fitsecret/shared/seed';
import { getCategories, getBrands, getProducts } from '@/lib/catalog';
import { BRAND_LOGOS } from '@/lib/brand-logos';
import { Pulse } from '@/components/Hero';

export const revalidate = 300;
export const metadata: Metadata = {
  title: 'About us',
  description: 'Fit Secrets is a nutrition and wellness store on MG Road, Vijayawada: supplements, dry fruits, millets, Ayurvedic and organic products.',
};

export default async function About() {
  const [cats, brands, products] = await Promise.all([getCategories(), getBrands(), getProducts()]);
  const logos = brands.filter((b) => BRAND_LOGOS[b.name]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-14 md:px-6 md:pt-20">
      <section className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-end">
        <h1 className="display text-[clamp(3rem,8vw,7rem)]">
          About <span className="relative inline-block">Fit Secrets<Pulse className="absolute -bottom-[0.1em] left-0 h-[0.14em] w-full" /></span>
        </h1>
        <p className="max-w-md text-lg leading-relaxed text-mute">
          {STORE.tagline}. We are a nutrition and wellness store on MG Road, Vijayawada, with sports supplements, dry fruits,
          millets, Ayurvedic and organic products under one roof.
        </p>
      </section>

      <section className="mt-20 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line md:grid-cols-4">
        {[
          [`${Math.floor(products.length / 50) * 50}+`, 'products in store'],
          [`${brands.length}`, 'brands on the shelf'],
          [`${cats.length}`, 'categories'],
          ['MG Road', 'Vijayawada'],
        ].map(([n, l]) => (
          <div key={l} className="bg-white p-6 md:p-8">
            <div className="display text-[clamp(2rem,4vw,3.4rem)]">{n}</div>
            <div className="mt-1 text-sm text-mute">{l}</div>
          </div>
        ))}
      </section>

      <section className="mt-24 grid gap-14 md:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="display text-[clamp(2.4rem,5vw,4.2rem)]">How we work</h2>
          <p className="mt-4 max-w-sm text-lg leading-relaxed text-mute">Supplements are only worth it when they are genuine and right for you. That shapes everything we do.</p>
        </div>
        <dl className="grid gap-x-10 gap-y-8 border-t border-line pt-8 sm:grid-cols-2">
          {[
            ['Sourced from the brand', 'Supplements come from the brand or its authorised importer. The importer’s name is printed on every imported pack.'],
            ['Seal checked with you', 'Where a brand has an authenticity code, scan it with us at the counter before you open the pack.'],
            ['Earliest expiry first', 'Our billing system sells the oldest batch first, so stock on the shelf stays fresh.'],
            ['Advice, not upselling', 'Tell us your goal and budget and we’ll tell you what you need, and what you can skip.'],
          ].map(([t, b]) => (
            <div key={t}>
              <dt className="font-semibold">{t}</dt>
              <dd className="mt-1.5 leading-relaxed text-mute">{b}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-24">
        <h2 className="display text-[clamp(2.4rem,5vw,4.2rem)]">What we stock</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cats.map((c) => (
            <Link key={c.slug} href={`/shop?category=${c.slug}`} className="group flex items-center justify-between rounded-[var(--radius-card)] bg-surface px-5 py-4 transition-colors hover:bg-surface-2">
              <span><span className="block font-semibold">{c.name}</span><span className="text-sm text-mute">{c.count} products</span></span>
              <ArrowUpRight size={18} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      {logos.length > 0 && (
        <section className="mt-24">
          <h2 className="display text-[clamp(2.4rem,5vw,4.2rem)]">Brands we carry</h2>
          <ul className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {logos.map((b) => (
              <li key={b.name}>
                <Link href={`/shop?brand=${encodeURIComponent(b.name)}`} className="grid h-24 place-items-center rounded-[var(--radius-card)] border border-line px-4 transition-colors hover:border-ink" aria-label={b.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={BRAND_LOGOS[b.name]} alt={b.name} className="max-h-10 w-auto max-w-full object-contain mix-blend-multiply" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-mute">Plus {brands.length - logos.length} more brands. <Link href="/shop" className="font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4">Browse everything</Link></p>
        </section>
      )}

      <section className="mt-24 flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] bg-ink p-8 text-white md:flex-row md:items-center md:p-12">
        <h2 className="display text-[clamp(2rem,4vw,3.4rem)]">Come see us on MG Road.</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/contact" className="btn-brand px-7 py-4">Contact us</Link>
          <Link href="/shop" className="btn border border-white/25 px-7 py-4 text-white hover:border-white">Shop online</Link>
        </div>
      </section>
    </div>
  );
}

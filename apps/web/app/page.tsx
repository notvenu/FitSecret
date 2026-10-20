import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, WhatsappLogo } from '@phosphor-icons/react/dist/ssr';
import { STORE } from '@fitsecret/shared/seed';
import { getProducts, getCategories, getBrands } from '@/lib/catalog';
import Hero from '@/components/Hero';
import CategoryShelf from '@/components/CategoryShelf';
import ProductCard from '@/components/ProductCard';
import { BRAND_LOGOS } from '@/lib/brand-logos';

export const revalidate = 60;

// Category tile sizes by position (mobile: 2 columns, md+: 4 columns).
const TILE = ['col-span-2 md:row-span-2', 'md:col-span-2', '', '', 'md:row-span-2', 'col-span-2', 'md:row-span-2', 'md:col-span-2'];

export default async function Home() {
  const [products, cats, brands] = await Promise.all([getProducts(), getCategories(), getBrands()]);
  const ranked = products.filter((p) => p.inStock && p.image).sort((a, b) => Number(b.featured) - Number(a.featured) || Number(!!b.brand) - Number(!!a.brand));
  const shelfTabs = cats.filter((c) => c.count >= 4).slice(0, 5).map((c) => [c.slug, c.name] as [string, string]);
  const dryFruits = ranked.filter((p) => p.categorySlug === 'dry-fruits-and-millets').slice(0, 16);
  const map = `https://www.google.com/maps?q=${encodeURIComponent('Datta Towers, MG Road, Vijayawada')}`;

  return (
    <>
      <Hero logos={brands.filter((b) => BRAND_LOGOS[b.name]).map((b) => ({ name: b.name, src: BRAND_LOGOS[b.name] }))} total={Math.floor(products.length / 50) * 50} />

      <section className="mx-auto mt-10 max-w-7xl px-4 md:px-6">
        <h2 className="display text-[clamp(2.6rem,6vw,5rem)]">Shop by category</h2>
        {/* Text-only bento: fixed size pattern (A A B B / A A C D / E F F G / E H H G) so server and client render the same. */}
        <div className="mt-8 grid auto-rows-[9.5rem] grid-flow-dense grid-cols-2 gap-3 md:auto-rows-[11rem] md:grid-cols-4 md:gap-4">
          {cats.slice(0, 8).map((c, i) => {
            const big = i === 0;
            return (
              <Link key={c.slug} href={`/shop?category=${c.slug}`}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] p-5 transition-colors duration-300 md:p-6 ${TILE[i] || ''} ${
                  big ? 'bg-ink text-white hover:bg-ink-soft' : i === 5 ? 'bg-brand text-ink hover:bg-ink hover:text-white' : 'bg-surface hover:bg-surface-2'}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`text-sm tabular-nums ${big ? 'text-white/60' : i === 5 ? 'text-ink/70 group-hover:text-white/60' : 'text-mute'}`}>{c.count} products</span>
                  <ArrowUpRight size={big ? 28 : 20} className="shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <div>
                  {big && c.subs.length > 0 && (
                    <p className="mb-3 hidden max-w-sm text-sm text-white/60 md:block">{c.subs.slice(0, 5).map((s) => s.name).join(' · ')}</p>
                  )}
                  <h3 className={`display leading-[0.95] ${big ? 'text-[clamp(2rem,4.5vw,3.75rem)]' : 'text-[clamp(1.25rem,2vw,1.75rem)]'}`}>{c.name}</h3>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="h-24 md:h-32" />
      <CategoryShelf tabs={shelfTabs} items={ranked.map((p) => ({ key: p.key, cat: p.categorySlug, card: <ProductCard p={p} /> }))} />

      {/* Ask the store: the thing a local shop does better than a marketplace */}
      <section className="mt-28 md:mt-36">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-[1fr_1.1fr] md:items-center md:px-6">
          <div>
            <h2 className="display text-[clamp(2.6rem,6vw,5rem)]">Not sure what to buy?</h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-mute">
              Message us your goal, weight and budget. We&apos;ll reply on WhatsApp with options from our shelf and their prices.
            </p>
            <a href={`https://wa.me/91${STORE.phone}?text=${encodeURIComponent('Hi Fit Secrets, I need help choosing a product.')}`} target="_blank" rel="noreferrer" className="btn-ink mt-8 px-7 py-4">
              <WhatsappLogo size={20} /> Chat with the store
            </a>
          </div>
          <div className="rounded-[var(--radius-card)] bg-brand p-6 md:p-8">
            <p className="text-sm font-semibold text-ink/70">People often ask us</p>
            <ul className="mt-4 flex flex-wrap gap-2.5">
              {[
                'Best whey protein under ₹3,000?',
                'Which creatine should I start with?',
                'Mass gainer for a beginner?',
                'Is this pack genuine? (I’ll send a photo)',
                'Pre-workout without too much caffeine?',
                'Sugar-free options for diabetics?',
                'Is this in stock at the MG Road store?',
              ].map((q) => (
                <li key={q}>
                  <a href={`https://wa.me/91${STORE.phone}?text=${encodeURIComponent(`Hi Fit Secrets, ${q}`)}`} target="_blank" rel="noreferrer"
                    className="group inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[15px] font-medium transition-colors hover:bg-ink hover:text-white">
                    {q}<ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {dryFruits.length > 0 && (
        <section className="mt-28">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 md:px-6">
            <h2 className="display text-[clamp(2.6rem,6vw,5rem)]">From the dry fruit counter</h2>
            <Link href="/shop?category=dry-fruits-and-millets" className="text-sm font-semibold underline decoration-brand decoration-2 underline-offset-4">All dry fruits &amp; millets</Link>
          </div>
          <div className="marquee-row mt-8 overflow-hidden">
            <div className="marquee flex w-max" style={{ ['--dur' as string]: `${dryFruits.length * 4}s` }}>
              {[0, 1].map((copy) => dryFruits.map((p) => (
                <div key={copy + p.key} aria-hidden={copy === 1 || undefined} className="w-[220px] shrink-0 px-2 sm:w-[250px]">
                  <ProductCard p={p} />
                </div>
              )))}
            </div>
          </div>
        </section>
      )}

      <section id="visit" className="mx-auto mt-28 grid max-w-7xl scroll-mt-28 gap-8 px-4 md:grid-cols-[1fr_1.3fr] md:px-6">
        <div className="flex flex-col justify-center">
          <h2 className="display text-[clamp(2.6rem,6vw,5rem)]">Visit the store</h2>
          <address className="mt-5 max-w-md not-italic leading-relaxed text-mute">{STORE.address}</address>
          <p className="mt-3 text-mute">Call <a className="font-semibold text-ink" href={`tel:+91${STORE.phone}`}>{STORE.phone}</a></p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a className="btn-ink px-7 py-4" href={map} target="_blank" rel="noreferrer">Get directions</a>
            <a className="btn-line px-7 py-4" href={`https://wa.me/91${STORE.phone}`} target="_blank" rel="noreferrer">WhatsApp us</a>
          </div>
        </div>
        <iframe title="Fit Secrets on Google Maps" src={`${map}&output=embed`} loading="lazy"
          className="aspect-[4/3] w-full rounded-[var(--radius-card)] border-0 grayscale" referrerPolicy="no-referrer-when-downgrade" />
      </section>
    </>
  );
}

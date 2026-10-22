import Link from 'next/link';
import { ArrowUpRight, WhatsappLogo } from '@phosphor-icons/react/dist/ssr';
import { STORE } from '@fitsecret/shared/seed';
import { getProducts, getCategories, getBrands } from '@/lib/catalog';
import Hero from '@/components/Hero';
import CategoryShelf from '@/components/CategoryShelf';
import ProductCard from '@/components/ProductCard';
import { BRAND_LOGOS } from '@/lib/brand-logos';
import { getStore, offerText } from '@/lib/store';

export const revalidate = 60;

// Category tile sizes by position (mobile: 2 columns, md+: 4 columns).
// How many subcategory chips fit per tile (big tile shows the most).
const SUBS_SHOWN = [8, 4, 2, 2, 4, 4, 4, 4];
const TILE = ['col-span-2 md:row-span-2', 'md:col-span-2', '', '', 'md:row-span-2', 'col-span-2', 'md:row-span-2', 'md:col-span-2'];

export default async function Home() {
  const [products, cats, brands, store] = await Promise.all([getProducts(), getCategories(), getBrands(), getStore()]);
  const ranked = products.filter((p) => p.inStock && p.image).sort((a, b) => Number(b.featured) - Number(a.featured) || Number(!!b.brand) - Number(!!a.brand));
  const shelfTabs = cats.filter((c) => c.count >= 4).slice(0, 5).map((c) => [c.slug, c.name] as [string, string]);
  const dryFruits = ranked.filter((p) => p.categorySlug === 'dry-fruits-and-millets').slice(0, 16);
  const map = `https://www.google.com/maps?q=${encodeURIComponent('Datta Towers, MG Road, Vijayawada')}`;

  return (
    <>
      <Hero logos={brands.filter((b) => BRAND_LOGOS[b.name]).map((b) => ({ name: b.name, src: BRAND_LOGOS[b.name] }))} total={Math.floor(products.length / 50) * 50} />

      {/* Banners and public coupons are managed in the POS: Online Store → Banners / Offers */}
      {(store.banners.length > 0 || store.coupons.length > 0) && (
        <section className="mx-auto mt-10 max-w-7xl px-4 md:px-6">
          {store.banners.length > 0 && (
            <div className={`grid gap-4 ${store.banners.length > 1 ? 'md:grid-cols-2' : ''}`}>
              {store.banners.map((b, i) => (
                <Link key={i} href={b.link || '/shop'} className="group relative isolate flex min-h-52 flex-col justify-end overflow-hidden rounded-[var(--radius-card)] bg-ink p-7 text-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {b.image && <img src={b.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60 transition-transform duration-500 group-hover:scale-[1.03]" />}
                  <h2 className="display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-none">{b.title}</h2>
                  {b.subtitle && <p className="mt-2 max-w-md text-white/80">{b.subtitle}</p>}
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">Shop now <ArrowUpRight size={16} weight="bold" /></span>
                </Link>
              ))}
            </div>
          )}
          {store.coupons.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {store.coupons.map((c) => (
                <div key={c.code} className="flex items-center gap-3 rounded-full border border-dashed border-ink/40 bg-surface px-4 py-2 text-sm">
                  <b className="font-mono tracking-wider">{c.code}</b><span className="text-mute">{offerText(c)}{c.ends ? ` · till ${c.ends}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mx-auto mt-10 max-w-7xl px-4 md:px-6">
        <h2 className="display text-[clamp(2.6rem,6vw,5rem)]">Shop by category</h2>
        {/* Text-only bento: fixed size pattern (A A B B / A A C D / E F F G / E H H G) so server and client render the same. */}
        <div className="mt-8 grid auto-rows-[minmax(9.5rem,auto)] grid-flow-dense grid-cols-2 gap-3 md:auto-rows-[minmax(11rem,auto)] md:grid-cols-4 md:gap-4">
          {cats.slice(0, 8).map((c, i) => {
            const big = i === 0, green = i === 5, dark = big;
            const subs = c.subs.slice(0, SUBS_SHOWN[i] ?? 2), more = c.subs.length - subs.length;
            const half = !TILE[i]?.startsWith('col-span-2'), moreMobile = half ? c.subs.length - Math.min(2, subs.length) : more; // half-width on phones: 2 chips
            const chip = `relative z-10 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              dark ? 'border-white/20 text-white/80 hover:border-white hover:bg-white hover:text-ink' : green ? 'border-ink/25 hover:border-ink hover:bg-ink hover:text-white' : 'border-black/10 bg-white hover:border-ink hover:bg-ink hover:text-white'}`;
            return (
              // Whole tile opens the category (stretched title link); subcategory chips sit above it and open their own filter.
              <div key={c.slug}
                className={`group relative flex flex-col justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] p-5 transition-colors duration-300 md:p-6 ${TILE[i] || ''} ${
                  dark ? 'bg-ink text-white hover:bg-ink-soft' : green ? 'bg-brand text-ink' : 'bg-surface hover:bg-surface-2'}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`text-sm tabular-nums ${dark ? 'text-white/60' : green ? 'text-ink/70' : 'text-mute'}`}>{c.count} products</span>
                  <ArrowUpRight size={big ? 28 : 20} className="shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <div>
                  {subs.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {subs.map((x, k) => <Link key={x.slug} href={`/shop?category=${c.slug}&sub=${x.slug}`} className={`${chip} ${half && k >= 2 ? 'hidden md:inline-block' : ''}`}>{x.name}</Link>)}
                      {moreMobile > 0 && <span className={`self-center px-1 text-xs md:hidden ${dark ? 'text-white/50' : 'text-mute'}`}>+{moreMobile} more</span>}
                      {more > 0 && <span className={`hidden self-center px-1 text-xs md:inline ${dark ? 'text-white/50' : 'text-mute'}`}>+{more} more</span>}
                    </div>
                  )}
                  <h3 className={`display leading-[0.95] ${big ? 'text-[clamp(2rem,4.5vw,3.75rem)]' : 'text-[clamp(1.25rem,2vw,1.75rem)]'}`}>
                    <Link href={`/shop?category=${c.slug}`} className="after:absolute after:inset-0">{c.name}</Link>
                  </h3>
                </div>
              </div>
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

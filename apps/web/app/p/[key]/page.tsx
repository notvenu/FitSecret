import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { GOALS } from '@fitsecret/shared';
import { getProduct, getProducts, getReviews } from '@/lib/catalog';
import { ReviewForm, Stars } from '@/components/Feedback';
import ProductCard from '@/components/ProductCard';
import Buy from './Buy';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const p = await getProduct((await params).key);
  return p ? { title: p.name, description: p.description.slice(0, 155) } : {};
}

const PROMISES = [
  ['Authentic', 'From the brand or its authorised importer.'],
  ['Delivery', 'Free over ₹999. 1 to 4 days in AP and Telangana.'],
  ['Cash on delivery', 'Pay at your door. No extra fee.'],
  ['Exchange', 'Sealed packs within 7 days with the bill.'],
];

export default async function ProductPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ v?: string }> }) {
  const [{ key }, { v }] = await Promise.all([params, searchParams]);
  const p = await getProduct(key);
  if (!p) notFound();
  const reviews = await getReviews(p.key);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const related = (await getProducts()).filter((x) => x.key !== p.key && x.inStock && (p.subSlug ? x.subSlug === p.subSlug : x.categorySlug === p.categorySlug)).slice(0, 4);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand: { '@type': 'Brand', name: p.brand }, description: p.description,
    offers: p.variants.map((x) => ({ '@type': 'Offer', priceCurrency: 'INR', price: x.price, sku: x.id, availability: `https://schema.org/${x.stock > 0 ? 'InStock' : 'OutOfStock'}` })),
    ...(reviews.length && { aggregateRating: { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: reviews.length } }),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="mb-6 text-sm text-mute" aria-label="Breadcrumb">
        <Link href="/shop" className="hover:text-ink">Shop</Link> <span className="mx-1">/</span> <Link href={`/shop?category=${p.categorySlug}`} className="hover:text-ink">{p.category}</Link>
        {p.subSlug && <> <span className="mx-1">/</span> <Link href={`/shop?category=${p.categorySlug}&sub=${p.subSlug}`} className="hover:text-ink">{p.sub}</Link></>}
      </nav>
      <Buy p={p} initial={v} rating={reviews.length ? { avg, count: reviews.length } : null} />

      <section className="mt-20 grid gap-12 border-t border-line pt-12 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="display text-4xl">About it</h2>
          <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-ink-soft">{p.description}</p>
          {p.goals.length > 0 && (
            <p className="mt-6 text-sm text-mute">Good for: {p.goals.map((g, i) => <span key={g}>{i > 0 && ', '}<Link href={`/shop?goal=${g}`} className="font-medium text-ink underline decoration-brand decoration-2 underline-offset-4">{GOALS[g]}</Link></span>)}</p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 self-start">
          {PROMISES.map(([t, b]) => (
            <div key={t} className="border-t-2 border-brand pt-3">
              <dt className="font-semibold">{t}</dt>
              <dd className="mt-1 text-sm text-mute">{b}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="reviews" className="mt-20 border-t border-line pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display text-4xl">Reviews</h2>
            {reviews.length > 0 && <p className="mt-2 flex items-center gap-2 text-mute"><Stars n={avg} size={20} /> <b className="text-ink">{avg.toFixed(1)}</b> from {reviews.length} review{reviews.length > 1 ? 's' : ''}</p>}
          </div>
          <ReviewForm itemId={p.variants[0].id} />
        </div>
        {reviews.length ? (
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-card)] border border-line p-5">
                <div className="flex items-center justify-between gap-2"><Stars n={r.rating} /><span className="text-xs text-mute">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                {r.title && <div className="mt-2 font-semibold">{r.title}</div>}
                {r.body && <p className="mt-1 leading-relaxed text-ink-soft">{r.body}</p>}
                <div className="mt-3 text-sm text-mute">{r.name}{r.verified && <span className="ml-2 rounded-full bg-brand/20 px-2 py-0.5 text-xs font-semibold text-brand-deep">Verified buyer</span>}</div>
                {r.reply && <p className="mt-3 rounded-lg bg-surface p-3 text-sm"><b>Fit Secrets:</b> {r.reply}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-mute">No reviews yet. Bought this? Tell others what you think.</p>}
      </section>

      {related.length > 0 && (
        <section className="mt-24">
          <h2 className="display text-[clamp(2.4rem,5vw,4rem)]">Goes well with</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">{related.map((r) => <ProductCard key={r.key} p={r} />)}</div>
        </section>
      )}
    </div>
  );
}

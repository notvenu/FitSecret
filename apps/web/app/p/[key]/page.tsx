import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { GOALS } from '@fitsecret/shared';
import { getProduct, getProducts, getReviews, getCertificates, alsoBought, type Product, type Variant } from '@/lib/catalog';
import { getStore } from '@/lib/store';
import ComboDeals, { type ComboDeal } from '@/components/ComboDeals';
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
  const ids = p.variants.map((v) => v.id);
  const [all, reviews, certs, also, store] = await Promise.all([getProducts(), getReviews(p.key), getCertificates(ids), alsoBought(ids), getStore()]);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const byItem = new Map(all.flatMap((x) => x.variants.map((v) => [v.id, { p: x, v }] as const)));
  const cartLine = (x: Product, v: Variant) => ({ id: v.id, key: x.key, name: x.name, variant: [v.size, v.flavour].filter(Boolean).join(' · '), price: v.price, mrp: v.mrp, brand: x.brand, stock: v.stock, bulkPrice: v.bulkPrice, bulkMin: v.bulkMin });
  // Combos with any variant of this product, when every item in them is on the website.
  const deals = store.combos.filter((c) => c.items.some((x) => ids.includes(x.item_id))).flatMap((c): ComboDeal[] => {
    const lines = c.items.map((x) => { const hit = byItem.get(x.item_id); return hit ? { ...cartLine(hit.p, hit.v), qty: x.qty } : null; });
    if (lines.some((l) => !l)) return [];
    const ls = lines as ComboDeal['lines'];
    return [{ id: c.id, name: c.name, price: c.price, channel: c.channel, value: ls.reduce((s, l) => s + l.price * l.qty, 0), lines: ls }];
  });
  // What people bought along with it (shop and website), topped up with similar products when there isn't enough history yet.
  const bought = [...new Map(also.map((id) => byItem.get(id)?.p).filter((x): x is Product => !!x && x.key !== p.key && x.inStock).map((x) => [x.key, x])).values()].slice(0, 4);
  const similar = all.filter((x) => x.key !== p.key && x.inStock && !bought.some((b) => b.key === x.key) && (p.subSlug ? x.subSlug === p.subSlug : x.categorySlug === p.categorySlug));
  const related = [...bought, ...similar].slice(0, 4);
  const variantName = (id: string) => { const v = p.variants.find((x) => x.id === id); return v ? [v.size, v.flavour].filter(Boolean).join(' · ') : ''; };
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand: { '@type': 'Brand', name: p.brand }, description: p.description,
    offers: p.variants.map((x) => ({ '@type': 'Offer', priceCurrency: 'INR', price: x.price, sku: x.id, availability: `https://schema.org/${x.stock > 0 ? 'InStock' : 'OutOfStock'}` })),
    ...(reviews.length && { aggregateRating: { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: reviews.length } }),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /> {/* a "</script>" in a description can't break out */}
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

      {deals.length > 0 && (
        <section className="mt-20 border-t border-line pt-12">
          <h2 className="display text-4xl">Combo deals</h2>
          <p className="mt-2 text-mute">Buy together and pay less. The combo price is applied at checkout.</p>
          <ComboDeals deals={deals} />
        </section>
      )}

      {certs.length > 0 && (
        <section className="mt-20 border-t border-line pt-12">
          <h2 className="display text-4xl">Quality &amp; certificates</h2>
          <p className="mt-2 text-mute">Lab reports and papers for the packs we have in stock.</p>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {certs.map((c) => (
              <li key={c.id}>
                <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line p-4 hover:border-ink">
                  <span><span className="font-semibold">{c.title}</span>
                    <span className="block text-sm text-mute">{[variantName(c.item_id), c.batch_no && `Batch ${c.batch_no}`, c.valid_until && `valid till ${new Date(c.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`].filter(Boolean).join(' · ')}</span></span>
                  <span className="text-sm font-semibold text-brand-deep">View →</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <h2 className="display text-[clamp(2.4rem,5vw,4rem)]">{bought.length ? 'Customers also bought' : 'Goes well with'}</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">{related.map((r) => <ProductCard key={r.key} p={r} />)}</div>
        </section>
      )}
    </div>
  );
}

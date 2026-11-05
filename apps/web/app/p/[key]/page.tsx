import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck, FileText, ImageOff, Leaf, Target, Package, Sparkles, Store, Clock, ShieldAlert } from 'lucide-react';
import { attributesOf } from '@fitsecret/shared/finder';
import { INFO } from '@fitsecret/shared/product-info';
import Buy from './Buy';
import { TabRail, Pack, FitCheck, Glance, Ingredients, Routine, Nutrition, Compare, Reviews, Questions, Stack, Recent, Stars, type CmpCol, type StackItem } from './Modules';
import Verify from '@/app/verify/Verify';
import { Sprig, INGREDIENTS, ingredientsIn } from '@/components/Botanical';
import { getProduct, getProducts, getReviews, getCertificates, alsoBought, type Product } from '@/lib/catalog';
import { GOALS, goalsOf } from '@/lib/goals';
import { getT } from '@/lib/lang';
import { PHONE, FSSAI } from '@/lib/site';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const p = await getProduct(decodeURIComponent((await params).key));
  if (!p) return {};
  return { title: p.name, description: p.description.slice(0, 160) || `${p.name} at Fit Secrets, Vijayawada.`, openGraph: { images: p.image ? [p.image] : [] }, alternates: { canonical: `/p/${p.key}` } };
}

// Pack size → grams or ml, for the price per 100 g row ("1 kg", "500g", "2 lbs", "250 ml")
const qty = (s: string) => {
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams?|lbs?|ml|l|ltr|litres?)\b/i.exec(s || '');
  if (!m) return null;
  const n = Number(m[1]), u = m[2].toLowerCase();
  return { n: u === 'kg' || u.startsWith('l') && u !== 'lb' && u !== 'lbs' ? n * 1000 : u.startsWith('lb') ? n * 453.6 : n, ml: /^(ml|l|ltr|litre)/.test(u) };
};
const per100 = (price: number, size: string) => { const q = qty(size); return q && q.n >= 20 ? `₹${Math.round((price / q.n) * 100)} / 100 ${q.ml ? 'ml' : 'g'}` : ''; };
const FORM = { powder: 'Powder', capsule: 'Capsules / tablets', drink: 'Drink mix', food: 'Food', topical: 'For skin or hair', other: '' } as const;
const lineOf = (p: Product) => { const v = p.variants.find((x) => x.stock > 0) || p.variants[0]; return { id: v.id, key: p.key, name: p.name, variant: [v.size, v.flavour].filter(Boolean).join(' · '), price: v.price, mrp: v.mrp, brand: p.brand, stock: v.stock, bulkPrice: v.bulkPrice, bulkMin: v.bulkMin }; };

export default async function PDP({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const [p, all, t] = await Promise.all([getProduct(key), getProducts(), getT()]);
  if (!p) notFound();
  const ids = p.variants.map((v) => v.id);
  const [reviews, certs, bought] = await Promise.all([getReviews(p.key), getCertificates(ids), alsoBought(ids)]);
  const info = INFO[p.key] || {};
  const at = attributesOf(p);
  const owner = !!(info.finder as { allergens?: string[] } | undefined)?.allergens; // allergens the owner entered from the label, not our reading of the description
  const goals = goalsOf(p);
  const goal = goals[0];
  const tint = goal ? `color-mix(in srgb, var(--color-goal-${goal}) 32%, white)` : 'var(--color-sky)';
  const byKey = new Map(all.map((x) => [x.key, x]));
  const byItem = new Map(all.flatMap((x) => x.variants.map((v) => [v.id, x] as const)));
  const rating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const food = at.kind === 'food', beauty = at.kind === 'beauty';
  const flavours = [...new Set(p.variants.map((v) => v.flavour).filter(Boolean))];
  const sizes = [...new Set(p.variants.map((v) => v.size).filter(Boolean))];
  const v0 = p.variants.find((v) => v.stock > 0) || p.variants[0];

  // Ingredients: label data when the owner has added it, else the botanicals the product is named after
  const named = ingredientsIn(`${p.name}`).map(([name, line]) => ({ name, line }));
  const ingredients = info.ingredients?.length ? info.ingredients.map((i) => ({ ...i, line: INGREDIENTS.find(([n]) => i.name.toLowerCase().includes(n.toLowerCase()))?.[1] })) : named;

  // Grows well with: owner's pairings first, then bought-together, then the same goal on another shelf
  const partners = [...new Set([...(info.pairs || []).map((k) => byKey.get(k)), ...bought.map((id) => byItem.get(id)),
    // the shelf alone is not enough (chocolate sits on the protein-snacks shelf): the name must say the goal too
    ...all.filter((x) => goal && goalsOf(x).includes(goal) && x.subSlug !== p.subSlug && !!GOALS.find((g) => g.slug === goal)?.words.test(x.name))])]
    .filter((x): x is Product => !!x && x.key !== p.key && x.inStock && !!x.image).slice(0, 2);
  const stackOf = (x: Product): StackItem => ({ key: x.key, name: x.name, image: x.image, price: (x.variants.find((v) => v.stock > 0) || x.variants[0]).price, line: lineOf(x) });

  // Compare with up to 3 similar in-stock products from the same shelf
  const similar = all.filter((x) => x.key !== p.key && x.inStock && x.subSlug === p.subSlug && x.subSlug).slice(0, 3);
  const cmpRows = ['Price', 'Price per 100 g', 'Pack sizes', 'Flavours', 'Brand', 'Form', 'Good for', 'Rating'];
  const col = (x: Product, r: number | null, n: number): CmpCol => {
    const v = x.variants.find((y) => y.stock > 0) || x.variants[0], a = attributesOf(x);
    return { key: x.key, name: x.name, image: x.image, line: x.inStock ? lineOf(x) : null, cells: {
      Price: `₹${v.price}`, 'Price per 100 g': per100(v.price, v.size), 'Pack sizes': [...new Set(x.variants.map((y) => y.size).filter(Boolean))].join(', '),
      Flavours: [...new Set(x.variants.map((y) => y.flavour).filter(Boolean))].join(', '), Brand: x.brand, Form: FORM[a.form],
      'Good for': goalsOf(x).map((g) => t(`goal.${g}` as never)).join(', '), Rating: r ? `${r.toFixed(1)} (${n})` : '' } };
  };
  const cmp = similar.length ? [col(p, rating || null, reviews.length), ...similar.map((x) => col(x, null, 0))] : [];
  const cmpShown = cmpRows.filter((r) => cmp.some((c) => c.cells[r])); // a row blank for every product says nothing

  const glance = [
    { icon: <Leaf size={22} />, title: 'What it is', value: p.sub || p.category, more: p.description ? p.description.split(/(?<=\.)\s/)[0].slice(0, 160) : undefined },
    goals.length ? { icon: <Target size={22} />, title: 'Best for', value: goals.map((g) => t(`goal.${g}` as never)).join(' · '), more: t(`promise.${goal}` as never) } : null,
    info.directions?.length ? { icon: <Clock size={22} />, title: 'When people take it', value: info.directions.map((d) => ({ morning: 'Morning', pre: 'Pre-workout', post: 'Post-workout', evening: 'Evening', night: 'Night' })[d.slot]).join(' · '), more: info.directions[0].text } : null,
    FORM[at.form] || sizes.length ? { icon: <Package size={22} />, title: 'Form and pack', value: [FORM[at.form], sizes.join(', ')].filter(Boolean).join(' · '), more: info.serving ? `${info.serving.size}${info.serving.per_pack ? `, about ${info.serving.per_pack} servings a pack` : ''}` : undefined } : null,
    flavours.length ? { icon: <Sparkles size={22} />, title: flavours.length > 1 ? 'Flavours' : 'Flavour', value: flavours.slice(0, 3).join(', ') + (flavours.length > 3 ? ` +${flavours.length - 3}` : ''), more: flavours.length > 3 ? flavours.join(', ') : undefined } : null,
    p.brand ? { icon: <Store size={22} />, title: 'Brand', value: p.brand, more: 'Bought from the brand or its authorised distributor.' } : null,
  ].filter(Boolean) as { icon: React.ReactNode; title: string; value: string; more?: string }[];

  const faqs: [string, string][] = [
    ['Is this the genuine product?', `We buy ${p.brand || 'every brand'} only from the brand or its authorised distributor. Check the batch code on your pack in the "Made & verified" section.`],
    ['How fast is delivery?', 'Orders are packed at our MG Road store in Vijayawada and sent by courier. You can track every order on this site, or pick it up at the store.'],
    ['Can I pay cash on delivery?', 'Yes, for most orders. Checkout shows if cash on delivery is available for your total.'],
    ['Can I return it?', 'Sealed, unused packs can be returned as described in our terms. Opened food and supplement packs cannot be returned for safety.'],
    ['How should I store it?', info.storage || 'As printed on the label. Usually a cool, dry place away from sunlight, with the lid closed.'],
    ...(food ? [] : [['Can I take it with my medicines?', 'Please ask your doctor first. We can tell you what is on the label, but not whether it suits your medicines.'] as [string, string]]),
  ];

  const tabs: [string, string][] = [['overview', 'Overview'], ...(ingredients.length ? [['ingredients', 'Ingredients'] as [string, string]] : []),
    ...(info.directions?.length || info.serving ? [['use', 'How to use'] as [string, string]] : []), ...(info.nutrition ? [['nutrition', 'Nutrition'] as [string, string]] : []),
    ['verified', 'Made & verified'], ...(cmp.length ? [['compare', 'Compare'] as [string, string]] : []), ['reviews', `Reviews${reviews.length ? ` (${reviews.length})` : ''}`], ['questions', 'Questions']];

  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: p.image || undefined, description: p.description || undefined, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
    offers: p.variants.map((v) => ({ '@type': 'Offer', sku: v.id, price: v.price, priceCurrency: 'INR', availability: v.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' })),
    ...(reviews.length ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.toFixed(1), reviewCount: reviews.length } } : {}),
  };
  const crumbs = [['/shop', t('shop.title')], [`/shop?category=${p.categorySlug}`, p.category], ...(p.subSlug ? [[`/shop?category=${p.subSlug}`, p.sub]] : [])];
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/p/${p.key}`;

  return (
    <div className="page-top mx-auto max-w-[1360px] px-4 pb-32 md:px-8 md:pb-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-soft">
        <ol className="flex flex-wrap gap-1.5">{crumbs.map(([h, l]) => <li key={h} className="after:ml-1.5 after:content-['/'] last:after:content-none"><Link href={h} className="hover:text-ink hover:underline">{l}</Link></li>)}</ol>
      </nav>

      {/* 1. Stage: pack on its goal's colour block, botanicals around it; buy panel beside */}
      <div className="grid gap-10 md:grid-cols-12">
        <div className="md:col-span-7">
          <div className="sticker relative aspect-square overflow-hidden rounded-[28px] md:sticky md:top-[calc(var(--nav-h)+1rem)]" style={{ background: tint, viewTransitionName: `p-${p.key.replace(/[^\w-]/g, '')}` }}>
            <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
              {[[2, 3, -20, '#2E9E5B'], [87, 2, 25, '#C9F26B'], [3, 85, 15, '#C9F26B'], [87, 85, -15, '#2E9E5B']].map(([x, y, r, c], i) => (
                <span key={i} className="tree-pop absolute" style={{ left: `${x}%`, top: `${y}%`, rotate: `${r}deg`, animationDelay: `${300 + i * 60}ms` }}><Sprig color={c as string} size={48} /></span>
              ))}
            </div>
            {p.image ? <Pack src={p.image} alt={p.name} /> : <ImageOff size={48} strokeWidth={1} className="absolute inset-0 m-auto text-mist" />}
          </div>
        </div>

        <div className="md:col-span-5">
          {p.brand && <p className="text-ink-soft">{p.brand}</p>}
          <h1 className="h2 mt-1 text-indigo">{p.name}</h1>
          {goal && <p className="mt-2 text-lg">{t(`promise.${goal}` as never)}</p>}
          {reviews.length > 0 && <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm"><Stars n={rating} /><span className="num text-ink-soft">{rating.toFixed(1)} · {reviews.length}</span></a>}
          {per100(v0.price, v0.size) && <p className="num mt-2 text-sm text-ink-soft">{per100(v0.price, v0.size)}</p>}
          <Buy p={p} phone={PHONE} />
          <ul className="mt-6 flex flex-wrap gap-2 text-sm font-bold text-indigo">
            <li><a href="#verified" className="inline-flex items-center gap-1.5 rounded-full border-2 border-indigo bg-coral px-3 py-1 text-paper"><ShieldCheck size={16} />Verify this batch</a></li>
            <li className="inline-flex items-center gap-1.5 rounded-full border-2 border-indigo bg-paper px-3 py-1"><Store size={16} />Genuine, sourced direct</li>
            {FSSAI && <li className="inline-flex items-center gap-1.5 rounded-full border-2 border-indigo bg-paper px-3 py-1">FSSAI {FSSAI}</li>}
          </ul>
        </div>
      </div>

      <TabRail tabs={tabs} />

      {/* 2-3. Overview: fit check and at a glance */}
      <section id="overview" tabIndex={-1} className="scroll-mt-40 pt-12 outline-none">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <FitCheck goals={goals} at={at} name={p.name} />
          <Glance cards={glance} />
        </div>
        {p.description && <div className="mt-8 max-w-3xl"><h2 className="h3 text-indigo">{t('pdp.about')}</h2><p className="story mt-3 whitespace-pre-line">{p.description}</p></div>}
      </section>

      {ingredients.length > 0 && (
        <section id="ingredients" tabIndex={-1} className="scroll-mt-40 pt-20 outline-none">
          <h2 className="h2 text-indigo">What&apos;s in it</h2>
          {!info.ingredients && <p className="mt-2 text-sm text-ink-soft">The main ingredient this product is named after. The full list and amounts are on the pack label.</p>}
          <div className="mt-8"><Ingredients items={ingredients} /></div>
        </section>
      )}

      {(info.directions?.length || info.serving) && (
        <section id="use" tabIndex={-1} className="scroll-mt-40 pt-20 outline-none"><h2 className="h2 text-indigo">How to use</h2><div className="mt-8"><Routine info={info} /></div></section>
      )}

      {info.nutrition && (
        <section id="nutrition" tabIndex={-1} className="scroll-mt-40 pt-20 outline-none">
          <h2 className="h2 text-indigo">Nutrition facts</h2>
          {at.allergens.length > 0 && <p className="mt-3 font-semibold text-coral">{owner ? 'Contains' : 'The product details mention'}: {at.allergens.join(', ')}. Read the label for the full allergen statement.</p>}
          <div className="mt-6 max-w-xl"><Nutrition n={info.nutrition} serving={info.serving?.size} /></div>
        </section>
      )}

      {/* 7. Made & verified */}
      <section id="verified" tabIndex={-1} className="scroll-mt-40 pt-20 outline-none">
        <h2 className="h2 text-indigo">Made &amp; verified</h2>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <p className="max-w-md">The batch code is printed near the manufacturing and expiry dates, usually on the base or back of the pack. Enter it to see that batch&apos;s papers.</p>
            <div className="mt-4"><Verify initial="" phone={PHONE} /></div>
          </div>
          <div>
            <h3 className="h3 text-indigo">Lab papers</h3>
            {certs.length ? (
              <ul className="mt-3 grid gap-2">{certs.map((c) => (
                <li key={c.id}><a href={c.url} target="_blank" rel="noreferrer" className="sticker flex items-center gap-3 rounded-[16px] bg-paper p-3 hover:-translate-y-0.5">
                  <FileText size={20} className="text-indigo" /><span className="flex-1"><b className="block">{c.title}</b><span className="text-sm text-ink-soft">{[c.kind, c.batch_no && `Batch ${c.batch_no}`, c.valid_until && `valid to ${c.valid_until}`].filter(Boolean).join(' · ')}</span></span>
                </a></li>
              ))}</ul>
            ) : <p className="mt-2 text-ink-soft">Lab papers for this product are available on request. Ask us on WhatsApp with the batch code from your pack.</p>}
          </div>
        </div>
      </section>

      {/* 8. Safety: visible, never collapsed */}
      <section aria-labelledby="safety-h" className="mt-12 rounded-[24px] border-2 border-indigo bg-paper p-6">
        <h2 id="safety-h" className="h3 flex items-center gap-2 text-indigo"><ShieldAlert className="text-coral" />Safety and who should check first</h2>
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {!food && !beauty && <li className="flex gap-2"><Leaf size={18} className="mt-1 shrink-0 text-leaf" />Check with your doctor first if you are pregnant or breastfeeding, take regular medicines, have a health condition, or are under 18.</li>}
          {at.allergens.length > 0 && <li className="flex gap-2 font-semibold text-coral"><Leaf size={18} className="mt-1 shrink-0" />{owner ? 'Contains' : 'The product details mention'} {at.allergens.join(', ')}. Read the label for the full allergen statement.</li>}
          {(info.cautions || []).map((c) => <li key={c} className="flex gap-2"><Leaf size={18} className="mt-1 shrink-0 text-leaf" />{c}</li>)}
          {beauty && <li className="flex gap-2"><Leaf size={18} className="mt-1 shrink-0 text-leaf" />For external use. Try a little on your inner arm first, and stop if it irritates.</li>}
          <li className="flex gap-2"><Leaf size={18} className="mt-1 shrink-0 text-leaf" />{info.storage || 'Store as the label says, away from sunlight and moisture.'} Keep out of reach of children.</li>
        </ul>
        <a href={`https://wa.me/91${PHONE}?text=${encodeURIComponent(`Hi Fit Secrets, a safety question about ${p.name}.`)}`} target="_blank" rel="noreferrer" className="btn btn-ghost mt-5 text-indigo">Talk to us</a>
        <p className="mt-4 text-xs text-ink-soft">Not intended to diagnose, treat, cure or prevent any disease.</p>
      </section>

      {cmp.length > 0 && (
        <section id="compare" tabIndex={-1} className="scroll-mt-40 pt-20 outline-none"><h2 className="h2 text-indigo">Compare with similar</h2><div className="mt-8"><Compare cols={cmp} rows={cmpShown} /></div></section>
      )}

      <section id="reviews" tabIndex={-1} className="scroll-mt-40 pt-20 outline-none"><h2 className="h2 text-indigo">{t('pdp.reviews')}</h2><div className="mt-8"><Reviews reviews={reviews} /></div></section>

      <section id="questions" tabIndex={-1} className="scroll-mt-40 pt-20 outline-none"><h2 className="h2 text-indigo">Questions</h2><div className="mt-8"><Questions faqs={faqs} phone={PHONE} name={p.name} url={url} /></div></section>

      {partners.length > 0 && p.inStock && (
        <section className="pt-20"><h2 className="h2 text-indigo">Grows well with</h2><div className="mt-8"><Stack me={stackOf(p)} partners={partners.map(stackOf)} /></div></section>
      )}

      <Recent me={{ key: p.key, name: p.name, image: p.image, price: v0.price }} />
    </div>
  );
}

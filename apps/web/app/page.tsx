import { ArrowUpRight, WhatsappLogo } from '@phosphor-icons/react/dist/ssr';
import { STORE } from '@fitsecret/shared/seed';
import { getProducts, getCategories, getBrands } from '@/lib/catalog';
import Hero, { type WindowPack } from '@/components/Hero';
import AisleSign from '@/components/AisleSign';
import OffersBoard, { type BoardCombo } from '@/components/OffersBoard';
import CUTOUTS from '@/lib/shelf-cutouts.json';
import Rack from '@/components/Rack';
import AisleWalk from '@/components/AisleWalk';
import { Reveal, Stagger, Item } from '@/components/Motion';
import { BRAND_LOGOS } from '@/lib/brand-logos';
import { getStore } from '@/lib/store';

export const revalidate = 60;

const PER_RACK = 14;

export default async function Home() {
  const [products, cats, brands, store] = await Promise.all([getProducts(), getCategories(), getBrands(), getStore()]);
  // Shelf order: featured, then branded, in stock first; out-of-stock packs stay on the shelf (max 2) as "back soon".
  const ranked = products.filter((p) => p.image).sort((a, b) => Number(b.inStock) - Number(a.inStock) || Number(b.featured) - Number(a.featured) || Number(!!b.brand) - Number(!!a.brand));
  const aisles = cats.map((c) => {
    const all = ranked.filter((p) => p.categorySlug === c.slug);
    return { ...c, items: [...all.filter((p) => p.inStock), ...all.filter((p) => !p.inStock).slice(0, 2)].slice(0, PER_RACK) };
  }).filter((a) => a.items.length >= 4);
  const racked = new Set(aisles.map((a) => a.slug));
  // Shop window: one pack from each aisle in turn, cut-out photos only (they stand on the window riser).
  const cut = (src: string | null) => (src ? (CUTOUTS as Record<string, string>)[src] : undefined);
  const pool = cats.map((c) => ranked.filter((p) => p.inStock && p.categorySlug === c.slug && cut(p.image)));
  const packs: WindowPack[] = [];
  for (let i = 0; packs.length < 9 && i < 6; i++) for (const row of pool) if (row[i] && packs.length < 9) packs.push({ src: `/shelf/${cut(row[i].image)}`, name: row[i].name, href: `/p/${row[i].key}` });
  // Combos on the offers board: names and "bought separately" value from the catalogue.
  const byItem = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { p, v }] as const)));
  const combos: BoardCombo[] = store.combos.flatMap((c) => {
    const hits = c.items.map((x) => ({ x, hit: byItem.get(x.item_id) }));
    if (hits.some((h) => !h.hit)) return [];
    return [{ id: c.id, name: c.name, price: c.price, channel: c.channel, href: `/p/${hits[0].hit!.p.key}`,
      value: hits.reduce((s, h) => s + h.hit!.v.price * h.x.qty, 0), items: hits.map((h) => `${h.x.qty > 1 ? h.x.qty + '× ' : ''}${h.hit!.p.name}`) }];
  }).slice(0, 6);
  const map = `https://www.google.com/maps?q=${encodeURIComponent('Datta Towers, MG Road, Vijayawada')}`;

  return (
    <>
      <Hero packs={packs} logos={brands.filter((b) => BRAND_LOGOS[b.name]).map((b) => ({ name: b.name, src: BRAND_LOGOS[b.name] }))} total={Math.floor(products.length / 50) * 50}
        aisles={cats.map((c) => ({ slug: c.slug, name: c.name, count: c.count, href: racked.has(c.slug) ? `#aisle-${c.slug}` : `/shop?category=${c.slug}` }))} />

      {/* Offers board: banners, public coupons and combos, each with where it can be redeemed (POS: Offers, Online Store → Banners) */}
      <OffersBoard banners={store.banners} coupons={store.coupons} combos={combos} />

      {/* Energy band: the shelf in one line */}
      <div aria-hidden className="my-20 -rotate-2 overflow-hidden bg-brand py-4 md:my-28 md:py-5">
        <div className="marquee flex w-max" style={{ ['--dur' as string]: '40s' }}>
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {['Whey protein', 'Creatine', 'Mass gainers', 'Dry fruits', 'Millets', 'Ayurveda', 'Cold pressed oils', 'Honey & ghee', 'Pre-workout'].map((w) => (
                <span key={w} className="display flex items-center whitespace-nowrap text-[clamp(1.8rem,4vw,3.25rem)] leading-none text-ink">
                  {w}<svg viewBox="0 0 24 24" className="mx-6 h-[0.55em] w-[0.55em] md:mx-9"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="currentColor" /></svg>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* The aisles: one rack per category, the main way in */}
      <AisleWalk aisles={aisles.map(({ slug, name }) => ({ slug, name }))}>
        {aisles.map((a, i) => <Rack key={a.slug} n={i + 1} slug={a.slug} name={a.name} count={a.count} items={a.items} />)}
      </AisleWalk>

      {/* Ask the store: the thing a local shop does better than a marketplace */}
      <section className="mt-28 md:mt-36">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-[1fr_1.1fr] md:items-center md:px-6">
          <div>
            <Reveal>
              <AisleSign label="The counter · ask us" title="Not sure what to buy?" />
            </Reveal>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-mute">
              Message us your goal, weight and budget. We&apos;ll reply on WhatsApp with options from our shelf and their prices.
            </p>
            <a href={`https://wa.me/91${STORE.phone}?text=${encodeURIComponent('Hi Fit Secrets, I need help choosing a product.')}`} target="_blank" rel="noreferrer" className="btn-ink mt-8 px-7 py-4">
              <WhatsappLogo size={20} /> Chat with the store
            </a>
          </div>
          {/* the counter's receipt roll: questions people ask, tap one to send it on WhatsApp */}
          <Reveal delay={0.1} className="receipt p-6 md:p-8">
            <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-mute">Fit Secrets · counter</p>
            <p className="mt-1 border-b border-dashed border-ink/25 pb-3 text-center font-mono text-sm font-semibold">People often ask us</p>
            <Stagger as="ul" each={0.05} className="mt-4 flex flex-wrap gap-2.5">
              {[
                'Best whey protein under ₹3,000?',
                'Which creatine should I start with?',
                'Mass gainer for a beginner?',
                'Is this pack genuine? (I’ll send a photo)',
                'Pre-workout without too much caffeine?',
                'Sugar-free options for diabetics?',
                'Is this in stock at the MG Road store?',
              ].map((q) => (
                <Item as="li" key={q}>
                  <a href={`https://wa.me/91${STORE.phone}?text=${encodeURIComponent(`Hi Fit Secrets, ${q}`)}`} target="_blank" rel="noreferrer"
                    className="group inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[15px] font-medium transition-colors hover:bg-ink hover:text-white">
                    {q}<ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                </Item>
              ))}
            </Stagger>
          </Reveal>
        </div>
      </section>

      <section id="visit" className="mx-auto mt-28 grid max-w-7xl scroll-mt-28 gap-8 px-4 md:grid-cols-[1fr_1.3fr] md:px-6">
        <div className="flex flex-col justify-center">
          <Reveal><AisleSign tone="green" label="Way to the store" title="Visit us on MG Road" /></Reveal>
          <address className="mt-5 max-w-md not-italic leading-relaxed text-mute">{STORE.address}</address>
          <p className="mt-3 text-mute">Call <a className="font-semibold text-ink" href={`tel:+91${STORE.phone}`}>{STORE.phone}</a></p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a className="btn-ink px-7 py-4" href={map} target="_blank" rel="noreferrer">Get directions</a>
            <a className="btn-line px-7 py-4" href={`https://wa.me/91${STORE.phone}`} target="_blank" rel="noreferrer">WhatsApp us</a>
          </div>
        </div>
        <Reveal delay={0.1}><iframe title="Fit Secrets on Google Maps" src={`${map}&output=embed`} loading="lazy"
          className="aspect-[4/3] w-full rounded-[var(--radius-card)] border-0 grayscale" referrerPolicy="no-referrer-when-downgrade" /></Reveal>
      </section>
    </>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import { Sprout, ArrowRight, MapPin, Phone, ShieldCheck, Factory, BadgeCheck, Clock } from 'lucide-react';
import Tree, { Flower } from '@/components/Tree';
import GoalSelector from '@/components/GoalSelector';
import IngredientWheel from '@/components/IngredientWheel';
import ProductTile from '@/components/ProductTile';
import { WhatsApp } from '@/components/ui';
import { getProducts, getCategories } from '@/lib/catalog';
import { GOALS, goalsOf } from '@/lib/goals';
import { getT } from '@/lib/lang';
import { STORE, PHONE, FSSAI, MAP, HOURS } from '@/lib/site';

const INGREDIENTS = ['Ashwagandha', 'Giloy', 'Shilajit', 'Moringa', 'Foxtail millet', 'Triphala', 'Amla', 'Wheat grass', 'Turmeric', 'Cold-pressed groundnut oil', 'Forest honey', 'A2 ghee', 'Whey isolate', 'Creatine'];

export default async function Home() {
  const [products, cats, t] = await Promise.all([getProducts(), getCategories(), getT()]);
  const withImg = products.filter((p) => p.image && p.inStock);
  const best = [...withImg.filter((p) => p.featured), ...withImg.filter((p) => !p.featured)].slice(0, 8);
  const goals = GOALS.map((g) => {
    const items = withImg.filter((p) => goalsOf(p).includes(g.slug));
    return { slug: g.slug, label: g.label, promise: g.promise, count: items.length, items: items.slice(0, 3).map(({ key, name, image }) => ({ key, name, image })) };
  }).filter((g) => g.count);
  const shelf = (slug: string) => cats.find((c) => c.slug === slug);
  const shelves = [
    { c: shelf('ayurvedic-products'), title: 'Ayurveda shelf', line: 'Churnams, lehyams and balms, made the way they have been for generations.' },
    { c: shelf('organic-products') || shelf('dry-fruits-and-millets'), title: 'Organic pantry', line: 'Millets, dry fruits, honey and ghee for the everyday kitchen.' },
    { c: shelf('beauty-and-cosmetics'), title: 'Aurae skin & hair', line: 'Aloe gels, scrubs and shampoos from our own label.' },
  ].filter((s) => s.c);
  const trust: [typeof Factory, string][] = [[Factory, t('trust.units')], [ShieldCheck, t('trust.batch')], [BadgeCheck, t('trust.genuine')]];
  if (FSSAI) trust.push([BadgeCheck, `${t('trust.fssai')} · ${FSSAI}`]);
  const words = (s: string, d: number) => s.split(' ').map((w, i) => <span key={i} style={{ animationDelay: `${d + i * 90}ms` }}>{w}&nbsp;</span>);

  return (
    <>
      {/* HERO: the living Tree of Life. Flowers = goals, fruits = bestsellers, bird = verify. */}
      <section className="relative overflow-hidden bg-sky">
        <div className="mx-auto grid max-w-[1360px] items-center gap-6 px-4 pt-24 pb-10 md:min-h-[100svh] md:grid-cols-12 md:px-8 md:pt-28">
          <div className="md:col-span-6">
            <h1 className="display-xl stamp-in max-w-[12ch] text-indigo">
              {words(t('hero.l1'), 150)}<br />{words(t('hero.l2'), 150 + t('hero.l1').split(' ').length * 90)}
            </h1>
            <p className="rise mt-6 max-w-md text-lg text-ink-soft" style={{ animationDelay: '500ms' }}>{t('hero.sub')}</p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '600ms' }}>
              <Link href="#goals" className="btn btn-gold text-base">{t('cta.shopGoal')}<ArrowRight size={18} /></Link>
              <Link href="/finder" className="btn btn-dark text-base"><Sprout size={18} />{t('cta.finder')}</Link>
              <a href={`https://wa.me/91${PHONE}`} target="_blank" rel="noreferrer" className="btn btn-ghost text-base text-indigo"><WhatsApp size={18} />{t('cta.whatsapp')}</a>
            </div>
            <ul className="rise mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-indigo" style={{ animationDelay: '700ms' }}>
              {trust.map(([Icon, l]) => <li key={l} className="flex items-center gap-2"><Icon size={18} strokeWidth={2} className="text-leaf" />{l}</li>)}
            </ul>
          </div>
          <div className="md:col-span-6">
            <Tree goals={goals.map((g) => ({ slug: g.slug, label: t(g.label) }))} fruits={best.slice(0, 3).map(({ key, name }) => ({ key, name }))} verifyLabel={t('verify.title')} />
          </div>
        </div>
        {/* Mobile: the same goals as a swipeable flower row, so navigation never depends on tiny tap targets */}
        <ul className="no-scrollbar -mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-8 md:hidden">
          {goals.map((g) => (
            <li key={g.slug} className="snap-start"><Link href={`/shop?goal=${g.slug}`} className="group sticker flex min-w-24 flex-col items-center gap-1 rounded-[20px] bg-paper px-3 py-3 text-sm font-bold text-indigo">
              <Flower color={`var(--color-goal-${g.slug})`} size={40} />{t(g.label)}
            </Link></li>
          ))}
        </ul>
      </section>

      {/* GOALS */}
      <section id="goals" className="paisley scroll-mt-24 bg-lime text-indigo">
        <div className="mx-auto max-w-[1360px] px-4 py-20 md:px-8 md:py-28">
          <h2 className="display-l max-w-[18ch]">{t('goals.title')}</h2>
          <div className="mt-10"><GoalSelector goals={goals} /></div>
        </div>
      </section>

      {/* BESTSELLERS */}
      <section className="mx-auto max-w-[1360px] px-4 py-20 md:px-8 md:py-28">
        <div className="flex items-end justify-between gap-4">
          <div><h2 className="h2">{t('best.title')}</h2><p className="mt-2 text-ink-soft">{t('best.sub')}</p></div>
          <Link href="/shop" className="hidden shrink-0 items-center gap-1 font-semibold text-river hover:underline sm:inline-flex">{t('cta.shopAll')}<ArrowRight size={16} /></Link>
        </div>
        <div className="no-scrollbar -mx-4 mt-8 grid snap-x snap-mandatory auto-cols-[46%] grid-flow-col gap-3 overflow-x-auto px-4 sm:auto-cols-[31%] md:mx-0 md:grid-flow-row md:grid-cols-4 md:gap-5 md:overflow-visible md:px-0">
          {best.map((p) => <div key={p.key} className="snap-start"><ProductTile p={p} /></div>)}
        </div>
      </section>

      {/* INGREDIENT MARQUEE */}
      <div className="overflow-hidden border-y-2 border-indigo bg-paper py-4" aria-hidden>
        <div className="marquee gap-8 pr-8">
          {[...INGREDIENTS, ...INGREDIENTS].map((w, i) => <span key={i} className="display flex items-center gap-8 text-2xl whitespace-nowrap text-indigo md:text-3xl">{w}<Flower color={i % 2 ? '#FFB81F' : '#FF9F1C'} size={30} /></span>)}
        </div>
      </div>

      {/* INGREDIENT WHEEL (indigo block, the big scroll moment) */}
      <IngredientWheel title={t('story.title')} />

      {/* VERIFY */}
      <section className="mx-auto max-w-[1360px] px-4 py-20 md:px-8 md:py-28">
        <div className="sticker grid items-center gap-10 rounded-[28px] bg-coral p-6 text-paper md:grid-cols-2 md:p-14">
          <div>
            <ShieldCheck size={44} strokeWidth={1.75} />
            <h2 className="h2 mt-4">{t('verify.title')}</h2>
            <p className="mt-3 max-w-md text-lg font-medium">{t('verify.sub')}</p>
          </div>
          <form action="/verify" className="flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="home-code">{t('verify.placeholder')}</label>
            <input id="home-code" name="code" required minLength={3} maxLength={40} autoComplete="off" placeholder={t('verify.placeholder')} className="field flex-1 uppercase placeholder:normal-case" />
            <button className="btn btn-gold">{t('cta.verify')}</button>
          </form>
        </div>
      </section>

      {/* EDITORIAL SHELVES (hard-edged images on purpose, to contrast with tiles) */}
      {shelves.length > 0 && (
        <section className="mx-auto max-w-[1360px] px-4 pb-20 md:px-8 md:pb-28">
          <h2 className="h2">{t('shelf.title')}</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-12 md:grid-rows-2">
            {shelves.map((s, i) => (
              <Link key={s.title} href={`/shop?category=${s.c!.slug}`} className={`sticker group relative flex min-h-72 flex-col justify-end overflow-hidden rounded-[24px] p-6 text-paper transition-transform duration-[350ms] ease-[var(--ease-stamp)] hover:rotate-0 ${['bg-leaf -rotate-1', 'bg-indigo rotate-1', 'bg-coral -rotate-[.5deg]'][i]} ${i === 0 ? 'md:col-span-7 md:row-span-2 md:min-h-[560px]' : 'md:col-span-5'}`}>
                {s.c!.image && <Image src={s.c!.image} alt="" fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover opacity-45 mix-blend-luminosity transition-transform duration-[1200ms] ease-[var(--ease-out-expo)] group-hover:scale-105" />}
                <div className="absolute inset-0 bg-gradient-to-t from-deep/70 to-transparent" />
                <div className="relative">
                  <h3 className={i === 0 ? 'display-l' : 'h2'}>{s.title}</h3>
                  <p className="story mt-2 max-w-sm text-chalk/85">{s.line}</p>
                  <span className="mt-4 inline-flex items-center gap-1 font-bold text-lime">{s.c!.count} products <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* WHOLESALE */}
      <section className="paisley relative overflow-hidden bg-marigold text-indigo">
        <div className="relative mx-auto max-w-[1360px] px-4 py-20 md:px-8 md:py-24">
          <h2 className="display-l max-w-[14ch]">{t('wholesale.title')}</h2>
          <p className="mt-4 max-w-md text-lg font-medium">{t('wholesale.sub')}</p>
          <Link href="/wholesale" className="btn btn-gold mt-8 text-base">{t('wholesale.cta')}<ArrowRight size={18} /></Link>
        </div>
      </section>

      {/* VISIT */}
      <section className="mx-auto grid max-w-[1360px] gap-10 px-4 py-20 md:grid-cols-12 md:px-8 md:py-28">
        <div className="md:col-span-5">
          <h2 className="h2">{t('visit.title')}</h2>
          <address className="story mt-4 not-italic">{STORE.address}</address>
          {HOURS && <p className="mt-3 flex items-center gap-2 text-ink-soft"><Clock size={18} />{HOURS}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={MAP} target="_blank" rel="noreferrer" className="btn btn-dark"><MapPin size={18} />{t('visit.directions')}</a>
            <a href={`tel:+91${PHONE}`} className="btn btn-ghost"><Phone size={18} />{t('visit.call')}</a>
            <a href={`https://wa.me/91${PHONE}`} target="_blank" rel="noreferrer" className="btn btn-ghost"><WhatsApp size={18} />WhatsApp</a>
          </div>
        </div>
        <a href={MAP} target="_blank" rel="noreferrer" className="sticker group relative block min-h-72 overflow-hidden rounded-[24px] bg-sage md:col-span-7" aria-label={`${t('visit.directions')}: ${STORE.address}`}>
          {/* Static map plate: no third-party embed on first load (TRD §10: lazy map) */}
          <svg viewBox="0 0 700 400" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <rect width="700" height="400" fill="#E6F8C2" />
            <path d="M-20 300 C 150 260, 260 330, 420 280 S 650 220, 720 240 L 720 420 L -20 420Z" fill="#8FD3C4" opacity=".5" />
            <g stroke="#FFFFFF" strokeWidth="14" fill="none" strokeLinecap="round"><path d="M0 170 H700" /><path d="M330 0 V400" /><path d="M80 0 L 260 400" /><path d="M520 0 C 500 120, 560 220, 640 400" /></g>
            <g stroke="#FFFFFF" strokeWidth="5" fill="none"><path d="M0 90 H700" /><path d="M0 240 H330" /><path d="M450 0 V170" /></g>
            <text x="350" y="160" fontSize="15" fill="#17237A" fontFamily="system-ui">MG Road</text>
            <text x="20" y="330" fontSize="14" fill="#17237A" fontFamily="system-ui" opacity=".8">Krishna river</text>
          </svg>
          <span className="absolute top-[42%] left-[47%] grid -translate-x-1/2 -translate-y-full place-items-center">
            <span className="grid size-14 place-items-center rounded-full rounded-br-none border-2 border-indigo bg-coral transition-transform group-hover:-translate-y-1 [transform:rotate(45deg)]"><MapPin size={24} className="-rotate-45 text-paper" /></span>
          </span>
          <span className="sticker absolute bottom-4 left-4 rounded-full bg-paper px-4 py-2 text-sm font-bold text-indigo">Fit Secrets · Labbipet</span>
        </a>
      </section>
    </>
  );
}

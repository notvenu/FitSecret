'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Check, AlertTriangle, Stethoscope, Star, Search, Minus, Plus, Sun, Moon, Dumbbell, Sunset, Sunrise } from 'lucide-react';
import type { Attributes } from '@fitsecret/shared/finder';
import type { ProductInfo, Slot } from '@fitsecret/shared/product-info';
import { useCart, type CartLine } from '@/components/cart';
import { useT } from '@/components/Lang';
import { Flower } from '@/components/Tree';
import { Sprig, BOTANICAL_COLORS } from '@/components/Botanical';
import { inr0, pourToCart, waLink, WhatsApp } from '@/components/ui';
import { GOALS } from '@/lib/goals';
import type { Review } from '@/lib/catalog';

// Interactive product page (GUIDED-FINDER spec, part B). Every module hides itself when it has no data (B5).
export type Line = Omit<CartLine, 'qty'>;
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Tab rail: sticky, scroll-spy, vine underline under the active tab ----------
export function TabRail({ tabs }: { tabs: [string, string][] }) {
  const [on, setOn] = useState(tabs[0]?.[0]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setOn(e.target.id)), { rootMargin: '-35% 0px -60% 0px' });
    tabs.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [tabs]);
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setOn(id);
    el.focus({ preventScroll: true });
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - 140, behavior: reduced() ? 'auto' : 'smooth' });
  };
  return (
    <nav aria-label="On this page" className="tab-rail sticky z-20 -mx-4 mt-16 border-y-2 border-indigo bg-paper/95 px-4 backdrop-blur md:-mx-8 md:px-8">
      <ul className="no-scrollbar flex gap-1 overflow-x-auto">
        {tabs.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} onClick={(e) => { e.preventDefault(); go(id); }} aria-current={on === id ? 'true' : undefined}
              className={`relative block px-3 py-3 text-sm font-semibold whitespace-nowrap ${on === id ? 'text-indigo' : 'text-ink-soft hover:text-indigo'}`}>
              {label}
              <svg viewBox="0 0 60 6" preserveAspectRatio="none" className="absolute inset-x-2 bottom-0.5 h-1.5 w-[calc(100%-1rem)]" aria-hidden>
                <path pathLength={1} d="M0 3 Q 7.5 0 15 3 T 30 3 T 45 3 T 60 3" fill="none" stroke="#2E9E5B" strokeWidth="2" vectorEffect="non-scaling-stroke"
                  style={{ strokeDasharray: 1, strokeDashoffset: on === id ? 0 : 1, transition: 'stroke-dashoffset 350ms var(--ease-grow)' }} />
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------- Stage: the pack tilts with a drag (or the pointer), and rocks back ----------
export function Pack({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const set = (x: number, y = 0) => { if (ref.current) ref.current.style.transform = `perspective(900px) rotateY(${x}deg) rotateX(${y}deg)`; };
  const move = (e: React.PointerEvent) => {
    if (reduced() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (e.pointerType === 'mouse' && drag.current == null) return set(((e.clientX - r.left) / r.width - 0.5) * 16, ((e.clientY - r.top) / r.height - 0.5) * -10);
    if (drag.current != null) set(Math.max(-35, Math.min(35, (e.clientX - drag.current) / 4)));
  };
  return (
    <div className="relative size-full touch-pan-y" onPointerMove={move} onPointerDown={(e) => { drag.current = e.clientX; }}
      onPointerUp={() => { drag.current = null; set(0); }} onPointerLeave={() => { drag.current = null; set(0); }}>
      {/* the stamp-in animation holds its end state, so it lives on the outer layer and the tilt on the inner one */}
      <div className="stamp absolute inset-0">
        <div ref={ref} className="absolute inset-0 transition-transform duration-[600ms] ease-[var(--ease-stamp)] will-change-transform">
          <Image src={src} alt={alt} fill preload loading="eager" sizes="(min-width:768px) 50vw, 100vw" className="object-contain p-8 mix-blend-multiply drop-shadow-[8px_10px_0_rgb(23_35_122/.15)] md:p-14" />
        </div>
      </div>
    </div>
  );
}

// ---------- Is this right for me? ----------
type Fit = { goals: string[]; diet?: string | null; allergens: string[] };
const DIETS = [['veg', 'Vegetarian'], ['vegan', 'Vegan'], ['egg', 'Eggs are fine']] as const;
export function FitCheck({ goals, at, name }: { goals: string[]; at: Attributes; name: string }) {
  const t = useT();
  const [fit, setFit] = useState<Fit | null>(null);
  const [consult, setConsult] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Fit>({ goals: [], diet: null, allergens: [] });
  useEffect(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem('fs_finder') || 'null');
      if (v?.a?.goals?.length) setFit({ goals: v.a.goals, diet: v.a.diet, allergens: v.a.allergens || [] });
      setConsult(sessionStorage.getItem('fs_finder_consult') === '1');
    } catch {}
  }, []);
  const chips = fit ? [
    ...fit.goals.map((g) => (goals.includes(g) ? { ok: true, text: `Matches ${t(`goal.${g}` as never)}` } : { ok: false, text: `Not mainly for ${t(`goal.${g}` as never)}` })),
    ...(fit.diet === 'vegan' ? [at.diet === 'vegan' ? { ok: true, text: 'Vegan' } : { ok: false, text: 'May not be vegan: check the label' }] : []),
    ...(fit.diet === 'veg' ? [at.diet === 'nonveg' ? { ok: false, text: 'Not vegetarian' } : at.vegLabel ? { ok: true, text: 'Vegetarian' } : { ok: false, text: 'Check the label for the veg mark' }] : []),
    ...fit.allergens.map((a) => (at.allergens.includes(a) ? { ok: false, warn: true, text: `Product details mention ${a}` } : { ok: false, text: `${a[0].toUpperCase() + a.slice(1)}: not listed in our details, read the label` })),
    ...(at.beginner_friendly ? [{ ok: true, text: 'Beginner-friendly' }] : at.experience === 'advanced' ? [{ ok: false, text: 'For experienced users' }] : []),
  ] : [];
  const save = () => {
    setFit(draft); setOpen(false);
    try { const v = JSON.parse(sessionStorage.getItem('fs_finder') || '{}'); sessionStorage.setItem('fs_finder', JSON.stringify({ step: 'about', ts: Date.now(), ...v, a: { ...v.a, ...draft } })); } catch {}
  };
  return (
    <div className="sticker self-start rounded-[24px] bg-paper p-5">
      <h2 className="h3 text-indigo">Is this right for me?</h2>
      {consult && <p className="mt-3 flex gap-2 rounded-[14px] bg-sky p-3 text-sm"><Stethoscope size={18} className="shrink-0 text-coral" />{at.needs_consult ? `You told us something that means you should check with your doctor before starting ${name}.` : 'This is a food, but check with your doctor if you are unsure.'}</p>}
      {fit ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <li key={i} className={`stamp inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-bold ${'warn' in c && c.warn ? 'animate-[shake_300ms_400ms] border-coral bg-coral text-paper' : c.ok ? 'border-indigo bg-lime text-indigo' : 'border-indigo/30 bg-paper text-ink-soft'}`} style={{ animationDelay: `${i * 80}ms` }}>
              {'warn' in c && c.warn ? <AlertTriangle size={14} /> : c.ok ? <Check size={14} /> : null}{c.text}
            </li>
          ))}
          <li><button type="button" onClick={() => setOpen(true)} className="px-2 py-1 text-sm font-semibold text-indigo underline">Change</button></li>
        </ul>
      ) : !open && <button type="button" onClick={() => setOpen(true)} className="btn btn-dark mt-3">Check if this suits you (3 taps)</button>}
      <style>{`@keyframes shake{25%{transform:translateX(-5px)}50%{transform:translateX(5px)}75%{transform:translateX(-2px)}}`}</style>
      {open && (
        <div className="rise mt-4 grid gap-4">
          <div><p className="mb-2 text-sm font-semibold">1. Your goal</p><div className="flex flex-wrap gap-2">{GOALS.map((g) => <button key={g.slug} type="button" className="chip" aria-pressed={draft.goals.includes(g.slug)} onClick={() => setDraft({ ...draft, goals: draft.goals.includes(g.slug) ? draft.goals.filter((x) => x !== g.slug) : [...draft.goals, g.slug].slice(-2) })}>{t(g.label)}</button>)}</div></div>
          <div><p className="mb-2 text-sm font-semibold">2. Food preference</p><div className="flex flex-wrap gap-2">{DIETS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={draft.diet === k} onClick={() => setDraft({ ...draft, diet: draft.diet === k ? null : k })}>{l}</button>)}</div></div>
          <div><p className="mb-2 text-sm font-semibold">3. Allergies to avoid</p><div className="flex flex-wrap gap-2">{['milk', 'nuts', 'gluten', 'soy'].map((a) => <button key={a} type="button" className="chip capitalize" aria-pressed={draft.allergens.includes(a)} onClick={() => setDraft({ ...draft, allergens: draft.allergens.includes(a) ? draft.allergens.filter((x) => x !== a) : [...draft.allergens, a] })}>{a}</button>)}</div></div>
          <button type="button" onClick={save} disabled={!draft.goals.length} className="btn btn-gold justify-self-start">Show my fit</button>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-soft">Based on the product details we hold, not a medical assessment. <Link href="/finder" className="font-semibold text-indigo underline">Full finder</Link></p>
    </div>
  );
}

// ---------- At a glance: sticker cards that flip for one more line ----------
export function Glance({ cards }: { cards: { icon: React.ReactNode; title: string; value: string; more?: string }[] }) {
  const [flip, setFlip] = useState<number | null>(null);
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {cards.map((c, i) => (
        <li key={c.title} className="[perspective:900px]">
          <button type="button" disabled={!c.more} onClick={() => setFlip(flip === i ? null : i)} aria-expanded={c.more ? flip === i : undefined}
            className="relative grid min-h-32 w-full text-left transition-transform duration-[350ms] ease-[var(--ease-stamp)] [transform-style:preserve-3d] motion-reduce:transition-none"
            style={{ transform: flip === i ? 'rotateY(180deg)' : 'none' }}>
            <span className="sticker col-start-1 row-start-1 flex flex-col gap-1 rounded-[20px] bg-paper p-4 [backface-visibility:hidden]">
              <span className="text-leaf">{c.icon}</span><span className="text-xs font-semibold text-ink-soft">{c.title}</span><span className="font-bold text-indigo">{c.value}</span>
            </span>
            {c.more && <span className="sticker col-start-1 row-start-1 flex items-center rounded-[20px] bg-lime p-4 text-sm font-medium text-indigo [backface-visibility:hidden] [transform:rotateY(180deg)]">{c.more}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------- Ingredient Explorer: hotspots around the botanical, list underneath ----------
export function Ingredients({ items }: { items: { name: string; line?: string; amount?: string; note?: string; allergen?: string }[] }) {
  const [on, setOn] = useState(0);
  const cur = items[on];
  const n = items.length;
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      <div className="relative mx-auto aspect-square w-full max-w-sm" role="group" aria-label="Ingredients">
        <svg viewBox="-100 -100 200 200" className="absolute inset-0 size-full" aria-hidden>
          <circle r="70" fill="none" stroke="#17237A" strokeOpacity=".2" strokeDasharray="3 4" />
          <circle pathLength={1} r="40" fill="#E6F8C2" stroke="#17237A" strokeWidth="2" className="tree-draw" />
        </svg>
        <div className="absolute inset-[30%] grid place-items-center"><Sprig color={BOTANICAL_COLORS[on % BOTANICAL_COLORS.length]} size={96} /></div>
        {items.map((it, i) => {
          const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
          return (
            <button key={it.name} type="button" onClick={() => setOn(i)} aria-pressed={on === i} aria-label={it.name}
              className="group absolute grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
              style={{ left: `${50 + Math.cos(ang) * 35}%`, top: `${50 + Math.sin(ang) * 35}%` }}>
              <span className={`absolute inset-1 rounded-full ${on === i ? '' : 'pulse-dot motion-reduce:animate-none'}`} />
              <span className={`transition-transform duration-[350ms] ease-[var(--ease-stamp)] ${on === i ? 'scale-125 rotate-[30deg]' : 'scale-75 group-hover:scale-100'}`}><Flower color={BOTANICAL_COLORS[i % BOTANICAL_COLORS.length]} size={40} /></span>
            </button>
          );
        })}
      </div>
      <div>
        <div key={on} className="rise sticker rounded-[24px] bg-paper p-5">
          <h3 className="h3 text-indigo">{cur.name}</h3>
          {cur.line && <p className="mt-2">{cur.line}</p>}
          <dl className="mt-3 grid gap-1 text-sm">
            <div className="flex gap-2"><dt className="text-ink-soft">Amount per serving:</dt><dd className="font-semibold">{cur.amount || 'see the label'}</dd></div>
            {cur.note && <div className="flex gap-2"><dt className="text-ink-soft">Note:</dt><dd>{cur.note}</dd></div>}
            {cur.allergen && <div className="flex gap-2 text-coral"><dt className="font-semibold">Allergen:</dt><dd className="font-semibold">{cur.allergen}</dd></div>}
          </dl>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">{items.map((it, i) => <li key={it.name}><button type="button" className="chip" aria-pressed={on === i} onClick={() => setOn(i)}>{it.name}</button></li>)}</ul>
      </div>
    </div>
  );
}

// ---------- How to use: label directions on a day arc, and how long the pack lasts ----------
const SLOTS: [Slot, string, React.ReactNode][] = [['morning', 'Morning', <Sunrise key="m" size={20} />], ['pre', 'Pre-workout', <Dumbbell key="p" size={20} />], ['post', 'Post-workout', <Sun key="o" size={20} />], ['evening', 'Evening', <Sunset key="e" size={20} />], ['night', 'Night', <Moon key="n" size={20} />]];
export function Routine({ info }: { info: ProductInfo }) {
  const d = info.directions || [], sv = info.serving;
  const max = sv?.max_per_day || sv?.per_day || 1;
  const [per, setPer] = useState(Math.min(sv?.per_day || 1, max));
  const days = sv?.per_pack ? Math.floor(sv.per_pack / per) : null;
  return (
    <div className="grid gap-8">
      {d.length > 0 && (
        <ol className="grid grid-cols-5 gap-2">
          {SLOTS.map(([k, l, icon]) => {
            const hit = d.find((x) => x.slot === k);
            return (
              <li key={k} className={`flex flex-col items-center gap-2 rounded-[20px] p-3 text-center ${hit ? 'sticker bg-lime' : 'bg-paper text-ink-soft'}`}>
                <span className={hit ? 'text-indigo' : ''}>{icon}</span><span className="text-xs font-bold">{l}</span>
                {hit && <span className="text-xs text-indigo">{hit.text}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {sv && (
        <div className="sticker grid gap-4 rounded-[24px] bg-paper p-5 md:grid-cols-2">
          <div><p className="text-sm text-ink-soft">One serving</p><p className="display h3 text-indigo">{sv.size}</p>{sv.mix && <p className="mt-1">{sv.mix}</p>}</div>
          {days != null && (
            <div>
              <p className="text-sm text-ink-soft">How long will this pack last?</p>
              <div className="mt-2 flex items-center gap-3">
                <button type="button" onClick={() => setPer(Math.max(1, per - 1))} className="grid size-11 place-items-center rounded-full border-2 border-indigo" aria-label="Fewer servings a day"><Minus size={16} /></button>
                <span className="num font-bold">{per} a day</span>
                <button type="button" onClick={() => setPer(Math.min(max, per + 1))} disabled={per >= max} className="grid size-11 place-items-center rounded-full border-2 border-indigo disabled:opacity-40" aria-label="More servings a day"><Plus size={16} /></button>
                <span className="text-xs text-ink-soft">As per label{per >= max ? ' (maximum)' : ''}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-sage"><div className="h-full rounded-full bg-leaf transition-[width] duration-[500ms]" style={{ width: `${Math.min(100, (days / 60) * 100)}%` }} /></div>
              <p className="mt-1 font-bold text-indigo">Lasts about {days} days</p>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-ink-soft">Directions are copied from the pack label. Follow the label on your pack.</p>
    </div>
  );
}

// ---------- Nutrition facts: per serving / per 100 g ----------
export function Nutrition({ n, serving }: { n: NonNullable<ProductInfo['nutrition']>; serving?: string }) {
  const has100 = n.rows.some((r) => r[2]);
  const [per, setPer] = useState<1 | 2>(1);
  return (
    <div className="sticker overflow-hidden rounded-[24px] bg-paper">
      {has100 && (
        <div className="flex gap-1 border-b-2 border-indigo p-2" role="group" aria-label="Show values">
          {([[1, `Per serving${serving ? ` (${serving})` : ''}`], [2, 'Per 100 g']] as const).map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={per === k} onClick={() => setPer(k)}>{l}</button>)}
        </div>
      )}
      <table className="w-full text-left">
        <tbody>{n.rows.map((r) => <tr key={r[0]} className="border-b border-line last:border-0"><th scope="row" className="px-4 py-3 font-semibold">{r[0]}</th><td key={per} className="num rise px-4 py-3 text-right font-bold text-indigo">{r[per] || '–'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ---------- Compare: identical rows hidden by default, differences marked ----------
export type CmpCol = { key: string; name: string; image: string | null; line: Line | null; cells: Record<string, string> };
export function Compare({ cols, rows }: { cols: CmpCol[]; rows: string[] }) {
  const { add } = useCart();
  const [all, setAll] = useState(false);
  const same = (r: string) => new Set(cols.map((c) => c.cells[r] || '–')).size === 1;
  const shown = rows.filter((r) => all || !same(r));
  return (
    <div>
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-x-2 text-left text-sm">
          <thead>
            <tr><th className="w-28" />{cols.map((c, i) => (
              <th key={c.key} scope="col" className="rise align-top" style={{ animationDelay: `${i * 60}ms` }}>
                <div className={`sticker rounded-[18px] p-3 ${i === 0 ? 'bg-lime' : 'bg-paper'}`}>
                  <div className="relative mb-2 aspect-square rounded-[12px] bg-sky">{c.image && <Image src={c.image} alt="" fill sizes="160px" className="object-contain p-2 mix-blend-multiply" />}</div>
                  <Link href={`/p/${c.key}`} className="line-clamp-2 font-bold text-indigo hover:underline">{c.name}</Link>
                  {i === 0 && <span className="text-xs font-semibold">This product</span>}
                </div>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r}><th scope="row" className="py-2 font-semibold text-ink-soft">{r}</th>
                {cols.map((c) => <td key={c.key} className={`rounded-[10px] px-3 py-2 ${!same(r) ? 'bg-lime/40 font-semibold' : ''}`}>{c.cells[r] || '–'}</td>)}
              </tr>
            ))}
            <tr><th />{cols.map((c) => <td key={c.key} className="pt-3">{c.line && c.key !== cols[0].key && <button type="button" onClick={(e) => { add(c.line!, 1, false); pourToCart(e.currentTarget); }} className="btn btn-gold min-h-10 w-full px-3 py-2 text-sm">Add to cart</button>}</td>)}</tr>
          </tbody>
        </table>
      </div>
      {rows.some(same) && <button type="button" onClick={() => setAll(!all)} className="mt-3 text-sm font-semibold text-indigo underline">{all ? 'Hide rows that are the same' : `Show all ${rows.length} rows`}</button>}
    </div>
  );
}

// ---------- Reviews: bar breakdown that filters ----------
export function Reviews({ reviews }: { reviews: Review[] }) {
  const [star, setStar] = useState<number | null>(null);
  const [sort, setSort] = useState<'new' | 'high'>('new');
  if (!reviews.length) return (
    <div className="flex items-center gap-4 rounded-[24px] bg-paper p-6"><Flower color="#B8C0EA" size={48} /><p className="text-ink-soft">No reviews yet. Bought this from us? Reply to your order message and tell us how it went.</p></div>
  );
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const list = reviews.filter((r) => !star || r.rating === star).sort((a, b) => (sort === 'high' ? b.rating - a.rating : b.created_at.localeCompare(a.created_at)));
  return (
    <div className="grid gap-8 md:grid-cols-[280px_1fr]">
      <div>
        <p className="display text-5xl text-indigo">{avg.toFixed(1)}</p><Stars n={avg} /><p className="text-sm text-ink-soft">{reviews.length} reviews</p>
        <ul className="mt-4 grid gap-1">
          {[5, 4, 3, 2, 1].map((s) => {
            const c = reviews.filter((r) => r.rating === s).length;
            return (
              <li key={s}><button type="button" onClick={() => setStar(star === s ? null : s)} aria-pressed={star === s} disabled={!c}
                className={`flex w-full items-center gap-2 rounded-[10px] px-2 py-1 text-sm ${star === s ? 'bg-lime' : 'hover:bg-paper'} disabled:opacity-40`}>
                <span className="num w-3">{s}</span><Star size={12} className="text-marigold" fill="currentColor" />
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sage"><span className="block h-full rounded-full bg-marigold" style={{ width: `${(c / reviews.length) * 100}%` }} /></span>
                <span className="num w-6 text-right text-ink-soft">{c}</span>
              </button></li>
            );
          })}
        </ul>
      </div>
      <div>
        <div className="mb-4 flex gap-2"><button type="button" className="chip" aria-pressed={sort === 'new'} onClick={() => setSort('new')}>Newest</button><button type="button" className="chip" aria-pressed={sort === 'high'} onClick={() => setSort('high')}>Highest rated</button></div>
        <ul className="grid gap-4">
          {list.map((r) => (
            <li key={r.id} className="sticker rounded-[20px] bg-paper p-5">
              <div className="flex flex-wrap items-center gap-3"><Stars n={r.rating} /><b>{r.name}</b>{r.verified && <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-bold text-indigo">Verified purchase</span>}</div>
              {r.title && <p className="mt-3 font-semibold">{r.title}</p>}
              {r.body && <p className="mt-1 text-ink-soft">{r.body}</p>}
              {r.reply && <p className="mt-3 border-l-2 border-leaf pl-3 text-sm"><b>Fit Secrets:</b> {r.reply}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
export function Stars({ n }: { n: number }) {
  return <span className="inline-flex text-marigold" aria-label={`${n.toFixed(1)} out of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={16} fill={i <= Math.round(n) ? 'currentColor' : 'none'} />)}</span>;
}

// ---------- Questions: searchable FAQs and a pre-filled WhatsApp question ----------
export function Questions({ faqs, phone, name, url }: { faqs: [string, string][]; phone: string; name: string; url: string }) {
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState('');
  const list = faqs.filter(([a, b]) => !q || `${a} ${b}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div>
        <label className="relative block"><span className="sr-only">Search questions</span><Search size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
          <input className="field pl-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions" /></label>
        <div className="mt-3 divide-y divide-line rounded-[20px] bg-paper px-5">
          {list.map(([a, b]) => (
            <details key={a} className="group py-1">
              <summary className="flex min-h-12 items-center gap-3 font-semibold"><Sprig color="#2E9E5B" size={18} />{a}</summary>
              <p className="pb-4 pl-8 text-ink-soft">{b}</p>
            </details>
          ))}
          {!list.length && <p className="py-4 text-ink-soft">No match. Ask us below.</p>}
        </div>
      </div>
      <form className="sticker rounded-[24px] bg-lime p-5" onSubmit={(e) => { e.preventDefault(); window.open(waLink(phone, `Hi Fit Secrets, a question about ${name} (${url}): ${ask}`), '_blank', 'noreferrer'); }}>
        <p className="display h3 text-indigo">Ask about this product</p>
        <textarea className="field mt-3" rows={3} required maxLength={500} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Your question" />
        <button className="btn btn-gold mt-3 w-full"><WhatsApp size={18} />Ask on WhatsApp</button>
      </form>
    </div>
  );
}

// ---------- Grows well with: tick partners, the pot sprouts a leaf each, add the stack ----------
export type StackItem = { key: string; name: string; image: string | null; price: number; line: Line };
export function Stack({ me, partners }: { me: StackItem; partners: StackItem[] }) {
  const { add } = useCart();
  const [on, setOn] = useState<string[]>(partners.slice(0, 1).map((p) => p.key));
  const [done, setDone] = useState(false);
  const picked = [me, ...partners.filter((p) => on.includes(p.key))];
  const total = picked.reduce((s, p) => s + p.price, 0);
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_280px]">
      <ul className="grid gap-3 sm:grid-cols-3">
        {[me, ...partners].map((p, i) => {
          const sel = i === 0 || on.includes(p.key);
          return (
            <li key={p.key}>
              <label className={`sticker flex h-full cursor-pointer flex-col gap-2 rounded-[20px] p-3 transition-colors ${sel ? 'bg-lime' : 'bg-paper'} ${i === 0 ? 'cursor-default' : ''}`}>
                <span className="flex items-center gap-2"><input type="checkbox" checked={sel} disabled={i === 0} onChange={() => { setDone(false); setOn(on.includes(p.key) ? on.filter((x) => x !== p.key) : [...on, p.key]); }} className="size-5 accent-[var(--color-indigo)]" />
                  <span className="text-xs font-semibold text-ink-soft">{i === 0 ? 'This product' : 'Add'}</span></span>
                <span className="relative aspect-[4/3] rounded-[14px] bg-paper">{p.image && <Image src={p.image} alt="" fill sizes="200px" className="object-contain p-2 mix-blend-multiply" />}</span>
                <span className="line-clamp-2 text-sm font-bold text-indigo">{p.name}</span><span className="num font-bold">{inr0(p.price)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="sticker flex flex-col items-start gap-3 rounded-[24px] bg-indigo p-5 text-paper">
        <StackPot n={picked.length} />
        <p className="text-sm text-mist">{picked.length} items</p>
        <p key={total} className="num display rise text-4xl">{inr0(total)}</p>
        <button type="button" onClick={(e) => { const el = e.currentTarget; picked.forEach((p, i) => setTimeout(() => { add(p.line, 1, false); pourToCart(el); }, i * 150)); setDone(true); }} className="btn btn-dark mt-auto w-full">{done ? <><Check size={18} />Added</> : 'Add stack to cart'}</button>
        <p className="text-xs text-mist">Combo savings apply in the cart when a store combo matches.</p>
      </div>
    </div>
  );
}
function StackPot({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 60 60" className="size-16" aria-hidden>
      <path d="M14 36h32l-3 20H17Z" fill="#E5483B" /><path d="M12 32h36v6H12Z" fill="#fff" stroke="#fff" />
      <path d="M30 32V14" stroke="#C9F26B" strokeWidth="2.5" strokeLinecap="round" />
      {Array.from({ length: Math.min(n, 4) }, (_, i) => <ellipse key={i} className="tree-pop" cx={i % 2 ? 36 : 24} cy={28 - Math.floor(i / 2) * 9} rx="6" ry="3" fill="#C9F26B" transform={`rotate(${i % 2 ? 30 : -30} ${i % 2 ? 36 : 24} ${28 - Math.floor(i / 2) * 9})`} />)}
    </svg>
  );
}

// ---------- Recently viewed (this browser only) ----------
type Seen = { key: string; name: string; image: string | null; price: number };
export function Recent({ me }: { me: Seen }) {
  const [list, setList] = useState<Seen[]>([]);
  useEffect(() => {
    try {
      const old: Seen[] = JSON.parse(localStorage.getItem('fs_seen') || '[]');
      setList(old.filter((x) => x.key !== me.key).slice(0, 6));
      localStorage.setItem('fs_seen', JSON.stringify([me, ...old.filter((x) => x.key !== me.key)].slice(0, 12)));
    } catch {}
  }, [me]);
  if (!list.length) return null;
  return (
    <section className="mt-20">
      <h2 className="h2 text-indigo">Recently viewed</h2>
      <ul className="no-scrollbar -mx-4 mt-6 flex gap-3 overflow-x-auto px-4 pb-2">
        {list.map((x) => (
          <li key={x.key} className="w-40 shrink-0"><Link href={`/p/${x.key}`} className="sticker block rounded-[20px] bg-paper p-3 hover:-translate-y-0.5">
            <span className="relative block aspect-square rounded-[14px] bg-sky">{x.image && <Image src={x.image} alt="" fill sizes="160px" className="object-contain p-2 mix-blend-multiply" />}</span>
            <span className="mt-2 line-clamp-2 text-sm font-bold text-indigo">{x.name}</span><span className="num text-sm font-bold">{inr0(x.price)}</span>
          </Link></li>
        ))}
      </ul>
    </section>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useT } from '@/components/Lang';
import { PRICES, listOf } from './prices';

type Cat = { name: string; slug: string; count: number; subs: { name: string; slug: string; count: number }[] };
type Brand = { name: string; count: number };
type Opt = { value: string; label: string; count: number };
type Facets = { cats: Cat[]; brands: Brand[]; forms: Opt[]; discounts: { value: string; count: number }[]; bestCount: number };
type SP = Record<string, string | undefined>;

const BRANDS_SHOWN = 8;

// Turns the filter form into a /shop URL. Price presets ("500-1000") become min/max; typed min/max win over a preset.
function urlOf(form: HTMLFormElement) {
  const fd = new FormData(form);
  const u = new URLSearchParams();
  // ticked checkboxes with the same name (brand, form) become one comma-separated value
  for (const [k, v] of fd) if (v && k !== 'price' && k !== 'brandq') u.set(k, u.has(k) && (k === 'brand' || k === 'form') ? `${u.get(k)},${v}` : String(v));
  const preset = String(fd.get('price') || '');
  if (preset && !fd.get('min') && !fd.get('max')) {
    const [lo, hi] = preset.split('-');
    if (lo && lo !== '0') u.set('min', lo);
    if (hi) u.set('max', hi);
  }
  return `/shop${u.size ? `?${u}` : ''}`;
}

// Desktop (lg+): a sidebar that applies each change at once. Phones: a sticky Filters + Sort bar; the sheet holds a draft
// until "Show results". Both are in the HTML and switched by CSS, so the page doesn't jump when JavaScript loads.
export default function Filters({ sp, active, ...facets }: { sp: SP; active: number } & Facets) {
  const t = useT();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const go = (form: HTMLFormElement) => router.push(urlOf(form), { scroll: false });

  return (
    <>
      <aside className="hidden self-start lg:sticky lg:top-[calc(var(--nav-h)+1rem)] lg:block lg:max-h-[calc(100dvh-var(--nav-h)-2rem)] lg:overflow-y-auto lg:pr-2 lg:[scrollbar-width:thin]">
        <Body sp={sp} {...facets} onChange={go} />
      </aside>

      <div className="sticky top-[calc(var(--nav-h)-4px)] z-20 -mx-4 grid grid-cols-2 gap-2 border-b border-line bg-chalk/95 px-4 py-2 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setSheet(true)} className="btn btn-ghost min-h-11 text-sm text-indigo">
          <SlidersHorizontal size={16} />{t('shop.filters')}{active > 0 && <span className="num grid size-5 place-items-center rounded-full bg-indigo text-[11px] text-paper">{active}</span>}
        </button>
        <SortSelect sp={sp} compact />
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 bg-deep/40 lg:hidden" onClick={() => setSheet(false)}>
          <div role="dialog" aria-modal aria-label={t('shop.filters')} onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[28px] bg-chalk animate-[sheet-up_320ms_var(--ease-out-expo)]">
            <style>{`@keyframes sheet-up{from{transform:translateY(100%)}}`}</style>
            <div className="flex items-center justify-between px-5 pt-4 pb-2"><h2 className="h3">{t('shop.filters')}</h2>
              <button type="button" onClick={() => setSheet(false)} className="grid size-11 place-items-center" aria-label={t('nav.close')} autoFocus><X size={20} /></button></div>
            <Body sp={sp} {...facets} draft className="overflow-y-auto px-5"
              footer={(
                <div className="sticky bottom-0 -mx-5 mt-2 grid grid-cols-[auto_1fr] gap-2 border-t border-line bg-chalk px-5 pt-3 pb-safe">
                  <button type="button" className="btn btn-ghost" onClick={() => { router.push(sp.goal ? `/shop?goal=${sp.goal}` : '/shop'); setSheet(false); }}>{t('shop.clear')}</button>
                  <button className="btn btn-gold">{t('shop.apply')}</button>
                </div>
              )}
              onChange={(f) => { go(f); setSheet(false); }} />
          </div>
        </div>
      )}
    </>
  );
}

// draft: the form only submits on "Show results" (phone sheet). Otherwise every change applies.
function Body({ sp, cats, brands, forms, discounts, bestCount, onChange, draft, footer, className = '' }: Facets & { sp: SP; onChange: (f: HTMLFormElement) => void; draft?: boolean; footer?: React.ReactNode; className?: string }) {
  const t = useT();
  const form = useRef<HTMLFormElement>(null);
  const [brandQ, setBrandQ] = useState('');
  const [allBrands, setAllBrands] = useState(false);
  const live = () => !draft && form.current && onChange(form.current);
  const preset = PRICES.find(([v]) => { const [lo, hi] = v.split('-'); return (Number(lo) || 0) === (Number(sp.min) || 0) && (hi || '') === (sp.max || ''); })?.[0];
  const custom = !preset && (sp.min || sp.max);
  const picked = new Set(listOf(sp.brand)), types = new Set(listOf(sp.form));
  const shownBrands = brandQ ? brands.filter((b) => b.name.toLowerCase().includes(brandQ.toLowerCase()))
    : allBrands ? brands : [...brands.slice(0, BRANDS_SHOWN), ...brands.slice(BRANDS_SHOWN).filter((b) => picked.has(b.name))];

  return (
    <form ref={form} key={JSON.stringify(sp)} className={`grid gap-1 ${className}`} onChange={(e) => {
      const el = e.target as unknown as HTMLInputElement;
      if (el.name === 'brandq' || el.name === 'min' || el.name === 'max') return; // typed fields apply on blur / Enter
      if (el.name === 'price' && form.current) for (const k of ['min', 'max']) (form.current.elements.namedItem(k) as HTMLInputElement).value = '';
      live();
    }} onSubmit={(e) => { e.preventDefault(); onChange(form.current!); }}>
      {sp.goal && <input type="hidden" name="goal" value={sp.goal} />}
      {sp.q && <input type="hidden" name="q" value={sp.q} />}
      {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}

      <Section title={t('shop.category')}>
        <Option name="category" value="" label={t('shop.all')} on={!sp.category} />
        {cats.map((c) => (
          <div key={c.slug}>
            <Option name="category" value={c.slug} label={c.name} n={c.count} on={sp.category === c.slug} />
            {c.subs.length > 0 && (sp.category === c.slug || c.subs.some((s) => s.slug === sp.category)) && (
              <div className="ml-4 grid border-l-2 border-line pl-2">{c.subs.map((s) => <Option key={s.slug} name="category" value={s.slug} label={s.name} n={s.count} on={sp.category === s.slug} />)}</div>
            )}
          </div>
        ))}
      </Section>

      {brands.length > 0 && (
        <Section title={picked.size ? `${t('shop.brand')} (${picked.size})` : t('shop.brand')} open={!!picked.size || !draft}>
          {brands.length > BRANDS_SHOWN && (
            <label className="relative mb-1 block">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
              <input name="brandq" value={brandQ} onChange={(e) => setBrandQ(e.target.value)} placeholder={t('shop.findBrand')} aria-label={t('shop.findBrand')}
                className="field min-h-10 py-2 pl-9 text-sm" />
            </label>
          )}
          {shownBrands.map((b) => <Option key={b.name} type="checkbox" name="brand" value={b.name} label={b.name} n={b.count} on={picked.has(b.name)} />)}
          {!brandQ && brands.length > BRANDS_SHOWN && (
            <button type="button" onClick={() => setAllBrands(!allBrands)} className="mt-1 justify-self-start px-2 text-sm font-semibold text-river underline">
              {allBrands ? t('shop.fewerBrands') : t('shop.moreBrands', { n: brands.length })}</button>
          )}
          {brandQ && !shownBrands.length && <p className="px-2 py-1 text-sm text-ink-soft">{t('shop.noBrand')}</p>}
        </Section>
      )}

      {forms.length > 1 && (
        <Section title={types.size ? `${t('shop.type')} (${types.size})` : t('shop.type')}>
          {forms.map((f) => <Option key={f.value} type="checkbox" name="form" value={f.value} label={f.label} n={f.count} on={types.has(f.value)} />)}
        </Section>
      )}

      <Section title={t('shop.discount')} open={!!sp.off || !draft}>
        <Option name="off" value="" label={t('shop.anyDiscount')} on={!sp.off} />
        {discounts.map((d) => <Option key={d.value} name="off" value={d.value} label={t('shop.offAtLeast', { n: d.value })} n={d.count} on={sp.off === d.value} />)}
      </Section>

      <Section title={t('shop.price')}>
        <Option name="price" value="" label={t('shop.anyPrice')} on={!preset && !custom} />
        {PRICES.map(([v, l]) => <Option key={v} name="price" value={v} label={l} on={preset === v} />)}
        <div className="mt-2 flex items-center gap-2">
          <input name="min" type="number" inputMode="numeric" min={0} defaultValue={custom ? sp.min : ''} placeholder="₹ Min" aria-label="Minimum price" className="field min-h-10 py-2 text-sm" onBlur={live} />
          <span aria-hidden>–</span>
          <input name="max" type="number" inputMode="numeric" min={0} defaultValue={custom ? sp.max : ''} placeholder="₹ Max" aria-label="Maximum price" className="field min-h-10 py-2 text-sm" onBlur={live} />
        </div>
      </Section>

      {([['stock', 'shop.inStock'], ['best', 'shop.best']] as const).filter(([k]) => k !== 'best' || bestCount || sp.best).map(([k, l]) => (
        <label key={k} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 border-t border-line py-2 text-sm font-semibold">
          {t(l)}
          <input type="checkbox" name={k} value="1" defaultChecked={!!sp[k]} className="size-5 accent-[var(--color-river)]" />
        </label>
      ))}
      {footer}
    </form>
  );
}

function Section({ title, open = true, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-t border-line py-2 first-of-type:border-t-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}<ChevronDown size={18} className="text-ink-soft transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-0.5 pb-2">{children}</div>
    </details>
  );
}

function Option({ name, value, label, n, on, type = 'radio' }: { name: string; value: string; label: string; n?: number; on: boolean; type?: 'radio' | 'checkbox' }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2 text-sm hover:bg-paper has-[:checked]:font-semibold has-[:checked]:text-river">
      <input type={type} name={name} value={value} defaultChecked={on} className={`size-4 shrink-0 accent-[var(--color-river)] ${type === 'checkbox' ? 'rounded' : ''}`} />
      <span className="flex-1">{label}</span>{n != null && <span className="num text-xs text-ink-soft">{n}</span>}
    </label>
  );
}

// Sort applies at once. compact: the phone bar's half-width version.
export function SortSelect({ sp, compact }: { sp: SP; compact?: boolean }) {
  const t = useT();
  const router = useRouter();
  const set = (v: string) => {
    const u = new URLSearchParams(Object.entries({ ...sp, sort: v || undefined, page: undefined }).filter(([, x]) => x) as [string, string][]);
    router.push(`/shop${u.size ? `?${u}` : ''}`, { scroll: false });
  };
  return (
    <label className={`relative flex items-center gap-2 text-sm ${compact ? '' : 'shrink-0'}`}>
      <span className={compact ? 'sr-only' : 'text-ink-soft'}>{t('shop.sort')}</span>
      <select value={sp.sort || ''} onChange={(e) => set(e.target.value)} aria-label={t('shop.sort')}
        className={`field min-h-11 py-2 pr-9 text-sm font-semibold ${compact ? 'w-full text-indigo' : 'w-auto'}`}>
        <option value="">{t('sort.featured')}</option><option value="low">{t('sort.low')}</option><option value="high">{t('sort.high')}</option>
        <option value="off">{t('sort.off')}</option><option value="name">{t('sort.name')}</option>
      </select>
    </label>
  );
}

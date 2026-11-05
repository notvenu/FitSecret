'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useT } from '@/components/Lang';

type Cat = { name: string; slug: string; subs: { name: string; slug: string }[] };
type SP = Record<string, string | undefined>;

// STATES §8. Desktop: changing a filter applies instantly. Mobile: a bottom sheet holds a draft until Apply; closing discards it.
export default function Filters({ sp, cats, count }: { sp: SP; cats: Cat[]; count: number }) {
  const t = useT();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [sheet, setSheet] = useState(false);
  const [wide, setWide] = useState(true);
  useEffect(() => { const m = matchMedia('(min-width: 1024px)'); setWide(m.matches); const on = () => setWide(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);

  const apply = () => {
    const fd = new FormData(form.current!);
    const u = new URLSearchParams();
    for (const [k, v] of fd) if (v) u.set(k, String(v));
    router.push(`/shop${u.size ? `?${u}` : ''}`, { scroll: false });
    setSheet(false);
  };

  const body = (
    <form ref={form} key={JSON.stringify(sp)} onChange={() => wide && apply()} onSubmit={(e) => { e.preventDefault(); apply(); }} className="grid gap-8">
      {sp.goal && <input type="hidden" name="goal" value={sp.goal} />}
      {sp.q && <input type="hidden" name="q" value={sp.q} />}
      <label className="grid gap-2 text-sm font-semibold">{t('shop.sort')}
        <select name="sort" defaultValue={sp.sort || ''} className="field font-normal">
          <option value="">{t('sort.featured')}</option><option value="low">{t('sort.low')}</option><option value="high">{t('sort.high')}</option><option value="name">{t('sort.name')}</option>
        </select>
      </label>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">{t('shop.category')}</legend>
        <div className="grid max-h-[50vh] gap-1 overflow-y-auto pr-1 lg:max-h-none">
          <Radio name="category" value="" label="All" on={!sp.category} />
          {cats.map((c) => (
            <div key={c.slug}>
              <Radio name="category" value={c.slug} label={c.name} on={sp.category === c.slug} />
              {(sp.category === c.slug || c.subs.some((s) => s.slug === sp.category)) && (
                <div className="ml-6 grid gap-1 border-l border-line pl-3">{c.subs.map((s) => <Radio key={s.slug} name="category" value={s.slug} label={s.name} on={sp.category === s.slug} />)}</div>
              )}
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">{t('shop.price')} (₹)</legend>
        <div className="flex items-center gap-2">
          <input name="min" type="number" inputMode="numeric" min={0} defaultValue={sp.min} placeholder="Min" aria-label="Minimum price" className="field" onChange={(e) => e.stopPropagation()} onBlur={() => wide && apply()} />
          <span aria-hidden>–</span>
          <input name="max" type="number" inputMode="numeric" min={0} defaultValue={sp.max} placeholder="Max" aria-label="Maximum price" className="field" onChange={(e) => e.stopPropagation()} onBlur={() => wide && apply()} />
        </div>
      </fieldset>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" name="stock" value="1" defaultChecked={!!sp.stock} className="size-5 accent-[var(--color-river)]" />{t('shop.inStock')}
      </label>
      {!wide && (
        <div className="sticky bottom-0 -mx-5 grid grid-cols-[auto_1fr] gap-2 border-t border-line bg-chalk px-5 pt-3 pb-safe">
          <button type="button" className="btn btn-ghost" onClick={() => { router.push(sp.goal ? `/shop?goal=${sp.goal}` : '/shop'); setSheet(false); }}>{t('shop.clear')}</button>
          <button className="btn btn-gold">{t('shop.apply')}</button>
        </div>
      )}
    </form>
  );

  if (wide) return <aside className="self-start lg:sticky lg:top-[calc(var(--nav-h)+1rem)]">{body}</aside>;
  return (
    <>
      <div className="sticky top-[calc(var(--nav-h)-8px)] z-20 -mx-4 flex gap-2 bg-chalk/95 px-4 py-2 backdrop-blur">
        <button type="button" onClick={() => setSheet(true)} className="btn btn-dark min-h-11 flex-1"><SlidersHorizontal size={18} />{t('shop.filters')} · {count}</button>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-50 bg-deep/40" onClick={() => setSheet(false)}>
          <div role="dialog" aria-modal aria-label={t('shop.filters')} onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[28px] bg-chalk px-5 pt-4 animate-[sheet-up_320ms_var(--ease-out-expo)]">
            <style>{`@keyframes sheet-up{from{transform:translateY(100%)}}`}</style>
            <div className="mb-4 flex items-center justify-between"><h2 className="h3">{t('shop.filters')}</h2>
              <button type="button" onClick={() => setSheet(false)} className="grid size-11 place-items-center" aria-label={t('nav.close')} autoFocus><X size={20} /></button></div>
            {body}
          </div>
        </div>
      )}
    </>
  );
}

function Radio({ name, value, label, on }: { name: string; value: string; label: string; on: boolean }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2 text-sm hover:bg-paper has-[:checked]:font-semibold has-[:checked]:text-river">
      <input type="radio" name={name} value={value} defaultChecked={on} className="size-4 accent-[var(--color-river)]" />{label}
    </label>
  );
}

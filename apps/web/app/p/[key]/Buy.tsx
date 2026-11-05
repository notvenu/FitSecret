'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Minus, Plus, ShoppingBag } from 'lucide-react';
import type { Product } from '@/lib/catalog';
import { useCart, MAX_QTY } from '@/components/cart';
import { useT } from '@/components/Lang';
import { lineOf } from '@/components/ProductTile';
import { inr0, pourToCart, Magnetic, WhatsApp } from '@/components/ui';

// Variant selection (STATES §6) updates price, stock and ?v= in the URL. Button: idle → added (1.8s) → idle; error when stock caps the qty.
export default function Buy({ p, phone: PHONE }: { p: Product; phone: string }) {
  const t = useT();
  const { add, lines } = useCart();
  const sp = useSearchParams();
  const [vid, setVid] = useState(() => p.variants.find((v) => v.id === sp.get('v'))?.id || (p.variants.find((v) => v.stock > 0) || p.variants[0]).id);
  const [qty, setQty] = useState(1);
  const [state, setState] = useState<'idle' | 'added' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [bar, setBar] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const v = p.variants.find((x) => x.id === vid)!;
  const inCart = lines.find((l) => l.id === v.id)?.qty || 0;
  const room = Math.max(0, Math.min(MAX_QTY, v.stock) - inCart);
  const unit = v.bulkPrice && v.bulkMin && qty >= v.bulkMin ? v.bulkPrice : v.price;
  const off = v.mrp > v.price ? Math.round(((v.mrp - v.price) / v.mrp) * 100) : 0;

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    if (main.current) io.observe(main.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => { if (state === 'idle') return; const id = setTimeout(() => setState('idle'), state === 'added' ? 1800 : 3000); return () => clearTimeout(id); }, [state]);

  const pick = (id: string) => {
    setVid(id); setQty(1); setState('idle');
    const u = new URL(location.href); u.searchParams.set('v', id); history.replaceState(null, '', u);
  };
  const addNow = (from: HTMLElement | null) => {
    if (!room) { setState('error'); setMsg(v.stock ? `Only ${v.stock} available. They're already in your cart.` : t('pdp.out')); return; }
    const n = Math.min(qty, room);
    add(lineOf(p, v), n, false);
    pourToCart(from);
    setState('added');
    setMsg(n < qty ? `Only ${n} more available. We added ${n}.` : '');
  };
  const ask = `https://wa.me/91${PHONE}?text=${encodeURIComponent(`Hi Fit Secrets, is ${p.name}${v.size ? ` (${v.size})` : ''} available?`)}`;

  const cta = (compact = false) => v.stock > 0 ? (
    <button ref={compact ? undefined : btn} type="button" onClick={(e) => addNow(e.currentTarget)} aria-live="polite"
      className={`btn btn-gold w-full text-base ${state === 'error' ? 'animate-[shake_320ms]' : ''} ${compact ? 'min-h-12' : 'min-h-14'}`}>
      {state === 'added' ? <><Check size={20} className="stamp" />{t('pdp.added')}</> : <><ShoppingBag size={20} />{t('pdp.add')}</>}
    </button>
  ) : (
    <a href={ask} target="_blank" rel="noreferrer" className="btn btn-dark w-full text-base"><WhatsApp size={18} />{t('pdp.ask')}</a>
  );

  return (
    <div className="mt-6">
      <style>{`@keyframes shake{25%{transform:translateX(-6px)}50%{transform:translateX(6px)}75%{transform:translateX(-3px)}}`}</style>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="num text-4xl font-bold">{inr0(unit)}</span>
        {v.mrp > unit && <span className="num text-lg text-ink-soft"><span className="sr-only">{t('pdp.mrp')} </span><s>{inr0(v.mrp)}</s></span>}
        {off > 0 && <span className="rounded-full bg-madder px-2 py-0.5 text-sm font-semibold text-paper">−{off}%</span>}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{t('pdp.incl')}</p>

      {p.variants.length > 1 && (
        <fieldset className="mt-6">
          <legend className="mb-2 text-sm font-semibold">{t('pdp.pack')}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {p.variants.map((x) => {
              const label = [x.size, x.flavour].filter(Boolean).join(' · ') || x.name;
              return (
                <button key={x.id} type="button" role="radio" aria-checked={x.id === vid} onClick={() => pick(x.id)}
                  className={`min-h-12 rounded-[14px] border-2 px-4 py-2 text-left text-sm transition-colors duration-[180ms] ${x.id === vid ? 'border-indigo bg-lime text-indigo' : 'border-indigo/30 bg-paper hover:border-indigo'} ${x.stock ? '' : 'opacity-50'}`}>
                  <span className="block font-semibold">{label}</span><span className="num text-xs opacity-80">{inr0(x.price)}{!x.stock && ` · ${t('tile.out')}`}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {v.bulkPrice && v.bulkMin && v.bulkPrice < v.price && (
        <p className="mt-4 rounded-[12px] bg-haldi/20 px-3 py-2 text-sm">{t('pdp.bulk', { n: v.bulkMin, p: inr0(v.bulkPrice) })}</p>
      )}

      <div ref={main} className="mt-6 grid grid-cols-[auto_1fr] gap-3">
        {v.stock > 0 && (
          <span className="inline-flex items-center rounded-full border-[1.5px] border-line bg-paper">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-12 place-items-center" aria-label="Decrease quantity"><Minus size={16} /></button>
            <span className="num w-8 text-center font-semibold" aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(Math.max(1, room), q + 1))} className="grid size-12 place-items-center" aria-label="Increase quantity"><Plus size={16} /></button>
          </span>
        )}
        <div className={v.stock > 0 ? '' : 'col-span-2'}><Magnetic className="w-full">{cta()}</Magnetic></div>
      </div>
      <p className="mt-2 min-h-5 text-sm" role="status">
        {state === 'error' || msg ? <span className={state === 'error' ? 'text-madder' : ''}>{msg}</span>
          : v.stock > 0 && v.stock <= 5 ? <span className="text-madder">{t('pdp.left', { n: v.stock })}</span> : v.stock > 0 ? <span className="text-river">{t('pdp.inStock')}</span> : null}
      </p>
      {v.stock > 0 && <a href={ask} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-river"><WhatsApp size={16} />{t('pdp.ask')}</a>}

      {/* Sticky buy bar (mobile): slides up when the main button scrolls away */}
      <div className={`fixed inset-x-0 bottom-[60px] z-20 border-t border-line bg-chalk/95 px-4 py-2 backdrop-blur transition-transform duration-[240ms] ease-[var(--ease-out-expo)] md:hidden ${bar ? 'translate-y-0' : 'translate-y-[150%]'}`} aria-hidden={!bar}>
        <div className="flex items-center gap-3">
          <span className="num text-lg font-bold">{inr0(unit)}</span>
          <div className="flex-1" tabIndex={bar ? undefined : -1}>{cta(true)}</div>
          <a href={ask} target="_blank" rel="noreferrer" className="grid size-12 shrink-0 place-items-center rounded-full border-[1.5px] border-line" aria-label={t('pdp.ask')} tabIndex={bar ? undefined : -1}><WhatsApp size={20} /></a>
        </div>
      </div>
    </div>
  );
}

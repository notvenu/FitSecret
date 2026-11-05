'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Sprout, Search, Menu, X, Home, LayoutGrid, ShieldCheck, Loader2 } from 'lucide-react';
import { useCart } from './cart';
import { useT, LangToggle } from './Lang';
import { inr0, WhatsApp, Pot } from './ui';
import { GOALS } from '@/lib/goals';

type Cat = { name: string; slug: string };
type Hit = { key: string; name: string; price: number; image: string | null };

// States (STATES-AND-TRANSITIONS §9): top (glass over hero) → hidden (scrolling down) → visible (scrolling up, solid chalk).
export default function Nav({ cats, phone, note }: { cats: Cat[]; phone: string; note?: string }) {
  const t = useT();
  const path = usePathname();
  const { count, setOpen } = useCart();
  const [mode, setMode] = useState<'top' | 'visible' | 'hidden'>('top');
  const [sheet, setSheet] = useState(false);
  const [search, setSearch] = useState(false);
  const overHero = path === '/' && mode === 'top';

  useEffect(() => {
    let last = scrollY;
    const on = () => {
      const y = scrollY;
      if (y < 20) setMode('top');
      else if (y > last && y > 80) setMode('hidden');
      else if (y < last) setMode('visible');
      last = y;
    };
    on();
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);
  useEffect(() => { setSheet(false); setSearch(false); }, [path]);
  // sticky bars under the header (product page tab rail) follow it as it hides and shows
  useEffect(() => { document.documentElement.dataset.nav = mode === 'hidden' && !search ? 'hidden' : 'shown'; }, [mode, search]);
  const [shut, setShut] = useState(false); // mega-menu closed after a pick until the pointer leaves it
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) { e.preventDefault(); setSearch(true); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  const links: [string, string][] = [['/shop', t('nav.shop')], ['/#goals', t('nav.goals')], ['/wholesale', t('nav.wholesale')], ['/verify', t('nav.verify')], ['/visit', t('nav.visit')]];

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-40 transition-[transform,background-color,color] duration-[240ms] ease-[var(--ease-out-expo)]
        ${mode === 'hidden' && !search ? '-translate-y-full' : ''}
        ${overHero ? 'bg-transparent text-indigo' : 'bg-paper text-indigo'}`}>
        {note && <p className="truncate bg-haldi px-4 py-1.5 text-center text-sm font-semibold text-deep">{note}</p>}
        <nav className="mx-auto flex h-16 max-w-[1360px] items-center gap-6 px-4 md:h-[72px] md:px-8" aria-label="Main">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Fit Secrets home">
            <span className={`grid place-items-center rounded-[10px] bg-paper p-1 transition-transform ${mode === 'visible' ? 'scale-[.85]' : ''}`}>
              <Image src="/logo.png" alt="" width={36} height={36} className="size-8 object-contain" preload />
            </span>
            <span className="display text-lg font-bold tracking-tight">Fit Secrets</span>
          </Link>
          <ul className="hidden items-center gap-1 lg:flex">
            {links.map(([href, l]) => (
              <li key={href} className={href === '/shop' ? 'group relative' : ''} onMouseLeave={href === '/shop' ? () => setShut(false) : undefined}>
                <Link href={href} className="rounded-full px-3.5 py-2 text-[15px] font-medium hover:bg-current/10">{l}</Link>
                {href === '/shop' && <Mega cats={cats} shut={shut} onPick={() => { setShut(true); (document.activeElement as HTMLElement | null)?.blur(); }} />}
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/finder" className="hidden items-center gap-1.5 rounded-full border-2 border-indigo bg-lime px-3 py-1.5 text-sm font-bold text-indigo transition-transform duration-[350ms] ease-[var(--ease-stamp)] hover:-rotate-2 md:flex"><Sprout size={16} />{t('nav.help')}</Link>
            <LangToggle className="hidden rounded-full px-3 py-2 text-sm font-medium hover:bg-current/10 sm:block" />
            <button type="button" onClick={() => setSearch(true)} className="grid size-11 place-items-center rounded-full hover:bg-current/10" aria-label={t('nav.search')}><Search size={20} /></button>
            <button type="button" onClick={() => setOpen(true)} className="relative hidden size-11 place-items-center rounded-full hover:bg-current/10 md:grid" aria-label={`${t('nav.cart')} (${count})`}>
              <span data-cart-icon className="relative"><Pot count={count} size={26} />
                {count > 0 && <span className="num absolute -top-2 -right-2.5 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] font-bold text-paper">{count}</span>}
              </span>
            </button>
            <button type="button" onClick={() => setSheet(true)} className="grid size-11 place-items-center rounded-full hover:bg-current/10 lg:hidden" aria-label={t('nav.menu')}><Menu size={22} /></button>
          </div>
        </nav>
        {/* Vine underline: draws once on load */}
        <svg viewBox="0 0 1200 10" preserveAspectRatio="none" className={`absolute inset-x-0 -bottom-2 h-2.5 w-full transition-opacity ${overHero ? 'opacity-0' : ''}`} aria-hidden>
          <path pathLength={1} className="tree-draw" style={{ animationDuration: '1.4s' }} d="M0 5 Q 25 0 50 5 T 100 5 T 150 5 T 200 5 T 250 5 T 300 5 T 350 5 T 400 5 T 450 5 T 500 5 T 550 5 T 600 5 T 650 5 T 700 5 T 750 5 T 800 5 T 850 5 T 900 5 T 950 5 T 1000 5 T 1050 5 T 1100 5 T 1150 5 T 1200 5" fill="none" stroke="#2E9E5B" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </header>

      {search && <SearchPanel onClose={() => setSearch(false)} />}

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-indigo text-paper animate-[sheet-in_320ms_var(--ease-out-expo)] lg:hidden" role="dialog" aria-modal aria-label={t('nav.menu')}>
          <style>{`@keyframes sheet-in{from{transform:translateX(100%)}}`}</style>
          <div className="flex h-16 items-center justify-between px-4">
            <LangToggle className="rounded-full border border-mist/40 px-4 py-2 text-sm" />
            <button type="button" onClick={() => setSheet(false)} className="grid size-11 place-items-center" aria-label={t('nav.close')} autoFocus><X size={24} /></button>
          </div>
          <ul className="grid gap-1 px-4 pt-6">
            {links.map(([href, l], i) => (
              <li key={href} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
                <Link href={href} className="display block py-3 text-4xl">{l}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap gap-2 px-4 pb-10">
            <Link href="/finder" className="btn btn-dark mb-2 w-full"><Sprout size={18} />{t('nav.help')}</Link>
            {GOALS.map((g) => <Link key={g.slug} href={`/shop?goal=${g.slug}`} className="chip border-mist/30 bg-transparent text-chalk">{t(g.label)}</Link>)}
          </div>
        </div>
      )}

      {/* Bottom tab bar (mobile): Home, Shop, Verify, Cart, WhatsApp */}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-indigo bg-paper pb-safe md:hidden">
        <ul className="grid grid-cols-5 text-[11px] font-medium">
          {([['/', Home, t('nav.home')], ['/shop', LayoutGrid, t('nav.shop')], ['/verify', ShieldCheck, t('nav.verify')]] as const).map(([href, Icon, l]) => (
            <li key={href}><Link href={href} aria-current={path === href ? 'page' : undefined} className="flex flex-col items-center gap-0.5 py-2 text-indigo aria-[current=page]:font-bold"><span className={`rounded-full px-3 py-0.5 transition-colors ${path === href ? 'bg-lime' : ''}`}><Icon size={22} strokeWidth={1.75} /></span>{l}</Link></li>
          ))}
          <li><button type="button" onClick={() => setOpen(true)} className="flex w-full flex-col items-center gap-0.5 py-2">
            <span data-cart-icon className="relative"><Pot count={count} size={24} />
              {count > 0 && <span className="num absolute -top-1.5 -right-2.5 grid min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-paper">{count}</span>}
            </span>{t('nav.cart')}</button></li>
          <li><a href={`https://wa.me/91${phone}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-0.5 py-2"><WhatsApp size={22} />WhatsApp</a></li>
        </ul>
      </nav>
    </>
  );
}

// Desktop mega-menu: goals left, categories right. Opens on hover (120ms intent delay) or keyboard focus, never on a
// mouse-click focus: a clicked link keeps focus after navigating, which used to pin the menu open over the next page.
// Picking a link closes it at once (shut) until the pointer leaves.
function Mega({ cats, shut, onPick }: { cats: Cat[]; shut: boolean; onPick: () => void }) {
  const t = useT();
  return (
    <div onClick={(e) => (e.target as HTMLElement).closest('a') && onPick()}
      className={`invisible absolute top-full left-0 -translate-y-2 pt-3 opacity-0 transition-[opacity,translate,visibility] delay-[120ms] duration-[240ms] ${shut ? '' : 'group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-has-[:focus-visible]:visible group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:opacity-100'}`}>
      <div className="sticker grid w-[640px] grid-cols-[1fr_1.4fr] gap-8 rounded-[24px] bg-paper p-6 text-ink">
        <div>
          <p className="mb-3 text-sm text-ink-soft">{t('nav.goals')}</p>
          <ul className="grid gap-1">{GOALS.map((g) => <li key={g.slug}><Link href={`/shop?goal=${g.slug}`} className="display block py-1 text-xl hover:text-river">{t(g.label)}</Link></li>)}</ul>
        </div>
        <div>
          <p className="mb-3 text-sm text-ink-soft">{t('shop.category')}</p>
          <ul className="grid gap-1.5">{cats.map((c) => <li key={c.slug}><Link href={`/shop?category=${c.slug}`} className="block py-0.5 hover:text-river">{c.name}</Link></li>)}</ul>
        </div>
      </div>
    </div>
  );
}

// Instant search (STATES §7): focused → typing → loading (200ms debounce, ≥2 chars) → results | noResults | error.
function SearchPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'results' | 'none' | 'error'>('idle');
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => {
    if (q.trim().length < 2) { setState('idle'); return; }
    const ctl = new AbortController();
    const id = setTimeout(() => {
      setState('loading');
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json())
        .then((d) => { setHits(d.hits); setTotal(d.total); setSel(-1); setState(d.hits.length ? 'results' : 'none'); })
        .catch((e) => e.name !== 'AbortError' && setState('error'));
    }, 200);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q]);

  const go = (href: string) => { onClose(); router.push(href); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(-1, s - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); go(sel >= 0 ? `/p/${hits[sel].key}` : `/shop?q=${encodeURIComponent(q)}`); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-deep/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="mx-auto mt-0 max-w-2xl rounded-b-[28px] bg-chalk p-4 shadow-lift animate-[rise_240ms_var(--ease-out-expo)] md:mt-4 md:rounded-[28px]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label={t('nav.search')}>
        <div className="relative flex items-center gap-2">
          <Search size={20} className="absolute left-4 text-ink-soft" />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder={t('search.placeholder')} className="field pl-12 text-base"
            role="combobox" aria-expanded={state === 'results'} aria-controls="search-results" aria-activedescendant={sel >= 0 ? `hit-${sel}` : undefined} />
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center" aria-label={t('nav.close')}><X size={20} /></button>
        </div>
        <div className="mt-1 h-0.5 overflow-hidden">{state === 'loading' && <div className="skeleton h-full" />}</div>
        {state === 'idle' && (
          <div className="flex flex-wrap gap-2 p-2 pt-4">{GOALS.map((g) => <button type="button" key={g.slug} onClick={() => go(`/shop?goal=${g.slug}`)} className="chip">{t(g.label)}</button>)}</div>
        )}
        {state === 'results' && (
          <ul id="search-results" role="listbox" className="mt-2 grid gap-1">
            {hits.map((h, i) => (
              <li key={h.key} id={`hit-${i}`} role="option" aria-selected={sel === i}>
                <Link href={`/p/${h.key}`} onClick={onClose} className={`flex items-center gap-3 rounded-[12px] p-2 hover:bg-paper ${sel === i ? 'bg-paper' : ''}`}>
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-paper">{h.image && <Image src={h.image} alt="" width={48} height={48} className="size-full object-contain" />}</span>
                  <span className="line-clamp-1 flex-1">{h.name}</span><span className="num text-sm font-semibold">{inr0(h.price)}</span>
                </Link>
              </li>
            ))}
            <li><Link href={`/shop?q=${encodeURIComponent(q)}`} onClick={onClose} className="block p-3 text-center font-semibold text-river">{t('search.all')} ({total})</Link></li>
          </ul>
        )}
        {state === 'none' && <div className="grid justify-items-center gap-3 p-4 text-center"><p>{t('search.none', { q })}</p><Link href="/finder" onClick={onClose} className="btn btn-dark"><Sprout size={18} />{t('finder.empty')}</Link></div>}
        {state === 'error' && <p className="flex items-center justify-center gap-2 p-4">Search is offline. <button type="button" onClick={() => setQ(q + ' ')} className="font-semibold underline">Try again</button></p>}
        {state === 'loading' && !hits.length && <p className="grid place-items-center p-4"><Loader2 className="animate-spin text-mist" /></p>}
      </div>
    </div>
  );
}

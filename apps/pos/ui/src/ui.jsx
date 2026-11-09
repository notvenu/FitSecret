import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { inr } from '@fitsecret/shared';
import { payModes, modeName } from '@fitsecret/shared/reports';
import { shop } from './api.js';

export const cx = (...a) => a.filter(Boolean).join(' ');

const BTN = {
  primary: 'bg-ink text-white hover:bg-ink-2',
  brand: 'bg-brand text-ink hover:bg-ink hover:text-white font-semibold',
  ghost: 'hover:bg-black/5 text-ink',
  outline: 'border border-ink/20 bg-white hover:border-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};
export function Btn({ v = 'outline', className, size = 'md', ...p }) {
  return (
    <button
      type="button"
      {...p}
      className={cx('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-bold transition-[background,border,color,transform] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] active:scale-x-[1.06] active:scale-y-[.92] active:duration-100 disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4.5 py-2 text-sm', BTN[v], className)}
    />
  );
}

export function Field({ label, hint, className, children, ...p }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-black/60">{label}</span>
      {children || <input className="input" {...p} />}
      {hint && <span className="mt-1 block text-[11px] text-black/45">{hint}</span>}
    </label>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Keyboard: focus starts in the first field, Tab / Shift+Tab stay inside, Esc closes, Ctrl+Enter submits the form,
// and focus goes back to whatever opened it. Page shortcuts (useHotkeys) are paused while a dialog is open.
export function Modal({ title, onClose, children, wide, footer }) {
  const ref = useRef(), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const box = ref.current, back = document.activeElement;
    if (!box.contains(document.activeElement)) (box.querySelector('[data-body] :is(input, select, textarea)') || box.querySelector(FOCUSABLE))?.focus();
    const k = (e) => {
      if (!box.isConnected || box !== [...document.querySelectorAll('[role=dialog]')].at(-1)) return; // only the top dialog listens
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key === 'Enter' && e.ctrlKey) { const f = box.querySelector('form'); if (f) { e.preventDefault(); f.requestSubmit(); } }
      if (e.key === 'Tab') {
        const all = [...box.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!all.length) return;
        const i = all.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); all.at(-1).focus(); } else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0].focus(); }
      }
    };
    addEventListener('keydown', k);
    return () => { removeEventListener('keydown', k); if (back?.isConnected) back.focus(); };
  }, []);
  // Portalled to <body>: a transformed ancestor would trap a fixed overlay inside the page instead of covering the window.
  return createPortal(
    <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[6vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className={cx('rise card w-full shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <span className="flex items-center gap-2"><Kbd>Esc</Kbd><button className="rounded p-1 text-black/50 hover:bg-black/5" onClick={onClose} aria-label="Close">✕</button></span>
        </div>
        <div className="p-5" data-body>{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-black/8 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export const Kbd = ({ children, dark }) => <kbd className={cx('rounded border px-1 font-sans text-[10px] font-semibold leading-4', dark ? 'border-white/25 text-white/70' : 'border-black/15 bg-white text-black/55')}>{children}</kbd>;

// Clickable rows are keyboard rows too: ↑ ↓ move, Enter opens. Keys pressed on a button inside the row are left alone.
const rowKeys = (open) => (e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  const to = { ArrowDown: 'nextElementSibling', ArrowUp: 'previousElementSibling' }[e.key];
  if (to) { e.preventDefault(); e.currentTarget[to]?.focus(); }
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
// dates read the Indian way; codes without spaces (bill numbers, GSTINs, HSN) never break across lines
const cellText = (v) => (typeof v !== 'string' ? v : ISO.test(v) ? <span className="whitespace-nowrap">{fmtDate(v)}</span> : /^\S{6,}$/.test(v) ? <span className="whitespace-nowrap">{v}</span> : v);
// columns: [{ k, label, r: row => node, right: bool, w }]
export function Table({ rows, columns, onRow, empty = 'Nothing here yet', rowClass }) {
  if (!rows) return <Loading />;
  if (!rows.length) return <div className="py-16 text-center text-sm text-black/45">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/8 text-left text-[11px] uppercase tracking-wide text-black/50">
            {columns.map((c) => <th key={c.k || c.label} className={cx('px-3 py-2 font-medium', c.right && 'text-right')} style={{ width: c.w }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} onClick={onRow && (() => onRow(r))} tabIndex={onRow ? 0 : undefined} onKeyDown={onRow && rowKeys(() => onRow(r))}
              className={cx('border-b border-black/5 last:border-0', onRow && 'cursor-pointer hover:bg-brand/10', rowClass?.(r))}>
              {columns.map((c) => <td key={c.k || c.label} className={cx('px-3 py-2', c.right && 'text-right tabular-nums')}>{cellText(c.r ? c.r(r) : r[c.k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Payment mode <option>s: cash, UPI, card, bank, the shop's named bank accounts, and cheque where it applies.
export const ModeOptions = ({ cheque }) => [...payModes(shop), ...(cheque ? ['cheque'] : [])].map((m) => <option key={m} value={m}>{modeName(m, shop)}</option>);
export const Money = ({ v, className }) => <span className={cx('tabular-nums', className)}>{inr(v)}</span>;
export const Loading = () => <div className="py-16 text-center text-sm text-black/40">Loading…</div>;

const BADGE = { green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700', grey: 'bg-black/5 text-black/60', blue: 'bg-sky-100 text-sky-800', brand: 'bg-brand/40 text-ink' };
export const Badge = ({ c = 'grey', children }) => <span className={cx('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', BADGE[c])}>{children}</span>;
export const STATUS_C = { paid: 'green', partial: 'amber', unpaid: 'red', cancelled: 'grey', estimate: 'blue', open: 'blue', converted: 'green' };

// ← → move between tabs once one has focus.
export function Tabs({ tabs, value, onChange }) {
  const keys = (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = tabs.findIndex(([k]) => k === value), box = e.currentTarget;
    onChange(tabs[(i + d + tabs.length) % tabs.length][0]);
    requestAnimationFrame(() => box.querySelector('[aria-selected=true]')?.focus());
  };
  return (
    <div role="tablist" onKeyDown={keys} className="inline-flex flex-wrap rounded-full bg-black/5 p-0.5 text-sm">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} tabIndex={value === k ? 0 : -1} onClick={() => onChange(k)} className={cx('rounded-full px-3.5 py-1.5 transition-colors', value === k ? 'bg-ink font-medium text-white' : 'text-black/55 hover:text-ink')}>{label}</button>
      ))}
    </div>
  );
}

// top: something shown under the title on every page that has one (the Insights strip).
export function Page({ title, hint, actions, top, children }) {
  return (
    <div className="rise mx-auto max-w-7xl p-4 sm:p-5 lg:p-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="display text-3xl">{title}</h1>{hint && <p className="mt-1.5 max-w-2xl text-sm text-black/55">{hint}</p>}</div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {top}
      {children}
    </div>
  );
}

export function Toasts() {
  const [list, set] = useState([]);
  useEffect(() => {
    const on = (e) => {
      set((l) => [...l, e.detail]);
      setTimeout(() => set((l) => l.filter((t) => t.id !== e.detail.id)), e.detail.kind === 'err' ? 5000 : 2500);
    };
    addEventListener('fs-toast', on);
    return () => removeEventListener('fs-toast', on);
  }, []);
  return (
    <div className="no-print pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx('rise rounded-lg px-4 py-2.5 text-sm shadow-lg', t.kind === 'err' ? 'bg-red-600 text-white' : 'bg-ink text-white')}>{t.msg}</div>
      ))}
    </div>
  );
}

const typing = (el) => el?.closest?.('input, textarea, select, [contenteditable=true]');
export function useHotkeys(map) {
  useEffect(() => {
    const on = (e) => {
      if (e.defaultPrevented || document.querySelector('[role=dialog]')) return; // an open dialog owns the keyboard
      // 'F9', 'ctrl+Enter', 'ctrl+f', 'alt+s' (Vyapar's shortcuts are Alt + letter); plain keys like '/' or '?' never fire while typing
      const k = (e.ctrlKey ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.ctrlKey || e.altKey ? e.key.toLowerCase() : e.key);
      if (!e.ctrlKey && !e.altKey && e.key.length === 1 && typing(e.target)) return;
      if (map[k]) { e.preventDefault(); map[k](e); }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });
}

// Uncontrolled-form helper: const [f, set, bind] = useForm({...}); <input {...bind('name')} />
export function useForm(init) {
  const [f, setF] = useState(init);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const bind = (k, type) => type === 'checkbox'
    ? { type, checked: !!f[k], onChange: (e) => set(k, e.target.checked) }
    : { value: f[k] ?? '', onChange: (e) => set(k, e.target.value), ...(type && { type }) };
  return [f, set, bind, setF];
}

// Red "Delete" for the left of a form's footer. Asks first; `bin` says it can be restored from the Recycle Bin.
// The server refuses deletes that would break the books (a party who owes money, an account used in journals) and says why.
export function DeleteBtn({ what, onDelete, bin = true, label = 'Delete' }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!confirm(`Delete ${what}?${bin ? '\n\nYou can bring it back from Utilities → Recycle Bin.' : ''}`)) return;
    setBusy(true);
    try { await onDelete(); } finally { setBusy(false); }
  };
  return <Btn v="ghost" className="mr-auto text-red-600 hover:bg-red-50" onClick={go} disabled={busy}>{label}</Btn>;
}

// Section navigation for pages with many parts (Reports, Settings, Insights): same look and keys everywhere.
// groups: [{ label?, items: [{ key, label, desc?, badge?, words?, indent? }] }]. onChange(key, enter, query): enter = go into the section.
// indent: a sub-entry (sub-category). On phones the list becomes one dropdown.
// ↑ ↓ move between entries, Enter / → goes in; the find box (search) filters by label, description and `words`.
export function SideNav({ title, groups, value, onChange, search, placeholder = 'Find…', footer }) {
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((x) => words.every((w) => `${x.label} ${x.desc || ''} ${x.words || ''}`.toLowerCase().includes(w))) })).filter((g) => g.items.length);
  const flat = shown.flatMap((g) => g.items);
  // An entry listed twice (Favourites + its own group) is highlighted only where it was picked; first copy otherwise.
  const [picked, setPicked] = useState(null);
  const holds = (g) => g.items.some((x) => x.key === value);
  const activeGroup = (shown.find((g) => (g.label || '') === picked && holds(g)) || shown.find(holds))?.label || '';
  const pick = (g, k) => { setPicked(g.label || ''); onChange(k); };
  const focusKey = (k) => requestAnimationFrame(() => document.querySelector(`[data-nav="${k}"]`)?.focus());
  // ↑ ↓ follow the buttons on screen, not the keys: an entry can be listed twice (Reports → Favourites and its own group),
  // and looking it up by key sent focus back to the first copy every time.
  // Focus is put back by position after the list re-renders for the newly chosen entry (the old button may be gone by then).
  const list = useRef(), pending = useRef(null);
  useEffect(() => { if (pending.current != null) { list.current?.querySelectorAll('[data-nav]')[pending.current]?.focus(); pending.current = null; } });
  const step = (e, d) => {
    const all = [...e.currentTarget.querySelectorAll('[data-nav]')];
    if (!all.length) return;
    const i = all.indexOf(document.activeElement), from = i >= 0 ? i : all.findIndex((b) => b.dataset.nav === value), to = (from + d + all.length) % all.length;
    pending.current = to; all[to].focus(); setPicked(all[to].dataset.group); onChange(all[to].dataset.nav);
  };
  const keys = (e) => {
    const d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (d) { e.preventDefault(); step(e, d); }
    if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); onChange(value, true, q); }
  };
  return (
    <nav className="shrink-0 md:sticky md:top-0 md:max-h-[calc(100vh-5.5rem)] md:w-60 md:self-start md:overflow-y-auto md:pb-4 lg:w-64" aria-label={title}>
      {title && <h1 className="display mb-3 text-3xl md:mb-4">{title}</h1>}
      {/* phones: one dropdown instead of a long list above the content */}
      <select className="input mb-1 md:hidden" value={value} onChange={(e) => onChange(e.target.value)} aria-label={title || 'Section'}>
        {groups.map((g, gi) => <optgroup key={g.label || gi} label={g.label || title || ''}>{g.items.map((x) => <option key={g.label + x.key} value={x.key}>{x.indent ? '   ' : ''}{x.label}{x.badge != null ? ` (${x.badge})` : ''}</option>)}</optgroup>)}
      </select>
      <div className="hidden md:block">
      {search && <input className="input mb-3" placeholder={placeholder} value={q} aria-label={placeholder} autoFocus={search === 'focus'} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && flat[0]) { e.preventDefault(); onChange(flat[0].key, true, q); }
          if (e.key === 'ArrowDown' && flat[0]) { e.preventDefault(); onChange(flat[0].key); focusKey(flat[0].key); }
        }} />}
      <div onKeyDown={keys} ref={list}>
        {shown.map((g, gi) => (
          <div key={g.label || gi} className={cx('mb-2', gi > 0 && g.label && 'mt-3 border-t border-line pt-3')}>
            {/* a heading, not an entry: darker, bolder, with the brand mark, so groups like Favourites / Transaction report stand apart */}
            {g.label && <div className="mb-1.5 flex items-center gap-2 px-3.5 text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink">
              <span className="h-3.5 w-1 rounded-full bg-brand-d" aria-hidden />{g.label}</div>}
            <ul className="space-y-0.5">
              {g.items.map((x) => { const on = x.key === value && (g.label || '') === activeGroup; return (
                <li key={g.label + x.key}>
                  <button data-nav={x.key} data-group={g.label || ''} onClick={() => pick(g, x.key)} tabIndex={on ? 0 : -1} aria-current={on ? 'page' : undefined}
                    className={cx('flex w-full items-start gap-2 rounded-xl py-2 pr-3.5 text-left transition-colors', x.indent ? 'pl-7' : 'pl-3.5', on ? 'bg-ink text-white' : 'hover:bg-black/5')}>
                    <span className="min-w-0 flex-1">
                      {/* entries stay light so the group headings above them read as the main categories */}
                      {/* in a tree (categories → sub-categories) the parents are dark and bold, the children light with a guide line */}
                      <span className={cx('block text-sm', x.indent && '-ml-3 border-l-2 border-black/10 pl-3 text-[13px]',
                        !on && (!x.indent && g.items.some((y) => y.indent) ? 'font-semibold text-ink' : 'text-black/55'))}>{x.label}</span>
                      {x.desc && <span className={cx('block text-xs', on ? 'text-white/60' : 'text-black/50')}>{x.desc}</span>}
                    </span>
                    {x.badge != null && <span className={cx('mt-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums', on ? 'bg-white/20' : 'bg-black/5 text-black/60')}>{x.badge}</span>}
                  </button>
                </li>
              ); })}
            </ul>
          </div>
        ))}
        {!flat.length && <p className="px-3 py-2 text-sm text-black/45">Nothing matches “{q}”</p>}
      </div>
      {footer}
      </div>
    </nav>
  );
}
// Page with a SideNav on the left and the chosen section on the right.
export const SidePage = ({ nav, children, wide }) => (
  <div className={cx('rise mx-auto flex flex-col gap-5 p-4 sm:p-5 md:flex-row lg:p-7', wide ? 'max-w-[1500px]' : 'max-w-7xl')}>{nav}<div className="min-w-0 flex-1">{children}</div></div>
);
// Every page with sub-sections: the side list on the left (page name on top), and the chosen section's title, hint and actions on the right.
export function SectionPage({ nav, title, hint, actions, top, children, wide = true }) {
  return (
    <SidePage nav={nav} wide={wide}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h2 className="display text-2xl">{title}</h2>{hint && <p className="mt-1 max-w-2xl text-sm text-black/55">{hint}</p>}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {top}
      {children}
    </SidePage>
  );
}

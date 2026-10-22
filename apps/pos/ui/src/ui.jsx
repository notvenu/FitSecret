import { useEffect, useState } from 'react';
import { inr } from '@fitsecret/shared';

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
      className={cx('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-[background,border,color,transform] active:scale-[.97] disabled:pointer-events-none disabled:opacity-40',
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

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[6vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('rise card w-full shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button className="rounded p-1 text-black/50 hover:bg-black/5" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-black/8 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

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
            <tr key={r.id || i} onClick={onRow && (() => onRow(r))} className={cx('border-b border-black/5 last:border-0', onRow && 'cursor-pointer hover:bg-brand/10', rowClass?.(r))}>
              {columns.map((c) => <td key={c.k || c.label} className={cx('px-3 py-2', c.right && 'text-right tabular-nums')}>{c.r ? c.r(r) : r[c.k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Money = ({ v, className }) => <span className={cx('tabular-nums', className)}>{inr(v)}</span>;
export const Loading = () => <div className="py-16 text-center text-sm text-black/40">Loading…</div>;

const BADGE = { green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700', grey: 'bg-black/5 text-black/60', blue: 'bg-sky-100 text-sky-800', brand: 'bg-brand/40 text-ink' };
export const Badge = ({ c = 'grey', children }) => <span className={cx('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', BADGE[c])}>{children}</span>;
export const STATUS_C = { paid: 'green', partial: 'amber', unpaid: 'red', cancelled: 'grey', estimate: 'blue', open: 'blue', converted: 'green' };

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex rounded-full bg-black/5 p-0.5 text-sm">
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)} className={cx('rounded-full px-3.5 py-1.5 transition-colors', value === k ? 'bg-ink font-medium text-white' : 'text-black/55 hover:text-ink')}>{label}</button>
      ))}
    </div>
  );
}

export function Page({ title, actions, children }) {
  return (
    <div className="rise mx-auto max-w-7xl p-5 lg:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl">{title}</h1>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
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

export function useHotkeys(map) {
  useEffect(() => {
    const on = (e) => {
      // 'F9', 'ctrl+Enter', 'ctrl+f', 'alt+s' (Vyapar's shortcuts are Alt + letter)
      const k = (e.ctrlKey ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.ctrlKey || e.altKey ? e.key.toLowerCase() : e.key);
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

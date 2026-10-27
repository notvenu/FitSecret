'use client';
import { inr } from '@fitsecret/shared';
import type { CartLine } from './cart';
import { useCart } from './cart';

export type ComboDeal = { id: string; name: string; price: number; value: number; channel?: string; lines: (Omit<CartLine, 'qty'> & { qty: number })[] };
const rupees = (n: number) => inr(n).replace('.00', '');

// Combos that include this product. "Add combo" puts every item in the cart; the combo price is applied at checkout (and again by the server).
export default function ComboDeals({ deals }: { deals: ComboDeal[] }) {
  const { add } = useCart();
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {deals.map((d) => {
        const out = d.lines.some((l) => l.stock < l.qty);
        return (
          <div key={d.id} className="rounded-[var(--radius-card)] border border-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-brand-deep">Combo · save {rupees(d.value - d.price)}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${d.channel === 'counter' ? 'bg-ink text-white' : d.channel === 'online' ? 'border border-ink/25' : 'bg-brand text-ink'}`}>
                {d.channel === 'counter' ? 'In store only' : d.channel === 'online' ? 'Online only' : 'In store & online'}</span>
            </div>
            <h3 className="mt-1 text-xl font-semibold">{d.name}</h3>
            <ul className="mt-3 space-y-1 text-sm text-ink-soft">
              {d.lines.map((l) => <li key={l.id}>{l.qty > 1 ? `${l.qty} × ` : ''}{l.name}{l.variant ? ` (${l.variant})` : ''}</li>)}
            </ul>
            <div className="mt-4 flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-bold tabular-nums">{rupees(d.price)}</span>
              <span className="text-mute line-through tabular-nums">{rupees(d.value)}</span>
              {d.channel === 'counter' ? <span className="ml-auto text-sm font-medium text-mute">Ask for it at the MG Road counter</span> : <button type="button" disabled={out} onClick={() => d.lines.forEach((l, i) => add(l, l.qty, i === d.lines.length - 1))} className="btn-ink ml-auto px-5 py-2.5">
                {out ? 'Out of stock' : 'Add combo'}
              </button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

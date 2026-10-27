import Link from 'next/link';
import { ArrowUpRight, Storefront, Globe } from '@phosphor-icons/react/dist/ssr';
import { inr } from '@fitsecret/shared';
import type { Banner, PublicCoupon } from '@fitsecret/shared/store';
import { offerText, whereOf } from '@/lib/store';
import CopyCode from './CopyCode';
import { Reveal } from './Motion';
import AisleSign from './AisleSign';

const rupees = (n: number) => inr(n).replace('.00', '');
const date = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export type BoardCombo = { id: string; name: string; price: number; value: number; items: string[]; href: string; channel?: string };

// Where an offer works, the same badge on posters, coupons and combos.
export function WhereBadge({ c, dark = false }: { c?: string | null; dark?: boolean }) {
  const w = whereOf(c);
  const store = c !== 'online', web = c !== 'counter';
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${dark ? 'bg-white/15 text-white' : c === 'counter' ? 'bg-ink text-white' : c === 'online' ? 'border border-ink/25 bg-white text-ink' : 'bg-brand text-ink'}`}>
      {store && <Storefront size={13} weight="bold" />}{web && <Globe size={13} weight="bold" />}{w.short}
    </span>
  );
}

// The offers board by the entrance: banners as posters, public coupons as tear-off tickets, combos as bundle cards.
// Every offer says where it can be redeemed. Managed in the POS: Offers (coupons, combos) and Online Store → Banners.
export default function OffersBoard({ banners, coupons, combos }: { banners: Banner[]; coupons: PublicCoupon[]; combos: BoardCombo[] }) {
  if (!banners.length && !coupons.length && !combos.length) return null;
  return (
    <section id="offers" className="mx-auto mt-20 max-w-7xl scroll-mt-28 px-4 md:mt-28 md:px-6">
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <AisleSign label="Offers board" title="On offer this week" />
        </div>
        <p className="flex max-w-sm flex-wrap items-center gap-2 text-sm text-mute">Each offer says where it works:
          <span className="inline-flex items-center gap-1 font-semibold text-ink"><Storefront size={15} weight="bold" /> at the store</span>,
          <span className="inline-flex items-center gap-1 font-semibold text-ink"><Globe size={15} weight="bold" /> online</span> or both.</p>
      </Reveal>

      <div className="notice-board mt-6 p-4 md:p-7">
        {banners.length > 0 && (
          <div className={`grid gap-5 md:gap-7 ${banners.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {banners.map((b, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <Link href={b.link || '/shop'} className="poster group block" style={{ ['--tilt' as string]: `${i % 2 ? 0.8 : -0.8}deg` }}>
                  <span aria-hidden className="tape" />
                  <span className="relative isolate flex min-h-56 flex-col justify-end overflow-hidden rounded-[6px] bg-ink p-6 text-white md:min-h-64 md:p-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {b.image && <img src={b.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-55 transition-transform duration-700 group-hover:scale-[1.04]" />}
                    {b.where && <span className="absolute left-5 top-5"><WhereBadge c={b.where} /></span>}
                    <span className="display text-[clamp(1.8rem,3.6vw,3rem)] leading-none">{b.title}</span>
                    {b.subtitle && <span className="mt-2 max-w-md text-white/80">{b.subtitle}</span>}
                    {b.where && <span className="mt-2 text-xs text-white/60">{whereOf(b.where).how.replace(/the code/i, 'this offer').replace('this code', 'this offer')}</span>}
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">Shop now <ArrowUpRight size={16} weight="bold" /></span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        )}

        {coupons.length > 0 && (
          <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${banners.length ? 'mt-7' : ''}`}>
            {coupons.map((c, i) => (
              <Reveal as="li" key={c.code} delay={i * 0.05}>
                <div className="ticket flex h-full">
                  <div className="flex min-w-0 flex-1 flex-col p-5">
                    <WhereBadge c={c.channel} />
                    <p className="display mt-3 text-3xl leading-none">{c.kind === 'percent' ? `${Number(c.value)}% off` : `${rupees(Number(c.value))} off`}</p>
                    <p className="mt-1.5 text-sm text-ink-soft">{offerText(c).replace(/^[^ ]+ off ?/, '') || 'On your order'}{c.note ? ` · ${c.note}` : ''}</p>
                    <p className="mt-auto pt-3 text-xs leading-snug text-mute">{whereOf(c.channel).how}{c.ends ? ` · till ${date(c.ends)}` : ''}</p>
                  </div>
                  <div className="ticket-stub flex w-28 shrink-0 flex-col items-center justify-center gap-2 p-3 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/60">Code</span>
                    <b className="break-all font-mono text-base tracking-wider">{c.code}</b>
                    <CopyCode code={c.code} />
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        )}

        {combos.length > 0 && (
          <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${banners.length || coupons.length ? 'mt-7' : ''}`}>
            {combos.map((c, i) => (
              <Reveal as="li" key={c.id} delay={i * 0.05}>
                <Link href={c.href} className="bundle group flex h-full flex-col p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-brand-deep">Combo · save {rupees(c.value - c.price)}</span>
                    <WhereBadge c={c.channel} />
                  </div>
                  <h3 className="mt-2 text-xl font-semibold leading-tight">{c.name}</h3>
                  <p className="mt-1.5 text-sm text-ink-soft">{c.items.join(' + ')}</p>
                  <div className="mt-auto flex items-baseline gap-2 pt-4">
                    <span className="text-2xl font-bold tabular-nums">{rupees(c.price)}</span>
                    <s className="text-sm text-mute tabular-nums">{rupees(c.value)}</s>
                    <ArrowUpRight size={18} className="ml-auto transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-2 text-xs text-mute">{c.channel === 'counter' ? 'Ask for it at the MG Road counter' : c.channel === 'online' ? 'Applied in your cart online' : 'At the counter, or applied in your cart online'}</p>
                </Link>
              </Reveal>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

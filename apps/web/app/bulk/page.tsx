import type { Metadata } from 'next';
import Link from 'next/link';
import { inr } from '@fitsecret/shared';
import { STORE } from '@fitsecret/shared/seed';
import { getProducts } from '@/lib/catalog';
import { Pulse } from '@/components/Hero';
import EnquiryForm from '../contact/EnquiryForm';

export const metadata: Metadata = { title: 'Bulk & gym orders', description: 'Lower prices on supplements bought in quantity, and own rates for gyms, trainers and resellers who buy from Fit Secrets regularly.' };
export const revalidate = 60;

const rupees = (n: number) => inr(n).replace('.00', '');

export default async function Bulk() {
  // every variant with a bulk price, cheapest saving first
  const offers = (await getProducts()).flatMap((p) => p.variants.filter((v) => v.bulkPrice && v.bulkMin && v.bulkPrice < v.price).map((v) => ({ p, v })))
    .sort((a, b) => (b.v.price - b.v.bulkPrice!) / b.v.price - (a.v.price - a.v.bulkPrice!) / a.v.price);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-14 md:px-6 md:pt-20">
      <h1 className="display text-[clamp(3rem,8vw,7rem)]">
        Bulk <span className="relative inline-block">orders<Pulse className="absolute -bottom-[0.1em] left-0 h-[0.14em] w-full" /></span>
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-mute">Stocking a gym, a supplement counter or your whole team? Buy in quantity and the price per unit drops on its own, right in the cart.</p>

      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {[
          ['Bulk price, automatically', 'Products below show a bulk price. Add that many to your cart and every unit is charged at it. Up to 100 of each item online.'],
          ['Your own rates as a regular buyer', 'Gyms, trainers and resellers who buy often get their own prices. We set them up in-store against your email; sign in under My orders with that email and they apply everywhere on the site.'],
          ['Bigger than that?', 'Need more than 100 of something, a product we don’t list, or a standing monthly order? Send an enquiry and we’ll quote you.'],
        ].map(([t, d], i) => (
          <li key={t} className="rounded-[var(--radius-card)] bg-surface p-6">
            <span className="display text-3xl text-brand-deep">0{i + 1}</span>
            <h2 className="mt-3 text-lg font-semibold">{t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">{d}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-mute">Regular buyer already? <Link href="/account" className="font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4">Sign in to see your prices</Link></p>

      <section className="mt-16">
        <h2 className="display text-4xl">Bulk prices</h2>
        {!offers.length ? <p className="mt-4 text-mute">No bulk prices listed right now. Send an enquiry below and we’ll quote you.</p> : (
          <div className="mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-line">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-mute">
                <th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Bulk price</th><th className="px-4 py-3 text-right font-medium">From</th><th className="px-4 py-3" />
              </tr></thead>
              <tbody>{offers.map(({ p, v }) => (
                <tr key={v.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3"><Link href={`/p/${p.key}?v=${v.id}`} className="font-semibold hover:underline">{p.name}</Link>
                    <div className="text-xs text-mute">{[v.size, v.flavour].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-4 py-3 text-right tabular-nums text-mute">{rupees(v.price)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{rupees(v.bulkPrice!)} <span className="text-xs font-semibold text-brand-deep">−{Math.round(((v.price - v.bulkPrice!) / v.price) * 100)}%</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{v.bulkMin} units</td>
                  <td className="px-4 py-3 text-right">{v.stock >= v.bulkMin! ? <Link href={`/p/${p.key}?v=${v.id}`} className="text-sm font-semibold underline decoration-brand decoration-2 underline-offset-4">Buy</Link> : <span className="text-xs text-mute">Ask us</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-16 grid gap-10 rounded-[var(--radius-card)] bg-surface p-6 md:grid-cols-[1fr_1.2fr] md:p-10">
        <div>
          <h2 className="display text-4xl">Get a bulk quote</h2>
          <p className="mt-3 text-mute">Tell us what you need and roughly how much each month. For regular buyers we set up your own rates in-store, linked to your email, so you can order online any time at those prices.</p>
          <p className="mt-6 text-sm text-mute">Or call <a href={`tel:+91${STORE.phone}`} className="font-semibold text-ink">{STORE.phone}</a>.</p>
        </div>
        <EnquiryForm phone={STORE.phone} topic="Bulk or gym order" placeholder="e.g. 20 × ON Gold Standard Whey 2lb Double Rich Chocolate every month for our gym" />
      </section>
    </div>
  );
}

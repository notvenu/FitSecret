import type { Metadata } from 'next';
import Link from 'next/link';
import { Dumbbell, Stethoscope, Store, Receipt } from 'lucide-react';
import WholesaleForm from './WholesaleForm';
import { getProducts } from '@/lib/catalog';
import { getT } from '@/lib/lang';
import { PHONE } from '@/lib/site';

export const metadata: Metadata = { title: 'Wholesale', description: 'Wholesale supplements, Ayurvedic and organic products for gyms, clinics and retailers in Andhra Pradesh. GST invoices.' };

export default async function Wholesale() {
  const [products, t] = await Promise.all([getProducts(), getT()]);
  const tiers = products.flatMap((p) => p.variants.filter((v) => v.bulkPrice && v.bulkMin && v.bulkPrice < v.price).map((v) => ({ p, v }))).slice(0, 8);
  return (
    <div className="page-top mx-auto max-w-[1360px] px-4 pb-24 md:px-8">
      <div className="grid gap-12 md:grid-cols-12">
        <div className="md:col-span-6">
          <h1 className="display-l">{t('wholesale.title')}</h1>
          <p className="story mt-4 text-ink-soft">{t('wholesale.sub')}</p>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {([[Dumbbell, 'Gyms', 'Protein, creatine and pre-workout for your counter'], [Stethoscope, 'Clinics', 'Ayurvedic churnams and wellness for your patients'],
              [Store, 'Retailers', 'Stock our own label and leading brands'], [Receipt, 'GST invoices', 'Every order billed properly for your books']] as const).map(([Icon, h, d]) => (
              <li key={h} className="rounded-[20px] bg-paper p-5"><Icon size={28} strokeWidth={1.5} className="text-river" /><p className="mt-3 font-semibold">{h}</p><p className="text-sm text-ink-soft">{d}</p></li>
            ))}
          </ul>
          {tiers.length > 0 && (
            <section className="mt-12">
              <h2 className="h3">Already on the price list</h2>
              <p className="mt-1 text-sm text-ink-soft">These drop in price on their own in the cart once you reach the quantity.</p>
              <ul className="mt-4 divide-y divide-line rounded-[20px] bg-paper px-5">
                {tiers.map(({ p, v }) => (
                  <li key={v.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <Link href={`/p/${p.key}?v=${v.id}`} className="line-clamp-1 hover:underline">{p.name}{v.size && ` · ${v.size}`}</Link>
                    <span className="num shrink-0">{v.bulkMin}+ at <b>₹{v.bulkPrice}</b> <s className="text-ink-soft">₹{v.price}</s></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="md:col-span-5 md:col-start-8"><WholesaleForm phone={PHONE} /></div>
      </div>
    </div>
  );
}

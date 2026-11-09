import type { Metadata } from 'next';
import Link from 'next/link';
import BrandWall from '@/components/BrandWall';
import { getBrands } from '@/lib/catalog';
import { getT } from '@/lib/lang';

export const metadata: Metadata = {
  title: 'Brands',
  description: 'Every supplement, Ayurveda and health-food brand at Fit Secrets, Vijayawada: MuscleBlaze, Optimum Nutrition, Kapiva and more, bought from the brand or its authorised distributor.',
  alternates: { canonical: '/brands' },
};

// All brands: an A–Z jump list on top (quick for someone who knows the name), then every brand as a card, biggest first.
export default async function Brands() {
  const [brands, t] = await Promise.all([getBrands(), getT()]);
  const az = [...brands].sort((a, b) => a.name.localeCompare(b.name));
  const letters = [...new Set(az.map((b) => b.name[0].toUpperCase()))];
  return (
    <div className="page-top">
      <header className="mx-auto max-w-[1360px] px-4 md:px-8">
        <h1 className="h2 text-indigo">{t('brands.title')}</h1>
        <p className="mt-2 max-w-xl text-ink-soft">{t('brands.sub')}</p>
        <nav aria-label="A to Z" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {letters.map((l) => (
            <span key={l} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <b className="text-indigo">{l}</b>
              {az.filter((b) => b.name[0].toUpperCase() === l).map((b) => (
                <Link key={b.name} href={`/shop?brand=${encodeURIComponent(b.name)}`} className="text-ink-soft hover:text-ink hover:underline">{b.name}</Link>
              ))}
            </span>
          ))}
        </nav>
      </header>
      <div className="mt-10"><BrandWall brands={brands} t={t} /></div>
    </div>
  );
}

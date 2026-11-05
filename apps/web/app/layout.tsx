import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Syne, Hanken_Grotesk, Noto_Sans_Telugu } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/components/cart';
import CartDrawer from '@/components/CartDrawer';
import Nav from '@/components/Nav';
import { LangProvider } from '@/components/Lang';
import { STORE, PHONE, FSSAI } from '@/lib/site';
import { getCategories } from '@/lib/catalog';
import { getStore, onlineCombos } from '@/lib/store';
import { getLang } from '@/lib/lang';
import { translator } from '@/lib/i18n';
import { GOALS } from '@/lib/goals';

const syne = Syne({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-syne', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });
const telugu = Noto_Sans_Telugu({ subsets: ['telugu'], variable: '--font-telugu', display: 'swap', preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'Fit Secrets | Supplements, Ayurveda & Organic Store in Vijayawada', template: '%s | Fit Secrets' },
  description: 'Genuine nutritional supplements, Ayurvedic and organic products, honey, ghee, millets and cold-pressed oils. Visit us on MG Road, Labbipet, Vijayawada, or order online and on WhatsApp.',
  openGraph: { type: 'website', siteName: 'Fit Secrets', locale: 'en_IN' },
};
export const viewport: Viewport = { themeColor: '#17237A', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cats, { coupons, combos, ...store }, lang] = await Promise.all([getCategories(), getStore(), getLang()]);
  const t = translator(lang);
  const webCode = coupons.find((c) => c.channel !== 'counter');
  const note = !store.open ? 'Online orders are paused right now. Visit or call the store.' : store.announcement || (webCode ? `Use code ${webCode.code} at checkout` : '');
  const ld = {
    '@context': 'https://schema.org', '@type': 'HealthAndBeautyBusiness', name: 'Fit Secrets Genuine Store', telephone: `+91${PHONE}`, email: STORE.email,
    address: { '@type': 'PostalAddress', streetAddress: STORE.address, addressLocality: 'Vijayawada', postalCode: '520010', addressRegion: 'Andhra Pradesh', addressCountry: 'IN' },
    sameAs: [STORE.instagram, STORE.facebook], url: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  };

  return (
    <html lang={lang} suppressHydrationWarning className={`${syne.variable} ${hanken.variable} ${telugu.variable}`} style={{ '--nav-h': note ? '104px' : '72px' } as React.CSSProperties}>
      <body className="pb-16 md:pb-0">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
        {/* Second visit in a session gets the fast tree growth (globals.css :root[data-seen]) */}
        <script dangerouslySetInnerHTML={{ __html: `try{sessionStorage.fsSeen?document.documentElement.dataset.seen='1':sessionStorage.fsSeen='1'}catch(e){}` }} />
        <Vine />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-full focus:bg-haldi focus:px-4 focus:py-2 focus:text-deep">Skip to content</a>
        <LangProvider lang={lang}>
          <CartProvider store={store} combos={onlineCombos(combos)}>
            <Nav cats={cats.map(({ name, slug }) => ({ name, slug }))} phone={PHONE} note={note} />
            <main id="main" className="min-h-[60dvh]">{children}</main>
            <CartDrawer phone={PHONE} />
            <footer className="relative bg-river text-chalk">
              <svg viewBox="0 0 240 24" preserveAspectRatio="none" className="absolute inset-x-0 -top-[22px] h-6 w-full text-river" aria-hidden>
                <path d="M0 24 V14 C20 4 40 4 60 14 S100 24 120 14 S160 4 180 14 S220 24 240 14 V24Z" fill="currentColor" />
              </svg>
              <div className="mx-auto grid max-w-[1360px] gap-10 px-4 py-16 md:grid-cols-12 md:px-8">
                <div className="md:col-span-4">
                  <p className="display text-3xl">Fit Secrets</p>
                  <p className="mt-3 max-w-xs text-mist">{t('foot.tagline')}</p>
                  {FSSAI && <p className="mt-6 text-sm text-mist">FSSAI Lic. No. <span className="num text-chalk">{FSSAI}</span></p>}
                </div>
                <FootCol title={t('nav.shop')} links={cats.slice(0, 8).map((c) => [`/shop?category=${c.slug}`, c.name])} />
                <FootCol title={t('nav.goals')} links={GOALS.map((g) => [`/shop?goal=${g.slug}`, t(g.label)])} />
                <FootCol title="Help" links={[['/track', t('nav.track')], ['/verify', t('nav.verify')], ['/wholesale', t('nav.wholesale')], ['/visit', t('nav.visit')], ['/terms', 'Terms'], ['/privacy', 'Privacy']]} />
                <div className="text-sm md:col-span-2">
                  <h2 className="mb-4 font-semibold">{t('visit.title')}</h2>
                  <address className="leading-relaxed text-mist not-italic">{STORE.address}</address>
                  <p className="mt-3 grid gap-1"><a href={`tel:+91${PHONE}`} className="hover:text-marigold">+91 {PHONE}</a><a href={`mailto:${STORE.email}`} className="break-all hover:text-marigold">{STORE.email}</a></p>
                </div>
              </div>
              <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 border-t border-mist/20 px-4 py-6 text-xs text-mist md:px-8">
                <span>© {new Date().getFullYear()} Fit Secrets Genuine Store, Vijayawada. {t('foot.disclaimer')}</span>
                <span className="flex gap-4"><a href={STORE.instagram} target="_blank" rel="noreferrer" className="hover:text-chalk">Instagram</a><a href={STORE.facebook} target="_blank" rel="noreferrer" className="hover:text-chalk">Facebook</a></span>
              </div>
            </footer>
          </CartProvider>
        </LangProvider>
      </body>
    </html>
  );
}

function FootCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="text-sm md:col-span-2">
      <h2 className="mb-4 font-semibold">{title}</h2>
      <ul className="grid gap-2.5 text-mist">{links.map(([h, l]) => <li key={h}><Link href={h} className="hover:text-marigold">{l}</Link></li>)}</ul>
    </div>
  );
}

// Vine scroll progress (effect #9) down the left edge. CSS scroll-driven, desktop only.
function Vine() {
  return (
    <svg className="vine-progress pointer-events-none fixed top-0 left-2 z-30 hidden h-dvh w-6 xl:block" viewBox="0 0 24 1000" preserveAspectRatio="none" aria-hidden>
      <path pathLength={1} d="M12 0 C 2 60, 22 120, 12 180 S 2 300, 12 360 S 22 480, 12 540 S 2 660, 12 720 S 22 840, 12 900 S 8 980, 12 1000" fill="none" stroke="#2E9E5B" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

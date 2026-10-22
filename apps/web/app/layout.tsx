import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import './globals.css';
import { CartProvider } from '@/components/cart';
import Header, { Logo } from '@/components/Header';
import { STORE } from '@fitsecret/shared/seed';
import { getCategories } from '@/lib/catalog';
import { getStore } from '@/lib/store';

const clash = localFont({
  variable: '--font-clash',
  src: [
    { path: './fonts/ClashDisplay-500.woff2', weight: '500' },
    { path: './fonts/ClashDisplay-600.woff2', weight: '600' },
    { path: './fonts/ClashDisplay-700.woff2', weight: '700' },
  ],
});
const satoshi = localFont({
  variable: '--font-satoshi',
  src: [
    { path: './fonts/Satoshi-400.woff2', weight: '400' },
    { path: './fonts/Satoshi-500.woff2', weight: '500' },
    { path: './fonts/Satoshi-700.woff2', weight: '700' },
    { path: './fonts/Satoshi-900.woff2', weight: '900' },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'Fit Secrets | Nutritional Supplements & Organic Wellness in Vijayawada', template: '%s | Fit Secrets' },
  description: 'Authentic nutritional supplements, dry fruits and millets, Ayurvedic and organic products, natural honey and ghee, cold pressed oils and more. Visit us on MG Road, Vijayawada or order online.',
  openGraph: { type: 'website', siteName: 'Fit Secrets', locale: 'en_IN' },
};
export const viewport: Viewport = { themeColor: '#ffffff' };

const COLS: [string, [string, string][]][] = [
  ['Shop', [['/shop?category=nutritional-supplements', 'Nutritional supplements'], ['/shop?category=dry-fruits-and-millets', 'Dry fruits & millets'],
    ['/shop?category=organic-products', 'Organic products'], ['/shop?category=ayurvedic-products', 'Ayurvedic'], ['/shop', 'All products']]],
  ['Help', [['/about', 'About us'], ['/contact', 'Contact us'], ['/track', 'Track your order'], ['/account', 'My orders'], [`https://wa.me/91${STORE.phone}`, 'WhatsApp us'], [STORE.instagram, 'Instagram'], [STORE.facebook, 'Facebook']]],
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [allCats, { coupons, ...store }] = await Promise.all([getCategories(), getStore()]);
  const cats = allCats.map(({ name, slug, subs }) => ({ name, slug, subs: subs.map(({ name, slug }) => ({ name, slug })) }));
  const note = !store.open ? 'Online orders are paused right now. Visit or call the store.' : store.announcement
    || (coupons[0] ? `Use code ${coupons[0].code} at checkout` : '');
  return (
    <html lang="en" className={`${clash.variable} ${satoshi.variable}`}>
      <body>
        <CartProvider store={store}>
          {note && <div className="bg-ink px-4 py-2 text-center text-sm font-medium text-white">{note}</div>}
          <Header cats={cats} />
          <main className="min-h-[60dvh]">{children}</main>
          <footer className="mt-28 border-t border-line">
            <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-[1.5fr_1fr_1fr_1.2fr] md:px-6">
              <div>
                <Logo className="h-14" />
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-mute">{STORE.tagline}. Supplements and organic wellness in Vijayawada.</p>
              </div>
              {COLS.map(([h, links]) => (
                <div key={h} className="text-sm">
                  <h3 className="mb-4 font-semibold">{h}</h3>
                  <ul className="space-y-2.5 text-mute">{links.map(([href, l]) => <li key={href}>{href.startsWith('http') ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-ink">{l}</a> : <Link href={href} className="hover:text-ink">{l}</Link>}</li>)}</ul>
                </div>
              ))}
              <div className="text-sm">
                <h3 className="mb-4 font-semibold">Store</h3>
                <address className="not-italic leading-relaxed text-mute">{STORE.address}<br /><a href={`tel:+91${STORE.phone}`} className="hover:text-ink">{STORE.phone}</a><br /><a href={`mailto:${STORE.email}`} className="hover:text-ink">{STORE.email}</a></address>
              </div>
            </div>
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-5 text-xs text-mute md:px-6">
              <span>© {new Date().getFullYear()} Fit Secrets. Supplements are not a substitute for a varied diet.</span>
              <span className="flex gap-5"><Link href="/terms" className="hover:text-ink">Terms &amp; Conditions</Link><Link href="/privacy" className="hover:text-ink">Privacy Policy</Link></span>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}

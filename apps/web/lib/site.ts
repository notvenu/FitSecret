import { STORE } from '@fitsecret/shared/seed';
import { SHOP_AT } from './settings';

// Public address of the site for canonical links, sitemap and robots. On Vercel the production domain is the fallback,
// so a deploy without NEXT_PUBLIC_SITE_URL never tells Google the site lives on localhost.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || 'http://localhost:3000').replace(/\/$/, '');
export const PHONE = process.env.NEXT_PUBLIC_STORE_PHONE?.replace(/^91/, '') || STORE.phone;
// Shown in the footer and trust row only once set. Never shown as a placeholder.
export const FSSAI = process.env.NEXT_PUBLIC_FSSAI_NO || '';
export const MAP = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SHOP_AT)}`;
export { HOURS, REVIEW_URL, PICKUP, SAME_DAY, SHOP_AT } from './settings';
export { STORE };

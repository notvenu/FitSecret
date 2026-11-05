import { STORE } from '@fitsecret/shared/seed';

export const PHONE = process.env.NEXT_PUBLIC_STORE_PHONE?.replace(/^91/, '') || STORE.phone;
// Shown in the footer and trust row only once set. Never shown as a placeholder.
export const FSSAI = process.env.NEXT_PUBLIC_FSSAI_NO || '';
export const MAP = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Fit Secrets, Datta Towers, MG Road, Labbipet, Vijayawada')}`;
// ponytail: hours are not in the POS yet; set them here once the owner confirms.
export const HOURS = process.env.NEXT_PUBLIC_STORE_HOURS || '';
export { STORE };

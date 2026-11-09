// Settings safe to import from client components (no catalogue import, unlike site.ts).
export const SHOP_AT = 'Fit Secrets, Datta Towers, MG Road, Labbipet, Vijayawada';
// ponytail: hours are not in the POS yet; set them here once the owner confirms.
export const HOURS = process.env.NEXT_PUBLIC_STORE_HOURS || '';
// Google Business Profile "write a review" link (Profile → Ask for reviews). Shown after an order is delivered.
export const REVIEW_URL = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL || '';
// Store pickup at checkout (on unless NEXT_PUBLIC_PICKUP=off) and same-day local delivery before a cutoff hour (IST, 0 = off).
// ponytail: env settings like HOURS; move into Online Store → Store settings when the owner wants to change them without a deploy.
export const PICKUP = process.env.NEXT_PUBLIC_PICKUP !== 'off';
export const SAME_DAY = {
  cutoff: Number(process.env.NEXT_PUBLIC_SAME_DAY_CUTOFF ?? 18) || 0,
  prefixes: (process.env.NEXT_PUBLIC_SAME_DAY_PINCODES ?? '520').split(',').map((s) => s.trim()).filter(Boolean),
};

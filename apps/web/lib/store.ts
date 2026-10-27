import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { STORE_DEFAULTS, type StoreSettings, type PublicCoupon } from '@fitsecret/shared/store';
import type { Combo } from '@fitsecret/shared/offers';
import { live } from './catalog';

export type Store = StoreSettings & { coupons: PublicCoupon[]; combos: Combo[] };

// Store settings, banners, public coupons and live combos, edited in the POS under Online Store. Demo mode = defaults.
export async function getStore(): Promise<Store> {
  if (!live) return { ...STORE_DEFAULTS, coupons: [], combos: [] };
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const [{ data, error }, combos] = await Promise.all([sb.rpc('store_info'), sb.from('shop_combos').select('*')]);
  const combo = ((combos.data as Combo[] | null) || []).map((c) => ({ ...c, price: Number(c.price) })); // empty before migration 0008
  if (error || !data) return { ...STORE_DEFAULTS, coupons: [], combos: combo }; // site keeps working on older databases (before 0004)
  const n = (v: unknown, d: number) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
  return {
    ...STORE_DEFAULTS, ...data,
    shipping_fee: n(data.shipping_fee, STORE_DEFAULTS.shipping_fee), free_shipping_above: n(data.free_shipping_above, STORE_DEFAULTS.free_shipping_above),
    cod_limit: n(data.cod_limit, STORE_DEFAULTS.cod_limit), min_order: n(data.min_order, 0),
    banners: Array.isArray(data.banners) ? data.banners.filter((b: { title?: string }) => b?.title) : [], coupons: data.coupons || [], combos: combo,
  };
}

// Where an offer can be used, said the same way on every offer the website shows.
export const WHERE = {
  both: { short: 'In store & online', how: 'Show the code at the MG Road counter, or enter it at checkout' },
  counter: { short: 'In store only', how: 'Show this code at the MG Road counter. Not valid online' },
  online: { short: 'Online only', how: 'Enter the code at checkout. Not valid in store' },
} as const;
export const whereOf = (c?: string | null) => WHERE[(c === 'counter' || c === 'online' ? c : 'both') as keyof typeof WHERE];
// Combos the website cart can apply (counter-only ones are shown, not applied).
export const onlineCombos = <T extends { channel?: string }>(cs: T[]) => cs.filter((c) => c.channel !== 'counter');

export const offerText = (c: PublicCoupon) =>
  `${c.kind === 'percent' ? `${Number(c.value)}% off` : `₹${Number(c.value)} off`}${c.max_discount ? ` up to ₹${Number(c.max_discount)}` : ''}${c.min_order ? ` on ₹${Number(c.min_order)}+` : ''}`;

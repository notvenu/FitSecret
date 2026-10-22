import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { STORE_DEFAULTS, type StoreSettings, type PublicCoupon } from '@fitsecret/shared/store';
import { live } from './catalog';

export type Store = StoreSettings & { coupons: PublicCoupon[] };

// Store settings, banners and public coupons, edited in the POS under Online Store. Demo mode = defaults.
export async function getStore(): Promise<Store> {
  if (!live) return { ...STORE_DEFAULTS, coupons: [] };
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('store_info');
  if (error || !data) return { ...STORE_DEFAULTS, coupons: [] }; // site keeps working on older databases (before 0004)
  const n = (v: unknown, d: number) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
  return {
    ...STORE_DEFAULTS, ...data,
    shipping_fee: n(data.shipping_fee, STORE_DEFAULTS.shipping_fee), free_shipping_above: n(data.free_shipping_above, STORE_DEFAULTS.free_shipping_above),
    cod_limit: n(data.cod_limit, STORE_DEFAULTS.cod_limit), min_order: n(data.min_order, 0),
    banners: Array.isArray(data.banners) ? data.banners.filter((b: { title?: string }) => b?.title) : [], coupons: data.coupons || [],
  };
}

export const offerText = (c: PublicCoupon) =>
  `${c.kind === 'percent' ? `${Number(c.value)}% off` : `₹${Number(c.value)} off`}${c.max_discount ? ` up to ₹${Number(c.max_discount)}` : ''}${c.min_order ? ` on ₹${Number(c.min_order)}+` : ''}`;

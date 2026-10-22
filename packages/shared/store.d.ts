export type Banner = { title: string; subtitle?: string; image?: string; link?: string };
export type StoreSettings = {
  open: boolean; shipping_fee: number; free_shipping_above: number; cod_enabled: boolean; cod_limit: number; min_order: number;
  announcement: string; banners: Banner[];
};
export type PublicCoupon = { code: string; kind: 'percent' | 'flat'; value: number; min_order: number | null; max_discount: number | null; ends: string | null; note: string | null };
export const STORE_DEFAULTS: StoreSettings;
export function orderTotals(subtotal: number, discount: number, store: StoreSettings): { net: number; shipping: number; total: number };
export function couponError(msg: string): string | null;

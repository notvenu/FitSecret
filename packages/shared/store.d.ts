// where: where the offer on the banner can be used (blank = not an offer)
export type Banner = { title: string; subtitle?: string; image?: string; link?: string; where?: '' | 'both' | 'counter' | 'online' };
export type StoreSettings = {
  open: boolean; shipping_fee: number; free_shipping_above: number; cod_enabled: boolean; cod_limit: number; min_order: number;
  announcement: string; banners: Banner[];
};
export type PublicCoupon = { code: string; kind: 'percent' | 'flat'; value: number; min_order: number | null; max_discount: number | null; ends: string | null; note: string | null; channel?: 'both' | 'counter' | 'online' };
export const STORE_DEFAULTS: StoreSettings;
export type Buyer = { name?: string; price_discount: number | null; rates: Record<string, number> | null };
export function unitPrice(item: { id: string; sale_price: number; wholesale_price?: number | null; wholesale_min_qty?: number | null }, qty: number, buyer?: Buyer | null): number;
export function orderTotals(subtotal: number, discount: number, store: StoreSettings): { net: number; shipping: number; total: number };
export function couponError(msg: string): string | null;
export function counterCoupon(code: string, coupons: any[], subtotal: number, today: string): number;

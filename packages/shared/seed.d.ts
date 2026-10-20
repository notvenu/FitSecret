export interface SeedItem {
  id: string; name: string; slug: string; group_key: string; sku: string; barcode: string | null; brand: string; category_id: string;
  flavour: string; size: string; unit: string; hsn: string; gst_rate: number; mrp: number; sale_price: number; purchase_price: number | null;
  low_stock: number; online: boolean; featured: boolean; goals: string[]; description: string; image: string | null;
}
export const SEED_ITEMS: SeedItem[];
export const SEED_CATEGORIES: { id: string; name: string; slug: string; sort: number; image: string | null; parent_id: string | null }[];
export const SEED_BRANCH: Record<string, string | boolean>;
export const STORE: { name: string; tagline: string; phone: string; email: string; address: string; instagram: string; facebook: string };
export function uuidFrom(s: string): string;

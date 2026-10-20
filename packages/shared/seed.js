// Real Fit Secrets catalogue (imported from fitsecretsstore.com by scripts/import-catalog.mjs), shaped into synced-table rows.
// Used to seed a fresh POS and as the storefront's fallback when Supabase isn't configured.
import { CATEGORIES, PRODUCTS } from './catalog.js';

// Deterministic UUID from a string, so POS seed and web fallback agree on ids.
export function uuidFrom(s) {
  let hex = '';
  for (let k = 0; hex.length < 32; k++) {
    let h = 2166136261 ^ k;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    hex += (h >>> 0).toString(16).padStart(8, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const STORE = {
  name: 'Fit Secrets', tagline: 'Reveal your true strength', phone: '9704108079', email: 'krishfitsecrets@gmail.com',
  address: '38-8-7, Ground Floor, Datta Towers, Kirtilals Jewellers Complex, beside Subhamasthu Shopping Mall, opp. All India Radio, MG Road, Vijayawada',
  instagram: 'https://www.instagram.com/fit_secrets_store', facebook: 'https://www.facebook.com/profile.php?id=61586219130962',
};

export const SEED_BRANCH = {
  id: uuidFrom('branch:VJA'), code: 'VJA', name: 'Fit Secrets Vijayawada', address: STORE.address, phone: STORE.phone, gstin: '', state_code: '37', is_online: true,
};

export const SEED_CATEGORIES = CATEGORIES.map((c) => ({
  id: uuidFrom('cat:' + c.slug), name: c.name, slug: c.slug, sort: c.sort, image: c.image, parent_id: c.parent ? uuidFrom('cat:' + c.parent) : null,
}));

export const SEED_ITEMS = PRODUCTS.map((p) => ({
  id: uuidFrom('item:' + p.slug), name: p.name, slug: p.slug, group_key: p.group_key, sku: 'FS' + p.topiko_id + (p.size ? '-' + p.size.replace(/\W/g, '') : ''),
  barcode: null, brand: p.brand, category_id: uuidFrom('cat:' + p.category), flavour: '', size: p.size, unit: 'pcs', hsn: p.hsn, gst_rate: p.gst_rate,
  mrp: p.mrp, sale_price: p.sale_price, purchase_price: null, low_stock: 2, online: true, featured: p.featured, goals: [], description: p.description, image: p.image,
}));

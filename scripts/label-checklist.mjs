// Which products still need label facts (packages/shared/product-info.js), as a CSV to print or open in Excel.
//   node scripts/label-checklist.mjs > labels/checklist.csv
// Photograph the back label of each one and save it in labels/ named by the key, e.g. labels/on-creatine-unflavoured-250g.jpg
// (several photos: -1.jpg, -2.jpg). Columns: what is already on the site, so a product with how-to-use only still gets its nutrition photo.
import { SEED_ITEMS, SEED_CATEGORIES } from '../packages/shared/seed.js';
import { INFO } from '../packages/shared/product-info.js';
import { readdirSync } from 'node:fs';

const photos = new Set(readdirSync(new URL('../labels/', import.meta.url)).map((f) => f.replace(/(-\d+)?\.(jpe?g|png|webp|heic)$/i, '')));
const cat = Object.fromEntries(SEED_CATEGORIES.map((c) => [c.id, c.name]));
const seen = new Set();
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
console.log('key,product,brand,shelf,how to use,nutrition,ingredients,photo taken');
for (const i of SEED_ITEMS) {
  const k = i.group_key || i.slug || i.id;
  if (seen.has(k)) continue;
  seen.add(k);
  const f = INFO[k] || {};
  if (f.serving && f.nutrition && f.ingredients) continue; // complete
  console.log([k, i.name, i.brand, cat[i.category_id], f.serving ? 'yes' : '', f.nutrition ? 'yes' : '', f.ingredients ? 'yes' : '', photos.has(k) ? 'yes' : ''].map(q).join(','));
}

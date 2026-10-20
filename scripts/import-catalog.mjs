// Pulls the live Fit Secrets catalogue (fitsecretsstore.com, Topiko) into packages/shared/catalog.js.
// Run: node scripts/import-catalog.mjs   (re-run whenever products are added on the old site)
import { writeFileSync } from 'node:fs';

const API = 'https://fitsecretsstore.com/api';
const SUB = 'subdomain=fitsecretsstore';
const unescape = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

// Category clean-up: the old site has a duplicate "Dry Fruits & Millets".
const CATS = [
  ['nutritional-supplements', 'Nutritional Supplements', 18, '2106'],
  ['dry-fruits-and-millets', 'Dry Fruits & Millets', 5, '0813'],
  ['organic-products', 'Organic Products', 5, '2106'],
  ['ayurvedic-products', 'Ayurvedic Products', 12, '3004'],
  ['natural-honey-ghee', 'Natural Honey & Ghee', 5, '0409'],
  ['cold-pressed-oils', 'Cold Pressed Oils', 5, '1515'],
  ['diet-diabetic-rice', 'Diet & Diabetic Rice', 5, '1006'],
  ['beauty-and-cosmetics', 'Beauty & Cosmetics', 18, '3304'],
];
const CAT_ALIAS = { 'dry-fruits-amp-millets': 'dry-fruits-and-millets', 'diet-diabetic-rice-2': 'diet-diabetic-rice' };

// Subcategories by product name. First matching rule wins, so order matters (e.g. "protein bar" before "protein").
const SUBS = {
  'nutritional-supplements': [
    ['peanut-butter', 'Peanut Butter & Spreads', /peanut butter|almond butter|\bspread|nutella|biscoff/],
    // flavour words like "chocolate" appear in powders too, so powders/oats are excluded first
    ['protein-bars-snacks', 'Protein Bars & Snacks', /^(?!.*(whey|isolate|gainer|\bmass\b|\biso|isogen|50\/50|antium|hybrid fuel|oats|muesli)).*(\bbars?\b|wafer|cookie|chips|kunafa|chocolate|lindt|cadbury|bournville|makhana|nuts & seeds|double cocoa|cranberry raisin|panchmeva)/],
    ['oats-breakfast', 'Oats & Breakfast', /\boats?\b|muesli|granola|pancake/],
    ['pre-workout', 'Pre-Workout', /pre[- ]?workout|\bc4\b|pump|wrathx|ghost|the shadow|hooligan|enigma|katana|out ?rage|dynamite|nitra|citrulline|arginine|ignitor|volcano|explode|caffeine|jolt|yeah buddy|war hammer|black python|black spider|freak|race horse|lipo|kutsi|korean secret|christopher/],
    ['creatine', 'Creatine', /creatine/],
    ['amino-acids', 'BCAA, EAA & Hydration', /bcaa|\beaa|amino|glutamine|electrolyte|hydration|refuel/],
    ['mass-gainers', 'Mass & Weight Gainers', /gainer|\bmass\b|mass ?tech|massive|weight gain|beast|body fuel|50\/50|anabolic mass/],
    ['testosterone', 'Testosterone & Performance', /\btest|testo|tongkat|long jack|tribulus/],
    ['vitamins-wellness', 'Vitamins & Wellness', /vitamin|multi|omega|fish ?oil|biotin|collagen|magnes|magnis|zinc|zma|calcium|milk thistle|ashwagandha|shilajit|probiotic|progut|\bgut\b|vitadapt|optimen|glucosamine|liver|\bd3\b|b12|\biron\b|tablet|caps\b|capsule|softgel|joint|apple cider|b-complex|melts|turmeric|curcum|fiber|female fit|pain relief/],
    ['fat-burners', 'Fat Burners & L-Carnitine', /carn|car?anitine|\bcla\b|fat ?burn|burner|hydroxycut|\blean\b|keto|thermo|\bcut\b|clear muscle|v[- ]?shape/],
    ['whey-protein', 'Whey & Protein Powders', /whey|isolate|\biso|isopure|isogen|hydro|casein|protein|egg|nitro ?tech|beef|plant|antium|hybrid fuel|ultimate nutrition|phabulous/],
    ['more-supplements', 'More Supplements', /./],
  ],
  'dry-fruits-and-millets': [
    ['laddus-snacks', 'Laddus, Chikki & Snacks', /laddu|chikki|makhana|mom meal|jelly|bubblegum|pachak|snack|tutti|mix\b|trail|date bites|panchmeva/],
    ['seeds', 'Seeds', /seed|sabja|chia|flax|halim|mahabeera/],
    ['nuts', 'Nuts', /almond|badam|cashew|kaju|pista|walnut|hazel|macadamia|pecan|brazil|pine|\bnuts?\b|peanut|mamra/],
    ['dried-fruits', 'Dried Fruits & Berries', /raisin|kismis|anjeer|\bfig|dates|karjura|khajur|apricot|kubhani|berr|kiwi|mango|papaya|pineapple|peach|plum|albakara|amla|guava|guvva|strawberry|goji|ginger|katora|prune|dry fruit|dried|rose petal/],
    ['millets-grains', 'Millets, Rice & Grains', /millet|rice|biyyam|ragi|jowar|bajra|beans|grain/],
    ['more-dry-fruits', 'More Dry Fruits', /./],
  ],
  'organic-products': [
    ['tea-coffee', 'Tea & Coffee', /\btea\b|chai|coffee/],
    ['ayurvedic-wellness', 'Ayurvedic Wellness', /kapiva|himalaya|shilajit|ashwagandha|triphala|gokshura|tulasi|tulsi|ksm|ayur|juice|detox|joint|fat burner|rose petal/],
    ['millets-flours', 'Millets, Oats & Flours', /millet|wheat|\boat|granola|muesli|flour|arrow|nutri mix|multigrain|grain/],
    ['organic-essentials', 'Organic Essentials', /./],
  ],
};
// Display order for subcategories (matching order above is only for classification).
const SUB_ORDER = ['whey-protein', 'mass-gainers', 'pre-workout', 'creatine', 'amino-acids', 'vitamins-wellness', 'fat-burners', 'testosterone',
  'peanut-butter', 'oats-breakfast', 'protein-bars-snacks', 'more-supplements', 'nuts', 'dried-fruits', 'seeds', 'laddus-snacks', 'millets-grains',
  'more-dry-fruits', 'ayurvedic-wellness', 'tea-coffee', 'millets-flours', 'organic-essentials'];
const subOf = (cat, name) => SUBS[cat]?.find(([, , re]) => re.test(name.toLowerCase()));

// Brand detection by name prefix (lowercase). Longest prefixes first.
const BRANDS = Object.entries({
  'optimum nutrition': 'Optimum Nutrition', 'on ': 'Optimum Nutrition', 'muscle blaze': 'MuscleBlaze', 'muscleblaze': 'MuscleBlaze', 'mb ': 'MuscleBlaze',
  'muscle tech': 'MuscleTech', 'muscletech': 'MuscleTech', 'american muscles': 'American Muscles', 'pintola': 'Pintola', 'max protein': 'RiteBite Max Protein',
  'ritebite': 'RiteBite Max Protein', 'rite bite': 'RiteBite Max Protein', 'pure nutrition': 'Pure Nutrition', 'sacred beast': 'Sacred Beast', 'wbn': 'Wellbeing Nutrition',
  'wellbeing nutrition': 'Wellbeing Nutrition', 'wellcore': 'Wellcore', 'wellx': 'Wellx', 'one science': 'One Science', 'max n': 'MaxN', 'maxn': 'MaxN',
  'my fitness': 'MyFitness', 'hk vitals': 'HK Vitals', 'big muscles': 'Big Muscles', 'big muscle': 'Big Muscles', 'hyper nation': 'Hyper Nation',
  'kevin levrone': 'Kevin Levrone', 'animal nutrition': 'Animal', 'kratoz': 'Kratoz', 'dr. morepen': 'Dr. Morepen', 'dr morepen': 'Dr. Morepen',
  'apollon': 'Apollon', 'doctor choice': 'Doctor Choice', 'disano': 'Disano', 'kapiva': 'Kapiva', 'alpino': 'Alpino', 'tong garden': 'Tong Garden',
  'super you': 'SuperYou', 'superyou': 'SuperYou', 'avvatar': 'Avvatar', 'olympia': 'Olympia', 'dynamite': 'Dynamite', 'isopure': 'Isopure', 'labrada': 'Labrada',
  'dymatize': 'Dymatize', 'c4 ': 'C4', 'ghost': 'Ghost', 'nutrex': 'Nutrex', 'synful': 'Synful', 'primeval labs': 'Primeval Labs', 'galvanize': 'Galvanize',
  'trunative': 'Trunative', 'muscle science': 'Muscle Science', 'muscle garage': 'Muscle Garage', 'mysha': 'Mysha Nutrition', 'millet bank': 'Millet Bank',
  'milletbank': 'Millet Bank', 'nirvie': 'Nirvie', 'himalaya': 'Himalaya', 'farmley': 'Farmley', 'the whole truth': 'The Whole Truth', 'whole truth': 'The Whole Truth',
  'truebasics': 'TrueBasics', 'girnar': 'Girnar', 'lindt': 'Lindt', 'cadbury': 'Cadbury', 'nutella': 'Nutella', 'health ninja': 'Health Ninja', 'atom ': 'Atom',
  'gxn': 'GXN', 'nitra': 'Nitra', 'body by k': 'Body by K', 'mom meal': 'Mom Meal', 'mom dry': 'Mom Meal', 'prabhakar': 'Prabhakar', 'lotus': 'Lotus Biscoff',
}).sort((a, b) => b[0].length - a[0].length);
const brandOf = (name) => BRANDS.find(([p]) => (name.toLowerCase() + ' ').startsWith(p))?.[1] || '';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const get = async (path) => {
  const r = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}${SUB}`);
  const j = await r.json();
  if (!j.status) throw new Error(`${path}: ${j.message}`);
  return j.data;
};

const [cats, products] = await Promise.all([get('categories'), get('products')]);
const catImage = {};
for (const c of cats) catImage[CAT_ALIAS[c.slug] || c.slug] ??= c.image;

const items = [], used = new Set();
// Old site has some products listed twice under the same name; keep both but give them unique slugs.
const uniq = (slug, id) => { const s = used.has(slug) ? `${slug}-${id}` : slug; used.add(s); return s; };
for (const p of products) {
  const cat = CAT_ALIAS[p.category_slug] || p.category_slug || 'organic-products';
  const [, , gst, hsn] = CATS.find(([s]) => s === cat) || CATS[2];
  const name = unescape(p.name);
  const mrp = Math.max(Number(p.price) || 0, Number(p.sale_price) || 0);
  const sale = Number(p.sale_price) || mrp;
  const sub = subOf(cat, name);
  const base = {
    topiko_id: p.id, name, brand: brandOf(name), category: sub ? sub[0] : cat, mrp, sale_price: sale,
    gst_rate: Number(p.gst_percent) || gst, hsn, description: unescape(p.description).replace(/<[^>]+>/g, ''),
    image: p.image || null, featured: !!p.is_featured, in_stock: p.in_stock !== false,
  };
  const values = p.has_variants ? p.variant_groups.flatMap((g) => g.values) : [null];
  const group = uniq(slugify(name), p.id);
  for (const v of values) {
    items.push({ ...base, slug: v ? uniq(`${group}-${slugify(v.value)}`, v.id) : group, group_key: group, size: v ? unescape(v.display_value || v.value) : '',
      ...(v?.discount_price ? { sale_price: Number(v.discount_price) } : {}), ...(v?.mrp ? { mrp: Number(v.mrp) } : {}) });
  }
}

const out = `// GENERATED by scripts/import-catalog.mjs from fitsecretsstore.com on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.
// GST/HSN are category defaults (the old site has none set). Verify with your CA.
// Top-level categories first, then their subcategories (parent = top-level slug).
export const CATEGORIES = ${JSON.stringify([
  ...CATS.map(([slug, name, gst, hsn], sort) => ({ slug, name, parent: null, gst, hsn, sort, image: catImage[slug] || null })),
  ...Object.entries(SUBS).flatMap(([parent, list]) => list.filter(([slug]) => items.some((i) => i.category === slug))
    .map(([slug, name]) => ({ slug, name, parent, sort: SUB_ORDER.indexOf(slug), image: null }))
    .sort((x, y) => x.sort - y.sort)),
], null, 1)};
export const PRODUCTS = ${JSON.stringify(items)};
`;
writeFileSync(new URL('../packages/shared/catalog.js', import.meta.url), out);
const subCounts = {};
for (const i of items) subCounts[i.category] = (subCounts[i.category] || 0) + 1;
console.log(Object.entries(subCounts).map(([k, n]) => `${k} ${n}`).join(', '));
const brands = {};
for (const i of items) if (i.brand) brands[i.brand] = (brands[i.brand] || 0) + 1;
console.log(`${items.length} items, ${Object.keys(brands).length} brands, ${items.filter((i) => !i.brand).length} unbranded`);
console.log(Object.entries(brands).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(', '));

// Products and variants: one product (group_key) with variants that differ by size / weight and flavour.
// Used by Items (new item → "add as a variant", Find variants) and by the website for the product name.
// ponytail: a word list, not a model. Unknown flavours stay in the name; the owner confirms every grouping before it's saved.
export const SIZE = /\b\d+(?:\.\d+)?\s*(?:kg|kgs|g|gm|gms|grams?|lbs?|ml|l|ltrs?|litres?|caps(?:ules)?|tabs|tablets|servings|sachets|pcs|s)\b/gi;
const FLAVOUR = new Set(`chocolate choco choc vanilla strawberry mango banana coffee mocha caramel cookies cookie cream creme ice icecream rich double
  dark white milk malai kesar badam pista rabdi kulfi butterscotch orange lemon lime watermelon berry berries blueberry raspberry mixed mix fruit fruits
  tropical tango punch cola peach apple grape pineapple guava litchi lychee cherry unflavoured unflavored flavour flavor flavoured flavored natural
  original classic crunchy crispy smooth silky creamy salted honey jaggery cinnamon saffron rose mint masala tokai blue blast fudge brownie hazelnut
  almond coconut chikki biscuit cake birthday cafe latte frappe gourmet`.split(/\s+/).filter(Boolean));
const NOISE = new Set(['flavour', 'flavor', 'flavoured', 'flavored', 'with', 'and', 'of', 'the']);

const tokens = (s) => String(s || '').toLowerCase().replace(SIZE, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !/^\d+$/.test(w));
const title = (ws) => ws.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// "ON Gold Standard whey Chocolate Flavour 2.27kg" → { base: ['on','gold','standard','whey'], size: '2.27kg', flavour: 'Chocolate' }
export function parseVariant(name) {
  const ws = tokens(name), size = (String(name || '').match(SIZE) || [])[0]?.replace(/\s+/g, '') || '';
  const flav = ws.filter((w) => FLAVOUR.has(w) && !NOISE.has(w));
  return { base: ws.filter((w) => !FLAVOUR.has(w) && !NOISE.has(w)), size, flavour: title(flav) };
}

// The product's own name, without the variant's size and flavour: "ON Gold Standard whey".
export function productName(name, size, flavour) {
  let n = String(name || '');
  for (const p of [size, flavour].filter(Boolean)) n = n.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  n = n.replace(SIZE, ' ').replace(/\b(flavou?r(ed)?)\b/gi, ' ').replace(/\(\s*\)/g, ' ');
  const kept = n.split(/\s+/).filter((w) => w && !FLAVOUR.has(w.toLowerCase().replace(/[^a-z]/g, '')));
  return kept.join(' ').replace(/\s{2,}/g, ' ').trim() || String(name || '').trim();
}

// Existing items that look like variants of one product but aren't grouped yet. Same brand words + product words (any order), and
// they must differ by size or flavour. Returns [{ key, name, items: [{ id, name, size, flavour }] }], biggest groups first.
export function findVariantGroups(items) {
  const g = new Map();
  for (const i of items) {
    const v = parseVariant(i.name);
    if (v.base.length < 2) continue;
    const k = [...new Set(v.base)].sort().join(' ');
    (g.get(k) || g.set(k, []).get(k)).push({ id: i.id, name: i.name, group_key: i.group_key, size: i.size || v.size, flavour: i.flavour || v.flavour });
  }
  return [...g].map(([k, list]) => ({ key: k.replace(/\s+/g, '-'), name: productName(list.reduce((a, b) => (a.name.length <= b.name.length ? a : b)).name), items: list }))
    // two or more items, not all in one product already, and differing by size or flavour
    .filter((x) => x.items.length > 1 && new Set(x.items.map((i) => i.group_key || i.id)).size > 1 && new Set(x.items.map((i) => `${i.size}|${i.flavour}`)).size > 1)
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

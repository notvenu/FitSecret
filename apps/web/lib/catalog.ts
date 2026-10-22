import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SEED_ITEMS, SEED_CATEGORIES } from '@fitsecret/shared/seed';

export type Variant = {
  id: string; name: string; slug: string; flavour: string; size: string; mrp: number; price: number; stock: number; image: string | null;
};
export type Product = {
  key: string; name: string; brand: string; category: string; categorySlug: string; sub: string; subSlug: string; goals: string[]; description: string;
  featured: boolean; variants: Variant[]; price: number; mrp: number; inStock: boolean; image: string | null;
};
export type Category = { name: string; slug: string; count: number; image: string | null; subs: { name: string; slug: string; count: number }[] };
export type Brand = { name: string; count: number; image: string | null };

type Row = {
  id: string; name: string; slug: string; group_key: string | null; brand: string | null; category_slug: string | null; category_name: string | null;
  parent_slug: string | null; parent_name: string | null;
  flavour: string | null; size: string | null; mrp: number | null; sale_price: number; featured: boolean | null; goals: string[] | null;
  description: string | null; image: string | null; stock: number;
};

export const live = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// Category images and order come from the categories table (POS: Online Store → Categories); seed values fill gaps.
type CatMeta = { slug: string; image: string | null; sort: number | null };
async function catMeta(): Promise<Map<string, { image: string | null; rank: number }>> {
  let rows: CatMeta[] = SEED_CATEGORIES;
  if (live) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await sb.from('categories').select('slug, image, sort').eq('deleted', false);
    if (data?.length) rows = data as CatMeta[];
  }
  const seed = new Map(SEED_CATEGORIES.map((c, i) => [c.slug, { image: c.image as string | null, i }]));
  return new Map(rows.map((c) => [c.slug, { image: c.image || seed.get(c.slug)?.image || null, rank: (c.sort ?? 999) * 1000 + (seed.get(c.slug)?.i ?? 999) }]));
}

async function rows(): Promise<Row[]> {
  if (!live) {
    // Demo mode: the real imported catalogue with nominal stock, so the site is browsable before Supabase is connected.
    const cats = Object.fromEntries(SEED_CATEGORIES.map((c) => [c.id, c]));
    return SEED_ITEMS.map((i) => {
      const c = cats[i.category_id], parent = c.parent_id ? cats[c.parent_id] : null;
      return { ...i, category_slug: c.slug, category_name: c.name, parent_slug: parent?.slug ?? null, parent_name: parent?.name ?? null, stock: 10 };
    });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.from('shop_items').select('*').limit(5000);
  if (error) throw new Error('Catalogue unavailable: ' + error.message);
  return data as Row[];
}

export async function getProducts(): Promise<Product[]> {
  const groups = new Map<string, Row[]>();
  for (const r of await rows()) {
    const k = r.group_key || r.slug || r.id;
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const variants = rs.map((r) => ({
      id: r.id, name: r.name, slug: r.slug, flavour: r.flavour || '', size: r.size || '', mrp: Number(r.mrp || r.sale_price),
      price: Number(r.sale_price), stock: Number(r.stock), image: r.image,
    })).sort((a, b) => a.price - b.price);
    const first = rs[0];
    const cheapest = variants.find((v) => v.stock > 0) || variants[0];
    return {
      key, name: first.name.replace(/\s{2,}/g, ' ').trim(), brand: first.brand || '',
      // items point at a subcategory when one exists; products expose top-level + sub separately
      category: first.parent_name || first.category_name || 'Wellness', categorySlug: first.parent_slug || first.category_slug || 'organic-products',
      sub: first.parent_slug ? first.category_name || '' : '', subSlug: first.parent_slug ? first.category_slug || '' : '',
      goals: first.goals || [], description: first.description || '',
      featured: rs.some((r) => r.featured), variants, price: cheapest.price, mrp: cheapest.mrp, inStock: variants.some((v) => v.stock > 0),
      image: variants.find((v) => v.image)?.image || null,
    };
  });
}

export async function getProduct(key: string) {
  return (await getProducts()).find((p) => p.key === key) || null;
}

export async function getCategories(): Promise<Category[]> {
  const counts = new Map<string, Category>();
  const [products, meta] = await Promise.all([getProducts(), catMeta()]);
  for (const p of products) {
    const c = counts.get(p.categorySlug) || { name: p.category, slug: p.categorySlug, count: 0, image: meta.get(p.categorySlug)?.image || p.image, subs: [] };
    c.count++;
    if (p.subSlug) {
      const s = c.subs.find((x) => x.slug === p.subSlug) || (c.subs.push({ name: p.sub, slug: p.subSlug, count: 0 }), c.subs.at(-1)!);
      s.count++;
    }
    counts.set(p.categorySlug, c);
  }
  const order = (slug: string) => meta.get(slug)?.rank ?? 1e9;
  for (const c of counts.values()) c.subs.sort((a, b) => order(a.slug) - order(b.slug));
  return [...counts.values()].sort((a, b) => order(a.slug) - order(b.slug));
}

export async function getBrands(): Promise<Brand[]> {
  const m = new Map<string, Brand>();
  for (const p of await getProducts()) {
    if (!p.brand) continue;
    const b = m.get(p.brand) || { name: p.brand, count: 0, image: null };
    b.count++;
    b.image ||= p.image;
    m.set(p.brand, b);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export const discount = (mrp: number, price: number) => (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);

export type Review = { id: string; name: string; rating: number; title: string | null; body: string | null; reply: string | null; verified: boolean; created_at: string };

// Approved reviews for a product (all its variants). Moderated in the POS: Online Store → Inbox.
export async function getReviews(key: string): Promise<Review[]> {
  if (!live) return [];
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.from('shop_reviews').select('id, name, rating, title, body, reply, verified, created_at').eq('product_key', key).order('created_at', { ascending: false }).limit(50);
  return (data as Review[]) || []; // empty on databases without 0005
}

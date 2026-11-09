import type { MetadataRoute } from 'next';
import { getProducts, getCategories, getBrands } from '@/lib/catalog';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic'; // built per request, so builds don't need the database

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const [products, cats, brands] = await Promise.all([getProducts(), getCategories(), getBrands()]);
  return [
    ...['', '/shop', '/brands', '/verify', '/wholesale', '/visit', '/terms', '/privacy'].map((p) => ({ url: base + p })),
    ...cats.flatMap((c) => [c.slug, ...c.subs.map((s) => s.slug)]).map((s) => ({ url: `${base}/shop?category=${s}` })),
    ...brands.map((b) => ({ url: `${base}/shop?brand=${encodeURIComponent(b.name)}` })),
    ...products.map((p) => ({ url: `${base}/p/${encodeURIComponent(p.key)}` })),
  ];
}

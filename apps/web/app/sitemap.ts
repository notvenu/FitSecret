import type { MetadataRoute } from 'next';
import { getProducts, getCategories } from '@/lib/catalog';

export const dynamic = 'force-dynamic'; // built per request, so builds don't need the database

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const [products, cats] = await Promise.all([getProducts(), getCategories()]);
  return [
    ...['', '/shop', '/verify', '/wholesale', '/visit', '/terms', '/privacy'].map((p) => ({ url: base + p })),
    ...cats.flatMap((c) => [c.slug, ...c.subs.map((s) => s.slug)]).map((s) => ({ url: `${base}/shop?category=${s}` })),
    ...products.map((p) => ({ url: `${base}/p/${encodeURIComponent(p.key)}` })),
  ];
}

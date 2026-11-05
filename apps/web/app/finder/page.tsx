import type { Metadata } from 'next';
import { attributesOf } from '@fitsecret/shared/finder';
import Finder, { type FItem } from './Finder';
import { getProducts } from '@/lib/catalog';
import { goalsOf } from '@/lib/goals';
import { PHONE } from '@/lib/site';

export const metadata: Metadata = { title: 'Plant your need', description: 'Not sure what to pick? Answer four quick questions and get one product to start with, chosen from what we stock.' };

// The recommendation runs in the visitor's browser (safety answers never leave the device, spec A7). The server sends
// each product's facts once, with attributes worked out here so descriptions don't have to travel.
export default async function FinderPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const [{ r }, products] = await Promise.all([searchParams, getProducts()]);
  const items: FItem[] = products.filter((p) => p.inStock).map((p) => {
    const v = p.variants.find((x) => x.stock > 0)!;
    return {
      key: p.key, name: p.name, brand: p.brand, image: p.image, price: v.price, mrp: v.mrp, stock: v.stock, featured: p.featured,
      categorySlug: p.categorySlug, subSlug: p.subSlug, goals: goalsOf(p), at: attributesOf(p),
      line: { id: v.id, key: p.key, name: p.name, variant: [v.size, v.flavour].filter(Boolean).join(' · '), price: v.price, mrp: v.mrp, brand: p.brand, stock: v.stock, bulkPrice: v.bulkPrice, bulkMin: v.bulkMin },
    };
  });
  return <Finder items={items} phone={PHONE} shared={r ? r.split(',').filter(Boolean).slice(0, 5) : null} />;
}

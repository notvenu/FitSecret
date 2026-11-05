import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/catalog';
import { searchProducts } from '@/lib/search';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') || '';
  const found = searchProducts(await getProducts(), q);
  return NextResponse.json(
    { total: found.length, hits: found.slice(0, 6).map(({ key, name, price, image }) => ({ key, name, price, image })) },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getProducts, live } from '@/lib/catalog';

// Batch lookup (PRD §6.5). Reads the certificates staff attach to items in the POS (Items → Certificates → batch no.).
// Only an exact code match is returned, and never a list, so codes can't be harvested.
// ponytail: per-instance memory rate limit (10/min/IP). Move to Upstash/Vercel KV if the site runs on many instances.
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return NextResponse.json({ state: 'limited' }, { status: 429 });
  hits.set(ip, [...recent, now]);
  if (hits.size > 5000) hits.clear();

  const { code } = await req.json().catch(() => ({}));
  const c = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (c.length < 3 || c.length > 40 || !/^[A-Z0-9\-/]+$/.test(c)) return NextResponse.json({ state: 'notFound' });
  if (!live) return NextResponse.json({ state: 'offline' }, { status: 503 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.from('shop_certificates').select('item_id, batch_no, kind, title, url, valid_until').ilike('batch_no', c).limit(10);
  if (error) return NextResponse.json({ state: 'error' }, { status: 502 });
  if (!data?.length) return NextResponse.json({ state: 'notFound' });

  const byItem = new Map((await getProducts()).flatMap((p) => p.variants.map((v) => [v.id, { product: p.name, key: p.key, size: v.size }] as const)));
  const item = byItem.get(data[0].item_id);
  return NextResponse.json({
    state: 'verified', batch: data[0].batch_no, product: item?.product || null, key: item?.key || null, size: item?.size || null,
    papers: data.map(({ kind, title, url, valid_until }) => ({ kind, title, url, valid_until })),
  });
}

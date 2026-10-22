import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { providerFor } from '@fitsecret/shared/couriers';
import { liveTracking } from '@/lib/couriers';

// Live courier tracking for one order. Same proof as the Track page (order number + phone), so AWBs can't be enumerated.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const no = u.searchParams.get('no') || '', phone = u.searchParams.get('phone') || '';
  if (!no || !phone || !process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ tracking: null }, { status: 400 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.rpc('track_order', { p_order_no: no, p_phone: phone });
  const o = data?.order;
  if (!o) return NextResponse.json({ tracking: null }, { status: 404 });
  const provider = providerFor(o.courier);
  if (!provider || !o.awb || ['cancelled', 'pending_payment'].includes(o.status)) return NextResponse.json({ tracking: null });
  const tracking = await liveTracking(provider, o.awb);
  return NextResponse.json({ tracking }, { headers: { 'cache-control': 'private, max-age=300' } });
}

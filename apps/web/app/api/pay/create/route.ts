import { NextResponse } from 'next/server';
import { admin, razorpayAuth } from '@/lib/server';

// Creates a Razorpay order for the amount stored in OUR database (never trust the client's amount).
export async function POST(req: Request) {
  const sb = admin(), auth = razorpayAuth();
  if (!sb || !auth) return NextResponse.json({ error: 'Online payments are not configured' }, { status: 503 });
  const { order_id } = await req.json().catch(() => ({}));
  const { data: o } = await sb.from('orders').select('id, order_no, total, status, payment_method').eq('id', order_id).maybeSingle();
  if (!o || o.payment_method !== 'online' || o.status !== 'pending_payment') return NextResponse.json({ error: 'Order is not awaiting payment' }, { status: 400 });
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(Number(o.total) * 100), currency: 'INR', receipt: o.order_no, notes: { order_id: o.id } }),
  });
  const rz = await r.json();
  if (!r.ok) return NextResponse.json({ error: rz.error?.description || 'Gateway error' }, { status: 502 });
  return NextResponse.json({ id: rz.id, amount: rz.amount, receipt: o.order_no });
}

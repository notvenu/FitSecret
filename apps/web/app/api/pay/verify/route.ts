import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { admin, razorpayAuth } from '@/lib/server';

export async function POST(req: Request) {
  const sb = admin(), auth = razorpayAuth();
  if (!sb || !auth) return NextResponse.json({ error: 'Online payments are not configured' }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig, order_id } = b;
  if (!oid || !pid || !sig || !order_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const expected = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${oid}|${pid}`).digest('hex');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }
  // The Razorpay order must belong to this FitSecret order (receipt = our order_no).
  const [rz, { data: o }] = await Promise.all([
    fetch(`https://api.razorpay.com/v1/orders/${oid}`, { headers: { authorization: auth } }).then((r) => r.json()),
    sb.from('orders').select('order_no, total').eq('id', order_id).maybeSingle(),
  ]);
  if (!o || rz.receipt !== o.order_no || rz.amount !== Math.round(Number(o.total) * 100)) {
    return NextResponse.json({ error: 'Order mismatch' }, { status: 400 });
  }
  const { error } = await sb.rpc('confirm_payment', { p_order: order_id, p_ref: pid });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

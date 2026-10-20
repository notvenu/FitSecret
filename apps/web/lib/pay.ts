'use client';
// Razorpay checkout for an already-placed order. Server routes own the secret and the amount.
declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }

export const onlinePayments = !!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

function loadScript() {
  return new Promise<void>((ok, fail) => {
    if (window.Razorpay) return ok();
    const s = Object.assign(document.createElement('script'), { src: 'https://checkout.razorpay.com/v1/checkout.js', onload: () => ok(), onerror: () => fail(new Error('Could not load payment gateway')) });
    document.body.appendChild(s);
  });
}

// Resolves true when paid & verified, false if the customer closed the popup.
export async function payOnline(order: { id: string; name: string; phone: string; email?: string }) {
  await loadScript();
  const r = await fetch('/api/pay/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: order.id }) });
  const rz = await r.json();
  if (!r.ok) throw new Error(rz.error || 'Payment could not start');
  return new Promise<boolean>((resolve, reject) => {
    new window.Razorpay!({
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, order_id: rz.id, amount: rz.amount, currency: 'INR', name: 'FitSecret', description: `Order ${rz.receipt}`,
      prefill: { name: order.name, contact: order.phone, email: order.email }, theme: { color: '#c6f432' },
      modal: { ondismiss: () => resolve(false) },
      handler: async (res: Record<string, string>) => {
        const v = await fetch('/api/pay/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...res, order_id: order.id }) });
        v.ok ? resolve(true) : reject(new Error('Payment verification failed. If money was debited, contact us with your order number.'));
      },
    }).open();
  });
}

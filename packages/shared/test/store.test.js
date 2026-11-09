import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCoupon, couponDiscount, orderTotals, customersFromOrders, couponError, STORE_DEFAULTS, unitPrice } from '../store.js';

test('coupon validation and discount rules', () => {
  const c = checkCoupon({ code: ' fit10 ', kind: 'percent', value: '10', max_discount: '200', min_order: '500', active: true });
  assert.equal(c.code, 'FIT10');
  assert.throws(() => checkCoupon({ code: 'FIT10', kind: 'flat', value: 50 }, [{ id: 'x', code: 'fit10' }]), /already exists/);
  assert.throws(() => checkCoupon({ code: 'BIG', kind: 'percent', value: 95 }), /1-90%/);
  assert.throws(() => checkCoupon({ code: 'a b', kind: 'flat', value: 5 }), /letters or numbers/);
  const today = '2026-10-22';
  assert.equal(couponDiscount(c, 1000, { today }), 100);
  assert.equal(couponDiscount(c, 5000, { today }), 200, 'capped at max discount');
  assert.throws(() => couponDiscount(c, 400, { today }), /COUPON_MIN:500/);
  assert.throws(() => couponDiscount({ ...c, ends: '2026-10-01' }, 1000, { today }), /COUPON_EXPIRED/);
  assert.throws(() => couponDiscount({ ...c, usage_limit: 2 }, 1000, { today, used: 2 }), /COUPON_USED_UP/);
  assert.throws(() => couponDiscount({ ...c, per_phone: 1 }, 1000, { today, usedByPhone: 1 }), /COUPON_ALREADY_USED/);
  assert.equal(couponDiscount({ ...c, kind: 'flat', value: 300, max_discount: null, min_order: null }, 250, { today }), 250, 'never more than the cart');
  assert.equal(couponError('COUPON_MIN:500'), 'Add a little more to use this coupon: minimum order ₹500');
});

test('shipping on the discounted amount; customers grouped by phone', () => {
  assert.deepEqual(orderTotals(1000, 100, STORE_DEFAULTS), { net: 900, shipping: 49, total: 949 });
  assert.deepEqual(orderTotals(1200, 100, STORE_DEFAULTS), { net: 1100, shipping: 0, total: 1100 });
  const cs = customersFromOrders([
    { id: 1, phone: '9000000001', name: 'Ravi', total: 500, status: 'delivered', created_at: '2026-10-01', user_id: 'u1' },
    { id: 2, phone: '9000000001', name: 'Ravi K', total: 300, status: 'cancelled', created_at: '2026-10-05' },
    { id: 3, phone: '9000000002', name: 'Sita', total: 900, status: 'placed', created_at: '2026-10-03' },
  ]);
  assert.deepEqual(cs.map((c) => [c.name, c.orders, c.spent, c.account]), [['Sita', 1, 900, false], ['Ravi K', 2, 500, true]]);
});

test('unit price: buyer rate or % off, bulk price from its quantity when lower', () => {
  const it = { id: 'w', sale_price: 1000, wholesale_price: 900, wholesale_min_qty: 3 };
  assert.equal(unitPrice(it, 1, null), 1000);
  assert.equal(unitPrice(it, 3, null), 900, 'bulk from 3');
  assert.equal(unitPrice(it, 1, { price_discount: 5, rates: null }), 950);
  assert.equal(unitPrice(it, 3, { price_discount: 5, rates: null }), 900, 'bulk wins when lower');
  assert.equal(unitPrice(it, 5, { price_discount: 0, rates: { w: 850 } }), 850, 'own rate wins when lower');
  assert.equal(unitPrice({ id: 'x', sale_price: 499 }, 50, { price_discount: 10, rates: { w: 1 } }), 449.1, 'no bulk price set');
});

test('same-day delivery: local pincode before the IST cutoff only', async () => {
  const { sameDay } = await import('../store.js');
  const { isPickup, flowOf, labelOf } = await import('../index.js');
  const o = { cutoff: 18, prefixes: ['520'] };
  assert.equal(sameDay('520010', o, new Date('2026-11-09T11:00:00Z')), true); // 16:30 IST
  assert.equal(sameDay('520010', o, new Date('2026-11-09T13:00:00Z')), false); // 18:30 IST
  assert.equal(sameDay('500001', o, new Date('2026-11-09T05:00:00Z')), false); // Hyderabad
  assert.equal(sameDay('520010', { cutoff: 0, prefixes: ['520'] }), false);
  const p = { address: { pickup: true }, status: 'packed' };
  assert.equal(isPickup(p), true);
  assert.deepEqual(flowOf(p), ['placed', 'confirmed', 'packed', 'delivered']);
  assert.equal(labelOf(p), 'Ready for pickup');
  assert.equal(labelOf({ address: {}, status: 'packed' }), 'Packed');
});

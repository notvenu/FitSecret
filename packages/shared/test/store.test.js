import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCoupon, couponDiscount, orderTotals, customersFromOrders, couponError, STORE_DEFAULTS } from '../store.js';

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

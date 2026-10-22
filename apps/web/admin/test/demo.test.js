// /admin demo mode: no Supabase, seeded in the browser, bills and reports work, sign-out wipes it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enterDemo, loadMe, signOut } from '../session.js';
import { call } from '../backend.js';

test('demo seeds the catalogue, bills a sale and forgets everything on sign-out', async () => {
  assert.equal(await loadMe(), null); // no Supabase env in tests: login screen, not a crash
  enterDemo();
  assert.equal((await call('/bootstrap')).setup, true);
  await call('/setup', { branch: { name: 'Fit Secrets', code: 'VJA', state_code: '37' }, catalog: true, demoStock: true });
  const boot = await call('/bootstrap');
  assert.equal(boot.user.role, 'admin');

  const [item] = (await call('/items')).filter((i) => i.stock > 0 && i.sale_price > 0);
  const sale = await call('/invoices', { lines: [{ item_id: item.id, qty: 1 }], payments: [{ mode: 'cash', amount: 999999 }] });
  assert.equal(sale.status, 'paid');
  assert.equal((await call('/reports/dashboard')).today.n, 1);

  await signOut();
  assert.equal(await loadMe(), null);
});

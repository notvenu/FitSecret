import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBill, parseLine } from '../billparse.js';
import { runReport, balanceSheet } from '../reports.js';
import { C128, code128 } from '../barcode.js';

const ITEMS = [
  { id: 'a', name: 'Optimum Nutrition Gold Standard Whey 2 lb Double Rich Chocolate', brand: 'Optimum Nutrition' },
  { id: 'b', name: 'MuscleBlaze Creatine Monohydrate 250 g Unflavoured', brand: 'MuscleBlaze' },
  { id: 'c', name: 'Alpino High Protein Oats' }, { id: 'd', name: 'Alpino High Protein Super Oats 1kg' }, { id: 'e', name: 'Grenode Protein' },
];

test('item matching prefers the more specific item and ignores one-word overlaps', () => {
  assert.equal(parseBill('Alpino High Protein Super Oats 1kg 2106 4 150 600.00', ITEMS).lines[0].item_id, 'd');
  assert.equal(parseBill('New Protein Cookies Choco 2106 10 45 450.00', ITEMS).lines[0].item_id, null);
});

test('bill OCR text → supplier, bill no, date, matched lines', () => {
  const text = `RAKESH DISTRIBUTORS
GSTIN: 37ABCDE1234F1Z5
Invoice No: RD/2026/118   Date: 12/10/2026
Optimum Nutrition Gold Standard Whey 2lb Double Rich Chocolate 21069099 B2341 08/27 4 3100.00 18% 14632.00
MuscleBlaze Creatine Monohydrate 250g 2106 MB77A 03/2028 10 450 4500.00
Sub Total 19132.00
CGST 9% 1316.88`;
  const r = parseBill(text, ITEMS, { ownGstin: '37ZZZZZ0000Z1Z0' });
  assert.equal(r.gstin, '37ABCDE1234F1Z5');
  assert.equal(r.no, 'RD/2026/118');
  assert.equal(r.date, '2026-10-12');
  assert.equal(r.lines.length, 2);
  assert.deepEqual([r.lines[0].item_id, r.lines[0].qty, r.lines[0].rate, r.lines[0].gst_rate, r.lines[0].hsn, r.lines[0].batch_no, r.lines[0].expiry],
    ['a', 4, 3100, 18, '21069099', 'B2341', '2027-08-31']);
  assert.deepEqual([r.lines[1].item_id, r.lines[1].qty, r.lines[1].rate, r.lines[1].expiry], ['b', 10, 450, '2028-03-31']);
});

test('line parser falls back to amount / qty when no exact pair', () => {
  const p = parseLine('Some Protein Bar 12 999.99');
  assert.equal(p.qty, 12);
  assert.equal(p.guessed, true);
});

test('code128 table and checksum', () => {
  assert.equal(C128.length, 107);
  C128.forEach((p, i) => assert.equal([...p].reduce((s, n) => s + +n, 0), i === 106 ? 13 : 11, `pattern ${i}`));
  // Start B (104) + Σ pos × value for P J J 1 2 3 C = 879, mod 103 = 55
  const w = code128('PJJ123C');
  assert.equal(w.slice(-13, -7), C128[55]);
});

test('reports: party statement, cash in hand, item P&L', () => {
  const B = 'br';
  const T = {
    parties: [{ id: 'p1', name: 'Ravi', opening_balance: 100 }],
    invoices: [
      { id: 'i1', branch_id: B, type: 'sale', no: 'S1', date: '2026-10-01', created_at: '1', party_id: 'p1', party_name: 'Ravi', total: 500, paid: 0, status: 'unpaid' },
      { id: 'i2', branch_id: B, type: 'sale_order', no: 'SO1', date: '2026-10-02', created_at: '2', party_id: 'p1', party_name: 'Ravi', total: 900, paid: 0, status: 'open' },
    ],
    invoice_lines: [{ id: 'l1', invoice_id: 'i1', item_id: 'x', name: 'Whey', qty: 2, rate: 250, taxable: 423.73, tax: 76.27, total: 500, cost: 150, gst_rate: 18 }],
    payments: [
      { id: 'y1', branch_id: B, party_id: 'p1', direction: 'in', amount: 200, mode: 'cash', date: '2026-10-03', created_at: '3' },
      { id: 'y2', branch_id: B, party_id: null, direction: 'out', amount: 50, mode: 'cash', date: '2026-10-03', created_at: '4', note: 'Cash adjustment' },
    ],
    expenses: [{ id: 'e1', branch_id: B, category: 'Rent', amount: 30, mode: 'cash', date: '2026-10-04', created_at: '5' }],
    items: [{ id: 'x', name: 'Whey' }], categories: [], stock_movements: [], journals: [], accounts: [], branches: [],
  };
  const rows = (t) => T[t];
  const st = runReport('party_statement', rows, B, { party_id: 'p1' });
  assert.equal(st.at(-1).balance, 400); // 100 opening + 500 sale − 200 received; the sale order doesn't count
  const cash = runReport('cash_bank', rows, B).find((m) => m.mode === 'cash');
  assert.equal(cash.balance, 120);
  const pnl = runReport('item_pnl', rows, B, {});
  assert.deepEqual([pnl[0].sales, pnl[0].cost, pnl[0].profit], [423.73, 300, 123.73]);
  assert.throws(() => runReport('item_pnl', rows, B, {}, 'cashier'), /Admin only/);
});

test('accounting: journals, fixed asset, balance sheet balances; loyalty earn and redeem', () => {
  const B = 'br';
  const T = {
    branches: [{ id: B, settings: { loyalty: { enabled: true, earn_per_100: 1, point_value: 1 } } }],
    parties: [{ id: 'p1', name: 'Ravi', opening_balance: 0 }, { id: 's1', name: 'Supplier', opening_balance: -1000 }],
    invoices: [
      { id: 'i1', branch_id: B, type: 'sale', no: 'S1', date: '2026-10-01', created_at: '1', party_id: 'p1', party_name: 'Ravi', total: 1180, paid: 1180, cgst: 90, sgst: 90, igst: 0, status: 'paid' },
      { id: 'i2', branch_id: B, type: 'purchase', no: 'P1', date: '2026-09-01', created_at: '0', party_id: 's1', party_name: 'Supplier', total: 1180, paid: 0, cgst: 90, sgst: 90, igst: 0, status: 'unpaid' },
    ],
    invoice_lines: [
      { id: 'l1', invoice_id: 'i1', item_id: 'x', name: 'Whey', qty: 1, rate: 1180, taxable: 1000, tax: 180, total: 1180, cost: 600 },
      { id: 'l2', invoice_id: 'i2', item_id: 'x', name: 'Whey', qty: 2, rate: 500, taxable: 1000, tax: 180, total: 1180, cost: 0 },
    ],
    payments: [
      { id: 'y1', branch_id: B, party_id: 'p1', invoice_id: 'i1', direction: 'in', amount: 1170, mode: 'cash', date: '2026-10-01', created_at: '2' },
      { id: 'y2', branch_id: B, party_id: 'p1', invoice_id: 'i1', direction: 'in', amount: 10, mode: 'points', date: '2026-10-01', created_at: '2' },
    ],
    expenses: [{ id: 'e1', branch_id: B, category: 'Rent', amount: 100, mode: 'cash', date: '2026-10-02', created_at: '3' }],
    items: [{ id: 'x', name: 'Whey', purchase_price: 500 }], categories: [],
    stock_movements: [{ id: 'm1', branch_id: B, item_id: 'x', qty: 2, created_at: '2026-09-01T00:00:00Z' }, { id: 'm2', branch_id: B, item_id: 'x', qty: -1, created_at: '2026-10-01T00:00:00Z' }],
    accounts: [{ id: 'a1', branch_id: B, name: 'Furniture', type: 'fixed_asset', opening_balance: 0 }, { id: 'a2', branch_id: B, name: 'Owner capital', type: 'capital', opening_balance: 5000 }],
    journals: [{ id: 'j1', branch_id: B, no: 'JE-1', date: '2026-10-03', created_at: '4', lines: [{ account: 'acc:a1', debit: 800, credit: 0 }, { account: 'mode:cash', debit: 0, credit: 800 }] }],
  };
  const rows = (t) => T[t];
  const bs = balanceSheet(rows, B);
  const side = (a) => Math.round(a.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  assert.equal(side(bs.assets), side(bs.liabilities), 'assets = liabilities + equity');
  const get = (a, n) => a.find((x) => x.name === n)?.amount;
  assert.equal(get(bs.assets, 'Cash in hand'), 1170 - 100 - 800, 'journal paid from cash; points are not cash');
  assert.equal(get(bs.assets, 'Furniture'), 800);
  assert.equal(get(bs.assets, 'Closing stock (at cost)'), 500);
  assert.equal(get(bs.liabilities, 'Sundry Creditors (payable)'), 2180);
  assert.equal(get(bs.liabilities, 'Net profit to date'), 300); // 1000 sales - 600 cost - 100 rent
  const tb = runReport('trial_balance', rows, B, {});
  assert.equal(tb.reduce((s, r) => s + r.debit, 0).toFixed(2), tb.reduce((s, r) => s + r.credit, 0).toFixed(2));
  const st = runReport('account_statement', rows, B, { account: 'acc:a1' });
  assert.equal(st.at(-1).balance, 800);
  const loy = runReport('loyalty', rows, B);
  assert.deepEqual([loy[0].earned, loy[0].redeemed, loy[0].balance], [11, 10, 1]); // 1% of (1180 - 10 paid by points) = 11
  assert.deepEqual(runReport('party_rates', rows, B, { party_id: 's1' }), [{ item_id: 'x', rate: 500, date: '2026-09-01' }]);
});

test('amount in words uses lakh/crore', async () => {
  const { inWords } = await import('../index.js');
  assert.equal(inWords(0), 'Rupees Zero Only');
  assert.equal(inWords(420), 'Rupees Four Hundred Twenty Only');
  assert.equal(inWords(123456.5), 'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only');
  assert.equal(inWords(10000001), 'Rupees One Crore One Only');
  assert.equal(inWords(1500000000), 'Rupees One Hundred Fifty Crore Only');
});

test('invoice extras: prefixes, TCS on top, due date from terms, currency needs a rate', async () => {
  const { invoiceExtras, docPrefix, addDays } = await import('../index.js');
  assert.equal(docPrefix({ code: 'VJA' }, 'sale', '', '2026-10-22'), 'VJA/26-27/');
  assert.equal(docPrefix({ code: 'VJA', settings: { prefixes: { sale: 'FS-INV' } } }, 'sale', '', '2026-10-22'), 'FS-INV/26-27/');
  assert.equal(addDays('2026-12-25', 10), '2027-01-04');
  const x = invoiceExtras({ tcs_rate: 0.1 }, { payment_terms: 15, shipping_address: 'Godown 2' }, { date: '2026-10-22', total: 100000 });
  assert.deepEqual([x.tcs, x.total, x.due_date, x.ship_to], [100, 100100, '2026-11-06', 'Godown 2']);
  assert.equal(invoiceExtras({}, null, { date: '2026-10-22', total: 50 }).total, 50);
  assert.throws(() => invoiceExtras({ currency: 'USD' }, null, { date: '2026-10-22', total: 1 }), /USD exchange rate/);
});

test('e-way bill JSON: pincodes from addresses, IGST rates for inter-state, URP for unregistered', async () => {
  const { ewayJson } = await import('../gstjson.js');
  const inv = { no: 'VJA/26-27/0042', date: '2026-10-27', party_name: 'Gym Co', party_gstin: '', party_state: '36', ship_to: 'Plot 4, Madhapur, Hyderabad 500081',
    taxable: 50000, cgst: 0, sgst: 0, igst: 9000, total: 59000, lines: [{ name: 'Whey 2kg', hsn: '2106', qty: 10, taxable: 50000, gst_rate: 18 }] };
  const j = ewayJson(inv, { name: 'Fit Secrets', gstin: '37abcde1234f1z5', address: 'MG Road, Vijayawada 520010', state_code: '37' }, null, { distance: 275, vehicle: 'ap 16 ab 1234' }).billLists[0];
  assert.equal(j.fromPincode, 520010);
  assert.equal(j.toPincode, 500081);
  assert.equal(j.toGstin, 'URP');
  assert.equal(j.userGstin, '37ABCDE1234F1Z5');
  assert.equal(j.docDate, '27/10/2026');
  assert.equal(j.vehicleNo, 'AP16AB1234');
  assert.deepEqual([j.itemList[0].igstRate, j.itemList[0].cgstRate], [18, 0]);
  assert.equal(j.mainHsnCode, 2106);
});

test('insights: reorder from sales pace, dead stock only after 60 days on the shelf; weekly plan ranks by urgency and money', async () => {
  const { weeklyPlan } = await import('../insights.js');
  const day = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA');
  const B = 'b1', T = { branches: [{ id: B, settings: {} }], parties: [{ id: 'p1', name: 'Asha Rao', phone: '9000000001', type: 'customer' }],
    items: [{ id: 'fast', name: 'Whey 1kg', sale_price: 2000, purchase_price: 1600 }, { id: 'old', name: 'Old Bar', sale_price: 100, purchase_price: 60 }, { id: 'new', name: 'New Bar', sale_price: 100, purchase_price: 60 }],
    invoices: [], invoice_lines: [], payments: [], expenses: [], categories: [], journals: [], accounts: [], employees: [], attendance: [], day_closes: [], audit_log: [], orders: [],
    stock_movements: [{ branch_id: B, item_id: 'fast', qty: 4, created_at: day(90) + 'T05:00:00Z' }, { branch_id: B, item_id: 'old', qty: 50, created_at: day(120) + 'T05:00:00Z' },
      { branch_id: B, item_id: 'new', qty: 50, created_at: day(2) + 'T05:00:00Z' }] };
  for (let i = 0; i < 20; i++) {
    const id = 'i' + i, date = day(i + 1);
    T.invoices.push({ id, branch_id: B, type: 'sale', no: 'S' + i, date, created_at: date + 'T06:00:00Z', party_id: i % 2 ? 'p1' : null, party_name: i % 2 ? 'Asha Rao' : 'Cash Sale', total: 2000, paid: 2000, subtotal: 2000, discount: 0, status: 'paid' });
    T.invoice_lines.push({ id: 'l' + i, invoice_id: id, item_id: 'fast', name: 'Whey 1kg', qty: 1, rate: 2000, taxable: 1695, tax: 305, total: 2000, cost: 1600 });
  }
  const ins = runReport('insights', (t) => T[t] || [], B, { today: day(0) });
  const reorder = ins.stock.insights.find((x) => x.id === 'reorder');
  assert.ok(reorder && reorder.table.rows[0].item === 'Whey 1kg', '20 sold in 20 days with 4 left (about 6 days of cover) must be reordered');
  const dead = ins.stock.insights.find((x) => x.id === 'dead');
  assert.deepEqual(dead.table.rows.map((r) => r.item), ['Old Bar'], 'stock that arrived 2 days ago is not dead');
  const plan = weeklyPlan(ins);
  assert.equal(plan[0].id, 'stock:reorder', 'the urgent stock-out comes first');
  assert.equal(plan[0].priority, 'high');
  assert.ok(plan[0].impact > 0 && plan[0].steps.length >= 2);
  assert.ok(plan.every((a, i) => i === 0 || ['high', 'medium', 'low'].indexOf(plan[i - 1].priority) <= ['high', 'medium', 'low'].indexOf(a.priority)), 'sorted by priority');
});

test('variants: sizes and flavours of one product group together; different products and already-grouped items do not', async () => {
  const { findVariantGroups, parseVariant, productName } = await import('../variants.js');
  assert.deepEqual(parseVariant('ON Gold Standard whey Chocolate Flavour 2.27kg'), { base: ['on', 'gold', 'standard', 'whey'], size: '2.27kg', flavour: 'Chocolate' });
  assert.equal(productName('ON Gold Standard whey Vanilla Ice cream Flavour 2.27kg', '2.27kg', 'Vanilla Ice Cream'), 'ON Gold Standard whey');
  const items = [
    { id: '1', name: 'ON Gold Standard whey Chocolate Flavour 907g' }, { id: '2', name: 'ON Gold Standard whey Vanilla Ice cream Flavour 2.27kg' },
    { id: '3', name: 'ON Gold Standard Isolate Chocolate Flavour' }, { id: '4', name: 'Wellx peanut butter rabdi silky 1kg' },
    { id: '5', name: 'Wellx Mix Fruit Peanut Butter (Crunchy)' }, { id: '6', name: 'MB Biozyme Whey PR 1kg', group_key: 'g' }, { id: '7', name: 'MB Biozyme Whey PR 2kg', group_key: 'g' },
  ];
  const g = findVariantGroups(items);
  assert.deepEqual(g.map((x) => x.items.map((i) => i.id).sort()), [['1', '2'], ['4', '5']], 'isolate stays apart; already-grouped Biozyme is left alone');
  assert.equal(g[0].items.find((i) => i.id === '2').flavour, 'Vanilla Ice Cream');
});

test('reminders: party balance sits on its newest unpaid bills; paid bills and far-off due dates stay out', () => {
  const B = 'b1', d = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA');
  const inv = (id, type, party_id, date, total, paid, due_date) => ({ id, branch_id: B, type, no: id, party_id, date, total, paid, due_date, status: 'unpaid', created_at: date });
  const data = {
    branches: [{ id: B }], parties: [{ id: 'c', name: 'Ravi', phone: '9876543210' }, { id: 's', name: 'Nutri' }, { id: 'f', name: 'Later' }],
    invoices: [inv('S1', 'sale', 'c', d(-17), 1800, 500, d(-7)), inv('S2', 'sale', 'c', d(-1), 105, 105),
      inv('P1', 'purchase', 's', d(0), 3540, 0, d(3)), inv('P2', 'purchase', 'f', d(0), 900, 0, d(40))],
    payments: [{ id: 'y0', branch_id: B, party_id: 'c', invoice_id: 'S1', direction: 'in', amount: 500, date: d(-17), mode: 'cash' },
      { id: 'y2', branch_id: B, party_id: 'c', invoice_id: 'S2', direction: 'in', amount: 105, date: d(-1), mode: 'upi' },
      { id: 'y1', branch_id: B, party_id: 'c', direction: 'in', amount: 200, date: d(-2), mode: 'cash' }], // on account
  };
  const r = runReport('reminders', (t) => data[t] || [], B, {});
  // 1800 + 105 − 500 − 105 − 200 = 1100 owed, all of it on S1 (S2 is paid), 7 days overdue
  assert.deepEqual(r.collect.map((x) => [x.no, x.amount, x.days]), [['S1', 1100, 7]]);
  assert.deepEqual(r.pay.map((x) => [x.no, x.amount, x.days]), [['P1', 3540, -3]]); // P2 is due in 40 days
});

// Shared between POS server, POS UI and web storefront.

// ---------- Synced tables ----------
// Single source of truth for every table that lives in BOTH SQLite (offline) and Postgres (Supabase).
// supabase/migrations/*.sql must declare the same columns; apps/pos/test/sync.test.js checks parity.
// Types: uuid | text | int | num | bool | json | ts | date
export const COMMON = { id: 'uuid', created_at: 'ts', updated_at: 'ts', deleted: 'bool' };

export const TABLES = {
  // A company (legal entity: own name, GSTIN, books) owns branches and warehouses. Branches with no company_id predate companies.
  companies: { name: 'text', legal_name: 'text', gstin: 'text', state_code: 'text', address: 'text', phone: 'text', email: 'text', logo: 'text', note: 'text' },
  branches: { code: 'text', name: 'text', address: 'text', phone: 'text', gstin: 'text', state_code: 'text', is_online: 'bool', settings: 'json',
    kind: 'text', company_id: 'uuid' }, // kind: store (default) | warehouse
  categories: { name: 'text', slug: 'text', sort: 'int', image: 'text', parent_id: 'uuid' },
  items: {
    name: 'text', slug: 'text', group_key: 'text', sku: 'text', barcode: 'text', brand: 'text', category_id: 'uuid',
    flavour: 'text', size: 'text', unit: 'text', hsn: 'text', gst_rate: 'num', mrp: 'num', sale_price: 'num',
    purchase_price: 'num', low_stock: 'num', online: 'bool', featured: 'bool', goals: 'json', description: 'text', image: 'text',
    wholesale_price: 'num', wholesale_min_qty: 'num', location: 'text', model: 'text',
    refill_days: 'int', // days one unit lasts a customer (2 kg whey ≈ 45): Parties → Follow-ups lists who is due to buy again
    company_ids: 'json', // companies that sell it; empty / null = every company
  },
  parties: { type: 'text', name: 'text', phone: 'text', email: 'text', gstin: 'text', address: 'text', state_code: 'text', opening_balance: 'num', credit_limit: 'num',
    shipping_address: 'text', group_name: 'text', payment_terms: 'int', extra: 'json',
    // Regular buyers: % off every item, and/or fixed per-item prices { item_id: price }. Used at the counter and, when they sign in, on the website.
    price_discount: 'num', rates: 'json' },
  invoices: {
    branch_id: 'uuid', type: 'text', no: 'text', date: 'date', party_id: 'uuid', party_name: 'text', party_phone: 'text',
    party_gstin: 'text', party_state: 'text', tax_inclusive: 'bool', subtotal: 'num', discount: 'num', taxable: 'num',
    cgst: 'num', sgst: 'num', igst: 'num', round_off: 'num', total: 'num', paid: 'num', status: 'text', notes: 'text',
    order_id: 'uuid', created_by: 'text',
    due_date: 'date', ship_to: 'text', party_extra: 'json', tcs: 'num', currency: 'text', fx_rate: 'num',
    // ref_*: the original invoice a credit / debit note is against (printed on the note, as GST rule 53 requires).
    ref_id: 'uuid', ref_no: 'text', ref_date: 'date', bill_discount: 'num', referrer: 'text', salesperson: 'text',
  },
  invoice_lines: {
    invoice_id: 'uuid', item_id: 'uuid', name: 'text', hsn: 'text', batch_no: 'text', expiry: 'date', qty: 'num', rate: 'num',
    mrp: 'num', discount_pct: 'num', gst_rate: 'num', taxable: 'num', tax: 'num', total: 'num', cost: 'num', sort: 'int', serial: 'text', mfg: 'date',
    note: 'text', // printed under the line: near-expiry offer disclosure, combo name
  },
  stock_movements: { branch_id: 'uuid', item_id: 'uuid', qty: 'num', batch_no: 'text', expiry: 'date', ref_type: 'text', ref_id: 'uuid', note: 'text', mfg: 'date' },
  // mode 'exchange': credit from a sale return spent on a new sale (note = the credit note no). reconciled: bank statement date.
  payments: { branch_id: 'uuid', party_id: 'uuid', invoice_id: 'uuid', direction: 'text', amount: 'num', mode: 'text', date: 'date', note: 'text', tds: 'num', reconciled: 'date',
    ref: 'text', ref_date: 'date', status: 'text', deposit_to: 'text' }, // cheques: number, date on it, where it is (shared/cheques.js)
  expenses: { branch_id: 'uuid', category: 'text', amount: 'num', mode: 'text', date: 'date', note: 'text', employee_id: 'uuid' }, // employee_id: salary / advance paid to staff
  orders: {
    order_no: 'text', user_id: 'uuid', branch_id: 'uuid', name: 'text', phone: 'text', email: 'text', address: 'json',
    subtotal: 'num', shipping: 'num', discount: 'num', total: 'num', payment_method: 'text', payment_status: 'text',
    payment_ref: 'text', status: 'text', courier: 'text', awb: 'text', tracking_url: 'text', notes: 'text', invoice_id: 'uuid', coupon: 'text', internal_note: 'text',
    combo_discount: 'num', // part of `discount` that came from combos (the rest is the coupon)
    points: 'num', points_party: 'uuid', // loyalty points (₹) the signed-in customer spent on this order, and whose
  },
  order_lines: { order_id: 'uuid', item_id: 'uuid', name: 'text', variant: 'text', qty: 'num', price: 'num', total: 'num' },
  order_events: { order_id: 'uuid', status: 'text', note: 'text' },
  // Accounting (Vyapar's Chart of Accounts / Journal Entries). type: fixed_asset | current_asset | capital | loan | current_liability | income | expense.
  accounts: { branch_id: 'uuid', name: 'text', type: 'text', opening_balance: 'num', note: 'text' },
  // lines: [{ account: 'acc:<uuid>' | 'mode:<cash|upi|card|bank>', debit, credit }]; debits must equal credits.
  journals: { branch_id: 'uuid', no: 'text', date: 'date', note: 'text', lines: 'json' },
  // Website offers (Online Store → Offers). place_order applies them server-side; rules mirrored in store.js couponDiscount.
  coupons: { code: 'text', kind: 'text', value: 'num', min_order: 'num', max_discount: 'num', starts: 'date', ends: 'date',
    usage_limit: 'int', per_phone: 'int', active: 'bool', public: 'bool', note: 'text',
    channel: 'text' }, // where it can be used: both (default) | counter | online
  // Website inbox (Online Store → Inbox): product reviews, contact messages, back-in-stock requests. Customers write via submit_feedback.
  // status: new | approved | hidden (reviews) · new | done (messages) · new | notified (restock)
  feedback: { kind: 'text', item_id: 'uuid', order_no: 'text', name: 'text', phone: 'text', email: 'text', rating: 'int', title: 'text', body: 'text',
    status: 'text', reply: 'text', verified: 'bool' },
  // Staff (Staff → Staff list). pay_type: monthly (salary for the month) | daily (wage per day worked). Not the login users / PINs.
  employees: { branch_id: 'uuid', name: 'text', phone: 'text', role: 'text', pay_type: 'text', salary: 'num', joined: 'date', active: 'bool', note: 'text' },
  // One row per employee per day. status: present | half | leave (paid) | off (weekly off) | absent
  attendance: { branch_id: 'uuid', employee_id: 'uuid', date: 'date', status: 'text', in_time: 'text', out_time: 'text', note: 'text' },
  // Day close (Z report): what the books expected per payment mode vs what was counted. The cash difference is posted as an adjustment.
  day_closes: { branch_id: 'uuid', date: 'date', expected: 'json', counted: 'json', diff: 'num', closed_by: 'text', note: 'text' },
  // Audit trail: invoice edits and cancellations, who did it and what the bill looked like before.
  audit_log: { branch_id: 'uuid', ref_type: 'text', ref_id: 'uuid', ref_no: 'text', action: 'text', by: 'text', data: 'json' },
  // Lab reports / COA / FSSAI / import papers for a variant, optionally one batch. url: a web link or an uploaded PDF / photo.
  certificates: { item_id: 'uuid', batch_no: 'text', kind: 'text', title: 'text', url: 'text', valid_until: 'date', note: 'text' },
  // kind 'combo': items [{ item_id, qty }] for `price`. kind 'expiry': discount_pct off one batch (item_id, batch_no, expiry) until it expires.
  // Approved by a person (approved_by); active = false means switched off or dismissed. Rules: shared/offers.js.
  offers: { kind: 'text', name: 'text', item_id: 'uuid', batch_no: 'text', expiry: 'date', discount_pct: 'num', items: 'json', price: 'num',
    starts: 'date', ends: 'date', active: 'bool', approved_by: 'text', note: 'text',
    channel: 'text' }, // combos: both (default) | counter | online. Near-expiry offers are counter-only (they belong to a batch).
};

export const columnsOf = (t) => ({ ...COMMON, ...TABLES[t] });

export const ATTENDANCE = { present: 'Present', half: 'Half day', leave: 'Paid leave', off: 'Weekly off', absent: 'Absent' };
// Staff rows are checked the same way by both back ends before saving. Throws an Error meant for the user.
export function checkStaffRow(t, b) {
  if (b.deleted) return;
  if (t === 'employees') {
    if (b.pay_type && !['monthly', 'daily'].includes(b.pay_type)) throw new Error('Pay type is monthly or daily');
    if (b.salary != null && b.salary !== '' && !(Number(b.salary) >= 0)) throw new Error('Enter the salary as a number');
  }
  if (t === 'attendance') {
    if (!b.employee_id) throw new Error('Pick the staff member');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw new Error('Pick a date');
    if (!ATTENDANCE[b.status]) throw new Error('Pick present, half day, leave, off or absent');
  }
}

// Wire (JSON/Postgres) -> SQLite row
export function toLocal(table, row) {
  const cols = columnsOf(table), out = {};
  for (const [c, type] of Object.entries(cols)) {
    let v = row[c];
    if (v === undefined) v = null;
    if (v !== null) {
      if (type === 'bool') v = v ? 1 : 0;
      else if (type === 'json') v = JSON.stringify(v);
      else if (type === 'ts') v = new Date(v).toISOString(); // normalise so string compare == time compare
    }
    out[c] = v;
  }
  return out;
}

// SQLite row -> wire
export function toWire(table, row) {
  const cols = columnsOf(table), out = {};
  for (const [c, type] of Object.entries(cols)) {
    let v = row[c] ?? null;
    if (v !== null) {
      if (type === 'bool') v = !!v;
      else if (type === 'json') v = typeof v === 'string' ? JSON.parse(v) : v;
      else if (type === 'num' || type === 'int') v = Number(v);
    }
    out[c] = v;
  }
  return out;
}

// ---------- Money & GST ----------
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// One line. rate is per unit; inclusive = rate already contains GST (retail MRP style).
export function calcLine({ qty, rate, discount_pct = 0, gst_rate = 0 }, inclusive = true) {
  const gross = round2(qty * rate * (1 - (discount_pct || 0) / 100));
  const g = Number(gst_rate) || 0;
  if (inclusive) {
    const taxable = round2((gross * 100) / (100 + g));
    return { taxable, tax: round2(gross - taxable), total: gross };
  }
  const tax = round2((gross * g) / 100);
  return { taxable: gross, tax, total: round2(gross + tax) };
}

// billDiscount: ₹ off the whole bill, spread over the lines in proportion so each line's taxable value (and GST) drops with it.
export function calcInvoice(lines, { inclusive = true, interState = false, billDiscount = 0 } = {}) {
  let subtotal = 0, taxable = 0, tax = 0, gross = 0;
  const pre = lines.reduce((s, l) => s + l.qty * l.rate * (1 - (l.discount_pct || 0) / 100), 0);
  const bill = round2(Math.min(Math.max(Number(billDiscount) || 0, 0), pre)), f = pre ? 1 - bill / pre : 1;
  const out = lines.map((l) => {
    const c = calcLine({ ...l, discount_pct: 100 - (100 - (l.discount_pct || 0)) * f }, inclusive);
    subtotal += l.qty * l.rate;
    taxable += c.taxable; tax += c.tax; gross += c.total;
    return { ...l, ...c };
  });
  tax = round2(tax); taxable = round2(taxable); gross = round2(gross);
  // CGST and SGST must be equal on the bill; the odd paisa goes into round-off.
  const cgst = interState ? 0 : round2(tax / 2), sgst = cgst, igst = interState ? tax : 0;
  const total = Math.round(gross);
  subtotal = round2(subtotal);
  return {
    lines: out, subtotal, taxable, cgst, sgst, igst, bill_discount: bill,
    discount: round2(subtotal - (inclusive ? gross : taxable)),
    round_off: round2(total - taxable - cgst - sgst - igst), total,
  };
}

// Indian financial year label, e.g. 2026-10-19 -> "26-27"
export function fyLabel(date = new Date()) {
  const d = new Date(date), y = d.getFullYear() - (d.getMonth() < 3 ? 1 : 0);
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}

// Invoice number prefix: Settings → Transaction prefixes (per document type) or the default BRANCH-XX/26-27/.
export function docPrefix(branch, type, defaultPrefix, date) {
  const custom = branch?.settings?.prefixes?.[type];
  return custom ? `${custom}/${fyLabel(date)}/` : `${branch?.code || 'FS'}${defaultPrefix ? '-' + defaultPrefix : ''}/${fyLabel(date)}/`;
}
export const addDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Header fields both backends add to an invoice: TCS on top of the bill, foreign currency, due date from party terms, ship-to.
// Throws Error with a message meant for the user.
export function invoiceExtras(body, party, { date, total }) {
  const tcsRate = Number(body.tcs_rate) || 0;
  if (tcsRate < 0 || tcsRate > 5) throw new Error('TCS rate must be between 0 and 5%');
  const tcs = round2((total * tcsRate) / 100);
  const currency = body.currency && body.currency !== 'INR' ? String(body.currency).toUpperCase().slice(0, 3) : null;
  const fx_rate = currency ? Number(body.fx_rate) : null;
  if (currency && !(fx_rate > 0)) throw new Error(`Enter the ${currency} exchange rate`);
  return {
    tcs: tcs || null, total: round2(total + tcs), currency, fx_rate,
    due_date: body.due_date || (party?.payment_terms > 0 ? addDays(date, party.payment_terms) : null),
    ship_to: body.ship_to ?? party?.shipping_address ?? null,
    party_extra: party?.extra && Object.values(party.extra).some(Boolean) ? party.extra : null,
  };
}

// A credit / debit note against an invoice: same party, only items on that bill, and no more than was sold minus earlier returns.
// src = the original invoice with .lines; earlier = lines of returns already made against it. Throws Error meant for the user.
export function checkReturn(type, src, earlier, lines) {
  if (!src || src.deleted || src.status === 'cancelled') throw new Error('Original invoice not found');
  if (src.type !== type.replace('_return', '')) throw new Error(`${src.no} is not a ${type.replace('_return', '')} invoice`);
  const left = new Map();
  for (const l of src.lines) left.set(l.item_id, (left.get(l.item_id) || 0) + Number(l.qty));
  for (const l of earlier) left.set(l.item_id, (left.get(l.item_id) || 0) - Number(l.qty));
  const want = new Map();
  for (const l of lines) want.set(l.item_id, (want.get(l.item_id) || 0) + Number(l.qty));
  for (const [id, q] of want) {
    const can = round2(left.get(id) || 0), name = src.lines.find((l) => l.item_id === id)?.name;
    if (!name) throw new Error(`That item is not on ${src.no}`);
    if (q > can + 1e-9) throw new Error(`${name}: only ${can} left to return on ${src.no}`);
  }
}

// Settings → Staff permissions. Admins are never limited. allowed = ₹ of discount that comes from approved offers and combos,
// which don't count against the cashier's limit. Throws Error meant for the user.
export function checkPerms(user, settings, calc, allowed = 0) {
  const max = settings?.perms?.max_discount;
  if (!user || user.role === 'admin' || max == null || max === '' || !(calc.subtotal > 0)) return;
  if ((Math.max(0, calc.discount - allowed) / calc.subtotal) * 100 > Number(max) + 0.01) throw Object.assign(new Error(`Discount above ${max}% needs the owner’s PIN`), { approval: true });
}

// Prices typed at the counter. Never above MRP on a sale (Legal Metrology). Lower than the usual price (list, the customer's special
// rate or % off, the bulk price, or what they were last billed) depends on Settings → Staff: free | approval (owner's PIN) | never.
// usual(line) → the price that needs no say-so. The owner is never limited; `approved` = an owner's PIN was checked for this bill.
// Throws Error; err.approval = true means an owner's PIN would allow it. Returns the lowered lines (for the audit trail).
export const CHANNELS = { both: 'Counter & website', counter: 'Counter only', online: 'Website only' };
export function checkPrices({ type, user, settings, lines, usual, inclusive = true, approved = false }) {
  if (type !== 'sale') return [];
  for (const l of lines) {
    const incl = inclusive ? l.rate : l.rate * (1 + (Number(l.gst_rate) || 0) / 100);
    if (l.mrp > 0 && incl > l.mrp + 0.01) throw new Error(`${l.name}: ₹${round2(incl)} is above the MRP of ₹${l.mrp}. Items can't be sold above MRP`);
  }
  const low = lines.map((l) => ({ name: l.name, usual: round2(usual(l)), charged: l.rate })).filter((x) => x.usual > 0 && x.charged < x.usual - 0.01);
  if (!low.length || !user || user.role === 'admin' || approved) return low;
  const mode = settings?.perms?.price_edit || (settings?.perms?.lock_rate ? 'never' : 'approval');
  if (mode === 'free') return low;
  const what = low.map((x) => `${x.name} at ₹${x.charged} (usual ₹${x.usual})`).join(', ');
  if (mode === 'never') throw new Error(`Only the owner can lower prices: ${what}`);
  throw Object.assign(new Error(`Lower price needs the owner’s PIN: ${what}`), { approval: true });
}

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Indian numbering for invoices: 123456.5 -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim());
const three = (n) => [n >= 100 && `${ONES[Math.floor(n / 100)]} Hundred`, two(n % 100)].filter(Boolean).join(' ');
export function inWords(amount) {
  const paise = Math.round(Math.abs(amount) * 100), r = Math.floor(paise / 100), p = paise % 100;
  const parts = [[Math.floor(r / 1e7), 'Crore'], [Math.floor(r / 1e5) % 100, 'Lakh'], [Math.floor(r / 1000) % 100, 'Thousand'], [r % 1000, '']]
    .filter(([n]) => n).map(([n, w]) => `${n >= 100 && w ? inWords(n).slice(7, -5) : three(n)} ${w}`.trim()); // crores can exceed 99
  return `Rupees ${parts.join(' ') || 'Zero'}${p ? ` and ${two(p)} Paise` : ''} Only`;
}

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// GST state codes
export const STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

// Online order lifecycle (shared by POS + web tracking)
export const ORDER_FLOW = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
export const ORDER_LABEL = {
  pending_payment: 'Awaiting payment', placed: 'Order placed', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped',
  out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled',
};
// Store pickup orders (address.pickup) skip the courier: packed = ready at the counter, delivered = collected.
export const isPickup = (o) => o?.address?.pickup === true || o?.address?.pickup === 'true';
export const PICKUP_FLOW = ['placed', 'confirmed', 'packed', 'delivered'];
export const PICKUP_LABEL = { ...ORDER_LABEL, packed: 'Ready for pickup', delivered: 'Picked up' };
export const flowOf = (o) => (isPickup(o) ? PICKUP_FLOW : ORDER_FLOW);
export const labelOf = (o, status = o?.status) => (isPickup(o) ? PICKUP_LABEL : ORDER_LABEL)[status];

export const GOALS = {
  'muscle-gain': 'Muscle Gain', 'weight-loss': 'Weight Loss', endurance: 'Energy & Endurance', wellness: 'Daily Wellness',
};
// Sorted [code, name] pairs — object keys like '10' would otherwise iterate before '01'.
export const STATE_LIST = Object.entries(STATES).sort(([a], [b]) => a.localeCompare(b));

// Why a row can't be deleted, or null. rows(t) = live rows of a table; balanceOf(party_id) = what the party owes (+) / is owed (−).
// Deletes are soft (Recycle Bin), but a party with money outstanding would silently drop out of dues, and journals / items
// would point at nothing.
export function deleteBlocker(t, id, rows, balanceOf) {
  if (t === 'parties') {
    const b = round2(balanceOf(id) || 0);
    if (b) return `This party ${b > 0 ? 'owes you' : 'is owed'} ${inr(Math.abs(b))}. Settle the balance first`;
  }
  if (t === 'accounts' && rows('journals').some((j) => (j.lines || []).some((l) => l.account === 'acc:' + id))) return 'Journal entries use this account. Delete those entries first';
  if (t === 'companies') {
    const n = rows('branches').filter((b) => b.company_id === id).length;
    if (n) return `${n} branch${n > 1 ? 'es / warehouses are' : ' / warehouse is'} in this company. Move or delete them first`;
  }
  if (t === 'categories') {
    const n = rows('items').filter((i) => i.category_id === id).length;
    if (n) return `${n} item${n > 1 ? 's are' : ' is'} in this category. Move them first`;
    if (rows('categories').some((c) => c.parent_id === id)) return 'It has sub-categories. Move or delete them first';
  }
  return null;
}

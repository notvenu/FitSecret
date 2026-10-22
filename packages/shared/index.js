// Shared between POS server, POS UI and web storefront.

// ---------- Synced tables ----------
// Single source of truth for every table that lives in BOTH SQLite (offline) and Postgres (Supabase).
// supabase/migrations/*.sql must declare the same columns; apps/pos/test/sync.test.js checks parity.
// Types: uuid | text | int | num | bool | json | ts | date
export const COMMON = { id: 'uuid', created_at: 'ts', updated_at: 'ts', deleted: 'bool' };

export const TABLES = {
  branches: { code: 'text', name: 'text', address: 'text', phone: 'text', gstin: 'text', state_code: 'text', is_online: 'bool', settings: 'json' },
  categories: { name: 'text', slug: 'text', sort: 'int', image: 'text', parent_id: 'uuid' },
  items: {
    name: 'text', slug: 'text', group_key: 'text', sku: 'text', barcode: 'text', brand: 'text', category_id: 'uuid',
    flavour: 'text', size: 'text', unit: 'text', hsn: 'text', gst_rate: 'num', mrp: 'num', sale_price: 'num',
    purchase_price: 'num', low_stock: 'num', online: 'bool', featured: 'bool', goals: 'json', description: 'text', image: 'text',
    wholesale_price: 'num', wholesale_min_qty: 'num', location: 'text', model: 'text',
  },
  parties: { type: 'text', name: 'text', phone: 'text', email: 'text', gstin: 'text', address: 'text', state_code: 'text', opening_balance: 'num', credit_limit: 'num',
    shipping_address: 'text', group_name: 'text', payment_terms: 'int', extra: 'json' },
  invoices: {
    branch_id: 'uuid', type: 'text', no: 'text', date: 'date', party_id: 'uuid', party_name: 'text', party_phone: 'text',
    party_gstin: 'text', party_state: 'text', tax_inclusive: 'bool', subtotal: 'num', discount: 'num', taxable: 'num',
    cgst: 'num', sgst: 'num', igst: 'num', round_off: 'num', total: 'num', paid: 'num', status: 'text', notes: 'text',
    order_id: 'uuid', created_by: 'text',
    due_date: 'date', ship_to: 'text', party_extra: 'json', tcs: 'num', currency: 'text', fx_rate: 'num',
  },
  invoice_lines: {
    invoice_id: 'uuid', item_id: 'uuid', name: 'text', hsn: 'text', batch_no: 'text', expiry: 'date', qty: 'num', rate: 'num',
    mrp: 'num', discount_pct: 'num', gst_rate: 'num', taxable: 'num', tax: 'num', total: 'num', cost: 'num', sort: 'int', serial: 'text', mfg: 'date',
  },
  stock_movements: { branch_id: 'uuid', item_id: 'uuid', qty: 'num', batch_no: 'text', expiry: 'date', ref_type: 'text', ref_id: 'uuid', note: 'text', mfg: 'date' },
  payments: { branch_id: 'uuid', party_id: 'uuid', invoice_id: 'uuid', direction: 'text', amount: 'num', mode: 'text', date: 'date', note: 'text', tds: 'num' },
  expenses: { branch_id: 'uuid', category: 'text', amount: 'num', mode: 'text', date: 'date', note: 'text' },
  orders: {
    order_no: 'text', user_id: 'uuid', branch_id: 'uuid', name: 'text', phone: 'text', email: 'text', address: 'json',
    subtotal: 'num', shipping: 'num', discount: 'num', total: 'num', payment_method: 'text', payment_status: 'text',
    payment_ref: 'text', status: 'text', courier: 'text', awb: 'text', tracking_url: 'text', notes: 'text', invoice_id: 'uuid', coupon: 'text', internal_note: 'text',
  },
  order_lines: { order_id: 'uuid', item_id: 'uuid', name: 'text', variant: 'text', qty: 'num', price: 'num', total: 'num' },
  order_events: { order_id: 'uuid', status: 'text', note: 'text' },
  // Accounting (Vyapar's Chart of Accounts / Journal Entries). type: fixed_asset | current_asset | capital | loan | current_liability | income | expense.
  accounts: { branch_id: 'uuid', name: 'text', type: 'text', opening_balance: 'num', note: 'text' },
  // lines: [{ account: 'acc:<uuid>' | 'mode:<cash|upi|card|bank>', debit, credit }]; debits must equal credits.
  journals: { branch_id: 'uuid', no: 'text', date: 'date', note: 'text', lines: 'json' },
  // Website offers (Online Store → Offers). place_order applies them server-side; rules mirrored in store.js couponDiscount.
  coupons: { code: 'text', kind: 'text', value: 'num', min_order: 'num', max_discount: 'num', starts: 'date', ends: 'date',
    usage_limit: 'int', per_phone: 'int', active: 'bool', public: 'bool', note: 'text' },
  // Website inbox (Online Store → Inbox): product reviews, contact messages, back-in-stock requests. Customers write via submit_feedback.
  // status: new | approved | hidden (reviews) · new | done (messages) · new | notified (restock)
  feedback: { kind: 'text', item_id: 'uuid', order_no: 'text', name: 'text', phone: 'text', email: 'text', rating: 'int', title: 'text', body: 'text',
    status: 'text', reply: 'text', verified: 'bool' },
};

export const columnsOf = (t) => ({ ...COMMON, ...TABLES[t] });

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

export function calcInvoice(lines, { inclusive = true, interState = false } = {}) {
  let subtotal = 0, taxable = 0, tax = 0, gross = 0;
  const out = lines.map((l) => {
    const c = calcLine(l, inclusive);
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
    lines: out, subtotal, taxable, cgst, sgst, igst,
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

export const GOALS = {
  'muscle-gain': 'Muscle Gain', 'weight-loss': 'Weight Loss', endurance: 'Energy & Endurance', wellness: 'Daily Wellness',
};
// Sorted [code, name] pairs — object keys like '10' would otherwise iterate before '01'.
export const STATE_LIST = Object.entries(STATES).sort(([a], [b]) => a.localeCompare(b));

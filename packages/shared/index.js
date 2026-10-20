// Shared between POS server, POS UI and web storefront.

// ---------- Synced tables ----------
// Single source of truth for every table that lives in BOTH SQLite (offline) and Postgres (Supabase).
// supabase/migrations/0001_init.sql must declare the same columns; apps/pos/test/sync.test.js checks parity.
// Types: uuid | text | int | num | bool | json | ts | date
export const COMMON = { id: 'uuid', created_at: 'ts', updated_at: 'ts', deleted: 'bool' };

export const TABLES = {
  branches: { code: 'text', name: 'text', address: 'text', phone: 'text', gstin: 'text', state_code: 'text', is_online: 'bool' },
  categories: { name: 'text', slug: 'text', sort: 'int', image: 'text', parent_id: 'uuid' },
  items: {
    name: 'text', slug: 'text', group_key: 'text', sku: 'text', barcode: 'text', brand: 'text', category_id: 'uuid',
    flavour: 'text', size: 'text', unit: 'text', hsn: 'text', gst_rate: 'num', mrp: 'num', sale_price: 'num',
    purchase_price: 'num', low_stock: 'num', online: 'bool', featured: 'bool', goals: 'json', description: 'text', image: 'text',
  },
  parties: { type: 'text', name: 'text', phone: 'text', email: 'text', gstin: 'text', address: 'text', state_code: 'text', opening_balance: 'num' },
  invoices: {
    branch_id: 'uuid', type: 'text', no: 'text', date: 'date', party_id: 'uuid', party_name: 'text', party_phone: 'text',
    party_gstin: 'text', party_state: 'text', tax_inclusive: 'bool', subtotal: 'num', discount: 'num', taxable: 'num',
    cgst: 'num', sgst: 'num', igst: 'num', round_off: 'num', total: 'num', paid: 'num', status: 'text', notes: 'text',
    order_id: 'uuid', created_by: 'text',
  },
  invoice_lines: {
    invoice_id: 'uuid', item_id: 'uuid', name: 'text', hsn: 'text', batch_no: 'text', expiry: 'date', qty: 'num', rate: 'num',
    mrp: 'num', discount_pct: 'num', gst_rate: 'num', taxable: 'num', tax: 'num', total: 'num', cost: 'num', sort: 'int',
  },
  stock_movements: { branch_id: 'uuid', item_id: 'uuid', qty: 'num', batch_no: 'text', expiry: 'date', ref_type: 'text', ref_id: 'uuid', note: 'text' },
  payments: { branch_id: 'uuid', party_id: 'uuid', invoice_id: 'uuid', direction: 'text', amount: 'num', mode: 'text', date: 'date', note: 'text' },
  expenses: { branch_id: 'uuid', category: 'text', amount: 'num', mode: 'text', date: 'date', note: 'text' },
  orders: {
    order_no: 'text', user_id: 'uuid', branch_id: 'uuid', name: 'text', phone: 'text', email: 'text', address: 'json',
    subtotal: 'num', shipping: 'num', discount: 'num', total: 'num', payment_method: 'text', payment_status: 'text',
    payment_ref: 'text', status: 'text', courier: 'text', awb: 'text', tracking_url: 'text', notes: 'text', invoice_id: 'uuid',
  },
  order_lines: { order_id: 'uuid', item_id: 'uuid', name: 'text', variant: 'text', qty: 'num', price: 'num', total: 'num' },
  order_events: { order_id: 'uuid', status: 'text', note: 'text' },
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

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

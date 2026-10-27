// What a cashier login may see and change. Owners (role admin) can do everything. Each cashier login carries its own set
// (users.perms); a login without one gets STANDARD = the minimum (Counter): bill customers, day close, look up items, add a customer.
// The counter server checks these on every request; the menu and screens use the same `can` to hide what is off.
export const CAPS = [
  ['Screens they can open', [
    ['sale_docs', 'Estimates, orders & challans', 'Quotations, proforma, sale orders, delivery challans'],
    ['returns', 'Sale returns', 'Take goods back and refund'],
    ['purchase', 'Purchases', 'Purchase bills, orders and returns'],
    ['payments', 'Payments in & out', 'Receive dues, pay suppliers'],
    ['expenses', 'Expenses', 'Record shop expenses'],
    ['dayclose', 'Day close', 'Count the drawer at the end of the day'],
    ['parties', 'Customers & suppliers', 'Party list, follow-ups, loyalty'],
    ['items', 'Item list', 'See items and stock'],
    ['reports', 'Reports', 'Sales, stock and party reports (never profit unless allowed below)'],
    ['online', 'Online store', 'Website orders and products'],
    ['offers', 'Offers', 'Coupons, combos and near-expiry offers'],
    ['cash', 'Cash & bank', 'Balances, statements, moving money'],
    ['accounting', 'Accounting', 'Journals and chart of accounts'],
    ['staff', 'Staff attendance & payroll', 'Mark attendance, pay salaries'],
    ['insights', 'Insights', 'Recommendations and the weekly plan'],
  ]],
  ['What they can change', [
    ['items_edit', 'Add & edit items', 'New items, sizes / flavours, prices, categories'],
    ['stock', 'Correct stock', 'Stock ± and opening stock'],
    ['transfer', 'Transfer stock', 'Move stock between branches and warehouses'],
    ['parties_edit', 'Add & edit customers / suppliers', ''],
    ['edit_bills', 'Edit saved bills', 'Change a bill after it is saved'],
    ['cancel_bills', 'Cancel bills', 'Cancel a bill (stock and money go back)'],
    ['delete', 'Delete records', 'Items, parties, expenses… (they go to the recycle bin)'],
    ['see_cost', 'See cost price & profit', 'Purchase prices, margins, profit reports'],
  ]],
];
export const CAP_KEYS = CAPS.flatMap(([, l]) => l.map(([k]) => k));
const set = (...ks) => Object.fromEntries(CAP_KEYS.map((k) => [k, ks.includes(k)]));
export const PRESETS = {
  counter: ['Counter (default)', 'Bills customers, day close, looks up items and stock', set('dayclose', 'items', 'parties_edit')],
  senior: ['Senior cashier', 'Also returns, estimates & orders, receives dues, customer list, website orders', set('dayclose', 'items', 'parties_edit', 'returns', 'sale_docs', 'payments', 'parties', 'online')],
  manager: ['Manager', 'Runs the branch: everything except settings, logins and companies', set(...CAP_KEYS)],
};
export const STANDARD = PRESETS.counter[2];
// A saved set is complete: anything not in it is off. No saved set = STANDARD.
export const permsOf = (user) => (user?.role === 'admin' ? set(...CAP_KEYS) : { ...set(), ...(user?.perms || STANDARD) });
export const can = (user, cap) => !cap || user?.role === 'admin' || !!permsOf(user)[cap];

// Bill types and the permission each one needs (a plain sale needs none).
export const DOC_CAP = { estimate: 'sale_docs', proforma: 'sale_docs', sale_order: 'sale_docs', delivery_challan: 'sale_docs', sale_return: 'returns',
  purchase: 'purchase', purchase_order: 'purchase', purchase_return: 'purchase' };

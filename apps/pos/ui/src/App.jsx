import { useEffect, useState } from 'react';
import { STATE_LIST } from '@fitsecret/shared';
import { api, setToken, useRoute, go, fail, toast, setShop, useApi } from './api.js';
import { can, DOC_CAP } from '@fitsecret/shared/permissions';
import { CloudLogin, CLOUD } from '@backend';
import { Btn, Field, Modal, Toasts, Kbd, cx, useForm, useHotkeys } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Billing from './pages/Billing.jsx';
import Invoices, { TYPE_LABEL } from './pages/Invoices.jsx';
import Items from './pages/Items.jsx';
import Parties from './pages/Parties.jsx';
import Reports from './pages/Reports.jsx';
import Expenses from './pages/Expenses.jsx';
import Settings from './pages/Settings.jsx';
import Print from './pages/Print.jsx';
import Help from './pages/Help.jsx';
import Payments from './pages/Payments.jsx';
import CashBank from './pages/CashBank.jsx';
import Utilities, { TITLES as TOOL_TITLES, GROUPS as TOOL_GROUPS } from './pages/Utilities.jsx';
import Accounting from './pages/Accounting.jsx';
import Loyalty from './pages/Loyalty.jsx';
import Staff, { TABS as STAFF_TABS } from './pages/Staff.jsx';
import DayClose from './pages/DayClose.jsx';
import FollowUps from './pages/FollowUps.jsx';
import Insights from './pages/Insights.jsx';
import Locations from './pages/Locations.jsx';
import { t } from './i18n.js';
import OnlineMode, { OrderPrint, OfferLabels, Offers, Inbox } from './pages/Online.jsx';
import Orders from './pages/Orders.jsx';

// Same menu, names and order as Vyapar desktop so staff can switch without retraining.
// Leaf: [label, list href, '+' href]; a leaf with only a label is a heading. Who sees it: allowed() below
const I = {
  branches: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 10h.01M15 10h.01',
  offers: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01',
  home: 'M3 12l9-8 9 8M5 10v10h14V10', parties: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  items: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8', sale: 'M7 3h10l2 3v15l-3-2-2 2-2-2-2 2-2-2-3 2V6z',
  purchase: 'M6 6h15l-2 9H8L6 3H3M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18', dayclose: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2', pay: 'M4 8h15l-4-4M20 16H5l4 4', reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  utilities: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  help: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003.6 15H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.6V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  pos: 'M4 4h16v10H4zM8 20h8M12 14v6',
  accounting: 'M4 3h16v18H4zM8 7h8M8 11h8M8 15h5',
  online: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  staff: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.1a4 4 0 010 7.8M22 21a7 7 0 00-4-6.3',
  insights: 'M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z',
};
export const MENU = [
  { label: 'Home', icon: I.home, href: '' },
  { label: 'Parties', icon: I.parties, children: [['Party Details', 'parties', 'parties?new=1'], ['Follow-ups', 'followups'], ['Loyalty Points', 'loyalty']] },
  { label: 'Items', icon: I.items, href: 'items', plus: 'items?new=1', plusCap: 'items_edit' },
  // Groups whose page has its own side list take their entries from that page's list, in the same order and with the same names.
  // A child with only a label is a small heading inside the group.
  { label: 'Quick Billing', icon: I.sale, href: 'pos' }, // full-screen billing, several bills at once
  { label: 'Day Close', icon: I.dayclose, href: 'dayclose' },
  { label: 'Bills & documents', icon: I.purchase, children: ['Sale', 'Purchase'].flatMap((g) => [[g],
    ...Object.entries(TYPE_LABEL).filter(([k]) => k.startsWith('purchase') === (g === 'Purchase')).map(([k, l]) => [l, 'invoices?type=' + k, 'bill/' + k])]) },
  { label: 'Payments', icon: I.pay, children: [
    ['Payment-In', 'payments/in', 'payments/in?new=1'], ['Payment-Out', 'payments/out', 'payments/out?new=1'], ['Expenses', 'expenses'],
  ] },
  { label: 'Cash & Bank', icon: I.bank, children: [['All accounts', 'cash?tab=all'], ['Bank & UPI', 'cash?tab=bank'], ['Cash in hand', 'cash?tab=cash'], ['Cheques', 'cash?tab=cheque']] },
  { label: 'Accounting', icon: I.accounting, children: [
    ['Chart of Accounts', 'accounting?tab=accounts', 'accounting?tab=accounts&new=1'], ['Journal Entries', 'accounting?tab=journals', 'accounting?tab=journals&new=1'],
    ['Account Statements', 'accounting?tab=statement'],
  ] },
  { label: 'Staff', icon: I.staff, children: STAFF_TABS.map(([k, l]) => [l, 'staff?tab=' + k, k === 'list' ? 'staff?tab=list&new=1' : null]) },
  { label: 'Offers', icon: I.offers, href: 'offers' }, // coupons, combos, near-expiry: counter and website (same page as Online → Offers)
  { label: 'Companies & Branches', icon: I.branches, href: 'locations', admin: true }, // companies, their branches / warehouses, stock per location, transfers, restock
  { label: 'Online Store', icon: I.online, href: 'online' }, // full-screen website section (orders, products, offers…)
  { label: 'Reports', icon: I.reports, href: 'reports' },
  { label: 'Insights', icon: I.insights, href: 'insights' },
  { label: 'Utilities', icon: I.utilities, admin: true, children: TOOL_GROUPS.flatMap(([g, keys]) => [[g], ...keys.map((k) => [TOOL_TITLES[k], 'utilities/' + k])]) },
  { label: 'Settings', icon: I.settings, href: 'settings', admin: true },
  { label: 'Help', icon: I.help, href: 'help' },
];
// What this user sees: document types the shop switched off are hidden (Settings → Counter), and a cashier on the
// short menu sees only the counter screens.
// Offers from the main menu: coupon usage counts still come from website orders.
function OffersPage(props) { const orders = useApi(props.admin && can(props.user, 'online') ? '/orders' : null); return <Offers {...props} orders={orders} base="/offers" />; }
const SIMPLE = ['', 'items', 'invoices?type=sale', 'invoices?type=sale_return', 'pos', 'dayclose', 'payments/in', 'parties', 'followups', 'loyalty', 'help'];
const docOf = (h) => (h || '').match(/(?:type=|bill\/)([a-z_]+)/)?.[1];
// The permission each screen needs (shared/permissions.js); 'admin' = owners only. Bills need the one for their type.
const PAGE_CAP = { dayclose: 'dayclose', followups: 'parties', parties: 'parties', loyalty: 'parties', items: 'items', payments: 'payments', expenses: 'expenses',
  offers: 'offers', reports: 'reports', insights: 'insights', cash: 'cash', staff: 'staff', accounting: 'accounting', online: 'online', orders: 'online',
  locations: 'admin', utilities: 'admin', settings: 'admin' };
export const allowed = (user, h = '') => {
  const p0 = h.split(/[/?]/)[0], cap = ['invoices', 'bill'].includes(p0) ? DOC_CAP[docOf(h) || 'sale'] : PAGE_CAP[p0];
  if (h.startsWith('staff?tab=logins')) return user?.role === 'admin' && !CLOUD; // logins live on each counter PC
  return cap === 'admin' ? user?.role === 'admin' : can(user, cap);
};
export function visibleMenu(user, settings) {
  const admin = user?.role === 'admin';
  const hidden = settings?.invoice?.hidden_docs || [], simple = !admin && settings?.simple_cashier;
  const ok = (h) => !hidden.includes(docOf(h)) && (!simple || SIMPLE.includes(h)) && allowed(user, h);
  return MENU.filter((m) => admin || !m.admin).map((m) => (m.plusCap && !can(user, m.plusCap) ? { ...m, plus: null } : m))
    .map((m) => (m.children ? { ...m, children: m.children.filter(([, h]) => !h || ok(h)) } : m))
    .map((m) => (m.children ? { ...m, children: m.children.filter(([, h], i, a) => h || a[i + 1]?.[1]) } : m)) // a heading needs an entry under it
    .filter((m) => (m.children ? m.children.length : ok(m.href)));
}
// Vyapar desktop shortcuts
export const SHORTCUTS = [
  ['alt+s', 'Sale invoice', 'bill/sale'], ['alt+p', 'Purchase bill', 'bill/purchase'], ['alt+i', 'Payment-In', 'payments/in?new=1'],
  ['alt+o', 'Payment-Out', 'payments/out?new=1'], ['alt+e', 'Expense', 'expenses'], ['alt+r', 'Sale return', 'bill/sale_return'],
  ['alt+f', 'Sale order', 'bill/sale_order'], ['alt+m', 'Estimate/ Quotation', 'bill/estimate'], ['alt+d', 'Delivery challan', 'bill/delivery_challan'],
  ['alt+g', 'Purchase order', 'bill/purchase_order'], ['alt+l', 'Purchase return', 'bill/purchase_return'], ['alt+b', 'Quick Billing', 'pos'],
  ['alt+w', 'Online Store', 'online'], ['alt+h', 'Home', ''], ['alt+c', 'Day close', 'dayclose'],
  ['ctrl+f', 'Open Anything', null], ['F1', 'New sale', 'bill/sale'],
];
// Everything on the "?" screen. The app is usable without a mouse: these plus Tab / Shift+Tab, Enter and the arrow keys.
const KEYS = [
  ['Anywhere', [['ctrl+f', 'Open any screen, party, item or invoice'], ['?', 'This list'], ['/', 'Jump to the search box on the page'], ['Tab', 'Next button or box (Shift+Tab: back)'],
    ['↓', 'From a search box into the list below'], ['↑ ↓ then Enter', 'Move through a list and open a row'], ['Esc', 'Close a window'], ['ctrl+enter', 'Save the form in a window']]],
  ['Billing', [['F2', 'Item search (type 3*whey for 3 units)'], ['F3', 'Customer (type phone or name, ↑ ↓, Enter)'], ['F4', 'Amount received'], ['F6', 'Discount on bill'],
    ['F7', 'Next payment mode'], ['F8', 'More options'], ['↑', 'From an empty search: edit the last line'], ['↑ ↓', 'Move between lines (Enter or Esc: back to search)'],
    ['ctrl+delete', 'Remove the line'], ['F9', 'Save & print'], ['ctrl+enter', 'Save']]],
  ['Quick Billing', [['alt+n', 'New bill'], ['alt+1 … alt+9', 'Switch to bill 1-9'], ['alt+x', 'Close this bill']]],
];
// Logo file: ui/public/logo.png. Falls back to a wordmark until it's added.
export function Logo({ className = 'h-9' }) {
  const [ok, setOk] = useState(true);
  return ok ? <img src={import.meta.env.BASE_URL + 'logo.png'} alt="Fit Secrets" className={cx(className, 'w-auto')} onError={() => setOk(false)} />
    : <span className="display text-2xl leading-none text-ink">FIT<span className="text-brand-d">·</span>SECRETS</span>;
}
export const Icon = ({ d, className = 'h-[18px] w-[18px]' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

export default function App() {
  const [boot, setBoot] = useState(null);
  const load = () => api('/bootstrap').then((b) => { setShop(b.branch); setBoot(b); }, fail);
  useEffect(() => {
    load();
    const on = () => load();
    addEventListener('fs-auth', on);
    return () => removeEventListener('fs-auth', on);
  }, []);
  const route = useRoute();

  if (!boot) return <div className="grid h-screen place-items-center text-sm text-black/40">Starting FitSecret…</div>;
  // bills carry the company's legal name and GSTIN; the branch shows as the outlet under it
  const co = (boot.companies || []).find((c) => c.id === boot.branch?.company_id);
  const seller = co && boot.branch ? { ...boot.branch, name: co.legal_name || co.name, gstin: boot.branch.gstin || co.gstin, address: boot.branch.address || co.address, outlet: boot.branch.name } : boot.branch;
  if (route.parts[0] === 'print' && boot.user) return <Print id={route.parts[1]} fmt={route.parts[2]} branch={seller} />;
  if (route.parts[0] === 'offer-labels' && boot.user) return <OfferLabels branch={boot.branch} />;
  if (route.parts[0] === 'online-print' && boot.user) return <OrderPrint kind={route.parts[1]} ids={(route.query.ids || '').split(',')} branch={boot.branch} />;
  return (
    <>
      <Toasts />
      {boot.setup ? <Setup onDone={load} /> : !boot.user ? (CloudLogin ? <CloudLogin boot={boot} onDone={load} /> : <Login boot={boot} onDone={load} />)
        : CLOUD ? <OrdersConsole boot={boot} route={route} reload={load} /> : <Shell boot={boot} route={route} reload={load} />}
    </>
  );
}

function Shell({ boot, route, reload }) {
  const [sync, setSync] = useState(boot.sync);
  const [finder, setFinder] = useState(false);
  const [keys, setKeys] = useState(false);
  const [nav, setNav] = useState(false); // sidebar drawer on phones / small screens
  useEffect(() => setNav(false), [location.hash]);
  useEffect(() => {
    const t = setInterval(() => api('/sync').then(setSync, () => setSync((s) => ({ ...s, state: 'server-down' }))), 5000);
    return () => clearInterval(t);
  }, []);
  const admin = boot.user.role === 'admin';
  const menu = visibleMenu(boot.user, boot.branch?.settings);
  // One menu group open at a time: the one holding the current screen opens by itself when you get there.
  const here_ = location.hash.slice(2);
  const isHere = (h) => h === here_ || (!!h && here_.startsWith(h) && /^[/?&]?$/.test(here_[h.length] ?? ''));
  const currentGroup = menu.find((m) => m.children?.some(([, h]) => isHere(h)))?.label;
  const [openGroup, setOpenGroup] = useState(currentGroup);
  useEffect(() => setOpenGroup(currentGroup), [currentGroup]);
  // POS switch is remembered per counter, so a billing-only PC opens straight into POS mode.
  useEffect(() => { const m = localStorage.getItem('fs_mode'); if (!route.parts.length && ['pos', 'online'].includes(m)) go('/' + m); }, []);
  useHotkeys({
    ...Object.fromEntries(SHORTCUTS.filter(([, , h]) => h != null).map(([k, , h]) => [k, () => go('/' + h)])),
    'ctrl+f': () => setFinder(true),
    '?': () => setKeys(true),
    '/': () => document.querySelector('main input:not([type=date]):not([type=checkbox]):not([type=file])')?.focus(),
  });
  // ↓ in a page's search / filter box moves into the list under it (Billing's own boxes handle ↓ themselves).
  useEffect(() => {
    const down = (e) => {
      if (e.key !== 'ArrowDown' || e.defaultPrevented || e.altKey || e.ctrlKey || document.querySelector('[role=dialog]')) return;
      if (!e.target.matches?.('main input:not([type=date]):not([type=number]):not([type=checkbox]):not([list])')) return;
      const row = e.target.closest('main').querySelector('tbody tr[tabindex]');
      if (row) { e.preventDefault(); row.focus(); }
    };
    addEventListener('keydown', down);
    return () => removeEventListener('keydown', down);
  }, []);
  const [p0, p1] = route.parts;
  const props = { boot, route, reload, user: boot.user, branch: boot.branch };
  if (p0 === 'pos') return <PosMode {...props} />;
  const blocked = !allowed(boot.user, location.hash.slice(2)); // a screen this login may not open (menu hides it; this covers links and shortcuts)
  if ((p0 === 'online' || p0 === 'orders') && !blocked) return <OnlineMode {...props} sync={sync} route={p0 === 'orders' ? { ...route, parts: ['online', 'orders'] } : route} />;
  const page = blocked ? <NoAccess user={boot.user} /> : {
    undefined: <Dashboard {...props} />, bill: <Billing key={p1 + ['from', 'copy', 'edit', 'ret', 'exchange', 'low'].map((k) => route.query[k] || '').join('|')} type={p1} {...props} />,
    dayclose: <DayClose {...props} />, followups: <FollowUps key={route.query.tab} {...props} />, insights: <Insights {...props} />,
    invoices: <Invoices key={route.query.type + route.query.q + route.query.branch} {...props} />, payments: <Payments key={p1 + route.query.new} dir={p1} {...props} />,
    items: <Items key={route.query.q + route.query.new} {...props} />, parties: <Parties key={route.query.q + route.query.new} {...props} />,
    offers: <OffersPage {...props} admin={can(boot.user, 'offers')} />, locations: <Locations key={route.query.tab + route.query.from + route.query.item} {...props} />, expenses: <Expenses {...props} />, reports: <Reports {...props} />, settings: <Settings {...props} />, help: <Help />,
    cash: <CashBank key={route.query.tab} {...props} />, loyalty: <Loyalty {...props} />,
    staff: <Staff key={route.query.tab + route.query.new} {...props} />,
    accounting: <Accounting key={route.query.tab + route.query.new + route.query.account} {...props} />, utilities: <Utilities key={p1} tool={p1} {...props} />,
  }[p0];
  const here = location.hash.slice(2);
  const logout = () => api('/logout', {}).finally(() => { setToken(null); reload(); });

  return (
    <div className="flex h-screen">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.querySelector('main')?.querySelector('input, button, a, [tabindex]')?.focus(); }}
        className="no-print sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink">Skip to page</a>
      {nav && <div className="no-print fixed inset-0 z-20 bg-ink/40 lg:hidden" onClick={() => setNav(false)} />}
      <aside className={cx('no-print fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col bg-ink text-white/85 transition-transform lg:static lg:translate-x-0', nav ? 'translate-x-0' : '-translate-x-full')}>
        <button onClick={() => setFinder(true)} className="m-3 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-left text-[14px] text-white/60 hover:bg-white/15">
          <span className="flex-1">{t('Open Anything')}</span><kbd className="text-[10px] opacity-70">Ctrl+F</kbd>
        </button>
        <nav className="scroll-dark flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 pb-2 text-[15px]" aria-label="Main menu">
          {menu.map((m) => <MenuEntry key={m.label} m={m} isHere={isHere} open={openGroup === m.label} holdsCurrent={currentGroup === m.label}
            onToggle={() => setOpenGroup(openGroup === m.label ? null : m.label)} />)}
        </nav>
        <SyncPill s={sync} />
        <div className="mx-2 mb-2 flex items-center gap-2 rounded-full bg-ink-2 px-3 py-2 text-xs">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20 font-bold">{boot.branch?.name?.[0]}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold uppercase">{boot.branch?.name}</span>
            {(boot.companies || []).find((c) => c.id === boot.branch?.company_id) && <span className="block truncate text-[11px] text-brand">{boot.companies.find((c) => c.id === boot.branch.company_id).name}</span>}
            <span className="text-white/70">{boot.user.name} · {boot.user.role}</span></span>
          <button onClick={logout} className="rounded-full px-2 py-1 font-medium hover:bg-white/15">{t('Lock')}</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-2 border-b border-line bg-white px-3 py-2 text-sm sm:px-4">
          <button onClick={() => setNav(true)} className="rounded-lg p-1.5 hover:bg-black/5 lg:hidden" aria-label="Menu">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Logo className="h-7" />
          <Switcher boot={boot} reload={reload} admin={admin} route={route} />
          <button onClick={() => setKeys(true)} className="ml-3 hidden items-center gap-1.5 text-black/55 hover:text-ink md:flex">{t('Shortcuts')} <Kbd>?</Kbd></button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { localStorage.setItem('fs_mode', 'pos'); go('/pos'); }} className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink md:flex" title="Full-screen billing, several bills at once">
              <Icon d={I.pos} className="h-4 w-4" /> {t('Quick Billing')}
            </button>
            {can(boot.user, 'online') && <a href="#/online" className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink md:flex" title="Website orders, products, offers (Alt+W)">
              <Icon d={I.online} className="h-4 w-4" /> {t('Online Store')}
            </a>}
            <a href="#/bill/sale" className="rounded-full bg-brand-d px-4 py-1.5 text-xs font-bold text-white hover:brightness-110">{t('+ Add Sale')}</a>
            {can(boot.user, 'purchase') && <a href="#/bill/purchase" className="hidden rounded-full bg-flame px-4 py-1.5 text-xs font-bold text-white hover:brightness-110 sm:block">{t('+ Add Purchase')}</a>}
          </div>
        </header>
        <main id="main" className="flex-1 overflow-y-auto">{page || <div className="p-10">Not found</div>}</main>
      </div>
      {finder && <OpenAnything menu={menu} onClose={() => setFinder(false)} />}
      {keys && <Modal wide title="Keyboard shortcuts" onClose={() => setKeys(false)}>
        <div className="grid gap-x-8 gap-y-5 text-sm md:grid-cols-2">
          {[...KEYS, ['Go to (Alt + letter, like Vyapar)', SHORTCUTS.filter(([k]) => k.startsWith('alt') || k === 'F1').map(([k, l]) => [k, l])]].map(([g, rows]) => (
            <section key={g}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-black/50">{g}</h3>
              <dl>{rows.map(([k, l]) => (
                <div key={k + l} className="flex items-center justify-between gap-4 border-b border-line py-1"><dt>{l}</dt><dd className="shrink-0"><Kbd>{k}</Kbd></dd></div>
              ))}</dl>
            </section>
          ))}
        </div>
      </Modal>}
    </div>
  );
}

// A top-level entry, or a group whose sub-screens show when it's open. The group holding the current screen stays bold with
// a green mark even when folded, so you always see where you are. Labels never wrap, so every page's menu looks the same.
function MenuEntry({ m, isHere, open, holdsCurrent, onToggle }) {
  const row = 'flex items-center gap-3 rounded-xl px-3 py-[clamp(0.4rem,1.25vh,0.95rem)] transition-colors'; // grows with window height; whole menu fits a 768 px laptop screen
  if (!m.children) return (
    <div className={cx(row, (m.href === '' ? isHere('') && location.hash.slice(2) === '' : isHere(m.href)) ? 'bg-brand font-semibold text-ink' : 'hover:bg-ink-2')}>
      <a href={'#/' + m.href} className="flex min-w-0 flex-1 items-center gap-3" aria-current={isHere(m.href) && m.href ? 'page' : undefined}>
        <Icon d={m.icon} className="h-[22px] w-[22px] shrink-0" /> <span className="truncate">{t(m.label)}</span></a>
      {m.plus && <a href={'#/' + m.plus} className="text-lg leading-none text-white/60 hover:text-white" aria-label={`Add ${m.label}`}>+</a>}
    </div>
  );
  return (
    <div>
      <button onClick={onToggle} className={cx(row, 'w-full hover:bg-ink-2', holdsCurrent && !open && 'font-semibold text-white')} aria-expanded={open}>
        <Icon d={m.icon} className="h-[22px] w-[22px] shrink-0" /> <span className="min-w-0 flex-1 truncate text-left tracking-[-0.01em]">{t(m.label)}</span>
        {holdsCurrent && !open && <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />}
        <svg viewBox="0 0 24 24" className={cx('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && m.children.map(([label, href, plus]) => (!href
        ? <div key={label} className="pb-0.5 pl-12 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/40">{t(label)}</div> : (
        <div key={label} className={cx('flex items-center rounded-xl py-[clamp(0.35rem,1vh,0.7rem)] pl-12 pr-3 text-[14px]', isHere(href) ? 'bg-brand font-semibold text-ink' : 'hover:bg-ink-2')}>
          <a href={'#/' + href} className="min-w-0 flex-1 truncate" aria-current={isHere(href) ? 'page' : undefined}>{t(label)}</a>
          {plus && <a href={'#/' + plus} className="text-lg leading-none text-white/60 hover:text-white" aria-label={`New ${label}`}>+</a>}
        </div>
      )))}
    </div>
  );
}

// The website's /admin: the Online Orders console. Website orders and the inbox, nothing else (see apps/web/admin).
function OrdersConsole({ boot, route, reload }) {
  const orders = useApi('/orders'), inbox = useApi('/t/feedback');
  useEffect(() => { const t = setInterval(() => { orders.reload(); inbox.reload(); }, 20000); return () => clearInterval(t); }, []);
  const tab = route.parts[0] === 'inbox' ? 'inbox' : 'orders';
  const fresh = orders.data?.filter((o) => o.status === 'placed').length || 0, unread = inbox.data?.filter((f) => f.status === 'new').length || 0;
  const signOut = () => api('/logout', {}).finally(reload);
  return (
    <div className="min-h-screen">
      <header className="no-print flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <Logo className="h-7" /><span className="display text-lg">Online orders</span>
        <nav className="ml-4 flex gap-1" aria-label="Console">
          {[['orders', 'Orders', fresh], ['inbox', 'Inbox', unread]].map(([k, l, n]) => (
            <a key={k} href={'#/' + (k === 'orders' ? '' : k)} aria-current={tab === k ? 'page' : undefined}
              className={cx('rounded-full px-4 py-1.5 text-sm font-semibold', tab === k ? 'bg-ink text-white' : 'hover:bg-black/5')}>{l}{n > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-xs text-white">{n}</span>}</a>
          ))}
        </nav>
        <span className="ml-auto text-sm text-black/55">{boot.user.name}</span>
        <button onClick={signOut} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-ink">Sign out</button>
      </header>
      {tab === 'orders' ? <Orders boot={boot} list={orders} siteUrl={boot.branch.settings.store.site_url} /> : <Inbox inbox={inbox} store={boot.branch.settings.store} />}
    </div>
  );
}

// Ctrl+F: jump to any screen, party or item by typing.
function OpenAnything({ menu, onClose }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [data, setData] = useState({ items: [], parties: [] });
  useEffect(() => { Promise.all([api('/items'), api('/parties')]).then(([items, parties]) => setData({ items, parties }), () => {}); }, []);
  const screens = menu.flatMap((m) => m.children
    ? m.children.filter(([, h]) => h).flatMap(([l, h, plus]) => [[l, h, m.label], ...(plus ? [[`New ${l.split('/')[0]}`, plus, 'Create']] : [])])
    : [[m.label, m.href, 'Screen']]);
  const s = q.trim().toLowerCase();
  const res = [
    ...screens.filter(([l]) => l.toLowerCase().includes(s)).map(([l, h, g]) => ({ l, h, g })),
    ...(s.length > 1 ? [
      ...data.parties.filter((p) => `${p.name} ${p.phone}`.toLowerCase().includes(s)).slice(0, 5).map((p) => ({ l: p.name, h: 'parties?q=' + encodeURIComponent(p.name), g: 'Party' })),
      ...data.items.filter((i) => `${i.name} ${i.barcode} ${i.sku}`.toLowerCase().includes(s)).slice(0, 6).map((i) => ({ l: i.name, h: 'items?q=' + encodeURIComponent(i.name), g: `Item · ${i.stock} in stock` })),
      { l: `Find invoice “${q.trim()}”`, h: 'invoices?type=sale&q=' + encodeURIComponent(q.trim()), g: 'Search' },
    ] : []),
  ].slice(0, 14);
  const pick = (r) => { if (r) { go('/' + r.h); onClose(); } };
  return (
    <Modal title="Open Anything" onClose={onClose}>
      <input autoFocus className="input mb-2 py-2.5 text-base" placeholder="Type a screen, party, item or invoice no…" value={q}
        onChange={(e) => { setQ(e.target.value); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, res.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter') pick(res[hi]);
        }} />
      <ul className="max-h-[55vh] overflow-y-auto">
        {res.map((r, i) => (
          <li key={r.g + r.l + i} onMouseEnter={() => setHi(i)} onClick={() => pick(r)}
            className={cx('flex cursor-pointer justify-between rounded-lg px-3 py-2 text-sm', i === hi && 'bg-brand/15')}>
            <span className="font-medium">{r.l}</span><span className="text-xs text-black/45">{r.g}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// Vyapar POS-style counter: full screen, several bills open at once (hold one, serve the next customer).
// Open tabs and their half-made bills are kept in this browser (Billing's `hold`), so a refresh or power cut loses nothing.
function PosMode(props) {
  const [bills, setBills] = useState(() => { try { const b = JSON.parse(localStorage.getItem('fs_pos_bills')); return b?.length ? b : [1]; } catch { return [1]; } });
  const [cur, setCur] = useState(bills[0]);
  useEffect(() => { localStorage.setItem('fs_pos_bills', JSON.stringify(bills)); }, [bills]);
  const add = () => { const n = Math.max(0, ...bills) + 1; setBills([...bills, n]); setCur(n); };
  const close = (n) => {
    const rest = bills.filter((b) => b !== n); if (!rest.length) return;
    localStorage.removeItem(`fs_hold_${n}`); setBills(rest); if (cur === n) setCur(rest[rest.length - 1]);
  };
  const exit = () => { localStorage.removeItem('fs_mode'); go('/'); };
  useHotkeys({ 'alt+n': add, 'alt+x': () => close(cur), ...Object.fromEntries([...Array(9)].map((_, i) => [`alt+${i + 1}`, () => bills[i] && setCur(bills[i])])) });
  return (
    <div className="flex h-screen flex-col">
      <header className="no-print flex items-center gap-2 bg-ink px-3 pt-1.5 text-sm text-white">
        <span className="mr-3 pb-1.5 font-semibold tracking-wide">Quick Billing · {props.branch?.name}</span>
        {bills.map((n) => (
          <span key={n} className={cx('flex items-center gap-1 rounded-t-lg px-3 py-1.5', n === cur ? 'bg-paper text-ink' : 'bg-white/10 hover:bg-white/20')}>
            <button onClick={() => setCur(n)} title={bills.indexOf(n) < 9 ? `Alt+${bills.indexOf(n) + 1}` : undefined}>Bill {n}</button>
            {bills.length > 1 && <button onClick={() => close(n)} className="px-1 opacity-50 hover:opacity-100" aria-label={`Close bill ${n}`} title="Alt+X">✕</button>}
          </span>
        ))}
        <button onClick={add} className="mb-1 rounded-full px-2 text-lg hover:bg-white/15" title="New bill (Alt+N)" aria-label="New bill">+</button>
        <span className="ml-auto pb-1.5 text-xs text-white/60">{props.user.name}</span>
        <button onClick={exit} className="mb-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25">Exit Quick Billing</button>
      </header>
      <div className="min-h-0 flex-1">
        {bills.map((n) => <div key={n} className={cx('h-full', n !== cur && 'hidden')}><Billing type="sale" pos hold={n} active={n === cur} {...props} /></div>)}
      </div>
    </div>
  );
}

// Company › branch this counter works as. The owner switches between any of them here (same as "Work here").
// Owners also get "overview" entries: every company and branch at once, or one whole company (Companies & Branches page).
// Billing stays at the branch this counter works as.
function Switcher({ boot, reload, admin, route }) {
  const mine = boot.user?.branches; // a cashier with several branches on their login switches between those only
  const cos = boot.companies || [], bs = (boot.branches || []).filter((b) => !b.deleted && (admin || mine?.includes(b.id)));
  const co = cos.find((c) => c.id === boot.branch?.company_id);
  if (!(admin || mine?.length > 1) || (bs.length < 2 && !admin)) return co ? <span className="ml-3 hidden text-xs font-semibold text-black/55 sm:block">{co.name} · {boot.branch?.name}</span> : null;
  const groups = [...cos.map((c) => [c.name, bs.filter((b) => b.company_id === c.id)]), [cos.length ? 'Not in a company' : 'Branches', bs.filter((b) => !cos.some((c) => c.id === b.company_id))]].filter(([, l]) => l.length);
  // a branch: work there; a company: work at its first store (or stay, if already in it); All: the overview of everything.
  // Switching keeps you on the page you are on.
  const pick = (v) => {
    if (v === 'ov:all') return go('/locations');
    const id = v.startsWith('co:') ? (co?.id === v.slice(3) ? boot.branch.id : (bs.find((b) => b.company_id === v.slice(3) && b.kind !== 'warehouse') || bs.find((b) => b.company_id === v.slice(3)))?.id) : v;
    if (!id) return toast('That company has no branch yet. Add one in Companies & Branches', 'err');
    if (id === boot.branch?.id) return;
    api('/branch/use', { id }).then(() => { toast(`Now working at ${bs.find((b) => b.id === id)?.name}`); reload(); }, fail);
  };
  const viewing = admin && route?.parts[0] === 'locations' && !route.query.tab && !route.query.co ? 'ov:all' : boot.branch?.id; // on the overview: "All"
  return (
    <label className="ml-3 flex min-w-0 items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-ink">
      <span className="hidden text-black/45 sm:inline">{viewing?.startsWith('ov:') ? 'Overview' : co ? co.name : 'Working at'}</span>
      <select value={viewing} onChange={(e) => pick(e.target.value)} aria-label="Switch company and branch, or see an overview" className="min-w-0 max-w-[16rem] cursor-pointer truncate bg-transparent font-semibold outline-none">
        {/* All = overview of everything; a company or a branch = work there, same page */}
        {admin && <option value="ov:all" style={{ fontWeight: 700 }}>All (overview)</option>}
        {groups.map(([g, l]) => { const c = cos.find((x) => x.name === g); return [
          admin && c ? <option key={c.id} value={'co:' + c.id} style={{ fontWeight: 700 }}>{g}</option> : <option key={g} disabled style={{ fontWeight: 700 }}>{g}</option>, // companies bold, branches indented under them
          ...l.map((b) => <option key={b.id} value={b.id}>{'    '}{b.name}{b.kind === 'warehouse' ? ' (warehouse)' : ''}</option>)]; })}
      </select>
    </label>
  );
}

function NoAccess({ user }) {
  return (
    <div className="mx-auto max-w-md p-10 text-center">
      <div className="display text-3xl">Not for this login</div>
      <p className="mt-2 text-sm text-black/60">{user?.name} can’t open this screen. The owner can allow it in Staff → Logins &amp; PINs.</p>
      <a href="#/" className="mt-5 inline-block rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white">Go home</a>
    </div>
  );
}

export function SyncPill({ s }) {
  const map = {
    online: ['bg-brand', 'Cloud synced'], syncing: ['bg-sky-400 animate-pulse', 'Syncing…'], offline: ['bg-amber-400', 'Offline, billing locally'],
    error: ['bg-red-500', 'Sync error'], off: ['bg-white/30', 'Cloud sync off'], 'server-down': ['bg-red-500', 'POS server unreachable'],
  };
  const [dot, label] = map[s?.state] || map.off;
  return (<>
    <a href="#/settings" title={s?.error || ''} className="mx-2 mb-2 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-white/70 hover:bg-ink-2">
      <span className={cx('h-2 w-2 rounded-full', dot)} />
      <span className="flex-1">{label}</span>
      {s?.pending > 0 && <span className="rounded bg-white/15 px-1.5 tabular-nums">{s.pending}</span>}
    </a>
    {/* spelled out: until this clears, nothing reaches the cloud or the website */}
    {s?.state === 'error' && s.error && <p className="mx-3 mb-2 rounded-lg bg-red-500/20 p-2 text-[11px] leading-snug text-red-100">Changes aren't reaching the cloud / website: {s.error}</p>}
  </>);
}

function Login({ boot, onDone }) {
  const [user, setUser] = useState(boot.users[0]?.id);
  const [pin, setPin] = useState('');
  const submit = async (p = pin) => {
    try { const r = await api('/login', { user_id: user, pin: p }); setToken(r.token); onDone(); }
    catch (e) { fail(e); setPin(''); }
  };
  const press = (d) => {
    const p = d === '⌫' ? pin.slice(0, -1) : (pin + d).slice(0, 6);
    setPin(p);
  };
  useHotkeys({ Enter: () => submit() });
  return (
    <div className="grid min-h-screen place-items-center bg-paper p-4">
      <div className="rise w-full max-w-sm rounded-[14px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Logo className="h-12" />
          <div><div className="font-semibold">{boot.branch?.name}</div><div className="text-xs text-black/50">Enter your PIN to unlock</div></div>
        </div>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-black/60">Who is signing in</span>
          <select className="input text-base" value={user || ''} onChange={(e) => { setUser(e.target.value); setPin(''); }} aria-label="Who is signing in">
            {['admin', 'cashier'].map((r) => boot.users.some((u) => u.role === r) && (
              <optgroup key={r} label={r === 'admin' ? 'Owners' : 'Cashiers'}>{boot.users.filter((u) => u.role === r).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <input autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="input mb-3 text-center text-2xl tracking-[.5em]" aria-label="PIN" />
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '→'].map((d) => (
            <button key={d} onClick={() => (d === '→' ? submit() : press(d))}
              className={cx('rounded-[14px] py-3 text-lg font-medium transition active:scale-95', d === '→' ? 'bg-brand hover:bg-ink hover:text-white' : 'bg-black/5 hover:bg-black/10')}>{d}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Setup({ onDone }) {
  const [f, , bind] = useForm({ name: 'Fit Secrets Vijayawada', code: 'VJA', address: '38-8-7, Datta Towers, MG Road, Vijayawada', phone: '9704108079', gstin: '', state_code: '37', admin: '', pin: '', catalog: true, demoStock: false });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/setup', { branch: { name: f.name, code: f.code.toUpperCase(), address: f.address, phone: f.phone, gstin: f.gstin.toUpperCase(), state_code: f.state_code, is_online: true }, admin: { name: f.admin, pin: f.pin }, catalog: f.catalog, demoStock: f.demoStock });
      toast('Store ready. Log in with your PIN.');
      onDone();
    } catch (e) { fail(e); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-paper p-4">
      <form onSubmit={submit} className="rise w-full max-w-xl rounded-[14px] border border-black/10 bg-white p-7 shadow-sm">
        <Logo className="mb-4 h-12" />
        <h1 className="display text-2xl">Set up the billing system</h1>
        <p className="mb-5 text-sm text-black/55">Works fully offline. Connect cloud sync later in Settings.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Store name" {...bind('name')} required className="col-span-2" />
          <Field label="Branch code (on invoices)" {...bind('code')} required maxLength={5} hint="e.g. VJA, GNT" />
          <Field label="State"><select className="input" {...bind('state_code')}>{STATE_LIST.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></Field>
          <Field label="Address" {...bind('address')} className="col-span-2" />
          <Field label="Phone" {...bind('phone')} />
          <Field label="GSTIN" {...bind('gstin')} />
          <Field label="Owner name" {...bind('admin')} required />
          <Field label="Owner PIN (4-6 digits)" {...bind('pin')} required type="password" inputMode="numeric" pattern="\d{4,6}" />
          <label className="col-span-2 flex items-center gap-2 text-sm"><input {...bind('catalog', 'checkbox')} /> Import the Fit Secrets catalogue (574 products from fitsecretsstore.com)</label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-black/55"><input {...bind('demoStock', 'checkbox')} /> Add sample opening stock (testing only, not for the real shop)</label>
        </div>
        <Btn v="brand" type="submit" className="mt-6 w-full py-3">Create store</Btn>
      </form>
    </div>
  );
}

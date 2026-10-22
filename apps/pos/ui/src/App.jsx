import { useEffect, useState } from 'react';
import { STATE_LIST } from '@fitsecret/shared';
import { api, setToken, useRoute, go, fail, toast } from './api.js';
import { CloudLogin } from '@backend';
import { Btn, Field, Modal, Toasts, cx, useForm, useHotkeys } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Billing from './pages/Billing.jsx';
import Invoices from './pages/Invoices.jsx';
import Items from './pages/Items.jsx';
import Parties from './pages/Parties.jsx';
import Reports from './pages/Reports.jsx';
import Expenses from './pages/Expenses.jsx';
import Settings from './pages/Settings.jsx';
import Print from './pages/Print.jsx';
import Help from './pages/Help.jsx';
import Payments from './pages/Payments.jsx';
import CashBank from './pages/CashBank.jsx';
import Utilities from './pages/Utilities.jsx';
import Accounting from './pages/Accounting.jsx';
import Loyalty from './pages/Loyalty.jsx';
import OnlineMode, { OrderPrint } from './pages/Online.jsx';

// Same menu, names and order as Vyapar desktop so staff can switch without retraining.
// Leaf: [label, list href, '+' href, admin-only]
const I = {
  home: 'M3 12l9-8 9 8M5 10v10h14V10', parties: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  items: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8', sale: 'M7 3h10l2 3v15l-3-2-2 2-2-2-2 2-2-2-3 2V6z',
  purchase: 'M6 6h15l-2 9H8L6 3H3M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18', reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  utilities: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  help: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003.6 15H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.6V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  pos: 'M4 4h16v10H4zM8 20h8M12 14v6',
  accounting: 'M4 3h16v18H4zM8 7h8M8 11h8M8 15h5',
  online: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
};
export const MENU = [
  { label: 'Home', icon: I.home, href: '' },
  { label: 'Parties', icon: I.parties, children: [['Party Details', 'parties', 'parties?new=1'], ['Loyalty Points', 'loyalty']] },
  { label: 'Items', icon: I.items, href: 'items', plus: 'items?new=1' },
  { label: 'Sale', icon: I.sale, children: [
    ['Sale Invoices', 'invoices?type=sale', 'bill/sale'], ['Estimate/ Quotation', 'invoices?type=estimate', 'bill/estimate'],
    ['Proforma Invoice', 'invoices?type=proforma', 'bill/proforma'], ['Payment-In', 'payments/in', 'payments/in?new=1'],
    ['Sale Order', 'invoices?type=sale_order', 'bill/sale_order'], ['Delivery Challan', 'invoices?type=delivery_challan', 'bill/delivery_challan'],
    ['Sale Return/ Credit Note', 'invoices?type=sale_return', 'bill/sale_return'], ['POS Billing', 'pos'],
  ] },
  { label: 'Purchase & Expense', icon: I.purchase, children: [
    ['Purchase Bills', 'invoices?type=purchase', 'bill/purchase'], ['Payment-Out', 'payments/out', 'payments/out?new=1'],
    ['Expenses', 'expenses', null, true], ['Purchase Order', 'invoices?type=purchase_order', 'bill/purchase_order'],
    ['Purchase Return/ Dr. Note', 'invoices?type=purchase_return', 'bill/purchase_return'],
  ] },
  { label: 'Cash & Bank', icon: I.bank, admin: true, children: [['Bank Accounts', 'cash?tab=bank'], ['Cash In Hand', 'cash?tab=cash'], ['Cheques', 'cash?tab=cheque']] },
  { label: 'Accounting', icon: I.accounting, admin: true, children: [
    ['Journal Entries', 'accounting?tab=journals', 'accounting?tab=journals&new=1'], ['Chart of Accounts', 'accounting?tab=accounts', 'accounting?tab=accounts&new=1'],
    ['Account Statements', 'accounting?tab=statement'],
  ] },
  { label: 'Online Store', icon: I.online, href: 'online' }, // full-screen website section (orders, products, offers…)
  { label: 'Reports', icon: I.reports, href: 'reports' },
  { label: 'Utilities', icon: I.utilities, admin: true, children: [
    ['Import Items', 'utilities/import-items'], ['Barcode Generator', 'utilities/barcode'], ['Update Items In Bulk', 'utilities/bulk'],
    ['Import Parties', 'utilities/import-parties'], ['Export Items', 'utilities/export'], ['Recycle Bin', 'utilities/trash'], ['Verify My Data', 'utilities/verify'],
    ['Import From Tally', 'utilities/import-tally'], ['Export To Tally', 'utilities/tally-export'],
  ] },
  { label: 'Settings', icon: I.settings, href: 'settings', admin: true },
  { label: 'Help', icon: I.help, href: 'help' },
];
// Vyapar desktop shortcuts
export const SHORTCUTS = [
  ['alt+s', 'Sale invoice', 'bill/sale'], ['alt+p', 'Purchase bill', 'bill/purchase'], ['alt+i', 'Payment-In', 'payments/in?new=1'],
  ['alt+o', 'Payment-Out', 'payments/out?new=1'], ['alt+e', 'Expense', 'expenses'], ['alt+r', 'Sale return', 'bill/sale_return'],
  ['alt+f', 'Sale order', 'bill/sale_order'], ['alt+m', 'Estimate/ Quotation', 'bill/estimate'], ['alt+d', 'Delivery challan', 'bill/delivery_challan'],
  ['alt+g', 'Purchase order', 'bill/purchase_order'], ['alt+l', 'Purchase return', 'bill/purchase_return'], ['alt+b', 'POS billing', 'pos'],
  ['alt+w', 'Online Store', 'online'],
  ['ctrl+f', 'Open Anything', null], ['F1', 'New sale', 'bill/sale'],
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
  const load = () => api('/bootstrap').then(setBoot, fail);
  useEffect(() => {
    load();
    const on = () => load();
    addEventListener('fs-auth', on);
    return () => removeEventListener('fs-auth', on);
  }, []);
  const route = useRoute();

  if (!boot) return <div className="grid h-screen place-items-center text-sm text-black/40">Starting FitSecret…</div>;
  if (route.parts[0] === 'print' && boot.user) return <Print id={route.parts[1]} fmt={route.parts[2]} branch={boot.branch} />;
  if (route.parts[0] === 'online-print' && boot.user) return <OrderPrint kind={route.parts[1]} ids={(route.query.ids || '').split(',')} branch={boot.branch} />;
  return (
    <>
      <Toasts />
      {boot.setup ? <Setup onDone={load} /> : !boot.user ? (CloudLogin ? <CloudLogin boot={boot} onDone={load} /> : <Login boot={boot} onDone={load} />) : <Shell boot={boot} route={route} reload={load} />}
    </>
  );
}

function Shell({ boot, route, reload }) {
  const [sync, setSync] = useState(boot.sync);
  const [finder, setFinder] = useState(false);
  const [keys, setKeys] = useState(false);
  useEffect(() => {
    const t = setInterval(() => api('/sync').then(setSync, () => setSync((s) => ({ ...s, state: 'server-down' }))), 5000);
    return () => clearInterval(t);
  }, []);
  const admin = boot.user.role === 'admin';
  // POS switch is remembered per counter, so a billing-only PC opens straight into POS mode.
  useEffect(() => { const m = localStorage.getItem('fs_mode'); if (!route.parts.length && ['pos', 'online'].includes(m)) go('/' + m); }, []);
  useHotkeys({
    ...Object.fromEntries(SHORTCUTS.filter(([, , h]) => h).map(([k, , h]) => [k, () => go('/' + h)])),
    'ctrl+f': () => setFinder(true),
  });
  const [p0, p1] = route.parts;
  const props = { boot, route, reload, user: boot.user, branch: boot.branch };
  if (p0 === 'pos') return <PosMode {...props} />;
  if (p0 === 'online' || p0 === 'orders') return <OnlineMode {...props} route={p0 === 'orders' ? { ...route, parts: ['online', 'orders'] } : route} />;
  const page = {
    undefined: <Dashboard {...props} />, bill: <Billing key={p1 + (route.query.from || '') + (route.query.copy || '')} type={p1} {...props} />,
    invoices: <Invoices key={route.query.type + route.query.q} {...props} />, payments: <Payments key={p1 + route.query.new} dir={p1} {...props} />,
    items: <Items key={route.query.q + route.query.new} {...props} />, parties: <Parties key={route.query.q + route.query.new} {...props} />,
    expenses: <Expenses {...props} />, reports: <Reports {...props} />, settings: <Settings {...props} />, help: <Help />,
    cash: admin && <CashBank key={route.query.tab} {...props} />, loyalty: <Loyalty {...props} />,
    accounting: admin && <Accounting key={route.query.tab + route.query.new + route.query.account} {...props} />, utilities: admin && <Utilities key={p1} tool={p1} {...props} />,
  }[p0];
  const here = location.hash.slice(2);
  const logout = () => api('/logout', {}).finally(() => { setToken(null); reload(); });

  return (
    <div className="flex h-screen">
      <aside className="no-print flex w-64 shrink-0 flex-col bg-ink text-white/85">
        <button onClick={() => setFinder(true)} className="m-3 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-left text-[14px] text-white/60 hover:bg-white/15">
          <span className="flex-1">Open Anything</span><kbd className="text-[10px] opacity-70">Ctrl+F</kbd>
        </button>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 text-[15.5px]">
          {MENU.filter((m) => admin || !m.admin).map((m) => <MenuEntry key={m.label} m={m} here={here} admin={admin} />)}
        </nav>
        <SyncPill s={sync} />
        <div className="mx-2 mb-2 flex items-center gap-2 rounded-full bg-ink-2 px-3 py-2 text-xs">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20 font-bold">{boot.branch?.name?.[0]}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold uppercase">{boot.branch?.name}</span><span className="text-white/70">{boot.user.name} · {boot.user.role}</span></span>
          <button onClick={logout} className="rounded-full px-2 py-1 font-medium hover:bg-white/15">Lock</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-2 border-b border-line bg-white px-4 py-2 text-sm">
          <Logo className="h-7" />
          <button onClick={() => setKeys(true)} className="ml-3 text-black/55 hover:text-ink">Shortcuts</button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { localStorage.setItem('fs_mode', 'pos'); go('/pos'); }} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink" title="Switch this counter to POS mode">
              <Icon d={I.pos} className="h-4 w-4" /> POS mode
            </button>
            <a href="#/online" className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink" title="Website orders, products, offers (Alt+W)">
              <Icon d={I.online} className="h-4 w-4" /> Online Store
            </a>
            <a href="#/bill/sale" className="rounded-full bg-brand-d px-4 py-1.5 text-xs font-bold text-white hover:brightness-110">+ Add Sale</a>
            <a href="#/bill/purchase" className="rounded-full bg-flame px-4 py-1.5 text-xs font-bold text-white hover:brightness-110">+ Add Purchase</a>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{page || <div className="p-10">Not found</div>}</main>
      </div>
      {finder && <OpenAnything admin={admin} onClose={() => setFinder(false)} />}
      {keys && <Modal title="Keyboard shortcuts" onClose={() => setKeys(false)}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {[...SHORTCUTS, ['F2', 'Search item (billing)'], ['F9', 'Save & print'], ['ctrl+enter', 'Save bill'], ['alt+n', 'New bill (POS mode)']].map(([k, l]) => (
            <div key={k} className="flex justify-between border-b border-line py-1"><dt>{l}</dt><dd><kbd className="rounded bg-black/5 px-1.5 text-xs uppercase">{k}</kbd></dd></div>
          ))}
        </dl>
      </Modal>}
    </div>
  );
}

function MenuEntry({ m, here, admin }) {
  const kids = m.children?.filter(([, , , a]) => admin || !a);
  const active = (h) => h === here || (!!h && here.startsWith(h) && /^[/?]?$/.test(here[h.length] ?? ''));
  const [open, setOpen] = useState(() => !!kids?.some(([, h]) => active(h)));
  const row = 'flex items-center gap-3.5 rounded-xl px-3.5 py-[clamp(0.55rem,1.9vh,1.15rem)] transition-colors'; // grows with window height to fill the sidebar
  if (!kids) return (
    <div className={cx(row, (m.href === '' ? here === '' : active(m.href)) ? 'bg-brand font-semibold text-ink' : 'hover:bg-ink-2')}>
      <a href={'#/' + m.href} className="flex flex-1 items-center gap-3"><Icon d={m.icon} className="h-[22px] w-[22px]" /> {m.label}</a>
      {m.plus && <a href={'#/' + m.plus} className="text-lg leading-none text-white/60 hover:text-white" aria-label={`Add ${m.label}`}>+</a>}
    </div>
  );
  return (
    <div>
      <button onClick={() => setOpen(!open)} className={cx(row, 'w-full hover:bg-ink-2')} aria-expanded={open}>
        <Icon d={m.icon} className="h-[22px] w-[22px]" /> <span className="flex-1 text-left">{m.label}</span>
        <svg viewBox="0 0 24 24" className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && kids.map(([label, href, plus]) => (
        <div key={label} className={cx('flex items-center rounded-xl py-[clamp(0.45rem,1.3vh,0.8rem)] pl-12 pr-3 text-[14.5px]', active(href) ? 'bg-brand font-semibold text-ink' : 'hover:bg-ink-2')}>
          <a href={'#/' + href} className="flex-1">{label}</a>
          {plus && <a href={'#/' + plus} className="text-lg leading-none text-white/60 hover:text-white" aria-label={`New ${label}`}>+</a>}
        </div>
      ))}
    </div>
  );
}

// Ctrl+F: jump to any screen, party or item by typing.
function OpenAnything({ admin, onClose }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [data, setData] = useState({ items: [], parties: [] });
  useEffect(() => { Promise.all([api('/items'), api('/parties')]).then(([items, parties]) => setData({ items, parties }), () => {}); }, []);
  const screens = MENU.filter((m) => admin || !m.admin).flatMap((m) => m.children
    ? m.children.filter(([, , , a]) => admin || !a).flatMap(([l, h, plus]) => [[l, h, m.label], ...(plus ? [[`New ${l.split('/')[0]}`, plus, 'Create']] : [])])
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
function PosMode(props) {
  const [bills, setBills] = useState([1]);
  const [cur, setCur] = useState(1);
  const add = () => { const n = Math.max(0, ...bills) + 1; setBills([...bills, n]); setCur(n); };
  const close = (n) => { const rest = bills.filter((b) => b !== n); if (!rest.length) return; setBills(rest); if (cur === n) setCur(rest[rest.length - 1]); };
  const exit = () => { localStorage.removeItem('fs_mode'); go('/'); };
  useHotkeys({ 'alt+n': add });
  return (
    <div className="flex h-screen flex-col">
      <header className="no-print flex items-center gap-2 bg-ink px-3 pt-1.5 text-sm text-white">
        <span className="mr-3 pb-1.5 font-semibold tracking-wide">POS · {props.branch?.name}</span>
        {bills.map((n) => (
          <span key={n} className={cx('flex items-center gap-1 rounded-t-lg px-3 py-1.5', n === cur ? 'bg-paper text-ink' : 'bg-white/10 hover:bg-white/20')}>
            <button onClick={() => setCur(n)}>Bill {n}</button>
            {bills.length > 1 && <button onClick={() => close(n)} className="px-1 opacity-50 hover:opacity-100" aria-label={`Close bill ${n}`}>✕</button>}
          </span>
        ))}
        <button onClick={add} className="mb-1 rounded-full px-2 text-lg hover:bg-white/15" title="New bill (Alt+N)" aria-label="New bill">+</button>
        <span className="ml-auto pb-1.5 text-xs text-white/60">{props.user.name}</span>
        <button onClick={exit} className="mb-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25">Exit POS mode</button>
      </header>
      <div className="min-h-0 flex-1">
        {bills.map((n) => <div key={n} className={cx('h-full', n !== cur && 'hidden')}><Billing type="sale" pos active={n === cur} {...props} /></div>)}
      </div>
    </div>
  );
}

function SyncPill({ s }) {
  const map = {
    online: ['bg-brand', 'Cloud synced'], syncing: ['bg-sky-400 animate-pulse', 'Syncing…'], offline: ['bg-amber-400', 'Offline, billing locally'],
    error: ['bg-red-500', 'Sync error'], off: ['bg-white/30', 'Cloud sync off'], 'server-down': ['bg-red-500', 'POS server unreachable'],
  };
  const [dot, label] = map[s?.state] || map.off;
  return (
    <a href="#/settings" title={s?.error || ''} className="mx-2 mb-2 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-white/70 hover:bg-ink-2">
      <span className={cx('h-2 w-2 rounded-full', dot)} />
      <span className="flex-1">{label}</span>
      {s?.pending > 0 && <span className="rounded bg-white/15 px-1.5 tabular-nums">{s.pending}</span>}
    </a>
  );
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
        <div className="mb-4 flex flex-wrap gap-1.5">
          {boot.users.map((u) => (
            <button key={u.id} onClick={() => setUser(u.id)} className={cx('rounded-full border px-3 py-1 text-sm', user === u.id ? 'border-ink bg-ink text-white' : 'border-black/15')}>{u.name}</button>
          ))}
        </div>
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

import { useEffect, useState } from 'react';
import { STATE_LIST } from '@fitsecret/shared';
import { api, setToken, useRoute, go, fail, toast } from './api.js';
import { CloudLogin } from '@backend';
import { Btn, Field, Toasts, cx, useForm, useHotkeys } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Billing from './pages/Billing.jsx';
import Invoices from './pages/Invoices.jsx';
import Items from './pages/Items.jsx';
import Parties from './pages/Parties.jsx';
import Orders from './pages/Orders.jsx';
import Reports from './pages/Reports.jsx';
import Expenses from './pages/Expenses.jsx';
import Settings from './pages/Settings.jsx';
import Print from './pages/Print.jsx';
import Help from './pages/Help.jsx';

const NAV = [
  ['', 'Dashboard', 'M3 12l9-8 9 8M5 10v10h14V10'],
  ['bill/sale', 'New Sale', 'M12 5v14M5 12h14', 'F1'],
  ['invoices', 'Invoices', 'M7 3h10l2 3v15l-3-2-2 2-2-2-2 2-2-2-3 2V6z'],
  ['orders', 'Online Orders', 'M3 7h13v10H3zM16 10h3l2 3v4h-5M7 20a2 2 0 100-4 2 2 0 000 4zm11 0a2 2 0 100-4 2 2 0 000 4z'],
  ['items', 'Inventory', 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8'],
  ['bill/purchase', 'Purchase', 'M6 6h15l-2 9H8L6 3H3M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z'],
  ['parties', 'Parties', 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0'],
  ['expenses', 'Expenses', 'M12 3v18M17 7H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
  ['reports', 'Reports', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['help', 'Help', 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01'],
  ['settings', 'Settings', 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003.6 15H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.6V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'],
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
  return (
    <>
      <Toasts />
      {boot.setup ? <Setup onDone={load} /> : !boot.user ? (CloudLogin ? <CloudLogin boot={boot} onDone={load} /> : <Login boot={boot} onDone={load} />) : <Shell boot={boot} route={route} reload={load} />}
    </>
  );
}

function Shell({ boot, route, reload }) {
  const [sync, setSync] = useState(boot.sync);
  useEffect(() => {
    const t = setInterval(() => api('/sync').then(setSync, () => setSync((s) => ({ ...s, state: 'server-down' }))), 5000);
    return () => clearInterval(t);
  }, []);
  useHotkeys({ F1: () => go('/bill/sale') });
  const [p0, p1] = route.parts;
  const props = { boot, route, reload, user: boot.user, branch: boot.branch };
  const page = {
    undefined: <Dashboard {...props} />, bill: <Billing key={p1} type={p1} {...props} />, invoices: <Invoices {...props} />,
    orders: <Orders {...props} />, items: <Items {...props} />, parties: <Parties {...props} />, expenses: <Expenses {...props} />,
    reports: <Reports {...props} />, settings: <Settings {...props} />, help: <Help />,
  }[p0];
  const current = p0 === 'bill' ? `bill/${p1}` : p0 || '';
  const logout = () => api('/logout', {}).finally(() => { setToken(null); reload(); });

  return (
    <div className="flex h-screen">
      <aside className="no-print flex w-56 shrink-0 flex-col border-r border-black/10 bg-white text-ink/70">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div>
            <Logo className="h-9" />
            <div className="mt-1 text-[11px] text-black/45">{boot.branch?.name}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5">
          {NAV.filter(([k]) => boot.user.role === 'admin' || !['settings', 'expenses'].includes(k)).map(([k, label, d, key]) => (
            <a key={k} href={'#/' + k} className={cx('flex items-center gap-3 rounded-full px-3.5 py-2 text-sm transition-colors',
              current === k ? 'bg-ink font-medium text-white' : 'hover:bg-paper hover:text-ink')}>
              <Icon d={d} /> <span className="flex-1">{label}</span>
              {key && <kbd className="text-[10px] opacity-50">{key}</kbd>}
            </a>
          ))}
        </nav>
        <SyncPill s={sync} />
        <div className="flex items-center justify-between border-t border-black/10 px-5 py-3 text-xs">
          <span className="text-ink">{boot.user.name} <span className="text-black/40">· {boot.user.role}</span></span>
          <button onClick={logout} className="font-medium text-black/50 hover:text-ink">Lock</button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{page || <div className="p-10">Not found</div>}</main>
    </div>
  );
}

function SyncPill({ s }) {
  const map = {
    online: ['bg-brand', 'Cloud synced'], syncing: ['bg-sky-500 animate-pulse', 'Syncing…'], offline: ['bg-amber-500', 'Offline, billing locally'],
    error: ['bg-red-500', 'Sync error'], off: ['bg-black/25', 'Cloud sync off'], 'server-down': ['bg-red-600', 'POS server unreachable'],
  };
  const [dot, label] = map[s?.state] || map.off;
  return (
    <a href="#/settings" title={s?.error || ''} className="mx-2.5 mb-2 flex items-center gap-2 rounded-full border border-line px-3.5 py-2 text-xs hover:bg-paper">
      <span className={cx('h-2 w-2 rounded-full', dot)} />
      <span className="flex-1">{label}</span>
      {s?.pending > 0 && <span className="rounded bg-paper px-1.5 tabular-nums">{s.pending}</span>}
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

import { useState } from 'react';
import { STATE_LIST } from '@fitsecret/shared';
import { api, useApi, toast, fail } from '../api.js';
import { CLOUD } from '@backend';
import { Btn, Field, Page, Table, Badge, useForm } from '../ui.jsx';
import { TYPE_LABEL } from './Invoices.jsx';

export default function Settings({ boot, reload }) {
  return (
    <Page title="Settings">
      <div className="grid gap-4 lg:grid-cols-2">
        <Branch b={boot.branch} reload={reload} />
        <InvoiceSettings b={boot.branch} reload={reload} />
        {!CLOUD && <Sync />}
        {!CLOUD && <Users />}
        <Device />
      </div>
    </Page>
  );
}

const Card = ({ title, children }) => <section className="card p-5"><h2 className="mb-4 font-semibold">{title}</h2>{children}</section>;

function Branch({ b, reload }) {
  const [f, , bind] = useForm(b);
  const save = async (e) => {
    e.preventDefault();
    try { await api('/t/branches', { ...f, gstin: f.gstin?.toUpperCase() }); toast('Store details saved'); reload(); } catch (e) { fail(e); }
  };
  return (
    <Card title="Store details (printed on invoices)">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <Field label="Name" {...bind('name')} className="col-span-2" />
        <Field label="Address" {...bind('address')} className="col-span-2" />
        <Field label="Phone" {...bind('phone')} />
        <Field label="GSTIN" {...bind('gstin')} />
        <Field label="State"><select className="input" {...bind('state_code')}>{STATE_LIST.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
        <Field label="Invoice code" value={f.code} disabled hint="Fixed once invoices exist" />
        <Btn v="primary" type="submit" className="col-span-2">Save</Btn>
      </form>
    </Card>
  );
}

// Vyapar's Settings → Transaction / Print / Item toggles that matter for a retail counter. Stored in branches.settings.invoice.
export const INVOICE_DEFAULTS = { words: true, saved: true, upi: '', bank: '', terms: '100% authentic products · Goods once sold can be exchanged within 7 days with bill (sealed packs only)', footer: 'Thank you! Stay fit 💪', block_negative: false, theme: 'classic' };
const THEMES = [['classic', 'Classic'], ['tally', 'Tally (boxed grid)'], ['modern', 'Modern (brand header)']];
const fmtCur = (cs) => (cs || []).map((c) => `${c.code} ${c.rate}`).join(', ');
function InvoiceSettings({ b, reload }) {
  const s = b.settings || {};
  const [f, set, bind] = useForm({ ...INVOICE_DEFAULTS, ...s.invoice, currencies: fmtCur(s.invoice?.currencies) });
  const [prefixes, setPrefixes] = useState(s.prefixes || {});
  const [fields, setFields] = useState([...(s.party_fields || []), '', '', '', ''].slice(0, 4));
  const save = async (e) => {
    e.preventDefault();
    if (f.upi && !/^[\w.-]+@[\w.-]+$/.test(f.upi.trim())) return toast('UPI ID looks wrong (like shopname@okhdfcbank)', 'err');
    // "USD 83.2, AED 22.6" → [{ code, rate }]
    const currencies = String(f.currencies || '').split(',').map((x) => x.trim().split(/\s+/)).filter(([c]) => c)
      .map(([code, rate]) => ({ code: code.toUpperCase().slice(0, 3), rate: +rate }));
    if (currencies.some((c) => !(c.rate > 0) || c.code.length !== 3)) return toast('Currencies look like: USD 83.2, AED 22.6', 'err');
    const bad = Object.values(prefixes).find((p) => p && !/^[A-Za-z0-9-]{1,12}$/.test(p));
    if (bad) return toast(`Prefix "${bad}": letters, numbers and - only`, 'err');
    try {
      await api('/t/branches', { id: b.id, settings: { ...s, invoice: { ...f, upi: f.upi.trim(), currencies },
        prefixes: Object.fromEntries(Object.entries(prefixes).filter(([, v]) => v).map(([k, v]) => [k, v.toUpperCase()])), party_fields: fields.map((x) => x.trim()).filter(Boolean) } });
      toast('Invoice settings saved'); reload();
    } catch (e) { fail(e); }
  };
  const tick = (k, label, hint) => (
    <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-brand-d)]" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />
      <span>{label}{hint && <span className="block text-xs text-black/45">{hint}</span>}</span></label>
  );
  return (
    <Card title="Invoice, print & billing">
      <form onSubmit={save} className="grid gap-3">
        <Field label="UPI ID for payment QR" {...bind('upi')} placeholder="fitsecret@okhdfcbank" hint="Prints a scan-to-pay QR with the exact amount due" />
        <Field label="Bank details on A4 invoice"><textarea className="input" rows={2} {...bind('bank')} placeholder="Bank, A/c no, IFSC" /></Field>
        <Field label="Terms & conditions"><textarea className="input" rows={2} {...bind('terms')} /></Field>
        <Field label="Footer line" {...bind('footer')} />
        {tick('words', 'Amount in words', 'Rupees Four Hundred Twenty Only')}
        {tick('saved', '"You saved" against MRP on receipts')}
        {tick('block_negative', 'Stop sale on negative stock', 'Sale bills cannot take an item below zero')}
        <Field label="A4 invoice layout"><select className="input" {...bind('theme')}>{THEMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <h3 className="mt-2 text-sm font-semibold">More transaction features</h3>
        {tick('serials', 'Serial no. / IMEI on bill lines')}
        {tick('mfg', 'Manufacturing date on purchase batches', 'Printed on invoices next to expiry')}
        {tick('tcs', 'TCS on invoices', 'Adds a TCS % box to bills; see Reports → Taxes')}
        <Field label="Foreign currencies" {...bind('currencies')} placeholder="USD 83.2, AED 22.6" hint="Bills stay in ₹; the invoice also shows the amount in the chosen currency" />
        <h3 className="mt-2 text-sm font-semibold">Invoice number prefixes</h3>
        <p className="-mt-2 text-xs text-black/45">Blank = default ({b.code}-XX). Numbering restarts every financial year: PREFIX/26-27/0001</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TYPE_LABEL).map(([t, l]) => <Field key={t} label={l} value={prefixes[t] || ''} onChange={(e) => setPrefixes({ ...prefixes, [t]: e.target.value })} />)}
        </div>
        <h3 className="mt-2 text-sm font-semibold">Party custom fields</h3>
        <div className="grid grid-cols-2 gap-2">
          {fields.map((x, i) => <Field key={i} label={`Field ${i + 1} name`} value={x} placeholder={['Date of birth', 'Gym', 'Trainer', 'Goal'][i]}
            onChange={(e) => setFields(fields.map((y, j) => (j === i ? e.target.value : y)))} />)}
        </div>
        <Btn v="primary" type="submit">Save</Btn>
      </form>
    </Card>
  );
}

function Sync() {
  const s = useApi('/sync');
  const [f, , bind] = useForm({ url: '', anonKey: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api('/sync/config', { ...f, url: f.url || s.data.url, email: f.email || s.data.email });
      r.state === 'online' ? toast('Connected and synced ✓') : toast(r.error || 'Saved; will retry', r.error ? 'err' : 'ok');
      s.reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const st = s.data;
  return (
    <Card title="Cloud sync (Supabase)">
      {st && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge c={{ online: 'green', offline: 'amber', error: 'red', syncing: 'blue' }[st.state] || 'grey'}>{st.state}</Badge>
          <span className="text-black/55">{st.pending} pending · last sync {st.lastSync ? new Date(st.lastSync).toLocaleTimeString('en-IN') : 'never'}</span>
          {st.error && <span className="w-full text-xs text-red-600">{st.error}</span>}
          {st.configured && <Btn size="sm" className="ml-auto" disabled={busy} onClick={() => { setBusy(true); api('/sync/now', {}).then(s.reload, fail).finally(() => setBusy(false)); }}>Sync now</Btn>}
        </div>
      )}
      <form onSubmit={save} className="grid gap-3">
        <Field label="Project URL" {...bind('url')} placeholder={st?.url || 'https://xxxx.supabase.co'} />
        <Field label="Anon (public) key" {...bind('anonKey')} placeholder={st?.configured ? '•••• saved' : ''} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Staff sync email" {...bind('email')} placeholder={st?.email} />
          <Field label="Password" {...bind('password', 'password')} placeholder={st?.configured ? '•••• saved' : ''} />
        </div>
        <p className="text-xs text-black/50">Billing always works offline. Changes queue locally and upload automatically when the internet is back.</p>
        <Btn v="primary" type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Save & connect'}</Btn>
      </form>
    </Card>
  );
}

function Users() {
  const list = useApi('/users');
  const [f, , bind, setF] = useForm({ name: '', pin: '', role: 'cashier' });
  const add = async (e) => {
    e.preventDefault();
    try { await api('/users', f); toast('User added'); setF({ name: '', pin: '', role: 'cashier' }); list.reload(); } catch (e) { fail(e); }
  };
  const resetPin = async (u) => {
    const pin = prompt(`New 4-6 digit PIN for ${u.name}`);
    if (pin) api('/users', { ...u, pin }).then(() => toast('PIN changed'), fail);
  };
  return (
    <Card title="Staff & PINs">
      <Table rows={list.data} columns={[
        { k: 'name', label: 'Name' }, { k: 'role', label: 'Role', r: (u) => <Badge c={u.role === 'admin' ? 'brand' : 'grey'}>{u.role}</Badge> },
        { label: '', r: (u) => <div className="flex justify-end gap-1">
          <Btn size="sm" v="ghost" onClick={() => resetPin(u)}>Change PIN</Btn>
          <Btn size="sm" v="ghost" onClick={() => api('/users', { ...u, active: !u.active }).then(list.reload, fail)}>{u.active ? 'Disable' : 'Enable'}</Btn>
        </div> },
      ]} />
      <form onSubmit={add} className="mt-3 grid grid-cols-4 items-end gap-2">
        <Field label="Name" {...bind('name')} required />
        <Field label="PIN" {...bind('pin', 'password')} required inputMode="numeric" />
        <Field label="Role"><select className="input" {...bind('role')}><option value="cashier">Cashier</option><option value="admin">Admin</option></select></Field>
        <Btn v="primary" type="submit">Add</Btn>
      </form>
    </Card>
  );
}

function Device() {
  const [fmt, setFmt] = useState(localStorage.getItem('fs_print') || 'thermal');
  const backup = async () => {
    const r = await fetch(import.meta.env.BASE_URL + 'api/backup', { headers: { 'x-token': localStorage.getItem('fs_token') } });
    if (!r.ok) return fail(new Error('Backup failed'));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: `fitsecret-backup-${new Date().toISOString().slice(0, 10)}.db` });
    a.click();
  };
  return (
    <Card title={CLOUD ? 'This device' : 'This counter & backups'}>
      <Field label="Default print format on F9">
        <select className="input" value={fmt} onChange={(e) => { setFmt(e.target.value); localStorage.setItem('fs_print', e.target.value); }}>
          <option value="thermal">Thermal receipt (80mm)</option><option value="a4">A4 tax invoice</option>
        </select>
      </Field>
      {!CLOUD && <>
        <p className="my-4 text-sm text-black/55">The server keeps automatic backups every 6 hours (last 30) in <code className="rounded bg-black/5 px-1">apps/pos/data/backups</code>. Download one to a USB drive or Google Drive weekly.</p>
        <Btn onClick={backup}>Download backup now</Btn>
      </>}
    </Card>
  );
}

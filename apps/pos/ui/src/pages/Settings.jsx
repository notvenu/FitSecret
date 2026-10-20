import { useState } from 'react';
import { STATE_LIST } from '@fitsecret/shared';
import { api, useApi, toast, fail } from '../api.js';
import { CLOUD } from '@backend';
import { Btn, Field, Page, Table, Badge, useForm } from '../ui.jsx';

export default function Settings({ boot, reload }) {
  return (
    <Page title="Settings">
      <div className="grid gap-4 lg:grid-cols-2">
        <Branch b={boot.branch} reload={reload} />
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

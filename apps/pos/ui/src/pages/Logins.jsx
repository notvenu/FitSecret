// Staff → Logins & PINs (owners only, counter PCs): who can unlock this counter, their PIN, what they may do
// (shared/permissions.js) and which branches they work at. Logins live on each counter PC, not in the cloud.
import { useState } from 'react';
import { CAPS, CAP_KEYS, PRESETS, STANDARD } from '@fitsecret/shared/permissions';
import { api, useApi, toast, fail } from '../api.js';
import { Btn, Field, Modal, Table, Badge, useForm, cx } from '../ui.jsx';

// Where a login may work: ticked branches only, none ticked = every branch. Owners always work everywhere.
function WhereBoxes({ boot, value, onChange }) {
  const cos = boot.companies || [], bs = (boot.branches || []).filter((x) => !x.deleted);
  if (bs.length < 2) return null;
  const groups = [...cos.map((c) => [c.name, bs.filter((x) => x.company_id === c.id)]), [cos.length ? 'Not in a company' : 'Branches', bs.filter((x) => !cos.some((c) => c.id === x.company_id))]].filter(([, l]) => l.length);
  const flip = (ids, on) => onChange(on ? [...new Set([...value, ...ids])] : value.filter((v) => !ids.includes(v)));
  return (
    <fieldset className="rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-semibold">Can work at</legend>
      <p className="mb-2 text-xs text-black/50">{value.length ? 'Only the ticked branches: they can’t unlock a counter set to any other.' : 'Every branch (nothing ticked).'} Several ticked = they can switch between them.</p>
      {groups.map(([g, l]) => (
        <div key={g} className="mb-2">
          {cos.length > 0 && <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-black/55">
            <input type="checkbox" checked={l.every((x) => value.includes(x.id))} onChange={(e) => flip(l.map((x) => x.id), e.target.checked)} />{g} (whole company)</label>}
          <div className="mt-1 grid gap-1 pl-5 sm:grid-cols-2">{l.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.includes(x.id)} onChange={(e) => flip([x.id], e.target.checked)} />{x.name}</label>
          ))}</div>
        </div>
      ))}
    </fieldset>
  );
}

// What a cashier may open and change: start from a ready-made set, then tick / untick. null = the standard set.
const presetOf = (p) => Object.entries(PRESETS).find(([, [, , v]]) => CAP_KEYS.every((k) => !!v[k] === !!(p || STANDARD)[k]))?.[0];
function PermBoxes({ value, onChange }) {
  const p = { ...STANDARD, ...(value || {}) }, cur = presetOf(p);
  return (
    <fieldset className="rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-semibold">What they can do</legend>
      <div className="mb-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Ready-made sets">{Object.entries(PRESETS).map(([k, [l, d, v]]) => (
        <button key={k} type="button" role="radio" aria-checked={cur === k} onClick={() => onChange({ ...v })}
          className={cx('rounded-[12px] border p-2.5 text-left text-sm', cur === k ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>
          <b className="block">{l}</b><span className={cx('text-xs', cur === k ? 'text-white/70' : 'text-black/50')}>{d}</span></button>
      ))}</div>
      {!cur && <p className="mb-2 text-xs font-semibold text-amber-700">Custom set</p>}
      {CAPS.map(([g, list]) => (
        <div key={g} className="mb-2">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-black/55">{g}</div>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{list.map(([k, l, d]) => (
            <label key={k} className="flex items-start gap-2 text-sm" title={d}><input type="checkbox" className="mt-1" checked={!!p[k]} onChange={(e) => onChange({ ...p, [k]: e.target.checked })} />
              <span>{l}{d && <span className="block text-[11px] text-black/45">{d}</span>}</span></label>
          ))}</div>
        </div>
      ))}
      <p className="text-xs text-black/45">Billing customers is always allowed. Discount limits and price changes are set for the branch above.</p>
    </fieldset>
  );
}

export default function Logins({ boot }) {
  const list = useApi('/users');
  const blank = { name: '', pin: '', role: 'cashier', branches: [], perms: null };
  const [f, set, bind, setF] = useForm(blank);
  const add = async (e) => {
    e.preventDefault();
    try { await api('/users', { ...f, branches: f.role === 'admin' ? [] : f.branches, perms: f.role === 'admin' ? null : f.perms }); toast('User added'); setF(blank); list.reload(); } catch (e) { fail(e); }
  };
  const bName = (id) => boot.branches?.find((x) => x.id === id)?.name;
  const resetPin = async (u) => {
    const pin = prompt(`New 4-6 digit PIN for ${u.name}`);
    if (pin) api('/users', { ...u, pin }).then(() => toast('PIN changed'), fail);
  };
  const [edit, setEdit] = useState(null);
  return (
    <section className="card p-5 sm:p-6">
      <div className="mt-3"><Table rows={list.data} columns={[
        { k: 'name', label: 'Name', r: (u) => <span className={u.active ? 'font-medium' : 'text-black/40 line-through'}>{u.name}</span> },
        { k: 'role', label: 'Role', r: (u) => <Badge c={u.role === 'admin' ? 'brand' : 'grey'}>{u.role === 'admin' ? 'owner / admin' : 'cashier'}</Badge> },
        { k: 'perms', label: 'Can do', r: (u) => <span className="text-xs text-black/60">{u.role === 'admin' ? 'Everything' : PRESETS[presetOf(u.perms)]?.[0] || 'Custom'}</span> },
        ...((boot.branches || []).length > 1 ? [{ k: 'branches', label: 'Works at', r: (u) => <span className="text-xs text-black/60">{u.role === 'admin' || !u.branches?.length ? 'Every branch' : u.branches.map(bName).filter(Boolean).join(', ')}</span> }] : []),
        { label: '', r: (u) => <div className="flex justify-end gap-1">
          <Btn size="sm" v="ghost" onClick={() => setEdit(u)}>Edit</Btn>
          <Btn size="sm" v="ghost" onClick={() => resetPin(u)}>Change PIN</Btn>
          <Btn size="sm" v="ghost" onClick={() => api('/users', { ...u, active: !u.active }).then(list.reload, fail)}>{u.active ? 'Turn off' : 'Turn on'}</Btn>
        </div> },
      ]} /></div>
      <form onSubmit={add} className="mt-4 grid grid-cols-1 items-end gap-2 rounded-xl bg-paper p-3 sm:grid-cols-4">
        <Field label="Name" {...bind('name')} required />
        <Field label="PIN (4-6 digits)" {...bind('pin', 'password')} required inputMode="numeric" pattern="\d{4,6}" />
        <Field label="Role"><select className="input" {...bind('role')}><option value="cashier">Cashier</option><option value="admin">Owner / admin</option></select></Field>
        <Btn v="primary" type="submit">Add login</Btn>
        {f.role !== 'admin' && <div className="grid gap-2 sm:col-span-4"><PermBoxes value={f.perms} onChange={(v) => set('perms', v)} /><WhereBoxes boot={boot} value={f.branches} onChange={(v) => set('branches', v)} /></div>}
      </form>
      {edit && <Modal title={`Edit ${edit.name}`} onClose={() => setEdit(null)}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault();
          api('/users', { id: edit.id, name: edit.name.trim(), role: edit.role, active: edit.active, branches: edit.role === 'admin' ? [] : edit.branches || [], perms: edit.role === 'admin' ? null : edit.perms || null }).then(() => { toast('Login updated'); setEdit(null); list.reload(); }, fail); }}>
          <Field label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus hint="Shown on bills they make" />
          <Field label="Role"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="cashier">Cashier</option><option value="admin">Owner / admin (every branch, all settings)</option></select></Field>
          {edit.role !== 'admin' && <PermBoxes value={edit.perms} onChange={(v) => setEdit({ ...edit, perms: v })} />}
          {edit.role !== 'admin' && <WhereBoxes boot={boot} value={edit.branches || []} onChange={(v) => setEdit({ ...edit, branches: v })} />}
          <p className="text-xs text-black/50">Logins are turned off rather than deleted, so old bills still show who made them.</p>
          <div className="flex justify-end gap-2"><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
        </form>
      </Modal>}
    </section>
  );
}


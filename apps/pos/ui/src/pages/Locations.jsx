// Branches & warehouses: every location in one place. Overview (stock, low items, sales per location), stock by location,
// transfers between any two (FEFO batches, many items at once), restocking a store from the warehouse in one go, and history.
// Logic lives in shared/locations.js; the server checks every transfer again.
import { useMemo, useState } from 'react';
import { inr, STATE_LIST } from '@fitsecret/shared';
import { api, useApi, toast, fail, go } from '../api.js';
import { Btn, Field, Modal, Table, Badge, Loading, SideNav, SectionPage, DeleteBtn, useForm, cx } from '../ui.jsx';

const KIND = { store: 'Store / branch', warehouse: 'Warehouse' };
const TABS = ['overview', 'stock', 'transfer', 'restock', 'history'];
const rs = (v) => inr(v).replace('.00', '');

export default function Locations({ route, boot, branch, reload }) {
  const tab = TABS.includes(route.query.tab) ? route.query.tab : 'overview';
  const open = (t, q = '') => go(`/locations?tab=${t}${q}`);
  const locs = useApi('/reports/x/locations');
  const [edit, setEdit] = useState(null);
  const [co, setCo] = useState(null); // company being added / edited
  const restock = useApi(tab === 'restock' || tab === 'overview' ? '/reports/x/restock' : null);
  const nav = <SideNav title="Locations" value={tab} onChange={(t) => open(t)} groups={[{ items: [
    { key: 'overview', label: 'All locations', desc: 'Stock and sales at each', badge: locs.data?.length },
    { key: 'stock', label: 'Stock by location', desc: 'Every item, every place' },
    { key: 'transfer', label: 'Transfer stock', desc: 'Move items between places' },
    { key: 'restock', label: 'Restock this store', desc: 'Low items, from the warehouse', badge: restock.data?.filter((r) => r.qty > 0).length || undefined },
    { key: 'history', label: 'Transfer history', desc: 'What moved, when' }] }]} />;
  const page = {
    overview: <Overview locs={locs} companies={boot.companies || []} only={route.query.co} here={branch} restockCount={restock.data?.filter((r) => r.qty > 0).length} onEdit={setEdit} onCompany={setCo} reload={reload} open={open} />,
    stock: <StockMatrix open={open} />,
    transfer: <Transfer boot={boot} here={branch} query={route.query} done={() => { locs.reload(); open('history'); }} />,
    restock: <Restock boot={boot} here={branch} list={restock} done={() => { locs.reload(); restock.reload(); }} />,
    history: <History />,
  }[tab];
  const meta = {
    overview: ['Companies & branches', 'Each company has its own name and GSTIN on bills, and its branches and warehouses under it. Each store bills its own customers and keeps its own stock; a warehouse holds stock and sends it to stores.'],
    stock: ['Stock by location', 'How many of each item every branch and warehouse holds. Click an item to move some.'],
    transfer: ['Transfer stock', 'Moves items from one place to another straight away. Earliest-expiring batches go first; expired packs never move.'],
    restock: ['Restock this store', `Items at or below their low-stock alert at ${branch?.name}, topped up to twice the alert from wherever has stock (warehouses first).`],
    history: ['Transfer history', 'Every transfer, newest first.'],
  }[tab];
  return (
    <SectionPage nav={nav} title={meta[0]} hint={meta[1]} actions={tab === 'overview' && <>
      <Btn onClick={() => setCo({})}>+ Add company</Btn>
      <Btn v="primary" onClick={() => setEdit({ kind: 'store', company_id: branch?.company_id || boot.companies?.[0]?.id || '' })}>+ Add branch or warehouse</Btn></>}>
      {page}
      {edit && <LocationForm b={edit} companies={boot.companies || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); locs.reload(); reload(); }} />}
      {co && <CompanyForm c={co} branches={locs.data || []} onClose={() => setCo(null)} onSaved={() => { setCo(null); locs.reload(); reload(); }} />}
    </SectionPage>
  );
}

// One section per company (its totals, then its locations); branches not in any company come last.
function Overview({ locs, companies, only, here, restockCount, onEdit, onCompany, reload, open }) {
  if (!locs.data) return <Loading />;
  const inScope = (b) => !only || b.company_id === only; // ?co=<id>: one whole company (from the switcher)
  const use = (b) => api('/branch/use', { id: b.id }).then(() => { toast(`This counter now works as ${b.name}`); reload(); }, fail);
  const groups = [...companies.map((c) => ({ c, list: locs.data.filter((b) => b.company_id === c.id) })),
    { c: null, list: locs.data.filter((b) => !companies.some((c) => c.id === b.company_id)) }].filter((g) => (g.c || g.list.length) && (!only || g.c?.id === only));
  const sum = (list, k) => list.reduce((s, b) => s + (b[k] || 0), 0);
  const all = locs.data.filter(inScope), stores = all.filter((b) => b.kind === 'store');
  const totals = [['Companies', only ? 1 : companies.length || 1], ['Branches', stores.length], ['Warehouses', all.length - stores.length], ['Stock value', rs(sum(all, 'value'))],
    ['Sales today', rs(sum(all, 'sales_today'))], ['Sales this month', rs(sum(all, 'sales_month'))], ['Bills this month', sum(all, 'bills_month')], ['Low items', sum(all, 'low')]];
  return <>
    {/* everything in scope at once: every company and branch (or one whole company) */}
    <section className="card mb-6 !bg-ink p-5 text-white" aria-label="Overview totals">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-2xl">{only ? `All of ${companies.find((c) => c.id === only)?.name || 'this company'}` : 'All companies & branches'}</h2>
        <div className="flex gap-2">
          {only && <Btn size="sm" className="!border-white/30 !bg-white/10 !text-white hover:!bg-white/20" onClick={() => go("/locations")}>See all companies</Btn>}
          <Btn size="sm" className="!border-white/30 !bg-white/10 !text-white hover:!bg-white/20" onClick={() => go(`/invoices?type=sale&branch=${only ? 'co:' + only : 'all'}`)}>All their bills</Btn>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">{totals.map(([l, v]) => (
        <div key={l}><dt className="text-[11px] text-brand">{l}</dt><dd className="text-xl font-semibold tabular-nums">{v}</dd></div>
      ))}</dl>
    </section>
    {restockCount > 0 && (
      <button onClick={() => open('restock')} className="mb-4 flex w-full items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100">
        <span><b>{restockCount} items</b> are low at {here?.name} and another location has them.</span><b>Restock →</b></button>
    )}
    {groups.map(({ c, list }) => (
    <section key={c?.id || 'none'} className="mb-8">
      <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line pb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-black/45">{c ? 'Company' : companies.length ? 'Not in a company yet' : 'Your locations'}</div>
          <h2 className="display truncate text-2xl">{c ? c.name : companies.length ? 'Unassigned' : 'All branches'}</h2>
          {c && <p className="text-xs text-black/50">{[c.legal_name !== c.name && c.legal_name, c.gstin && `GSTIN ${c.gstin}`].filter(Boolean).join(' · ') || 'No GSTIN yet'}</p>}
        </div>
        <dl className="flex gap-6 text-sm">
          <div><dt className="text-[11px] text-black/50">Locations</dt><dd className="font-semibold tabular-nums">{list.length}</dd></div>
          <div><dt className="text-[11px] text-black/50">Stock value</dt><dd className="font-semibold tabular-nums">{rs(sum(list, 'value'))}</dd></div>
          <div><dt className="text-[11px] text-black/50">Sales today</dt><dd className="font-semibold tabular-nums">{rs(sum(list, 'sales_today'))}</dd></div>
          <div><dt className="text-[11px] text-black/50">This month</dt><dd className="font-semibold tabular-nums">{rs(sum(list, 'sales_month'))}</dd></div>
        </dl>
        <div className="flex gap-2">
          {c ? <><Btn size="sm" onClick={() => go(`/invoices?type=sale&branch=co:${c.id}`)}>Bills</Btn><Btn size="sm" onClick={() => onCompany(c)}>Edit</Btn>
            <Btn size="sm" onClick={() => onEdit({ kind: 'store', company_id: c.id, gstin: c.gstin || '', state_code: c.state_code || '37', address: c.address || '', phone: c.phone || '' })}>+ Branch</Btn></>
            : <Btn size="sm" v="primary" onClick={() => onCompany({ name: list[0]?.name || '', _move: list.map((b) => b.id) })}>{companies.length ? 'Put in a company' : 'Make these a company'}</Btn>}
        </div>
      </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.map((b) => (
        <div key={b.id} className={cx('card flex flex-col p-5', b.id === here?.id && 'ring-2 ring-brand')}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5"><Badge c={b.kind === 'warehouse' ? 'blue' : 'green'}>{KIND[b.kind]}</Badge>{b.id === here?.id && <Badge c="brand">this counter</Badge>}</div>
              <h3 className="mt-1.5 truncate text-lg font-semibold">{b.name} <span className="font-mono text-xs text-black/40">{b.code}</span></h3>
              {b.address && <p className="truncate text-xs text-black/50">{b.address}</p>}
            </div>
            <button className="text-xs font-semibold text-brand-d hover:underline" onClick={() => onEdit(b)}>Edit</button>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-[11px] text-black/50">Units</dt><dd className="font-semibold tabular-nums">{b.units}</dd></div>
            <div><dt className="text-[11px] text-black/50">Stock value</dt><dd className="truncate font-semibold tabular-nums">{rs(b.value)}</dd></div>
            {b.kind === 'store' ? <div><dt className="text-[11px] text-black/50">Low items</dt><dd className={cx('font-semibold tabular-nums', b.low > 0 && 'text-amber-700')}>{b.low}</dd></div>
              : <div><dt className="text-[11px] text-black/50">Items held</dt><dd className="font-semibold tabular-nums">{b.skus}</dd></div>}
            {b.kind === 'store' && <>
              <div><dt className="text-[11px] text-black/50">Sales today</dt><dd className="truncate font-semibold tabular-nums">{rs(b.sales_today)}</dd></div>
              <div><dt className="text-[11px] text-black/50">This month</dt><dd className="truncate font-semibold tabular-nums">{rs(b.sales_month)}</dd></div>
              <div><dt className="text-[11px] text-black/50">Bills</dt><dd className="font-semibold tabular-nums">{b.bills_month}</dd></div>
            </>}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <Btn size="sm" onClick={() => open('transfer', `&from=${b.id}`)}>Send stock</Btn>
            <Btn size="sm" onClick={() => go(`/invoices?type=sale&branch=${b.id}`)}>Bills</Btn>
            {b.id !== here?.id && <Btn size="sm" onClick={() => use(b)} title="Bill and count stock as this location on this counter">Work here</Btn>}
          </div>
        </div>
      ))}
      {c && !list.length && <p className="text-sm text-black/45">No branches yet. Use + Branch.</p>}
    </div>
    </section>
    ))}
  </>;
}

// A company: what prints on its bills. New branches under it start with its GSTIN, state and address.
// _move: branches to put in this company when it is saved ("Make these a company").
function CompanyForm({ c, branches, onClose, onSaved }) {
  const [f, , bind] = useForm({ name: '', legal_name: '', gstin: '', state_code: '37', address: '', phone: '', email: '', ...c });
  const [move, setMove] = useState(() => new Set(c._move || []));
  const submit = async (e) => {
    e.preventDefault();
    const gstin = f.gstin.trim().toUpperCase();
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return toast('That GSTIN does not look right (15 characters, e.g. 37ABCDE1234F1Z5)', 'err');
    try {
      const saved = await api('/t/companies', { id: f.id, name: f.name.trim(), legal_name: f.legal_name.trim() || f.name.trim(), gstin, state_code: gstin ? gstin.slice(0, 2) : f.state_code,
        address: f.address, phone: f.phone, email: f.email });
      // branches put in the company, and its branches without a GSTIN of their own, take the company's registration
      const rows = branches.filter((b) => move.has(b.id) || b.company_id === saved.id).map((b) => ({ id: b.id, company_id: saved.id, ...(!b.gstin && saved.gstin ? { gstin: saved.gstin, state_code: saved.state_code } : {}) }));
      if (rows.length) await api('/t/branches/bulk', { rows });
      toast(f.id ? 'Company saved' : `${f.name} added`); onSaved();
    } catch (err) { fail(err); }
  };
  const loose = branches.filter((b) => !b.company_id || b.company_id === f.id);
  return (
    <Modal title={f.id ? `Edit ${c.name}` : 'New company'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Company name (shown in the app)" {...bind('name')} required autoFocus placeholder="Fit Secrets" />
        <Field label="Legal name (printed on bills)" {...bind('legal_name')} placeholder="Fit Secrets Nutrition Pvt Ltd" />
        <Field label="GSTIN" {...bind('gstin')} maxLength={15} placeholder="37ABCDE1234F1Z5" hint="The state is taken from it" />
        <Field label="State"><select className="input" {...bind('state_code')}>{STATE_LIST.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
        <Field label="Registered address" {...bind('address')} className="col-span-2" />
        <Field label="Phone" {...bind('phone')} inputMode="tel" />
        <Field label="Email" {...bind('email')} type="email" />
        {loose.length > 0 && <fieldset className="col-span-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Branches & warehouses in this company</legend>
          <div className="grid gap-1 sm:grid-cols-2">{loose.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={move.has(b.id) || b.company_id === f.id && !!f.id}
              disabled={b.company_id === f.id && !!f.id} onChange={() => setMove((s) => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; })} />{b.name}</label>
          ))}</div>
          <p className="mt-1 text-xs text-black/45">To move a branch to another company, edit the branch.</p>
        </fieldset>}
        <div className="col-span-2 flex justify-end gap-2">
          {f.id && <DeleteBtn what={c.name} onDelete={() => api('/t/companies/' + f.id, null, 'DELETE').then(() => { toast('Company removed'); onSaved(); }, fail)} />}
          <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn>
        </div>
      </form>
    </Modal>
  );
}

function LocationForm({ b, companies, onClose, onSaved }) {
  const [f, set, bind] = useForm({ name: '', code: '', kind: 'store', address: '', phone: '', gstin: '', state_code: '37', company_id: '', ...b });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/t/branches', { id: f.id, name: f.name.trim(), code: f.code.trim().toUpperCase(), kind: f.kind, address: f.address, phone: f.phone, gstin: f.gstin.trim().toUpperCase(), state_code: f.state_code,
        company_id: f.company_id || null });
      toast(f.id ? 'Saved' : `${f.name} added`); onSaved();
    } catch (err) { fail(err); }
  };
  return (
    <Modal title={f.id ? `Edit ${b.name}` : 'New branch or warehouse'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Type" className="col-span-2">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-black/5 p-1" role="radiogroup">
            {Object.entries(KIND).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => set('kind', k)}
              className={cx('rounded-full py-1.5 text-xs font-semibold', f.kind === k ? 'bg-ink text-white' : 'text-black/60')}>{l}</button>)}
          </div>
        </Field>
        {companies.length > 0 && <Field label="Company" className="col-span-2"><select className="input" value={f.company_id || ''} onChange={(e) => {
          const c = companies.find((x) => x.id === e.target.value);
          set('company_id', e.target.value);
          if (c && !f.id) { set('gstin', c.gstin || ''); set('state_code', c.state_code || f.state_code); } // a new branch starts with the company's registration
        }}><option value="">Not in a company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        <Field label="Name" {...bind('name')} required autoFocus placeholder={f.kind === 'warehouse' ? 'Gollapudi Warehouse' : 'Fit Secrets Benz Circle'} />
        <Field label="Short code" {...bind('code')} required maxLength={6} placeholder="BNZ" hint="Starts bill numbers" />
        <Field label="Address" {...bind('address')} className="col-span-2" />
        <Field label="Phone" {...bind('phone')} inputMode="tel" />
        <Field label="GSTIN" {...bind('gstin')} maxLength={15} hint="If it has its own registration" />
        <Field label="State" className="col-span-2"><select className="input" {...bind('state_code')}>{STATE_LIST.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
        <div className="col-span-2 flex justify-end gap-2">
          {f.id && <DeleteBtn what={b.name} onDelete={() => (b.units > 0 ? toast(`Move the ${b.units} units at ${b.name} elsewhere first`, 'err')
            : api('/t/branches/' + f.id, null, 'DELETE').then(() => { toast('Removed'); onSaved(); }, fail))} />}
          <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn>
        </div>
      </form>
    </Modal>
  );
}

function StockMatrix({ open }) {
  const m = useApi('/reports/x/stock_matrix');
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  if (!m.data) return <Loading />;
  const { branches, rows } = m.data;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = rows.filter((r) => words.every((w) => `${r.name} ${r.sku}`.toLowerCase().includes(w)) && (!low || branches.some((b) => b.kind === 'store' && r.low_stock > 0 && r.qty[b.id] <= r.low_stock)));
  return <>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <input className="input max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…" aria-label="Find an item" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Only items low at a store</label>
      <span className="ml-auto text-xs text-black/50">{list.length} items</span>
    </div>
    <div className="card"><Table rows={list.slice(0, 300)} onRow={(r) => open('transfer', `&item=${r.item_id}`)} empty="No items match" columns={[
      { k: 'name', label: 'Item', r: (r) => <div><div className="font-medium">{r.name}</div>{r.sku && <div className="text-[11px] text-black/45">{r.sku}</div>}</div> },
      ...branches.map((b) => ({ k: b.id, label: <span title={KIND[b.kind]}>{b.code || b.name}{b.kind === 'warehouse' ? ' 🏬' : ''}</span>, right: true,
        r: (r) => <span className={cx('tabular-nums', r.qty[b.id] <= 0 ? 'text-black/30' : b.kind === 'store' && r.low_stock > 0 && r.qty[b.id] <= r.low_stock ? 'font-semibold text-amber-700' : '')}>{r.qty[b.id]}</span> })),
      { k: 'total', label: 'Total', right: true, r: (r) => <b className="tabular-nums">{r.total}</b> },
    ]} /></div>
    {list.length > 300 && <p className="mt-2 text-xs text-black/50">Showing the first 300. Search to narrow down.</p>}
  </>;
}

// Many items at once from one place to another. ?item= / ?from= prefill it (from Stock by location, or a location card).
function Transfer({ boot, here, query, done }) {
  const branches = boot.branches || [];
  const m = useApi('/reports/x/stock_matrix');
  const [from, setFrom] = useState(query.from || here?.id);
  const [to, setTo] = useState((query.from && query.from !== here?.id ? here?.id : branches.find((b) => b.id !== (query.from || here?.id))?.id) || '');
  const [lines, setLines] = useState((query.item ? [{ item_id: query.item, qty: '' }] : []));
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = m.data?.rows || [];
  const byId = useMemo(() => new Map(rows.map((r) => [r.item_id, r])), [rows]);
  const byName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  const add = () => { const r = byName.get(pick); if (!r) return toast('Pick an item from the list', 'err'); if (!lines.some((l) => l.item_id === r.item_id)) setLines([...lines, { item_id: r.item_id, qty: '' }]); setPick(''); };
  const send = async () => {
    setBusy(true);
    try { const t = await api('/stock/transfer', { from, to, note, lines: lines.map((l) => ({ item_id: l.item_id, qty: +l.qty })) }); toast(`${t.no}: stock moved`); done(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const short = lines.some((l) => +l.qty > (byId.get(l.item_id)?.qty[from] ?? 0));
  return (
    <div className="card max-w-4xl p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <Field label="From"><select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.kind === 'warehouse' ? ' (warehouse)' : ''}</option>)}</select></Field>
        <button type="button" className="mb-1 rounded-full px-3 py-2 text-lg hover:bg-black/5" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap from and to" title="Swap">⇄</button>
        <Field label="To"><select className="input" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Pick…</option>{branches.filter((b) => b.id !== from).map((b) => <option key={b.id} value={b.id}>{b.name}{b.kind === 'warehouse' ? ' (warehouse)' : ''}</option>)}</select></Field>
      </div>
      {branches.length < 2 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Add a second branch or a warehouse first (All locations → + Add).</p>}
      <table className="mt-4 w-full text-sm">
        <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-black/50"><th className="py-2">Item</th><th className="w-28 text-right">At source</th><th className="w-28 text-right">At destination</th><th className="w-28 px-2">Qty to send</th><th className="w-8" /></tr></thead>
        <tbody>
          {lines.map((l, i) => { const r = byId.get(l.item_id); const have = r?.qty[from] ?? 0; return (
            <tr key={l.item_id} className="border-b border-line/60">
              <td className="py-1.5 font-medium">{r?.name || '…'}</td>
              <td className="text-right tabular-nums">{have}</td>
              <td className="text-right tabular-nums text-black/55">{r?.qty[to] ?? '—'}</td>
              <td className="px-2"><input className={cx('input py-1 text-right', +l.qty > have && 'border-red-400')} inputMode="decimal" value={l.qty} autoFocus={!l.qty && i === lines.length - 1}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} aria-label={`Quantity of ${r?.name}`} /></td>
              <td><button className="px-2 text-black/35 hover:text-red-600" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove">✕</button></td>
            </tr>); })}
          {!lines.length && <tr><td colSpan={5} className="py-6 text-center text-black/45">Add items below</td></tr>}
        </tbody>
      </table>
      <div className="mt-3 flex gap-2">
        <input className="input" list="tr-items" value={pick} onChange={(e) => setPick(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Type an item name, then Enter" aria-label="Add item" />
        <datalist id="tr-items">{rows.filter((r) => (r.qty[from] ?? 0) > 0).map((r) => <option key={r.item_id} value={r.name}>{r.qty[from]} at source</option>)}</datalist>
        <Btn onClick={add}>Add</Btn>
      </div>
      <Field label="Note (optional)" className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Driver, vehicle no., reason…" />
      <div className="mt-4 flex items-center justify-end gap-3">
        {short && <span className="text-xs font-medium text-red-600">Some quantities are more than the source has</span>}
        <Btn v="primary" disabled={busy || !to || !lines.length || short || lines.some((l) => !(+l.qty > 0))} onClick={send}>{busy ? 'Moving…' : `Transfer ${lines.length} item${lines.length === 1 ? '' : 's'}`}</Btn>
      </div>
    </div>
  );
}

// Low items at this store with a source picked for each; untick or change quantities, then one transfer per source.
function Restock({ boot, here, list, done }) {
  const [qty, setQty] = useState({});
  const [off, setOff] = useState(new Set());
  const [busy, setBusy] = useState(false);
  if (!list.data) return <Loading />;
  const rows = list.data;
  const can = rows.filter((r) => r.from);
  const q = (r) => qty[r.item_id] ?? r.qty;
  const go_ = async () => {
    setBusy(true);
    try {
      const bySrc = new Map();
      for (const r of can.filter((r) => !off.has(r.item_id) && +q(r) > 0)) bySrc.set(r.from, [...(bySrc.get(r.from) || []), { item_id: r.item_id, qty: +q(r) }]);
      if (!bySrc.size) return toast('Nothing selected', 'err');
      const nos = [];
      for (const [from, lines] of bySrc) nos.push((await api('/stock/transfer', { from, to: here.id, lines, note: 'Restock' })).no);
      toast(`Restocked: ${nos.join(', ')}`); setQty({}); setOff(new Set()); done();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return <>
    {!rows.length ? <div className="card p-8 text-center text-sm text-black/55">Nothing is low at {here?.name}. Set “Low stock alert at” on items to get suggestions.</div> : <>
      <div className="card"><Table rows={rows} empty="" columns={[
        { label: '', r: (r) => r.from && <input type="checkbox" aria-label={`Include ${r.name}`} checked={!off.has(r.item_id)} onChange={(e) => { const s = new Set(off); e.target.checked ? s.delete(r.item_id) : s.add(r.item_id); setOff(s); }} /> },
        { k: 'name', label: 'Item' },
        { k: 'stock', label: 'Here', right: true, r: (r) => <span className="font-semibold text-amber-700 tabular-nums">{r.stock}</span> },
        { k: 'low_stock', label: 'Alert at', right: true },
        { k: 'from_name', label: 'From', r: (r) => r.from ? <span>{r.from_name} <span className="text-xs text-black/45">({r.available} there)</span></span> : <Badge c="red">none in stock anywhere</Badge> },
        { k: 'qty', label: 'Send', right: true, r: (r) => r.from ? <input className="input w-20 py-1 text-right" inputMode="decimal" value={q(r)} onChange={(e) => setQty({ ...qty, [r.item_id]: e.target.value })} aria-label={`Send ${r.name}`} /> : <a className="text-xs font-semibold text-brand-d hover:underline" href={`#/bill/purchase_order?low=1`}>Order from supplier</a> },
      ]} /></div>
      <div className="mt-4 flex justify-end"><Btn v="primary" disabled={busy || !can.length} onClick={go_}>{busy ? 'Moving…' : `Bring ${can.filter((r) => !off.has(r.item_id)).length} items to ${here?.name}`}</Btn></div>
    </>}
  </>;
}

function History() {
  const t = useApi('/reports/x/transfers');
  if (!t.data) return <Loading />;
  return <div className="card"><Table rows={t.data} empty="No transfers yet." columns={[
    { k: 'no', label: 'No.', r: (x) => <span className="font-mono text-xs font-semibold">{x.no}</span> },
    { k: 'at', label: 'When', r: (x) => x.at ? new Date(x.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '' },
    { k: 'from', label: 'From' }, { k: 'to', label: 'To' },
    { k: 'items', label: 'Items', r: (x) => <span className="line-clamp-2 text-xs">{x.items}</span> },
    { k: 'units', label: 'Units', right: true },
  ]} /></div>;
}

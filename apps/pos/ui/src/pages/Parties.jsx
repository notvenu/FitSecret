import { useState } from 'react';
import { STATE_LIST, inr, today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Table, DeleteBtn, SideNav, SectionPage, useForm, cx, ModeOptions } from '../ui.jsx';
import { InsightStrip } from './Insights.jsx';
import { ChequeBits } from './Payments.jsx';

// fields: custom party field names from Settings (Vyapar's party "Additional fields")
export function PartyForm({ party, type = 'customer', fields = [], groups = [], onClose, onSaved }) {
  const [f, set, bind] = useForm(party || { type, name: '', phone: '', email: '', gstin: '', address: '', state_code: '37', opening_balance: 0, credit_limit: '',
    shipping_address: '', group_name: '', payment_terms: '', extra: {} });
  const [ship, setShip] = useState(!!f.shipping_address);
  const [special, setSpecial] = useState(f.price_discount > 0 || Object.keys(f.rates || {}).length > 0);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const p = await api('/t/parties', { ...f, gstin: f.gstin?.toUpperCase() || null, opening_balance: +f.opening_balance || 0, credit_limit: +f.credit_limit || null,
        payment_terms: +f.payment_terms || null, group_name: f.group_name?.trim() || null, shipping_address: ship ? f.shipping_address || null : null,
        price_discount: special ? +f.price_discount || null : null,
        rates: special ? Object.fromEntries(Object.entries(f.rates || {}).filter(([, v]) => +v > 0).map(([k, v]) => [k, +v])) : null,
        extra: Object.fromEntries(fields.filter(Boolean).map((k) => [k, f.extra?.[k] || ''])) });
      toast('Saved'); onSaved(p);
    } catch (e) { fail(e); }
  };
  return (
    <Modal title={party ? 'Edit party' : `New ${f.type}`} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Name" {...bind('name')} required autoFocus className="col-span-2" />
        <Field label="Phone" {...bind('phone')} inputMode="tel" />
        <Field label="Type"><select className="input" {...bind('type')}><option value="customer">Customer</option><option value="supplier">Supplier</option></select></Field>
        <Field label="GSTIN" {...bind('gstin')} />
        <Field label="State"><select className="input" {...bind('state_code')}>{STATE_LIST.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
        <Field label="Email" {...bind('email')} type="email" />
        <Field label="Opening balance" {...bind('opening_balance')} hint="+ they owe you · − you owe them" inputMode="decimal" />
        <Field label="Credit limit" {...bind('credit_limit')} hint="Warns at billing when crossed. Blank = no limit" inputMode="decimal" />
        <Field label="Payment terms (days)" {...bind('payment_terms')} hint="Sets the due date on credit bills" inputMode="numeric" />
        <Field label="Party group" {...bind('group_name')} list="party-groups" placeholder="e.g. Gyms, Wholesale" />
        <datalist id="party-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <Field label="Billing address" className="col-span-2"><textarea className="input" rows={2} {...bind('address')} /></Field>
        {ship ? <Field label="Shipping address" className="col-span-2"><textarea className="input" rows={2} {...bind('shipping_address')} /></Field>
          : <button type="button" className="col-span-2 text-left text-xs font-semibold text-brand-d hover:underline" onClick={() => setShip(true)}>+ Different shipping address</button>}
        {f.type === 'customer' && (special ? <SpecialRates f={f} set={set} />
          : <button type="button" className="col-span-2 text-left text-xs font-semibold text-brand-d hover:underline" onClick={() => setSpecial(true)}>+ Regular buyer rates (own prices for this customer)</button>)}
        {fields.filter(Boolean).map((k) => <Field key={k} label={k} value={f.extra?.[k] || ''} onChange={(e) => set('extra', { ...f.extra, [k]: e.target.value })} />)}
        <div className="col-span-2 flex justify-end gap-2">
          {party?.id && <DeleteBtn what={party.name} onDelete={() => api('/t/parties/' + party.id, null, 'DELETE').then(() => { toast(`${party.name} deleted`); onSaved(); }, fail)} />}
          <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn>
        </div>
      </form>
    </Modal>
  );
}

// Regular buyer: % off every item and/or a fixed price per item. Billing applies them for this party; the website does too
// when they sign in with this email. The bulk (wholesale) price still applies on top when it is lower.
function SpecialRates({ f, set }) {
  const items = useApi('/items');
  const [pick, setPick] = useState('');
  const rates = f.rates || {};
  const byId = new Map((items.data || []).map((i) => [i.id, i]));
  const add = () => {
    const it = items.data?.find((i) => i.name === pick);
    if (!it) return toast('Pick an item from the list', 'err');
    set('rates', { ...rates, [it.id]: rates[it.id] ?? it.sale_price });
    setPick('');
  };
  return (
    <div className="col-span-2 rounded-[14px] bg-paper p-3">
      <div className="mb-2 text-sm font-semibold">Regular buyer rates</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Discount on all items (%)" value={f.price_discount ?? ''} onChange={(e) => set('price_discount', e.target.value)} inputMode="decimal" placeholder="0" />
        <p className="self-end text-xs text-black/50">{f.email ? `Website: applies when they sign in as ${f.email}` : 'Add their email to give these rates on the website too'}</p>
      </div>
      <datalist id="rate-items">{items.data?.map((i) => <option key={i.id} value={i.name} />)}</datalist>
      <div className="mt-3 flex items-end gap-2">
        <Field label="Fixed price for an item" list="rate-items" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Type an item name" className="flex-1" />
        <Btn onClick={add}>Add</Btn>
      </div>
      {Object.keys(rates).length > 0 && <ul className="mt-2 divide-y divide-line text-sm">
        {Object.entries(rates).map(([id, v]) => (
          <li key={id} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate">{byId.get(id)?.name || 'Item'} <span className="text-xs text-black/45">list {inr(byId.get(id)?.sale_price)}</span></span>
            <input className="input w-28 text-right" inputMode="decimal" value={v} onChange={(e) => set('rates', { ...rates, [id]: e.target.value })} aria-label="Price" />
            <button type="button" className="px-1 text-black/40 hover:text-red-600" onClick={() => { const { [id]: _, ...rest } = rates; set('rates', rest); }} aria-label="Remove">✕</button>
          </li>
        ))}
      </ul>}
    </div>
  );
}

export function PaymentForm({ party, onClose, onSaved }) {
  const [f, , bind] = useForm({ amount: Math.abs(party.balance) || '', mode: 'cash', date: today(), note: '', direction: party.balance < 0 ? 'out' : 'in', tds: '', ref: '', ref_date: today() });
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/payments', { ...f, party_id: party.id, amount: +f.amount, tds: +f.tds || 0 }); toast('Payment recorded'); onSaved(); } catch (e) { fail(e); }
  };
  return (
    <Modal title={`Payment · ${party.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Direction"><select className="input" {...bind('direction')}><option value="in">Payment In (received)</option><option value="out">Payment Out (paid)</option></select></Field>
        <Field label="Amount" {...bind('amount')} required autoFocus inputMode="decimal" />
        <Field label="Mode"><select className="input" {...bind('mode')}><ModeOptions cheque /></select></Field>
        <Field label="Date" {...bind('date', 'date')} />
        <Field label={f.direction === 'in' ? 'TDS deducted by party' : 'TDS deducted by you'} {...bind('tds')} inputMode="decimal" placeholder="0"
          hint="Settles the balance like money; shows in TDS reports" />
        <Field label="Note" {...bind('note')} className="col-span-2" />
        {f.mode === 'cheque' && <ChequeBits bind={bind} />}
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save payment</Btn></div>
      </form>
    </Modal>
  );
}

export default function Parties({ route, branch, user }) {
  const list = useApi('/parties');
  const [tab, setTab] = useState('customer');
  const [grp, setGrp] = useState('');
  const groups = [...new Set((list.data || []).map((p) => p.group_name).filter(Boolean))].sort();
  const [q, setQ] = useState(route?.query.q || '');
  const [edit, setEdit] = useState(route?.query.new ? {} : null);
  const [pay, setPay] = useState(null);
  const [ledger, setLedger] = useState(null);
  const rows = list.data?.filter((p) => (q || grp || (tab === 'supplier' ? p.type === 'supplier' : p.type !== 'supplier')) && (!grp || p.group_name === grp) && `${p.name} ${p.phone}`.toLowerCase().includes(q.toLowerCase()));
  const total = rows?.reduce((s, p) => s + p.balance, 0) || 0;

  return (
    <SectionPage nav={<SideNav title="Parties" value={grp ? 'g:' + grp : tab} onChange={(k) => (k.startsWith('g:') ? setGrp(k.slice(2)) : (setGrp(''), setTab(k)))} groups={[
      { items: [{ key: 'customer', label: 'Customers', badge: list.data?.filter((p) => p.type !== 'supplier').length }, { key: 'supplier', label: 'Suppliers', badge: list.data?.filter((p) => p.type === 'supplier').length }] },
      ...(groups.length ? [{ label: 'Groups', items: groups.map((g) => ({ key: 'g:' + g, label: g, badge: list.data?.filter((p) => p.group_name === g).length })) }] : []),
    ]} />} top={<InsightStrip user={user} branch={branch} sections={['customers', 'money']} limit={2} />}
      title={grp || (tab === 'customer' ? 'Customers' : 'Suppliers')} hint="Orange balance = they owe you. Open a row for the full ledger." actions={<>
      <Btn onClick={() => downloadCsv('parties', rows)}>Export</Btn>
      <Btn v="primary" onClick={() => setEdit({})}>+ Add {tab}</Btn>
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ml-auto text-sm text-black/55">{tab === 'customer' ? 'Total receivable' : 'Net balance'}: <Money v={total} className="font-semibold text-ink" /></span>
      </div>
      <div className="card">
        <Table rows={rows} onRow={(p) => api(`/parties/${p.id}/ledger`).then(setLedger, fail)} columns={[
          { k: 'name', label: 'Name', r: (p) => <span className="font-medium">{p.name}</span> },
          { k: 'phone', label: 'Phone' },
          { k: 'gstin', label: 'GSTIN' },
          { k: 'group_name', label: 'Group', r: (p) => <>{p.group_name && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{p.group_name}</span>}
            {(p.price_discount > 0 || Object.keys(p.rates || {}).length > 0) && <span className="ml-1 rounded-full bg-brand/25 px-2 py-0.5 text-xs">Special rates</span>}</> },
          { k: 'balance', label: 'Balance', right: true, r: (p) => <Money v={p.balance} className={cx(p.balance > 0 ? 'text-amber-700' : p.balance < 0 ? 'text-sky-700' : 'text-black/40')} /> },
          { label: '', r: (p) => (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Btn size="sm" onClick={() => setPay(p)}>Payment</Btn>
              <Btn size="sm" v="ghost" onClick={() => setEdit(p)}>Edit</Btn>
              {p.phone && p.balance > 0 && <a className="rounded-lg px-2.5 py-1 text-xs hover:bg-black/5" target="_blank" rel="noreferrer"
                href={`https://wa.me/91${p.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Hi ${p.name}, a gentle reminder from FitSecret: your pending balance is ${inr(p.balance)}. Thank you!`)}`}>Remind</a>}
            </div>) },
        ]} />
      </div>
      {edit && <PartyForm party={edit.id ? edit : null} type={tab} fields={branch?.settings?.party_fields} groups={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
      {pay && <PaymentForm party={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); list.reload(); }} />}
      {ledger && (
        <Modal wide title={`Ledger · ${ledger.party.name}`} onClose={() => setLedger(null)} footer={<Btn onClick={() => downloadCsv('ledger-' + ledger.party.name, ledger.rows)}>Export CSV</Btn>}>
          <div className="mb-2 text-sm text-black/55">Opening balance <Money v={ledger.opening} /></div>
          <Table rows={ledger.rows} columns={[
            { k: 'date', label: 'Date' }, { k: 'type', label: 'Type', r: (r) => r.type.replace('_', ' ') }, { k: 'ref', label: 'Ref' },
            { k: 'amt', label: 'Debit / Credit', right: true, r: (r) => <Money v={r.amt} className={r.amt < 0 ? 'text-emerald-700' : ''} /> },
            { k: 'balance', label: 'Balance', right: true, r: (r) => <Money v={r.balance} className="font-medium" /> },
          ]} />
        </Modal>
      )}
    </SectionPage>
  );
}

import { useState } from 'react';
import { STATE_LIST, inr, today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Page, Table, Tabs, useForm, cx } from '../ui.jsx';

// fields: custom party field names from Settings (Vyapar's party "Additional fields")
export function PartyForm({ party, type = 'customer', fields = [], groups = [], onClose, onSaved }) {
  const [f, set, bind] = useForm(party || { type, name: '', phone: '', email: '', gstin: '', address: '', state_code: '37', opening_balance: 0, credit_limit: '',
    shipping_address: '', group_name: '', payment_terms: '', extra: {} });
  const [ship, setShip] = useState(!!f.shipping_address);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const p = await api('/t/parties', { ...f, gstin: f.gstin?.toUpperCase() || null, opening_balance: +f.opening_balance || 0, credit_limit: +f.credit_limit || null,
        payment_terms: +f.payment_terms || null, group_name: f.group_name?.trim() || null, shipping_address: ship ? f.shipping_address || null : null,
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
        {fields.filter(Boolean).map((k) => <Field key={k} label={k} value={f.extra?.[k] || ''} onChange={(e) => set('extra', { ...f.extra, [k]: e.target.value })} />)}
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

export function PaymentForm({ party, onClose, onSaved }) {
  const [f, , bind] = useForm({ amount: Math.abs(party.balance) || '', mode: 'cash', date: today(), note: '', direction: party.balance < 0 ? 'out' : 'in', tds: '' });
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/payments', { ...f, party_id: party.id, amount: +f.amount, tds: +f.tds || 0 }); toast('Payment recorded'); onSaved(); } catch (e) { fail(e); }
  };
  return (
    <Modal title={`Payment · ${party.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Direction"><select className="input" {...bind('direction')}><option value="in">Payment In (received)</option><option value="out">Payment Out (paid)</option></select></Field>
        <Field label="Amount" {...bind('amount')} required autoFocus inputMode="decimal" />
        <Field label="Mode"><select className="input" {...bind('mode')}>{['cash', 'upi', 'card', 'bank', 'cheque'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Date" {...bind('date', 'date')} />
        <Field label={f.direction === 'in' ? 'TDS deducted by party' : 'TDS deducted by you'} {...bind('tds')} inputMode="decimal" placeholder="0"
          hint="Settles the balance like money; shows in TDS reports" />
        <Field label="Note" {...bind('note')} className="col-span-2" />
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save payment</Btn></div>
      </form>
    </Modal>
  );
}

export default function Parties({ route, branch }) {
  const list = useApi('/parties');
  const [tab, setTab] = useState('customer');
  const [grp, setGrp] = useState('');
  const groups = [...new Set((list.data || []).map((p) => p.group_name).filter(Boolean))].sort();
  const [q, setQ] = useState(route?.query.q || '');
  const [edit, setEdit] = useState(route?.query.new ? {} : null);
  const [pay, setPay] = useState(null);
  const [ledger, setLedger] = useState(null);
  const rows = list.data?.filter((p) => (q || p.type === tab) && (!grp || p.group_name === grp) && `${p.name} ${p.phone}`.toLowerCase().includes(q.toLowerCase()));
  const total = rows?.reduce((s, p) => s + p.balance, 0) || 0;

  return (
    <Page title="Parties" actions={<>
      <Btn onClick={() => downloadCsv('parties', rows)}>Export</Btn>
      <Btn v="primary" onClick={() => setEdit({})}>+ Add {tab}</Btn>
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs tabs={[['customer', 'Customers'], ['supplier', 'Suppliers']]} value={tab} onChange={setTab} />
        <input className="input max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        {groups.length > 0 && <select className="input max-w-44" value={grp} onChange={(e) => setGrp(e.target.value)} aria-label="Party group">
          <option value="">All groups</option>{groups.map((g) => <option key={g}>{g}</option>)}</select>}
        <span className="ml-auto text-sm text-black/55">{tab === 'customer' ? 'Total receivable' : 'Net balance'}: <Money v={total} className="font-semibold text-ink" /></span>
      </div>
      <div className="card">
        <Table rows={rows} onRow={(p) => api(`/parties/${p.id}/ledger`).then(setLedger, fail)} columns={[
          { k: 'name', label: 'Name', r: (p) => <span className="font-medium">{p.name}</span> },
          { k: 'phone', label: 'Phone' },
          { k: 'gstin', label: 'GSTIN' },
          { k: 'group_name', label: 'Group', r: (p) => p.group_name && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{p.group_name}</span> },
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
    </Page>
  );
}

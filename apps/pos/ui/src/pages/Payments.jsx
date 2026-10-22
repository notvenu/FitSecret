// Payment-In (money received from customers) and Payment-Out (paid to suppliers), as in Vyapar's Sale / Purchase menus.
import { useState } from 'react';
import { today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Page, Table, useForm } from '../ui.jsx';

export default function Payments({ dir = 'in', route }) {
  dir = dir === 'out' ? 'out' : 'in';
  const pays = useApi('/t/payments');
  const parties = useApi('/parties');
  const [adding, setAdding] = useState(route.query.new === '1');
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const name = Object.fromEntries((parties.data || []).map((p) => [p.id, p.name]));
  const rows = pays.data?.filter((p) => p.direction === dir && p.party_id && p.date >= range.from && p.date <= range.to)
    .map((p) => ({ ...p, party: name[p.party_id] || '—' }));
  const label = dir === 'in' ? 'Payment-In' : 'Payment-Out';

  return (
    <Page title={label} actions={<>
      <Btn onClick={() => downloadCsv(label, rows)}>Export</Btn>
      <button onClick={() => setAdding(true)} className={`rounded-full px-4.5 py-2 text-sm font-bold text-white hover:brightness-110 ${dir === 'in' ? 'bg-brand-d' : 'bg-flame'}`}>+ Add {label}</button>
    </>}>
      <div className="card mb-3 flex flex-wrap items-end gap-6 px-5 py-3">
        <div><div className="text-xs text-black/50">Total {dir === 'in' ? 'received' : 'paid'}</div><Money v={rows?.reduce((s, p) => s + p.amount, 0)} className="text-2xl font-bold" /></div>
        <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      <div className="card">
        <Table rows={rows} empty={`No ${label} in this period`} columns={[
          { k: 'date', label: 'Date' }, { k: 'party', label: 'Party Name', r: (p) => <span className="font-medium">{p.party}</span> },
          { k: 'mode', label: 'Mode', r: (p) => <span className="uppercase">{p.mode}</span> }, { k: 'note', label: 'Note' },
          { k: 'amount', label: 'Amount', right: true, r: (p) => <Money v={p.amount} className="font-medium" /> },
        ]} />
      </div>
      {adding && <NewPayment dir={dir} parties={parties.data || []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); pays.reload(); parties.reload(); }} />}
    </Page>
  );
}

function NewPayment({ dir, parties, onClose, onSaved }) {
  const [f, set, bind] = useForm({ party: '', amount: '', mode: dir === 'in' ? 'cash' : 'bank', date: today(), note: '' });
  const party = parties.find((p) => p.name === f.party);
  const submit = async (e) => {
    e.preventDefault();
    if (!party) return toast('Pick a party from the list', 'err');
    try { await api('/payments', { party_id: party.id, direction: dir, amount: +f.amount, mode: f.mode, date: f.date, note: f.note }); toast('Payment saved'); onSaved(); } catch (e) { fail(e); }
  };
  const list = parties.filter((p) => p.type === (dir === 'in' ? 'customer' : 'supplier'));
  return (
    <Modal title={dir === 'in' ? 'Payment-In (received)' : 'Payment-Out (paid)'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <datalist id="pay-parties">{list.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <Field label="Party" list="pay-parties" {...bind('party')} required autoFocus className="col-span-2"
          hint={party ? `Balance ${party.balance > 0 ? 'receivable' : 'payable'} ₹${Math.abs(party.balance)}` : 'Type to search'} />
        <Field label="Amount" {...bind('amount')} required inputMode="decimal" onFocus={() => !f.amount && party && set('amount', Math.abs(party.balance) || '')} />
        <Field label="Mode"><select className="input" {...bind('mode')}>{['cash', 'upi', 'card', 'bank', 'cheque'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="Note / cheque no." {...bind('note')} />
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

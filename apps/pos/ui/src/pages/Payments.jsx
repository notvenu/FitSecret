// Payment-In (money received from customers) and Payment-Out (paid to suppliers), as in Vyapar's Sale / Purchase menus.
import { useState } from 'react';
import { today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv, shop, go } from '../api.js';
import { modeName, bankFor } from '@fitsecret/shared/reports';
import { Btn, Field, Modal, Money, Table, DeleteBtn, SideNav, SectionPage, useForm, ModeOptions } from '../ui.jsx';
import { InsightStrip } from './Insights.jsx';

export default function Payments({ dir = 'in', route, user, branch }) {
  dir = dir === 'out' ? 'out' : 'in';
  const pays = useApi('/t/payments');
  const parties = useApi('/parties');
  const [adding, setAdding] = useState(route.query.new === '1');
  const [edit, setEdit] = useState(null);
  const admin = user?.role === 'admin';
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const name = Object.fromEntries((parties.data || []).map((p) => [p.id, p.name]));
  const rows = pays.data?.filter((p) => p.direction === dir && p.party_id && p.date >= range.from && p.date <= range.to)
    .map((p) => ({ ...p, party: name[p.party_id] || '—' }));
  const label = dir === 'in' ? 'Payment-In' : 'Payment-Out';

  return (
    <SectionPage nav={<SideNav title="Payments" value={dir} onChange={(k) => go('/payments/' + k)} groups={[{ items: [
      { key: 'in', label: 'Payment-In', desc: 'Received from customers' }, { key: 'out', label: 'Payment-Out', desc: 'Paid to suppliers' }] }]} />}
      top={<InsightStrip user={user} branch={branch} sections={['money']} limit={2} />} title={label} hint={dir === 'in' ? 'Money customers paid you against their balance.' : 'Money you paid suppliers.'} actions={<>
      <Btn onClick={() => downloadCsv(label, rows)}>Export</Btn>
      <button onClick={() => setAdding(true)} className={`rounded-full px-4.5 py-2 text-sm font-bold text-white hover:brightness-110 ${dir === 'in' ? 'bg-brand-d' : 'bg-flame'}`}>+ Add {label}</button>
    </>}>
      <div className="card mb-3 flex flex-wrap items-end gap-6 px-5 py-3">
        <div><div className="text-xs text-black/50">Total {dir === 'in' ? 'received' : 'paid'}</div><Money v={rows?.reduce((s, p) => s + p.amount, 0)} className="text-2xl font-bold" /></div>
        <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      <div className="card">
        <Table rows={rows} onRow={admin ? setEdit : undefined} empty={`No ${label} in this period`} columns={[
          { k: 'date', label: 'Date' }, { k: 'party', label: 'Party Name', r: (p) => <span className="font-medium">{p.party}</span> },
          { k: 'mode', label: 'Mode', r: (p) => <span>{modeName(p.mode, shop)}</span> }, { k: 'note', label: 'Note' },
          { k: 'amount', label: 'Amount', right: true, r: (p) => <Money v={p.amount} className="font-medium" /> },
        ]} />
      </div>
      {edit && <EditPayment p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); pays.reload(); parties.reload(); }} />}
      {adding && <NewPayment dir={dir} mode0={route.query.mode} parties={parties.data || []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); pays.reload(); parties.reload(); }} />}
    </SectionPage>
  );
}

function NewPayment({ dir, mode0, parties, onClose, onSaved }) {
  const [f, set, bind] = useForm({ party: '', amount: '', mode: mode0 || (dir === 'in' ? 'cash' : bankFor(shop, 'pays_suppliers') || 'bank'), date: today(), note: '', ref: '', ref_date: today() });
  const party = parties.find((p) => p.name === f.party);
  const submit = async (e) => {
    e.preventDefault();
    if (!party) return toast('Pick a party from the list', 'err');
    if (f.mode === 'cheque' && !f.ref.trim()) return toast('Type the cheque number', 'err');
    try { await api('/payments', { party_id: party.id, direction: dir, amount: +f.amount, mode: f.mode, date: f.date, note: f.note, ref: f.ref, ref_date: f.ref_date }); toast(f.mode === 'cheque' ? 'Cheque saved: deposit it from Cash & Bank → Cheques' : 'Payment saved'); onSaved(); } catch (e) { fail(e); }
  };
  const list = parties.filter((p) => p.type === (dir === 'in' ? 'customer' : 'supplier'));
  return (
    <Modal title={dir === 'in' ? 'Payment-In (received)' : 'Payment-Out (paid)'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <datalist id="pay-parties">{list.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <Field label="Party" list="pay-parties" {...bind('party')} required autoFocus className="col-span-2"
          hint={party ? `Balance ${party.balance > 0 ? 'receivable' : 'payable'} ₹${Math.abs(party.balance)}` : 'Type to search'} />
        <Field label="Amount" {...bind('amount')} required inputMode="decimal"
          hint={(dir === 'in' ? party?.balance > 0 : party?.balance < 0) ? <button type="button" className="font-semibold text-brand-d hover:underline" onClick={() => set('amount', String(Math.abs(party.balance)))}>Use full due ₹{Math.abs(party.balance)}</button> : null} />
        <Field label="Mode"><select className="input" {...bind('mode')}><ModeOptions cheque /></select></Field>
        <Field label={f.mode === 'cheque' ? (dir === 'in' ? 'Received on' : 'Given on') : 'Date'} {...bind('date', 'date')} />
        <Field label="Note" {...bind('note')} placeholder={f.mode === 'cheque' ? 'Bank on the cheque, e.g. SBI' : ''} />
        {f.mode === 'cheque' && <ChequeBits bind={bind} />}
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

// Cheque number and the date written on it (a later date = post-dated: deposit it on or after that day).
export const ChequeBits = ({ bind }) => <>
  <Field label="Cheque no." {...bind('ref')} required inputMode="numeric" placeholder="000123" />
  <Field label="Date on the cheque" {...bind('ref_date', 'date')} hint="Later than today = post-dated" />
</>;

// Owner only. Fixing the amount / mode / date, or deleting it, also corrects the bill it paid; the change goes in the audit trail.
function EditPayment({ p, onClose, onSaved }) {
  const [f, , bind] = useForm({ amount: String(p.amount), mode: p.mode, date: p.date, note: p.note || '', tds: p.tds ? String(p.tds) : '', reason: '', ref: p.ref || '', ref_date: p.ref_date || '' });
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/payments/' + p.id, { ...f, amount: +f.amount, tds: +f.tds || 0 }); toast('Payment corrected'); onSaved(); } catch (err) { fail(err); }
  };
  return (
    <Modal title={`Payment · ${p.party}`} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Amount" {...bind('amount')} required inputMode="decimal" autoFocus />
        <Field label="Mode"><select className="input" {...bind('mode')}><ModeOptions cheque /></select></Field>
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="TDS" {...bind('tds')} inputMode="decimal" placeholder="0" />
        <Field label="Note" {...bind('note')} className="col-span-2" />
        {f.mode === 'cheque' && <ChequeBits bind={bind} />}
        <Field label="Why the change (kept in the audit trail)" {...bind('reason')} className="col-span-2" />
        <div className="col-span-2 flex justify-end gap-2">
          <DeleteBtn bin={false} what={`this payment of ₹${p.amount}`} onDelete={() => api('/payments/' + p.id, { deleted: true, reason: f.reason }).then(() => { toast('Payment deleted'); onSaved(); }, fail)} />
          <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn>
        </div>
      </form>
    </Modal>
  );
}

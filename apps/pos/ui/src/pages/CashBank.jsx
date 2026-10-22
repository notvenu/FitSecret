// Cash & Bank: every payment mode is an account (Cash in hand, UPI, Card, Bank, Cheque), balance = money in − money out − expenses.
// ponytail: accounts are the payment modes, not named bank accounts; add a bank-account table if the shop runs several current accounts.
import { useState } from 'react';
import { today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Page, Table, useForm, cx } from '../ui.jsx';

const ACCOUNTS = { cash: 'Cash in hand', upi: 'UPI', card: 'Card / POS machine', bank: 'Bank transfer / NEFT', cheque: 'Cheques' };

export default function CashBank({ route }) {
  const tab = ['bank', 'cash', 'cheque'].includes(route.query.tab) ? route.query.tab : 'bank';
  const bal = useApi('/reports/x/cash_bank');
  const modes = tab === 'cash' ? ['cash'] : tab === 'cheque' ? ['cheque'] : ['upi', 'card', 'bank'];
  const [mode, setMode] = useState(modes[0]);
  const [range, setRange] = useState({ from: today().slice(0, 5) + '01-01', to: today() });
  const [adj, setAdj] = useState(null);
  const st = useApi(`/reports/x/bank_statement?mode=${mode}&from=${range.from}&to=${range.to}`);
  const b = (m) => bal.data?.find((r) => r.mode === m)?.balance || 0;
  const reload = () => { bal.reload(); st.reload(); };

  return (
    <Page title={{ bank: 'Bank Accounts', cash: 'Cash In Hand', cheque: 'Cheques' }[tab]} actions={<>
      <Btn onClick={() => downloadCsv(`statement-${mode}`, st.data)}>Export</Btn>
      {tab !== 'cheque' && <Btn onClick={() => setAdj({ kind: 'transfer', mode })}>Transfer</Btn>}
      {tab !== 'cheque' && <Btn v="primary" onClick={() => setAdj({ kind: 'add', mode })}>Adjust balance</Btn>}
    </>}>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="card shrink-0 divide-y divide-line self-start lg:w-72">
          {modes.map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cx('flex w-full items-center justify-between px-4 py-3 text-left text-sm', m === mode ? 'bg-brand/15 font-semibold' : 'hover:bg-paper')}>
              <span>{ACCOUNTS[m]}</span><Money v={b(m)} className={b(m) < 0 ? 'text-red-600' : ''} />
            </button>
          ))}
          {tab === 'bank' && <div className="flex justify-between px-4 py-3 text-sm font-semibold"><span>Total</span><Money v={modes.reduce((s, m) => s + b(m), 0)} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <div className="card">
            <Table rows={st.data} empty="No transactions" columns={[
              { k: 'date', label: 'Date' }, { k: 'type', label: 'Type', r: (r) => <span className="capitalize">{r.type}</span> },
              { k: 'party', label: 'Name', r: (r) => r.party || r.ref }, ...(tab === 'cheque' ? [{ k: 'ref', label: 'Cheque no. / note' }] : []),
              { k: 'money_in', label: 'In', right: true, r: (r) => (r.money_in ? <Money v={r.money_in} className="text-emerald-700" /> : '') },
              { k: 'money_out', label: 'Out', right: true, r: (r) => (r.money_out ? <Money v={r.money_out} className="text-red-600" /> : '') },
              { k: 'balance', label: 'Balance', right: true, r: (r) => <Money v={r.balance} className="font-medium" /> },
            ]} />
          </div>
        </div>
      </div>
      {adj && <Adjust init={adj} onClose={() => setAdj(null)} onSaved={() => { setAdj(null); reload(); }} />}
    </Page>
  );
}

function Adjust({ init, onClose, onSaved }) {
  const [f, , bind] = useForm({ kind: init.kind, mode: init.mode, to_mode: init.mode === 'cash' ? 'bank' : 'cash', amount: '', date: today(), note: '' });
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/cash', { ...f, amount: +f.amount }); toast('Saved'); onSaved(); } catch (e) { fail(e); }
  };
  const opts = Object.entries(ACCOUNTS).filter(([m]) => m !== 'cheque').map(([m, l]) => <option key={m} value={m}>{l}</option>);
  return (
    <Modal title={f.kind === 'transfer' ? 'Move money between accounts' : 'Adjust balance'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Type"><select className="input" {...bind('kind')}><option value="add">Add money (opening / owner capital)</option><option value="reduce">Reduce money (withdrawal / drawings)</option><option value="transfer">Transfer (e.g. cash deposited in bank)</option></select></Field>
        <Field label={f.kind === 'transfer' ? 'From' : 'Account'}><select className="input" {...bind('mode')}>{opts}</select></Field>
        {f.kind === 'transfer' && <Field label="To"><select className="input" {...bind('to_mode')}>{opts}</select></Field>}
        <Field label="Amount" {...bind('amount')} required autoFocus inputMode="decimal" />
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="Description" {...bind('note')} />
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

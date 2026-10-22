// Vyapar's Accounting menu: Chart of Accounts (incl. fixed assets), Journal Entries and Account Statements.
// System ledgers (cash & bank, debtors, creditors, stock, GST, sales) come from the books; you add your own accounts on top.
import { useState } from 'react';
import { today } from '@fitsecret/shared';
import { ACCOUNT_TYPES, MODE_NAMES } from '@fitsecret/shared/reports';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Page, Table, Badge, useForm, cx } from '../ui.jsx';

const MODES = ['cash', 'upi', 'card', 'bank'];

export default function Accounting({ route }) {
  const tab = ['journals', 'accounts', 'statement'].includes(route.query.tab) ? route.query.tab : 'accounts';
  const accounts = useApi('/t/accounts');
  const options = [...MODES.map((m) => ['mode:' + m, MODE_NAMES[m]]), ...(accounts.data || []).map((a) => ['acc:' + a.id, a.name])];
  if (tab === 'journals') return <Journals options={options} newOne={route.query.new === '1'} />;
  if (tab === 'statement') return <Statement accounts={accounts.data || []} pick={route.query.account} />;
  return <Chart accounts={accounts} newOne={route.query.new === '1'} />;
}

function Chart({ accounts, newOne }) {
  const ledgers = useApi('/reports/x/ledgers');
  const [edit, setEdit] = useState(newOne ? {} : null);
  const [asset, setAsset] = useState(false);
  const reload = () => { accounts.reload(); ledgers.reload(); };
  const groups = [...new Set((ledgers.data || []).map((l) => l.group))];
  return (
    <Page title="Chart of Accounts" actions={<>
      <Btn onClick={() => setAsset(true)}>+ Add fixed asset</Btn>
      <Btn v="primary" onClick={() => setEdit({})}>+ Add account</Btn>
    </>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">All ledgers (balance today)</h2>
          {groups.map((g) => (
            <div key={g}>
              <div className="bg-brand/15 px-4 py-1.5 text-xs font-semibold text-brand-d">{g}</div>
              {ledgers.data.filter((l) => l.group === g).map((l) => (
                <a key={l.name} href={l.key?.startsWith('acc:') ? `#/accounting?tab=statement&account=${l.key}` : l.key?.startsWith('mode:') ? '#/cash?tab=' + (l.key === 'mode:cash' ? 'cash' : 'bank') : undefined}
                  className={cx('flex justify-between border-t border-line px-4 py-2 text-sm', l.key && 'hover:bg-paper')}>
                  <span>{l.name}</span><Money v={l.amount} className={l.amount < 0 ? 'text-red-600' : ''} />
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="card self-start">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Your accounts</h2>
          <Table rows={accounts.data} empty="No accounts yet. Add owner capital, loans, furniture, deposits…" columns={[
            { k: 'name', label: 'Account', r: (a) => <span className="font-medium">{a.name}</span> },
            { k: 'type', label: 'Type', r: (a) => <Badge>{ACCOUNT_TYPES[a.type]?.[0] || a.type}</Badge> },
            { k: 'opening_balance', label: 'Opening', right: true, r: (a) => <Money v={a.opening_balance} /> },
            { label: '', r: (a) => <div className="flex justify-end gap-1">
              <a href={`#/accounting?tab=statement&account=acc:${a.id}`}><Btn size="sm" v="ghost">Statement</Btn></a>
              <Btn size="sm" v="ghost" onClick={() => setEdit(a)}>Edit</Btn>
            </div> },
          ]} />
        </div>
      </div>
      {edit && <AccountForm acc={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {asset && <FixedAsset onClose={() => setAsset(false)} onSaved={() => { setAsset(false); reload(); }} />}
    </Page>
  );
}

function AccountForm({ acc, onClose, onSaved }) {
  const [f, , bind] = useForm(acc || { name: '', type: 'current_asset', opening_balance: 0, note: '' });
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/t/accounts', { ...f, opening_balance: +f.opening_balance || 0 }); toast('Account saved'); onSaved(); } catch (e) { fail(e); }
  };
  return (
    <Modal title={acc ? 'Edit account' : 'New account'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Account name" {...bind('name')} required autoFocus className="col-span-2" hint="e.g. Owner capital, Shop deposit, HDFC loan, Interest received" />
        <Field label="Type"><select className="input" {...bind('type')}>{Object.entries(ACCOUNT_TYPES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Opening balance" {...bind('opening_balance')} inputMode="decimal" />
        <Field label="Note" {...bind('note')} className="col-span-2" />
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

// Vyapar "Add Fixed Asset": the asset account plus the journal for how it was paid.
function FixedAsset({ onClose, onSaved }) {
  const [f, , bind] = useForm({ name: '', amount: '', date: today(), paid_from: 'cash', note: '' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const a = await api('/t/accounts', { name: f.name, type: 'fixed_asset', opening_balance: 0, note: f.note });
      await api('/t/journals', { date: f.date, note: `Purchase of ${f.name}`, lines: [{ account: 'acc:' + a.id, debit: +f.amount }, { account: 'mode:' + f.paid_from, credit: +f.amount }] });
      toast('Fixed asset added'); onSaved();
    } catch (e) { fail(e); }
  };
  return (
    <Modal title="Add fixed asset" onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Asset" {...bind('name')} required autoFocus className="col-span-2" hint="e.g. Display racks, Billing PC, AC" />
        <Field label="Cost" {...bind('amount')} required inputMode="decimal" />
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="Paid from"><select className="input" {...bind('paid_from')}>{MODES.map((m) => <option key={m} value={m}>{MODE_NAMES[m]}</option>)}</select></Field>
        <Field label="Note" {...bind('note')} />
        <p className="col-span-2 text-xs text-black/50">Depreciation: add a journal later (debit an “Depreciation” expense account, credit this asset).</p>
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

function Journals({ options, newOne }) {
  const list = useApi('/t/journals');
  const [edit, setEdit] = useState(newOne);
  const name = Object.fromEntries(options);
  const del = (j) => confirm(`Delete ${j.no}?`) && api('/t/journals/' + j.id, null, 'DELETE').then(list.reload, fail);
  return (
    <Page title="Journal Entries" actions={<>
      <Btn onClick={() => downloadCsv('journals', list.data?.flatMap((j) => j.lines.map((l) => ({ no: j.no, date: j.date, note: j.note, account: name[l.account], debit: l.debit, credit: l.credit }))))}>Export</Btn>
      <Btn v="primary" onClick={() => setEdit(true)}>+ Add journal entry</Btn>
    </>}>
      <p className="mb-3 text-sm text-black/55">Journal vouchers are manual entries in your books: owner capital, loans, depreciation, cash deposited, write-offs. Each entry must balance (total debit = total credit).</p>
      <div className="card">
        <Table rows={list.data} empty="No journal entries yet" columns={[
          { k: 'date', label: 'Date' }, { k: 'no', label: 'No.' }, { k: 'note', label: 'Description' },
          { label: 'Entries', r: (j) => <div className="text-xs">{j.lines.map((l, i) => <div key={i}>{l.debit ? 'Dr' : 'Cr'} {name[l.account] || '?'} <Money v={l.debit || l.credit} /></div>)}</div> },
          { label: 'Amount', right: true, r: (j) => <Money v={j.lines.reduce((s, l) => s + (l.debit || 0), 0)} className="font-medium" /> },
          { label: '', r: (j) => <button className="text-xs text-red-600 hover:underline" onClick={() => del(j)}>Delete</button> },
        ]} />
      </div>
      {edit && <JournalForm options={options} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); list.reload(); }} />}
    </Page>
  );
}

function JournalForm({ options, onClose, onSaved }) {
  const [meta, setMeta] = useState({ date: today(), note: '' });
  const [lines, setLines] = useState([{ account: '', debit: '', credit: '' }, { account: '', debit: '', credit: '' }]);
  const set = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const dr = lines.reduce((s, l) => s + (+l.debit || 0), 0), cr = lines.reduce((s, l) => s + (+l.credit || 0), 0);
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/t/journals', { ...meta, lines }); toast('Journal saved'); onSaved(); } catch (e) { fail(e); }
  };
  return (
    <Modal wide title="New journal entry" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Field label="Date" type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
          <Field label="Description" className="col-span-2" value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} placeholder="e.g. Owner brought in capital" />
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase text-black/50"><tr><th className="p-1">Account</th><th className="w-36 p-1">Debit</th><th className="w-36 p-1">Credit</th><th className="w-8" /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="p-1"><select className="input" value={l.account} onChange={(e) => set(i, { account: e.target.value })} required>
                  <option value="">Choose account…</option>{options.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select></td>
                <td className="p-1"><input className="input text-right" inputMode="decimal" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: '' })} /></td>
                <td className="p-1"><input className="input text-right" inputMode="decimal" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: '' })} /></td>
                <td>{lines.length > 2 && <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="px-2 text-black/30 hover:text-red-600" aria-label="Remove line">✕</button>}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold"><td className="p-2 text-right">Total</td><td className="p-2 text-right"><Money v={dr} /></td><td className="p-2 text-right"><Money v={cr} /></td><td /></tr>
          </tbody>
        </table>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="text-xs font-semibold text-brand-d hover:underline" onClick={() => setLines([...lines, { account: '', debit: '', credit: '' }])}>+ Add line</button>
          {Math.abs(dr - cr) > 0.001 && <span className="text-xs font-medium text-red-600">Difference {Math.abs(dr - cr).toFixed(2)}: debit and credit must match</span>}
          <span className="ml-auto text-xs text-black/45">Need a new account? Add it in Chart of Accounts.</span>
        </div>
        <div className="mt-4 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit" disabled={!dr || Math.abs(dr - cr) > 0.001}>Save</Btn></div>
      </form>
    </Modal>
  );
}

function Statement({ accounts, pick }) {
  const [acc, setAcc] = useState(pick || '');
  const [range, setRange] = useState({ from: today().slice(0, 5) + '01-01', to: today() });
  const st = useApi(acc ? `/reports/x/account_statement?account=${acc}&from=${range.from}&to=${range.to}` : null);
  return (
    <Page title="Account Statements" actions={<Btn onClick={() => downloadCsv('account-statement', st.data)}>Export</Btn>}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Account"><select className="input min-w-64" value={acc} onChange={(e) => setAcc(e.target.value)}>
          <option value="">Choose…</option>{accounts.map((a) => <option key={a.id} value={'acc:' + a.id}>{a.name}</option>)}
        </select></Field>
        <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <span className="text-xs text-black/50">Cash & bank statements are under Cash &amp; Bank; party statements under Reports → Party Statement.</span>
      </div>
      <div className="card">
        {!acc ? <div className="py-16 text-center text-sm text-black/45">Pick an account</div> : <Table rows={st.data} columns={[
          { k: 'date', label: 'Date' }, { k: 'type', label: 'Type' }, { k: 'ref', label: 'Ref' }, { k: 'note', label: 'Description' },
          { k: 'debit', label: 'Debit', right: true, r: (r) => (r.debit ? <Money v={r.debit} /> : '') },
          { k: 'credit', label: 'Credit', right: true, r: (r) => (r.credit ? <Money v={r.credit} /> : '') },
          { k: 'balance', label: 'Balance', right: true, r: (r) => <Money v={r.balance} className="font-medium" /> },
        ]} />}
      </div>
    </Page>
  );
}

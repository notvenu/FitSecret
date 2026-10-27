// Cash & Bank: every payment mode is an account (Cash in hand, UPI, Card, Bank, Cheque), balance = money in − money out − expenses.
// Named bank accounts (HDFC current, SBI savings…) are modes too ('bank:<id>'), kept with their details in branch settings.banks.
import { useState } from 'react';
import { today, inr, round2, addDays } from '@fitsecret/shared';
import { modeName, BANK_USES, bankFor } from '@fitsecret/shared/reports';
import { CHEQUE_STATUS } from '@fitsecret/shared/cheques';
import { api, useApi, toast, fail, downloadCsv, shop, go } from '../api.js';
import { Btn, Field, Modal, Money, Table, Badge, SideNav, SectionPage, useForm, cx, ModeOptions } from '../ui.jsx';
import { parseCsv } from './Utilities.jsx';

const LABEL = { bank: 'Bank transfer (no account picked)' };

// Every account is an entry in the side list (with its balance); the menu's Bank Accounts / Cash In Hand / Cheques open on that group.
export default function CashBank({ route, branch, reload: reloadBoot }) {
  const bal = useApi('/reports/x/cash_bank');
  const banks = branch?.settings?.banks || [];
  // the generic "bank" mode only shows while it holds money from before accounts were added
  // UPI / card show as their own accounts only until a bank is marked to receive them (then their money is in that bank)
  const live_ = banks.filter((x) => !x.closed);
  const bankModes = [...(live_.some((x) => x.takes_upi) ? [] : ['upi']), ...(live_.some((x) => x.takes_card) ? [] : ['card']),
    ...(live_.some((x) => x.takes_bank) ? [] : !banks.length || bal.data?.some((r) => r.mode === 'bank') ? ['bank'] : []), ...banks.map((x) => 'bank:' + x.id)]; // closed ones too: history stays
  const [editBank, setEditBank] = useState(null);
  const firstBank = banks.find((x) => !x.closed) ? 'bank:' + banks.find((x) => !x.closed).id : 'bank';
  const [mode, setMode] = useState(() => ({ cash: 'cash', cheque: 'cheque', bank: firstBank === 'bank' ? 'upi' : firstBank }[route.query.tab] || 'all'));
  const tab = mode === 'all' ? 'all' : mode === 'cash' ? 'cash' : mode === 'cheque' ? 'cheque' : 'bank';
  const info = banks.find((x) => 'bank:' + x.id === mode);
  const [range, setRange] = useState({ from: today().slice(0, 5) + '01-01', to: today() });
  const [adj, setAdj] = useState(null);
  const [rec, setRec] = useState(false);
  const st = useApi(tab === 'all' ? null : `/reports/x/bank_statement?mode=${mode}&from=${range.from}&to=${range.to}`);
  const b = (m) => bal.data?.find((r) => r.mode === m)?.balance || 0;
  const reload = () => { bal.reload(); st.reload?.(); };
  const rows = st.data || [];
  const moved = (k) => round2(rows.reduce((s, r) => s + (r[k] || 0), 0));
  const tags = (x) => BANK_USES.filter(([, k]) => x?.[k]).map((u) => u[4]).join(', ');
  const entry = (m) => { const x = banks.find((y) => 'bank:' + y.id === m);
    return { key: m, label: (LABEL[m] || modeName(m, shop)) + (x?.closed ? ' (closed)' : ''), desc: x && tags(x) ? `For: ${tags(x)}` : undefined, badge: inr(b(m)).replace(/\.00$/, '') }; };

  return (
    <SectionPage nav={<SideNav title="Cash & Bank" value={mode} onChange={setMode} groups={[
      { items: [{ key: 'all', label: 'All accounts', badge: inr(round2((bal.data || []).reduce((s, r) => s + r.balance, 0))).replace(/\.00$/, '') }] },
      { label: `Bank & UPI · ${inr(bankModes.reduce((s, m) => s + b(m), 0)).replace(/\.00$/, '')}`, items: bankModes.map(entry) },
      { label: 'Cash', items: [entry('cash')] }, { label: 'Cheques', items: [entry('cheque')] }]} />}
      title={tab === 'all' ? 'All accounts' : LABEL[mode] || modeName(mode, shop)} hint={{ all: 'What you have in cash, in the bank and in cheques not yet deposited. Pick an account for its statement.', bank: 'Money in and out of this account, with the running balance.', cash: 'Cash in the drawer: sales, payments, expenses and day-close adjustments.', cheque: 'Cheques received and given, until they are deposited.' }[tab]} actions={<>
      {tab !== 'all' && tab !== 'cheque' && <Btn onClick={() => downloadCsv(`statement-${mode}`, st.data)}>Export</Btn>}
      {tab === 'cheque' && <><Btn onClick={() => go('/payments/in?new=1&mode=cheque')}>+ Cheque received</Btn><Btn onClick={() => go('/payments/out?new=1&mode=cheque')}>+ Cheque given</Btn></>}
      {tab === 'bank' && <Btn onClick={() => setRec(true)} title="Match a bank statement CSV against the books">Reconcile</Btn>}
      {(tab === 'bank' || tab === 'all') && <Btn onClick={() => setEditBank({})}>+ Add bank account</Btn>}
      {tab !== 'cheque' && <Btn onClick={() => setAdj({ kind: 'transfer', mode: tab === 'all' ? 'cash' : mode, to_mode: mode === 'cash' || tab === 'all' ? firstBank : 'cash' })}>Move money</Btn>}
      {tab !== 'cheque' && <Btn v="primary" onClick={() => setAdj({ kind: 'add', mode: tab === 'all' ? 'cash' : mode })}>Add / take out money</Btn>}
    </>}>
      {tab === 'all' ? <Overview bal={bal.data} accounts={[...bankModes, 'cash', 'cheque']} entry={entry} b={b} open={setMode}
        act={(a) => setAdj({ ...a, to_mode: a.to_mode === 'bank' ? firstBank : a.to_mode, mode: a.mode === 'bank' ? firstBank : a.mode })} />
      : tab === 'cheque' ? <Cheques banks={bankModes.filter((m) => m !== 'upi' && m !== 'card')} firstBank={firstBank} chequeIn={bankFor(shop, 'cheque_in')} chequeOut={bankFor(shop, 'cheque_out')} reloadBal={bal.reload} /> : <div>
        <div className="mb-3 text-sm text-black/55">Balance now <Money v={b(mode)} className={cx('text-lg font-semibold', b(mode) < 0 ? 'text-red-600' : 'text-ink')} />
          {b(mode) < 0 && <span className="ml-2 text-xs text-red-600">More went out than came in: an opening balance is probably missing (Add / take out money → Money in).</span>}</div>
        <div>
          {info && <div className="card mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
            <span className="font-semibold">{info.bank || info.name}</span>
            {info.account_no && <span>A/c <span className="tabular-nums">{info.account_no}</span></span>}
            {info.ifsc && <span>IFSC {info.ifsc}</span>}
            {info.upi && <span>UPI {info.upi}</span>}
            {tags(info) && <Badge c="brand">For: {tags(info)}</Badge>}
            {!tags(info) && <span className="text-xs text-black/45">Not set for anything yet: Edit → What this account is used for</span>}
            <Btn size="sm" v="ghost" className="ml-auto" onClick={() => setEditBank(info)}>Edit</Btn>
          </div>}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            {st.data && <div className="ml-auto flex gap-5 pb-2 text-sm"><span className="text-black/50">In <Money v={moved('money_in')} className="font-semibold text-emerald-700" /></span>
              <span className="text-black/50">Out <Money v={moved('money_out')} className="font-semibold text-red-600" /></span>
              <span className="text-black/50">Closing <Money v={rows.at(-1)?.balance || 0} className="font-semibold text-ink" /></span></div>}
          </div>
          <div className="card">
            <Table rows={st.data} empty="No transactions" columns={[
              { k: 'date', label: 'Date' }, { k: 'type', label: 'Type', r: (r) => <span className="capitalize">{r.type}</span> },
              { k: 'party', label: 'Name', r: (r) => r.party || (tab === 'cheque' ? '' : r.ref) }, ...(tab === 'cheque' ? [{ k: 'ref', label: 'Cheque no. / note' }] : []),
              { k: 'money_in', label: 'In', right: true, r: (r) => (r.money_in ? <Money v={r.money_in} className="text-emerald-700" /> : '') },
              { k: 'money_out', label: 'Out', right: true, r: (r) => (r.money_out ? <Money v={r.money_out} className="text-red-600" /> : '') },
              { k: 'balance', label: 'Balance', right: true, r: (r) => <Money v={r.balance} className="font-medium" /> },
              ...(tab === 'cheque' ? [{ k: 'act', label: '', r: (r) => (!r.money_in || !r.id ? '' : r.reconciled ? <Badge c="green">Deposited {r.reconciled}</Badge>
                : <Btn size="sm" onClick={() => setAdj({ kind: 'transfer', mode: 'cheque', to_mode: firstBank, amount: r.money_in, note: `Cheque deposited${r.party ? ` · ${r.party}` : ''}${r.ref ? ` · ${r.ref}` : ''}`, cheque: r.id })}>Deposit in bank</Btn>) }] : []),
            ]} />
          </div>
        </div>
      </div>}
      {rec && <Reconcile mode={mode} onClose={() => { setRec(false); reload(); }} />}
      {adj && <Adjust init={adj} onClose={() => setAdj(null)} onSaved={() => { setAdj(null); reload(); }} />}
      {editBank && <BankForm bank={editBank} branch={branch} onClose={() => setEditBank(null)} onSaved={(id) => { setEditBank(null); reloadBoot(); if (id) setMode('bank:' + id); reload(); }} />}
    </SectionPage>
  );
}

// Cheque register: every cheque received and given, where it is, and the next step for each.
const CHQ_C = { pending: 'amber', deposited: 'blue', cleared: 'green', bounced: 'red' };
function Cheques({ banks, firstBank, chequeIn, chequeOut, reloadBal }) {
  const list = useApi('/cheques');
  const [show, setShow] = useState('open');
  const [act, setAct] = useState(null); // { c, action }
  if (!list.data) return null;
  const open = (c) => c.status === 'pending' || (c.direction === 'in' && c.status === 'deposited');
  const rows = list.data.filter((c) => ({ open: open(c), in: c.direction === 'in', out: c.direction === 'out', bounced: c.status === 'bounced', all: true }[show]));
  const sumOf = (f) => list.data.filter(f).reduce((s, c) => s + c.amount, 0);
  const done = () => { setAct(null); list.reload(); reloadBal(); };
  const quick = async (c, action) => { try { await api(`/cheques/${c.id}`, { action }); toast(action === 'clear' ? 'Marked cleared' : 'Saved'); done(); } catch (e) { fail(e); } };
  return (<>
    <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['To deposit', sumOf((c) => c.direction === 'in' && c.status === 'pending'), 'Cheques received, still with you'], ['Waiting to clear', sumOf((c) => c.direction === 'in' && c.status === 'deposited'), 'Deposited, not yet in the bank'],
        ['Given, not cleared', sumOf((c) => c.direction === 'out' && c.status === 'pending'), 'Will leave your bank when presented'], ['Bounced', sumOf((c) => c.status === 'bounced'), 'The party owes this again']].map(([l, v, d]) => (
        <div key={l} className="card p-4"><div className="text-xs text-black/50">{l}</div><Money v={v} className="mt-1 block text-xl font-semibold" /><div className="text-[11px] text-black/45">{d}</div></div>
      ))}
    </div>
    <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">{[['open', 'Needs action'], ['in', 'Received'], ['out', 'Given'], ['bounced', 'Bounced'], ['all', 'All']].map(([k, l]) => (
      <button key={k} role="tab" aria-selected={show === k} onClick={() => setShow(k)} className={cx('rounded-full border px-3 py-1 text-xs font-semibold', show === k ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>{l}</button>
    ))}</div>
    <div className="card">
      <Table rows={rows} empty={show === 'open' ? 'No cheques waiting. Record one with + Cheque received / + Cheque given, or pick “Cheque” as the mode when receiving a payment.' : 'None'} columns={[
        { k: 'party', label: 'Party', r: (c) => <div><div className="font-medium">{c.party}</div>
          <div className="text-[11px] text-black/45">{c.direction === 'in' ? 'Received' : 'Given'} {c.date}{c.bill && ` · bill ${c.bill}`}</div></div> },
        { k: 'ref', label: 'Cheque', r: (c) => <div><div className="font-mono text-xs">{c.ref || 'no number'}</div>
          {c.ref_date && <div className={cx('text-[11px]', c.post_dated ? 'font-semibold text-amber-700' : 'text-black/45')}>dated {c.ref_date}{c.post_dated && ' · post-dated'}</div>}</div> },
        { k: 'amount', label: 'Amount', right: true, r: (c) => <Money v={c.amount} className="font-semibold" /> },
        { k: 'status', label: 'Status', r: (c) => <Badge c={CHQ_C[c.status]}>{CHEQUE_STATUS[c.status]}{c.deposit_to && c.status !== 'bounced' ? ` · ${modeName(c.deposit_to, shop)}` : ''}</Badge> },
        { label: '', r: (c) => <div className="flex justify-end gap-1">
          {c.direction === 'in' && c.status === 'pending' && <Btn size="sm" v="primary" onClick={() => setAct({ c, action: 'deposit' })}>Deposit</Btn>}
          {c.direction === 'in' && c.status === 'deposited' && <Btn size="sm" onClick={() => quick(c, 'clear')}>Cleared</Btn>}
          {c.direction === 'out' && c.status === 'pending' && <Btn size="sm" v="primary" onClick={() => setAct({ c, action: 'clear' })}>Cleared</Btn>}
          {c.status !== 'bounced' && <Btn size="sm" v="ghost" className="text-red-600" onClick={() => setAct({ c, action: 'bounce' })}>Bounced</Btn>}
        </div> },
      ]} />
    </div>
    {act && <ChequeStep {...act} banks={banks} firstBank={(act.c.direction === 'in' ? chequeIn : chequeOut) || firstBank} onClose={() => setAct(null)} onDone={done} />}
  </>);
}

function ChequeStep({ c, action, banks, firstBank, onClose, onDone }) {
  const [f, , bind] = useForm({ to_mode: c.deposit_to || firstBank, date: today() });
  const title = { deposit: `Deposit cheque ${c.ref || ''}`, clear: `Cheque ${c.ref || ''} cleared`, bounce: `Cheque ${c.ref || ''} bounced` }[action];
  const submit = async (e) => {
    e.preventDefault();
    try { await api(`/cheques/${c.id}`, { action, ...f }); toast(action === 'bounce' ? `${c.party} owes ₹${c.amount} again` : 'Saved'); onDone(); } catch (err) { fail(err); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <p className="col-span-2 text-sm text-black/60">{c.party} · <Money v={c.amount} className="font-semibold text-ink" />{c.bill && ` · bill ${c.bill}`}</p>
        {action !== 'bounce' && <Field label={action === 'deposit' ? 'Deposited in' : 'Paid from'}><select className="input" {...bind('to_mode')}>{banks.map((m) => <option key={m} value={m}>{modeName(m, shop)}</option>)}</select></Field>}
        <Field label="Date" {...bind('date', 'date')} />
        {action === 'bounce' && <p className="col-span-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {c.direction === 'in' ? `${c.party} will owe ₹${c.amount} again and the bill goes back to unpaid.` : `You will owe ${c.party} ₹${c.amount} again.`}
          {c.deposit_to ? ` The money is taken back out of ${modeName(c.deposit_to, shop)}.` : ''} The cheque stays here marked Bounced. Bank charges: add them in Expenses.</p>}
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit" className={action === 'bounce' ? '!bg-red-600' : ''}>{action === 'bounce' ? 'Mark bounced' : 'Save'}</Btn></div>
      </form>
    </Modal>
  );
}

// All accounts at a glance, with the everyday money moves one tap away.
function Overview({ bal, accounts, entry, b, open, act }) {
  if (!bal) return null;
  const sumOf = (ms) => round2(ms.reduce((s, m) => s + b(m), 0));
  const tiles = [['Cash in hand', sumOf(['cash'])], ['Bank & UPI', sumOf(accounts.filter((m) => !['cash', 'cheque'].includes(m)))], ['Cheques not deposited', sumOf(['cheque'])], ['Total', sumOf(accounts)]];
  const quick = [['Deposit cash in bank', { kind: 'transfer', mode: 'cash', to_mode: 'bank' }], ['Withdraw cash from bank', { kind: 'transfer', mode: 'bank', to_mode: 'cash' }],
    ['Owner puts money in', { kind: 'add', mode: 'cash' }], ['Owner takes money out', { kind: 'reduce', mode: 'cash' }]];
  return (<>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map(([l, v], i) => (
      <div key={l} className={cx('card p-4', i === 3 && '!bg-ink text-white')}><div className={cx('text-xs', i === 3 ? 'text-brand' : 'text-black/50')}>{l}</div>
        <Money v={v} className={cx('display mt-1 block text-2xl', v < 0 && 'text-red-600')} /></div>
    ))}</div>
    <div className="mt-4 flex flex-wrap gap-2">{quick.map(([l, a]) => <Btn key={l} onClick={() => act(a)}>{l}</Btn>)}</div>
    <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-black/50">Accounts</h2>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{accounts.map((m) => {
      const r = bal.find((x) => x.mode === m);
      return (
        <button key={m} onClick={() => open(m)} className="card p-4 text-left transition-shadow hover:shadow-md">
          <div className="text-sm font-semibold">{entry(m).label}</div>
          <Money v={b(m)} className={cx('mt-1 block text-xl font-semibold', b(m) < 0 && 'text-red-600')} />
          <div className="mt-1 text-xs text-black/50">{r ? <>In <Money v={r.money_in} /> · Out <Money v={r.money_out} /></> : 'No entries yet'} · Statement →</div>
        </button>
      );
    })}</div>
  </>);
}

// A bank account lives in branch settings, so it syncs to every counter and /admin with the branch.
function BankForm({ bank, branch, onClose, onSaved }) {
  const [f, set, bind] = useForm({ name: '', bank: '', account_no: '', ifsc: '', upi: '', holder: '', opening: '', opening_date: today(), closed: false,
    ...Object.fromEntries(BANK_USES.map(([, k]) => [k, false])), ...bank });
  const others = (branch.settings?.banks || []).filter((b) => b.id !== bank.id && !b.closed);
  const submit = async (e) => {
    e.preventDefault();
    const id = bank.id || crypto.randomUUID().slice(0, 8);
    const row = { ...f, id, name: f.name.trim() || `${f.bank} ${String(f.account_no).slice(-4)}`.trim(), ifsc: f.ifsc.toUpperCase().trim(), opening: +f.opening || 0 };
    if (!row.name) return toast('Give the account a name', 'err');
    const s = branch.settings || {};
    // one account per use: ticking a use here takes it off the other accounts
    const banks = (s.banks || []).map((b) => ({ ...b, ...Object.fromEntries(BANK_USES.filter(([, k]) => row[k]).map(([, k]) => [k, false])) }));
    try {
      await api('/t/branches', { id: branch.id, settings: { ...s, banks: bank.id ? banks.map((b) => (b.id === id ? row : b)) : [...banks, row] } });
      toast('Bank account saved'); onSaved(bank.id ? null : id);
    } catch (e) { fail(e); }
  };
  return (
    <Modal title={bank.id ? 'Edit bank account' : 'Add bank account'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Account name (shown in payment lists)" {...bind('name')} autoFocus className="col-span-2" placeholder="e.g. HDFC Current" />
        <Field label="Bank" {...bind('bank')} placeholder="HDFC Bank" />
        <Field label="Account holder" {...bind('holder')} />
        <Field label="Account number" {...bind('account_no')} inputMode="numeric" />
        <Field label="IFSC" {...bind('ifsc')} />
        <Field label="UPI ID linked to it" {...bind('upi')} placeholder="shop@okhdfcbank" hint="Printed on bills as the pay-to UPI" />
        <div />
        <fieldset className="col-span-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">What this account is used for</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">{['in', 'out'].map((side) => (
            <div key={side}>
              <div className="mb-1 mt-1 text-xs font-bold uppercase tracking-wide text-black/55">{side === 'in' ? 'Money in' : 'Money out'}</div>
              {BANK_USES.filter(([s]) => s === side).map(([, k, l, d]) => { const now = others.find((b) => b[k]); return (
                <label key={k} className="flex items-start gap-2 py-1 text-sm"><input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} className="mt-1" />
                  <span><b className="font-medium">{l}</b><span className="block text-[11px] text-black/50">{d}{now && !f[k] ? ` · now: ${now.name}` : now && f[k] ? ` · moves from ${now.name}` : ''}</span></span></label>); })}
            </div>
          ))}</div>
        </fieldset>
        <Field label="Opening balance" {...bind('opening')} inputMode="decimal" hint="Balance on the date below" />
        <Field label="As on" {...bind('opening_date', 'date')} />
        {bank.id && <label className="col-span-2 flex items-center gap-2 text-sm"><input {...bind('closed', 'checkbox')} /> Closed (hide from payment lists; history stays)</label>}
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

function Adjust({ init, onClose, onSaved }) {
  const [f, set, bind] = useForm({ kind: init.kind, mode: init.mode, to_mode: init.to_mode || (init.mode === 'cash' ? 'bank' : 'cash'), amount: init.amount ?? '', date: today(), note: init.note || '' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/cash', { ...f, amount: +f.amount });
      if (init.cheque) await api('/payments/reconcile', { ids: [init.cheque], date: f.date }); // the cheque's row then shows "Deposited"
      toast('Saved'); onSaved();
    } catch (e) { fail(e); }
  };
  const opts = <ModeOptions cheque />;
  const KINDS = [['add', 'Money in', 'Opening balance, owner puts money in'], ['reduce', 'Money out', 'Owner takes money out, cash short'], ['transfer', 'Move between accounts', 'Cash to bank, bank to cash, cheque deposited']];
  return (
    <Modal title={init.cheque ? 'Deposit cheque in bank' : 'Add, take out or move money'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        {!init.cheque && <div role="radiogroup" aria-label="What happened" className="col-span-2 grid gap-2 sm:grid-cols-3">{KINDS.map(([k, l, sub]) => (
          <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => set('kind', k)}
            className={cx('rounded-[12px] border p-3 text-left text-sm', f.kind === k ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>
            <b className="block">{l}</b><span className={cx('text-xs', f.kind === k ? 'text-white/70' : 'text-black/50')}>{sub}</span></button>
        ))}</div>}
        <Field label={f.kind === 'add' ? 'Put it in' : 'Take it from'}><select className="input" {...bind('mode')}>{opts}</select></Field>
        {f.kind === 'transfer' ? <Field label="Put it in"><select className="input" {...bind('to_mode')}>{opts}</select></Field> : <div />}
        <Field label="Amount (₹)" {...bind('amount')} required autoFocus inputMode="decimal" />
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="Note (optional)" {...bind('note')} className="col-span-2" placeholder={f.kind === 'transfer' ? 'e.g. Deposited at HDFC MG Road' : 'e.g. Opening cash'} />
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

// Bank reconciliation: paste / upload the bank's statement (CSV), match each line to a payment in the books by amount and date
// (±3 days), and mark the matches reconciled. What's left over is either not in the books yet (bank charges, interest)
// or not in the bank yet (cheques not cleared).
// ponytail: expenses paid from the bank have no reconciled flag, so they show as unmatched; add one if that gets noisy.
const DATE_RE = [[/^(\d{4})-(\d{2})-(\d{2})/, (m) => `${m[1]}-${m[2]}-${m[3]}`], [/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/, (m) => `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`],
  [/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{2,4})/, (m) => `${m[3].length === 2 ? '20' + m[3] : m[3]}-${String('janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase()) / 3 + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`]];
const toDate = (s) => { for (const [re, f] of DATE_RE) { const m = String(s).trim().match(re); if (m) return f(m); } return null; };
const amt = (s) => round2(+String(s || '').replace(/[^\d.-]/g, '') || 0);
export function statementLines(rows) {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]), find = (re) => keys.find((k) => re.test(k));
  const dk = find(/date/i), cr = find(/deposit|credit|\bcr\b/i), dr = find(/withdraw|debit|\bdr\b/i), one = find(/amount/i), desc = find(/narration|description|particular|remark|details/i);
  return rows.map((r) => {
    let v = cr || dr ? amt(r[cr]) - amt(r[dr]) : amt(r[one]);
    return { date: toDate(r[dk]), desc: r[desc] || '', in: v > 0 ? v : 0, out: v < 0 ? -v : 0 };
  }).filter((l) => l.date && (l.in || l.out));
}

function Reconcile({ mode, onClose }) {
  const pays = useApi('/t/payments');
  const [lines, setLines] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = (text) => { const l = statementLines(parseCsv(text)); if (!l.length) toast('No dated amounts found. Keep the header row (Date, Narration, Withdrawal, Deposit) as the first line', 'err'); setLines(l); };
  const open = (pays.data || []).filter((p) => p.mode === mode && !p.reconciled);
  // greedy match: closest date first, each payment used once
  const used = new Set();
  const matched = (lines || []).map((l) => {
    const dir = l.in ? 'in' : 'out', a = l.in || l.out;
    const hit = open.filter((p) => !used.has(p.id) && p.direction === dir && Math.abs(p.amount - a) < 0.01 && p.date >= addDays(l.date, -3) && p.date <= addDays(l.date, 3))
      .sort((x, y) => Math.abs(new Date(x.date) - new Date(l.date)) - Math.abs(new Date(y.date) - new Date(l.date)))[0];
    if (hit) used.add(hit.id);
    return { ...l, hit };
  });
  const from = lines?.length ? lines.map((l) => l.date).sort()[0] : null, to = lines?.length ? lines.map((l) => l.date).sort().at(-1) : null;
  const notInBank = from ? open.filter((p) => !used.has(p.id) && p.date >= from && p.date <= to) : [];
  const ok = matched.filter((l) => l.hit);
  const save = async () => {
    setSaving(true);
    try {
      const byDate = new Map();
      for (const l of ok) byDate.set(l.date, [...(byDate.get(l.date) || []), l.hit.id]);
      for (const [date, ids] of byDate) await api('/payments/reconcile', { ids, date });
      toast(`${ok.length} entries reconciled`); onClose();
    } catch (e) { fail(e); } finally { setSaving(false); }
  };
  return (
    <Modal wide title={`Reconcile ${modeName(mode, shop)}`} onClose={onClose} footer={<><Btn onClick={onClose}>Close</Btn>
      <Btn v="primary" disabled={!ok.length || saving} onClick={save}>Mark {ok.length} matched as reconciled</Btn></>}>
      {!lines ? <div className="space-y-3 text-sm">
        <p>Download the statement from net banking as <b>CSV</b> (or Excel → Save as CSV), then pick it here. The first line must be the column headings.</p>
        <input type="file" accept=".csv,.txt" onChange={async (e) => e.target.files[0] && load(await e.target.files[0].text())} />
        <p className="text-black/50">Or paste it:</p>
        <textarea className="input font-mono text-xs" rows={6} placeholder={'Date,Narration,Withdrawal,Deposit\n03/10/2026,UPI-RAVI,,1200'} onBlur={(e) => e.target.value && load(e.target.value)} />
        <p className="text-xs text-black/45">{open.length} entries in the books for this account are not reconciled yet.</p>
      </div> : <>
        <div className="mb-3 flex flex-wrap gap-2 text-sm"><Badge c="green">{ok.length} matched</Badge><Badge c="amber">{matched.length - ok.length} only in bank</Badge><Badge c="red">{notInBank.length} only in books</Badge>
          <button className="ml-auto text-xs text-brand-d hover:underline" onClick={() => setLines(null)}>Load another file</button></div>
        <Table rows={matched} columns={[
          { k: 'date', label: 'Date' }, { k: 'desc', label: 'Bank narration', r: (l) => <span className="line-clamp-1 text-xs">{l.desc}</span> },
          { k: 'in', label: 'In', right: true, r: (l) => (l.in ? inr(l.in) : '') }, { k: 'out', label: 'Out', right: true, r: (l) => (l.out ? inr(l.out) : '') },
          { label: 'In the books', r: (l) => (l.hit ? <span className="text-xs text-emerald-700">✓ {l.hit.date} {l.hit.note || ''}</span> : <span className="text-xs text-amber-700">Not found: bank charge / interest? Add it in Expenses or Adjust balance</span>) },
        ]} />
        {notInBank.length > 0 && <>
          <h3 className="mt-4 mb-1 text-sm font-semibold">In the books, not in this statement</h3>
          <Table rows={notInBank} columns={[{ k: 'date', label: 'Date' }, { k: 'direction', label: 'In/Out' }, { k: 'amount', label: 'Amount', right: true, r: (p) => <Money v={p.amount} /> }, { k: 'note', label: 'Note' }]} />
        </>}
      </>}
    </Modal>
  );
}

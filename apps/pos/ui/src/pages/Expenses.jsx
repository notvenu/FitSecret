import { today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { bankFor } from '@fitsecret/shared/reports';
import { useState } from 'react';
import { Btn, Field, Modal, Page, Table, Money, DeleteBtn, useForm, ModeOptions } from '../ui.jsx';
import { modeName } from '@fitsecret/shared/reports';
import { shop } from '../api.js';
import { InsightStrip } from './Insights.jsx';

const CATS = ['Rent', 'Salary', 'Staff advance', 'Electricity', 'Internet', 'Delivery / courier', 'Marketing', 'Packaging', 'Maintenance', 'Other'];

export default function Expenses({ user, branch }) {
  const list = useApi('/t/expenses');
  const [f, set, bind, setF] = useForm({ category: 'Rent', amount: '', mode: bankFor(shop, 'pays_expenses') || 'cash', date: today(), note: '' }); // the account set for expenses
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/t/expenses', { ...f, amount: +f.amount }); toast('Expense added'); setF({ ...f, amount: '', note: '' }); list.reload(); } catch (e) { fail(e); }
  };
  const month = today().slice(0, 7);
  const [edit, setEdit] = useState(null);
  return (
    <Page top={<InsightStrip user={user} branch={branch} sections={['profit']} limit={2} />} title="Expenses" hint="Shop costs like rent, power and tea. Salary is paid from Staff → Payroll." actions={<Btn onClick={() => downloadCsv('expenses', list.data)}>Export</Btn>}>
      <form onSubmit={submit} className="card mb-4 grid grid-cols-2 items-end gap-3 p-4 md:grid-cols-6">
        <Field label="Category"><select className="input" {...bind('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Amount" {...bind('amount')} required inputMode="decimal" />
        <Field label="Mode"><select className="input" {...bind('mode')}><ModeOptions /></select></Field>
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="Note" {...bind('note')} />
        <Btn v="primary" type="submit">Add expense</Btn>
      </form>
      <div className="mb-2 text-right text-sm text-black/55">This month <Money v={list.data?.filter((e) => e.date?.startsWith(month)).reduce((s, e) => s + e.amount, 0)} className="font-semibold text-ink" /></div>
      <div className="card">
        <Table rows={list.data} onRow={setEdit} empty="No expenses yet" columns={[
          { k: 'date', label: 'Date' }, { k: 'category', label: 'Category' }, { k: 'note', label: 'Note' }, { k: 'mode', label: 'Mode', r: (e) => modeName(e.mode, shop) },
          { k: 'amount', label: 'Amount', right: true, r: (e) => <Money v={e.amount} /> },
        ]} />
      </div>
      {edit && <ExpenseForm e={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </Page>
  );
}

function ExpenseForm({ e: x, onClose, onSaved }) {
  const [f, , bind] = useForm({ ...x, amount: String(x.amount), note: x.note || '' });
  const submit = async (ev) => {
    ev.preventDefault();
    try { await api('/t/expenses', { id: x.id, category: f.category, amount: +f.amount, mode: f.mode, date: f.date, note: f.note }); toast('Expense updated'); onSaved(); } catch (err) { fail(err); }
  };
  return (
    <Modal title="Edit expense" onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Category"><select className="input" {...bind('category')}>{[...new Set([...CATS, x.category])].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Amount" {...bind('amount')} required inputMode="decimal" autoFocus />
        <Field label="Paid from"><select className="input" {...bind('mode')}><ModeOptions /></select></Field>
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="Note" {...bind('note')} className="col-span-2" />
        <div className="col-span-2 flex justify-end gap-2">
          <DeleteBtn what={`this ${x.category} expense`} onDelete={() => api('/t/expenses/' + x.id, null, 'DELETE').then(() => { toast('Expense deleted'); onSaved(); }, fail)} />
          <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn>
        </div>
      </form>
    </Modal>
  );
}

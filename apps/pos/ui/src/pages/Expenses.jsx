import { today } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Page, Table, Money, useForm } from '../ui.jsx';

const CATS = ['Rent', 'Salary', 'Electricity', 'Internet', 'Delivery / courier', 'Marketing', 'Packaging', 'Maintenance', 'Other'];

export default function Expenses() {
  const list = useApi('/t/expenses');
  const [f, set, bind, setF] = useForm({ category: 'Rent', amount: '', mode: 'cash', date: today(), note: '' });
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/t/expenses', { ...f, amount: +f.amount }); toast('Expense added'); setF({ ...f, amount: '', note: '' }); list.reload(); } catch (e) { fail(e); }
  };
  const month = today().slice(0, 7);
  return (
    <Page title="Expenses" actions={<Btn onClick={() => downloadCsv('expenses', list.data)}>Export</Btn>}>
      <form onSubmit={submit} className="card mb-4 grid grid-cols-2 items-end gap-3 p-4 md:grid-cols-6">
        <Field label="Category"><select className="input" {...bind('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Amount" {...bind('amount')} required inputMode="decimal" />
        <Field label="Mode"><select className="input" {...bind('mode')}>{['cash', 'upi', 'bank', 'card'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="Note" {...bind('note')} />
        <Btn v="primary" type="submit">Add expense</Btn>
      </form>
      <div className="mb-2 text-right text-sm text-black/55">This month <Money v={list.data?.filter((e) => e.date?.startsWith(month)).reduce((s, e) => s + e.amount, 0)} className="font-semibold text-ink" /></div>
      <div className="card">
        <Table rows={list.data} columns={[
          { k: 'date', label: 'Date' }, { k: 'category', label: 'Category' }, { k: 'note', label: 'Note' }, { k: 'mode', label: 'Mode' },
          { k: 'amount', label: 'Amount', right: true, r: (e) => <Money v={e.amount} /> },
          { label: '', r: (e) => <button className="text-xs text-red-600 hover:underline" onClick={() => confirm('Delete expense?') && api('/t/expenses/' + e.id, null, 'DELETE').then(list.reload, fail)}>Delete</button> },
        ]} />
      </div>
    </Page>
  );
}

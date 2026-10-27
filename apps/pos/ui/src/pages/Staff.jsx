// Staff: daily attendance register, month sheet, payroll (salary earned vs paid) and the staff list.
// Pay and advances are expenses tagged with the employee, so they show in Cash & Bank, Expenses and P&L like any other outgoing.
import { useState } from 'react';
import { today, inr, ATTENDANCE } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv, shop } from '../api.js';
import { bankFor } from '@fitsecret/shared/reports';
import { Btn, Field, Modal, Money, Table, Badge, DeleteBtn, SideNav, SectionPage, useForm, cx, ModeOptions } from '../ui.jsx';
import { InsightStrip } from './Insights.jsx';
import Logins from './Logins.jsx';
import { CLOUD } from '@backend';

const DOT = { present: 'bg-emerald-500 text-white', half: 'bg-amber-400 text-ink', leave: 'bg-sky-400 text-white', off: 'bg-black/15 text-ink', absent: 'bg-red-500 text-white' };
const SHORT = { present: 'P', half: '½', leave: 'L', off: 'O', absent: 'A' };
const CYCLE = ['present', 'absent', 'half', 'leave', 'off'];
const now = () => new Date().toTimeString().slice(0, 5);
const ROLES = ['Cashier', 'Senior cashier', 'Store manager', 'Sales executive', 'Inventory / store keeper', 'Delivery', 'Trainer / nutritionist', 'Accountant', 'Helper'];
export const TABS = [['today', 'Attendance', 'Who came in today'], ['month', 'Month sheet', 'The whole month at a glance'], ['payroll', 'Payroll', 'Earned vs paid, pay salary'], ['list', 'Staff list', 'Everyone who works here'],
  ['logins', 'Logins & PINs', 'Who can sign in, what they may do']]; // logins: owners on a counter PC only

export default function Staff({ route, user, branch, boot }) {
  const logins = user?.role === 'admin' && !CLOUD;
  const tabs = TABS.filter(([k]) => k !== 'logins' || logins);
  const tab = tabs.some(([k]) => k === route.query.tab) ? route.query.tab : 'today';
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const m = tab === 'today' ? day.slice(0, 7) : month;
  const sheet = useApi(['list', 'logins'].includes(tab) ? null : `/reports/x/staff_month?month=${m}`);
  const [edit, setEdit] = useState(route.query.new ? {} : null);
  const [pay, setPay] = useState(null);
  const [ver, setVer] = useState(0); // bumps after a save so the staff list reloads
  const go = (t) => { location.hash = '#/staff?tab=' + t; };

  // Marking again updates that person's row for the day (the back end finds it).
  const mark = (r, date, patch) => api('/t/attendance', { employee_id: r.employee_id, date, status: r.days[date]?.status || 'present', ...r.days[date] && { in_time: r.days[date].in_time, out_time: r.days[date].out_time }, ...patch })
    .then(sheet.reload, fail);

  return (
    <SectionPage nav={<SideNav title="Staff" value={tab} onChange={go} groups={[{ items: tabs.filter(([k]) => k !== 'logins').map(([key, label, desc]) => ({ key, label, desc })) },
      ...(logins ? [{ label: 'Sign-in', items: [{ key: 'logins', label: 'Logins & PINs', desc: 'Who can sign in, what they may do' }] }] : [])]} />}
      top={<InsightStrip user={user} branch={branch} sections={['staff']} limit={2} />} title={tabs.find(([k]) => k === tab)[1]}
      hint={{ today: 'Mark each person present, on leave or absent. Tap the time to fix in / out.', month: 'Click a day to change it: present → absent → half day → paid leave → weekly off.',
        payroll: 'What each person earned this month from attendance, what was paid, and what is still due.', list: 'Open a person to edit, mark them as left, or delete a mistaken entry.',
        logins: 'Each person unlocks the counter with their own PIN, so bills show who made them. Set what they may open and change, and where they work. Discount and price rules: Settings → Staff & permissions.' }[tab]} actions={tab !== 'logins' && <>
      {tab === 'payroll' && <Btn onClick={() => downloadCsv('payroll-' + month, sheet.data?.map(({ days, employee_id, ...r }) => r))}>Export</Btn>}
      <Btn v="primary" onClick={() => setEdit({})}>+ Add staff</Btn>
    </>}>
      {!['list', 'logins'].includes(tab) && <div className="mb-4 flex flex-wrap items-end gap-3">
        {tab === 'today' && <Field label="Date" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} />}
        {(tab === 'month' || tab === 'payroll') && <Field label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value || today().slice(0, 7))} />}
      </div>}

      {tab === 'today' && <Register rows={sheet.data} day={day} mark={mark} onAdd={() => setEdit({})} />}
      {tab === 'month' && <MonthSheet rows={sheet.data} month={month} mark={mark} />}
      {tab === 'payroll' && <Payroll rows={sheet.data} onPay={setPay} />}
      {tab === 'list' && <StaffList onEdit={setEdit} key={ver} />}
      {tab === 'logins' && <Logins boot={boot} />}

      {edit && <EmployeeForm emp={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setVer((v) => v + 1); sheet.reload(); }} />}
      {pay && <PayForm r={pay} month={month} onClose={() => setPay(null)} onSaved={() => { setPay(null); sheet.reload(); }} />}
    </SectionPage>
  );
}

function Register({ rows, day, mark, onAdd }) {
  if (rows && !rows.length) return <Empty onAdd={onAdd} />;
  const marked = rows?.filter((r) => r.days[day]).length || 0;
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
        <span className="text-black/55">{marked} of {rows?.length || 0} marked for {new Date(day + 'T00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        {rows?.some((r) => !r.days[day]) && <Btn size="sm" onClick={() => Promise.all(rows.filter((r) => !r.days[day]).map((r) => mark(r, day, { status: 'present', in_time: day === today() ? now() : null })))}>Mark rest present</Btn>}
      </div>
      <Table rows={rows} columns={[
        { k: 'name', label: 'Staff', r: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-black/45">{r.role}</div></div> },
        { label: 'Status', r: (r) => (
          <div className="flex flex-wrap gap-1">
            {Object.entries(ATTENDANCE).map(([s, l]) => (
              <button key={s} onClick={() => mark(r, day, { status: s, ...(s === 'present' && !r.days[day]?.in_time && day === today() && { in_time: now() }) })}
                className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', r.days[day]?.status === s ? cx('border-transparent', DOT[s]) : 'border-black/15 hover:border-ink')}>{l}</button>
            ))}
          </div>) },
        { label: 'In', r: (r) => <TimeCell v={r.days[day]?.in_time} disabled={!r.days[day]} onSave={(v) => mark(r, day, { in_time: v })} /> },
        { label: 'Out', r: (r) => <TimeCell v={r.days[day]?.out_time} disabled={!r.days[day]} onSave={(v) => mark(r, day, { out_time: v })} now={day === today()} /> },
      ]} />
    </div>
  );
}

function TimeCell({ v, onSave, disabled, now: nowBtn }) {
  if (disabled) return <span className="text-black/30">—</span>;
  return (
    <span className="flex items-center gap-1">
      <input type="time" className="input w-28 py-1" defaultValue={v || ''} key={v} onBlur={(e) => e.target.value !== (v || '') && onSave(e.target.value || null)} />
      {nowBtn && !v && <button className="text-xs text-brand-d hover:underline" onClick={() => onSave(now())}>Now</button>}
    </span>
  );
}

function MonthSheet({ rows, month, mark }) {
  if (!rows) return <Table rows={null} columns={[]} />;
  if (!rows.length) return <Empty />;
  const n = rows[0].days_in_month, dates = Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  // click a day to cycle present → absent → half → leave → off
  const next = (r, d) => mark(r, d, { status: CYCLE[(CYCLE.indexOf(r.days[d]?.status) + 1) % CYCLE.length] });
  return (
    <div className="card overflow-x-auto">
      <table className="text-xs">
        <thead><tr className="border-b border-line text-black/50">
          <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium">Staff</th>
          {dates.map((d) => <th key={d} className={cx('w-7 py-2 font-medium', new Date(d + 'T00:00').getDay() === 0 && 'text-red-500')}>{+d.slice(8)}</th>)}
          {['P', '½', 'L', 'O', 'A'].map((h) => <th key={h} className="w-8 py-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.employee_id} className="border-b border-black/5 last:border-0">
            <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 font-medium">{r.name}</td>
            {dates.map((d) => {
              const s = r.days[d]?.status;
              return <td key={d} className="p-0.5 text-center">
                <button disabled={d > today()} onClick={() => next(r, d)} title={s ? ATTENDANCE[s] : 'Not marked'}
                  className={cx('h-6 w-6 rounded-md font-semibold disabled:opacity-30', s ? DOT[s] : 'bg-black/5 text-black/25 hover:bg-black/10')}>{s ? SHORT[s] : '·'}</button>
              </td>;
            })}
            {[r.present, r.half, r.leave, r.off, r.absent].map((v, i) => <td key={i} className="text-center tabular-nums">{v}</td>)}
          </tr>
        ))}</tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-black/50">Click a day to change it: present → absent → half day → paid leave → weekly off. Sundays in red.</p>
    </div>
  );
}

function Payroll({ rows, onPay }) {
  const total = (k) => rows?.reduce((s, r) => s + r[k], 0) || 0;
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Earned this month', 'earned'], ['Paid (salary + advances)', 'paid'], ['Advances', 'advance'], ['Still to pay', 'balance']].map(([l, k]) => (
          <div key={k} className="card p-4"><div className="text-xs text-black/50">{l}</div><Money v={total(k)} className={cx('text-xl font-semibold', k === 'balance' && total(k) < 0 && 'text-red-600')} /></div>
        ))}
      </div>
      <div className="card">
        <Table rows={rows} empty="No staff yet" columns={[
          { k: 'name', label: 'Staff', r: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-black/45">{r.pay_type === 'daily' ? `${inr(r.salary)} / day` : `${inr(r.salary)} / month`}</div></div> },
          { k: 'payable_days', label: 'Paid days', right: true, r: (r) => <span title={`${r.present} present, ${r.half} half, ${r.leave} leave, ${r.off} off, ${r.absent} absent`}>{r.payable_days}<span className="text-black/40"> / {r.days_in_month}</span></span> },
          { k: 'earned', label: 'Earned', right: true, r: (r) => <Money v={r.earned} /> },
          { k: 'paid', label: 'Paid', right: true, r: (r) => <><Money v={r.paid} />{r.advance > 0 && <div className="text-[11px] text-black/45">incl. advance {inr(r.advance)}</div>}</> },
          { k: 'balance', label: 'Balance', right: true, r: (r) => <Money v={r.balance} className={cx('font-semibold', r.balance < 0 && 'text-red-600')} /> },
          { label: '', r: (r) => <div className="flex justify-end gap-1">
            <Btn size="sm" v="primary" onClick={() => onPay({ ...r, kind: 'Salary' })}>Pay</Btn>
            <Btn size="sm" onClick={() => onPay({ ...r, kind: 'Staff advance' })}>Advance</Btn>
          </div> },
        ]} />
      </div>
      <p className="mt-2 text-xs text-black/50">Earned counts present days, paid leave and weekly offs in full and half days as half; days not marked are not paid. Monthly salary is split over the days in the month. A negative balance means more was paid than earned so far (e.g. an advance).</p>
    </>
  );
}

function PayForm({ r, month, onClose, onSaved }) {
  const [f, , bind] = useForm({ amount: r.kind === 'Salary' ? Math.max(0, r.balance) || '' : '', mode: bankFor(shop, 'pays_salary') || 'cash', date: today(), note: '' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/t/expenses', { category: r.kind, employee_id: r.employee_id, amount: +f.amount, mode: f.mode, date: f.date,
        note: f.note || `${r.name} · ${r.kind === 'Salary' ? 'salary ' + new Date(month + '-01T00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'advance'}` });
      toast('Recorded'); onSaved();
    } catch (e) { fail(e); }
  };
  return (
    <Modal title={`${r.kind === 'Salary' ? 'Pay salary' : 'Give advance'} · ${r.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Amount" {...bind('amount')} required autoFocus inputMode="decimal" hint={`Earned ${inr(r.earned)} · paid ${inr(r.paid)}`} />
        <Field label="Paid from"><select className="input" {...bind('mode')}><ModeOptions /></select></Field>
        <Field label="Date" {...bind('date', 'date')} />
        <Field label="Note" {...bind('note')} />
        <p className="col-span-2 text-xs text-black/50">Saved as a “{r.kind}” expense for {r.name}, so it leaves the cash / bank account you pick.</p>
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

function StaffList({ onEdit }) {
  const list = useApi('/t/employees');
  const sales = useApi(`/reports/x/staff_sales?from=${today().slice(0, 7)}-01&to=${today()}`); // bills made by POS logins with the same name
  const sold = (name) => sales.data?.find((s) => s.staff === name);
  const rows = list.data && [...list.data].sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name));
  return (
    <div className="card">
      <Table rows={rows} onRow={onEdit} empty="No staff yet" rowClass={(e) => e.active === false && 'opacity-50'} columns={[
        { k: 'name', label: 'Name', r: (e) => <span className="font-medium">{e.name}</span> },
        { k: 'role', label: 'Role' }, { k: 'phone', label: 'Phone' },
        { k: 'salary', label: 'Pay', right: true, r: (e) => e.salary ? `${inr(e.salary)} / ${e.pay_type === 'daily' ? 'day' : 'month'}` : '—' },
        { k: 'joined', label: 'Joined' },
        { label: 'Sales this month', right: true, r: (e) => sold(e.name) ? <span>{inr(sold(e.name).total)} <span className="text-xs text-black/45">· {sold(e.name).bills} bills</span></span> : <span className="text-black/30">—</span> },
        { k: 'active', label: '', r: (e) => (e.active === false ? <Badge>Left</Badge> : <Badge c="green">Active</Badge>) },
      ]} />
    </div>
  );
}

function EmployeeForm({ emp, onClose, onSaved }) {
  const [f, set, bind] = useForm(emp || { name: '', phone: '', role: '', pay_type: 'monthly', salary: '', joined: today(), active: true, note: '' });
  const [other, setOther] = useState(!!f.role && !ROLES.includes(f.role)); // a role not in the list is typed in
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/t/employees', { ...f, salary: f.salary === '' ? null : +f.salary, joined: f.joined || null }); toast('Saved'); onSaved(); } catch (e) { fail(e); }
  };
  return (
    <Modal title={emp ? 'Edit staff' : 'Add staff'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Name" {...bind('name')} required autoFocus className="col-span-2" hint="Use the same name as their POS login to see their sales" />
        <Field label="Phone" {...bind('phone')} inputMode="tel" />
        <Field label="Role">
          <select className="input" value={other ? 'other' : f.role || ''} onChange={(e) => { const v = e.target.value; setOther(v === 'other'); set('role', v === 'other' ? '' : v); }} required>
            <option value="" disabled>Pick a role</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="other">Other…</option>
          </select>
        </Field>
        {other && <Field label="Their role" value={f.role} onChange={(e) => set('role', e.target.value)} required autoFocus placeholder="e.g. Accountant" />}
        <Field label="Paid"><select className="input" {...bind('pay_type')}><option value="monthly">Monthly salary</option><option value="daily">Daily wage</option></select></Field>
        <Field label={f.pay_type === 'daily' ? 'Wage per day' : 'Salary per month'} {...bind('salary')} inputMode="decimal" />
        <Field label="Joined on" {...bind('joined', 'date')} />
        <Field label="Note" {...bind('note')} placeholder="ID proof, bank a/c, emergency contact…" />
        {emp && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active === false} onChange={(e) => set('active', !e.target.checked)} /> Has left (hide from attendance; history stays)</label>}
        {emp && <p className="col-span-2 text-xs text-black/50">Someone who worked here: tick “Has left” to keep their attendance and pay history. Delete is for entries made by mistake.</p>}
        <div className="col-span-2 flex justify-end gap-2">
          {emp && <DeleteBtn what={emp.name} onDelete={() => api('/t/employees/' + emp.id, null, 'DELETE').then(() => { toast(`${emp.name} deleted`); onSaved(); }, fail)} />}
          <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn>
        </div>
      </form>
    </Modal>
  );
}

const Empty = ({ onAdd }) => (
  <div className="card py-16 text-center text-sm text-black/50">
    No staff added yet.{onAdd && <> <button className="font-semibold text-brand-d hover:underline" onClick={onAdd}>Add your first staff member</button></>}
  </div>
);

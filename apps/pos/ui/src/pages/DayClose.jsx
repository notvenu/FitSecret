// Day close (Z report): what the books say each payment mode should hold today vs what was counted.
// The cash difference is posted as a cash adjustment, so tomorrow opens on the counted amount.
import { useState } from 'react';
import { inr, today, round2 } from '@fitsecret/shared';
import { modeName } from '@fitsecret/shared/reports';
import { api, useApi, toast, fail, shop } from '../api.js';
import { Btn, Field, Money, Page, Loading, Badge, cx } from '../ui.jsx';
import { InsightStrip } from './Insights.jsx';

const NOTES = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export default function DayClose({ user, branch }) {
  const [date, setDate] = useState(today());
  const { data: d, reload } = useApi('/reports/x/day_close?date=' + date);
  const [counted, setCounted] = useState({});
  const [notes, setNotes] = useState({}); // denomination → count, fills the cash box
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  if (!d) return <Loading />;
  const expect = (m) => (m.mode === 'cash' ? m.closing : m.net);
  const fromNotes = round2(NOTES.reduce((s, n) => s + n * (+notes[n] || 0), 0));
  const setCount = (n, v) => { const next = { ...notes, [n]: v }; setNotes(next); setCounted({ ...counted, cash: String(round2(NOTES.reduce((s, x) => s + x * (+next[x] || 0), 0))) }); };
  const cashDiff = counted.cash === undefined || counted.cash === '' ? null : round2(+counted.cash - expect(d.modes.find((m) => m.mode === 'cash')));
  const close = async () => {
    if (cashDiff == null) return toast('Count the cash in the drawer first', 'err');
    if (cashDiff && !confirm(`Cash is ${cashDiff > 0 ? 'over' : 'short'} by ${inr(Math.abs(cashDiff))}. This will be posted as a cash adjustment. Close the day?`)) return;
    setSaving(true);
    try { await api('/dayclose', { date, counted, note }); toast('Day closed'); setCounted({}); setNotes({}); setNote(''); reload(); } catch (e) { fail(e); } finally { setSaving(false); }
  };
  const c = d.closed;
  return (
    <Page top={<InsightStrip user={user} branch={branch} sections={['money']} limit={2} />} title="Day close" hint="At closing time: count the drawer, check UPI and card against the settlement, then close the day." actions={<>
      <Field label="" type="date" value={date} max={today()} onChange={(e) => { setDate(e.target.value); setCounted({}); setNotes({}); }} />
      <Btn onClick={() => window.print()}>Print Z report</Btn>
    </>}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat k="Sales" v={inr(d.sales.total)} sub={`${d.sales.n} bills`} />
        <Stat k="Returns" v={inr(d.returns.total)} sub={`${d.returns.n} credit notes`} />
        <Stat k="Given on credit" v={inr(d.credit)} sub="to customer accounts" />
        <Stat k="Expenses" v={inr(d.expenses)} />
        <Stat k="Edits / cancels" v={d.edits} sub={d.edits ? <a href="#/reports?r=audit" className="text-brand-d hover:underline">See audit trail</a> : 'none'} />
      </div>
      {c && <div className="card mb-4 flex flex-wrap items-center gap-3 border-l-4 border-l-brand px-4 py-3 text-sm">
        <Badge c="green">Closed</Badge> by <b>{c.closed_by}</b> at {new Date(c.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        · cash {c.diff ? <b className={c.diff < 0 ? 'text-red-600' : 'text-emerald-700'}>{c.diff < 0 ? 'short' : 'over'} {inr(Math.abs(c.diff))}</b> : 'matched'}
        {c.note && <span className="text-black/55">· {c.note}</span>}
        <span className="ml-auto text-xs text-black/45">You can close again if more sales come in.</span>
      </div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-black/8 text-left text-[11px] uppercase tracking-wide text-black/50">
              <th className="px-3 py-2">Account</th><th className="px-3 text-right">Opening</th><th className="px-3 text-right">In</th><th className="px-3 text-right">Out</th>
              <th className="px-3 text-right">Should be</th><th className="w-36 px-3">Counted</th><th className="px-3 text-right">Difference</th>
            </tr></thead>
            <tbody>{d.modes.map((m) => {
              const v = counted[m.mode], diff = v === undefined || v === '' ? null : round2(+v - expect(m));
              return (
                <tr key={m.mode} className="border-b border-black/5">
                  <td className="px-3 py-2 font-medium">{modeName(m.mode, shop)}<div className="text-[11px] font-normal text-black/45">{m.mode === 'cash' ? 'drawer total' : 'today’s settlement'}</div></td>
                  <td className="px-3 text-right tabular-nums text-black/55">{m.mode === 'cash' ? inr(m.opening) : '—'}</td>
                  <td className="px-3 text-right"><Money v={m.money_in} className="text-emerald-700" /></td>
                  <td className="px-3 text-right"><Money v={m.money_out} className="text-red-600" /></td>
                  <td className="px-3 text-right font-semibold"><Money v={expect(m)} /></td>
                  <td className="px-3"><input className="input py-1 text-right" inputMode="decimal" value={v ?? ''} placeholder={m.mode === 'cash' ? 'Count' : 'Optional'}
                    onChange={(e) => setCounted({ ...counted, [m.mode]: e.target.value })} /></td>
                  <td className={cx('px-3 text-right font-semibold tabular-nums', diff < 0 ? 'text-red-600' : diff > 0 ? 'text-emerald-700' : 'text-black/40')}>{diff == null ? '' : diff ? (diff > 0 ? '+' : '') + inr(diff) : '✓'}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <div className="flex flex-wrap items-end gap-3 border-t border-black/8 p-3">
            <Field label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-60 flex-1" placeholder="e.g. ₹50 given for tea" />
            <Btn v="brand" onClick={close} disabled={saving}>{c ? 'Close again' : 'Close the day'}</Btn>
          </div>
        </div>
        <div className="card no-print self-start p-4">
          <h2 className="mb-2 text-sm font-semibold">Count notes</h2>
          {NOTES.map((n) => (
            <div key={n} className="mb-1 flex items-center gap-2 text-sm">
              <span className="w-12 text-right tabular-nums">₹{n}</span><span className="text-black/40">×</span>
              <input className="input w-20 py-1 text-right" inputMode="numeric" value={notes[n] || ''} onChange={(e) => setCount(n, e.target.value.replace(/\D/g, ''))} />
              <span className="ml-auto tabular-nums text-black/55">{notes[n] ? inr(n * notes[n]) : ''}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-semibold"><span>Cash counted</span><Money v={fromNotes} /></div>
        </div>
      </div>
      <p className="mt-3 text-xs text-black/45">Closed by {user.name}. UPI and card totals are for checking against the bank / machine settlement; only the cash difference is posted.</p>
    </Page>
  );
}

const Stat = ({ k, v, sub }) => <div className="card p-3"><div className="text-xs text-black/50">{k}</div><div className="text-lg font-semibold tabular-nums">{v}</div>{sub && <div className="text-xs text-black/45">{sub}</div>}</div>;

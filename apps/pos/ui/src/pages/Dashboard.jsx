import { inr } from '@fitsecret/shared';
import { useApi } from '../api.js';
import { Btn, Page, Money, Loading, Badge, STATUS_C, cx } from '../ui.jsx';

const short = (n) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `₹${Math.round(n)}`);
const PIPE = [['placed', 'New'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['out_for_delivery', 'Out for delivery']];

export default function Dashboard({ user }) {
  const { data: d } = useApi('/reports/dashboard');
  if (!d) return <Loading />;
  const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 864e5).toLocaleDateString('en-CA'));
  const byDay = Object.fromEntries(d.series.map((s) => [s.date, s]));
  const max = Math.max(1, ...d.series.map((s) => s.counter + s.online));
  const hour = new Date().getHours();
  const online30 = d.series.reduce((s, x) => s + x.online, 0), counter30 = d.series.reduce((s, x) => s + x.counter, 0);
  const pipeTotal = PIPE.reduce((s, [k]) => s + (d.orders[k] || 0), 0);
  const isAdmin = user.role === 'admin';

  return (
    <Page title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`} actions={<>
      <Btn onClick={() => (location.hash = '#/bill/purchase')}>+ Purchase</Btn>
      <Btn v="brand" onClick={() => (location.hash = '#/bill/sale')}>+ New sale <kbd className="text-[10px] opacity-60">F1</kbd></Btn>
    </>}>
      {/* Row 1: money */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card !bg-ink p-4 text-white">
          <div className="text-xs text-brand">Today’s sales</div>
          <div className="display mt-1 text-3xl tabular-nums">{inr(d.today.t)}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
            <span>Counter <b className="text-white">{inr(d.today.counter)}</b> · {d.today.counter_n}</span>
            <span>Online <b className="text-brand">{inr(d.today.online)}</b> · {d.today.online_n}</span>
          </div>
          <div className="mt-1 text-xs text-white/45">{d.today.n} bills · avg {inr(d.today.avg)}</div>
        </div>
        <Stat label="This month" v={inr(d.month.t)} sub={<>{d.growth == null ? `${d.month.n} bills` : <span className={d.growth >= 0 ? 'text-brand-d' : 'text-flame'}>{d.growth >= 0 ? '▲' : '▼'} {Math.abs(d.growth)}% vs last month</span>} · online {short(d.month.online)}</>} />
        {isAdmin
          ? <Stat label="Gross profit (month)" v={inr(d.gross_profit_month)} href="#/reports"
              sub={d.missing_cost ? <span className="text-flame">{d.missing_cost} items have no cost price yet, so profit is overstated</span> : <>Net after expenses {inr(d.net_profit_month)}</>} />
          : <Stat label="Purchases (month)" v={inr(d.purchases_month.t)} sub={`${d.purchases_month.n} bills`} />}
        <Stat label="To collect · To pay" v={<><span className="text-flame">{short(d.receivable)}</span> <span className="text-black/25">/</span> {short(d.payable)}</>} sub="Customer dues · supplier dues" href="#/parties" />
      </div>

      {/* Row 2: chart + payments */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold">Sales · last 30 days</span>
            <span className="flex gap-4 text-xs text-black/55">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-ink" />Counter {short(counter30)}</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" />Online {short(online30)}</span>
            </span>
          </div>
          <div className="flex h-48 items-end gap-[3px]">
            {days.map((day) => {
              const s = byDay[day] || { counter: 0, online: 0 };
              return (
                <div key={day} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div className="rounded-t-sm bg-brand" style={{ height: `${(s.online / max) * 100}%` }} />
                  <div className={cx('bg-ink', !s.online && 'rounded-t-sm')} style={{ height: `${Math.max(1.5, (s.counter / max) * 100)}%` }} />
                  {day.endsWith('01') || day === days.at(-1) ? <div className="absolute -bottom-5 left-0 text-[10px] text-black/40">{day.slice(5).replace('-', '/')}</div> : null}
                  <div className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[11px] text-white group-hover:block">
                    {day.slice(5)} · {inr(s.counter + s.online)}<br /><span className="text-white/60">counter {short(s.counter)} · online {short(s.online)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="h-5" />
        </div>
        <div className="card p-5">
          <div className="mb-3 text-sm font-semibold">Money in today</div>
          {!d.payments_today.length ? <p className="text-sm text-black/40">No payments yet today</p> : (
            <ul className="space-y-2.5">
              {d.payments_today.map((p) => (
                <li key={p.mode} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{p.mode} <span className="text-xs text-black/40">· {p.n}</span></span>
                  <Money v={p.net} className="font-semibold" />
                </li>
              ))}
              <li className="flex justify-between border-t border-line pt-2.5 text-sm font-semibold"><span>Total</span><Money v={d.payments_today.reduce((s, p) => s + p.net, 0)} /></li>
            </ul>
          )}
          <div className="mt-5 border-t border-line pt-4 text-sm">
            <div className="text-xs text-black/50">Online orders today</div>
            <div className="display mt-1 text-2xl">{d.orders_today.n} <span className="text-base text-black/45">· {inr(d.orders_today.t)}</span></div>
          </div>
        </div>
      </div>

      {/* Row 3: order pipeline + stock */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <a href="#/orders" className="card p-5 transition-shadow hover:shadow-md lg:col-span-2">
          <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold">Online orders to handle</span><span className="text-black/45">{pipeTotal} open · {d.orders.delivered || 0} delivered · {d.orders.cancelled || 0} cancelled</span></div>
          <div className="grid grid-cols-5 gap-2">
            {PIPE.map(([k, l]) => (
              <div key={k} className={cx('rounded-[10px] p-3', k === 'placed' && d.orders[k] ? 'bg-flame text-white' : 'bg-paper')}>
                <div className="display text-2xl tabular-nums">{d.orders[k] || 0}</div>
                <div className="text-xs opacity-70">{l}</div>
              </div>
            ))}
          </div>
          {d.orders.pending_payment > 0 && <div className="mt-2 text-xs text-black/50">{d.orders.pending_payment} awaiting online payment</div>}
        </a>
        <div className="card p-5">
          <div className="mb-3 text-sm font-semibold">Stock</div>
          {isAdmin && d.stock_value > 0 ? (<>
            <div className="display text-2xl">{inr(d.stock_value)}</div>
            <div className="text-xs text-black/50">at cost · {inr(d.stock_retail)} at selling price · {d.stock_units} units</div>
          </>) : (<>
            <div className="display text-2xl">{isAdmin ? inr(d.stock_retail) : `${d.stock_units} units`}</div>
            <div className="text-xs text-black/50">{isAdmin ? `at selling price · ${d.stock_units} units · cost value shows after purchase entries` : 'in this branch'}</div>
          </>)}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Pill n={d.out_of_stock} l="Out of stock" tone="bg-red-50 text-red-700" />
            <Pill n={d.low_stock} l="Low" tone="bg-amber-50 text-amber-800" />
            <Pill n={d.expiring} l="Expiring 60d" tone="bg-sky-50 text-sky-800" />
          </div>
        </div>
      </div>

      {/* Row 4: lists */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <List title="Top sellers · 30 days" empty="No sales yet" rows={d.top} render={(t, i) => (
          <><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{t.name}</span><span className="text-right"><Money v={t.total} className="font-medium" /><div className="text-[11px] text-black/45">{t.qty} sold</div></span></>
        )} />
        <List title="Top categories · 30 days" empty="No sales yet" rows={d.top_categories} render={(c) => {
          const top = d.top_categories[0]?.total || 1;
          return (<div className="w-full"><div className="flex justify-between gap-2"><span className="truncate">{c.name}</span><Money v={c.total} className="font-medium" /></div>
            <div className="mt-1 h-1.5 rounded-full bg-brand" style={{ width: `${(c.total / top) * 100}%` }} /></div>);
        }} />
        <List title="Biggest dues" empty="Nobody owes you anything" href="#/parties" rows={d.top_dues} render={(p) => (
          <><span className="min-w-0 flex-1 truncate">{p.name} <span className="text-xs text-black/40">{p.phone}</span></span><Money v={p.balance} className="font-medium text-flame" /></>
        )} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex justify-between text-sm"><span className="font-semibold">Recent bills</span><a href="#/invoices" className="text-black/45 hover:text-ink">All invoices →</a></div>
          {!d.recent.length ? <p className="text-sm text-black/40">No bills yet</p> : (
            <table className="w-full text-sm">
              <tbody>
                {d.recent.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2 font-mono text-xs">{r.no}</td>
                    <td className="py-2">{r.party_name}</td>
                    <td className="py-2">{r.online ? <Badge c="lime">Online</Badge> : <Badge>Counter</Badge>}</td>
                    <td className="py-2"><Badge c={STATUS_C[r.status]}>{r.status}</Badge></td>
                    <td className="py-2 text-right"><Money v={r.total} className="font-medium" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <List title="Reorder soon" empty="All stocked up" href="#/reports" rows={d.low_list} render={(i) => (
          <><span className="min-w-0 flex-1 truncate">{i.name}</span><Badge c={i.qty <= 0 ? 'red' : 'amber'}>{i.qty}</Badge></>
        )} />
      </div>

      {d.expiring_list.length > 0 && (
        <div className="card mt-3 p-5">
          <div className="mb-3 text-sm font-semibold">Expiring in 60 days</div>
          <div className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            {d.expiring_list.map((x) => <div key={x.item_id + x.batch_no} className="flex justify-between gap-3"><span className="truncate">{x.name} <span className="text-xs text-black/40">{x.batch_no}</span></span><span className="shrink-0 text-xs">{x.qty} · {x.expiry}</span></div>)}
          </div>
        </div>
      )}
    </Page>
  );
}

const Stat = ({ label, v, sub, href }) => (
  <a href={href} className="card block p-4 transition-shadow hover:shadow-md">
    <div className="text-xs text-black/50">{label}</div>
    <div className="display mt-1 text-3xl tabular-nums">{v}</div>
    <div className="mt-2 text-xs text-black/50">{sub}</div>
  </a>
);
const Pill = ({ n, l, tone }) => (
  <div className={cx('rounded-[10px] px-2 py-2', n ? tone : 'bg-paper text-black/40')}><div className="display text-xl">{n}</div><div className="text-[11px]">{l}</div></div>
);
function List({ title, rows, render, empty, href }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex justify-between text-sm"><span className="font-semibold">{title}</span>{href && <a href={href} className="text-black/45 hover:text-ink">View →</a>}</div>
      {!rows.length ? <p className="text-sm text-black/40">{empty}</p> : <ul className="space-y-2.5">{rows.map((r, i) => <li key={i} className="flex items-center gap-3 text-sm">{render(r, i)}</li>)}</ul>}
    </div>
  );
}

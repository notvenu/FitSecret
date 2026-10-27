// Insights: what the numbers mean and what to do, per subject (shared/insights.js), plus a weekly plan built from them.
// All rules run on this PC: no AI service, no API key, no internet.
// InsightStrip puts the one or two findings that matter on everyday screens; Settings → Insights turns it on and picks subjects.
import { useEffect, useState } from 'react';
import { inr } from '@fitsecret/shared';
import { INSIGHT_SECTIONS, topInsights, weeklyPlan } from '@fitsecret/shared/insights';
import { api, go } from '../api.js';
import { Btn, Table, Money, Loading, SideNav, SidePage, cx } from '../ui.jsx';

// Which screens show each subject's strip (also listed in Settings so the owner knows where to look).
export const INSIGHT_PAGES = {
  sales: ['Home', 'Sale invoices'], stock: ['Home', 'Items'], profit: ['Home', 'Reports', 'Expenses'], customers: ['Home', 'Parties', 'Follow-ups'],
  money: ['Home', 'Parties', 'Payments', 'Day close'], staff: ['Home', 'Staff'], online: ['Home'],
};

// One computation shared by every screen for a minute, so moving around doesn't recompute it each time.
let cache = { at: 0, data: null, wait: null };
function useInsights(enabled = true) {
  const [data, setData] = useState(cache.data);
  const [, bump] = useState(0);
  const load = (force) => {
    if (!force && cache.data && Date.now() - cache.at < 60e3) return setData(cache.data);
    cache.wait ||= api('/reports/x/insights').then((d) => { cache = { at: Date.now(), data: d, wait: null }; return d; }, (e) => { cache.wait = null; throw e; });
    cache.wait.then(setData, () => {});
  };
  useEffect(() => { if (enabled) load(); }, [enabled]);
  return { data, reload: () => { load(true); bump((n) => n + 1); }, at: cache.at };
}
export const forgetInsights = () => { cache = { at: 0, data: null, wait: null }; };

const LV = {
  bad: { box: 'border-red-200 bg-red-50', tag: 'bg-red-600 text-white', label: 'Needs action' },
  warn: { box: 'border-amber-200 bg-amber-50', tag: 'bg-amber-400 text-ink', label: 'Watch' },
  good: { box: 'border-emerald-200 bg-emerald-50', tag: 'bg-emerald-600 text-white', label: 'Going well' },
  info: { box: 'border-line bg-white', tag: 'bg-black/10 text-black/70', label: 'Good to know' },
};
const human = (k) => k.replace(/_pct$/, ' %').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const kpiText = (k) => (k.kind === 'money' ? inr(k.value).replace(/\.00$/, '') : k.kind === 'pct' ? `${k.value}%` : k.kind === 'num' ? Number(k.value).toLocaleString('en-IN') : k.value);

export function InsightCard({ x, open: startOpen = false, compact }) {
  const [open, setOpen] = useState(startOpen);
  const L = LV[x.level], t = x.table;
  return (
    <article className={cx('rounded-[14px] border', L.box, compact ? 'px-4 py-3' : 'p-4 sm:p-5')}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className={cx('mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', L.tag)}>{L.label}</span>
        {x.section && compact && <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-black/40">{INSIGHT_SECTIONS[x.section]}</span>}
        <h3 className={cx('w-full font-semibold', compact ? 'text-sm' : 'text-base')}>{x.title}</h3>
      </div>
      <p className={cx('mt-1 text-black/70', compact ? 'line-clamp-2 text-xs' : 'text-sm')}>{x.detail}</p>
      {(x.action || (t?.rows.length && !compact)) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {x.action && <a href={x.action.href}><Btn size="sm" v="primary">{x.action.label} →</Btn></a>}
          {t?.rows.length > 0 && !compact && <Btn size="sm" v="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide details' : `Show details (${t.rows.length})`}</Btn>}
        </div>
      )}
      {open && t && !compact && (
        <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-line bg-white">
          <Table rows={t.rows.slice(0, 100)} columns={t.columns.map((k) => ({ k, label: human(k), right: typeof t.rows[0]?.[k] === 'number',
            r: (r) => (t.money?.includes(k) ? <Money v={r[k]} /> : typeof r[k] === 'number' ? r[k].toLocaleString('en-IN') : r[k]) }))} />
        </div>
      )}
    </article>
  );
}

// The strip on everyday screens: owner only, when switched on, for the subjects chosen in Settings.
export function InsightStrip({ user, branch, sections, limit = 2 }) {
  const cfg = { enabled: true, sections: Object.keys(INSIGHT_SECTIONS), ...branch?.settings?.insights };
  const want = sections.filter((s) => cfg.sections.includes(s));
  const on = user?.role === 'admin' && cfg.enabled && want.length > 0;
  const { data } = useInsights(on);
  const hideKey = `fs_hide_ins_${want.join('_')}`, day = new Date().toLocaleDateString('en-CA');
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(hideKey) === day; } catch { return false; } });
  if (!on || !data || hidden) return null;
  const top = topInsights(data, want, 12).filter((x) => x.level !== 'info').slice(0, limit);
  if (!top.length) return null;
  return (
    <section className="no-print mb-4" aria-label="Recommendations">
      <div className="mb-1.5 flex items-center gap-3 text-xs">
        <span className="font-semibold text-black/60">Recommended now</span>
        <a href={`#/insights?s=${want.length === 1 ? want[0] : 'overview'}`} className="font-semibold text-brand-d hover:underline">All insights →</a>
        <button className="ml-auto text-black/40 hover:text-ink" onClick={() => { try { localStorage.setItem(hideKey, day); } catch { /* shows again */ } setHidden(true); }}>Hide for today</button>
      </div>
      <div className={cx('grid gap-2', top.length > 1 && 'md:grid-cols-2', top.length > 2 && 'xl:grid-cols-3')}>{top.map((x) => <InsightCard key={x.section + x.id} x={x} compact />)}</div>
    </section>
  );
}

export default function Insights({ route, branch }) {
  const cur = route.query.s === 'overview' || INSIGHT_SECTIONS[route.query.s] ? route.query.s : 'overview';
  const { data, reload, at } = useInsights();
  const chosen = { sections: Object.keys(INSIGHT_SECTIONS), ...branch?.settings?.insights }.sections;
  const count = (s) => data?.[s]?.insights.filter((x) => x.level === 'bad' || x.level === 'warn').length || undefined;
  const nav = <SideNav title="Insights" value={cur} onChange={(k, enter) => { go(`/insights?s=${k}`); if (enter) requestAnimationFrame(() => document.querySelector('[data-ins] button, [data-ins] a')?.focus()); }}
    groups={[{ items: [{ key: 'overview', label: 'Overview', desc: 'This week’s plan and top priorities' }] },
      { label: 'Subjects', items: Object.entries(INSIGHT_SECTIONS).map(([key, label]) => ({ key, label, badge: count(key) })) }]}
    footer={<p className="mt-2 px-3.5 text-xs text-black/45">Worked out from your own bills, stock and payments. Numbers in the badges need attention.</p>} />;
  return (
    <SidePage nav={nav}>
      <div data-ins>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-2xl">{cur === 'overview' ? 'What to do next' : INSIGHT_SECTIONS[cur]}</h2>
            <p className="mt-1 text-sm text-black/55">{at ? `Worked out at ${new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Working it out…'}</p>
          </div>
          <Btn onClick={reload}>↻ Refresh</Btn>
        </div>
        {!data ? <Loading /> : cur === 'overview' ? <Overview data={data} chosen={chosen} /> : <Section s={data[cur]} />}
      </div>
    </SidePage>
  );
}

function Kpis({ kpis }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => <div key={k.label} className="card p-4"><div className="text-xs text-black/50">{k.label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{kpiText(k)}</div>{k.sub && <div className="mt-0.5 text-xs text-black/45">{k.sub}</div>}</div>)}
    </div>
  );
}

function Section({ s }) {
  return <>
    <Kpis kpis={s.kpis} />
    <div className="space-y-3">
      {s.insights.length ? s.insights.map((x, i) => <InsightCard key={x.id} x={x} open={i === 0 && x.level !== 'info'} />) : <div className="card py-12 text-center text-sm text-black/45">Nothing to flag here yet. It fills in as more bills come in.</div>}
    </div>
  </>;
}

const PRIORITY = { high: 'bg-red-600 text-white', medium: 'bg-amber-400 text-ink', low: 'bg-black/10 text-black/70' };
// Ticks are kept on this device for the current week (Monday start), so the list resets itself every week.
const weekKey = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return 'fs_plan_' + d.toLocaleDateString('en-CA'); };
function Overview({ data, chosen }) {
  const top = topInsights(data, chosen, 8);
  const plan = weeklyPlan(data, chosen);
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem(weekKey()) || '{}'); } catch { return {}; } });
  const tick = (id) => { const d = { ...done, [id]: !done[id] }; setDone(d); try { localStorage.setItem(weekKey(), JSON.stringify(d)); } catch { /* not kept */ } };
  const left = plan.filter((a) => !done[a.id]).length;
  return <>
    <section className="card mb-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-lg font-semibold">This week’s plan</h3>
        <span className="text-sm text-black/50">{plan.length ? `${left} of ${plan.length} left` : ''}</span>
      </div>
      <p className="mt-0.5 text-sm text-black/55">The findings ranked by urgency and money at stake ({chosen.map((s) => INSIGHT_SECTIONS[s]).join(', ')}), each with what to do. Tick them off as you go.</p>
      {plan.length ? <ol className="mt-3 space-y-2">
        {plan.map((a, i) => (
          <li key={a.id} className={cx('rounded-xl border border-line p-4', done[a.id] && 'opacity-50')}>
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={!!done[a.id]} onChange={() => tick(a.id)} className="mt-1 h-4 w-4 accent-[var(--color-brand-d)]" aria-label={`Done: ${a.title}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase', PRIORITY[a.priority])}>{a.priority}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-black/40">{INSIGHT_SECTIONS[a.section]}</span>
                  {a.impact >= 1 && <span className="text-[11px] font-semibold text-black/55">≈ {inr(a.impact).replace(/\.00$/, '')} at stake</span>}
                </div>
                <h4 className={cx('mt-1 font-semibold', done[a.id] && 'line-through')}>{i + 1}. {a.title}</h4>
                <p className="mt-0.5 text-sm text-black/65">{a.why}</p>
                {a.steps.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{a.steps.map((st) => <li key={st}>{st}</li>)}</ul>}
                {a.action && <a href={a.action.href} className="mt-2 inline-block"><Btn size="sm" v="primary">{a.action.label} →</Btn></a>}
              </div>
            </div>
          </li>
        ))}
      </ol> : <p className="mt-3 text-sm text-black/45">Nothing to do right now. Well done.</p>}
    </section>
    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50">Top priorities</h3>
    <div className="mb-5 grid gap-3 lg:grid-cols-2">
      {top.length ? top.map((x) => <InsightCard key={x.section + x.id} x={x} compact />) : <div className="card p-6 text-sm text-black/45">Nothing urgent. Well done.</div>}
    </div>
    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50">At a glance</h3>
    <div className="space-y-4">
      {chosen.map((s) => (
        <div key={s}>
          <a href={`#/insights?s=${s}`} className="mb-1.5 inline-block text-sm font-semibold hover:underline">{INSIGHT_SECTIONS[s]} →</a>
          <Kpis kpis={data[s].kpis} />
        </div>
      ))}
    </div>
  </>;
}

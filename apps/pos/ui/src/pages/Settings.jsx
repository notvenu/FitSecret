// Settings, one section at a time. Every setting is a row: what it is and what it does on the left, the control on the right.
// Section = ?s= in the URL so other screens can link straight to one. Keyboard: ↑ ↓ in the section list, Enter to go in, Ctrl+S saves.
import { useEffect, useRef, useState } from 'react';
import { LANGS, lang, setLang } from '../i18n.js';
import { OPTIONAL_DOCS } from './Billing.jsx';
import { STATE_LIST } from '@fitsecret/shared';
import { api, useApi, toast, fail, go } from '../api.js';
import { CLOUD } from '@backend';
import { Btn, Field, Modal, Table, Badge, Kbd, SideNav, SidePage, cx, useForm, useHotkeys } from '../ui.jsx';
import { INSIGHT_SECTIONS } from '@fitsecret/shared/insights';
import { INSIGHT_PAGES } from './Insights.jsx';
import { TYPE_LABEL } from './Invoices.jsx';

// [key, title, one line, words people might search for]
const SECTIONS = [
  ['company', 'Company details', 'Legal name and GSTIN, shared by all its branches', 'company firm business legal name gstin gst pan registered address email'],
  ['store', 'Branch details', 'This branch: name, address, phone, its own GSTIN', 'branch store name address phone gstin gst state code shop outlet'],
  ['billing', 'Billing', 'Stock rules, which documents you use, expiry hints, bill numbers', 'negative stock estimate quotation proforma challan sale order purchase order expiry markdown discount serial imei mfg manufacturing tcs currency dollar prefix number numbering'],
  ['print', 'Bill printing', 'Layout, UPI QR, bank details, terms on the bill', 'print a4 layout upi qr scan pay bank account ifsc terms footer words saved mrp tally modern'],
  ['staff', 'Staff & permissions', 'Discount limit, price changes, editing bills, incentive', 'cashier discount limit rate lock edit bill permission menu short simple incentive salesperson pin login'],
  ['customers', 'Customers', 'Extra customer details, trainer / gym commission', 'custom field birthday date of birth gym trainer goal referral commission loyalty points'],
  ['insights', 'Insights', 'Recommendations on your screens and the weekly plan', 'insight recommendation plan suggestion tips advice analysis ai'],
  ...(CLOUD ? [] : [['sync', 'Cloud sync & backup', 'Website, other counters and backups', 'cloud supabase sync internet online backup restore usb']]),
  ['device', 'This counter', 'Receipt size and menu language on this PC', 'print receipt 58mm 80mm thermal a4 language telugu hindi english drawer cash drawer'],
];

export default function Settings({ boot, reload, route }) {
  const cur = SECTIONS.some(([k]) => k === route?.query.s) ? route.query.s : 'company';
  // Going into a section focuses the setting whose label matches what was typed in the find box ("upi" → the UPI box), else its first field.
  const enter = useRef(null);
  const focusPanel = (q = '') => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean), p = document.querySelector('[data-panel]');
    const hit = words.length && [...p.querySelectorAll('label[for]')].find((l) => words.some((w) => l.textContent.toLowerCase().includes(w)));
    (hit && document.getElementById(hit.htmlFor) || p.querySelector('input, select, textarea, button'))?.focus();
  };
  useEffect(() => { if (enter.current != null) { focusPanel(enter.current); enter.current = null; } }, [cur]);
  const open = (k, into, q) => { if (k === cur) { if (into) focusPanel(q); return; } enter.current = into ? q || '' : null; go(`/settings?s=${k}`); };
  useHotkeys({ 'ctrl+s': () => document.querySelector('[data-panel] form')?.requestSubmit() });
  const b = boot.branch, co = (boot.companies || []).find((c) => c.id === b.company_id), props = { b, co, boot, reload };
  const [copying, setCopying] = useState(false);
  const others = (boot.branches || []).filter((x) => x.id !== b.id && !x.deleted);
  // which settings are whose: company details are shared, the device section is this PC, everything else is this branch
  const scope = { company: co ? `${co.name} · shared by all its branches` : 'Not in a company yet', device: 'This PC only' }[cur] || `${b.name}${co ? ` (${co.name})` : ''} · this branch`;
  return (
    <SidePage nav={<SideNav title="Settings" search="focus" placeholder="Find a setting…  e.g. UPI, discount" value={cur} onChange={open}
      groups={[{ label: 'Business', items: SECTIONS.filter(([k]) => ['company', 'store'].includes(k)).map(([key, label, desc, words]) => ({ key, label, desc, words })) },
        { label: 'How this branch works', items: SECTIONS.filter(([k]) => !['company', 'store', 'device', 'sync'].includes(k)).map(([key, label, desc, words]) => ({ key, label, desc, words })) },
        { label: 'This PC', items: SECTIONS.filter(([k]) => ['device', 'sync'].includes(k)).map(([key, label, desc, words]) => ({ key, label, desc, words })) }]}
      footer={<p className="mt-2 hidden px-3.5 text-xs text-black/45 md:block"><Kbd>↑</Kbd> <Kbd>↓</Kbd> pick · <Kbd>Enter</Kbd> go in · <Kbd>Ctrl+S</Kbd> save</p>} />}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-black/60">Changing: {scope}</span>
        <span className="text-xs text-black/45">Switch company / branch at the top of the screen.</span>
        {others.length > 0 && !['company', 'device', 'sync'].includes(cur) && boot.user?.role === 'admin' &&
          <Btn size="sm" className="ml-auto" onClick={() => setCopying(true)} title="Use this branch's billing, printing, staff, customer and insight settings at other branches">Copy settings to other branches</Btn>}
      </div>
      {copying && <CopySettings b={b} boot={boot} onClose={() => setCopying(false)} onDone={() => { setCopying(false); reload(); }} />}
      <div data-panel key={cur + b.updated_at + (co?.updated_at || '') /* fresh "saved" state after each save */}>
        {cur === 'company' && <Company {...props} />}
        {cur === 'store' && <Store {...props} />}
        {cur === 'billing' && <Billing {...props} />}
        {cur === 'print' && <Printing {...props} />}
        {cur === 'staff' && <Staff {...props} />}
        {cur === 'customers' && <Customers {...props} />}
        {cur === 'insights' && <InsightSettings {...props} />}
        {cur === 'sync' && <Sync />}
        {cur === 'device' && <Device />}
      </div>
    </SidePage>
  );
}

// ---------- building blocks ----------
function Panel({ title, hint, onSubmit, dirty, children }) {
  const body = <>
    <header className="mb-2"><h2 className="text-xl font-semibold">{title}</h2>{hint && <p className="mt-1 text-sm text-black/55">{hint}</p>}</header>
    {children}
  </>;
  if (!onSubmit) return <section className="card p-5 sm:p-6">{body}</section>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); dirty ? onSubmit() : toast('Nothing changed'); }} className="card relative p-5 sm:p-6">
      {body}
      <div className={cx('sticky bottom-0 -mx-5 -mb-5 mt-4 flex items-center justify-end gap-3 rounded-b-[14px] border-t border-line px-5 py-3 sm:-mx-6 sm:-mb-6 sm:px-6', dirty ? 'bg-amber-50' : 'bg-white')}>
        <span className="mr-auto text-xs text-black/55">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <Btn v="primary" type="submit" disabled={!dirty}>Save <Kbd dark>Ctrl+S</Kbd></Btn>
      </div>
    </form>
  );
}
const Group = ({ title, children }) => <div className="mt-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">{title}</h3><div className="divide-y divide-line">{children}</div></div>;
// label + explanation, then the control. `id` ties the words to the control for screen readers and clicking the label.
function Row({ label, hint, id, children }) {
  return (
    <div className="grid gap-2 py-3.5 sm:grid-cols-[1fr_minmax(0,300px)] sm:items-center sm:gap-6">
      <div><label htmlFor={id} className="text-sm font-medium">{label}</label>{hint && <p className="mt-0.5 text-xs text-black/50">{hint}</p>}</div>
      <div className="sm:justify-self-end sm:w-full">{children}</div>
    </div>
  );
}
function Switch({ id, checked, onChange }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={!!checked} onClick={() => onChange(!checked)}
      className={cx('relative ml-auto block h-6 w-11 rounded-full transition-colors', checked ? 'bg-brand-d' : 'bg-black/20')}>
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]', checked ? 'left-[22px]' : 'left-0.5')} />
      <span className="sr-only">{checked ? 'On' : 'Off'}</span>
    </button>
  );
}
// Form state for a section + whether it changed since it was opened.
function useSection(init) {
  const [start] = useState(() => JSON.stringify(init));
  const [f, set, bind, setF] = useForm(init);
  return { f, set, bind, setF, dirty: JSON.stringify(f) !== start };
}
const num = (v) => (v === '' || v == null ? null : +v);
const pctOk = (...vs) => vs.every((v) => v === '' || v == null || (+v >= 0 && +v <= 100));
async function saveSettings(b, patch, invoice, msg, reload) {
  const s = b.settings || {};
  try {
    await api('/t/branches', { id: b.id, settings: { ...s, ...patch, ...(invoice && { invoice: { ...s.invoice, ...invoice } }) } });
    toast(msg); reload();
  } catch (e) { fail(e); }
}

// ---------- sections ----------
const GSTIN_RE = /^\d{2}[A-Z0-9]{13}$/i;
// Branches of the company that have no GSTIN of their own take the company's (bills, GSTR-1 and e-way files then agree).
const fillBranches = (boot, co) => {
  const rows = (boot.branches || []).filter((x) => x.company_id === co.id && !x.gstin && co.gstin).map((x) => ({ id: x.id, gstin: co.gstin, state_code: co.state_code }));
  return rows.length ? api('/t/branches/bulk', { rows }) : null;
};
function Company({ co, boot, reload }) {
  if (!co) return (
    <Panel title="Company details" hint="A company is the business on the bill: its legal name and GSTIN. Its branches and warehouses sit under it.">
      <p className="mt-2 text-sm">This branch is not in a company yet, so bills use the branch details.</p>
      <Btn v="primary" className="mt-3" onClick={() => go('/locations')}>Set up companies →</Btn>
    </Panel>
  );
  const { f, bind, dirty } = useSection({ name: co.name || '', legal_name: co.legal_name || '', gstin: co.gstin || '', state_code: co.state_code || '37', address: co.address || '', phone: co.phone || '', email: co.email || '' });
  const save = async () => {
    const gstin = f.gstin.trim().toUpperCase();
    if (gstin && !GSTIN_RE.test(gstin)) return toast('GSTIN is 15 characters, like 37ABCDE1234F1Z5', 'err');
    try {
      const saved = await api('/t/companies', { id: co.id, ...f, name: f.name.trim(), legal_name: f.legal_name.trim() || f.name.trim(), gstin, state_code: gstin ? gstin.slice(0, 2) : f.state_code });
      await fillBranches(boot, saved);
      toast('Company details saved'); reload();
    } catch (e) { fail(e); }
  };
  const mine = (boot.branches || []).filter((x) => x.company_id === co.id && !x.deleted);
  return (
    <Panel title="Company details" hint={`Printed at the top of the bills of all ${mine.length} branch${mine.length === 1 ? '' : 'es'} of ${co.name}.`} onSubmit={save} dirty={dirty}>
      <Group title="On bills">
        <Row id="c-name" label="Company name" hint="Shown in the app and the company switcher"><input id="c-name" className="input" {...bind('name')} required /></Row>
        <Row id="c-legal" label="Legal name" hint="Printed on bills, e.g. Fit Secrets Nutrition Pvt Ltd"><input id="c-legal" className="input" {...bind('legal_name')} /></Row>
        <Row id="c-addr" label="Registered address" hint="Used when a branch has no address of its own"><textarea id="c-addr" className="input" rows={2} {...bind('address')} /></Row>
        <Row id="c-phone" label="Phone"><input id="c-phone" className="input" {...bind('phone')} inputMode="tel" /></Row>
        <Row id="c-email" label="Email"><input id="c-email" className="input" type="email" {...bind('email')} /></Row>
      </Group>
      <Group title="GST">
        <Row id="c-gst" label="GSTIN" hint="Branches without their own GSTIN use this one (bills and GST files)"><input id="c-gst" className="input uppercase" {...bind('gstin')} placeholder="37ABCDE1234F1Z5" /></Row>
        <Row id="c-state" label="State" hint="Taken from the GSTIN when there is one">
          <select id="c-state" className="input" {...bind('state_code')}>{STATE_LIST.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Row>
      </Group>
      <Group title="Branches & warehouses">
        <Row label={mine.map((x) => x.name).join(', ') || 'None yet'} hint="Add, move or remove them in Companies & Branches"><Btn onClick={() => go('/locations')}>Open →</Btn></Row>
      </Group>
    </Panel>
  );
}

// Copy how one branch works (billing, printing, staff rules, customer fields, insights) to others. Bank accounts,
// bill number prefixes and website settings stay with each branch.
const OWN = ['banks', 'store', 'prefixes'];
function CopySettings({ b, boot, onClose, onDone }) {
  const cos = boot.companies || [], others = (boot.branches || []).filter((x) => x.id !== b.id && !x.deleted);
  const [pick, setPick] = useState(() => new Set(others.filter((x) => b.company_id && x.company_id === b.company_id).map((x) => x.id)));
  const [busy, setBusy] = useState(false);
  const groups = [...cos.map((c) => [c.name, others.filter((x) => x.company_id === c.id)]), ['Not in a company', others.filter((x) => !cos.some((c) => c.id === x.company_id))]].filter(([, l]) => l.length);
  const shared = Object.fromEntries(Object.entries(b.settings || {}).filter(([k]) => !OWN.includes(k)));
  const go_ = async () => {
    setBusy(true);
    try {
      await api('/t/branches/bulk', { rows: others.filter((x) => pick.has(x.id)).map((x) => ({ id: x.id, settings: { ...Object.fromEntries(Object.entries(x.settings || {}).filter(([k]) => OWN.includes(k))), ...shared } })) });
      toast(`Settings copied to ${pick.size} branch${pick.size === 1 ? '' : 'es'}`); onDone();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Copy ${b.name}'s settings`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" disabled={!pick.size || busy} onClick={go_}>Copy to {pick.size}</Btn></>}>
      <p className="mb-3 text-sm text-black/60">Billing, bill printing, staff & permissions, customer fields and insights are copied. Each branch keeps its own bank accounts, bill number prefixes and website settings.</p>
      {groups.map(([g, l]) => (
        <fieldset key={g} className="mb-3"><legend className="mb-1 text-xs font-bold uppercase tracking-wide text-black/50">{g}</legend>
          {l.map((x) => <label key={x.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={pick.has(x.id)}
            onChange={() => setPick((s) => { const n = new Set(s); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n; })} />{x.name}{x.kind === 'warehouse' && <span className="text-xs text-black/45">warehouse</span>}</label>)}
        </fieldset>
      ))}
    </Modal>
  );
}

function Store({ b, co, reload }) {
  const { f, bind, dirty } = useSection({ name: b.name || '', address: b.address || '', phone: b.phone || '', gstin: b.gstin || '', state_code: b.state_code || '37' });
  const save = async () => {
    if (f.gstin && !GSTIN_RE.test(f.gstin.trim())) return toast('GSTIN is 15 characters, like 37ABCDE1234F1Z5', 'err');
    try { await api('/t/branches', { id: b.id, ...f, gstin: f.gstin.trim().toUpperCase() || co?.gstin || '' }); toast('Branch details saved'); reload(); } catch (e) { fail(e); }
  };
  return (
    <Panel title="Branch details" hint={co ? `This branch of ${co.name}. Bills print ${co.legal_name || co.name} with this branch's name and address under it.` : 'Printed at the top of every bill and used for GST.'} onSubmit={save} dirty={dirty}>
      <Group title="Shown on bills">
        <Row id="s-name" label="Branch name"><input id="s-name" className="input" {...bind('name')} required /></Row>
        <Row id="s-addr" label="Address" hint="Include the PIN code: e-way bills read it from here"><textarea id="s-addr" className="input" rows={2} {...bind('address')} /></Row>
        <Row id="s-phone" label="Phone"><input id="s-phone" className="input" {...bind('phone')} inputMode="tel" /></Row>
      </Group>
      <Group title="GST">
        <Row id="s-gst" label="GSTIN" hint={co ? `Only if this branch has its own registration (another state). Empty = ${co.name}'s ${co.gstin || 'GSTIN'}` : 'Needed for GSTR-1 and e-way bill files'}><input id="s-gst" className="input uppercase" {...bind('gstin')} placeholder={co?.gstin || '37ABCDE1234F1Z5'} /></Row>
        <Row id="s-state" label="State" hint="Customers from another state are billed IGST">
          <select id="s-state" className="input" {...bind('state_code')}>{STATE_LIST.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Row>
        <Row label="Branch code on bill numbers" hint="Fixed once bills exist"><div className="input bg-paper text-black/60">{b.code}</div></Row>
      </Group>
    </Panel>
  );
}

const fmtCur = (cs) => (cs || []).map((c) => `${c.code} ${c.rate}`).join(', ');
function Billing({ b, reload }) {
  const s = b.settings || {}, inv = s.invoice || {};
  const { f, set, bind, dirty } = useSection({ block_negative: !!inv.block_negative, markdown_days: inv.markdown_days ?? 60, markdown_pct: inv.markdown_pct ?? 10,
    hidden_docs: inv.hidden_docs || [], serials: !!inv.serials, mfg: !!inv.mfg, tcs: !!inv.tcs, currencies: fmtCur(inv.currencies), prefixes: s.prefixes || {},
    offer_window: s.expiry_offers?.window ?? 90, min_margin: s.expiry_offers?.min_margin ?? 5 });
  const save = () => {
    if (!pctOk(f.markdown_pct, f.min_margin)) return toast('Percentages are 0 to 100', 'err');
    // "USD 83.2, AED 22.6" → [{ code, rate }]
    const currencies = String(f.currencies || '').split(',').map((x) => x.trim().split(/\s+/)).filter(([c]) => c).map(([code, rate]) => ({ code: code.toUpperCase().slice(0, 3), rate: +rate }));
    if (currencies.some((c) => !(c.rate > 0) || c.code.length !== 3)) return toast('Write currencies like: USD 83.2, AED 22.6', 'err');
    const bad = Object.values(f.prefixes).find((p) => p && !/^[A-Za-z0-9-]{1,12}$/.test(p));
    if (bad) return toast(`Prefix "${bad}": letters, numbers and - only`, 'err');
    saveSettings(b, { prefixes: Object.fromEntries(Object.entries(f.prefixes).filter(([, v]) => v).map(([k, v]) => [k, v.toUpperCase()])),
      expiry_offers: { ...s.expiry_offers, window: num(f.offer_window) ?? 90, min_margin: num(f.min_margin) ?? 5 } },
      { block_negative: f.block_negative, markdown_days: num(f.markdown_days), markdown_pct: num(f.markdown_pct), hidden_docs: f.hidden_docs,
        serials: f.serials, mfg: f.mfg, tcs: f.tcs, currencies }, 'Billing settings saved', reload);
  };
  const doc = (d) => !f.hidden_docs.includes(d);
  return (
    <Panel title="Billing" hint="How bills behave at the counter." onSubmit={save} dirty={dirty}>
      <Group title="Stock">
        <Row id="b-neg" label="Stop sales when stock would go below zero" hint="The owner can still sell after a warning; cashiers can't"><Switch id="b-neg" checked={f.block_negative} onChange={(v) => set('block_negative', v)} /></Row>
        <Row id="b-md" label="Warn about batches close to expiry" hint="Days before expiry when billing suggests selling it with a discount">
          <div className="flex items-center gap-2"><input id="b-md" className="input" {...bind('markdown_days')} inputMode="numeric" /><span className="text-sm text-black/50">days</span></div></Row>
        <Row id="b-mp" label="Suggested discount for those batches">
          <div className="flex items-center gap-2"><input id="b-mp" className="input" {...bind('markdown_pct')} inputMode="decimal" /><span className="text-sm text-black/50">%</span></div></Row>
      </Group>
      <Group title="Near-expiry offers">
        <Row id="b-ow" label="Suggest offers from" hint="Days before a batch expires when Online Store → Offers → Near-expiry starts suggesting an offer">
          <div className="flex items-center gap-2"><input id="b-ow" className="input" {...bind('offer_window')} inputMode="numeric" /><span className="text-sm text-black/50">days</span></div></Row>
        <Row id="b-mm" label="Keep at least this margin" hint="Suggested offers never go below cost plus this. Nobody can save an offer below cost">
          <div className="flex items-center gap-2"><input id="b-mm" className="input" {...bind('min_margin')} inputMode="decimal" /><span className="text-sm text-black/50">%</span></div></Row>
      </Group>
      <Group title="Documents you use">
        <p className="pt-2 text-xs text-black/50">Turned-off documents disappear from the menu and the bill screen. Sale bills, returns and purchases are always on.</p>
        {OPTIONAL_DOCS.map((d) => <Row key={d} id={'b-' + d} label={TYPE_LABEL[d]}>
          <Switch id={'b-' + d} checked={doc(d)} onChange={(on) => set('hidden_docs', on ? f.hidden_docs.filter((x) => x !== d) : [...f.hidden_docs, d])} /></Row>)}
      </Group>
      <Group title="Extra columns on bills">
        <Row id="b-ser" label="Serial no. / IMEI" hint="Adds a column to every bill line"><Switch id="b-ser" checked={f.serials} onChange={(v) => set('serials', v)} /></Row>
        <Row id="b-mfg" label="Manufacturing date on purchases" hint="Printed next to expiry"><Switch id="b-mfg" checked={f.mfg} onChange={(v) => set('mfg', v)} /></Row>
        <Row id="b-tcs" label="TCS on bills" hint="Only if your CA says you must collect TCS"><Switch id="b-tcs" checked={f.tcs} onChange={(v) => set('tcs', v)} /></Row>
        <Row id="b-cur" label="Foreign currency totals" hint="Bills stay in ₹; also shows the total in these, e.g. USD 83.2, AED 22.6"><input id="b-cur" className="input" {...bind('currencies')} placeholder="Leave empty if not needed" /></Row>
      </Group>
      <details className="mt-4 rounded-xl border border-line px-4 py-2">
        <summary className="cursor-pointer py-1 text-sm font-semibold">Bill number prefixes <span className="font-normal text-black/50">(advanced)</span></summary>
        <p className="text-xs text-black/50">Empty = {b.code}-XX. Numbers restart every financial year: PREFIX/26-27/0001</p>
        <div className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-2">
          {Object.entries(TYPE_LABEL).map(([t, l]) => <Field key={t} label={l} value={f.prefixes[t] || ''} onChange={(e) => set('prefixes', { ...f.prefixes, [t]: e.target.value })} />)}
        </div>
      </details>
    </Panel>
  );
}

// Defaults for what's printed on bills. Stored in branches.settings.invoice (Print.jsx reads them).
export const INVOICE_DEFAULTS = { words: true, saved: true, upi: '', bank: '', terms: '100% authentic products · Goods once sold can be exchanged within 7 days with bill (sealed packs only)', footer: 'Thank you! Stay fit 💪', block_negative: false, theme: 'classic' };
const THEMES = [['classic', 'Classic'], ['tally', 'Tally (boxed grid)'], ['modern', 'Modern (brand header)']];
function Printing({ b, reload }) {
  const inv = { ...INVOICE_DEFAULTS, ...b.settings?.invoice };
  const { f, set, bind, dirty } = useSection({ theme: inv.theme, upi: inv.upi || '', bank: inv.bank || '', terms: inv.terms || '', footer: inv.footer || '', words: !!inv.words, saved: !!inv.saved });
  const save = () => {
    if (f.upi && !/^[\w.-]+@[\w.-]+$/.test(f.upi.trim())) return toast('UPI ID looks wrong (like shopname@okhdfcbank)', 'err');
    saveSettings(b, {}, { ...f, upi: f.upi.trim() }, 'Print settings saved', reload);
  };
  return (
    <Panel title="Bill printing" hint="What appears on printed and shared bills. Receipt size is set per counter in “This counter”." onSubmit={save} dirty={dirty}>
      <Group title="Getting paid">
        <Row id="p-upi" label="UPI ID" hint="Prints a scan-to-pay QR for the exact amount due"><input id="p-upi" className="input" {...bind('upi')} placeholder="fitsecret@okhdfcbank" /></Row>
        <Row id="p-bank" label="Bank details" hint="On A4 bills, for customers who pay by transfer"><textarea id="p-bank" className="input" rows={2} {...bind('bank')} placeholder="Bank, A/c no, IFSC" /></Row>
      </Group>
      <Group title="Text on the bill">
        <Row id="p-terms" label="Terms & conditions"><textarea id="p-terms" className="input" rows={2} {...bind('terms')} /></Row>
        <Row id="p-foot" label="Thank-you line" hint="Last line of every receipt"><input id="p-foot" className="input" {...bind('footer')} /></Row>
        <Row id="p-words" label="Amount in words" hint="“Rupees Four Hundred Twenty Only”"><Switch id="p-words" checked={f.words} onChange={(v) => set('words', v)} /></Row>
        <Row id="p-saved" label="“You saved ₹…” against MRP" hint="Customers love seeing it"><Switch id="p-saved" checked={f.saved} onChange={(v) => set('saved', v)} /></Row>
      </Group>
      <Group title="A4 layout">
        <Row id="p-theme" label="Style of A4 bills"><select id="p-theme" className="input" {...bind('theme')}>{THEMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>
      </Group>
    </Panel>
  );
}

function Staff({ b, boot, reload }) {
  const s = b.settings || {};
  const { f, set, bind, dirty } = useSection({ max_discount: s.perms?.max_discount ?? '', price_edit: s.perms?.price_edit || (s.perms?.lock_rate ? 'never' : 'approval'), cashier_edit: !!s.perms?.cashier_edit,
    simple_cashier: !!s.simple_cashier, incentive_pct: s.invoice?.incentive_pct ?? '' });
  const save = () => {
    if (!pctOk(f.max_discount, f.incentive_pct)) return toast('Percentages are 0 to 100', 'err');
    saveSettings(b, { simple_cashier: f.simple_cashier, perms: { max_discount: num(f.max_discount), price_edit: f.price_edit, lock_rate: undefined, cashier_edit: f.cashier_edit } },
      { incentive_pct: num(f.incentive_pct) }, 'Staff settings saved', reload);
  };
  return <>
    <Panel title="Staff & permissions" hint="Limits apply to cashiers only. The owner can always do everything." onSubmit={save} dirty={dirty}>
      <Group title="What cashiers can do">
        <Row id="st-max" label="Biggest discount a cashier can give" hint="Line and bill discounts together. Empty = no limit">
          <div className="flex items-center gap-2"><input id="st-max" className="input" {...bind('max_discount')} inputMode="decimal" placeholder="No limit" /><span className="text-sm text-black/50">%</span></div></Row>
        <Row id="st-rate" label="Cashier lowers a price on the bill" hint="Raising a price is always fine, never above MRP. Every lowered price is kept in Reports → Audit Trail">
          <select id="st-rate" className="input" {...bind('price_edit')}><option value="approval">Needs the owner’s PIN</option><option value="free">Allowed</option><option value="never">Not allowed</option></select></Row>
        <Row id="st-edit" label="Let cashiers edit saved bills" hint="Every edit is recorded in Reports → Audit Trail"><Switch id="st-edit" checked={f.cashier_edit} onChange={(v) => set('cashier_edit', v)} /></Row>
        <Row id="st-simple" label="Short menu for cashiers" hint="Only Home, Sale, Returns, Items, Parties, Follow-ups and Day close"><Switch id="st-simple" checked={f.simple_cashier} onChange={(v) => set('simple_cashier', v)} /></Row>
      </Group>
      <Group title="Incentive">
        <Row id="st-inc" label="Staff incentive" hint="% of each salesperson's sales (before GST). See Reports → Sales by Staff">
          <div className="flex items-center gap-2"><input id="st-inc" className="input" {...bind('incentive_pct')} inputMode="decimal" placeholder="0" /><span className="text-sm text-black/50">%</span></div></Row>
      </Group>
    </Panel>
    {!CLOUD && <p className="card mt-4 p-4 text-sm">Logins, PINs and what each person may do: <a href="#/staff?tab=logins" className="font-semibold text-brand-d hover:underline">Staff → Logins &amp; PINs →</a></p>}
  </>;
}

function Customers({ b, reload }) {
  const s = b.settings || {};
  const { f, set, bind, dirty } = useSection({ fields: [...(s.party_fields || []), '', '', '', ''].slice(0, 4), referral_pct: s.invoice?.referral_pct ?? '' });
  const save = () => {
    if (!pctOk(f.referral_pct)) return toast('Percentages are 0 to 100', 'err');
    saveSettings(b, { party_fields: f.fields.map((x) => x.trim()).filter(Boolean) }, { referral_pct: num(f.referral_pct) }, 'Customer settings saved', reload);
  };
  return (
    <Panel title="Customers" hint="Loyalty points are set up in Parties → Loyalty Points." onSubmit={save} dirty={dirty}>
      <Group title="Extra details on each customer">
        <p className="pt-2 text-xs text-black/50">Up to four of your own fields, shown on the customer form and printed on their bills.</p>
        {f.fields.map((x, i) => <Row key={i} id={'c-f' + i} label={`Field ${i + 1}`}>
          <input id={'c-f' + i} className="input" value={x} placeholder={['Date of birth', 'Gym', 'Trainer', 'Goal'][i]} onChange={(e) => set('fields', f.fields.map((y, j) => (j === i ? e.target.value : y)))} /></Row>)}
      </Group>
      <Group title="Trainers & gyms">
        <Row id="c-ref" label="Referral commission" hint="% of sales (before GST) on bills with “Referred by”. See Reports → Referral Commission">
          <div className="flex items-center gap-2"><input id="c-ref" className="input" {...bind('referral_pct')} inputMode="decimal" placeholder="0" /><span className="text-sm text-black/50">%</span></div></Row>
      </Group>
    </Panel>
  );
}

function Sync() {
  const s = useApi('/sync');
  const [f, , bind] = useForm({ url: '', anonKey: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api('/sync/config', { ...f, url: f.url || s.data.url, email: f.email || s.data.email });
      r.state === 'online' ? toast('Connected and synced ✓') : toast(r.error || 'Saved; will retry', r.error ? 'err' : 'ok');
      s.reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const backup = async () => {
    const r = await fetch(import.meta.env.BASE_URL + 'api/backup', { headers: { 'x-token': localStorage.getItem('fs_token') } });
    if (!r.ok) return fail(new Error('Backup failed'));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: `fitsecret-backup-${new Date().toISOString().slice(0, 10)}.db` });
    a.click();
  };
  const st = s.data;
  return <>
    <Panel title="Cloud sync" hint="Billing always works without internet. Changes wait on this PC and upload by themselves when it's back." onSubmit={save} dirty={!!(f.url || f.anonKey || f.email || f.password)}>
      {st && (
        <div className="my-3 flex flex-wrap items-center gap-2 rounded-xl bg-paper px-4 py-3 text-sm">
          <Badge c={{ online: 'green', offline: 'amber', error: 'red', syncing: 'blue' }[st.state] || 'grey'}>{st.state}</Badge>
          <span className="text-black/55">{st.pending} waiting · last sync {st.lastSync ? new Date(st.lastSync).toLocaleTimeString('en-IN') : 'never'}</span>
          {st.error && <span className="w-full text-xs text-red-600">{st.error}</span>}
          {st.configured && <Btn size="sm" className="ml-auto" disabled={busy} onClick={() => { setBusy(true); api('/sync/now', {}).then(s.reload, fail).finally(() => setBusy(false)); }}>Sync now</Btn>}
        </div>
      )}
      <Group title="Connection (from Supabase → Project settings → API)">
        <Row id="y-url" label="Project URL"><input id="y-url" className="input" {...bind('url')} placeholder={st?.url || 'https://xxxx.supabase.co'} /></Row>
        <Row id="y-key" label="Anon (public) key"><input id="y-key" className="input" {...bind('anonKey')} placeholder={st?.configured ? '•••• saved' : ''} /></Row>
        <Row id="y-mail" label="Staff sync email"><input id="y-mail" className="input" {...bind('email')} placeholder={st?.email} /></Row>
        <Row id="y-pw" label="Password"><input id="y-pw" className="input" {...bind('password', 'password')} placeholder={st?.configured ? '•••• saved' : ''} /></Row>
      </Group>
    </Panel>
    <Lan />
    <Panel title="Backups" hint="A copy is saved every 6 hours (the last 30 are kept) in apps/pos/data/backups.">
      <Row label="Download a backup now" hint="Keep one on a USB drive or Google Drive every week"><Btn onClick={backup} className="ml-auto block">Download backup</Btn></Row>
    </Panel>
  </>;
}

// Off (the default): only this PC opens the POS. On: phones / other PCs on the shop Wi-Fi can too (plain http, so trusted Wi-Fi only).
function Lan() {
  const s = useApi('/lan');
  if (!s.data) return null;
  const flip = () => api('/lan', { on: !s.data.on }).then((r) => { s.reload(); toast(r.on ? 'Allowed. Restart the POS to apply' : 'Only this PC after the next restart'); }, fail);
  return (
    <Panel title="Other devices on the shop network" hint="Off: only this PC can open the POS. On: other PCs or phones on the shop Wi-Fi can open it at this PC's address. Turn it on only on the shop's own Wi-Fi, never a guest one.">
      <Row id="lan" label="Allow other devices" hint={`${s.data.listening === '0.0.0.0' ? 'Open to the network now' : 'Only this PC now'}. Changes apply after the POS restarts.`}>
        <Switch id="lan" checked={s.data.on} onChange={flip} /></Row>
    </Panel>
  );
}

function Device() {
  const [fmt, setFmt] = useState(() => localStorage.getItem('fs_print') || 'thermal');
  return (
    <Panel title="This counter" hint="These only change this PC; other counters keep their own. Saved as soon as you pick.">
      <Group title="Printing">
        <Row id="d-fmt" label="What F9 prints" hint="Match the paper in your printer">
          <select id="d-fmt" className="input" value={fmt} onChange={(e) => { setFmt(e.target.value); localStorage.setItem('fs_print', e.target.value); toast('Saved for this counter'); }}>
            <option value="thermal">Thermal receipt, 80 mm</option><option value="thermal58">Thermal receipt, 58 mm</option><option value="a4">A4 tax invoice</option>
          </select></Row>
        <Row label="Cash drawer" hint="Most receipt printers open the drawer when they print. Turn on “Open cash drawer” in the printer's Windows settings (Printing preferences → Peripherals)."><span /></Row>
      </Group>
      <Group title="Language">
        <Row id="d-lang" label="Menu language" hint="Menus and main buttons. Bills and reports stay in English">
          <select id="d-lang" className="input" value={lang()} onChange={(e) => { setLang(e.target.value); location.reload(); }}>
            {Object.entries(LANGS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></Row>
      </Group>
    </Panel>
  );
}

// Insights: on/off, and which subjects get recommendation cards on the everyday screens and in the weekly plan.
function InsightSettings({ b, reload }) {
  const cfg = { enabled: true, sections: Object.keys(INSIGHT_SECTIONS), ...b.settings?.insights };
  const { f, set, dirty } = useSection({ enabled: !!cfg.enabled, sections: cfg.sections });
  const save = () => saveSettings(b, { insights: { enabled: f.enabled, sections: f.sections } }, null, 'Insight settings saved', reload);
  return <>
    <Panel title="Insights" hint="Insights read your own sales, stock and money and say what to do next. The full list is always in Insights (menu); here you choose what also shows on other screens." onSubmit={save} dirty={dirty}>
      <Group title="On your screens">
        <Row id="in-on" label="Show recommendations on other screens" hint="A short card at the top of Home, Items, Parties and the others, with the one or two things that matter now. Owner logins only"><Switch id="in-on" checked={f.enabled} onChange={(v) => set('enabled', v)} /></Row>
      </Group>
      <Group title="Which subjects">
        <p className="pt-2 text-xs text-black/50">Turned-off subjects stay in the Insights page but don’t appear on the everyday screens or in the weekly plan.</p>
        {Object.entries(INSIGHT_SECTIONS).map(([k, l]) => <Row key={k} id={'in-' + k} label={l} hint={`Shows on: ${INSIGHT_PAGES[k].join(', ')}`}>
          <Switch id={'in-' + k} checked={f.sections.includes(k)} onChange={(on) => set('sections', on ? [...f.sections, k] : f.sections.filter((x) => x !== k))} /></Row>)}
      </Group>
      <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-xs text-black/55">Everything here is worked out on your own PC from your own data, with fixed, readable rules. No AI service, no API key, no internet and no cost; the same figures always give the same advice.</p>
    </Panel>
  </>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { calcInvoice, inr, today, round2, addDays } from '@fitsecret/shared';
import { api, useApi, toast, fail } from '../api.js';
import { Btn, Field, Money, cx, useHotkeys, Badge } from '../ui.jsx';
import { PartyForm } from './Parties.jsx';
import ScanBill from './ScanBill.jsx';

const TYPES = {
  sale: { title: 'Sale', partyType: 'customer', cash: true },
  purchase: { title: 'Purchase', partyType: 'supplier' },
  sale_return: { title: 'Sale Return / Credit Note', partyType: 'customer', cash: true },
  purchase_return: { title: 'Purchase Return / Debit Note', partyType: 'supplier' },
  estimate: { title: 'Estimate / Quotation', partyType: 'customer', cash: true, noPay: true },
  proforma: { title: 'Proforma Invoice', partyType: 'customer', cash: true, noPay: true },
  sale_order: { title: 'Sale Order', partyType: 'customer', cash: true, noPay: true },
  delivery_challan: { title: 'Delivery Challan', partyType: 'customer', cash: true, noPay: true },
  purchase_order: { title: 'Purchase Order', partyType: 'supplier', noPay: true },
};
export const BILL_TYPES = TYPES;
const MODES = ['cash', 'upi', 'card', 'bank'];

export default function Billing({ type = 'sale', branch, route, user, pos, active = true }) {
  if (!TYPES[type]) type = 'sale';
  const T = TYPES[type];
  const isPurchase = type.startsWith('purchase');
  const fromId = route?.query.from;
  const srcId = fromId || route?.query.copy; // ?copy= : "Repeat bill" starts a new bill from an old one
  const cfg = branch?.settings?.invoice || {};
  const currencies = cfg.currencies || [];
  const items = useApi('/items');
  const parties = useApi('/parties');
  const [party, setParty] = useState(null);
  const [lines, setLines] = useState([]);
  const [meta, setMeta] = useState({ date: today(), no: '', notes: '', inclusive: !isPurchase, due_date: '', ship_to: null, tcs_rate: '', currency: 'INR' });
  const [pays, setPays] = useState([{ mode: 'cash', amount: '' }]); // split payment: one row per mode
  const [saving, setSaving] = useState(false);
  const [newParty, setNewParty] = useState(false);
  const [scan, setScan] = useState(() => isPurchase && !!route?.query.scan); // ?scan=1 from Utilities → Import Items
  const [showProfit, setShowProfit] = useState(false);
  const [rates, setRates] = useState({}); // party-wise item rates: item_id -> last rate billed to this party
  const [points, setPoints] = useState(null); // { balance, value } for the selected customer
  const loyalty = branch?.settings?.loyalty;
  const search = useRef();
  useEffect(() => { if (active) search.current?.focus(); }, [active]);

  // Party-wise rates and loyalty points follow the selected party; lines the cashier hasn't typed a rate into re-price.
  useEffect(() => {
    setPoints(null);
    if (!party?.id) return setRates({});
    api('/reports/x/party_rates?party_id=' + party.id).then((r) => {
      const m = Object.fromEntries(r.map((x) => [x.item_id, x.rate]));
      setRates(m);
      setLines((ls) => ls.map((l) => (l.manual ? l : reprice({ ...l, baseRate: m[l.item_id] ?? l.listRate, partyRate: m[l.item_id] }))));
    }, () => {});
    if (loyalty?.enabled && !isPurchase) api('/reports/x/loyalty').then((r) => setPoints(r.find((x) => x.party_id === party.id) || { balance: 0, value: 0 }), () => {});
  }, [party?.id]);

  // Converting an order / estimate / challan, or repeating any bill: start from its party and lines.
  useEffect(() => {
    if (!srcId || !items.data || !parties.data) return;
    api('/invoices/' + srcId).then((src) => {
      setParty(parties.data.find((p) => p.id === src.party_id) || null);
      setLines(src.lines.map((l) => {
        const it = items.data.find((i) => i.id === l.item_id) || {};
        return { key: Math.random(), item_id: l.item_id, name: l.name, stock: it.stock ?? 0, qty: l.qty, rate: l.rate, discount_pct: l.discount_pct, gst_rate: l.gst_rate, mrp: l.mrp,
          batch_no: fromId ? l.batch_no || '' : '', expiry: fromId ? l.expiry || '' : '', mfg: fromId ? l.mfg || '' : '', serial: '', manual: !fromId };
      }));
      setMeta((m) => ({ ...m, inclusive: src.tax_inclusive, notes: '' }));
      toast(fromId ? `Loaded ${src.no}` : `Repeating ${src.no}: check quantities and save`);
    }, fail);
  }, [srcId, !items.data, !parties.data]);

  // Draft from a scanned supplier bill (ScanBill reviews it first).
  const loadDraft = (d) => {
    if (d.party) setParty(d.party);
    setLines((ls) => [...ls, ...d.lines.map((l) => ({ key: Math.random(), stock: 0, discount_pct: 0, batch_no: '', expiry: '', ...l }))]);
    setMeta((m) => ({ ...m, no: d.no || m.no, date: d.date || m.date, inclusive: d.inclusive }));
    setScan(false);
    items.reload(); parties.reload();
  };

  const interState = !!(party?.state_code && branch?.state_code && party.state_code !== branch.state_code);
  const calc = useMemo(() => calcInvoice(lines.map((l) => ({ ...l, qty: +l.qty || 0, rate: +l.rate || 0, discount_pct: +l.discount_pct || 0 })),
    { inclusive: meta.inclusive, interState }), [lines, meta.inclusive, interState]);
  const tcs = cfg.tcs ? round2((calc.total * (+meta.tcs_rate || 0)) / 100) : 0;
  const grand = round2(calc.total + tcs); // what the party pays (TCS on top)
  const fx = currencies.find((c) => c.code === meta.currency);
  const dueDefault = party?.payment_terms > 0 ? addDays(meta.date, party.payment_terms) : '';
  // A blank amount means "the rest of the bill", so a single row still defaults to full payment.
  const fixed = round2(pays.reduce((s, p) => s + (p.amount === '' ? 0 : +p.amount || 0), 0));
  const rest = Math.max(0, round2(grand - fixed));
  const blank = pays.findIndex((p) => p.amount === '');
  const payments = pays.map((p, i) => ({ mode: p.mode, amount: p.amount === '' ? (i === blank ? rest : 0) : +p.amount || 0 })).filter((p) => p.amount > 0);
  const received = round2(payments.reduce((s, p) => s + p.amount, 0));
  const setPay = (i, patch) => setPays((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPay = () => setPays((ps) => [...ps, { mode: MODES.find((m) => !ps.some((p) => p.mode === m)) || 'cash', amount: '' }]);

  // Wholesale price kicks in at the item's minimum quantity (Vyapar "multiple pricing"); otherwise party rate, else list price.
  const reprice = (l) => (l.manual || isPurchase ? l
    : { ...l, rate: l.wholesale > 0 && l.wmin > 0 && +l.qty >= l.wmin ? l.wholesale : l.baseRate ?? l.rate });
  const add = (it) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item_id === it.id && !isPurchase);
      if (i >= 0) return ls.map((l, j) => (j === i ? reprice({ ...l, qty: +l.qty + 1 }) : l));
      const listRate = isPurchase ? it.purchase_price || 0 : it.sale_price;
      return [...ls, reprice({ key: Math.random(), item_id: it.id, name: it.name, stock: it.stock, qty: 1, listRate, baseRate: rates[it.id] ?? listRate, partyRate: rates[it.id],
        wholesale: it.wholesale_price, wmin: it.wholesale_min_qty, cost: it.purchase_price || 0, discount_pct: 0, gst_rate: it.gst_rate, mrp: it.mrp, batch_no: '', expiry: '' })];
    });
  };
  const upd = (key, k, v) => setLines((ls) => ls.map((l) => (l.key !== key ? l : k === 'rate' ? { ...l, rate: v, manual: true } : k === 'qty' ? reprice({ ...l, qty: v }) : { ...l, [k]: v })));
  const profit = round2(calc.taxable - lines.reduce((s, l) => s + (+l.qty || 0) * (l.cost ?? items.data?.find((i) => i.id === l.item_id)?.purchase_price ?? 0), 0));
  const redeem = () => {
    const amt = Math.min(points.value, grand);
    if (!(amt > 0)) return toast('No points to redeem', 'err');
    setPays((ps) => [{ mode: 'points', amount: String(amt) }, ...ps.filter((p) => p.mode !== 'points')]);
  };
  const reset = () => { setLines([]); setParty(null); setPays([{ mode: 'cash', amount: '' }]); setShowProfit(false); setMeta((m) => ({ ...m, no: '', notes: '', due_date: '', ship_to: null })); search.current?.focus(); };

  const save = async (print) => {
    if (!lines.length) return toast('Add items first', 'err');
    if (type === 'sale' && branch?.settings?.invoice?.block_negative) { // Settings → Stop sale on negative stock
      const want = new Map();
      for (const l of lines) want.set(l.item_id, (want.get(l.item_id) || 0) + (+l.qty || 0));
      const short = lines.find((l) => want.get(l.item_id) > l.stock);
      if (short) return toast(`${short.name}: only ${short.stock} in stock`, 'err');
    }
    const due = T.noPay ? 0 : round2(grand - received);
    if (type === 'sale' && party?.credit_limit > 0 && due > 0 && party.balance + due > party.credit_limit
      && !confirm(`${party.name}'s credit limit is ${inr(party.credit_limit)}. This bill takes their balance to ${inr(party.balance + due)}. Save anyway?`)) return;
    setSaving(true);
    try {
      const inv = await api('/invoices', {
        type, party_id: party?.id, date: meta.date, no: meta.no || undefined, notes: meta.notes, tax_inclusive: meta.inclusive, from_id: fromId,
        due_date: meta.due_date || undefined, ship_to: meta.ship_to ?? undefined, tcs_rate: cfg.tcs ? +meta.tcs_rate || 0 : 0,
        currency: fx ? fx.code : undefined, fx_rate: fx?.rate,
        lines: lines.map(({ item_id, qty, rate, discount_pct, gst_rate, batch_no, expiry, mfg, serial }) => ({ item_id, qty: +qty, rate: +rate, discount_pct: +discount_pct, gst_rate: +gst_rate, batch_no, expiry, mfg, serial })),
        payments: T.noPay ? [] : payments,
      });
      toast(`${T.title} ${inv.no} saved · ${inr(inv.total)}`);
      if (print) window.open(`#/print/${inv.id}/${localStorage.getItem('fs_print') || 'thermal'}`, '_blank', 'width=420,height=700');
      reset();
      items.reload(); parties.reload();
      if (fromId) location.hash = `#/invoices?type=${type}`;
    } catch (e) { fail(e); } finally { setSaving(false); }
  };
  useHotkeys(active ? { F9: () => save(true), 'ctrl+enter': () => save(false), F2: () => search.current?.focus() } : {});

  const partyList = (parties.data || []).filter((p) => p.type === T.partyType || !p.type);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col p-5">
        {!pos && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {Object.entries(TYPES).filter(([k]) => k.startsWith('purchase') === isPurchase).map(([k, t]) => (
              <a key={k} href={`#/bill/${k}`} className={cx('rounded-full px-3 py-1 text-xs font-medium transition-colors', k === type ? 'bg-ink text-white' : 'bg-black/5 text-black/60 hover:bg-black/10')}>{t.title.split(' /')[0]}</a>
            ))}
            {fromId && <Badge c="blue">Converting an order</Badge>}
            {route?.query.copy && <Badge c="blue">Repeat bill</Badge>}
            {type === 'purchase' && <Btn v="primary" size="sm" className="ml-auto" onClick={() => setScan(true)}>Scan supplier bill</Btn>}
          </div>
        )}
        <ItemSearch items={items.data || []} onPick={add} inputRef={search} purchase={isPurchase} />
        <div className="card mt-3 flex-1 overflow-auto">
          {!lines.length ? (
            <div className="grid h-full min-h-60 place-items-center text-center text-sm text-black/40">
              <div>Scan a barcode or search an item<div className="mt-1 text-xs">F2 search · F9 save &amp; print · Ctrl+Enter save</div></div>
            </div>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-black/8 text-left text-[11px] uppercase tracking-wide text-black/50">
                  <th className="px-3 py-2">Item</th>
                  {isPurchase && <><th className="w-24 px-1">Batch</th><th className="w-36 px-1">Expiry</th>{cfg.mfg && <th className="w-36 px-1">Mfg</th>}</>}
                  {cfg.serials && <th className="w-32 px-1">Serial / IMEI</th>}
                  <th className="w-28 px-1">Qty</th><th className="w-24 px-1">Rate</th><th className="w-16 px-1">Disc%</th><th className="w-16 px-1">GST%</th>
                  <th className="w-28 px-3 text-right">Amount</th><th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {calc.lines.map((l, i) => {
                  const src = lines[i];
                  const short = !isPurchase && type === 'sale' && +src.qty > src.stock;
                  return (
                    <tr key={src.key} className="rise border-b border-black/5">
                      <td className="px-3 py-1.5">
                        <div className="truncate font-medium leading-tight" title={l.name}>{l.name}</div>
                        <div className={cx('text-[11px]', short ? 'text-red-600' : 'text-black/45')}>Stock {src.stock}{short && ' · will go negative'} · MRP {inr(src.mrp)}
                          {src.partyRate != null && <span className="text-brand-d"> · {party?.name}'s rate {inr(src.partyRate)}</span>}
                          {!isPurchase && src.wholesale > 0 && src.wmin > 0 && <span className={+src.qty >= src.wmin ? 'font-semibold text-emerald-700' : ''}> · Wholesale {inr(src.wholesale)} from {src.wmin}</span>}
                        </div>
                      </td>
                      {isPurchase && <>
                        <td className="px-1"><input className="input py-1" value={src.batch_no} onChange={(e) => upd(src.key, 'batch_no', e.target.value)} placeholder="Batch" /></td>
                        <td className="px-1"><input className="input py-1" type="date" value={src.expiry} onChange={(e) => upd(src.key, 'expiry', e.target.value)} /></td>
                        {cfg.mfg && <td className="px-1"><input className="input py-1" type="date" value={src.mfg || ''} onChange={(e) => upd(src.key, 'mfg', e.target.value)} /></td>}
                      </>}
                      {cfg.serials && <td className="px-1"><input className="input py-1" value={src.serial || ''} onChange={(e) => upd(src.key, 'serial', e.target.value)} placeholder="Scan / type" /></td>}
                      <td className="px-1">
                        <div className="flex items-center">
                          <button className="px-1.5 text-black/40 hover:text-ink" onClick={() => upd(src.key, 'qty', Math.max(1, +src.qty - 1))} aria-label="Decrease">−</button>
                          <input className="input px-1 py-1 text-center" value={src.qty} onChange={(e) => upd(src.key, 'qty', e.target.value)} inputMode="decimal" />
                          <button className="px-1.5 text-black/40 hover:text-ink" onClick={() => upd(src.key, 'qty', +src.qty + 1)} aria-label="Increase">+</button>
                        </div>
                      </td>
                      <td className="px-1"><input className="input py-1 text-right" value={src.rate} onChange={(e) => upd(src.key, 'rate', e.target.value)} inputMode="decimal" /></td>
                      <td className="px-1"><input className="input py-1 text-right" value={src.discount_pct} onChange={(e) => upd(src.key, 'discount_pct', e.target.value)} inputMode="decimal" /></td>
                      <td className="px-1"><input className="input py-1 text-right" value={src.gst_rate} onChange={(e) => upd(src.key, 'gst_rate', e.target.value)} inputMode="decimal" /></td>
                      <td className="px-3 text-right font-medium tabular-nums">{inr(l.total)}</td>
                      <td><button onClick={() => setLines((ls) => ls.filter((x) => x.key !== src.key))} className="px-2 text-black/30 hover:text-red-600" aria-label="Remove">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-l border-black/8 bg-white p-5 lg:w-[330px] xl:w-[360px]">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-black/60">{T.partyType === 'supplier' ? 'Supplier' : 'Customer'}</span>
            <button className="text-xs font-medium text-brand-d hover:underline" onClick={() => setNewParty(true)}>+ New</button>
          </div>
          <PartyPick list={partyList} value={party} onChange={setParty} cash={T.cash} />
          {party && <div className="mt-1 text-[11px] text-black/50">{party.phone} {party.gstin && `· GSTIN ${party.gstin}`} · Balance {inr(party.balance)}
            {party.credit_limit > 0 && <span className={party.balance >= party.credit_limit ? 'font-semibold text-red-600' : ''}> · Limit {inr(party.credit_limit)}</span>}{interState && ' · Inter-state (IGST)'}</div>}
          {points?.balance > 0 && !T.noPay && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-brand/15 px-3 py-1.5 text-xs">
              <span><b>{points.balance}</b> loyalty points · worth {inr(points.value)}</span>
              {!pays.some((p) => p.mode === 'points') && <button onClick={redeem} className="font-semibold text-brand-d hover:underline">Redeem</button>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date" type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
          {type === 'purchase' ? <Field label="Supplier bill no." value={meta.no} onChange={(e) => setMeta({ ...meta, no: e.target.value })} />
            : <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={meta.inclusive} onChange={(e) => setMeta({ ...meta, inclusive: e.target.checked })} /> Prices incl. GST</label>}
          {type === 'purchase' && <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={meta.inclusive} onChange={(e) => setMeta({ ...meta, inclusive: e.target.checked })} /> Rates include GST</label>}
          {party && !T.noPay && <Field label="Due date" type="date" value={meta.due_date || dueDefault} onChange={(e) => setMeta({ ...meta, due_date: e.target.value })}
            hint={party.payment_terms > 0 ? `${party.payment_terms}-day terms` : undefined} />}
          {cfg.tcs && <Field label="TCS %" value={meta.tcs_rate} onChange={(e) => setMeta({ ...meta, tcs_rate: e.target.value })} inputMode="decimal" placeholder="0.1" />}
          {currencies.length > 0 && !isPurchase && <Field label="Currency"><select className="input" value={meta.currency} onChange={(e) => setMeta({ ...meta, currency: e.target.value })}>
            <option value="INR">INR ₹</option>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code} @ ₹{c.rate}</option>)}</select></Field>}
          {party && T.partyType === 'customer' && (meta.ship_to != null || party.shipping_address) && <Field label="Ship to" className="col-span-2">
            <textarea className="input" rows={2} value={meta.ship_to ?? party.shipping_address ?? ''} onChange={(e) => setMeta({ ...meta, ship_to: e.target.value })} /></Field>}
        </div>

        <dl className="space-y-1.5 border-t border-dashed border-black/15 pt-3 text-sm">
          <Row k="Items" v={`${lines.length} · qty ${round2(lines.reduce((s, l) => s + (+l.qty || 0), 0))}`} />
          {calc.discount > 0 && <Row k="Discount" v={'−' + inr(calc.discount)} />}
          <Row k="Taxable" v={inr(calc.taxable)} />
          {interState ? <Row k="IGST" v={inr(calc.igst)} /> : <><Row k="CGST" v={inr(calc.cgst)} /><Row k="SGST" v={inr(calc.sgst)} /></>}
          <Row k="Round off" v={inr(calc.round_off)} />
          {tcs > 0 && <Row k={`TCS ${meta.tcs_rate}%`} v={inr(tcs)} />}
          {user?.role === 'admin' && !isPurchase && lines.length > 0 && (showProfit
            ? <>
              <Row k="Profit (excl. GST)" v={<span className={profit < 0 ? 'text-red-600' : 'text-emerald-700'}>{inr(profit)}</span>} />
              {lines.some((l) => !((l.cost ?? items.data?.find((i) => i.id === l.item_id)?.purchase_price) > 0)) && <div className="text-[11px] text-amber-700">Some items have no purchase cost yet, so profit is overstated</div>}
            </>
            : <button onClick={() => setShowProfit(true)} className="text-xs font-semibold text-brand-d hover:underline">Check profit</button>)}
        </dl>
        <div className="flex items-baseline justify-between rounded-[14px] bg-ink px-4 py-3 text-white">
          <span className="text-sm text-white/60">Total</span>
          <span className="display text-4xl tabular-nums">{inr(grand)}</span>
        </div>
        {fx && <div className="-mt-2 text-right text-xs text-black/55">≈ {fx.code} {(grand / fx.rate).toFixed(2)} at ₹{fx.rate}</div>}

        {!T.noPay && (
          <div>
            {pays.map((p, i) => (
              <div key={i} className={cx(i > 0 && 'mt-3 border-t border-line pt-3')}>
                <div className="mb-2 flex gap-1.5">
                  {p.mode === 'points' ? <span className="flex-1 rounded-full bg-brand/30 py-1.5 text-center text-xs font-semibold uppercase">Loyalty points</span> : MODES.map((m) => (
                    <button key={m} onClick={() => setPay(i, { mode: m })} className={cx('flex-1 rounded-full border py-1.5 text-xs font-semibold uppercase', p.mode === m ? 'border-ink bg-ink text-white' : 'border-black/15 hover:border-ink')}>{m}</button>
                  ))}
                  {pays.length > 1 && <button onClick={() => setPays((ps) => ps.filter((_, j) => j !== i))} className="rounded-full px-2 text-black/40 hover:bg-black/5 hover:text-ink" aria-label="Remove payment">✕</button>}
                </div>
                <Field label={`${type.endsWith('return') || isPurchase ? 'Amount paid' : 'Amount received'}${pays.length > 1 ? ` · ${p.mode.toUpperCase()}` : ''}`} value={p.amount}
                  placeholder={String(i === blank ? rest : 0)} inputMode="decimal" onChange={(e) => setPay(i, { amount: e.target.value })} />
              </div>
            ))}
            {pays.length < MODES.length && <button onClick={addPay} className="mt-2 text-xs font-semibold text-brand-d underline underline-offset-4 hover:text-ink">+ Split payment (another mode)</button>}
            <div className="mt-1 text-xs">
              {received > grand ? <span className="font-medium text-emerald-700">Return change {inr(received - grand)}</span>
                : received < grand ? <span className="font-medium text-amber-700">Balance due {inr(grand - received)} {party ? `→ ${party.name}'s account` : '— select a customer'}</span> : null}
            </div>
          </div>
        )}
        <Field label="Notes"><textarea className="input" rows={2} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></Field>
        <div className="mt-auto grid grid-cols-2 gap-2">
          <Btn onClick={() => save(false)} disabled={saving}>Save <kbd className="text-[10px] opacity-50">Ctrl↵</kbd></Btn>
          <Btn v="brand" onClick={() => save(true)} disabled={saving}>Save &amp; Print <kbd className="text-[10px] opacity-60">F9</kbd></Btn>
        </div>
      </aside>
      {scan && <ScanBill items={items.data || []} parties={parties.data || []} branch={branch} onClose={() => setScan(false)} onDone={loadDraft} />}
      {newParty && <PartyForm type={T.partyType} fields={branch?.settings?.party_fields} onClose={() => setNewParty(false)} onSaved={(p) => { setNewParty(false); parties.reload(); setParty({ ...p, balance: 0 }); }} />}
    </div>
  );
}

const Row = ({ k, v }) => <div className="flex justify-between"><dt className="text-black/55">{k}</dt><dd className="tabular-nums">{v}</dd></div>;

function ItemSearch({ items, onPick, inputRef, purchase }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const res = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const words = s.split(/\s+/);
    return items.filter((i) => words.every((w) => `${i.name} ${i.sku} ${i.barcode} ${i.brand}`.toLowerCase().includes(w))).slice(0, 12);
  }, [q, items]);
  useEffect(() => setHi(0), [q]);
  const pick = (it) => { onPick(it); setQ(''); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, res.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Escape') setQ('');
    if (e.key === 'Enter') {
      const exact = items.find((i) => i.barcode && i.barcode === q.trim()) || items.find((i) => i.sku?.toLowerCase() === q.trim().toLowerCase());
      const it = exact || res[hi];
      if (it) pick(it); else if (q) toast('No item matches ' + q, 'err');
    }
  };
  return (
    <div className="relative">
      <input ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
        placeholder="Scan barcode or search item, brand, SKU…" className="input py-3 pl-10 text-base" aria-label="Search items" />
      <svg className="absolute left-3 top-3.5 h-5 w-5 text-black/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      {res.length > 0 && (
        <ul className="rise absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-[14px] border border-black/10 bg-white py-1 shadow-xl">
          {res.map((i, k) => (
            <li key={i.id} onMouseDown={(e) => { e.preventDefault(); pick(i); }} onMouseEnter={() => setHi(k)}
              className={cx('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', k === hi && 'bg-brand/25')}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.name}</div>
                <div className="text-[11px] text-black/45">{i.sku} · {i.barcode}{i.location && <b className="text-ink"> · Rack {i.location}</b>}</div>
              </div>
              <Badge c={i.stock <= 0 ? 'red' : i.stock <= (i.low_stock || 0) ? 'amber' : 'green'}>{i.stock} in stock</Badge>
              <Money v={purchase ? i.purchase_price : i.sale_price} className="w-20 text-right font-medium" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PartyPick({ list, value, onChange, cash }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const res = list.filter((p) => `${p.name} ${p.phone || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <div className="relative">
      <input className="input" value={open ? q : value?.name || (cash ? 'Cash Sale (walk-in)' : '')} placeholder="Search name or phone"
        onFocus={() => { setOpen(true); setQ(''); }} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={(e) => setQ(e.target.value)} />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-[14px] border border-black/10 bg-white py-1 shadow-xl">
          {cash && <li className="cursor-pointer px-3 py-2 text-sm hover:bg-brand/25" onMouseDown={() => onChange(null)}>Cash Sale (walk-in)</li>}
          {res.map((p) => (
            <li key={p.id} className="flex cursor-pointer justify-between px-3 py-2 text-sm hover:bg-brand/25" onMouseDown={() => onChange(p)}>
              <span>{p.name} <span className="text-black/45">{p.phone}</span></span>
              <Money v={p.balance} className={cx('text-xs', p.balance > 0 ? 'text-amber-700' : 'text-black/40')} />
            </li>
          ))}
          {!res.length && <li className="px-3 py-2 text-sm text-black/40">No match — use “+ New”</li>}
        </ul>
      )}
    </div>
  );
}


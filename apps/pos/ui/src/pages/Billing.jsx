import { useEffect, useMemo, useRef, useState } from 'react';
import { calcInvoice, inr, today, round2 } from '@fitsecret/shared';
import { api, useApi, toast, fail } from '../api.js';
import { Btn, Field, Money, cx, useHotkeys, Badge } from '../ui.jsx';
import { PartyForm } from './Parties.jsx';

const TYPES = {
  sale: { title: 'Sale', partyType: 'customer', cash: true },
  purchase: { title: 'Purchase', partyType: 'supplier' },
  sale_return: { title: 'Sale Return / Credit Note', partyType: 'customer', cash: true },
  purchase_return: { title: 'Purchase Return / Debit Note', partyType: 'supplier' },
  estimate: { title: 'Estimate / Quotation', partyType: 'customer', cash: true, noPay: true },
};
const MODES = ['cash', 'upi', 'card', 'bank'];

export default function Billing({ type = 'sale', branch }) {
  const T = TYPES[type] || TYPES.sale;
  const isPurchase = type.startsWith('purchase');
  const items = useApi('/items');
  const parties = useApi('/parties');
  const [party, setParty] = useState(null);
  const [lines, setLines] = useState([]);
  const [meta, setMeta] = useState({ date: today(), no: '', notes: '', inclusive: !isPurchase });
  const [pay, setPay] = useState({ mode: 'cash', amount: '' });
  const [saving, setSaving] = useState(false);
  const [newParty, setNewParty] = useState(false);
  const search = useRef();

  const interState = !!(party?.state_code && branch?.state_code && party.state_code !== branch.state_code);
  const calc = useMemo(() => calcInvoice(lines.map((l) => ({ ...l, qty: +l.qty || 0, rate: +l.rate || 0, discount_pct: +l.discount_pct || 0 })),
    { inclusive: meta.inclusive, interState }), [lines, meta.inclusive, interState]);
  const received = pay.amount === '' ? calc.total : +pay.amount;

  const add = (it) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item_id === it.id && !isPurchase);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: +l.qty + 1 } : l));
      return [...ls, { key: Math.random(), item_id: it.id, name: it.name, stock: it.stock, qty: 1, rate: isPurchase ? it.purchase_price || 0 : it.sale_price,
        discount_pct: 0, gst_rate: it.gst_rate, mrp: it.mrp, batch_no: '', expiry: '' }];
    });
  };
  const upd = (key, k, v) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  const reset = () => { setLines([]); setParty(null); setPay({ mode: 'cash', amount: '' }); setMeta((m) => ({ ...m, no: '', notes: '' })); search.current?.focus(); };

  const save = async (print) => {
    if (!lines.length) return toast('Add items first', 'err');
    setSaving(true);
    try {
      const inv = await api('/invoices', {
        type, party_id: party?.id, date: meta.date, no: meta.no || undefined, notes: meta.notes, tax_inclusive: meta.inclusive,
        lines: lines.map(({ item_id, qty, rate, discount_pct, gst_rate, batch_no, expiry }) => ({ item_id, qty: +qty, rate: +rate, discount_pct: +discount_pct, gst_rate: +gst_rate, batch_no, expiry })),
        payments: T.noPay ? [] : [{ mode: pay.mode, amount: received }],
      });
      toast(`${T.title} ${inv.no} saved · ${inr(inv.total)}`);
      if (print) window.open(`#/print/${inv.id}/${localStorage.getItem('fs_print') || 'thermal'}`, '_blank', 'width=420,height=700');
      reset();
      items.reload(); parties.reload();
    } catch (e) { fail(e); } finally { setSaving(false); }
  };
  useHotkeys({ F9: () => save(true), 'ctrl+Enter': () => save(false), F2: () => search.current?.focus() });

  const partyList = (parties.data || []).filter((p) => p.type === T.partyType || !p.type);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {Object.entries(TYPES).map(([k, t]) => (
            <a key={k} href={`#/bill/${k}`} className={cx('rounded-full px-3 py-1 text-xs font-medium transition-colors', k === type ? 'bg-ink text-white' : 'bg-black/5 text-black/60 hover:bg-black/10')}>{t.title.split(' /')[0]}</a>
          ))}
        </div>
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
                  {isPurchase && <><th className="w-24 px-1">Batch</th><th className="w-36 px-1">Expiry</th></>}
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
                        <div className={cx('text-[11px]', short ? 'text-red-600' : 'text-black/45')}>Stock {src.stock}{short && ' · will go negative'} · MRP {inr(src.mrp)}</div>
                      </td>
                      {isPurchase && <>
                        <td className="px-1"><input className="input py-1" value={src.batch_no} onChange={(e) => upd(src.key, 'batch_no', e.target.value)} placeholder="Batch" /></td>
                        <td className="px-1"><input className="input py-1" type="date" value={src.expiry} onChange={(e) => upd(src.key, 'expiry', e.target.value)} /></td>
                      </>}
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
          {party && <div className="mt-1 text-[11px] text-black/50">{party.phone} {party.gstin && `· GSTIN ${party.gstin}`} · Balance {inr(party.balance)}{interState && ' · Inter-state (IGST)'}</div>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date" type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
          {type === 'purchase' ? <Field label="Supplier bill no." value={meta.no} onChange={(e) => setMeta({ ...meta, no: e.target.value })} />
            : <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={meta.inclusive} onChange={(e) => setMeta({ ...meta, inclusive: e.target.checked })} /> Prices incl. GST</label>}
          {type === 'purchase' && <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={meta.inclusive} onChange={(e) => setMeta({ ...meta, inclusive: e.target.checked })} /> Rates include GST</label>}
        </div>

        <dl className="space-y-1.5 border-t border-dashed border-black/15 pt-3 text-sm">
          <Row k="Items" v={`${lines.length} · qty ${round2(lines.reduce((s, l) => s + (+l.qty || 0), 0))}`} />
          {calc.discount > 0 && <Row k="Discount" v={'−' + inr(calc.discount)} />}
          <Row k="Taxable" v={inr(calc.taxable)} />
          {interState ? <Row k="IGST" v={inr(calc.igst)} /> : <><Row k="CGST" v={inr(calc.cgst)} /><Row k="SGST" v={inr(calc.sgst)} /></>}
          <Row k="Round off" v={inr(calc.round_off)} />
        </dl>
        <div className="flex items-baseline justify-between rounded-[14px] bg-ink px-4 py-3 text-white">
          <span className="text-sm text-white/60">Total</span>
          <span className="display text-4xl tabular-nums">{inr(calc.total)}</span>
        </div>

        {!T.noPay && (
          <div>
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {MODES.map((m) => (
                <button key={m} onClick={() => setPay({ ...pay, mode: m })} className={cx('rounded-full border py-1.5 text-xs font-semibold uppercase', pay.mode === m ? 'border-ink bg-ink text-white' : 'border-black/15 hover:border-ink')}>{m}</button>
              ))}
            </div>
            <Field label={type.endsWith('return') || isPurchase ? 'Amount paid' : 'Amount received'} value={pay.amount} placeholder={String(calc.total)} inputMode="decimal"
              onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            <div className="mt-1 text-xs">
              {received > calc.total ? <span className="font-medium text-emerald-700">Return change {inr(received - calc.total)}</span>
                : received < calc.total ? <span className="font-medium text-amber-700">Balance due {inr(calc.total - received)} {party ? `→ ${party.name}'s account` : '— select a customer'}</span> : null}
            </div>
          </div>
        )}
        <Field label="Notes"><textarea className="input" rows={2} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></Field>
        <div className="mt-auto grid grid-cols-2 gap-2">
          <Btn onClick={() => save(false)} disabled={saving}>Save <kbd className="text-[10px] opacity-50">Ctrl↵</kbd></Btn>
          <Btn v="brand" onClick={() => save(true)} disabled={saving}>Save &amp; Print <kbd className="text-[10px] opacity-60">F9</kbd></Btn>
        </div>
      </aside>
      {newParty && <PartyForm type={T.partyType} onClose={() => setNewParty(false)} onSaved={(p) => { setNewParty(false); parties.reload(); setParty({ ...p, balance: 0 }); }} />}
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
                <div className="text-[11px] text-black/45">{i.sku} · {i.barcode}</div>
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


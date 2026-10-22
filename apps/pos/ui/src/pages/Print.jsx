import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { inr, inWords, round2, STATES } from '@fitsecret/shared';
import { api } from '../api.js';
import { INVOICE_DEFAULTS } from './Settings.jsx';
import { cx } from '../ui.jsx';

const TITLE = { sale: 'TAX INVOICE', sale_return: 'CREDIT NOTE', purchase: 'PURCHASE BILL', purchase_return: 'DEBIT NOTE', estimate: 'ESTIMATE',
  proforma: 'PROFORMA INVOICE', sale_order: 'SALE ORDER', delivery_challan: 'DELIVERY CHALLAN', purchase_order: 'PURCHASE ORDER' };

// Rendered in its own window; prints immediately. A4 layout follows Settings → A4 invoice layout (classic | tally | modern).
export default function Print({ id, fmt = 'thermal', branch }) {
  const [inv, setInv] = useState(null);
  const cfg = { ...INVOICE_DEFAULTS, ...branch?.settings?.invoice };
  // QR is made before setInv so it is on the page when print() fires
  useEffect(() => { api('/invoices/' + id).then(async (i) => {
    const due = round2(i.total - i.paid);
    if (cfg.upi && due > 0 && ['sale', 'proforma', 'sale_order'].includes(i.type)) i.qr = await QRCode.toDataURL(
      `upi://pay?pa=${encodeURIComponent(cfg.upi)}&pn=${encodeURIComponent(branch?.name || '')}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(i.no)}`, { margin: 1, width: 240 }).catch(() => null);
    setInv(i);
  }); }, [id]);
  useEffect(() => { if (inv) setTimeout(() => window.print(), 150); }, [inv]);
  if (!inv) return null;
  const thermal = fmt === 'thermal';
  const theme = thermal ? 'thermal' : cfg.theme || 'classic';
  const grid = theme === 'tally'; // every cell boxed, like Tally's invoice
  const mrpSaved = round2(inv.lines.reduce((s, l) => s + (l.mrp > 0 ? l.mrp * l.qty : l.total), 0) - (inv.total - (inv.tcs || 0)));
  const saved = Math.max(inv.discount || 0, mrpSaved);
  const due = round2(inv.total - inv.paid);
  const money = ['sale', 'purchase', 'sale_return', 'purchase_return'].includes(inv.type); // orders / estimates / challans carry no payment
  const taxRows = Object.values(inv.lines.reduce((a, l) => {
    const r = (a[l.gst_rate] ??= { rate: l.gst_rate, taxable: 0, tax: 0 });
    r.taxable += l.taxable; r.tax += l.tax; return a;
  }, {}));
  const extras = Object.entries(inv.party_extra || {}).filter(([, v]) => v);
  const lineNote = (l) => [l.batch_no && `Batch ${l.batch_no}`, l.mfg && `Mfg ${l.mfg}`, l.expiry && `Exp ${l.expiry}`, l.serial && `S/N ${l.serial}`].filter(Boolean).join(' · ');
  const cell = grid ? 'border border-black px-1.5 py-1' : 'px-1 py-0.5';

  return (
    <div className={thermal ? 'mx-auto min-h-screen w-[72mm] bg-white p-1 font-mono text-[11px] leading-snug text-black' : 'mx-auto min-h-screen max-w-[190mm] bg-white p-6 text-[12px] text-black'}
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      <style>{thermal ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A4; margin: 10mm; }'}</style>
      {theme === 'modern' ? (
        <div className="mb-3 flex items-end justify-between rounded-[10px] bg-ink px-5 py-4 text-white">
          <div>
            <div className="display text-3xl">{branch?.name}</div>
            <div className="text-white/75">{branch?.address}</div>
            <div className="text-white/75">{branch?.phone && `Ph: ${branch.phone}`} {branch?.gstin && `· GSTIN: ${branch.gstin}`}</div>
          </div>
          <div className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-ink">{TITLE[inv.type]}</div>
        </div>
      ) : (
        <div className={cx('text-center', grid && 'border border-black p-2')}>
          <div className={thermal ? 'text-sm font-bold' : 'text-2xl font-bold'}>{branch?.name}</div>
          <div>{branch?.address}</div>
          <div>{branch?.phone && `Ph: ${branch.phone}`} {branch?.gstin && `· GSTIN: ${branch.gstin}`}</div>
          <div className="mt-1 font-bold">{TITLE[inv.type]}</div>
        </div>
      )}
      <div className={cx('my-2 flex justify-between gap-4 py-1', grid ? 'border border-black px-2' : 'border-y border-dashed border-black', !thermal && 'text-[13px]')}>
        <div>
          <div>No: <b>{inv.no}</b></div>
          <div>Date: {inv.date}</div>
          {inv.due_date && money && due > 0 && <div>Due: <b>{inv.due_date}</b></div>}
        </div>
        <div className="text-right">
          {!thermal && <div className="text-[10px] uppercase text-black/60">Bill to</div>}
          <div className="font-medium">{inv.party_name}</div>
          {inv.party_phone && <div>{inv.party_phone}</div>}
          {inv.party_gstin && <div>GSTIN {inv.party_gstin}</div>}
          {!thermal && inv.party_state && <div>Place of supply: {STATES[inv.party_state]}</div>}
          {extras.map(([k, v]) => <div key={k}>{k}: {v}</div>)}
        </div>
        {!thermal && inv.ship_to && <div className="max-w-[45%] text-right"><div className="text-[10px] uppercase text-black/60">Ship to</div><div className="whitespace-pre-line">{inv.ship_to}</div></div>}
      </div>
      {thermal && inv.ship_to && <div className="mb-1">Ship to: {inv.ship_to}</div>}
      {thermal ? (
        <div>
          {inv.lines.map((l) => (
            <div key={l.id} className="border-b border-dotted border-black/40 py-0.5">
              <div>{l.name}</div>
              {lineNote(l) && <div className="text-[10px]">{lineNote(l)}</div>}
              <div className="flex justify-between"><span>{l.qty} × {l.rate.toFixed(2)}{l.discount_pct ? ` −${l.discount_pct}%` : ''} · GST {l.gst_rate}%</span><span>{l.total.toFixed(2)}</span></div>
            </div>
          ))}
        </div>
      ) : (
        <table className={cx('w-full', grid && 'border-collapse')}>
          <thead>
            <tr className={cx('text-left', theme === 'modern' ? 'bg-brand/40' : !grid && 'border-b border-black')}>
              {['#', 'Item', 'HSN', 'Qty', 'Rate', 'Disc', 'GST', 'Amount'].map((h, i) => <th key={h} className={cx(cell, i >= 3 && 'text-right')}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={l.id} className={cx('align-top', theme === 'modern' && 'border-b border-black/10')}>
                <td className={cell}>{i + 1}</td>
                <td className={cell}>{l.name}{lineNote(l) && <div className="text-[10px] text-black/60">{lineNote(l)}</div>}</td><td className={cell}>{l.hsn}</td>
                <td className={cx(cell, 'text-right')}>{l.qty}</td><td className={cx(cell, 'text-right')}>{l.rate.toFixed(2)}</td><td className={cx(cell, 'text-right')}>{l.discount_pct ? l.discount_pct + '%' : ''}</td>
                <td className={cx(cell, 'text-right')}>{l.gst_rate}%</td><td className={cx(cell, 'text-right')}>{l.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className={cx('mt-1 pt-1', grid ? 'ml-auto w-1/2 border border-black px-2' : 'border-t border-dashed border-black')}>
        {cfg.saved && saved >= 1 && inv.type === 'sale' && <Line k="You saved" v={inr(saved)} />}
        <Line k="Taxable value" v={inr(inv.taxable)} />
        {inv.igst ? <Line k="IGST" v={inr(inv.igst)} /> : <><Line k="CGST" v={inr(inv.cgst)} /><Line k="SGST" v={inr(inv.sgst)} /></>}
        <Line k="Round off" v={inr(inv.round_off)} />
        {inv.tcs > 0 && <Line k="TCS" v={inr(inv.tcs)} />}
        <div className={cx('flex justify-between border-y border-black py-0.5 font-bold', thermal ? 'text-sm' : 'text-base', theme === 'modern' && 'bg-brand/40 px-1')}><span>TOTAL</span><span>{inr(inv.total)}</span></div>
        {inv.currency && <Line k={`Total in ${inv.currency} (₹${inv.fx_rate})`} v={`${inv.currency} ${(inv.total / inv.fx_rate).toFixed(2)}`} />}
        {money && <Line k={`Paid (${inv.payments.map((p) => (inv.payments.length > 1 ? `${p.mode} ${inr(p.amount)}` : p.mode)).join(', ') || '—'})`} v={inr(inv.paid)} />}
        {due > 0 && money && <Line k="Balance due" v={inr(due)} />}
      </div>
      {!thermal && (
        <table className="mt-3 w-1/2 border border-black text-[11px]">
          <thead><tr className="border-b border-black"><th>GST %</th><th className="text-right">Taxable</th><th className="text-right">Tax</th></tr></thead>
          <tbody>{taxRows.map((r) => <tr key={r.rate}><td className="text-center">{r.rate}%</td><td className="text-right">{r.taxable.toFixed(2)}</td><td className="text-right">{r.tax.toFixed(2)}</td></tr>)}</tbody>
        </table>
      )}
      {cfg.words && <p className="mt-1 text-[10px] italic">{inWords(inv.total)}</p>}
      {inv.notes && <p className="mt-2">{inv.notes}</p>}
      <div className={thermal ? 'mt-2' : 'mt-3 flex items-start justify-between gap-6'}>
        {!thermal && cfg.bank && <div className="whitespace-pre-line text-[11px]"><b>Bank details</b><br />{cfg.bank}</div>}
        {inv.qr && <div className="mx-auto text-center text-[10px]"><img src={inv.qr} alt="UPI QR" className={thermal ? 'mx-auto w-32' : 'w-28'} />Scan to pay {inr(due)} · {cfg.upi}</div>}
      </div>
      <div className="mt-3 text-center">
        {cfg.footer && <div>{cfg.footer}</div>}
        {cfg.terms && <div className="whitespace-pre-line text-[10px]">{cfg.terms}</div>}
        {!thermal && <div className="mt-10 text-right">For {branch?.name}<br /><br />Authorised Signatory</div>}
      </div>
    </div>
  );
}
const Line = ({ k, v }) => <div className="flex justify-between"><span>{k}</span><span>{v}</span></div>;

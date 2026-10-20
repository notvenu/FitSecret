import { useEffect, useState } from 'react';
import { inr, STATES } from '@fitsecret/shared';
import { api } from '../api.js';

const TITLE = { sale: 'TAX INVOICE', sale_return: 'CREDIT NOTE', purchase: 'PURCHASE BILL', purchase_return: 'DEBIT NOTE', estimate: 'ESTIMATE' };

// Rendered in its own window; prints immediately.
export default function Print({ id, fmt = 'thermal', branch }) {
  const [inv, setInv] = useState(null);
  useEffect(() => { api('/invoices/' + id).then(setInv); }, [id]);
  useEffect(() => { if (inv) setTimeout(() => window.print(), 150); }, [inv]);
  if (!inv) return null;
  const thermal = fmt === 'thermal';
  const taxRows = Object.values(inv.lines.reduce((a, l) => {
    const r = (a[l.gst_rate] ??= { rate: l.gst_rate, taxable: 0, tax: 0 });
    r.taxable += l.taxable; r.tax += l.tax; return a;
  }, {}));

  return (
    <div className={thermal ? 'mx-auto min-h-screen w-[72mm] bg-white p-1 font-mono text-[11px] leading-snug text-black' : 'mx-auto min-h-screen max-w-[190mm] bg-white p-6 text-[12px] text-black'}>
      <style>{thermal ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A4; margin: 10mm; }'}</style>
      <div className="text-center">
        <div className={thermal ? 'text-sm font-bold' : 'text-2xl font-bold'}>{branch?.name}</div>
        <div>{branch?.address}</div>
        <div>{branch?.phone && `Ph: ${branch.phone}`} {branch?.gstin && `· GSTIN: ${branch.gstin}`}</div>
        <div className="mt-1 font-bold">{TITLE[inv.type]}</div>
      </div>
      <div className={'my-2 flex justify-between border-y border-dashed border-black py-1' + (thermal ? '' : ' text-[13px]')}>
        <div>
          <div>No: <b>{inv.no}</b></div>
          <div>Date: {inv.date}</div>
        </div>
        <div className="text-right">
          <div>{inv.party_name}</div>
          {inv.party_phone && <div>{inv.party_phone}</div>}
          {inv.party_gstin && <div>GSTIN {inv.party_gstin}</div>}
          {!thermal && inv.party_state && <div>Place of supply: {STATES[inv.party_state]}</div>}
        </div>
      </div>
      {thermal ? (
        <div>
          {inv.lines.map((l) => (
            <div key={l.id} className="border-b border-dotted border-black/40 py-0.5">
              <div>{l.name}</div>
              <div className="flex justify-between"><span>{l.qty} × {l.rate.toFixed(2)}{l.discount_pct ? ` −${l.discount_pct}%` : ''} · GST {l.gst_rate}%</span><span>{l.total.toFixed(2)}</span></div>
            </div>
          ))}
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-black text-left [&>th]:px-1">
              <th>Item</th><th>HSN</th><th>Batch/Exp</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Disc</th><th className="text-right">GST</th><th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="align-top [&>td]:px-1 [&>td]:py-0.5">
                <td>{l.name}</td><td>{l.hsn}</td><td>{l.batch_no} {l.expiry}</td>
                <td className="text-right">{l.qty}</td><td className="text-right">{l.rate.toFixed(2)}</td><td className="text-right">{l.discount_pct ? l.discount_pct + '%' : ''}</td>
                <td className="text-right">{l.gst_rate}%</td><td className="text-right">{l.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-1 border-t border-dashed border-black pt-1">
        {inv.discount > 0 && <Line k="You saved" v={inr(inv.discount)} />}
        <Line k="Taxable value" v={inr(inv.taxable)} />
        {inv.igst ? <Line k="IGST" v={inr(inv.igst)} /> : <><Line k="CGST" v={inr(inv.cgst)} /><Line k="SGST" v={inr(inv.sgst)} /></>}
        <Line k="Round off" v={inr(inv.round_off)} />
        <div className={'flex justify-between border-y border-black py-0.5 font-bold ' + (thermal ? 'text-sm' : 'text-base')}><span>TOTAL</span><span>{inr(inv.total)}</span></div>
        {inv.type !== 'estimate' && <Line k={`Paid (${inv.payments.map((p) => p.mode).join(', ') || '—'})`} v={inr(inv.paid)} />}
        {inv.total - inv.paid > 0 && inv.type !== 'estimate' && <Line k="Balance due" v={inr(inv.total - inv.paid)} />}
      </div>
      {!thermal && (
        <table className="mt-3 w-1/2 border border-black text-[11px]">
          <thead><tr className="border-b border-black"><th>GST %</th><th className="text-right">Taxable</th><th className="text-right">Tax</th></tr></thead>
          <tbody>{taxRows.map((r) => <tr key={r.rate}><td className="text-center">{r.rate}%</td><td className="text-right">{r.taxable.toFixed(2)}</td><td className="text-right">{r.tax.toFixed(2)}</td></tr>)}</tbody>
        </table>
      )}
      {inv.notes && <p className="mt-2">{inv.notes}</p>}
      <div className="mt-3 text-center">
        <div>Thank you! Stay fit 💪</div>
        <div className="text-[10px]">100% authentic products · Goods once sold can be exchanged within 7 days with bill (sealed packs only)</div>
        {!thermal && <div className="mt-10 text-right">Authorised Signatory</div>}
      </div>
    </div>
  );
}
const Line = ({ k, v }) => <div className="flex justify-between"><span>{k}</span><span>{v}</span></div>;

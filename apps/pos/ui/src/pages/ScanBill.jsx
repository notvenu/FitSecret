// Scan a supplier's bill into a purchase entry. Free: Tesseract OCR runs in this browser (first use downloads ~15 MB of
// language data, then it is cached). The parser is heuristic, so everything lands in this review table before it touches stock.
import { useState } from 'react';
import { parseBill } from '@fitsecret/shared/billparse';
import { api, toast, fail } from '../api.js';
import { Btn, Field, Modal, Badge, cx } from '../ui.jsx';

// Unmatched row → suggested item name: the words before the first plain number (HSN / qty), e.g. "Protein Cookies 12pc 2106 10 45" → "Protein Cookies 12pc".
const newName = (text) => {
  const t = text.split(/\s+/);
  const end = t.findIndex((w, i) => i > 0 && /^\d[\d,.]*%?$/.test(w));
  return t.slice(0, end < 0 ? t.length : end).join(' ').replace(/^\d+[.)]?\s*/, '').slice(0, 80);
};

export default function ScanBill({ items, parties, branch, onClose, onDone }) {
  const [busy, setBusy] = useState(null); // progress 0..1 while reading
  const [text, setText] = useState('');
  const [draft, setDraft] = useState(null);

  const read = async (file) => {
    setBusy(0);
    try {
      const { createWorker } = await import('tesseract.js'); // loaded only when someone scans
      const worker = await createWorker('eng', 1, { logger: (m) => m.status === 'recognizing text' && setBusy(m.progress) });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      setText(data.text);
      build(data.text);
    } catch (e) { fail(new Error('Could not read the image: ' + (e.message || e) + '. Internet is needed the first time to fetch the OCR engine.')); }
    finally { setBusy(null); }
  };

  const build = (t) => {
    const r = parseBill(t, items, { ownGstin: branch?.gstin });
    const sup = (r.gstin && parties.find((p) => p.gstin?.toUpperCase() === r.gstin)) || null;
    const firstLine = t.split('\n').map((s) => s.trim()).find((s) => /[a-z]{3}/i.test(s)) || '';
    setDraft({
      no: r.no || '', date: r.date || '', inclusive: false,
      supplier: sup?.name || firstLine.slice(0, 60), gstin: r.gstin || '',
      lines: r.lines.map((l, i) => ({ ...l, key: i, use: true, name: items.find((it) => it.id === l.item_id)?.name || newName(l.text),
        mrp: items.find((it) => it.id === l.item_id)?.mrp || '' })),
    });
    if (!r.lines.length) toast('No item rows found — check the text below or add rows by hand', 'err');
  };

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setLine = (key, patch) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const itemByName = (n) => items.find((i) => i.name.toLowerCase() === String(n).trim().toLowerCase());

  const finish = async () => {
    const rows = draft.lines.filter((l) => l.use && l.name && +l.qty > 0);
    if (!rows.length) return toast('Tick at least one row', 'err');
    setBusy(1);
    try {
      let party = parties.find((p) => p.name.toLowerCase() === draft.supplier.trim().toLowerCase() || (draft.gstin && p.gstin?.toUpperCase() === draft.gstin.toUpperCase()));
      if (!party) {
        if (!draft.supplier.trim()) throw new Error('Enter the supplier name');
        party = { ...(await api('/t/parties', { type: 'supplier', name: draft.supplier.trim(), gstin: draft.gstin.toUpperCase() || null,
          state_code: /^\d{2}/.test(draft.gstin) ? draft.gstin.slice(0, 2) : branch?.state_code || '37', opening_balance: 0 })), balance: 0 };
      }
      const fresh = rows.filter((l) => !itemByName(l.name));
      const made = fresh.length ? await api('/t/items/bulk', { rows: fresh.map((l) => ({ name: l.name.trim(), hsn: l.hsn || null, gst_rate: +l.gst_rate || 0,
        purchase_price: +l.rate || null, mrp: +l.mrp || null, sale_price: +l.mrp || +l.rate || 0, unit: 'pcs', low_stock: 3, online: false })) }) : [];
      const all = [...items, ...made];
      onDone({
        party, no: draft.no, date: draft.date, inclusive: draft.inclusive,
        lines: rows.map((l) => {
          const it = all.find((i) => i.name.toLowerCase() === l.name.trim().toLowerCase());
          return { item_id: it.id, name: it.name, stock: it.stock || 0, qty: +l.qty, rate: +l.rate || 0, gst_rate: l.gst_rate === '' || l.gst_rate == null ? it.gst_rate : +l.gst_rate,
            mrp: it.mrp, batch_no: l.batch_no || '', expiry: l.expiry || '' };
        }),
      });
      toast(`${rows.length} rows added${made.length ? ` · ${made.length} new items created` : ''}. Check and save the bill.`);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  return (
    <Modal wide title="Scan supplier bill" onClose={onClose} footer={draft && <>
      <Btn onClick={() => setDraft(null)}>Scan again</Btn>
      <Btn v="primary" disabled={busy != null} onClick={finish}>Add to purchase bill</Btn>
    </>}>
      <datalist id="scan-items">{items.map((i) => <option key={i.id} value={i.name} />)}</datalist>
      <datalist id="scan-suppliers">{parties.filter((p) => p.type === 'supplier').map((p) => <option key={p.id} value={p.name} />)}</datalist>
      {!draft ? (
        <div className="grid gap-4 md:grid-cols-2">
          <label className={cx('grid min-h-48 cursor-pointer place-items-center rounded-[14px] border-2 border-dashed border-line p-6 text-center text-sm hover:border-ink', busy != null && 'pointer-events-none opacity-60')}>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && read(e.target.files[0])} />
            {busy != null ? <div>Reading bill… {Math.round(busy * 100)}%<div className="mt-2 h-1.5 w-48 overflow-hidden rounded bg-black/10"><div className="h-full bg-brand" style={{ width: `${busy * 100}%` }} /></div></div>
              : <div><div className="font-semibold">Take a photo or choose an image of the bill</div><div className="mt-1 text-xs text-black/50">Flat, well-lit, whole page in frame. PDFs: screenshot the page.</div></div>}
          </label>
          <div className="flex flex-col gap-2">
            <Field label="…or paste the bill text (e-invoice / emailed PDF)"><textarea className="input font-mono text-xs" rows={8} value={text} onChange={(e) => setText(e.target.value)} /></Field>
            <Btn disabled={!text.trim()} onClick={() => build(text)}>Read pasted text</Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Field label="Supplier" className="md:col-span-2" list="scan-suppliers" value={draft.supplier} onChange={(e) => set({ supplier: e.target.value })}
              hint={parties.some((p) => p.name.toLowerCase() === draft.supplier.trim().toLowerCase()) ? 'Existing supplier' : 'Will be created as a new supplier'} />
            <Field label="GSTIN" value={draft.gstin} onChange={(e) => set({ gstin: e.target.value })} />
            <Field label="Bill no." value={draft.no} onChange={(e) => set({ no: e.target.value })} />
            <Field label="Bill date" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          <label className="mb-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.inclusive} onChange={(e) => set({ inclusive: e.target.checked })} /> Rates on this bill include GST</label>
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-[10px] uppercase text-black/50">
                <tr><th className="p-1" /><th className="p-1">Item (from your list, or a new name)</th><th className="w-16 p-1">Qty</th><th className="w-24 p-1">Rate</th><th className="w-14 p-1">GST%</th><th className="w-24 p-1">Batch</th><th className="w-32 p-1">Expiry</th><th className="w-20 p-1">MRP</th></tr>
              </thead>
              <tbody>
                {draft.lines.map((l) => (
                  <tr key={l.key} className={cx('border-t border-line align-top', !l.use && 'opacity-40')}>
                    <td className="p-1 pt-2"><input type="checkbox" checked={l.use} onChange={(e) => setLine(l.key, { use: e.target.checked })} aria-label="Include row" /></td>
                    <td className="p-1">
                      <input className="input py-1 text-xs" list="scan-items" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} />
                      <div className="mt-0.5 truncate text-[10px] text-black/40" title={l.text}>{itemByName(l.name) ? <Badge c="green">matched</Badge> : <Badge c="amber">new item</Badge>} {l.guessed && <Badge c="red">check qty/rate</Badge>} {l.text}</div>
                    </td>
                    {['qty', 'rate', 'gst_rate', 'batch_no'].map((k) => <td key={k} className="p-1"><input className="input px-1.5 py-1 text-xs" value={l[k] ?? ''} onChange={(e) => setLine(l.key, { [k]: e.target.value })} /></td>)}
                    <td className="p-1"><input className="input px-1 py-1 text-xs" type="date" value={l.expiry || ''} onChange={(e) => setLine(l.key, { expiry: e.target.value })} /></td>
                    <td className="p-1"><input className="input px-1.5 py-1 text-xs" value={l.mrp ?? ''} onChange={(e) => setLine(l.key, { mrp: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-2 text-xs font-semibold text-brand-d hover:underline" onClick={() => set({ lines: [...draft.lines, { key: Math.random(), use: true, name: '', qty: 1, rate: '', gst_rate: '', text: 'added by hand' }] })}>+ Add row</button>
          </div>
          <details className="mt-3 text-xs text-black/55"><summary className="cursor-pointer">Text read from the bill</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-paper p-2">{text}</pre></details>
        </>
      )}
    </Modal>
  );
}

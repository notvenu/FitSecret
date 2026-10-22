// Vyapar's Utilities menu: import items/parties (CSV, Vyapar export headers understood), bulk edit, barcode labels, export, recycle bin.
import { useMemo, useState } from 'react';
import { STATES, inr, today } from '@fitsecret/shared';
import { code128Svg, newBarcode } from '@fitsecret/shared/barcode';
import { toTallyXml, parseTally } from '@fitsecret/shared/tally';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Page, Table, Money, Badge, cx } from '../ui.jsx';

const TITLES = { 'import-items': 'Import Items', barcode: 'Barcode Generator', bulk: 'Update Items In Bulk', 'import-parties': 'Import Parties', export: 'Export Items', trash: 'Recycle Bin', verify: 'Verify My Data',
  'import-tally': 'Import From Tally', 'tally-export': 'Export To Tally' };

export default function Utilities({ tool, boot }) {
  tool = TITLES[tool] ? tool : 'import-items';
  return (
    <Page title={TITLES[tool]}>
      {tool === 'import-items' && <Import kind="items" />}
      {tool === 'import-parties' && <Import kind="parties" />}
      {tool === 'bulk' && <Bulk />}
      {tool === 'barcode' && <Barcodes branch={boot.branch} />}
      {tool === 'export' && <Export />}
      {tool === 'trash' && <Trash />}
      {tool === 'verify' && <Verify />}
      {tool === 'import-tally' && <>
        <p className="mb-4 max-w-3xl text-sm text-black/60">In Tally: <b>Gateway of Tally → Display More Reports → List of Accounts</b> (for parties) or <b>Stock Items</b> (for items),
          then <b>Alt+E Export → Format: XML</b>. Pick the file below. Sundry Debtors become customers, Sundry Creditors suppliers, with GSTIN, address and opening balance.</p>
        <h2 className="mb-2 font-semibold">Parties (ledgers)</h2><Import kind="parties" />
        <h2 className="mb-2 mt-6 font-semibold">Items (stock items)</h2><Import kind="items" />
      </>}
      {tool === 'tally-export' && <TallyExport branch={boot.branch} />}
    </Page>
  );
}

// ---------- CSV ----------
export function parseCsv(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head = [], ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => { const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

const COLS = {
  items: {
    name: ['itemname', 'name', 'productname', 'item', 'product'], sku: ['itemcode', 'sku', 'code', 'productcode'], barcode: ['barcode', 'ean', 'upc'],
    brand: ['brand', 'company', 'manufacturer'], category: ['category', 'itemcategory', 'group'], hsn: ['hsn', 'hsncode', 'hsnsac', 'hsnsaccode'],
    gst_rate: ['taxrate', 'gst', 'gstrate', 'gstpercent', 'tax'], mrp: ['mrp'], sale_price: ['saleprice', 'sellingprice', 'price', 'rate', 'salesprice'],
    purchase_price: ['purchaseprice', 'cost', 'costprice'], opening_stock: ['openingstockquantity', 'openingstock', 'currentstockquantity', 'stock', 'quantity', 'qty'],
    low_stock: ['minimumstockquantity', 'minstock', 'lowstock', 'reorderlevel', 'minimumstock'], unit: ['unit', 'baseunit'], size: ['size'], flavour: ['flavour', 'flavor'], wholesale_price: ['wholesaleprice'], wholesale_min_qty: ['minimumwholesaleqty', 'wholesaleminqty', 'minwholesaleqty'],
  },
  parties: {
    name: ['name', 'partyname'], phone: ['contactno', 'phone', 'mobile', 'phoneno', 'contact', 'mobileno'], email: ['email', 'emailid'],
    address: ['address', 'billingaddress'], gstin: ['gstin', 'gstno', 'gstinno'], state: ['state', 'stateofsupply'], type: ['partytype', 'type'],
    receivable: ['openingbalance', 'receivablebalance', 'balance', 'currentbalance'], payable: ['payablebalance'],
  },
};
const pick = (row, keys) => { const k = Object.keys(row).find((h) => keys.includes(norm(h))); return k ? row[k] : ''; };

function Import({ kind }) {
  const items = useApi(kind === 'items' ? '/items' : '/parties');
  const cats = useApi(kind === 'items' ? '/t/categories' : null);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const read = async (file) => { const t = await file.text(); setRows(/\.xml$/i.test(file.name) || t.trimStart().startsWith('<') ? parseTally(t, kind) : parseCsv(t)); };
  const mapped = useMemo(() => rows?.map((r) => {
    const v = Object.fromEntries(Object.entries(COLS[kind]).map(([k, keys]) => [k, pick(r, keys)]));
    if (kind === 'parties') {
      const state = Object.entries(STATES).find(([, n]) => norm(n) === norm(v.state))?.[0] || (/^\d{2}/.test(v.gstin) ? v.gstin.slice(0, 2) : '37');
      const bal = (num(v.receivable) || 0) - (num(v.payable) || 0);
      const old = items.data?.find((p) => norm(p.name) === norm(v.name));
      return { ...(old && { id: old.id }), name: v.name, phone: v.phone || null, email: v.email || null, address: v.address || null, gstin: v.gstin?.toUpperCase() || null,
        state_code: state, type: /supp|vend|cred/i.test(v.type) ? 'supplier' : 'customer', ...(!old && { opening_balance: bal }) };
    }
    const old = items.data?.find((i) => (v.barcode && i.barcode === v.barcode) || (v.sku && i.sku === v.sku) || norm(i.name) === norm(v.name));
    const cat = cats.data?.find((c) => norm(c.name) === norm(v.category));
    const out = { name: v.name, sku: v.sku || null, barcode: v.barcode || null, brand: v.brand || null, hsn: v.hsn || null, gst_rate: /exempt|nil/i.test(v.gst_rate) ? 0 : num(v.gst_rate),
      mrp: num(v.mrp), sale_price: num(v.sale_price), purchase_price: num(v.purchase_price), low_stock: num(v.low_stock), unit: v.unit || null, wholesale_price: num(v.wholesale_price), wholesale_min_qty: num(v.wholesale_min_qty),
      size: v.size || null, flavour: v.flavour || null, ...(cat && { category_id: cat.id }) };
    // Existing item: only the cells that are filled in change (blanks never wipe or default anything); new item: defaults + opening stock.
    return old ? { id: old.id, ...Object.fromEntries(Object.entries(out).filter(([, x]) => x != null && x !== '')), _update: true }
      : { ...out, gst_rate: out.gst_rate ?? 18, sale_price: out.sale_price ?? out.mrp ?? 0, low_stock: out.low_stock ?? 3, unit: out.unit || 'pcs', online: false, opening_stock: num(v.opening_stock) || 0 };
  }).filter((r) => r.name), [rows, items.data, cats.data]);

  const [mode, setMode] = useState('file');
  const save = async (list = mapped) => {
    setBusy(true);
    try {
      const out = await api(`/t/${kind}/bulk`, { rows: list.map(({ _update, ...r }) => r) });
      toast(`${out.length} ${kind} imported`); setRows(null); items.reload();
      return true;
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const updates = mapped?.filter((r) => r.id).length || 0;
  return (
    <>
      {kind === 'items' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[['barcode', 'Scan barcodes'], ['file', 'CSV / Excel file']].map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className={cx('rounded-full border px-4 py-2 text-sm font-semibold', mode === m ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink')}>{l}</button>
          ))}
          <a href="#/bill/purchase?scan=1" className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-ink"
            title="Reads the bill photo into a purchase entry, so stock, GST input credit and the dealer's balance are all recorded">Scan dealer invoice →</a>
        </div>
      )}
      {kind === 'items' && mode === 'barcode' ? <BarcodeEntry items={items.data || []} busy={busy} onSave={save} /> : <>
      <div className="card mb-4 p-5 text-sm">
        <p className="mb-3 text-black/60">
          {kind === 'items'
            ? <>In Vyapar: <b>Utilities → Export Items</b>, open the file in Excel and <b>Save As → CSV</b>. Columns like Item name, Item code, HSN, Sale price, Purchase price, MRP, Tax rate, Opening stock quantity and Category are picked up automatically. Items already here (same barcode, code or name) are updated, not duplicated.</>
            : <>In Vyapar: <b>Utilities → Export Parties</b> (or Reports → All parties → Excel), save as <b>CSV</b>. Name, Contact no, Email, Address, GSTIN, State, Party type and Receivable/Payable balance are picked up.</>}
        </p>
        <input type="file" accept=".csv,.txt,.xml,text/csv" onChange={(e) => e.target.files[0] && read(e.target.files[0])} />
      </div>
      {mapped && (
        <div className="card">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
            <span>{mapped.length} rows · <b>{mapped.length - updates}</b> new · <b>{updates}</b> update existing</span>
            <Btn v="primary" disabled={busy || !mapped.length} onClick={() => save()}>{busy ? 'Importing…' : `Import ${mapped.length}`}</Btn>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <Table rows={mapped.slice(0, 200)} columns={(kind === 'items'
              ? ['name', 'sku', 'hsn', 'gst_rate', 'mrp', 'sale_price', 'purchase_price', 'opening_stock']
              : ['name', 'type', 'phone', 'gstin', 'state_code', 'opening_balance']).map((k) => ({ k, label: k.replace(/_/g, ' ') }))
              .concat([{ label: '', r: (r) => <Badge c={r.id ? 'blue' : 'green'}>{r.id ? 'update' : 'new'}</Badge> }])} />
          </div>
        </div>
      )}
      </>}
    </>
  );
}

// Scanner types the code + Enter. Known barcode → its stock goes up; unknown → a new item row to name and price.
function BarcodeEntry({ items, busy, onSave }) {
  const [code, setCode] = useState('');
  const [list, setList] = useState([]);
  const add = (e) => {
    e.preventDefault();
    const c = code.trim();
    setCode('');
    if (!c) return;
    if (/^\d{8,14}$/.test(c) && !list.some((x) => x.barcode === c) && !items.some((i) => i.barcode === c || i.sku === c)) lookup(c);
    setList((l) => {
      const hit = l.find((x) => x.barcode === c);
      if (hit) return [{ ...hit, qty: +hit.qty + 1 }, ...l.filter((x) => x !== hit)];
      const it = items.find((i) => i.barcode === c || i.sku === c);
      return [{ barcode: c, qty: 1, id: it?.id, name: it?.name || '', mrp: it?.mrp ?? '', purchase_price: it?.purchase_price ?? '', gst_rate: it?.gst_rate ?? 18, stock: it?.stock }, ...l];
    });
  };
  const set = (c, patch) => setList((l) => l.map((x) => (x.barcode === c ? { ...x, ...patch } : x)));
  // Like Vyapar's barcode library: fill the name from Open Food Facts (free, covers most packaged supplements/foods). Offline = type it.
  const lookup = (c) => fetch(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=product_name,brands,quantity`).then((r) => r.json()).then(({ product: p }) => {
    const name = p?.product_name && [p.brands?.split(',')[0], p.product_name, p.quantity].filter((w, i, a) => w && !(i === 0 && a[1].toLowerCase().includes(w.toLowerCase()))).join(' ');
    if (name) setList((l) => l.map((x) => (x.barcode === c && !x.name ? { ...x, name: name.slice(0, 120) } : x)));
  }).catch(() => {});
  const rows = list.filter((x) => x.name.trim() && +x.qty > 0).map((x) => (x.id
    ? { id: x.id, name: x.name, add_stock: +x.qty, _update: true }
    : { name: x.name.trim(), barcode: x.barcode, mrp: +x.mrp || null, sale_price: +x.mrp || 0, purchase_price: +x.purchase_price || null,
        gst_rate: +x.gst_rate || 0, hsn: '2106', low_stock: 3, unit: 'pcs', online: false, opening_stock: +x.qty }));
  const cell = (x, k, w = 'w-24', t = 'number') => <input type={t} className={cx('input py-1', w)} value={x[k]} onChange={(e) => set(x.barcode, { [k]: e.target.value })} />;
  return (
    <div className="card">
      <form onSubmit={add} className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <input className="input max-w-md py-3 text-base" autoFocus placeholder="Scan a barcode (or type it and press Enter)" value={code} onChange={(e) => setCode(e.target.value)} />
        <span className="text-sm text-black/55">Scan the same item again to count it. New codes become new items, and their name is looked up online when found.</span>
        <Btn v="primary" className="ml-auto" disabled={busy || !rows.length} onClick={async () => (await onSave(rows)) && setList([])}>
          {busy ? 'Saving…' : `Save ${rows.length} item${rows.length === 1 ? '' : 's'}`}
        </Btn>
      </form>
      <Table rows={list} empty="Nothing scanned yet" columns={[
        { k: 'barcode', label: 'Barcode', r: (x) => <span className="font-mono text-xs">{x.barcode}</span> },
        { k: 'name', label: 'Item', r: (x) => (x.id ? <span className="font-medium">{x.name} <span className="text-xs text-black/45">· in stock {x.stock ?? 0}</span></span> : cell(x, 'name', 'w-64', 'text')) },
        { k: 'mrp', label: 'MRP', r: (x) => (x.id ? <Money v={x.mrp} /> : cell(x, 'mrp')) },
        { k: 'purchase_price', label: 'Cost', r: (x) => (x.id ? <Money v={x.purchase_price} /> : cell(x, 'purchase_price')) },
        { k: 'gst_rate', label: 'GST %', r: (x) => (x.id ? x.gst_rate + '%' : cell(x, 'gst_rate', 'w-16')) },
        { k: 'qty', label: 'Qty to add', r: (x) => cell(x, 'qty', 'w-20') },
        { label: '', r: (x) => <span className="flex items-center gap-2"><Badge c={x.id ? 'blue' : 'green'}>{x.id ? 'add stock' : 'new'}</Badge>
          <button className="px-1 text-black/30 hover:text-red-600" aria-label="Remove" onClick={() => setList((l) => l.filter((y) => y !== x))}>✕</button></span> },
      ]} />
    </div>
  );
}

const EDIT = [['mrp', 'MRP'], ['sale_price', 'Sale price'], ['purchase_price', 'Purchase price'], ['gst_rate', 'GST %'], ['hsn', 'HSN'], ['low_stock', 'Min stock'], ['wholesale_price', 'Wholesale'], ['wholesale_min_qty', 'Wholesale qty'], ['barcode', 'Barcode']];
function Bulk() {
  const items = useApi('/items');
  const [q, setQ] = useState('');
  const [ch, setCh] = useState({}); // id -> { field: value }
  const [busy, setBusy] = useState(false);
  const rows = items.data?.filter((i) => `${i.name} ${i.brand} ${i.sku} ${i.barcode}`.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  const set = (id, k, v) => setCh((c) => ({ ...c, [id]: { ...c[id], [k]: v } }));
  const save = async () => {
    setBusy(true);
    try {
      const NUM = ['mrp', 'sale_price', 'purchase_price', 'gst_rate', 'low_stock', 'wholesale_price', 'wholesale_min_qty'];
      await api('/t/items/bulk', { rows: Object.entries(ch).map(([id, f]) => ({ id, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, NUM.includes(k) ? (v === '' ? null : +v) : v || null])) })) });
      toast(`${Object.keys(ch).length} items updated`); setCh({}); items.reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <input className="input max-w-sm" placeholder="Filter by name, brand, code…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-sm text-black/50">{Object.keys(ch).length} changed</span>
        <Btn v="primary" className="ml-auto" disabled={busy || !Object.keys(ch).length} onClick={save}>Save changes</Btn>
      </div>
      <div className="card max-h-[70vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase text-black/50"><tr><th className="p-2">Item</th>{EDIT.map(([k, l]) => <th key={k} className="w-24 p-1">{l}</th>)}</tr></thead>
          <tbody>
            {rows?.map((i) => (
              <tr key={i.id} className={cx('border-t border-line', ch[i.id] && 'bg-amber-50')}>
                <td className="p-2 font-medium">{i.name}</td>
                {EDIT.map(([k]) => <td key={k} className="p-1"><input className="input px-1.5 py-1 text-xs" value={ch[i.id]?.[k] ?? i[k] ?? ''} onChange={(e) => set(i.id, k, e.target.value)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Barcodes({ branch }) {
  const items = useApi('/items');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState({}); // id -> label count
  const [size, setSize] = useState('50x25');
  const [show, setShow] = useState({ price: true, mrp: true, store: true });
  const rows = items.data?.filter((i) => `${i.name} ${i.brand} ${i.barcode}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  const chosen = items.data?.filter((i) => sel[i.id] > 0) || [];
  const missing = chosen.filter((i) => !i.barcode);
  const assign = async () => {
    try { await api('/t/items/bulk', { rows: missing.map((i, n) => ({ id: i.id, barcode: newBarcode(n) })) }); toast(`Barcodes assigned to ${missing.length} items`); items.reload(); }
    catch (e) { fail(e); }
  };
  const [w, h] = size.split('x').map(Number);
  const labels = chosen.filter((i) => i.barcode).flatMap((i) => Array.from({ length: sel[i.id] }, (_, n) => ({ ...i, n })));
  return (
    <>
      <style>{`@media print { @page { size: ${w}mm ${h}mm; margin: 0 } h1 { display: none } .label { page-break-after: always; border: 0 !important; margin: 0 !important } }`}</style>
      <div className="no-print grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card">
          <div className="flex items-center gap-2 border-b border-line p-3">
            <input className="input" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <Table rows={rows} columns={[
              { label: 'Item', r: (i) => <div><div className="font-medium">{i.name}</div><div className="text-[11px] text-black/45">{i.barcode || 'no barcode yet'} · stock {i.stock}</div></div> },
              { label: 'Labels', right: true, r: (i) => <input className="input w-20 py-1 text-right" inputMode="numeric" value={sel[i.id] ?? ''} placeholder="0"
                onChange={(e) => setSel({ ...sel, [i.id]: Math.max(0, +e.target.value || 0) })} /> },
              { label: '', r: (i) => <button className="text-xs font-semibold text-brand-d" onClick={() => setSel({ ...sel, [i.id]: Math.max(1, Math.round(i.stock)) })}>= stock</button> },
            ]} />
          </div>
        </div>
        <div className="card space-y-3 self-start p-4 text-sm">
          <Field label="Label size (mm)"><select className="input" value={size} onChange={(e) => setSize(e.target.value)}>{['50x25', '38x25', '50x30', '65x35'].map((s) => <option key={s}>{s}</option>)}</select></Field>
          {[['store', 'Store name'], ['price', 'Our price'], ['mrp', 'MRP']].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} /> {l}</label>
          ))}
          {missing.length > 0 && <div className="rounded-lg bg-amber-50 p-2 text-xs">{missing.length} chosen items have no barcode. <button className="font-semibold underline" onClick={assign}>Assign new barcodes</button></div>}
          <Btn v="primary" className="w-full" disabled={!labels.length} onClick={() => print()}>Print {labels.length} labels</Btn>
          <p className="text-xs text-black/45">Set the label printer as the printer and paper size to {w}×{h} mm in the print dialog.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {labels.map((i) => {
          const b = code128Svg(i.barcode, 30);
          return (
            <div key={i.id + i.n} className="label flex flex-col items-center justify-center overflow-hidden border border-dashed border-line bg-white px-1 text-center leading-tight text-black" style={{ width: `${w}mm`, height: `${h}mm` }}>
              {show.store && <div className="text-[7px] font-bold uppercase">{branch?.name}</div>}
              <div className="line-clamp-2 text-[8px] font-medium">{i.name}</div>
              <svg viewBox={`0 0 ${b.width} ${b.height}`} preserveAspectRatio="none" style={{ width: '92%', height: `${h * 0.38}mm` }}><path d={b.d} fill="#000" /></svg>
              <div className="font-mono text-[7px]">{i.barcode}</div>
              <div className="text-[8px]">{show.price && <b>{inr(i.sale_price)}</b>}{show.mrp && i.mrp > i.sale_price && <span className="ml-1">MRP {inr(i.mrp)}</span>}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Export() {
  const items = useApi('/items');
  const parties = useApi('/parties');
  const xi = () => downloadCsv('items', items.data?.map((i) => ({ 'Item name': i.name, 'Item code': i.sku, Barcode: i.barcode, Brand: i.brand, Category: i.category, HSN: i.hsn,
    'Tax rate': i.gst_rate, MRP: i.mrp, 'Sale price': i.sale_price, 'Purchase price': i.purchase_price, 'Current stock quantity': i.stock, 'Minimum stock quantity': i.low_stock, Unit: i.unit })));
  const xp = () => downloadCsv('parties', parties.data?.map((p) => ({ Name: p.name, 'Party type': p.type, 'Contact no': p.phone, Email: p.email, GSTIN: p.gstin,
    State: STATES[p.state_code], Address: p.address, 'Receivable balance': p.balance > 0 ? p.balance : 0, 'Payable balance': p.balance < 0 ? -p.balance : 0 })));
  return (
    <div className="card flex flex-wrap items-center gap-3 p-5 text-sm">
      <span className="mr-auto text-black/60">CSV files open in Excel. Same column names as Vyapar, so they import back into either app.</span>
      <Btn v="primary" disabled={!items.data} onClick={xi}>Export {items.data?.length ?? ''} items</Btn>
      <Btn disabled={!parties.data} onClick={xp}>Export {parties.data?.length ?? ''} parties</Btn>
    </div>
  );
}

function Trash() {
  const list = useApi('/trash');
  const restore = (r) => api('/trash/restore', { table: r.table, id: r.id }).then(() => { toast(`${r.name} restored`); list.reload(); }, fail);
  return (
    <div className="card">
      <Table rows={list.data} empty="Recycle bin is empty" columns={[
        { k: 'name', label: 'Name', r: (r) => <span className="font-medium">{r.name}</span> }, { k: 'table', label: 'Type', r: (r) => <Badge>{r.table}</Badge> },
        { k: 'deleted_at', label: 'Deleted', r: (r) => new Date(r.deleted_at).toLocaleString('en-IN') },
        { label: '', r: (r) => <div className="text-right"><Btn size="sm" onClick={() => restore(r)}>Restore</Btn></div> },
      ]} />
      <p className="border-t border-line px-4 py-2 text-xs text-black/45">Cancelled invoices stay in their lists marked “cancelled”, as GST rules need the number series intact.</p>
    </div>
  );
}

// Vyapar's Verify My Data: lists records that disagree with each other (see REPORTS.verify in packages/shared/reports.js).
function Verify() {
  const r = useApi('/reports/x/verify');
  const n = r.data?.length;
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
        <span>{n == null ? 'Checking…' : n ? <><b>{n}</b> thing{n === 1 ? '' : 's'} to fix</> : <b className="text-brand-d">All data checks passed ✓</b>}</span>
        <div className="flex gap-2"><Btn size="sm" onClick={r.reload}>Check again</Btn>{n > 0 && <Btn size="sm" onClick={() => downloadCsv('verify-my-data', r.data)}>CSV</Btn>}</div>
      </div>
      <Table rows={r.data} empty="Invoices, payments, stock and GSTINs all agree." columns={[
        { k: 'check', label: 'Problem', r: (x) => <Badge c={/Negative|≠|not moved/.test(x.check) ? 'red' : 'amber'}>{x.check}</Badge> },
        { k: 'ref', label: 'Invoice / item / party', r: (x) => <span className="font-medium">{x.ref}</span> }, { k: 'detail', label: 'Detail' }]} />
    </div>
  );
}

// Vyapar's Export To Tally: sales, purchases, returns, receipts, payments and expenses as a Tally import XML.
function TallyExport({ branch }) {
  const fy = (() => { const d = today(), y = +d.slice(0, 4) - (+d.slice(5, 7) < 4 ? 1 : 0); return `${y}-04-01`; })();
  const [range, setRange] = useState({ from: fy, to: today() });
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const [data] = await api(`/reports/x/tally_export?from=${range.from}&to=${range.to}`);
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([toTallyXml(data, branch?.name)], { type: 'application/xml' })),
        download: `tally-${branch?.code || 'fs'}-${range.from}-to-${range.to}.xml` });
      a.click();
      toast(`${data.invoices.length} bills, ${data.payments.length} payments, ${data.expenses.length} expenses exported`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <div className="card max-w-3xl p-5 text-sm">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Field label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <Btn v="primary" disabled={busy} onClick={run}>{busy ? 'Preparing…' : 'Download Tally XML'}</Btn>
      </div>
      <p className="text-black/60">In Tally Prime: <b>Import → Transactions</b> (ERP 9: Gateway → Import of Data → Vouchers) and pick this file.
        Party ledgers (Sundry Debtors / Creditors), Sales, Purchase, Input/Output CGST-SGST-IGST, Round Off, TDS/TCS and payment-mode ledgers are created
        if missing. Walk-in sales post to <b>Cash</b>. Import into a test company first the first time.</p>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { slugify } from '@fitsecret/shared';
import { parseVariant, findVariantGroups } from '@fitsecret/shared/variants';
import { api, useApi, toast, fail, downloadCsv, upload } from '../api.js';
import { can } from '@fitsecret/shared/permissions';
import { Btn, Field, Modal, Money, Table, Badge, DeleteBtn, SideNav, SectionPage, useForm, cx } from '../ui.jsx';
import { CategoryForm } from './Online.jsx';
import { InsightStrip } from './Insights.jsx';

// ---------- products and their variants ----------
// Items that share group_key are one product with variants (size / flavour); the website shows them as one product page.
// Each variant keeps its own barcode, price, stock, batches, expiry and certificates.
const SIZE = /\b\d+(?:\.\d+)?\s*(?:kg|kgs|g|gm|gms|grams?|lbs?|ml|l|ltrs?|litres?|caps(?:ules)?|tabs|tablets|servings|sachets|pcs|s)\b/gi;
const words = (s) => String(s || '').toLowerCase().replace(SIZE, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !/^\d+$/.test(w));
const strip = (name, ...parts) => parts.filter(Boolean).reduce((n, p) => n.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' '), String(name || '')).replace(SIZE, ' ').replace(/\s{2,}/g, ' ').trim();
export const groupOf = (i) => i.group_key || i.id;
export const variantLabel = (i) => [i.size, i.flavour].filter(Boolean).join(' · ') || i.name;
export function productsOf(items = []) {
  const m = new Map();
  for (const i of items) {
    const k = groupOf(i), p = m.get(k) || { key: k, name: strip(i.name, i.size, i.flavour) || i.name, brand: i.brand, variants: [] };
    p.variants.push(i);
    m.set(k, p);
  }
  return m;
}
// Products whose name matches what is being typed once sizes are ignored ("ON Gold Standard Whey 2 lb" ~ "ON Gold Standard Whey 1kg").
function similar(name, brand, products) {
  const a = new Set(words(name));
  if (a.size < 2) return [];
  return [...products.values()].map((p) => {
    const b = words(p.name), shared = b.filter((w) => a.has(w)).length;
    return { p, shared, score: shared / Math.max(b.length, 1) };
  }).filter((x) => x.shared >= 2 && x.score >= 0.6 && (!brand || !x.p.brand || x.p.brand.toLowerCase() === brand.toLowerCase()))
    .sort((x, y) => y.score - x.score || y.shared - x.shared).slice(0, 2).map((x) => x.p);
}
// A new variant of product p: product-level details copied, variant details (size, flavour, codes, stock) left to fill in.
function variantDraft(p, typed = '') {
  const v = p.variants[0], { size, flavour } = parseVariant(typed);
  return { name: typed || p.name, brand: v.brand, category_id: v.category_id, hsn: v.hsn, gst_rate: v.gst_rate, unit: v.unit || 'pcs', online: v.online, featured: false,
    goals: v.goals || [], description: v.description || '', image: v.image || '', low_stock: v.low_stock ?? 3, refill_days: v.refill_days ?? '', group_key: groupOf(v), company_ids: v.company_ids || [],
    size: size.trim(), flavour, sku: '', barcode: '', mrp: '', sale_price: '', purchase_price: '', _product: p.name };
}

// Categories as a tree: each top-level category followed by its subcategories.
export function catOptions(cats) {
  cats ||= []; // null while loading
  const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);
  return cats.filter((c) => !c.parent_id).sort(bySort).flatMap((top) => [
    { ...top, label: top.name, depth: 0 },
    ...cats.filter((c) => c.parent_id === top.id).sort(bySort).map((c) => ({ ...c, label: `${top.name} › ${c.name}`, depth: 1 })),
  ]);
}

export default function Items({ user, route, boot, branch }) {
  const cos = boot?.companies || [];
  const [allCos, setAllCos] = useState(false); // Items shows this company's items; tick to see every company's
  const items = useApi(allCos ? '/items?all=1' : '/items');
  const coName = (id) => cos.find((c) => c.id === id)?.name;
  const cats = useApi('/t/categories');
  const [q, setQ] = useState(route?.query.q || '');
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState(route?.query.new && can(user, 'items_edit') ? {} : null);
  const [adjust, setAdjust] = useState(null);
  const [detail, setDetail] = useState(null);
  const [variants, setVariants] = useState(null); // product whose sizes / flavours are open in the table editor
  const [catMgr, setCatMgr] = useState(false);
  const [finder, setFinder] = useState(false);
  const admin = can(user, 'items_edit'), stockOk = can(user, 'stock'), cost = can(user, 'see_cost'); // what this login may do here

  const [grouped, setGrouped] = useState(true);
  const [open, setOpen] = useState(() => new Set());
  const products = useMemo(() => productsOf(items.data || []), [items.data]);
  const match = useMemo(() => items.data?.filter((i) =>
    (!cat || i.category_id === cat || cats.data?.find((c) => c.id === i.category_id)?.parent_id === cat) &&
    (filter !== 'low' || i.stock <= (i.low_stock || 0)) &&
    (filter !== 'online' || i.online) &&
    `${i.name} ${i.sku} ${i.barcode} ${i.brand} ${i.model || ''} ${i.flavour || ''} ${i.size || ''}`.toLowerCase().includes(q.toLowerCase())), [items.data, q, cat, filter]);
  // Grouped: one row per product (variants shown when opened, or straight away while searching); single-variant products stay one row.
  const rows = useMemo(() => {
    if (!match || !grouped) return match;
    const hit = new Set(match.map((i) => i.id)), out = [];
    for (const p of products.values()) {
      const vs = p.variants.filter((v) => hit.has(v.id));
      if (!vs.length) continue;
      if (p.variants.length === 1) { out.push(vs[0]); continue; }
      out.push({ id: 'p:' + p.key, _p: p, name: p.name, stock: vs.reduce((s, v) => s + v.stock, 0), shown: vs });
      if (open.has(p.key) || q) out.push(...vs.map((v) => ({ ...v, _child: true })));
    }
    return out;
  }, [match, grouped, products, open, q]);
  const toggle = (k) => setOpen((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const value = match?.reduce((s, i) => s + Math.max(i.stock, 0) * (i.purchase_price || 0), 0) || 0;
  const range = (vs) => { const ps = vs.map((v) => v.sale_price); const lo = Math.min(...ps), hi = Math.max(...ps); return lo === hi ? <Money v={lo} className="font-medium" /> : <span className="font-medium tabular-nums">₹{lo.toLocaleString('en-IN')}–{hi.toLocaleString('en-IN')}</span>; };

  return (
    <SectionPage nav={<SideNav title="Items" value={cat ? 'c:' + cat : filter || 'all'} onChange={(k) => { if (k.startsWith('c:')) { setCat(k.slice(2)); setFilter(''); } else { setCat(''); setFilter(k === 'all' ? '' : k); } }}
      groups={[{ items: [{ key: 'all', label: 'All items', badge: items.data?.length }, { key: 'low', label: 'Low stock', badge: items.data?.filter((i) => i.stock <= (i.low_stock || 0)).length },
        { key: 'online', label: 'Sold online', badge: items.data?.filter((i) => i.online).length }] },
        { label: 'Categories', items: catOptions(cats.data).map((c) => ({ key: 'c:' + c.id, label: c.name, indent: c.depth > 0,
          badge: items.data?.filter((i) => i.category_id === c.id || (!c.depth && cats.data?.find((x) => x.id === i.category_id)?.parent_id === c.id)).length || undefined })) }]} />}
      top={<InsightStrip user={user} branch={branch} sections={['stock']} limit={2} />}
      title={cat ? cats.data?.find((c) => c.id === cat)?.name : { low: 'Low stock', online: 'Sold online' }[filter] || 'All items'}
      hint="Search, or use ↓ then Enter to open an item. Products with several sizes or flavours open to show their variants." actions={<>
      <Btn onClick={() => downloadCsv('items', rows?.map(({ goals, description, ...r }) => r))}>Export</Btn>
      {admin && <Btn onClick={() => setFinder(true)} title="Find items that are sizes or flavours of one product and group them">Find variants</Btn>}
      {admin && <Btn onClick={() => setCatMgr(true)}>Categories</Btn>}
      {admin && <Btn v="primary" onClick={() => setEdit({})}>+ Add item</Btn>}
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search name, SKU, barcode, brand" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <label className="flex items-center gap-1.5 text-xs font-medium"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group variants</label>
        {cos.length > 1 && <label className="flex items-center gap-1.5 text-xs font-medium" title="Items limited to other companies are hidden unless this is ticked">
          <input type="checkbox" checked={allCos} onChange={(e) => setAllCos(e.target.checked)} /> All companies' items</label>}
        <span className="ml-auto text-sm text-black/55">{products.size} products · {match?.length} variants · stock value <Money v={value} className="font-semibold text-ink" /></span>
      </div>
      <div className="card">
        <Table rows={rows} onRow={(r) => (r._p ? toggle(r._p.key) : setDetail(r))} rowClass={(i) => cx(i._p && 'bg-paper/60', i._child && 'bg-white', !i._p && i.stock <= 0 && 'bg-red-50/60')} columns={[
          { k: 'image', label: '', w: 48, r: (i) => { const src = i._p ? i._p.variants.find((v) => v.image)?.image : i.image;
            return src ? <img src={src} alt="" className="h-9 w-9 rounded-lg bg-white object-contain" /> : <div className="h-9 w-9 rounded-lg bg-black/5" aria-hidden />; } },
          { k: 'name', label: 'Item', r: (i) => i._p
            ? <div className="flex items-center gap-2"><span className="w-3 text-black/40" aria-hidden>{open.has(i._p.key) || q ? '▾' : '▸'}</span>
                <div><div className="font-semibold">{i.name}</div><div className="text-[11px] text-black/45">{i._p.variants.length} variants · {[...new Set(i._p.variants.map((v) => v.size).filter(Boolean))].join(', ') || 'flavours'}</div></div></div>
            : <div className={cx(i._child && 'pl-7')}><div className="font-medium">{i._child ? variantLabel(i) : i.name}</div><div className="text-[11px] text-black/45">{[i.sku, i.barcode, !i._child && i.category, i.location && `Rack ${i.location}`, cos.length > 1 && i.company_ids?.length && `Sold by ${i.company_ids.map(coName).filter(Boolean).join(', ')}`].filter(Boolean).join(' · ')}</div></div> },
          { k: 'hsn', label: 'HSN / GST', r: (i) => !i._p && <span className="text-xs">{i.hsn} · {i.gst_rate}%</span> },
          ...(cost ? [{ k: 'purchase_price', label: 'Cost', right: true, r: (i) => !i._p && <Money v={i.purchase_price} /> }] : []),
          { k: 'sale_price', label: 'Price', right: true, r: (i) => (i._p ? range(i.shown) : <><Money v={i.sale_price} className="font-medium" /><div className="text-[11px] text-black/40 line-through">{i.mrp}</div></>) },
          { k: 'stock', label: 'Stock', right: true, r: (i) => <Badge c={i.stock <= 0 ? 'red' : !i._p && i.stock <= (i.low_stock || 0) ? 'amber' : 'green'}>{i.stock}{i._p ? '' : ` ${i.unit || ''}`}</Badge> },
          { k: 'online', label: 'Web', r: (i) => ((i._p ? i._p.variants.some((v) => v.online) : i.online) ? <Badge c="brand">Online</Badge> : null) },
          { label: '', r: (i) => (admin || stockOk) && (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {i._p ? admin && <Btn size="sm" onClick={() => setVariants(i._p)} title="Add or change sizes and flavours of this product">Sizes & flavours</Btn> : <>
                {stockOk && <Btn size="sm" onClick={() => setAdjust(i)}>Stock ±</Btn>}
                {admin && <Btn size="sm" v="ghost" onClick={() => setEdit(i)}>Edit</Btn>}</>}
            </div>) },
        ]} />
      </div>
      {edit && <ItemForm key={edit.id || edit._product || 'new'} item={Object.keys(edit).length ? edit : null} cats={cats.data || []} products={products} companies={cos} here={branch?.company_id} cost={cost} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); items.reload(); }}
        onCopy={(i) => { setEdit(null); setVariants(products.get(groupOf(i)) || { key: groupOf(i), name: i.name, variants: [i] }); }} onBatches={(i) => { setEdit(null); setDetail(i); }} />}
      {variants && <VariantsEditor cost={cost} product={variants} onClose={() => setVariants(null)} onSaved={() => { setVariants(null); items.reload(); }} />}
      {adjust && <AdjustForm item={adjust} branches={(boot?.branches || []).filter((b) => b.id !== branch?.id)} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); items.reload(); }} />}
      {detail && <ItemDetail item={detail} admin={admin} stockOk={stockOk} siblings={products.get(groupOf(detail))?.variants || []} onOpen={setDetail} onClose={() => setDetail(null)} onChanged={items.reload}
        onVariants={() => { setDetail(null); setVariants(products.get(groupOf(detail)) || { key: groupOf(detail), name: detail.name, variants: [detail] }); }} />}
      {catMgr && <Categories list={cats} onClose={() => setCatMgr(false)} />}
      {finder && <FindVariants items={items.data || []} onClose={() => setFinder(false)} onSaved={() => { setFinder(false); items.reload(); }} />}
    </SectionPage>
  );
}

// item without an id = a new item; with _product it's a new variant of that product (product details already filled in).
// Typing a new item's name offers to join a matching product as a variant. "Product" moves a variant between products.
function ItemForm({ item, cats, products, companies = [], here, cost = true, onClose, onSaved, onCopy, onBatches }) {
  const [f, set, bind, setF] = useForm(item || { name: '', brand: '', category_id: cats[0]?.id, flavour: '', size: '', sku: '', barcode: '', hsn: '2106', gst_rate: 18,
    mrp: '', sale_price: '', purchase_price: '', low_stock: 3, unit: 'pcs', online: false, featured: false, goals: [], description: '', image: '',
    company_ids: companies.length > 1 && here ? [here] : [] }); // website fields: Online Store → Products. A new item belongs to this company when there are several
  const [dismissed, setDismissed] = useState(false);
  // New item only: opening stock with its batch / expiry, and the testing report, saved right after the item.
  const [st, setSt] = useState({ qty: '', batch_no: '', expiry: '', kind: 'lab', url: '', file: '', valid_until: '' });
  const [busy, setBusy] = useState(false);
  const setS = (k, v) => setSt((x) => ({ ...x, [k]: v }));
  const pickReport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try { const r = await upload(file); setSt((x) => ({ ...x, url: r.url, file: file.name })); toast('Report uploaded'); } catch (err) { fail(err); } finally { setBusy(false); e.target.value = ''; }
  };
  const own = f.group_key && products.get(f.group_key);
  const sameAs = !f.id && !f.group_key && !dismissed ? similar(f.name, f.brand, products) : [];
  const joinProduct = (p) => setF((x) => ({ ...variantDraft(p, x.name), mrp: x.mrp, sale_price: x.sale_price, purchase_price: x.purchase_price, barcode: x.barcode, sku: x.sku }));
  const byName = new Map([...products.values()].map((p) => [p.name, p]));
  const submit = async (e) => {
    e.preventDefault();
    const name = f.name || [f.brand, f.size, f.flavour].filter(Boolean).join(' ');
    const group_key = f.group_key || slugify(name.replace(f.size || '', '').replace(f.flavour || '', ''));
    const num = (k) => (f[k] === '' || f[k] == null ? null : +f[k]);
    const { _product, ...row } = f;
    if (!f.id && st.expiry && st.expiry < new Date().toISOString().slice(0, 10)) return toast('That batch has already expired: check the expiry date', 'err');
    if (!f.id && (st.batch_no || st.expiry) && !(+st.qty > 0)) return toast('Enter the opening quantity for this batch', 'err');
    try {
      const saved = await api('/t/items', { ...row, name, group_key, slug: f.slug || slugify(`${group_key} ${f.flavour} ${f.size}`) + (f.id ? '' : '-' + Math.random().toString(36).slice(2, 6)),
        mrp: num('mrp'), sale_price: num('sale_price'), purchase_price: num('purchase_price'), gst_rate: num('gst_rate') || 0, low_stock: num('low_stock'), refill_days: num('refill_days'), wholesale_price: num('wholesale_price'), wholesale_min_qty: num('wholesale_min_qty'),
        barcode: f.barcode || null, company_ids: f.company_ids?.length ? f.company_ids : null });
      if (!f.id && +st.qty > 0) await api('/stock/adjust', { item_id: saved.id, qty: +st.qty, batch_no: st.batch_no.trim(), expiry: st.expiry, note: 'Opening stock' });
      if (!f.id && st.url) await api('/t/certificates', { item_id: saved.id, kind: st.kind, title: CERT_KINDS[st.kind] + (st.batch_no ? ` – batch ${st.batch_no.trim()}` : ''),
        batch_no: st.batch_no.trim() || null, url: st.url, valid_until: st.valid_until || null });
      toast(f._product ? `Variant added to ${f._product}` : 'Item saved'); onSaved();
    } catch (e) { fail(e); }
  };
  const pickPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try { const r = await upload(file); set('image', r.url); toast('Photo added'); } catch (err) { fail(err); } finally { setBusy(false); e.target.value = ''; }
  };
  return (
    <Modal wide title={item?.id ? 'Edit item' : f._product ? `New variant of ${f._product}` : 'New item'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-4 gap-3">
        <Sec title="The product">
          {/* photo: shown when billing, in the item list and on the website */}
          <div className="row-span-2 flex flex-col gap-2">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-line bg-paper">
              {f.image ? <img src={f.image} alt="" className="h-full w-full object-contain" /> : <span className="px-2 text-center text-xs text-black/40">No photo yet</span>}
            </div>
            <label className={cx('cursor-pointer rounded-full border border-line px-3 py-1.5 text-center text-xs font-semibold hover:border-ink', busy && 'opacity-50')}>
              {f.image ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" capture="environment" onChange={pickPhoto} disabled={busy} className="sr-only" />
            </label>
            {f.image && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => set('image', '')}>Remove photo</button>}
          </div>
          <Field label="Item name" {...bind('name')} required autoFocus className="col-span-3" hint="As on the pack, e.g. Optimum Nutrition Gold Standard 100% Whey 2 lb Double Rich Chocolate" />
          {sameAs.length > 0 && (
            <div className="col-span-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm" role="status">
              {sameAs.map((p) => (
                <div key={p.key} className="flex flex-wrap items-center gap-2 py-0.5">
                  <span className="min-w-0 flex-1">Looks like another size or flavour of <b>{p.name}</b> <span className="text-black/55">({p.variants.map(variantLabel).slice(0, 4).join(', ')}{p.variants.length > 4 ? '…' : ''})</span></span>
                  <Btn size="sm" v="primary" onClick={() => joinProduct(p)}>Add as a variant</Btn>
                </div>
              ))}
              <button type="button" className="mt-1 text-xs text-black/50 hover:text-ink" onClick={() => setDismissed(true)}>No, it’s a different product</button>
            </div>
          )}
          <Field label="Brand" {...bind('brand')} placeholder="Optimum Nutrition" />
          <Field label="Category"><select className="input" {...bind('category_id')}>{catOptions(cats).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
          <Field label="Photo link (optional)" value={f.image || ''} onChange={(e) => set('image', e.target.value)} placeholder="https://… or use Add photo" />
        </Sec>

        {companies.length > 1 && <Sec title="Sold by" hint="Which companies sell this item. Untick all to sell it in every company. Each branch still keeps its own stock.">
          <div className="col-span-full flex flex-wrap gap-2">{companies.map((c) => { const on = (f.company_ids || []).includes(c.id); return (
            <button key={c.id} type="button" role="checkbox" aria-checked={on} onClick={() => set('company_ids', on ? f.company_ids.filter((x) => x !== c.id) : [...(f.company_ids || []), c.id])}
              className={cx('rounded-full border px-3.5 py-1.5 text-sm font-medium', on ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>{on ? '✓ ' : ''}{c.name}</button>); })}
            {!f.company_ids?.length && <span className="self-center text-xs text-black/50">Every company</span>}
          </div>
        </Sec>}

        <Sec title="Size & flavour" hint="Selling the same product in more than one size or flavour? Each one is a separate item (own price, barcode, stock and batches) linked to one product, so the website shows a single page with size / flavour buttons.">
          <Field label="Size / weight" {...bind('size')} placeholder="1 kg, 2 lb, 60 caps" />
          <Field label="Flavour" {...bind('flavour')} placeholder="Chocolate" />
          <Field label="Part of product" className="col-span-2" hint={own ? `Other sizes / flavours: ${own.variants.filter((v) => v.id !== f.id).map(variantLabel).join(', ') || 'none yet'}` : 'Leave empty if this is the only size / flavour. Start typing to link it to an existing product.'}>
            <input className="input" list="item-products" value={own?.name || ''} placeholder="Only size / flavour (new product)"
              onChange={(e) => { const p = byName.get(e.target.value); set('group_key', p ? p.key : e.target.value ? f.group_key : null); }} />
            <datalist id="item-products">{[...products.values()].map((p) => <option key={p.key} value={p.name} />)}</datalist>
          </Field>
        </Sec>

        <Sec title="Price & GST">
          <Field label="MRP (printed on pack)" {...bind('mrp')} inputMode="decimal" placeholder="₹" />
          <Field label="Selling price (incl. GST)" {...bind('sale_price')} required inputMode="decimal" placeholder="₹" hint="What the customer pays" />
          {cost && <Field label="Cost price (excl. GST)" {...bind('purchase_price')} inputMode="decimal" placeholder="₹" hint="What you pay the supplier. Used for profit" />}
          <Field label="GST rate"><select className="input" {...bind('gst_rate')}>{[0, 5, 12, 18, 28, 40].map((r) => <option key={r} value={r}>{r}%</option>)}</select></Field>
          <Field label="HSN code" {...bind('hsn')} hint="Tax code on the bill. Supplements: 2106" />
          <Field label="Bulk price (incl. GST)" {...bind('wholesale_price')} inputMode="decimal" placeholder="₹" hint="For gyms and resellers" />
          <Field label="Bulk price from quantity" {...bind('wholesale_min_qty')} inputMode="decimal" placeholder="e.g. 5" hint="Bulk price applies by itself at this quantity" />
        </Sec>

        <Sec title="Codes & shelf">
          <Field label="Barcode" {...bind('barcode')} hint="Click here and scan the pack" />
          <Field label="Your item code (SKU)" {...bind('sku')} hint="Optional short code" />
          <Field label="Shelf / rack" {...bind('location')} placeholder="A2-top" hint="Shown while billing" />
          <Field label="Model no." {...bind('model')} />
          <Field label="Warn me when stock falls to" {...bind('low_stock')} inputMode="decimal" hint="Shows in Reorder soon" />
          <Field label="One pack lasts (days)" {...bind('refill_days')} inputMode="numeric" placeholder="e.g. 45" hint="For refill reminders to customers" />
        </Sec>

        {!f.id ? (<>
          <Sec title="Opening stock, batch & expiry" hint="Optional. Stock you already have of this item. Later stock comes in through purchase bills or Stock ±.">
            <Field label="Quantity in hand" value={st.qty} onChange={(e) => setS('qty', e.target.value)} inputMode="decimal" placeholder="0" />
            <Field label="Batch number (on the pack)" value={st.batch_no} onChange={(e) => setS('batch_no', e.target.value)} placeholder="B23-0412" />
            <Field label="Expiry date (on the pack)" type="date" value={st.expiry} onChange={(e) => setS('expiry', e.target.value)} hint="Earliest expiry is sold first" />
          </Sec>
          <Sec title="Lab / testing report" hint="Optional. Proof the product is genuine and tested. It shows on the product's page on the website.">
            <Field label="What is it"><select className="input" value={st.kind} onChange={(e) => setS('kind', e.target.value)}>{Object.entries(CERT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Upload the PDF or a photo">
              <label className={cx('flex cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-black/25 px-3 py-2 text-xs font-semibold hover:border-ink', busy && 'opacity-50')}>
                {st.file ? `✓ ${st.file}` : 'Choose file'}<input type="file" accept="application/pdf,image/*" onChange={pickReport} disabled={busy} className="sr-only" />
              </label>
            </Field>
            <Field label="…or paste a link" value={st.file ? '' : st.url} disabled={!!st.file} placeholder="https://…" onChange={(e) => setS('url', e.target.value)} />
            <Field label="Report valid until" type="date" value={st.valid_until} onChange={(e) => setS('valid_until', e.target.value)} hint="Optional. You get a reminder before it lapses" />
          </Sec>
        </>) : (
          <div className="col-span-4 flex flex-wrap items-center gap-3 rounded-xl bg-paper p-3 text-sm">
            <span className="flex-1">Batches, expiry dates and lab reports of this item</span>
            <Btn size="sm" onClick={() => onBatches(item)}>Open batches & reports →</Btn>
          </div>
        )}
        <p className="col-span-4 text-xs text-black/50">{f.online ? 'Shown on the website.' : 'Not on the website.'} Website description and publishing: <a href="#/online/products" className="font-semibold text-brand-d hover:underline">Online Store → Products</a>.</p>
        <div className="col-span-4 flex flex-wrap justify-end gap-2">
          {item?.id && <DeleteBtn what={item.name} onDelete={() => api('/t/items/' + item.id, null, 'DELETE').then(() => { toast('Item deleted'); onSaved(); }, fail)} />}
          {item?.id && <Btn onClick={() => onCopy(item)} title="See and edit every size and flavour of this product in one table">Sizes & flavours</Btn>}
          <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Save item'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

// One titled box of the item form.
const Sec = ({ title, hint, children }) => (
  <fieldset className="col-span-4 grid grid-cols-2 gap-3 rounded-xl border border-line p-3 md:grid-cols-4">
    <legend className="px-1 text-sm font-semibold">{title}</legend>
    {hint && <p className="col-span-full -mt-1 text-xs text-black/50">{hint}</p>}
    {children}
  </fieldset>
);

function AdjustForm({ item, branches, onClose, onSaved }) {
  const [f, , bind] = useForm({ dir: 'add', qty: '', batch_no: '', expiry: '', note: '' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const to_branch = f.dir.startsWith('to:') ? f.dir.slice(3) : undefined;
      await api('/stock/adjust', { item_id: item.id, qty: (f.dir === 'remove' ? -1 : 1) * +f.qty, batch_no: f.batch_no, expiry: f.expiry, to_branch,
        note: f.note || (to_branch ? undefined : f.dir === 'add' ? 'Opening / found' : 'Damaged / expired') });
      toast(to_branch ? 'Stock transferred' : 'Stock updated'); onSaved();
    } catch (e) { fail(e); }
  };
  return (
    <Modal title={`Adjust stock · ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="What happened"><select className="input" {...bind('dir')}><option value="add">Add stock (found / opening)</option><option value="remove">Remove stock (damaged / expired / lost)</option>
          {branches.map((b) => <option key={b.id} value={'to:' + b.id}>Transfer to {b.name}</option>)}</select></Field>
        <Field label={`Quantity (now ${item.stock})`} {...bind('qty')} required autoFocus inputMode="decimal" />
        <Field label="Batch number (optional)" {...bind('batch_no')} hint="As printed on the pack" />
        <Field label="Expiry date (optional)" {...bind('expiry', 'date')} />
        <Field label="Reason (optional)" {...bind('note')} className="col-span-2" />
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Update stock</Btn></div>
      </form>
    </Modal>
  );
}

function ItemDetail({ item, admin, stockOk, siblings, onOpen, onClose, onChanged, onVariants }) {
  const b = useApi(`/items/${item.id}/batches`);
  const m = useApi(`/items/${item.id}/movements`);
  const certs = useApi('/t/certificates');
  const mine = (certs.data || []).filter((c) => c.item_id === item.id);
  const today_ = new Date().toLocaleDateString('en-CA');
  const forBatch = (batch) => mine.filter((c) => !c.batch_no || c.batch_no === batch);
  return (
    <Modal wide title={item.name} onClose={onClose}>
      {siblings.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs font-semibold text-black/50">Variants:</span>
          {siblings.map((v) => <button key={v.id} onClick={() => onOpen(v)} aria-current={v.id === item.id ? 'true' : undefined}
            className={cx('rounded-full border px-3 py-1 text-xs font-medium', v.id === item.id ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>{variantLabel(v)} · {v.stock}</button>)}
          {admin && <Btn size="sm" v="ghost" onClick={onVariants}>Edit sizes & flavours</Btn>}
        </div>
      )}
      {siblings.length <= 1 && admin && <div className="mb-4"><Btn size="sm" onClick={onVariants}>+ Add another size / flavour</Btn></div>}
      <h3 className="text-sm font-semibold">Batches in stock</h3>
      <p className="mb-1 text-xs text-black/50">The earliest expiry is sold first; expired packs are never billed. New batches come in with purchase bills or Stock ±.</p>
      <Table rows={b.data} empty="No batch stock" columns={[
        { k: 'batch_no', label: 'Batch', r: (r) => r.batch_no || '—' },
        { k: 'expiry', label: 'Expiry', r: (r) => !r.expiry ? '—' : r.expiry < today_ ? <Badge c="red">Expired {r.expiry}</Badge>
          : <span className={r.expiry < new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10) ? 'font-medium text-red-600' : ''}>{r.expiry}</span> },
        { k: 'qty', label: 'Qty', right: true },
        { label: 'Certificates', r: (r) => forBatch(r.batch_no).length ? forBatch(r.batch_no).map((c) => <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="mr-2 text-xs font-semibold text-brand-d hover:underline">{c.title}</a>) : <span className="text-xs text-black/35">none</span> },
      ]} />
      <Certificates item={item} batches={b.data || []} list={mine} admin={admin} reload={certs.reload} />
      <h3 className="mb-1 mt-5 text-sm font-semibold">Stock history</h3>
      <div className="max-h-72 overflow-auto">
        <Table rows={m.data} columns={[
          { k: 'created_at', label: 'When', r: (r) => new Date(r.created_at).toLocaleString('en-IN') },
          { k: 'ref_type', label: 'Type', r: (r) => <Badge>{r.ref_type}</Badge> },
          { k: 'invoice_no', label: 'Ref', r: (r) => r.invoice_no || r.note },
          { k: 'batch_no', label: 'Batch' },
          { k: 'qty', label: 'Qty', right: true, r: (r) => <span className={r.qty < 0 ? 'text-red-600' : 'text-emerald-700'}>{r.qty > 0 ? '+' : ''}{r.qty}</span> },
          ...(stockOk ? [{ label: '', r: (r) => r.ref_type === 'adjust' && <button className="text-xs text-red-600 hover:underline" title="Typed by mistake? Remove this correction"
            onClick={() => confirm(`Undo this stock correction (${r.qty > 0 ? '+' : ''}${r.qty})?`) && api(`/stock/movements/${r.id}/undo`, {}).then(() => { toast('Correction undone'); m.reload(); b.reload(); onChanged(); }, fail)}>Undo</button> }] : []),
        ]} />
      </div>
    </Modal>
  );
}

function Categories({ list, onClose }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const tops = catOptions(list.data).filter((c) => !c.depth);
  const [edit, setEdit] = useState(null);
  const add = async (e) => {
    e.preventDefault();
    try {
      await api('/t/categories', { name, slug: slugify(name), parent_id: parent || null, sort: list.data?.length || 0 });
      setName(''); list.reload();
    } catch (e) { fail(e); }
  };
  return (
    <Modal title="Categories" onClose={onClose}>
      <form onSubmit={add} className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" required />
        <select className="input" value={parent} onChange={(e) => setParent(e.target.value)} aria-label="Parent category">
          <option value="">Top level</option>
          {tops.map((c) => <option key={c.id} value={c.id}>Inside {c.name}</option>)}
        </select>
        <Btn v="primary" type="submit">Add</Btn>
      </form>
      <ul className="max-h-[60vh] divide-y divide-black/5 overflow-y-auto text-sm">
        {catOptions(list.data).map((c) => (
          <li key={c.id} className={cx('flex items-center gap-2 py-2', c.depth ? 'pl-5 text-black/70' : 'font-medium')}><span className="flex-1">{c.name}</span>
            <button className="text-xs font-semibold text-brand-d hover:underline" onClick={() => setEdit(c)}>Rename / move</button>
            <button className="text-xs text-red-600 hover:underline" onClick={() => confirm(`Delete ${c.name}?`) && api(`/t/categories/${c.id}`, null, 'DELETE').then(list.reload, fail)}>Delete</button>
          </li>
        ))}
      </ul>
      {edit && <CategoryForm c={edit} tops={tops.filter((t) => t.id !== edit.id)} onClose={() => setEdit(null)}
        onSave={(row) => api('/t/categories', row).then(() => { setEdit(null); list.reload(); toast('Category saved'); }, fail)} />}
    </Modal>
  );
}

// Lab reports, COA, FSSAI licence, import / authenticity papers for this variant, for one batch or all. A link or an uploaded PDF / photo.
// Current ones show on the product's website page (Quality & certificates).
const CERT_KINDS = { lab: 'Lab test report', coa: 'Certificate of analysis (COA)', fssai: 'FSSAI licence', import: 'Import / authenticity papers', other: 'Other' };
function Certificates({ item, batches, list, admin, reload }) {
  const [f, set, bind, setF] = useForm({ kind: 'lab', title: '', batch_no: '', url: '', valid_until: '' });
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try { const r = await upload(file); setF((x) => ({ ...x, url: r.url, title: x.title || file.name.replace(/\.[^.]+$/, '') })); toast('File uploaded'); } catch (err) { fail(err); } finally { setBusy(false); e.target.value = ''; }
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      await api('/t/certificates', { ...f, item_id: item.id, title: f.title || CERT_KINDS[f.kind], batch_no: f.batch_no || null, valid_until: f.valid_until || null });
      toast('Certificate added'); setF({ kind: 'lab', title: '', batch_no: '', url: '', valid_until: '' }); reload();
    } catch (err) { fail(err); }
  };
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">Lab reports &amp; certificates</h3>
      <p className="mb-1 text-xs text-black/50">Shown on the product's website page so customers can see it is genuine and tested.</p>
      <Table rows={list} empty="None yet. Add the lab report or COA from the supplier so customers can see it on the website." columns={[
        { k: 'title', label: 'Document', r: (c) => <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-brand-d hover:underline">{c.title}</a> },
        { k: 'kind', label: 'Type', r: (c) => CERT_KINDS[c.kind] || c.kind },
        { k: 'batch_no', label: 'Batch', r: (c) => c.batch_no || 'All batches' },
        { k: 'valid_until', label: 'Valid until', r: (c) => c.valid_until || '—' },
        { k: 'url', label: 'Where', r: (c) => (c.url.startsWith('/files/') ? <span className="text-xs text-amber-700" title="Uploaded while cloud sync was off: not on the website yet">this PC only</span> : <span className="text-xs text-black/45">online</span>) },
        ...(admin ? [{ label: '', r: (c) => <button className="text-xs text-red-600 hover:underline" onClick={() => confirm(`Delete ${c.title}?`) && api('/t/certificates/' + c.id, null, 'DELETE').then(reload, fail)}>Delete</button> }] : []),
      ]} />
      <form onSubmit={save} className="mt-3 grid gap-2 rounded-xl bg-paper p-3 sm:grid-cols-6">
        <Field label="What is it" className="sm:col-span-2"><select className="input" {...bind('kind')}>{Object.entries(CERT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Name shown to customers" {...bind('title')} className="sm:col-span-2" placeholder="Lab report – batch B23" />
        <Field label="For batch" className="sm:col-span-2"><select className="input" {...bind('batch_no')}><option value="">Every batch</option>{batches.filter((x) => x.batch_no).map((x) => <option key={x.batch_no} value={x.batch_no}>{x.batch_no}{x.expiry ? ` (exp ${x.expiry})` : ''}</option>)}</select></Field>
        <Field label="Upload the PDF or a photo" className="sm:col-span-2">
          <label className={cx('flex cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-black/25 bg-white px-3 py-2 text-xs font-semibold hover:border-ink', busy && 'opacity-50')}>
            {f.url ? '✓ File ready' : 'Choose file'}<input type="file" accept="application/pdf,image/*" onChange={pick} disabled={busy} className="sr-only" /></label>
        </Field>
        <Field label="…or paste a link" {...bind('url')} className="sm:col-span-2" placeholder="https://…" />
        <Field label="Valid until (optional)" {...bind('valid_until', 'date')} className="sm:col-span-2" />
        <div className="flex items-end sm:col-span-6"><Btn v="primary" type="submit" disabled={busy || !f.url}>{busy ? 'Uploading…' : 'Add certificate'}</Btn></div>
      </form>
    </section>
  );
}

// Every size / flavour of one product in a table: change prices and codes in place, add a new one by copying the row above.
// Product details (brand, category, GST, HSN, photo, description, website) come from the product, so a new size only needs what differs.
const vNum = (v) => (v === '' || v == null ? null : +v);
function VariantsEditor({ product, cost = true, onClose, onSaved }) {
  const base = product.variants[0];
  const [pname, setPname] = useState(product.name);
  const [rows, setRows] = useState(() => product.variants.map((v) => ({ id: v.id, size: v.size || '', flavour: v.flavour || '', mrp: v.mrp ?? '', sale_price: v.sale_price ?? '',
    purchase_price: v.purchase_price ?? '', barcode: v.barcode || '', sku: v.sku || '', stock: v.stock })));
  const [busy, setBusy] = useState(false);
  const setR = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  // a new row starts as a copy of the last one: same prices, empty size / flavour / codes
  const add = () => setRows((rs) => { const l = rs.at(-1) || {}; return [...rs, { size: '', flavour: '', mrp: l.mrp ?? '', sale_price: l.sale_price ?? '', purchase_price: l.purchase_price ?? '', barcode: '', sku: '', qty: '', batch_no: '', expiry: '' }]; });
  const drop = (i) => setRows((rs) => rs.filter((_, j) => j !== i));
  const label = (r) => [r.size, r.flavour].filter(Boolean).join(' ').trim().toLowerCase();
  const save = async () => {
    const fresh = rows.filter((r) => !r.id);
    if (fresh.some((r) => !r.size.trim() && !r.flavour.trim())) return toast('Each new row needs a size or a flavour', 'err');
    if (rows.some((r) => !(+r.sale_price > 0))) return toast('Every size / flavour needs a selling price', 'err');
    const seen = rows.map(label);
    if (seen.some((l, i) => l && seen.indexOf(l) !== i)) return toast(`“${rows[seen.findIndex((l, i) => seen.indexOf(l) !== i)].size} ${rows[seen.findIndex((l, i) => seen.indexOf(l) !== i)].flavour}” is listed twice`, 'err');
    if (fresh.some((r) => r.expiry && r.expiry < new Date().toLocaleDateString('en-CA'))) return toast('An expiry date is already past', 'err');
    const shared = { brand: base.brand, category_id: base.category_id, hsn: base.hsn, gst_rate: base.gst_rate, unit: base.unit || 'pcs', online: base.online, goals: base.goals || [],
      description: base.description || null, image: base.image || null, low_stock: base.low_stock ?? 3, refill_days: base.refill_days ?? null, location: base.location || null,
      wholesale_price: null, wholesale_min_qty: null, company_ids: base.company_ids || null }; // bulk price differs per size: set it on the item
    const codes = (r) => ({ size: r.size.trim() || null, flavour: r.flavour.trim() || null, mrp: vNum(r.mrp), sale_price: vNum(r.sale_price), purchase_price: vNum(r.purchase_price),
      barcode: r.barcode.trim() || null, sku: r.sku.trim() || null, group_key: product.key });
    setBusy(true);
    try {
      const saved = await api('/t/items/bulk', { rows: rows.map((r) => (r.id ? { id: r.id, ...codes(r) } : {
        ...shared, ...codes(r), name: [pname.trim(), r.size.trim(), r.flavour.trim()].filter(Boolean).join(' '),
        slug: slugify(`${product.key} ${r.flavour} ${r.size}`) + '-' + Math.random().toString(36).slice(2, 6) })) });
      // opening stock of the new ones, with their batch / expiry
      for (const [i, r] of rows.entries()) if (!r.id && +r.qty > 0)
        await api('/stock/adjust', { item_id: saved[i].id, qty: +r.qty, batch_no: r.batch_no.trim(), expiry: r.expiry, note: 'Opening stock' });
      toast(fresh.length ? `${fresh.length} new size / flavour${fresh.length > 1 ? 's' : ''} added` : 'Sizes & flavours saved'); onSaved();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const inp = (i, k, extra = {}) => <input className="input !px-2 !py-1.5 text-sm" value={rows[i][k]} onChange={(e) => setR(i, k, e.target.value)} aria-label={k} {...extra} />;
  const anyNew = rows.some((r) => !r.id);
  return (
    <Modal wide title={`Sizes & flavours · ${product.name}`} onClose={onClose} footer={<><span className="mr-auto text-xs text-black/50">Brand, category, GST, photo and description are copied from the product.</span>
      <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      {anyNew && <Field label="Product name (new items are named “product + size + flavour”)" value={pname} onChange={(e) => setPname(e.target.value)} className="mb-3 max-w-xl" />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead><tr className="text-left text-xs text-black/50">
            {['Size / weight', 'Flavour', 'MRP', 'Selling price', ...(cost ? ['Cost price'] : []), 'Barcode', anyNew ? 'Opening stock · batch · expiry' : 'In stock', ''].map((h) => <th key={h} className="px-1 pb-1.5 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.id || 'n' + i} className={cx('border-t border-line align-top', !r.id && 'bg-brand/5')}>
              <td className="w-32 p-1">{inp(i, 'size', { placeholder: 'e.g. 1 kg', autoFocus: !r.id && i === rows.length - 1 })}</td>
              <td className="w-36 p-1">{inp(i, 'flavour', { placeholder: 'optional' })}</td>
              <td className="w-24 p-1">{inp(i, 'mrp', { inputMode: 'decimal', placeholder: '₹' })}</td>
              <td className="w-24 p-1">{inp(i, 'sale_price', { inputMode: 'decimal', placeholder: '₹' })}</td>
              {cost && <td className="w-24 p-1">{inp(i, 'purchase_price', { inputMode: 'decimal', placeholder: '₹' })}</td>}
              <td className="w-36 p-1">{inp(i, 'barcode', { placeholder: 'Scan' })}</td>
              <td className="p-1">{r.id ? <span className="inline-block pt-2 tabular-nums text-black/60">{r.stock}</span> : (
                <div className="flex gap-1">
                  <input className="input w-16 !px-2 !py-1.5 text-sm" value={r.qty} onChange={(e) => setR(i, 'qty', e.target.value)} inputMode="decimal" placeholder="Qty" aria-label="Opening quantity" />
                  <input className="input w-24 !px-2 !py-1.5 text-sm" value={r.batch_no} onChange={(e) => setR(i, 'batch_no', e.target.value)} placeholder="Batch" aria-label="Batch number" />
                  <input type="date" className="input w-36 !px-2 !py-1.5 text-sm" value={r.expiry} onChange={(e) => setR(i, 'expiry', e.target.value)} aria-label="Expiry date" />
                </div>)}</td>
              <td className="w-8 p-1 text-right">{!r.id && <button type="button" onClick={() => drop(i)} className="px-1 pt-2 text-black/40 hover:text-red-600" aria-label="Remove this row">✕</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Btn className="mt-3" onClick={add}>+ Add size / flavour</Btn>
      <p className="mt-2 text-xs text-black/50">A new row copies the prices of the row above; change what differs. Lab reports and more batches: open the item after saving.</p>
    </Modal>
  );
}

// Existing items that are sizes / flavours of one product (worked out from their names), grouped only after the owner confirms.
// Each variant keeps its own stock, batches, prices and barcode; the website then shows one product with size / flavour buttons.
function FindVariants({ items, onClose, onSaved }) {
  const groups = useMemo(() => findVariantGroups(items), [items]);
  const [skip, setSkip] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const chosen = groups.filter((g) => !skip.has(g.key));
  const save = async () => {
    setBusy(true);
    try {
      await api('/t/items/bulk', { rows: chosen.flatMap((g) => g.items.map((i) => ({ id: i.id, group_key: g.key, size: i.size || null, flavour: i.flavour || null }))) });
      toast(`${chosen.length} products grouped`); onSaved();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Modal wide title="Find variants" onClose={onClose} footer={<><span className="mr-auto text-xs text-black/50">Untick anything that isn’t the same product. Nothing changes until you press Group.</span>
      <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" onClick={save} disabled={busy || !chosen.length}>Group {chosen.length} product{chosen.length === 1 ? '' : 's'}</Btn></>}>
      {!groups.length ? <p className="py-10 text-center text-sm text-black/50">No ungrouped variants found. New items offer “Add as a variant” when their name matches a product.</p> : (
        <ul className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {groups.map((g) => {
            const seen = new Map(g.items.map((i) => [`${i.size}|${i.flavour}`, 0]));
            for (const i of g.items) seen.set(`${i.size}|${i.flavour}`, seen.get(`${i.size}|${i.flavour}`) + 1);
            return (
              <li key={g.key} className={cx('rounded-xl border p-3', skip.has(g.key) ? 'border-line opacity-50' : 'border-brand/40 bg-brand/5')}>
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={!skip.has(g.key)} onChange={() => setSkip((x) => { const n = new Set(x); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })} />
                  {g.name} <span className="text-xs font-normal text-black/50">{g.items.length} variants</span>
                </label>
                <table className="mt-2 w-full text-xs">
                  <tbody>{g.items.map((i) => (
                    <tr key={i.id} className="border-t border-line">
                      <td className="w-48 py-1 font-medium">{[i.size, i.flavour].filter(Boolean).join(' · ') || <span className="text-black/40">no size / flavour</span>}</td>
                      <td className="py-1 text-black/60">{i.name}</td>
                      <td className="py-1 text-right">{seen.get(`${i.size}|${i.flavour}`) > 1 && <Badge c="amber">looks like a duplicate</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

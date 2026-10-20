import { useMemo, useState } from 'react';
import { GOALS, slugify } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Page, Table, Badge, useForm, cx } from '../ui.jsx';

// Categories as a tree: each top-level category followed by its subcategories.
export function catOptions(cats) {
  cats ||= []; // null while loading
  const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);
  return cats.filter((c) => !c.parent_id).sort(bySort).flatMap((top) => [
    { ...top, label: top.name, depth: 0 },
    ...cats.filter((c) => c.parent_id === top.id).sort(bySort).map((c) => ({ ...c, label: `${top.name} › ${c.name}`, depth: 1 })),
  ]);
}

export default function Items({ user }) {
  const items = useApi('/items');
  const cats = useApi('/t/categories');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [detail, setDetail] = useState(null);
  const [catMgr, setCatMgr] = useState(false);
  const admin = user.role === 'admin';

  const rows = useMemo(() => items.data?.filter((i) =>
    (!cat || i.category_id === cat || cats.data?.find((c) => c.id === i.category_id)?.parent_id === cat) &&
    (filter !== 'low' || i.stock <= (i.low_stock || 0)) &&
    (filter !== 'online' || i.online) &&
    `${i.name} ${i.sku} ${i.barcode} ${i.brand}`.toLowerCase().includes(q.toLowerCase())), [items.data, q, cat, filter]);
  const value = rows?.reduce((s, i) => s + Math.max(i.stock, 0) * (i.purchase_price || 0), 0) || 0;

  return (
    <Page title="Inventory" actions={<>
      <Btn onClick={() => downloadCsv('items', rows?.map(({ goals, description, ...r }) => r))}>Export</Btn>
      {admin && <Btn onClick={() => setCatMgr(true)}>Categories</Btn>}
      {admin && <Btn v="primary" onClick={() => setEdit({})}>+ Add item</Btn>}
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search name, SKU, barcode, brand" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <select className="input max-w-48" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {catOptions(cats.data).map((c) => <option key={c.id} value={c.id}>{c.depth ? '   ' + c.name : c.name}</option>)}
        </select>
        {[['', 'All'], ['low', 'Low stock'], ['online', 'Sold online']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cx('rounded-full px-3 py-1 text-xs font-medium', filter === k ? 'bg-ink text-white' : 'bg-black/5')}>{l}</button>
        ))}
        <span className="ml-auto text-sm text-black/55">{rows?.length} items · stock value <Money v={value} className="font-semibold text-ink" /></span>
      </div>
      <div className="card">
        <Table rows={rows} onRow={setDetail} rowClass={(i) => i.stock <= 0 && 'bg-red-50/60'} columns={[
          { k: 'name', label: 'Item', r: (i) => <div><div className="font-medium">{i.name}</div><div className="text-[11px] text-black/45">{i.sku} · {i.category}</div></div> },
          { k: 'hsn', label: 'HSN / GST', r: (i) => <span className="text-xs">{i.hsn} · {i.gst_rate}%</span> },
          { k: 'purchase_price', label: 'Cost', right: true, r: (i) => <Money v={i.purchase_price} /> },
          { k: 'sale_price', label: 'Price', right: true, r: (i) => <><Money v={i.sale_price} className="font-medium" /><div className="text-[11px] text-black/40 line-through">{i.mrp}</div></> },
          { k: 'stock', label: 'Stock', right: true, r: (i) => <Badge c={i.stock <= 0 ? 'red' : i.stock <= (i.low_stock || 0) ? 'amber' : 'green'}>{i.stock} {i.unit}</Badge> },
          { k: 'online', label: 'Web', r: (i) => (i.online ? <Badge c="brand">Online</Badge> : null) },
          { label: '', r: (i) => admin && (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Btn size="sm" onClick={() => setAdjust(i)}>Stock ±</Btn>
              <Btn size="sm" v="ghost" onClick={() => setEdit(i)}>Edit</Btn>
            </div>) },
        ]} />
      </div>
      {edit && <ItemForm item={edit.id ? edit : null} cats={cats.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); items.reload(); }} />}
      {adjust && <AdjustForm item={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); items.reload(); }} />}
      {detail && <ItemDetail item={detail} onClose={() => setDetail(null)} />}
      {catMgr && <Categories list={cats} onClose={() => setCatMgr(false)} />}
    </Page>
  );
}

function ItemForm({ item, cats, onClose, onSaved }) {
  const [f, set, bind] = useForm(item || { name: '', brand: '', category_id: cats[0]?.id, flavour: '', size: '', sku: '', barcode: '', hsn: '2106', gst_rate: 18,
    mrp: '', sale_price: '', purchase_price: '', low_stock: 3, unit: 'pcs', online: true, featured: false, goals: [], description: '', image: '' });
  const toggleGoal = (g) => set('goals', (f.goals || []).includes(g) ? f.goals.filter((x) => x !== g) : [...(f.goals || []), g]);
  const submit = async (e) => {
    e.preventDefault();
    const name = f.name || [f.brand, f.size, f.flavour].filter(Boolean).join(' ');
    const group_key = f.group_key || slugify(name.replace(f.size || '', '').replace(f.flavour || '', ''));
    const num = (k) => (f[k] === '' || f[k] == null ? null : +f[k]);
    try {
      await api('/t/items', { ...f, name, group_key, slug: f.slug || slugify(`${group_key} ${f.flavour} ${f.size}`),
        mrp: num('mrp'), sale_price: num('sale_price'), purchase_price: num('purchase_price'), gst_rate: num('gst_rate') || 0, low_stock: num('low_stock'),
        barcode: f.barcode || null });
      toast('Item saved'); onSaved();
    } catch (e) { fail(e); }
  };
  return (
    <Modal wide title={item ? 'Edit item' : 'New item'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-4 gap-3">
        <Field label="Item name" {...bind('name')} required autoFocus className="col-span-4" hint="e.g. Optimum Nutrition Gold Standard 100% Whey 2 lb Double Rich Chocolate" />
        <Field label="Brand" {...bind('brand')} />
        <Field label="Category"><select className="input" {...bind('category_id')}>{catOptions(cats).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Flavour / variant" {...bind('flavour')} />
        <Field label="Size" {...bind('size')} />
        <Field label="SKU" {...bind('sku')} />
        <Field label="Barcode" {...bind('barcode')} hint="Scan into this box" />
        <Field label="HSN" {...bind('hsn')} />
        <Field label="GST %"><select className="input" {...bind('gst_rate')}>{[0, 5, 12, 18, 28, 40].map((r) => <option key={r} value={r}>{r}%</option>)}</select></Field>
        <Field label="MRP" {...bind('mrp')} inputMode="decimal" />
        <Field label="Sale price (incl. GST)" {...bind('sale_price')} required inputMode="decimal" />
        <Field label="Purchase price (excl. GST)" {...bind('purchase_price')} inputMode="decimal" />
        <Field label="Low stock alert at" {...bind('low_stock')} inputMode="decimal" />
        <Field label="Product group (website variants)" {...bind('group_key')} className="col-span-2" hint="Items sharing this key show as flavour/size options of one product" />
        <Field label="Image URL" {...bind('image')} className="col-span-2" />
        <Field label="Description (website)" className="col-span-4"><textarea className="input" rows={3} {...bind('description')} /></Field>
        <div className="col-span-4 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input {...bind('online', 'checkbox')} /> Sell on website</label>
          <label className="flex items-center gap-2"><input {...bind('featured', 'checkbox')} /> Featured</label>
          <span className="text-black/45">Goals:</span>
          {Object.entries(GOALS).map(([g, l]) => (
            <button type="button" key={g} onClick={() => toggleGoal(g)} className={cx('rounded-full px-2.5 py-0.5 text-xs', f.goals?.includes(g) ? 'bg-brand' : 'bg-black/5')}>{l}</button>
          ))}
        </div>
        <div className="col-span-4 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save item</Btn></div>
      </form>
    </Modal>
  );
}

function AdjustForm({ item, onClose, onSaved }) {
  const [f, , bind] = useForm({ dir: 'add', qty: '', batch_no: '', expiry: '', note: '' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/stock/adjust', { item_id: item.id, qty: (f.dir === 'add' ? 1 : -1) * +f.qty, batch_no: f.batch_no, expiry: f.expiry, note: f.note || (f.dir === 'add' ? 'Opening / found' : 'Damaged / expired') });
      toast('Stock updated'); onSaved();
    } catch (e) { fail(e); }
  };
  return (
    <Modal title={`Adjust stock · ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Type"><select className="input" {...bind('dir')}><option value="add">Add stock</option><option value="remove">Reduce stock</option></select></Field>
        <Field label={`Quantity (now ${item.stock})`} {...bind('qty')} required autoFocus inputMode="decimal" />
        <Field label="Batch no." {...bind('batch_no')} />
        <Field label="Expiry" {...bind('expiry', 'date')} />
        <Field label="Reason" {...bind('note')} className="col-span-2" />
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Update stock</Btn></div>
      </form>
    </Modal>
  );
}

function ItemDetail({ item, onClose }) {
  const b = useApi(`/items/${item.id}/batches`);
  const m = useApi(`/items/${item.id}/movements`);
  return (
    <Modal wide title={item.name} onClose={onClose}>
      <h3 className="mb-1 text-sm font-semibold">Batches (FEFO order)</h3>
      <Table rows={b.data} empty="No batch stock" columns={[
        { k: 'batch_no', label: 'Batch', r: (r) => r.batch_no || '—' },
        { k: 'expiry', label: 'Expiry', r: (r) => <span className={r.expiry && r.expiry < new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10) ? 'font-medium text-red-600' : ''}>{r.expiry || '—'}</span> },
        { k: 'qty', label: 'Qty', right: true },
      ]} />
      <h3 className="mb-1 mt-5 text-sm font-semibold">Stock history</h3>
      <div className="max-h-72 overflow-auto">
        <Table rows={m.data} columns={[
          { k: 'created_at', label: 'When', r: (r) => new Date(r.created_at).toLocaleString('en-IN') },
          { k: 'ref_type', label: 'Type', r: (r) => <Badge>{r.ref_type}</Badge> },
          { k: 'invoice_no', label: 'Ref', r: (r) => r.invoice_no || r.note },
          { k: 'batch_no', label: 'Batch' },
          { k: 'qty', label: 'Qty', right: true, r: (r) => <span className={r.qty < 0 ? 'text-red-600' : 'text-emerald-700'}>{r.qty > 0 ? '+' : ''}{r.qty}</span> },
        ]} />
      </div>
    </Modal>
  );
}

function Categories({ list, onClose }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const tops = catOptions(list.data).filter((c) => !c.depth);
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
          <li key={c.id} className={cx('flex items-center justify-between py-2', c.depth ? 'pl-5 text-black/70' : 'font-medium')}>{c.name}
            <button className="text-xs text-red-600 hover:underline" onClick={() => confirm(`Delete ${c.name}?`) && api(`/t/categories/${c.id}`, null, 'DELETE').then(list.reload, fail)}>Delete</button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

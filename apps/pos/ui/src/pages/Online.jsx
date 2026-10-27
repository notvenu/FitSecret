// Online Store mode: everything about the website in one full-screen section, like POS mode.
// Orders, products shown on the site, categories, coupons, customers, banners and store rules (shipping / COD / open-closed).
// Store rules live in the online branch's settings.store (synced); Postgres place_order enforces them (migration 0004).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ORDER_LABEL, GOALS, inr, today, slugify, round2 } from '@fitsecret/shared';
import { code128Svg } from '@fitsecret/shared/barcode';
import { storeSettings, checkCoupon, couponDiscount, customersFromOrders } from '@fitsecret/shared/store';
import { expiryNote, EXPIRY_DEFAULTS } from '@fitsecret/shared/offers';
import { api, useApi, toast, fail, go, downloadCsv } from '../api.js';
import { Btn, Field, Modal, Money, Table, Badge, Loading, DeleteBtn, SideNav, SectionPage, useForm, cx } from '../ui.jsx';
import { Logo, Icon, SyncPill } from '../App.jsx';
import { can } from '@fitsecret/shared/permissions';
import Orders, { ORDER_C } from './Orders.jsx';
import { catOptions } from './Items.jsx';

const I = {
  dash: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z', orders: 'M6 2l-3 4v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0',
  products: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8', cats: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  offers: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01', customers: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  banners: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6', settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  web: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z',
};
const NAV = [
  ['', 'Dashboard', I.dash], ['orders', 'Orders', I.orders], ['inbox', 'Inbox', I.inbox], ['products', 'Products', I.products, true], ['categories', 'Categories', I.cats, true],
  ['offers', 'Offers & combos', I.offers], ['customers', 'Customers', I.customers], ['banners', 'Banners', I.banners, true],
  ['settings', 'Store settings', I.settings, true],
];
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA');
const day = (ts) => new Date(ts).toLocaleDateString('en-CA');

export default function OnlineMode({ boot, route, reload, sync }) {
  const admin = boot.user.role === 'admin';
  // owners see everything; others what their login allows (offers need 'offers', customers the customer list)
  const okNav = ([k, , , a]) => (admin || !a) && can(boot.user, { offers: 'offers', customers: 'parties' }[k]);
  const sec = NAV.find((n) => n[0] === (route.parts[1] || '') && okNav(n)) ? route.parts[1] || '' : '';
  const ob = boot.branches?.find((b) => b.is_online && !b.deleted) || boot.branch; // branch that fulfils website orders
  const store = storeSettings(ob);
  const orders = useApi('/orders');
  const inbox = useApi('/t/feedback');
  const unread = inbox.data?.filter((f) => f.status === 'new').length ?? 0;
  const seen = useRef(null);
  useEffect(() => { localStorage.setItem('fs_mode', 'online'); }, []);
  // New website orders arrive with cloud sync; refresh and call them out.
  useEffect(() => { const t = setInterval(() => { orders.reload(); inbox.reload(); }, 20000); return () => clearInterval(t); }, []);
  const fresh = orders.data?.filter((o) => o.status === 'placed').length ?? 0;
  useEffect(() => {
    if (seen.current != null && fresh > seen.current) toast(`🛒 ${fresh - seen.current} new website order${fresh - seen.current > 1 ? 's' : ''}`);
    if (orders.data) seen.current = fresh;
  }, [fresh]);
  const saveStore = async (patch, msg = 'Saved') => {
    try { await api('/t/branches', { id: ob.id, settings: { ...ob.settings, store: { ...ob.settings?.store, ...patch } } }); toast(msg); reload(); } catch (e) { fail(e); }
  };
  const exit = () => { localStorage.removeItem('fs_mode'); go('/'); };
  const props = { boot, admin, ob, store, saveStore, orders, inbox, reload, route };

  return (
    <div className="flex h-screen">
      <aside className="no-print flex w-64 shrink-0 flex-col bg-ink text-white/85">
        <div className="px-5 pb-4 pt-5">
          <div className="display text-2xl text-white">Online Store</div>
          <button onClick={() => admin && saveStore({ open: !store.open }, store.open ? 'Website orders paused' : 'Website is taking orders')}
            className={cx('mt-2 flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold', store.open ? 'bg-brand text-ink' : 'bg-red-500 text-white')}
            title={admin ? 'Click to pause / resume website orders' : ''}>
            <span className={cx('h-2 w-2 rounded-full', store.open ? 'bg-ink animate-pulse' : 'bg-white')} />{store.open ? 'Live · taking orders' : 'Paused'}
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 text-[15.5px]">
          {NAV.filter(okNav).map(([k, l, ic]) => (
            <a key={k} href={'#/online' + (k ? '/' + k : '')}
              className={cx('flex items-center gap-3.5 rounded-xl px-3.5 py-[clamp(0.55rem,1.9vh,1.05rem)] transition-colors', sec === k ? 'bg-brand font-semibold text-ink' : 'hover:bg-ink-2')}>
              <Icon d={ic} className="h-[22px] w-[22px]" /><span className="flex-1">{l}</span>
              {k === 'orders' && fresh > 0 && <span className="rounded-full bg-red-500 px-2 text-xs font-bold text-white">{fresh}</span>}
              {k === 'inbox' && unread > 0 && <span className={cx('rounded-full px-2 text-xs font-bold', sec === k ? 'bg-ink text-white' : 'bg-white/20 text-white')}>{unread}</span>}
            </a>
          ))}
        </nav>
        {/* the website only sees changes once they reach the cloud */}
        <SyncPill s={sync} />
        <div className="space-y-1 p-2">
          {store.site_url && <a href={store.site_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3.5 py-2 text-sm hover:bg-ink-2"><Icon d={I.web} /> View website ↗</a>}
          <button onClick={exit} className="w-full rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">Exit online mode</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="no-print flex items-center gap-3 border-b border-line bg-white px-5 py-2.5 text-sm">
          <Logo className="h-7" />
          <span className="text-black/50">Fulfilled from <b className="text-ink">{ob?.name}</b></span>
          <Btn size="sm" className="ml-auto" onClick={() => api('/sync/now', {}).then(orders.reload, fail)}>↻ Fetch new orders</Btn>
        </header>
        {{
          '': <Dashboard {...props} />, orders: <Orders boot={boot} list={orders} siteUrl={store.site_url} />, inbox: <Inbox {...props} />, products: <Products {...props} />, categories: <Categories />,
          offers: <Offers {...props} />, customers: <Customers {...props} />, banners: <Banners {...props} />, settings: <StoreSettings {...props} />,
        }[sec]}
      </main>
    </div>
  );
}

// nav: a side list of sub-sections (same as Reports / Settings); without it, a plain page.
const Wrap = ({ title, actions, children, nav, hint }) => (nav ? <SectionPage nav={nav} title={title} hint={hint} actions={actions}>{children}</SectionPage> : (
  <div className="rise mx-auto max-w-[1400px] p-5 lg:p-7">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="display text-3xl">{title}</h1><div className="flex flex-wrap gap-2">{actions}</div></div>
    {children}
  </div>
));
const Stat = ({ label, v, sub, tone }) => (
  <div className="card p-4"><div className="text-xs text-black/50">{label}</div><div className={cx('mt-1 text-2xl font-bold tabular-nums', tone)}>{v}</div>{sub && <div className="text-xs text-black/45">{sub}</div>}</div>
);

// ---------- Dashboard ----------
function Dashboard({ orders, store, inbox }) {
  const items = useApi('/items');
  if (!orders.data) return <Loading />;
  const os = orders.data, live = os.filter((o) => !['cancelled', 'pending_payment'].includes(o.status));
  const t = today(), month = t.slice(0, 7);
  const todays = live.filter((o) => day(o.created_at) === t), monthly = live.filter((o) => day(o.created_at).startsWith(month));
  const rev = (a) => round2(a.reduce((s, o) => s + o.total, 0));
  const count = (...st) => os.filter((o) => st.includes(o.status)).length;
  const days = [...Array(14)].map((_, i) => daysAgo(13 - i)).map((d) => ({ d, v: rev(live.filter((o) => day(o.created_at) === d)) }));
  const max = Math.max(1, ...days.map((x) => x.v));
  const top = Object.values(monthly.flatMap((o) => o.lines).reduce((m, l) => { const x = (m[l.item_id] ??= { name: l.name, qty: 0, total: 0 }); x.qty += l.qty; x.total += l.total; return m; }, {}))
    .sort((a, b) => b.total - a.total).slice(0, 6);
  const coupons = Object.values(monthly.filter((o) => o.coupon).reduce((m, o) => { const x = (m[o.coupon] ??= { code: o.coupon, uses: 0, discount: 0 }); x.uses++; x.discount += o.discount; return m; }, {}));
  const web = items.data?.filter((i) => i.online) || [];
  const since30 = live.filter((o) => day(o.created_at) >= daysAgo(30)), all30 = os.filter((o) => day(o.created_at) >= daysAgo(30));
  const split = ['cod', 'online'].map((m) => { const x = since30.filter((o) => o.payment_method === m); return { m, n: x.length, v: rev(x) }; });
  const cities = Object.entries(since30.reduce((m, o) => { const c = (o.address?.city || '—').trim(); m[c] = (m[c] || 0) + o.total; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const cancelRate = all30.length ? Math.round((all30.filter((o) => o.status === 'cancelled').length / all30.length) * 100) : 0;
  const repeat = (() => { const c = {}; for (const o of live) c[o.phone] = (c[o.phone] || 0) + 1; const v = Object.values(c); return v.length ? Math.round((v.filter((n) => n > 1).length / v.length) * 100) : 0; })();
  const fb = inbox?.data || [];
  const lowWeb = web.filter((i) => i.stock > 0 && i.stock <= (i.low_stock || 0)).sort((a, b) => a.stock - b.stock).slice(0, 6);
  const refunds = os.filter((o) => o.payment_status === 'refund_pending');
  const health = [
    ['On website', web.length, ''], ['Out of stock on website', web.filter((i) => i.stock <= 0).length, 'products?f=oos'],
    ['No photo', web.filter((i) => !i.image).length, 'products?f=noimg'], ['No description', web.filter((i) => !i.description).length, 'products?f=nodesc'],
    ['In stock but hidden', (items.data || []).filter((i) => !i.online && i.stock > 0).length, 'products?f=hidden'],
  ];
  return (
    <Wrap title="Dashboard">
      {!store.open && <div className="mb-4 rounded-[14px] bg-red-50 p-3 text-sm text-red-800">Website orders are <b>paused</b>. Customers can browse but not order. Resume from the switch in the sidebar.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Today" v={inr(rev(todays))} sub={`${todays.length} order${todays.length === 1 ? '' : 's'}`} />
        <Stat label="This month" v={inr(rev(monthly))} sub={`${monthly.length} order${monthly.length === 1 ? '' : 's'}`} />
        <Stat label="Average order" v={inr(monthly.length ? rev(monthly) / monthly.length : 0)} sub="this month" />
        <Stat label="To pack & ship" v={count('placed', 'confirmed', 'packed')} sub={`${count('placed')} new`} tone={count('placed') ? 'text-red-600' : ''} />
        <Stat label="In transit" v={count('shipped', 'out_for_delivery')} />
        <Stat label="Awaiting payment" v={count('pending_payment')} sub="online payment not finished" />
      </div>
      {(refunds.length > 0 || fb.some((f) => f.status === 'new')) && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {refunds.length > 0 && <a href="#/online/orders" className="rounded-full bg-red-50 px-4 py-2 font-medium text-red-800">💸 {refunds.length} refund{refunds.length > 1 ? 's' : ''} to process</a>}
          {[['review', 'review', 'to approve'], ['message', 'message', 'to answer'], ['restock', 'back-in-stock request', 'waiting']].map(([k, l, s]) => {
            const n = fb.filter((f) => f.kind === k && f.status === 'new').length;
            return n > 0 && <a key={k} href={'#/online/inbox?tab=' + k} className="rounded-full bg-amber-50 px-4 py-2 font-medium text-amber-900">{n} {l}{n > 1 ? 's' : ''} {s}</a>;
          })}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {split.map((x) => <Stat key={x.m} label={x.m === 'cod' ? 'Cash on delivery (30 days)' : 'Paid online (30 days)'} v={inr(x.v)} sub={`${x.n} orders · ${since30.length ? Math.round((x.n / since30.length) * 100) : 0}%`} />)}
        <Stat label="Cancelled (30 days)" v={cancelRate + '%'} tone={cancelRate > 15 ? 'text-red-600' : ''} />
        <Stat label="Repeat customers" v={repeat + '%'} sub="ordered more than once" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Website sales, last 14 days</h2>
          <div className="flex h-44 items-end gap-1.5">
            {days.map((x) => (
              <div key={x.d} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${x.d}: ${inr(x.v)}`}>
                <div className="w-full rounded-t-md bg-brand transition-all group-hover:bg-brand-d" style={{ height: `${Math.max(2, (x.v / max) * 100)}%` }} />
                <span className="text-[10px] text-black/40">{x.d.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Catalogue health</h2>
          <ul className="divide-y divide-line text-sm">
            {health.map(([l, n, h]) => (
              <li key={l} className="flex justify-between py-2">{h && n ? <a href={'#/online/' + h} className="hover:underline">{l}</a> : <span>{l}</span>}
                <b className={cx(h && n ? 'text-amber-700' : '')}>{items.data ? n : '…'}</b></li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-1">
          <h2 className="mb-3 font-semibold">Top products this month</h2>
          {top.length ? <ol className="space-y-2 text-sm">{top.map((p) => <li key={p.name} className="flex justify-between gap-3"><span className="truncate">{p.qty} × {p.name}</span><Money v={p.total} /></li>)}</ol>
            : <p className="text-sm text-black/45">No website sales yet this month.</p>}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Coupons this month</h2>
          {coupons.length ? <ul className="space-y-2 text-sm">{coupons.map((c) => <li key={c.code} className="flex justify-between"><span className="font-mono">{c.code} · {c.uses} uses</span><span className="text-black/60">−{inr(c.discount)}</span></li>)}</ul>
            : <p className="text-sm text-black/45">No coupons used. <a className="font-semibold text-brand-d hover:underline" href="#/online/offers">Create an offer →</a></p>}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Top cities (30 days)</h2>
          {cities.length ? <ol className="space-y-2 text-sm">{cities.map(([c, v]) => <li key={c} className="flex justify-between"><span>{c}</span><Money v={v} /></li>)}</ol> : <p className="text-sm text-black/45">No orders yet.</p>}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Running low on the website</h2>
          {lowWeb.length ? <ul className="space-y-2 text-sm">{lowWeb.map((i) => <li key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.name}</span><Badge c="amber">{i.stock} left</Badge></li>)}</ul>
            : <p className="text-sm text-black/45">Nothing below its low-stock level.</p>}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Latest orders</h2>
          <ul className="space-y-2 text-sm">
            {os.slice(0, 6).map((o) => <li key={o.id} className="flex items-center justify-between gap-2"><span className="truncate"><span className="font-mono text-xs">{o.order_no}</span> {o.name}</span>
              <span className="flex items-center gap-2"><Badge c={ORDER_C[o.status]}>{ORDER_LABEL[o.status]}</Badge><Money v={o.total} /></span></li>)}
          </ul>
          <a href="#/online/orders" className="mt-3 inline-block text-sm font-semibold text-brand-d hover:underline">All orders →</a>
        </section>
      </div>
    </Wrap>
  );
}

// ---------- Products ----------
const FILTERS = [['', 'All'], ['web', 'On website'], ['hidden', 'Hidden'], ['featured', 'Featured'], ['oos', 'Out of stock'], ['noimg', 'No photo'], ['nodesc', 'No description']];
const FILTER_FN = {
  web: (i) => i.online, hidden: (i) => !i.online, featured: (i) => i.featured, oos: (i) => i.online && i.stock <= 0,
  noimg: (i) => i.online && !i.image, nodesc: (i) => i.online && !i.description,
};
function Products({ boot, ob }) {
  const items = useApi('/items');
  const cats = useApi('/t/categories');
  const [f, setF] = useState(new URLSearchParams(location.hash.split('?')[1]).get('f') || '');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sel, setSel] = useState(new Set());
  const [edit, setEdit] = useState(null);
  const rows = useMemo(() => items.data?.filter((i) => (!f || FILTER_FN[f](i)) && (!cat || i.category_id === cat || cats.data?.find((c) => c.id === i.category_id)?.parent_id === cat)
    && `${i.name} ${i.brand} ${i.sku} ${i.barcode}`.toLowerCase().includes(q.toLowerCase())), [items.data, f, q, cat, cats.data]);
  const patch = async (i, p) => { try { await api('/t/items', { id: i.id, ...p }); items.reload(); } catch (e) { fail(e); } };
  const bulk = async (p, label) => {
    try { await api('/t/items/bulk', { rows: [...sel].map((id) => ({ id, ...p })) }); toast(`${sel.size} products ${label}`); setSel(new Set()); items.reload(); } catch (e) { fail(e); }
  };
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = rows?.length > 0 && rows.every((i) => sel.has(i.id));
  return (
    <Wrap title={cat ? cats.data?.find((c) => c.id === cat)?.name : FILTERS.find(([k]) => k === f)?.[1] === 'All' ? 'All products' : FILTERS.find(([k]) => k === f)?.[1]}
      nav={<SideNav title="Products" value={cat ? 'c:' + cat : f || 'all'} onChange={(k) => { if (k.startsWith('c:')) { setCat(k.slice(2)); setF(''); } else { setCat(''); setF(k === 'all' ? '' : k); } }}
        groups={[{ items: FILTERS.map(([k, l]) => ({ key: k || 'all', label: k ? l : 'All products', badge: items.data ? (k ? items.data.filter(FILTER_FN[k]).length : items.data.length) : undefined })) },
          { label: 'Categories', items: catOptions(cats.data).map((c) => ({ key: 'c:' + c.id, label: c.name, indent: c.depth > 0 })) }]} />}
      hint="What shows on the website: publish, hide or feature products in bulk, and fill in photos and descriptions."
      actions={<Btn onClick={() => downloadCsv('website-products', rows?.map(({ goals, description, ...r }) => r))}>Export</Btn>}>
      {ob?.id !== boot.branch?.id && <p className="mb-3 rounded-[14px] bg-amber-50 p-3 text-sm text-amber-900">Stock shown is this counter's ({boot.branch?.name}). Website stock comes from {ob?.name}.</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search name, brand, SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {sel.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] bg-ink px-4 py-2 text-sm text-white">
          <b>{sel.size} selected</b>
          <Btn size="sm" v="brand" onClick={() => bulk({ online: true }, 'published')}>Publish on website</Btn>
          <Btn size="sm" className="!border-white/30 !text-white" onClick={() => bulk({ online: false }, 'hidden')}>Hide</Btn>
          <Btn size="sm" className="!border-white/30 !text-white" onClick={() => bulk({ featured: true }, 'featured')}>Feature</Btn>
          <Btn size="sm" className="!border-white/30 !text-white" onClick={() => bulk({ featured: false }, 'unfeatured')}>Unfeature</Btn>
          <button className="ml-auto text-white/70 hover:text-white" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <div className="card">
        <Table rows={rows?.slice(0, 400)} onRow={setEdit} columns={[
          { k: 'sel', label: <input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.map((i) => i.id)))} onClick={(e) => e.stopPropagation()} />,
            w: 36, r: (i) => <input type="checkbox" aria-label={'Select ' + i.name} checked={sel.has(i.id)} onChange={() => toggleSel(i.id)} onClick={(e) => e.stopPropagation()} /> },
          { k: 'image', label: '', w: 56, r: (i) => (i.image ? <img src={i.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded-lg bg-black/5 text-[10px] text-black/40">no photo</div>) },
          { k: 'name', label: 'Product', r: (i) => <div><div className="font-medium">{i.name}</div><div className="text-[11px] text-black/45">{[i.brand, i.category, i.group_key && `group ${i.group_key}`].filter(Boolean).join(' · ')}</div></div> },
          { k: 'sale_price', label: 'Price', right: true, r: (i) => <><Money v={i.sale_price} className="font-medium" />{i.mrp > i.sale_price && <div className="text-[11px] text-black/40"><s>{i.mrp}</s> · {Math.round((1 - i.sale_price / i.mrp) * 100)}% off</div>}</> },
          { k: 'stock', label: 'Stock', right: true, r: (i) => <Badge c={i.stock <= 0 ? 'red' : i.stock <= (i.low_stock || 0) ? 'amber' : 'green'}>{i.stock}</Badge> },
          { k: 'online', label: 'Website', r: (i) => <Switch on={i.online} onChange={(v) => patch(i, { online: v })} label="On website" /> },
          { k: 'featured', label: 'Featured', r: (i) => <Switch on={i.featured} onChange={(v) => patch(i, { featured: v })} label="Featured" /> },
        ]} />
        {rows?.length > 400 && <p className="p-3 text-center text-xs text-black/45">Showing 400 of {rows.length}. Search or filter to narrow down.</p>}
      </div>
      {edit && <ProductEditor item={edit} cats={cats.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); items.reload(); }} />}
    </Wrap>
  );
}

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={cx('relative h-6 w-11 rounded-full transition-colors', on ? 'bg-brand-d' : 'bg-black/15')}>
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

// Website fields of an item. Price / stock / tax are edited in Items like before.
function ProductEditor({ item, cats, onClose, onSaved }) {
  const [f, set, bind] = useForm({ ...item, goals: item.goals || [] });
  const submit = async (e) => {
    e.preventDefault();
    const num = (k) => (f[k] === '' || f[k] == null ? null : +f[k]);
    try {
      await api('/t/items', { id: item.id, name: f.name, brand: f.brand || null, category_id: f.category_id, flavour: f.flavour || null, size: f.size || null,
        group_key: f.group_key || slugify(f.name), sale_price: num('sale_price'), mrp: num('mrp'), image: f.image || null, description: f.description || null,
        goals: f.goals, online: !!f.online, featured: !!f.featured });
      toast('Product saved'); onSaved();
    } catch (e) { fail(e); }
  };
  const goal = (g) => set('goals', f.goals.includes(g) ? f.goals.filter((x) => x !== g) : [...f.goals, g]);
  return (
    <Modal wide title="Website product" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <div className="grid aspect-square place-items-center overflow-hidden rounded-[14px] bg-paper">
            {f.image ? <img src={f.image} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-black/40">No photo</span>}
          </div>
          <Field label="Photo URL" {...bind('image')} className="mt-2" hint="Paste an image link (https://…)" />
          <div className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2"><input {...bind('online', 'checkbox')} /> Show on website</label>
            <label className="flex items-center gap-2"><input {...bind('featured', 'checkbox')} /> Featured on home page</label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 content-start">
          <Field label="Name shown on website" {...bind('name')} required className="col-span-2" />
          <Field label="Brand" {...bind('brand')} />
          <Field label="Category"><select className="input" {...bind('category_id')}>{catOptions(cats).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
          <Field label="Flavour / variant" {...bind('flavour')} />
          <Field label="Size" {...bind('size')} />
          <Field label="Price (incl. GST)" {...bind('sale_price')} inputMode="decimal" required />
          <Field label="MRP" {...bind('mrp')} inputMode="decimal" hint={f.mrp > f.sale_price ? `Shows ${Math.round((1 - f.sale_price / f.mrp) * 100)}% off` : 'Higher than price shows a discount'} />
          <Field label="Product group (variants)" {...bind('group_key')} className="col-span-2" hint="Items with the same group show as one product with flavour/size options" />
          <Field label="Description" className="col-span-2"><textarea className="input" rows={5} {...bind('description')} /></Field>
          <div className="col-span-2 flex flex-wrap items-center gap-2 text-sm"><span className="text-black/50">Goals:</span>
            {Object.entries(GOALS).map(([g, l]) => <button type="button" key={g} onClick={() => goal(g)} className={cx('rounded-full px-2.5 py-0.5 text-xs', f.goals.includes(g) ? 'bg-brand' : 'bg-black/5')}>{l}</button>)}
          </div>
          <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save product</Btn></div>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Categories ----------
function Categories() {
  const list = useApi('/t/categories');
  const items = useApi('/items');
  const [f, set, bind, setF] = useForm({ name: '', parent_id: '', image: '' });
  const [edit, setEdit] = useState(null);
  const tree = catOptions(list.data);
  const count = (c) => (items.data || []).filter((i) => i.category_id === c.id || list.data?.find((x) => x.id === i.category_id)?.parent_id === c.id);
  const save = async (row) => { try { await api('/t/categories', row); list.reload(); } catch (e) { fail(e); } };
  const add = async (e) => {
    e.preventDefault();
    await save({ name: f.name.trim(), slug: slugify(f.name), parent_id: f.parent_id || null, image: f.image || null, sort: (list.data?.length || 0) + 1 });
    setF({ name: '', parent_id: '', image: '' });
  };
  // swap sort with the neighbour among siblings
  const move = async (c, dir) => {
    const sibs = tree.filter((x) => (x.parent_id || null) === (c.parent_id || null));
    const j = sibs.findIndex((x) => x.id === c.id) + dir;
    if (j < 0 || j >= sibs.length) return;
    const other = sibs[j], a = c.sort ?? j - dir, b = other.sort ?? j;
    try { await api('/t/categories/bulk', { rows: [{ id: c.id, sort: b === a ? b + dir : b }, { id: other.id, sort: a }] }); list.reload(); } catch (e) { fail(e); }
  };
  return (
    <Wrap title="Categories">
      <form onSubmit={add} className="card mb-4 grid gap-2 p-4 md:grid-cols-[1fr_1fr_1.4fr_auto]">
        <input className="input" placeholder="New category name" {...bind('name')} required />
        <select className="input" {...bind('parent_id')} aria-label="Parent"><option value="">Top level</option>{tree.filter((c) => !c.depth).map((c) => <option key={c.id} value={c.id}>Inside {c.name}</option>)}</select>
        <input className="input" placeholder="Image URL (optional)" {...bind('image')} />
        <Btn v="primary" type="submit">Add category</Btn>
      </form>
      <p className="mb-2 text-xs text-black/50">Order here is the order on the website menu and home page. Images show on the home page category tiles.</p>
      <div className="card divide-y divide-line">
        {!list.data ? <Loading /> : tree.map((c) => {
          const ps = count(c);
          return (
            <div key={c.id} className={cx('flex items-center gap-3 px-4 py-2.5', c.depth && 'pl-12 bg-paper/50')}>
              {c.image ? <img src={c.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-black/5" />}
              <div className="min-w-0 flex-1"><div className={cx(!c.depth && 'font-semibold')}>{c.name}</div><div className="text-[11px] text-black/45">/{c.slug} · {ps.filter((i) => i.online).length} on website of {ps.length}</div></div>
              <button className="rounded px-2 py-1 text-black/50 hover:bg-black/5" onClick={() => move(c, -1)} aria-label="Move up">↑</button>
              <button className="rounded px-2 py-1 text-black/50 hover:bg-black/5" onClick={() => move(c, 1)} aria-label="Move down">↓</button>
              <Btn size="sm" v="ghost" onClick={() => setEdit(c)}>Edit</Btn>
              <button className="text-xs text-red-600 hover:underline" onClick={() => (ps.length ? toast(`Move its ${ps.length} products first`, 'err') : confirm(`Delete ${c.name}?`) && api(`/t/categories/${c.id}`, null, 'DELETE').then(list.reload, fail))}>Delete</button>
            </div>
          );
        })}
      </div>
      {edit && <CategoryForm c={edit} tops={tree.filter((x) => !x.depth && x.id !== edit.id)} onClose={() => setEdit(null)} onSave={async (row) => { await save(row); setEdit(null); }} />}
    </Wrap>
  );
}
export function CategoryForm({ c, tops, onClose, onSave }) {
  const [f, , bind] = useForm({ name: c.name, slug: c.slug, image: c.image || '', parent_id: c.parent_id || '' });
  return (
    <Modal title={'Edit ' + c.name} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ id: c.id, name: f.name.trim(), slug: slugify(f.slug || f.name), image: f.image || null, parent_id: f.parent_id || null }); }} className="grid gap-3">
        <Field label="Name" {...bind('name')} required />
        <Field label="Web address" {...bind('slug')} hint="Changing it breaks old links to this category" />
        <Field label="Parent"><select className="input" {...bind('parent_id')}><option value="">Top level</option>{tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Image URL" {...bind('image')} />
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Offers ----------
const offerText = (c) => `${c.kind === 'percent' ? `${c.value}% off` : `₹${c.value} off`}${c.max_discount ? ` up to ₹${c.max_discount}` : ''}${c.min_order ? ` on ₹${c.min_order}+` : ''}`;
// Offers: coupons (typed at checkout), combos (a set of items for one price, counter and website) and near-expiry offers
// (worked out per batch, switched on by a person). ?tab= coupons | combos | expiry
// base: '/online/offers' inside online mode, '/offers' from the main menu (same page, both modes).
export function Offers({ orders, admin, route, boot, base = '/online/offers' }) {
  const tab = ['coupons', 'combos', 'expiry'].includes(route?.query.tab) ? route.query.tab : admin ? 'coupons' : 'expiry';
  const nav = <SideNav title="Offers" value={tab} onChange={(t) => go(base + '?tab=' + t)} groups={[{ items: [
    ...(admin ? [{ key: 'coupons', label: 'Coupons', desc: 'Codes typed at checkout' }, { key: 'combos', label: 'Combos', desc: 'Items together for one price' }] : []),
    { key: 'expiry', label: 'Near-expiry', desc: 'Batches close to expiry' }] }]} />;
  return <>
    {tab === 'coupons' && <Coupons orders={orders} nav={nav} />}
    {tab === 'combos' && <Combos nav={nav} />}
    {tab === 'expiry' && <ExpiryOffers boot={boot} admin={admin} nav={nav} />}
  </>;
}

// Where an offer works: a three-way toggle on the form, a badge in the lists.
const CHANNEL_OPTS = [['both', 'Counter & website'], ['counter', 'Counter only'], ['online', 'Website only']];
const ChannelBadge = ({ c }) => (c && c !== 'both' ? <Badge c={c === 'counter' ? 'amber' : 'blue'}>{c === 'counter' ? 'counter only' : 'website only'}</Badge> : <Badge c="grey">counter + web</Badge>);
function ChannelToggle({ value, onChange }) {
  return (
    <div className="col-span-2">
      <div className="mb-1 text-xs font-medium text-black/60">Where it works</div>
      <div role="radiogroup" aria-label="Where it works" className="grid grid-cols-3 gap-1 rounded-full bg-black/5 p-1">
        {CHANNEL_OPTS.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={(value || 'both') === k} onClick={() => onChange(k)}
            className={cx('rounded-full px-2 py-1.5 text-xs font-semibold transition-colors', (value || 'both') === k ? 'bg-ink text-white' : 'text-black/60 hover:text-ink')}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function Coupons({ orders, nav }) {
  const list = useApi('/t/coupons');
  const [edit, setEdit] = useState(null);
  const t = today();
  const stats = (code) => {
    const os = (orders.data || []).filter((o) => o.coupon?.toUpperCase() === code && o.status !== 'cancelled');
    return { uses: os.length, discount: round2(os.reduce((s, o) => s + o.discount, 0)), revenue: round2(os.reduce((s, o) => s + o.total, 0)) };
  };
  const state = (c) => (!c.active ? ['grey', 'Off'] : c.ends && c.ends < t ? ['grey', 'Expired'] : c.starts && c.starts > t ? ['blue', 'Scheduled'] : ['green', 'Live']);
  const patch = (c, p) => api('/t/coupons', { id: c.id, ...p }).then(list.reload, fail);
  return (
    <Wrap nav={nav} title="Coupons" actions={<Btn v="primary" onClick={() => setEdit({})}>+ New coupon</Btn>}>
      <p className="mb-3 max-w-3xl text-sm text-black/55">Customers type the code at website checkout, or the cashier taps it on the bill. Every rule is checked again when the bill or order is saved.
        <b> Show on website</b> lists the code on the home page and in the top bar. To discount a single product, lower its price below MRP in Products.</p>
      <div className="card">
        <Table rows={list.data} onRow={setEdit} empty="No coupons yet. Create one like WELCOME10 for first orders." columns={[
          { k: 'code', label: 'Code', r: (c) => <span className="font-mono font-semibold">{c.code}</span> },
          { k: 'offer', label: 'Offer', r: (c) => <div>{offerText(c)}<div className="text-[11px] text-black/45">{[c.starts && `from ${c.starts}`, c.ends && `till ${c.ends}`, c.usage_limit && `${c.usage_limit} uses`, c.per_phone && `${c.per_phone}/customer`].filter(Boolean).join(' · ')}</div></div> },
          { k: 'state', label: 'Status', r: (c) => { const [col, l] = state(c); return <span className="flex flex-wrap gap-1"><Badge c={col}>{l}</Badge><ChannelBadge c={c.channel} />{c.public && c.channel !== 'counter' && <Badge c="brand">listed</Badge>}</span>; } },
          { k: 'uses', label: 'Used', right: true, r: (c) => stats(c.code).uses },
          { k: 'discount', label: 'Discount given', right: true, r: (c) => <Money v={stats(c.code).discount} /> },
          { k: 'revenue', label: 'Orders value', right: true, r: (c) => <Money v={stats(c.code).revenue} /> },
          { label: '', r: (c) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Switch on={c.active} onChange={(v) => patch(c, { active: v })} label="Active" />
            <button className="px-2 text-xs text-red-600 hover:underline" onClick={() => confirm(`Delete ${c.code}?`) && api(`/t/coupons/${c.id}`, null, 'DELETE').then(list.reload, fail)}>Delete</button>
          </div> },
        ]} />
      </div>
      {edit && <CouponForm c={edit} others={list.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </Wrap>
  );
}
function CouponForm({ c, others, onClose, onSaved }) {
  const [f, set, bind] = useForm({ code: '', kind: 'percent', value: '', min_order: '', max_discount: '', starts: '', ends: '', usage_limit: '', per_phone: '1', active: true, public: false, note: '', channel: 'both', ...c });
  const preview = (() => {
    try { const row = checkCoupon(f, others); return [500, 1000, 2500].map((s) => { try { return `₹${s} cart → saves ${inr(couponDiscount(row, s, { today: today() }))}`; } catch { return `₹${s} cart → not eligible`; } }); }
    catch (e) { return [e.message]; }
  })();
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/t/coupons', { ...f, starts: f.starts || null, ends: f.ends || null }); toast('Coupon saved'); onSaved(); } catch (e) { fail(e); }
  };
  return (
    <Modal title={c.id ? 'Edit coupon' : 'New coupon'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Code" {...bind('code')} required className="col-span-2" placeholder="DIWALI10" hint="Letters and numbers, no spaces" />
        <ChannelToggle value={f.channel} onChange={(v) => set('channel', v)} />
        <Field label="Type"><select className="input" {...bind('kind')}><option value="percent">% off</option><option value="flat">₹ off</option></select></Field>
        <Field label={f.kind === 'percent' ? 'Percent off' : 'Rupees off'} {...bind('value')} required inputMode="decimal" />
        <Field label="Minimum order (₹)" {...bind('min_order')} inputMode="decimal" />
        <Field label="Maximum discount (₹)" {...bind('max_discount')} inputMode="decimal" hint="Cap for % coupons" />
        <Field label="Starts" {...bind('starts', 'date')} />
        <Field label="Ends" {...bind('ends', 'date')} />
        <Field label="Total uses allowed" {...bind('usage_limit')} inputMode="numeric" hint="Blank = unlimited" />
        <Field label="Uses per customer" {...bind('per_phone')} inputMode="numeric" hint="By phone number. Blank = unlimited" />
        <Field label="Note (shown with the offer)" {...bind('note')} className="col-span-2" />
        <label className="flex items-center gap-2 text-sm"><input {...bind('active', 'checkbox')} /> Active</label>
        <label className="flex items-center gap-2 text-sm"><input {...bind('public', 'checkbox')} /> Show on website{f.channel === 'counter' ? ' (as “in store only”)' : ''}</label>
        <ul className="col-span-2 rounded-[10px] bg-paper p-3 text-xs text-black/60">{preview.map((p) => <li key={p}>{p}</li>)}</ul>
        <div className="col-span-2 flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save coupon</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Combos ----------
// A set of items for one price, at the counter and on the website (place_order prices it again). Never below what the items cost.
function Combos({ nav }) {
  const list = useApi('/t/offers');
  const items = useApi('/items');
  const ideas = useApi('/reports/x/combo_ideas');
  const [edit, setEdit] = useState(null);
  const byId = useMemo(() => new Map((items.data || []).map((i) => [i.id, i])), [items.data]);
  const combos = (list.data || []).filter((o) => o.kind === 'combo');
  const value = (o) => round2(o.items.reduce((s, x) => s + (byId.get(x.item_id)?.sale_price || 0) * x.qty, 0));
  const t = today();
  const state = (o) => (!o.active ? ['grey', 'Off'] : o.ends && o.ends < t ? ['grey', 'Ended'] : o.starts && o.starts > t ? ['blue', 'Scheduled'] : ['green', 'Live']);
  return (
    <Wrap nav={nav} title="Combos" actions={<Btn v="primary" onClick={() => setEdit({ kind: 'combo', items: [] })}>+ New combo</Btn>}>
      <p className="mb-3 max-w-3xl text-sm text-black/55">Bought together, the items cost the combo price. It applies by itself at the counter and on the website, and shows on each item’s product page.
        A combo can cut your margin but never go below what the items cost you.</p>
      <div className="card">
        <Table rows={combos} onRow={setEdit} empty="No combos yet. Start from an idea below." columns={[
          { k: 'name', label: 'Combo', r: (o) => <div><div className="font-semibold">{o.name}</div><div className="text-[11px] text-black/45">{o.items.map((x) => `${x.qty > 1 ? x.qty + '× ' : ''}${byId.get(x.item_id)?.name || 'Removed item'}`).join(' + ')}</div></div> },
          { k: 'price', label: 'Combo price', right: true, r: (o) => <Money v={o.price} className="font-semibold" /> },
          { k: 'value', label: 'Bought separately', right: true, r: (o) => <Money v={value(o)} className="text-black/50 line-through" /> },
          { k: 'saving', label: 'Customer saves', right: true, r: (o) => <span className="font-medium text-emerald-700">{inr(value(o) - o.price)}</span> },
          { k: 'state', label: 'Status', r: (o) => { const [c, l] = state(o); return <span className="flex flex-wrap gap-1"><Badge c={c}>{l}</Badge><ChannelBadge c={o.channel} /></span>; } },
          { label: '', r: (o) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><Switch on={o.active} onChange={(v) => api('/t/offers', { id: o.id, active: v }).then(list.reload, fail)} label="Active" /></div> },
        ]} />
      </div>
      {ideas.data?.length > 0 && <>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Ideas from what customers buy together (90 days)</h3>
        <div className="card"><Table rows={ideas.data} columns={[
          { k: 'items', label: 'Bought together' }, { k: 'bills', label: 'Bills', right: true },
          { label: '', r: (x) => <div className="flex justify-end"><Btn size="sm" onClick={() => setEdit({ kind: 'combo', name: '', items: [{ item_id: x.a, qty: 1 }, { item_id: x.b, qty: 1 }] })}>Make a combo</Btn></div> },
        ]} /></div>
      </>}
      {edit && <ComboForm o={edit} items={items.data || []} byId={byId} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </Wrap>
  );
}
function ComboForm({ o, items, byId, onClose, onSaved }) {
  const [f, set, bind] = useForm({ name: '', price: '', starts: '', ends: '', active: true, note: '', channel: 'both', ...o, items: o.items || [] });
  const [pick, setPick] = useState('');
  const costIncl = (i) => (i?.purchase_price || 0) * (1 + (i?.gst_rate || 0) / 100);
  const value = round2(f.items.reduce((s, x) => s + (byId.get(x.item_id)?.sale_price || 0) * x.qty, 0));
  const cost = round2(f.items.reduce((s, x) => s + costIncl(byId.get(x.item_id)) * x.qty, 0));
  const noCost = f.items.some((x) => !(byId.get(x.item_id)?.purchase_price > 0));
  const price = +f.price || 0; // price and cost both include GST, so (price − cost) / price is the margin
  const add = () => { const it = items.find((i) => i.name === pick); if (!it) return toast('Pick an item from the list', 'err'); if (!f.items.some((x) => x.item_id === it.id)) set('items', [...f.items, { item_id: it.id, qty: 1 }]); setPick(''); };
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/t/offers', { ...f, kind: 'combo', price: +f.price, starts: f.starts || null, ends: f.ends || null }); toast('Combo saved'); onSaved(); } catch (err) { fail(err); }
  };
  return (
    <Modal wide title={o.id ? `Edit ${o.name}` : 'New combo'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Name customers see" {...bind('name')} required autoFocus className="col-span-2" placeholder="Gym starter: Whey + Shaker" />
        <div className="col-span-2">
          <div className="mb-1 text-xs font-medium text-black/60">Items in the combo</div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {f.items.map((x, i) => { const it = byId.get(x.item_id); return (
              <li key={x.item_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{it?.name || 'Removed item'} <span className="text-xs text-black/45">{inr(it?.sale_price)} each · {it?.stock ?? 0} in stock</span></span>
                <input className="input w-16 text-center" inputMode="numeric" value={x.qty} aria-label="Quantity" onChange={(e) => set('items', f.items.map((y, j) => (j === i ? { ...y, qty: Math.max(1, +e.target.value || 1) } : y)))} />
                <button type="button" className="px-1 text-black/40 hover:text-red-600" onClick={() => set('items', f.items.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </li>); })}
            {!f.items.length && <li className="px-3 py-3 text-sm text-black/45">Add two or more items</li>}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className="input" list="combo-items" value={pick} onChange={(e) => setPick(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Type an item name, then Enter" />
            <datalist id="combo-items">{items.map((i) => <option key={i.id} value={i.name} />)}</datalist>
            <Btn onClick={add}>Add</Btn>
          </div>
        </div>
        <Field label="Combo price (incl. GST)" {...bind('price')} required inputMode="decimal" hint={`Bought separately: ${inr(value)}`} />
        <div className="self-end rounded-xl bg-paper px-3 py-2 text-sm">
          {price > 0 && value > 0 && <div>Customer saves <b className="text-emerald-700">{inr(value - price)}</b> ({Math.round(((value - price) / value) * 100)}%)</div>}
          {price > 0 && !noCost && <div className={price < cost ? 'font-semibold text-red-600' : 'text-black/60'}>{price < cost ? `Below your cost of ${inr(cost)}` : `Your margin about ${Math.round(((price - cost) / price) * 100)}% · cost ${inr(cost)}`}</div>}
          {noCost && <div className="text-xs text-amber-700">Some items have no cost price, so the margin can’t be checked.</div>}
        </div>
        <Field label="Starts" {...bind('starts', 'date')} />
        <Field label="Ends" {...bind('ends', 'date')} />
        <ChannelToggle value={f.channel} onChange={(v) => set('channel', v)} />
        <label className="col-span-2 flex items-center gap-2 text-sm"><input {...bind('active', 'checkbox')} /> Active</label>
        <div className="col-span-2 flex justify-end gap-2">
          {o.id && <DeleteBtn bin={false} what={o.name} onDelete={() => api('/t/offers/' + o.id, null, 'DELETE').then(() => { toast('Combo deleted'); onSaved(); }, fail)} />}
          <Btn onClick={onClose}>Cancel</Btn><Btn v="primary" type="submit">Save combo</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Near-expiry offers ----------
// Worked out per batch: the closer to expiry, the bigger the discount, but never below cost + the minimum margin. Nothing goes live
// until a staff member or the owner approves it; then billing applies it to that batch and prints the expiry on the bill.
function ExpiryOffers({ boot, admin, nav }) {
  const list = useApi('/reports/x/expiry_offers');
  const [pcts, setPcts] = useState({});
  const cfg = { ...EXPIRY_DEFAULTS, ...boot.branch?.settings?.expiry_offers };
  const rows = list.data || [];
  const by = (st) => rows.filter((r) => r.status === st);
  const key = (r) => `${r.item_id}|${r.batch_no}|${r.expiry}`;
  const approve = (r) => {
    const pct = +(pcts[key(r)] ?? r.pct);
    const o = { kind: 'expiry', item_id: r.item_id, batch_no: r.batch_no || null, expiry: r.expiry, discount_pct: pct, active: true, approved_by: boot.user.name };
    api('/t/offers', { ...(r.offer && { id: r.offer.id }), ...o, note: expiryNote(o) }).then(() => { toast(`${pct}% off ${r.item} is live`); list.reload(); }, fail);
  };
  const dismiss = (r) => api('/t/offers', { ...(r.offer && { id: r.offer.id }), kind: 'expiry', item_id: r.item_id, batch_no: r.batch_no || null, expiry: r.expiry, discount_pct: r.pct || 1, active: false, approved_by: boot.user.name, note: 'Dismissed' })
    .then(() => { toast('Dismissed'); list.reload(); }, fail);
  const stop = (r) => api('/t/offers', { id: r.offer.id, active: false }).then(list.reload, fail);
  const days = (r) => (r.days_left === 0 ? 'today' : `${r.days_left} days`);
  return (
    <Wrap nav={nav} title="Near-expiry offers" actions={<Btn onClick={() => window.open('#/offer-labels', '_blank', 'width=900,height=900')} disabled={!by('live').length}>Print shelf labels</Btn>}>
      <div className="mb-4 max-w-4xl rounded-xl bg-paper px-4 py-3 text-sm text-black/65">
        Suggested from each batch’s expiry: {cfg.steps.map(([d, p]) => `${p}% off within ${d} days`).join(', ')}, never below cost + {cfg.min_margin}% margin.
        Approve to switch an offer on; billing then applies it to that batch and prints <i>“Near-expiry offer · Expires DD MMM YYYY · Batch”</i> on the bill.
        The pack label and its expiry date stay as they are, and nothing is sold after its expiry date.
      </div>
      {list.loading && !list.data ? <Loading /> : <>
        <h3 className="mb-2 text-sm font-semibold">Waiting for approval · {by('suggested').length}</h3>
        <div className="card mb-6"><Table rows={by('suggested')} empty="Nothing to approve. Batches show here as they come within the window." columns={[
          { k: 'item', label: 'Item / batch', r: (r) => <div><div className="font-medium">{r.item}</div><div className="text-[11px] text-black/45">Batch {r.batch_no || '—'} · {r.qty} in stock</div></div> },
          { k: 'expiry', label: 'Expires', r: (r) => <div>{r.expiry}<div className={cx('text-[11px]', r.days_left <= 15 ? 'font-semibold text-red-600' : 'text-black/45')}>in {days(r)}</div></div> },
          { k: 'pct', label: '% off', r: (r) => <input className="input w-20 py-1 text-right" inputMode="decimal" value={pcts[key(r)] ?? r.pct} onChange={(e) => setPcts({ ...pcts, [key(r)]: e.target.value })} aria-label={`Discount for ${r.item}`} /> },
          { k: 'offer_price', label: 'Offer price', right: true, r: (r) => { const pr = Math.round(r.price * (1 - (+(pcts[key(r)] ?? r.pct) || 0) / 100)); return <div><Money v={pr} className="font-semibold" /><div className="text-[11px] text-black/40 line-through">{inr(r.price)}</div></div>; } },
          { k: 'margin_pct', label: 'Margin left', right: true, r: (r) => (r.no_cost ? <span className="text-xs text-amber-700">no cost price</span> : `${r.margin_pct}%`) },
          { k: 'recovered', label: 'Brings in', right: true, r: (r) => <div><Money v={r.recovered} /><div className="text-[11px] text-black/45">vs {inr(r.at_risk)} lost if it expires</div></div> },
          { label: '', r: (r) => <div className="flex justify-end gap-1"><Btn size="sm" v="primary" onClick={() => approve(r)}>Approve</Btn><Btn size="sm" v="ghost" onClick={() => dismiss(r)}>Dismiss</Btn></div> },
        ]} /></div>
        <h3 className="mb-2 text-sm font-semibold">Live · {by('live').length}</h3>
        <div className="card mb-6"><Table rows={by('live')} empty="No live offers." columns={[
          { k: 'item', label: 'Item / batch', r: (r) => <div><div className="font-medium">{r.item}</div><div className="text-[11px] text-black/45">Batch {r.batch_no || '—'} · {r.qty} left · approved by {r.offer?.approved_by || '—'}</div></div> },
          { k: 'expiry', label: 'Expires', r: (r) => `${r.expiry} (${days(r)})` },
          { k: 'pct', label: 'Offer', r: (r) => `${r.pct}% off · ${inr(r.offer_price)}` },
          { label: '', r: (r) => <div className="flex justify-end"><Btn size="sm" onClick={() => stop(r)}>Stop</Btn></div> },
        ]} /></div>
        {by('return').length > 0 && <>
          <h3 className="mb-2 text-sm font-semibold">Better returned to the supplier · {by('return').length}</h3>
          <div className="card mb-6"><Table rows={by('return')} columns={[
            { k: 'item', label: 'Item / batch', r: (r) => `${r.item} · ${r.batch_no || '—'}` }, { k: 'expiry', label: 'Expires' }, { k: 'qty', label: 'Qty', right: true },
            { k: 'advice', label: 'Why', r: (r) => <span className="text-xs">{r.advice}</span> },
          ]} /></div>
        </>}
        {by('expired').length > 0 && <>
          <h3 className="mb-2 text-sm font-semibold text-red-700">Expired: take off the shelf · {by('expired').length}</h3>
          <div className="card border-red-200"><Table rows={by('expired')} columns={[
            { k: 'item', label: 'Item / batch', r: (r) => `${r.item} · ${r.batch_no || '—'}` }, { k: 'expiry', label: 'Expired on' }, { k: 'qty', label: 'Qty', right: true },
            { k: 'advice', label: 'What to do', r: (r) => <span className="text-xs">{r.advice}</span> },
          ]} /></div>
        </>}
      </>}
    </Wrap>
  );
}

// Shelf labels for live near-expiry offers (print on A4 and cut). States the expiry date plainly next to the offer price.
export function OfferLabels({ branch }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/reports/x/expiry_offers').then((r) => setRows(r.filter((x) => x.status === 'live'))); }, []);
  useEffect(() => { if (rows?.length) setTimeout(() => window.print(), 200); }, [rows]);
  if (!rows) return null;
  const d = (x) => new Date(x + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="mx-auto grid max-w-[190mm] grid-cols-2 gap-3 bg-white p-4 text-black">
      <style>{'@page { size: A4; margin: 8mm; }'}</style>
      {rows.map((r) => (
        <div key={r.item_id + r.batch_no + r.expiry} className="break-inside-avoid rounded-lg border-2 border-black p-3">
          <div className="text-xs font-bold uppercase tracking-wide">Near-expiry offer · {r.pct}% off</div>
          <div className="mt-1 text-base font-semibold leading-tight">{r.item}</div>
          <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-bold">₹{r.offer_price}</span>
            <span className="text-sm line-through">₹{r.price}</span>{r.mrp > 0 && <span className="text-xs">MRP ₹{r.mrp}</span>}</div>
          <div className="mt-2 border-t border-black pt-1 text-sm font-semibold">Expires on {d(r.expiry)}</div>
          <div className="text-[11px]">Batch {r.batch_no || '—'} · Use before the expiry date · Price incl. all taxes · {branch?.name}</div>
        </div>
      ))}
      {!rows.length && <p>No live near-expiry offers.</p>}
    </div>
  );
}

// ---------- Customers ----------
function Customers({ orders }) {
  const parties = useApi('/parties');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  if (!orders.data) return <Loading />;
  const all = customersFromOrders(orders.data);
  const rows = all.filter((c) => `${c.name} ${c.phone} ${c.email} ${c.city}`.toLowerCase().includes(q.toLowerCase()));
  const party = (c) => parties.data?.find((p) => p.phone && p.phone.replace(/\D/g, '').slice(-10) === c.phone);
  const toParty = async (c) => {
    const last = orders.data.find((o) => o.phone === c.phone)?.address || {};
    try {
      await api('/t/parties', { type: 'customer', name: c.name, phone: c.phone, email: c.email || null, state_code: '37', opening_balance: 0,
        address: [last.line1, last.line2, last.city, last.pincode].filter(Boolean).join(', ') || null });
      toast(`${c.name} saved to Parties`); parties.reload();
    } catch (e) { fail(e); }
  };
  const repeat = all.filter((c) => c.orders - c.cancelled > 1).length;
  return (
    <Wrap title="Customers" actions={<Btn onClick={() => downloadCsv('website-customers', rows)}>Export</Btn>}>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Customers" v={all.length} />
        <Stat label="With an account" v={all.filter((c) => c.account).length} sub="signed in when ordering" />
        <Stat label="Repeat buyers" v={repeat} sub={all.length ? `${Math.round((repeat / all.length) * 100)}%` : ''} />
        <Stat label="Lifetime value" v={inr(all.length ? all.reduce((s, c) => s + c.spent, 0) / all.length : 0)} sub="average per customer" />
      </div>
      <input className="input mb-3 max-w-sm" placeholder="Search name, phone, email, city…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card">
        <Table rows={rows} onRow={setOpen} empty="Customers appear here after their first website order." columns={[
          { k: 'name', label: 'Customer', r: (c) => <div><div className="font-medium">{c.name} {c.account && <Badge c="brand">account</Badge>}</div><div className="text-[11px] text-black/45">{c.email}</div></div> },
          { k: 'phone', label: 'Phone' }, { k: 'city', label: 'City' },
          { k: 'orders', label: 'Orders', right: true, r: (c) => <>{c.orders}{c.cancelled > 0 && <span className="text-[11px] text-black/40"> ({c.cancelled} cancelled)</span>}</> },
          { k: 'spent', label: 'Spent', right: true, r: (c) => <Money v={c.spent} className="font-medium" /> },
          { k: 'last', label: 'Last order', r: (c) => day(c.last) },
          { label: '', r: (c) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <a className="rounded-lg px-2.5 py-1 text-xs text-emerald-700 hover:bg-black/5" target="_blank" rel="noreferrer" href={`https://wa.me/91${c.phone}`}>WhatsApp</a>
            {party(c) ? <Badge c="green">in Parties</Badge> : <Btn size="sm" onClick={() => toParty(c)}>Save to Parties</Btn>}
          </div> },
        ]} />
      </div>
      {open && (
        <Modal wide title={`${open.name} · ${open.phone}`} onClose={() => setOpen(null)}>
          <Table rows={orders.data.filter((o) => o.phone === open.phone)} columns={[
            { k: 'order_no', label: 'Order', r: (o) => <span className="font-mono text-xs">{o.order_no}</span> }, { k: 'created_at', label: 'Date', r: (o) => day(o.created_at) },
            { k: 'items', label: 'Items', r: (o) => o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ') },
            { k: 'status', label: 'Status', r: (o) => <Badge c={ORDER_C[o.status]}>{ORDER_LABEL[o.status]}</Badge> },
            { k: 'total', label: 'Total', right: true, r: (o) => <Money v={o.total} /> },
          ]} />
        </Modal>
      )}
    </Wrap>
  );
}

// ---------- Banners & announcement ----------
function Banners({ store, saveStore }) {
  const [note, setNote] = useState(store.announcement || '');
  const [bs, setBs] = useState(store.banners?.length ? store.banners : []);
  const upd = (i, k, v) => setBs(bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const mv = (i, d) => { const n = [...bs]; [n[i], n[i + d]] = [n[i + d], n[i]]; setBs(n); };
  const save = () => {
    if (bs.some((b) => !b.title?.trim())) return toast('Every banner needs a title', 'err');
    saveStore({ announcement: note.trim(), banners: bs.map((b) => ({ ...b, title: b.title.trim() })) }, 'Website updated (shows within a minute)');
  };
  return (
    <Wrap title="Banners & announcement" actions={<Btn v="primary" onClick={save}>Save to website</Btn>}>
      <section className="card mb-4 p-5">
        <h2 className="mb-1 font-semibold">Announcement bar</h2>
        <p className="mb-3 text-xs text-black/50">The strip at the very top of every page. Blank shows your first public coupon instead.</p>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Free delivery above ₹999 · Diwali sale: use DIWALI10" maxLength={140} />
        {note && <div className="mt-3 rounded-lg bg-ink px-4 py-2 text-center text-sm font-medium text-white">{note}</div>}
      </section>
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Home page banners</h2><p className="text-xs text-black/50">Shown under the hero, two per row. Link to a product, category or /shop?q=… search.</p></div>
          <Btn onClick={() => setBs([...bs, { title: '', subtitle: '', image: '', link: '/shop' }])}>+ Add banner</Btn></div>
        {!bs.length && <p className="py-8 text-center text-sm text-black/45">No banners. Add one for a sale, a new brand or a festival offer.</p>}
        <div className="grid gap-4 xl:grid-cols-2">
          {bs.map((b, i) => (
            <div key={i} className="rounded-[14px] border border-line p-3">
              <div className="relative mb-3 flex min-h-32 flex-col justify-end overflow-hidden rounded-[10px] bg-ink p-4 text-white">
                {b.image && <img src={b.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
                <div className="relative display text-2xl">{b.title || 'Banner title'}</div>{b.subtitle && <div className="relative text-sm text-white/80">{b.subtitle}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Title" value={b.title} onChange={(e) => upd(i, 'title', e.target.value)} />
                <Field label="Subtitle" value={b.subtitle || ''} onChange={(e) => upd(i, 'subtitle', e.target.value)} />
                <Field label="Image URL" value={b.image || ''} onChange={(e) => upd(i, 'image', e.target.value)} />
                <Field label="Link" value={b.link || ''} onChange={(e) => upd(i, 'link', e.target.value)} placeholder="/shop?category=…" />
                <Field label="Offer on this banner works" className="col-span-2"><select className="input" value={b.where || ''} onChange={(e) => upd(i, 'where', e.target.value)}>
                  <option value="">Not an offer</option><option value="both">In store &amp; online</option><option value="counter">In store only</option><option value="online">Online only</option></select></Field>
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                <button disabled={!i} className="rounded px-2 py-1 hover:bg-black/5 disabled:opacity-30" onClick={() => mv(i, -1)}>↑ Up</button>
                <button disabled={i === bs.length - 1} className="rounded px-2 py-1 hover:bg-black/5 disabled:opacity-30" onClick={() => mv(i, 1)}>↓ Down</button>
                <button className="ml-auto text-red-600 hover:underline" onClick={() => setBs(bs.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Wrap>
  );
}

// ---------- Store settings ----------
function StoreSettings({ boot, ob, store, saveStore, reload }) {
  const [f, set, bind] = useForm({ ...store });
  const n = (k) => (f[k] === '' || f[k] == null ? 0 : +f[k]);
  const save = (e) => {
    e.preventDefault();
    if (f.site_url && !/^https?:\/\//.test(f.site_url)) return toast('Website address should start with https://', 'err');
    saveStore({ open: !!f.open, cod_enabled: !!f.cod_enabled, shipping_fee: n('shipping_fee'), free_shipping_above: n('free_shipping_above'),
      min_order: n('min_order'), cod_limit: n('cod_limit'), site_url: f.site_url?.trim() || '' }, 'Store settings saved');
  };
  const setOnline = async (id) => {
    if (id === ob?.id || !confirm('Website orders and website stock will move to this branch. Continue?')) return;
    try {
      await api('/t/branches/bulk', { rows: [{ id, is_online: true }, ...(boot.branches || []).filter((b) => b.is_online && b.id !== id).map((b) => ({ id: b.id, is_online: false }))] });
      toast('Online branch changed'); reload();
    } catch (e) { fail(e); }
  };
  return (
    <Wrap title="Store settings">
      <form onSubmit={save} className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <section className="card grid gap-3 p-5">
          <h2 className="font-semibold">Ordering</h2>
          <label className="flex items-center gap-2 text-sm"><input {...bind('open', 'checkbox')} /> Website is taking orders</label>
          <Field label="Minimum order (₹)" {...bind('min_order')} inputMode="decimal" hint="0 = no minimum" />
          <Field label="Branch that fulfils website orders">
            <select className="input" value={ob?.id} onChange={(e) => setOnline(e.target.value)}>{(boot.branches || [boot.branch]).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>
          <Field label="Website address" {...bind('site_url')} placeholder="https://fitsecrets.in" hint="For the View website link" />
        </section>
        <section className="card grid gap-3 p-5">
          <h2 className="font-semibold">Delivery & payment</h2>
          <Field label="Delivery charge (₹)" {...bind('shipping_fee')} inputMode="decimal" />
          <Field label="Free delivery above (₹)" {...bind('free_shipping_above')} inputMode="decimal" hint="After coupon discount" />
          <label className="flex items-center gap-2 text-sm"><input {...bind('cod_enabled', 'checkbox')} /> Cash on delivery</label>
          <Field label="COD only up to (₹)" {...bind('cod_limit')} inputMode="decimal" hint="Bigger orders must pay online" />
          <p className="text-xs text-black/50">Online payments (Razorpay) are set with the website's environment keys.</p>
        </section>
        <div className="lg:col-span-2"><Btn v="primary" type="submit">Save store settings</Btn></div>
      </form>
    </Wrap>
  );
}

// ---------- Inbox: reviews, messages, back-in-stock requests (website → submit_feedback) ----------
const TABS = [['review', 'Reviews'], ['message', 'Messages'], ['restock', 'Back in stock']];
const star = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
export function Inbox({ inbox, store }) {
  const items = useApi('/items');
  const [tab, setTab] = useState(new URLSearchParams(location.hash.split('?')[1]).get('tab') || 'review');
  const [show, setShow] = useState('new');
  const all = inbox.data || [];
  const item = (id) => items.data?.find((i) => i.id === id);
  const set = async (f, patch, msg) => { try { await api('/t/feedback', { id: f.id, ...patch }); if (msg) toast(msg); inbox.reload(); } catch (e) { fail(e); } };
  const rows = all.filter((f) => f.kind === tab && (show === 'all' || (show === 'new' ? f.status === 'new' : f.status !== 'new')));
  const count = (k) => all.filter((f) => f.kind === k && f.status === 'new').length;
  const link = (it) => (store.site_url && it ? `${store.site_url.replace(/\/$/, '')}/p/${it.group_key || it.slug}` : '');
  const wa = (phone, text) => `https://wa.me/91${String(phone).slice(-10)}?text=${encodeURIComponent(text)}`;
  return (
    <Wrap title="Inbox">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cx('rounded-full px-4 py-2 text-sm font-semibold', tab === k ? 'bg-ink text-white' : 'bg-black/5')}>
          {l}{count(k) > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-xs text-white">{count(k)}</span>}</button>)}
        <select className="input ml-auto max-w-40" value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
          <option value="new">Needs action</option><option value="done">Handled</option><option value="all">All</option>
        </select>
      </div>
      {!inbox.data ? <Loading /> : !rows.length ? <div className="card py-16 text-center text-sm text-black/45">
        {tab === 'review' ? 'No reviews waiting. Customers write them on product pages.' : tab === 'message' ? 'No messages. The website Contact page sends here.' : 'No back-in-stock requests. Out-of-stock product pages have a “Notify me” form.'}
      </div> : tab === 'restock' ? <Restock rows={rows} item={item} link={link} wa={wa} set={set} /> : (
        <div className="grid gap-3 xl:grid-cols-2">
          {rows.map((f) => tab === 'review' ? <ReviewCard key={f.id + f.updated_at} f={f} it={item(f.item_id)} set={set} />
            : (
              <div key={f.id} className={cx('card p-4', f.status !== 'new' && 'opacity-70')}>
                <div className="flex justify-between gap-2"><div><b>{f.name}</b> <span className="text-sm text-black/50">{f.phone}{f.email && ` · ${f.email}`}</span></div>
                  <span className="text-xs text-black/45">{new Date(f.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-black/45">{f.title}{f.order_no && ` · order ${f.order_no}`}</div>
                <p className="mt-2 whitespace-pre-line text-sm">{f.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={wa(f.phone, `Hi ${f.name.split(' ')[0]}, this is Fit Secrets replying to your message: `)} target="_blank" rel="noreferrer"><Btn size="sm" v="brand">Reply on WhatsApp</Btn></a>
                  <a href={`tel:${f.phone}`}><Btn size="sm">Call</Btn></a>
                  {f.order_no && <a href={`#/online/orders`}><Btn size="sm" v="ghost">Find order</Btn></a>}
                  <Btn size="sm" v="ghost" className="ml-auto" onClick={() => set(f, { status: f.status === 'new' ? 'done' : 'new' })}>{f.status === 'new' ? 'Mark handled' : 'Mark unread'}</Btn>
                </div>
              </div>
            ))}
        </div>
      )}
    </Wrap>
  );
}

function ReviewCard({ f, it, set }) {
  const [reply, setReply] = useState(f.reply || '');
  return (
    <div className={cx('card p-4', f.status === 'hidden' && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div><span className="text-lg tracking-wider text-amber-500">{star(f.rating)}</span>
          <div className="text-sm font-medium">{it?.name || 'Product removed'}</div></div>
        <Badge c={f.status === 'approved' ? 'green' : f.status === 'hidden' ? 'grey' : 'amber'}>{f.status === 'new' ? 'waiting' : f.status === 'approved' ? 'on website' : 'hidden'}</Badge>
      </div>
      {f.title && <div className="mt-2 font-semibold">{f.title}</div>}
      <p className="mt-1 text-sm">{f.body}</p>
      <div className="mt-2 text-xs text-black/50">{f.name} · {f.phone} · {new Date(f.created_at).toLocaleDateString('en-IN')}{f.verified && <Badge c="brand">verified buyer</Badge>}</div>
      <div className="mt-3 flex gap-2"><input className="input py-1 text-sm" placeholder="Public reply (optional)" value={reply} onChange={(e) => setReply(e.target.value)} />
        {reply !== (f.reply || '') && <Btn size="sm" onClick={() => set(f, { reply: reply.trim() || null }, 'Reply saved')}>Save</Btn>}</div>
      <div className="mt-3 flex gap-2">
        {f.status !== 'approved' && <Btn size="sm" v="brand" onClick={() => set(f, { status: 'approved' }, 'Review is live on the website')}>Approve</Btn>}
        {f.status !== 'hidden' && <Btn size="sm" onClick={() => set(f, { status: 'hidden' }, 'Review hidden')}>Hide</Btn>}
      </div>
    </div>
  );
}

// Requests grouped by product: when stock is back, message everyone and mark them notified.
function Restock({ rows, item, link, wa, set }) {
  const groups = Object.values(rows.reduce((m, f) => { (m[f.item_id] ??= { id: f.item_id, list: [] }).list.push(f); return m; }, {})).sort((a, b) => b.list.length - a.list.length);
  return (
    <div className="grid gap-3">
      {groups.map((g) => {
        const it = item(g.id), back = it?.stock > 0;
        return (
          <div key={g.id} className="card p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div><b>{it?.name || 'Product removed'}</b> <span className="text-sm text-black/50">· {g.list.length} waiting</span></div>
              <Badge c={back ? 'green' : 'red'}>{back ? `${it.stock} in stock now` : 'still out of stock'}</Badge>
            </div>
            <ul className="divide-y divide-line text-sm">
              {g.list.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{f.name} <span className="text-black/45">{f.phone} · asked {new Date(f.created_at).toLocaleDateString('en-IN')}</span></span>
                  <span className="flex gap-2">
                    {f.status === 'new' ? <>
                      <a target="_blank" rel="noreferrer" href={wa(f.phone, `Hi ${f.name.split(' ')[0]}, good news from Fit Secrets: ${it?.name} is back in stock!${link(it) ? ` Order here: ${link(it)}` : ''}`)}
                        onClick={() => back && set(f, { status: 'notified' })}><Btn size="sm" v={back ? 'brand' : 'outline'}>WhatsApp{back ? ' & mark notified' : ''}</Btn></a>
                      {!back && <Btn size="sm" v="ghost" onClick={() => set(f, { status: 'notified' })}>Dismiss</Btn>}
                    </> : <Badge c="grey">notified</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Packing slips / shipping labels (opened from Orders, prints itself) ----------
export function OrderPrint({ kind, ids, branch }) {
  const orders = useApi('/orders');
  const list = (orders.data || []).filter((o) => ids.includes(o.id));
  useEffect(() => { if (list.length) setTimeout(() => window.print(), 300); }, [list.length]);
  if (!orders.data) return null;
  const from = [branch?.name, branch?.address, branch?.phone && `Ph ${branch.phone}`].filter(Boolean);
  const cod = (o) => o.payment_method === 'cod' && o.payment_status !== 'paid';
  const Bar = ({ text, h = 34 }) => { const b = code128Svg(text, h); return <svg viewBox={`0 0 ${b.width} ${b.height}`} preserveAspectRatio="none" className="h-10 w-full"><path d={b.d} fill="#000" /></svg>; };
  if (kind === 'labels') return (
    <div className="grid grid-cols-2 gap-3 bg-white p-3 text-black">
      <style>{'@page { size: A4; margin: 8mm; } .lbl { break-inside: avoid; }'}</style>
      {list.map((o) => { const a = o.address || {}; return (
        <div key={o.id} className="lbl flex h-[132mm] flex-col border-2 border-black p-4 text-[13px]">
          <div className="flex items-start justify-between border-b-2 border-black pb-2">
            <div><div className="text-[10px] uppercase">Courier</div><div className="text-lg font-bold">{o.courier || '________'}</div></div>
            <div className="text-right">{cod(o) ? <><div className="text-[10px] uppercase">Collect cash</div><div className="text-2xl font-black">{inr(o.total)}</div></> : <div className="text-xl font-black">PREPAID</div>}</div>
          </div>
          <div className="py-3"><div className="text-[10px] uppercase">Deliver to</div>
            <div className="text-xl font-bold leading-tight">{o.name}</div>
            <div className="text-base leading-snug">{a.line1}{a.line2 && <>, {a.line2}</>}<br />{a.city}, {a.state}</div>
            <div className="text-2xl font-black tracking-wider">{a.pincode}</div><div className="text-base">Ph {o.phone}</div></div>
          {o.awb && <div className="border-t-2 border-black pt-2 text-center"><Bar text={o.awb} /><div className="font-mono text-sm">AWB {o.awb}</div></div>}
          <div className="mt-auto flex items-end justify-between gap-3 border-t-2 border-black pt-2 text-[11px]">
            <div><div className="text-[10px] uppercase">From</div>{from.map((x) => <div key={x}>{x}</div>)}</div>
            <div className="w-40 text-center"><Bar text={o.order_no} h={26} /><div className="font-mono">{o.order_no}</div></div>
          </div>
        </div>
      ); })}
    </div>
  );
  return (
    <div className="bg-white text-black">
      <style>{'@page { size: A4; margin: 12mm; } .slip { break-after: page; }'}</style>
      {list.map((o) => { const a = o.address || {}; return (
        <div key={o.id} className="slip mx-auto max-w-[180mm] p-4 text-[13px]">
          <div className="flex items-start justify-between border-b-2 border-black pb-3">
            <div><div className="text-2xl font-bold">{branch?.name}</div><div>{branch?.address}</div><div>{branch?.phone && `Ph ${branch.phone}`} {branch?.gstin && `· GSTIN ${branch.gstin}`}</div></div>
            <div className="text-right"><div className="text-lg font-bold">PACKING SLIP</div><div className="w-48"><Bar text={o.order_no} h={26} /></div><div className="font-mono">{o.order_no}</div>
              <div>{new Date(o.created_at).toLocaleDateString('en-IN')}</div></div>
          </div>
          <div className="my-4 grid grid-cols-2 gap-6">
            <div><div className="text-[10px] font-semibold uppercase">Ship to</div><div className="text-base font-bold">{o.name}</div><div>{a.line1}{a.line2 && `, ${a.line2}`}</div><div>{a.city}, {a.state} {a.pincode}</div><div>Ph {o.phone}</div></div>
            <div className="text-right"><div className="text-[10px] font-semibold uppercase">Payment</div>
              <div className="text-base font-bold">{cod(o) ? `CASH ON DELIVERY · collect ${inr(o.total)}` : 'PREPAID'}</div>
              {o.courier && <div>{o.courier}{o.awb && ` · AWB ${o.awb}`}</div>}</div>
          </div>
          <table className="w-full border-collapse">
            <thead><tr className="border-y-2 border-black text-left"><th className="w-10 py-1">✓</th><th>Item</th><th>Variant</th><th className="text-right">Qty</th></tr></thead>
            <tbody>{o.lines.map((l) => <tr key={l.id} className="border-b border-black/30"><td className="py-2"><span className="inline-block h-4 w-4 border border-black" /></td><td>{l.name}</td><td>{l.variant}</td><td className="text-right text-base font-bold">{l.qty}</td></tr>)}</tbody>
          </table>
          <div className="mt-2 text-right">Items: <b>{o.lines.reduce((s, l) => s + l.qty, 0)}</b></div>
          {o.notes && <p className="mt-4 border border-black p-2"><b>Customer note:</b> {o.notes}</p>}
          <p className="mt-8 text-center text-[11px]">Thank you for shopping with {branch?.name}! Questions? WhatsApp {branch?.phone}. Sealed packs can be exchanged within 7 days with the bill.</p>
          <div className="mt-8 flex justify-between text-[11px]"><span>Packed by: ____________</span><span>Checked by: ____________</span></div>
        </div>
      ); })}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { calcInvoice, inr, today, round2, addDays } from '@fitsecret/shared';
import { api, useApi, toast, fail, shop } from '../api.js';
import { can } from '@fitsecret/shared/permissions';
import { payModes, modeName } from '@fitsecret/shared/reports';
import { couponDiscount, couponError } from '@fitsecret/shared/store';
import { comboDiscount, liveOffers, expiryNote } from '@fitsecret/shared/offers';
import { Btn, Field, Money, Kbd, Modal, cx, useHotkeys, Badge } from '../ui.jsx';
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
// Settings → Counter: document types the shop doesn't use are hidden from menus and these tabs.
export const OPTIONAL_DOCS = ['estimate', 'proforma', 'sale_order', 'delivery_challan', 'purchase_order'];
const EXCHANGE = 'exchange'; // refund as credit for a new sale (return), or that credit spent (sale)

// ?edit=<id>: edit that bill in place · ?ret=<id>: return against that bill · ?exchange=<credit note id>&credit=<₹>: spend a return's credit
// ?from=<id>: convert an order / estimate · ?copy=<id>: repeat a bill · ?low=1: purchase order for everything below its alert level
// hold: POS-mode tab number; the half-made bill is kept in this browser so a refresh or power cut doesn't lose it.
export default function Billing({ type = 'sale', branch, route, user, pos, active = true, hold, boot }) {
  if (!TYPES[type]) type = 'sale';
  const T = TYPES[type];
  const isPurchase = type.startsWith('purchase');
  const q = route?.query || {};
  const fromId = q.from, editId = q.edit, retId = q.ret;
  const srcId = fromId || q.copy || editId || retId;
  const cfg = branch?.settings?.invoice || {};
  const perms = branch?.settings?.perms || {};
  const isAdmin = user?.role === 'admin';
  const currencies = cfg.currencies || [];
  const items = useApi('/items');
  const offerRows = useApi('/t/offers'); // approved combos and near-expiry offers
  const couponRows = useApi(type === 'sale' ? '/t/coupons' : null); // counter coupons shown as one-tap chips
  const parties = useApi('/parties');
  const staff = useApi(!isPurchase ? '/t/employees' : null);
  const holdKey = hold && `fs_hold_${hold}`;
  const held = useMemo(() => { try { return holdKey ? JSON.parse(localStorage.getItem(holdKey)) : null; } catch { return null; } }, []);
  const [party, setParty] = useState(held?.party || null);
  const [lines, setLines] = useState(held?.lines || []);
  const [meta, setMeta] = useState({ date: today(), no: '', notes: '', inclusive: !isPurchase, due_date: '', ship_to: null, tcs_rate: '', currency: 'INR', referrer: '', salesperson: '', ...held?.meta });
  const [pays, setPays] = useState(held?.pays || (q.exchange ? [{ mode: EXCHANGE, amount: String(+q.credit || 0) }, { mode: 'cash', amount: '' }] : [{ mode: 'cash', amount: '' }])); // split payment: one row per mode
  const [billDisc, setBillDisc] = useState(held?.billDisc || ''); // "200" or "10%"
  // Walk-in customer typed on the bill (all optional). save: also add them to Parties (email / GSTIN / address go there).
  const [walkin, setWalkin] = useState(held?.walkin || { name: '', phone: '', email: '', gstin: '', address: '', save: false });
  const [approve, setApprove] = useState(null); // { msg, print, reason }: the server wants the owner's PIN for this bill
  const [coupon, setCoupon] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [discRs, setDiscRs] = useState(false); // line discount typed in ₹ instead of %
  const [src, setSrc] = useState(null); // the bill being edited / returned against
  const [saving, setSaving] = useState(false);
  const [newParty, setNewParty] = useState(false);
  const [scan, setScan] = useState(() => isPurchase && !!q.scan); // ?scan=1 from Utilities → Import Items
  const [showProfit, setShowProfit] = useState(false);
  const [rates, setRates] = useState({}); // party-wise item rates: item_id -> last rate billed to this party
  const [points, setPoints] = useState(null); // { balance, value } for the selected customer
  const [recent, setRecent] = useState([]); // this customer's last bills
  const loyalty = branch?.settings?.loyalty;
  const MODES = [...payModes(shop), ...(type === 'sale_return' ? [EXCHANGE] : [])];
  // Settings → Staff: cashiers lowering a price — free | approval (owner's PIN, the default) | never. The server checks it again.
  const priceMode = perms.price_edit || (perms.lock_rate ? 'never' : 'approval');
  const lockRate = !isAdmin && !isPurchase && priceMode === 'never';
  // Regular buyer's own rate for an item (Parties → Special rates): a fixed price, else their % off the list price.
  const own = (id, list) => (isPurchase || !party ? undefined : party.rates?.[id] > 0 ? +party.rates[id] : party.price_discount > 0 ? round2(list * (1 - party.price_discount / 100)) : undefined);
  const search = useRef();
  const root = useRef(); // POS mode keeps several bills in the page; keyboard jumps stay inside this one
  const [moreOpen, setMoreOpen] = useState(false);
  const focus = (sel) => { const el = root.current?.querySelector(sel); el?.focus(); el?.select?.(); return el; };
  useEffect(() => { if (active) search.current?.focus(); }, [active]);
  useEffect(() => { if (holdKey) localStorage.setItem(holdKey, JSON.stringify({ party, lines, meta, pays, billDisc, walkin })); }, [party, lines, meta, pays, billDisc, walkin]);

  // Party-wise rates, loyalty points and recent bills follow the selected party; lines the cashier hasn't typed a rate into re-price.
  useEffect(() => {
    setPoints(null); setRecent([]);
    if (!party?.id) return setRates({});
    api('/reports/x/party_rates?party_id=' + party.id).then((r) => {
      const m = Object.fromEntries(r.map((x) => [x.item_id, x.rate]));
      setRates(m);
      setLines((ls) => ls.map((l) => (l.manual ? l : reprice({ ...l, baseRate: own(l.item_id, l.listRate) ?? m[l.item_id] ?? l.listRate, partyRate: own(l.item_id, l.listRate) ?? m[l.item_id] }))));
    }, () => {});
    if (loyalty?.enabled && !isPurchase) api('/reports/x/loyalty').then((r) => setPoints(r.find((x) => x.party_id === party.id) || { balance: 0, value: 0 }), () => {});
    if (type === 'sale' && !editId) api(`/invoices?type=sale&q=${encodeURIComponent(party.phone || party.name)}`).then((r) => setRecent(r.filter((i) => i.status !== 'cancelled').slice(0, 3)), () => {});
  }, [party?.id]);

  // Converting, repeating, editing or returning a bill: start from its party and lines.
  useEffect(() => {
    if (!srcId || !items.data || !parties.data) return;
    api('/invoices/' + srcId).then((s) => {
      const keepBatch = fromId || editId || retId;
      setSrc(s);
      setParty(parties.data.find((p) => p.id === s.party_id) || null);
      setLines(s.lines.map((l) => {
        const it = items.data.find((i) => i.id === l.item_id) || {};
        return { key: Math.random(), item_id: l.item_id, name: l.name, stock: it.stock ?? 0, next_expiry: it.next_expiry, qty: l.qty, rate: l.rate, discount_pct: l.discount_pct, gst_rate: l.gst_rate, mrp: l.mrp,
          batch_no: keepBatch ? l.batch_no || '' : '', expiry: keepBatch ? l.expiry || '' : '', mfg: keepBatch ? l.mfg || '' : '', serial: editId ? l.serial || '' : '', manual: !fromId, cost: l.cost };
      }));
      setMeta((m) => ({ ...m, inclusive: s.tax_inclusive, notes: editId ? s.notes || '' : '',
        ...(editId && { date: s.date, no: s.type === 'purchase' ? s.no : '', due_date: s.due_date || '', ship_to: s.ship_to, referrer: s.referrer || '', salesperson: s.salesperson || '' }) }));
      if (editId && s.bill_discount) setBillDisc(String(s.bill_discount));
      toast(editId ? `Editing ${s.no}` : retId ? `Returning items from ${s.no}: remove what isn't coming back` : fromId ? `Loaded ${s.no}` : `Repeating ${s.no}: check quantities and save`);
    }, fail);
  }, [srcId, !items.data, !parties.data]);

  // Purchase order for everything at or below its low-stock alert, enough to get back to twice the alert level.
  useEffect(() => {
    if (!q.low || !items.data) return;
    setLines(items.data.filter((i) => i.low_stock > 0 && i.stock <= i.low_stock).map((it) => ({ key: Math.random(), item_id: it.id, name: it.name, stock: it.stock,
      qty: Math.max(1, Math.ceil(it.low_stock * 2 - Math.max(0, it.stock))), rate: it.purchase_price || 0, listRate: it.purchase_price || 0, discount_pct: 0, gst_rate: it.gst_rate, mrp: it.mrp, batch_no: '', expiry: '' })));
  }, [q.low, !items.data]);

  // Draft from a scanned supplier bill (ScanBill reviews it first).
  const loadDraft = (d) => {
    if (d.party) setParty(d.party);
    setLines((ls) => [...ls, ...d.lines.map((l) => ({ key: Math.random(), stock: 0, discount_pct: 0, batch_no: '', expiry: '', ...l }))]);
    setMeta((m) => ({ ...m, no: d.no || m.no, date: d.date || m.date, inclusive: d.inclusive }));
    setScan(false);
    items.reload(); parties.reload();
  };

  const interState = !!(party?.state_code && branch?.state_code && party.state_code !== branch.state_code);
  const base = lines.map((l) => ({ ...l, qty: +l.qty || 0, rate: +l.rate || 0, discount_pct: +l.discount_pct || 0 }));
  // Combos on this bill: the saving is spread over the combo's lines as extra line discount, so each line's GST stays right.
  const combo = type === 'sale' ? comboDiscount(base.map((l) => ({ item_id: l.item_id, qty: l.qty, price: l.rate * (1 - l.discount_pct / 100) })), liveOffers(offerRows.data || [], 'combo', today(), 'counter'))
    : { total: 0, applied: [], perItem: {} };
  const num = base.map((l) => { const off = combo.perItem[l.item_id], g = l.qty * l.rate; return off && g ? { ...l, discount_pct: Math.min(100, l.discount_pct + (off / g) * 100) } : l; });
  const pre = round2(num.reduce((s, l) => s + l.qty * l.rate * (1 - l.discount_pct / 100), 0)); // before the bill discount
  let couponMsg = '';
  let billDiscount = /%\s*$/.test(billDisc) ? round2((pre * (parseFloat(billDisc) || 0)) / 100) : round2(+billDisc || 0);
  if (coupon) { try { billDiscount = couponDiscount(coupon, pre, { today: today() }); } catch (e) { couponMsg = couponError(e.message) || e.message; billDiscount = 0; } }
  const calc = useMemo(() => calcInvoice(num, { inclusive: meta.inclusive, interState, billDiscount }), [lines, meta.inclusive, interState, billDiscount, combo.total]);
  const tcs = cfg.tcs ? round2((calc.total * (+meta.tcs_rate || 0)) / 100) : 0;
  const grand = round2(calc.total + tcs); // what the party pays (TCS on top)
  const fx = currencies.find((c) => c.code === meta.currency);
  const dueDefault = party?.payment_terms > 0 ? addDays(meta.date, party.payment_terms) : '';
  const already = editId && src ? round2(src.paid || 0) : 0; // editing: money taken earlier stays
  // A blank amount means "the rest of the bill", so a single row still defaults to full payment.
  const fixed = round2(pays.reduce((s, p) => s + (p.amount === '' ? 0 : +p.amount || 0), 0));
  const rest = Math.max(0, round2(grand - already - fixed));
  const blank = pays.findIndex((p) => p.amount === '');
  const payments = pays.map((p, i) => ({ mode: p.mode, amount: p.amount === '' ? (i === blank ? rest : 0) : +p.amount || 0 })).filter((p) => p.amount > 0);
  const received = round2(already + payments.reduce((s, p) => s + p.amount, 0));
  const exchLeft = type === 'sale' ? Math.max(0, round2(payments.filter((p) => p.mode === EXCHANGE).reduce((s, p) => s + p.amount, 0) - grand)) : 0;
  const setPay = (i, patch) => setPays((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPay = () => setPays((ps) => [...ps, { mode: MODES.find((m) => !ps.some((p) => p.mode === m)) || 'cash', amount: '' }]);
  // Notes the customer is likely to hand over: exact, then the next ₹100 / ₹500 / ₹2000.
  const tender = [...new Set([100, 500, 2000].map((n) => Math.ceil(grand / n) * n))].filter((n) => n > grand).slice(0, 3);
  const markdownDays = +cfg.markdown_days || 60, markdownPct = +cfg.markdown_pct || 10;
  const daysTo = (d) => Math.round((new Date(d) - new Date(today())) / 864e5);

  // Party rate (special rate, else last billed), else list price; the wholesale price takes over from its minimum quantity
  // when it is lower (Vyapar "multiple pricing"). Same rule as unitPrice in shared/store.js for the website.
  const reprice = (l) => (l.manual || isPurchase ? l
    : { ...l, rate: Math.min(l.baseRate ?? l.rate, l.wholesale > 0 && l.wmin > 0 && +l.qty >= l.wmin ? +l.wholesale : Infinity) });
  const add = (it, qty = 1) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item_id === it.id && !isPurchase);
      if (i >= 0) return ls.map((l, j) => (j === i ? reprice({ ...l, qty: round2(+l.qty + qty) }) : l));
      const listRate = isPurchase ? it.purchase_price || 0 : it.sale_price;
      // An approved near-expiry offer on the batch that sells next (earliest unexpired) applies by itself, with the expiry on the bill.
      const o = type === 'sale' && liveOffers(offerRows.data || [], 'expiry', today(), 'counter').find((x) => x.item_id === it.id && x.expiry === it.next_expiry);
      return [...ls, reprice({ key: Math.random(), item_id: it.id, name: it.name, stock: it.stock, expired_qty: it.expired_qty || 0, next_expiry: it.next_expiry, qty, listRate, baseRate: own(it.id, listRate) ?? rates[it.id] ?? listRate, partyRate: own(it.id, listRate) ?? rates[it.id],
        wholesale: it.wholesale_price, wmin: it.wholesale_min_qty, cost: it.purchase_price || 0, discount_pct: o ? +o.discount_pct : 0, gst_rate: it.gst_rate, mrp: it.mrp, batch_no: '', expiry: '',
        ...(o && { offer_id: o.id, note: o.note || expiryNote(o) }) })];
    });
  };
  const upd = (key, k, v) => setLines((ls) => ls.map((l) => {
    if (l.key !== key) return l;
    if (k === 'rate') return { ...l, rate: v, manual: true };
    if (k === 'qty') return reprice({ ...l, qty: v, disc_rs: undefined });
    if (k === 'disc_rs') { const g = (+l.qty || 0) * (+l.rate || 0); return { ...l, disc_rs: v, discount_pct: g ? round2(((+v || 0) / g) * 100 * 100) / 100 : 0 }; }
    return { ...l, [k]: v, ...(k === 'discount_pct' && { disc_rs: undefined }) };
  }));
  const profit = round2(calc.taxable - lines.reduce((s, l) => s + (+l.qty || 0) * (l.cost ?? items.data?.find((i) => i.id === l.item_id)?.purchase_price ?? 0), 0));
  const redeem = () => {
    const amt = Math.min(points.value, grand);
    if (!(amt > 0)) return toast('No points to redeem', 'err');
    setPays((ps) => [{ mode: 'points', amount: String(amt) }, ...ps.filter((p) => p.mode !== 'points')]);
  };
  const applyCoupon = async (picked) => {
    const code = (picked?.code || couponCode).trim().toUpperCase();
    if (!code) return setCoupon(null);
    try {
      const c = picked || (await api('/t/coupons')).find((x) => String(x.code).toUpperCase() === code);
      if (c?.channel === 'online') throw new Error(`${c.code} is for website orders only`);
      couponDiscount(c, pre, { today: today() });
      setCoupon(c); setBillDisc(''); toast(`Coupon ${code} applied`);
    } catch (e) { toast(couponError(e.message) || e.message, 'err'); }
  };
  const counterCoupons = type === 'sale' ? (couponRows.data || []).filter((c) => c.active && c.channel !== 'online' && (!c.starts || c.starts <= today()) && (!c.ends || c.ends >= today())) : [];
  // Walk-in details: a phone number that is already a customer offers to use that customer instead.
  const wDigits = walkin.phone.replace(/\D/g, '').slice(-10);
  const known = !party && wDigits.length === 10 ? (parties.data || []).find((p) => String(p.phone || '').replace(/\D/g, '').slice(-10) === wDigits) : null;
  const setW = (k, v) => setWalkin((w) => ({ ...w, [k]: v }));
  const reset = () => {
    setLines([]); setParty(null); setPays([{ mode: 'cash', amount: '' }]); setShowProfit(false); setBillDisc(''); setCoupon(null); setCouponCode('');
    setWalkin({ name: '', phone: '', email: '', gstin: '', address: '', save: false });
    setMeta((m) => ({ ...m, no: '', notes: '', due_date: '', ship_to: null, referrer: '', salesperson: '' }));
    if (holdKey) localStorage.removeItem(holdKey);
    search.current?.focus();
  };

  const save = async (print) => {
    if (!lines.length) return toast('Add items first', 'err');
    if (type === 'sale' && cfg.block_negative) { // Settings → Stop sale on negative stock (the owner may override)
      const want = new Map();
      for (const l of lines) want.set(l.item_id, (want.get(l.item_id) || 0) + (+l.qty || 0));
      const short = lines.find((l) => want.get(l.item_id) > l.stock);
      if (short && !(isAdmin && confirm(`${short.name}: only ${short.stock} in stock. Sell anyway? (Fix the count later in Items → Stock ±)`)))
        return toast(`${short.name}: only ${short.stock} in stock${isAdmin ? '' : '. Ask the owner, or adjust stock in Items → Stock ±'}`, 'err');
    }
    if (couponMsg) return toast(couponMsg, 'err');
    const due = T.noPay ? 0 : round2(grand - received);
    if (type === 'sale' && party?.credit_limit > 0 && due > 0 && party.balance + due > party.credit_limit
      && !confirm(`${party.name}'s credit limit is ${inr(party.credit_limit)}. This bill takes their balance to ${inr(party.balance + due)}. Save anyway?`)) return;
    const reason = editId ? prompt(`Why are you changing ${src?.no}? (kept in the audit trail)`) : null;
    if (editId && reason == null) return;
    if (wDigits && wDigits.length !== 10 && !party) return toast('Phone number: 10 digits, or leave it empty', 'err');
    send(print, reason);
  };
  const send = async (print, reason, approval) => {
    setSaving(true);
    try {
      let buyer = party;
      if (!buyer && walkin.save && walkin.name.trim()) { // "Save as customer": add to Parties first, then bill them
        buyer = await api('/t/parties', { type: 'customer', name: walkin.name.trim(), phone: wDigits || null, email: walkin.email.trim() || null,
          gstin: walkin.gstin.trim().toUpperCase() || null, address: walkin.address.trim() || null });
        parties.reload();
      }
      const inv = await api('/invoices', {
        type, party_id: buyer?.id, party_name: buyer ? undefined : walkin.name.trim() || undefined, party_phone: buyer ? undefined : wDigits || undefined,
        coupon: coupon?.code, approval, date: meta.date, no: meta.no || undefined, combo_discount: combo.total || undefined,
        notes: [meta.notes, coupon && !meta.notes.includes(coupon.code) && `Coupon ${coupon.code}`, combo.applied.length && `Combo: ${combo.applied.map((c) => c.name).join(', ')}`].filter(Boolean).join(' · '),
        tax_inclusive: meta.inclusive, from_id: fromId, edit_id: editId, ref_id: retId, reason,
        due_date: meta.due_date || undefined, ship_to: meta.ship_to ?? undefined, tcs_rate: cfg.tcs ? +meta.tcs_rate || 0 : 0,
        currency: fx ? fx.code : undefined, fx_rate: fx?.rate, bill_discount: billDiscount || undefined,
        referrer: meta.referrer.trim() || undefined, salesperson: meta.salesperson || undefined, exchange_from: q.exchange,
        lines: num.map(({ item_id, qty, rate, discount_pct, gst_rate, batch_no, expiry, mfg, serial, note, offer_id }) => ({ item_id, qty, rate, discount_pct: round2(discount_pct * 10000) / 10000, gst_rate: +gst_rate, batch_no, expiry, mfg, serial,
          note: [note, combo.perItem[item_id] && `Combo: ${combo.applied.map((c) => c.name).join(', ')}`].filter(Boolean).join(' · ') || undefined, offer_id })),
        payments: T.noPay ? [] : payments,
      });
      toast(`${T.title} ${inv.no} ${editId ? 'updated' : 'saved'} · ${inr(inv.total)}`);
      if (print) { const f = localStorage.getItem('fs_print') || 'thermal'; window.open(`#/print/${inv.id}/${f}`, '_blank', f.startsWith('thermal') ? 'width=420,height=700' : 'width=900,height=900'); }
      reset();
      items.reload(); parties.reload();
      const credit = inv.payments.filter((p) => p.mode === EXCHANGE).reduce((s, p) => s + p.amount, 0);
      if (type === 'sale_return' && credit > 0) location.hash = `#/bill/sale?exchange=${inv.id}&credit=${credit}`; // straight on to the new item
      else if (fromId || editId || retId || q.exchange || q.low) location.hash = `#/invoices?type=${type}`;
      setApprove(null);
    } catch (e) {
      const m = String(e.message || '');
      if (m.startsWith('APPROVAL: ')) setApprove({ msg: m.slice(10), print, reason }); // owner types their PIN on this screen
      else if (approval && /PIN/.test(m)) toast(m, 'err');
      else fail(e);
    } finally { setSaving(false); }
  };
  // Keyboard-only billing: see KEYS in App.jsx ("?" shows them).
  const nextMode = () => setPays((ps) => {
    if (T.noPay || ['points', EXCHANGE].includes(ps[0]?.mode) && type === 'sale') return ps;
    const m = MODES[(MODES.indexOf(ps[0].mode) + 1) % MODES.length];
    toast(`Payment: ${modeName(m, shop)}`);
    return [{ ...ps[0], mode: m }, ...ps.slice(1)];
  });
  useHotkeys(active ? {
    F9: () => save(true), 'ctrl+enter': () => save(false), F2: () => search.current?.focus(),
    F3: () => focus('[data-key=party]'), F4: () => focus('[data-pay="0"]'), F6: () => focus('[data-key=billdisc]') || toast('No bill discount on this document', 'err'),
    F7: nextMode, F8: () => setMoreOpen((o) => !o),
  } : {});
  // Spreadsheet-style keys on line inputs: ↑ ↓ same column on the line above / below, Enter or Esc back to the search, Ctrl+Delete removes the line.
  const cellKeys = (e) => {
    const el = e.target, row = el.dataset?.row;
    if (row == null || (e.altKey || e.metaKey) || (e.ctrlKey && e.key !== 'Delete')) return; // leave Ctrl+Enter etc. to the bill
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); search.current?.focus(); }
    if (e.key === 'Delete' && e.ctrlKey) { e.preventDefault(); setLines((ls) => ls.filter((_, j) => j !== +row)); search.current?.focus(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!focus(`[data-row="${+row + (e.key === 'ArrowDown' ? 1 : -1)}"][data-cell="${el.dataset.cell}"]`) && e.key === 'ArrowDown') search.current?.focus();
    }
  };
  const cell = (i, c) => ({ 'data-row': i, 'data-cell': c, onFocus: (e) => e.target.select() });

  const partyList = (parties.data || []).filter((p) => p.type === T.partyType || !p.type);
  const referrers = (parties.data || []).filter((p) => /trainer|gym|coach|refer/i.test(p.group_name || '')).map((p) => p.name);
  const hidden = cfg.hidden_docs || [];
  const more = !!(meta.due_date || meta.ship_to || meta.tcs_rate || meta.currency !== 'INR' || meta.notes || meta.referrer || meta.salesperson);

  return (
    <div ref={root} className="flex h-full flex-col lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col p-3 sm:p-5">
        {!pos && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {!editId && !retId && Object.entries(TYPES).filter(([k]) => k.startsWith('purchase') === isPurchase && (k === type || !hidden.includes(k))).map(([k, t]) => (
              <a key={k} href={`#/bill/${k}`} className={cx('rounded-full px-3 py-1 text-xs font-medium transition-colors', k === type ? 'bg-ink text-white' : 'bg-black/5 text-black/60 hover:bg-black/10')}>{t.title.split(' /')[0]}</a>
            ))}
            {editId && <Badge c="amber">Editing {src?.no || '…'} · same number, change is logged</Badge>}
            {retId && <Badge c="blue">Return against {src?.no || '…'} ({src?.date})</Badge>}
            {q.exchange && <Badge c="blue">Exchange: credit {inr(+q.credit)} from the return</Badge>}
            {fromId && <Badge c="blue">Converting an order</Badge>}
            {q.copy && <Badge c="blue">Repeat bill</Badge>}
            {q.low && <Badge c="amber">Reorder: items at or below their alert level</Badge>}
            {type === 'purchase' && !editId && <Btn v="primary" size="sm" className="ml-auto" onClick={() => setScan(true)}>Scan supplier bill</Btn>}
          </div>
        )}
        <ItemSearch items={items.data || []} onPick={add} inputRef={search} purchase={isPurchase} onUp={() => lines.length && focus(`[data-row="${lines.length - 1}"][data-cell=qty]`)} />
        <div className="card mt-3 flex-1 overflow-auto">
          {!lines.length ? (
            <div className="grid h-full min-h-60 place-items-center text-center text-sm text-black/40">
              <div>Scan a barcode or type an item name, then Enter<div className="mt-1 text-xs">Type <b>3*whey</b> to add 3 at once · press <Kbd>?</Kbd> for every key</div></div>
            </div>
          ) : (
            <table className="w-full min-w-[640px] table-fixed text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-black/8 text-left text-[11px] uppercase tracking-wide text-black/50">
                  <th className="px-3 py-2">Item</th>
                  {isPurchase && <><th className="w-24 px-1">Batch</th><th className="w-36 px-1">Expiry</th>{cfg.mfg && <th className="w-36 px-1">Mfg</th>}</>}
                  {cfg.serials && <th className="w-32 px-1">Serial / IMEI</th>}
                  <th className="w-28 px-1">Qty</th><th className="w-24 px-1">Rate</th>
                  <th className="w-16 px-1"><button onClick={() => setDiscRs(!discRs)} className="uppercase underline decoration-dotted underline-offset-2 hover:text-ink" title="Switch between % and ₹ off">Disc{discRs ? '₹' : '%'}</button></th>
                  <th className="w-16 px-1">GST%</th>
                  <th className="w-28 px-3 text-right">Amount</th><th className="w-8" />
                </tr>
              </thead>
              <tbody onKeyDown={cellKeys}>
                {calc.lines.map((l, i) => {
                  const s = lines[i];
                  const short = !isPurchase && type === 'sale' && +s.qty > s.stock;
                  const expiredOnly = !isPurchase && type === 'sale' && s.expired_qty > 0 && +s.qty > s.stock - s.expired_qty; // the rest on the shelf is past expiry
                  // quick discount hint for batches near expiry, unless an approved near-expiry offer already covers this line
                  const exp = !isPurchase && type === 'sale' && !s.offer_id && s.next_expiry && daysTo(s.next_expiry) <= markdownDays ? daysTo(s.next_expiry) : null;
                  return (
                    <tr key={s.key} className="rise border-b border-black/5">
                      <td className="px-3 py-1.5">
                        <div className="truncate font-medium leading-tight" title={l.name}>{l.name}</div>
                        <div className={cx('text-[11px]', short ? 'text-red-600' : 'text-black/45')}>Stock {s.stock}{short && ' · will go negative'} · MRP {inr(s.mrp)}
                          {s.partyRate != null && <span className="text-brand-d"> · {party?.name}'s rate {inr(s.partyRate)}</span>}
                          {!isPurchase && s.wholesale > 0 && s.wmin > 0 && <span className={+s.qty >= s.wmin ? 'font-semibold text-emerald-700' : ''}> · Wholesale {inr(s.wholesale)} from {s.wmin}</span>}
                          {exp != null && <> · <button className="font-semibold text-flame hover:underline" onClick={() => upd(s.key, 'discount_pct', Math.max(+s.discount_pct || 0, markdownPct))}
                            title="Batch close to expiry: sell it first with a small discount">{exp < 0 ? 'Expired!' : `Expires in ${exp}d`} · give {markdownPct}% off</button></>}
                        </div>
                        {type === 'sale' && s.mrp > 0 && (meta.inclusive ? +s.rate : +s.rate * (1 + (+s.gst_rate || 0) / 100)) > s.mrp + 0.01
                          && <div className="text-[11px] font-semibold text-red-600">Above MRP {inr(s.mrp)}: can’t be sold at this price</div>}
                        {type === 'sale' && s.baseRate > 0 && +s.rate < s.baseRate - 0.01 && <div className="text-[11px] font-medium text-amber-700">
                          Usual {inr(s.baseRate)}{!isAdmin && (priceMode === 'approval' ? ' · needs the owner’s PIN' : ' · logged')}</div>}
                        {s.note && <div className="text-[11px] font-medium text-emerald-700">{s.note}</div>}
                        {combo.perItem[s.item_id] > 0 && <div className="text-[11px] font-medium text-emerald-700">Combo saving {inr(combo.perItem[s.item_id])}</div>}
                        {expiredOnly && <div className="text-[11px] font-semibold text-red-600">Only {Math.max(0, s.stock - s.expired_qty)} unexpired left: don’t hand over expired packs ({s.expired_qty} expired)</div>}
                      </td>
                      {isPurchase && <>
                        <td className="px-1"><input className="input py-1" value={s.batch_no} onChange={(e) => upd(s.key, 'batch_no', e.target.value)} placeholder="Batch" /></td>
                        <td className="px-1"><input className="input py-1" type="date" value={s.expiry} onChange={(e) => upd(s.key, 'expiry', e.target.value)} /></td>
                        {cfg.mfg && <td className="px-1"><input className="input py-1" type="date" value={s.mfg || ''} onChange={(e) => upd(s.key, 'mfg', e.target.value)} /></td>}
                      </>}
                      {cfg.serials && <td className="px-1"><input className="input py-1" value={s.serial || ''} onChange={(e) => upd(s.key, 'serial', e.target.value)} placeholder="Scan / type" /></td>}
                      <td className="px-1">
                        <div className="flex items-center">
                          <button tabIndex={-1} className="px-1.5 text-black/40 hover:text-ink" onClick={() => upd(s.key, 'qty', Math.max(1, +s.qty - 1))} aria-label="Decrease">−</button>
                          <input className="input px-1 py-1 text-center" value={s.qty} onChange={(e) => upd(s.key, 'qty', e.target.value)} inputMode="decimal" aria-label={`Quantity of ${s.name}`} {...cell(i, 'qty')} />
                          <button tabIndex={-1} className="px-1.5 text-black/40 hover:text-ink" onClick={() => upd(s.key, 'qty', +s.qty + 1)} aria-label="Increase">+</button>
                        </div>
                      </td>
                      <td className="px-1"><input className="input py-1 text-right" value={s.rate} readOnly={lockRate} title={lockRate ? 'Only the owner can change rates' : 'Type a new price. Lower than usual needs the owner (Settings → Staff)'}
                        onChange={(e) => upd(s.key, 'rate', e.target.value)} inputMode="decimal" aria-label="Rate" {...cell(i, 'rate')} /></td>
                      <td className="px-1"><input className="input py-1 text-right" inputMode="decimal"
                        value={discRs ? s.disc_rs ?? (round2(((+s.qty || 0) * (+s.rate || 0) * (+s.discount_pct || 0)) / 100) || '') : s.discount_pct}
                        onChange={(e) => upd(s.key, discRs ? 'disc_rs' : 'discount_pct', e.target.value)} aria-label="Discount" {...cell(i, 'disc')} /></td>
                      <td className="px-1"><input className="input py-1 text-right" value={s.gst_rate} onChange={(e) => upd(s.key, 'gst_rate', e.target.value)} inputMode="decimal" aria-label="GST %" {...cell(i, 'gst')} /></td>
                      <td className="px-3 text-right font-medium tabular-nums">{inr(l.total)}</td>
                      <td><button tabIndex={-1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== s.key))} className="px-2 text-black/30 hover:text-red-600" aria-label="Remove" title="Ctrl+Delete">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="no-print mt-2 hidden flex-wrap gap-x-4 gap-y-1 text-[11px] text-black/50 md:flex">
          {[['F2', 'item'], ['F3', 'customer'], ['F4', 'amount'], ['F6', 'discount'], ['F7', 'pay mode'], ['↑', 'edit lines'], ['Ctrl+Del', 'remove line'], ['F9', 'save & print'], ['Ctrl+↵', 'save'], ['?', 'all keys']]
            .map(([k, l]) => <span key={k} className="flex items-center gap-1"><Kbd>{k}</Kbd>{l}</span>)}
        </div>
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-l border-black/8 bg-white p-4 sm:p-5 lg:w-[330px] xl:w-[360px]">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-black/60">{T.partyType === 'supplier' ? 'Supplier' : 'Customer'}</span>
            {!retId && <button className="text-xs font-medium text-brand-d hover:underline" onClick={() => setNewParty(true)}>+ New</button>}
          </div>
          {retId ? <div className="input bg-paper">{src?.party_name || '…'}</div> : <PartyPick list={partyList} value={party} onChange={setParty} cash={T.cash} onDone={() => search.current?.focus()} />}
          {party && <div className="mt-1 text-[11px] text-black/50">{party.phone} {party.gstin && `· GSTIN ${party.gstin}`} · Balance {inr(party.balance)}
            {party.credit_limit > 0 && <span className={party.balance >= party.credit_limit ? 'font-semibold text-red-600' : ''}> · Limit {inr(party.credit_limit)}</span>}{interState && ' · Inter-state (IGST)'}</div>}
          {!party && !retId && T.cash && T.partyType === 'customer' && (
            <details className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs" open={!!(walkin.name || walkin.phone)}>
              <summary className="cursor-pointer select-none font-semibold text-black/55 hover:text-ink">Customer details <span className="font-normal text-black/40">(optional)</span></summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Name" value={walkin.name} onChange={(e) => setW('name', e.target.value)} maxLength={80} autoComplete="off" />
                <Field label="Phone" value={walkin.phone} onChange={(e) => setW('phone', e.target.value)} inputMode="tel" autoComplete="off" placeholder="10 digits" />
                {known && <div className="col-span-2 flex items-center justify-between rounded-lg bg-brand/15 px-2 py-1">
                  <span>Already a customer: <b>{known.name}</b></span>
                  <button className="font-semibold text-brand-d hover:underline" onClick={() => { setParty(known); setW('phone', ''); setW('name', ''); }}>Use</button></div>}
                {!known && <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={walkin.save} onChange={(e) => setW('save', e.target.checked)} /> Save as customer (Parties)</label>}
                {walkin.save && !known && <>
                  <Field label="Email" type="email" value={walkin.email} onChange={(e) => setW('email', e.target.value)} />
                  <Field label="GSTIN" value={walkin.gstin} onChange={(e) => setW('gstin', e.target.value)} maxLength={15} />
                  <Field label="Address" className="col-span-2" value={walkin.address} onChange={(e) => setW('address', e.target.value)} />
                  {!walkin.name.trim() && <div className="col-span-2 text-amber-700">Add a name to save them</div>}
                </>}
              </div>
            </details>
          )}
          {recent.length > 0 && (
            <div className="mt-2 space-y-0.5 rounded-lg bg-paper px-3 py-1.5 text-[11px]">
              <div className="font-semibold text-black/55">Last bills</div>
              {recent.map((r) => <div key={r.id} className="flex justify-between gap-2"><span>{r.date} · {inr(r.total)}</span>
                {!pos && <a href={`#/bill/sale?copy=${r.id}`} className="font-semibold text-brand-d hover:underline">Repeat</a>}</div>)}
            </div>
          )}
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
          {!isPurchase && !T.noPay && type !== 'sale_return' && <>
            <Field label="Discount on bill (F6)" data-key="billdisc" value={coupon ? '' : billDisc} disabled={!!coupon} placeholder="₹200 or 10%" onChange={(e) => setBillDisc(e.target.value.replace(/[₹\s]/g, ''))} inputMode="decimal" />
            <Field label="Coupon">
              <div className="flex gap-1">
                <input className="input min-w-0 uppercase" value={coupon ? coupon.code : couponCode} disabled={!!coupon} placeholder="CODE" onChange={(e) => setCouponCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyCoupon()} />
                {coupon ? <button className="px-1 text-black/40 hover:text-red-600" onClick={() => { setCoupon(null); setCouponCode(''); }} aria-label="Remove coupon">✕</button>
                  : couponCode && <button className="text-xs font-semibold text-brand-d" onClick={() => applyCoupon()}>Apply</button>}
              </div>
            </Field>
            {!coupon && counterCoupons.length > 0 && <div className="col-span-2 -mt-1 flex flex-wrap gap-1.5" aria-label="Offers at the counter">
              {counterCoupons.slice(0, 6).map((c) => <button key={c.id} onClick={() => applyCoupon(c)} title={c.note || undefined}
                className="rounded-full border border-dashed border-emerald-600/50 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:border-emerald-700">
                {c.code} · {c.kind === 'percent' ? `${c.value}%` : `₹${c.value}`} off{c.min_order ? ` on ₹${c.min_order}+` : ''}</button>)}
            </div>}
          </>}
        </div>
        <details open={more || moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)} className="-mt-2 text-sm">
          <summary className="cursor-pointer select-none text-xs font-semibold text-black/55 hover:text-ink">More options <Kbd>F8</Kbd></summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {party && !T.noPay && <Field label="Due date" type="date" value={meta.due_date || dueDefault} onChange={(e) => setMeta({ ...meta, due_date: e.target.value })}
              hint={party.payment_terms > 0 ? `${party.payment_terms}-day terms` : undefined} />}
            {cfg.tcs && <Field label="TCS %" value={meta.tcs_rate} onChange={(e) => setMeta({ ...meta, tcs_rate: e.target.value })} inputMode="decimal" placeholder="0.1" />}
            {currencies.length > 0 && !isPurchase && <Field label="Currency"><select className="input" value={meta.currency} onChange={(e) => setMeta({ ...meta, currency: e.target.value })}>
              <option value="INR">INR ₹</option>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code} @ ₹{c.rate}</option>)}</select></Field>}
            {type === 'sale' && <>
              <Field label="Salesperson"><select className="input" value={meta.salesperson} onChange={(e) => setMeta({ ...meta, salesperson: e.target.value })}>
                <option value="">{user?.name} (me)</option>{(staff.data || []).filter((e) => e.active !== false).map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}</select></Field>
              <Field label="Referred by" list="referrers" value={meta.referrer} placeholder="Trainer / gym" onChange={(e) => setMeta({ ...meta, referrer: e.target.value })} />
              <datalist id="referrers">{referrers.map((n) => <option key={n} value={n} />)}</datalist>
            </>}
            {party && T.partyType === 'customer' && <Field label="Ship to" className="col-span-2">
              <textarea className="input" rows={2} value={meta.ship_to ?? party.shipping_address ?? ''} onChange={(e) => setMeta({ ...meta, ship_to: e.target.value })} /></Field>}
            <Field label="Notes" className="col-span-2"><textarea className="input" rows={2} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></Field>
          </div>
        </details>

        <dl className="space-y-1.5 border-t border-dashed border-black/15 pt-3 text-sm">
          <Row k="Items" v={`${lines.length} · qty ${round2(lines.reduce((s, l) => s + (+l.qty || 0), 0))}`} />
          {combo.applied.map((c) => <Row key={c.id} k={`Combo: ${c.name}${c.sets > 1 ? ` ×${c.sets}` : ''}`} v={<span className="text-emerald-700">−{inr(c.saving)}</span>} />)}
          {calc.bill_discount > 0 && <Row k={coupon ? `Coupon ${coupon.code}` : 'Bill discount'} v={'−' + inr(calc.bill_discount)} />}
          {couponMsg && <div className="text-[11px] text-red-600">{couponMsg}</div>}
          {calc.discount > 0 && <Row k="Total discount" v={'−' + inr(calc.discount)} />}
          <Row k="Taxable" v={inr(calc.taxable)} />
          {interState ? <Row k="IGST" v={inr(calc.igst)} /> : <><Row k="CGST" v={inr(calc.cgst)} /><Row k="SGST" v={inr(calc.sgst)} /></>}
          <Row k="Round off" v={inr(calc.round_off)} />
          {tcs > 0 && <Row k={`TCS ${meta.tcs_rate}%`} v={inr(tcs)} />}
          {can(user, 'see_cost') && !isPurchase && lines.length > 0 && (showProfit
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
            {already > 0 && <div className="mb-2 rounded-lg bg-paper px-3 py-1.5 text-xs">Already paid on this bill: <b>{inr(already)}</b>. Amounts below are taken now.</div>}
            {pays.map((p, i) => (
              <div key={i} className={cx(i > 0 && 'mt-3 border-t border-line pt-3')}>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {p.mode === 'points' || (p.mode === EXCHANGE && type === 'sale') ? <span className="flex-1 rounded-full bg-brand/30 py-1.5 text-center text-xs font-semibold uppercase">{p.mode === 'points' ? 'Loyalty points' : 'Exchange credit'}</span>
                    : MODES.map((m) => (
                      <button key={m} onClick={() => setPay(i, { mode: m })} className={cx('flex-1 whitespace-nowrap rounded-full border px-2 py-1.5 text-xs font-semibold', !m.startsWith('bank:') && 'uppercase', p.mode === m ? 'border-ink bg-ink text-white' : 'border-black/15 hover:border-ink')}
                        title={m === EXCHANGE ? 'No money back: the credit goes straight onto a new sale' : undefined}>{m.startsWith('bank:') ? modeName(m, shop) : m}</button>
                    ))}
                  {pays.length > 1 && <button onClick={() => setPays((ps) => ps.filter((_, j) => j !== i))} className="rounded-full px-2 text-black/40 hover:bg-black/5 hover:text-ink" aria-label="Remove payment">✕</button>}
                </div>
                <Field label={`${type.endsWith('return') || isPurchase ? 'Amount paid' : 'Amount received'}${pays.length > 1 ? ` · ${modeName(p.mode, shop)}` : ''}${i === 0 ? ' (F4 · F7 mode)' : ''}`} data-pay={i} value={p.amount}
                  placeholder={String(i === blank ? rest : 0)} inputMode="decimal" onChange={(e) => setPay(i, { amount: e.target.value })} />
                {p.mode === 'cash' && pays.length === 1 && type === 'sale' && grand > 0 && (
                  <div className="mt-1.5 flex gap-1.5">
                    {['Exact', ...tender].map((n) => <button key={n} onClick={() => setPay(i, { amount: n === 'Exact' ? '' : String(n) })}
                      className={cx('flex-1 rounded-lg border py-1 text-xs font-semibold tabular-nums', (n === 'Exact' ? p.amount === '' : +p.amount === n) ? 'border-ink bg-ink text-white' : 'border-black/15 hover:border-ink')}>{n === 'Exact' ? n : `₹${n}`}</button>)}
                  </div>
                )}
              </div>
            ))}
            {pays.length < MODES.length && <button onClick={addPay} className="mt-2 text-xs font-semibold text-brand-d underline underline-offset-4 hover:text-ink">+ Split payment (another mode)</button>}
            <div className="mt-1">
              {exchLeft > 0 ? <span className="text-xs font-medium text-sky-700">{inr(exchLeft)} credit stays on the return for next time</span>
                : received > grand ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-lg font-bold text-emerald-700">Return change {inr(received - grand)}</div>
                : received < grand ? <span className="text-xs font-medium text-amber-700">Balance due {inr(grand - received)} {party ? `→ ${party.name}'s account` : '— select a customer'}</span> : null}
            </div>
          </div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2">
          <Btn onClick={() => save(false)} disabled={saving}>{editId ? 'Save changes' : 'Save'} <kbd className="text-[10px] opacity-50">Ctrl↵</kbd></Btn>
          <Btn v="brand" onClick={() => save(true)} disabled={saving}>Save &amp; Print <kbd className="text-[10px] opacity-60">F9</kbd></Btn>
        </div>
      </aside>
      {approve && <OwnerPin msg={approve.msg} users={(boot?.users || []).filter((u) => u.role === 'admin')} busy={saving}
        onClose={() => setApprove(null)} onPin={(a) => send(approve.print, approve.reason, a)} />}
      {scan && <ScanBill items={items.data || []} parties={parties.data || []} branch={branch} onClose={() => setScan(false)} onDone={loadDraft} />}
      {newParty && <PartyForm type={T.partyType} fields={branch?.settings?.party_fields} onClose={() => setNewParty(false)} onSaved={(p) => { setNewParty(false); parties.reload(); setParty({ ...p, balance: 0 }); }} />}
    </div>
  );
}

// The owner types their PIN on the cashier's screen to allow a lower price / bigger discount on this one bill.
// The server checks the PIN (5 wrong tries lock it for 10 minutes) and writes who allowed it to the audit trail.
function OwnerPin({ msg, users, busy, onClose, onPin }) {
  const [uid, setUid] = useState(users[0]?.id || '');
  const [pin, setPin] = useState('');
  return (
    <Modal title="Owner’s approval" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (pin) onPin({ user_id: uid, pin }); setPin(''); }}>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg}</p>
        {!users.length ? <p className="text-sm text-black/60">No owner login on this counter. Ask the owner to make this bill.</p> : <>
          {users.length > 1 && <Field label="Owner"><select className="input" value={uid} onChange={(e) => setUid(e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>}
          <Field label={`PIN${users.length === 1 ? ` · ${users[0].name}` : ''}`} type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
        </>}
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Back to bill</Btn>{users.length > 0 && <Btn v="primary" type="submit" disabled={busy || !pin}>Approve &amp; save</Btn>}</div>
      </form>
    </Modal>
  );
}

const Row = ({ k, v }) => <div className="flex justify-between"><dt className="text-black/55">{k}</dt><dd className="tabular-nums">{v}</dd></div>;

// "3*whey" or "3*8901234567890" adds three. ↑ on an empty box jumps to the last line.
const QTY = /^\s*(\d+(?:\.\d+)?)\s*[*x×]\s*(.*)$/i;
function ItemSearch({ items, onPick, inputRef, purchase, onUp }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [, mult, term] = q.match(QTY) || [null, 1, q];
  const res = useMemo(() => {
    const s = term.trim().toLowerCase();
    if (!s) return [];
    const words = s.split(/\s+/);
    return items.filter((i) => words.every((w) => `${i.name} ${i.sku} ${i.barcode} ${i.brand}`.toLowerCase().includes(w))).slice(0, 12);
  }, [term, items]);
  useEffect(() => setHi(0), [q]);
  const pick = (it) => { onPick(it, +mult || 1); setQ(''); };
  const onKey = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return; // Ctrl+Enter, Alt+N… belong to the bill, not the search box
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, res.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (!res.length) onUp?.(); else setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Escape') setQ('');
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = term.trim();
      const exact = items.find((i) => i.barcode && i.barcode === t) || items.find((i) => i.sku?.toLowerCase() === t.toLowerCase());
      const it = exact || res[hi];
      if (it) pick(it); else if (t) toast('No item matches ' + t, 'err');
    }
  };
  return (
    <div className="relative">
      <input ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
        placeholder="Scan barcode or search item, brand, SKU…  (F2)" className="input py-3 pl-10 text-base" aria-label="Search items"
        role="combobox" aria-expanded={res.length > 0} aria-controls="item-results" aria-activedescendant={res[hi] ? `item-${res[hi].id}` : undefined} />
      {+mult > 1 && term === '' && <span className="absolute right-3 top-3.5 text-xs font-semibold text-brand-d">× {mult} — now scan or type the item</span>}
      <svg className="absolute left-3 top-3.5 h-5 w-5 text-black/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      {res.length > 0 && (
        <ul id="item-results" role="listbox" className="rise absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-[14px] border border-black/10 bg-white py-1 shadow-xl">
          {res.map((i, k) => (
            <li key={i.id} id={`item-${i.id}`} role="option" aria-selected={k === hi} onMouseDown={(e) => { e.preventDefault(); pick(i); }} onMouseEnter={() => setHi(k)}
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

// Type a name or the phone number, ↑ ↓ to choose, Enter to pick (focus goes back to the item search), Esc to leave it as it was.
function PartyPick({ list, value, onChange, cash, onDone }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const digits = q.replace(/\D/g, '');
  const res = list.filter((p) => `${p.name} ${p.phone || ''}`.toLowerCase().includes(q.toLowerCase()) || (digits.length >= 4 && String(p.phone || '').replace(/\D/g, '').includes(digits))).slice(0, 8);
  const opts = [...(cash && !q ? [null] : []), ...res]; // null = Cash Sale (walk-in)
  useEffect(() => setHi(0), [q]);
  const choose = (p) => { onChange(p); setOpen(false); onDone?.(); };
  const keys = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, opts.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && open && opts.length) { e.preventDefault(); choose(opts[hi]); }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); onDone?.(); }
  };
  return (
    <div className="relative">
      <input className="input" data-key="party" value={open ? q : value?.name || (cash ? 'Cash Sale (walk-in)' : '')} placeholder="Phone number or name  (F3)"
        role="combobox" aria-expanded={open} aria-controls="party-results" aria-activedescendant={open && opts.length ? `party-${hi}` : undefined}
        onFocus={() => { setOpen(true); setQ(''); }} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={keys} />
      {open && (
        <ul id="party-results" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-[14px] border border-black/10 bg-white py-1 shadow-xl">
          {opts.map((p, k) => (
            <li key={p?.id || 'cash'} id={`party-${k}`} role="option" aria-selected={k === hi} onMouseEnter={() => setHi(k)} onMouseDown={() => choose(p)}
              className={cx('flex cursor-pointer justify-between px-3 py-2 text-sm', k === hi && 'bg-brand/25')}>
              {p ? <><span>{p.name} <span className="text-black/45">{p.phone}</span></span><Money v={p.balance} className={cx('text-xs', p.balance > 0 ? 'text-amber-700' : 'text-black/40')} /></> : 'Cash Sale (walk-in)'}
            </li>
          ))}
          {!opts.length && <li className="px-3 py-2 text-sm text-black/40">No match — use “+ New”</li>}
        </ul>
      )}
    </div>
  );
}

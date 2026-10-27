// JSON files for the government portals, built from plain rows like reports.js (both back ends and the UI use them).
// GSTR-1: upload on gst.gov.in (Returns → GSTR-1 → Prepare offline → Upload) or open in the GST Offline Tool.
// E-way bill: ewaybillgst.gov.in → e-Waybill → Bulk generation.
// ponytail: field names follow the portal's published schemas; validate the first month's file in the Offline Tool before filing.
import { round2 } from './index.js';

const dmy = (d) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : '');
const add = (a, b) => { for (const k of ['txval', 'iamt', 'camt', 'samt']) a[k] = round2((a[k] || 0) + (b[k] || 0)); return a; };
const group = (a, key) => { const m = new Map(); for (const x of a) { const k = key(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; };

// Tax of one line split the way the bill was taxed. sign -1 for credit notes netted into B2CS / HSN.
function det(inv, l, sign = 1) {
  const tax = Number(l.tax) || 0, inter = Number(inv.igst) > 0;
  return { txval: round2(sign * l.taxable), rt: Number(l.gst_rate) || 0, iamt: inter ? round2(sign * tax) : 0,
    camt: inter ? 0 : round2((sign * tax) / 2), samt: inter ? 0 : round2((sign * tax) / 2), csamt: 0 };
}
const itms = (inv, lines) => [...group(lines, (l) => Number(l.gst_rate) || 0)].map(([rt, ls], i) => ({
  num: i + 1, itm_det: ls.reduce((a, l) => add(a, det(inv, l)), { rt, csamt: 0 }),
}));

// rows(t) = live rows in wire format. Period is the month of `from` (GSTR-1 is monthly or quarterly; pass the whole period).
export function gstr1Json(rows, branch, { from, to }) {
  const br = rows('branches').find((b) => b.id === branch) || {};
  const invs = rows('invoices').filter((i) => i.branch_id === branch && i.date >= from && i.date <= to && ['sale', 'sale_return'].includes(i.type));
  const live = invs.filter((i) => i.status !== 'cancelled');
  const lines = group(rows('invoice_lines').filter((l) => live.some((i) => i.id === l.invoice_id)), (l) => l.invoice_id);
  const ls = (i) => lines.get(i.id) || [];
  const pos = (i) => i.party_state || br.state_code;
  const reg = (i) => !!String(i.party_gstin || '').trim();
  const inter = (i) => pos(i) !== br.state_code;
  const sales = live.filter((i) => i.type === 'sale'), notes = live.filter((i) => i.type === 'sale_return');

  const b2b = [...group(sales.filter(reg), (i) => i.party_gstin.toUpperCase())].map(([ctin, is]) => ({
    ctin, inv: is.map((i) => ({ inum: i.no, idt: dmy(i.date), val: i.total, pos: pos(i), rchrg: 'N', inv_typ: 'R', itms: itms(i, ls(i)) })),
  }));
  // B2C large: inter-state to unregistered buyers above ₹1 lakh per invoice
  const isB2cl = (i) => !reg(i) && inter(i) && i.total > 100000;
  const b2cl = [...group(sales.filter(isB2cl), pos)].map(([p, is]) => ({
    pos: p, inv: is.map((i) => ({ inum: i.no, idt: dmy(i.date), val: i.total, itms: itms(i, ls(i)) })),
  }));
  // B2C small: everything else to unregistered buyers, net of their credit notes, per place of supply and rate
  const small = new Map();
  for (const i of [...sales.filter((i) => !reg(i) && !isB2cl(i)), ...notes.filter((i) => !reg(i))]) for (const l of ls(i)) {
    const d = det(i, l, i.type === 'sale_return' ? -1 : 1), k = `${pos(i)}|${d.rt}`;
    small.set(k, add(small.get(k) || { sply_ty: inter(i) ? 'INTER' : 'INTRA', pos: pos(i), typ: 'OE', rt: d.rt, csamt: 0 }, d));
  }
  const b2cs = [...small.values()].filter((x) => x.txval);
  const cdnr = [...group(notes.filter(reg), (i) => i.party_gstin.toUpperCase())].map(([ctin, is]) => ({
    ctin, nt: is.map((i) => ({ ntty: 'C', nt_num: i.no, nt_dt: dmy(i.date), val: i.total, pos: pos(i), rchrg: 'N', inv_typ: 'R', itms: itms(i, ls(i)) })),
  }));
  // HSN summary (table 12), split B2B / B2C
  const hsn = (pick) => {
    const m = new Map();
    for (const i of live.filter(pick)) for (const l of ls(i)) {
      const sign = i.type === 'sale_return' ? -1 : 1, d = det(i, l, sign), k = `${l.hsn || ''}|${d.rt}`;
      const e = m.get(k) || { hsn_sc: l.hsn || '', desc: l.name?.slice(0, 30) || '', uqc: 'NOS', qty: 0, rt: d.rt, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
      e.qty = round2(e.qty + sign * l.qty);
      m.set(k, add(e, d));
    }
    return [...m.values()].map((e, n) => ({ num: n + 1, ...e }));
  };
  // Documents issued (table 13): invoice and credit note series
  const series = (type, doc_num) => {
    const all = invs.filter((i) => i.type === type).sort((a, b) => String(a.no).localeCompare(String(b.no), 'en', { numeric: true }));
    if (!all.length) return null;
    const cancel = all.filter((i) => i.status === 'cancelled').length;
    return { doc_num, docs: [{ num: 1, from: all[0].no, to: all.at(-1).no, totnum: all.length, cancel, net_issue: all.length - cancel }] };
  };
  return {
    gstin: (br.gstin || '').toUpperCase(), fp: from.slice(5, 7) + from.slice(0, 4), version: 'GST3.2.1', hash: 'hash',
    b2b, b2cl, b2cs, cdnr,
    hsn: { hsn_b2b: hsn((i) => reg(i)), hsn_b2c: hsn((i) => !reg(i)) },
    doc_issue: { doc_det: [series('sale', 1), series('sale_return', 5)].filter(Boolean) },
  };
}

const pin = (s) => Number(String(s || '').match(/\b\d{6}\b/)?.[0]) || 0;

// One e-way bill for a sale invoice (needed when goods worth over ₹50,000 move). t = transport details typed in the POS.
export function ewayJson(inv, branch, party, t = {}) {
  const inter = Number(inv.igst) > 0;
  const to = party || {};
  const hsns = group(inv.lines, (l) => l.hsn || '');
  return {
    version: '1.0.0621',
    billLists: [{
      userGstin: (branch.gstin || '').toUpperCase(), supplyType: 'O', subSupplyType: 1, subSupplyDesc: '', docType: 'INV',
      docNo: inv.no, docDate: inv.date.slice(8, 10) + '/' + inv.date.slice(5, 7) + '/' + inv.date.slice(0, 4),
      fromGstin: (branch.gstin || '').toUpperCase(), fromTrdName: branch.name, fromAddr1: branch.address || '', fromAddr2: '', fromPlace: t.from_place || '',
      fromPincode: pin(branch.address) || Number(t.from_pincode) || 0, fromStateCode: Number(branch.state_code), actualFromStateCode: Number(branch.state_code),
      toGstin: (inv.party_gstin || 'URP').toUpperCase(), toTrdName: inv.party_name, toAddr1: inv.ship_to || to.address || '', toAddr2: '', toPlace: t.to_place || '',
      toPincode: pin(inv.ship_to || to.address) || Number(t.to_pincode) || 0, toStateCode: Number(inv.party_state || branch.state_code), actualToStateCode: Number(inv.party_state || branch.state_code),
      transactionType: 1, totalValue: inv.taxable, cgstValue: inv.cgst, sgstValue: inv.sgst, igstValue: inv.igst, cessValue: 0, cessNonAdvolValue: 0,
      otherValue: round2(inv.total - inv.taxable - inv.cgst - inv.sgst - inv.igst), totInvValue: inv.total,
      transMode: Number(t.mode) || 1, transDistance: Number(t.distance) || 0, transporterName: t.transporter || '', transporterId: (t.transporter_id || '').toUpperCase(),
      transDocNo: t.doc_no || '', transDocDate: t.doc_date ? dmy(t.doc_date).replaceAll('-', '/') : '', vehicleNo: (t.vehicle || '').replace(/\s/g, '').toUpperCase(), vehicleType: 'R',
      mainHsnCode: Number([...hsns].sort((a, b) => b[1].reduce((s, l) => s + l.taxable, 0) - a[1].reduce((s, l) => s + l.taxable, 0))[0]?.[0]) || 0,
      itemList: inv.lines.map((l, i) => ({
        itemNo: i + 1, productName: l.name, productDesc: l.name, hsnCode: Number(l.hsn) || 0, quantity: l.qty, qtyUnit: 'NOS', taxableAmount: l.taxable,
        sgstRate: inter ? 0 : l.gst_rate / 2, cgstRate: inter ? 0 : l.gst_rate / 2, igstRate: inter ? l.gst_rate : 0, cessRate: 0, cessNonadvol: 0,
      })),
    }],
  };
}

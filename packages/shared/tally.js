// Tally Prime / ERP 9 bridge, like Vyapar's "Export To Tally" and "Import From Tally".
// Export: vouchers + party ledgers as Tally import XML (Gateway of Tally → Import → Transactions).
// Import: a Tally masters export (Display More Reports → List of Accounts → Export as XML) → rows for Utilities → Import.
import { round2, STATES } from './index.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const amt = (n) => round2(n).toFixed(2);
const MODE_LEDGER = { cash: 'Cash', cod: 'Cash', upi: 'UPI Collections', card: 'Card Collections', bank: 'Bank Account', cheque: 'Bank Account',
  online: 'Online Collections', points: 'Loyalty Points Redeemed' };

// Tally signs: debit = negative, credit = positive. Each voucher's entries sum to zero.
function entries(v) {
  const party = v.party || 'Cash';
  const sale = v.type === 'sale' || v.type === 'sale_return', s = v.type === 'sale' || v.type === 'purchase_return' ? 1 : -1;
  const io = sale ? 'Output' : 'Input';
  return [
    [party, -s * v.total],
    [sale ? 'Sales' : 'Purchase', s * v.taxable],
    [`${io} CGST`, s * v.cgst], [`${io} SGST`, s * v.sgst], [`${io} IGST`, s * v.igst],
    [sale ? 'TCS Payable' : 'TCS Receivable', s * (v.tcs || 0)],
    ['Round Off', s * (v.round_off || 0)],
  ].filter(([, a]) => round2(a));
}
function payEntries(y) {
  const s = y.direction === 'in' ? 1 : -1, bank = MODE_LEDGER[y.mode] || 'Cash';
  return [[y.party || y.ledger, s * (y.amount + (y.tds || 0))], [bank, -s * y.amount], [y.direction === 'in' ? 'TDS Receivable' : 'TDS Payable', -s * (y.tds || 0)]].filter(([, a]) => round2(a));
}
const VCH = { sale: 'Sales', purchase: 'Purchase', sale_return: 'Credit Note', purchase_return: 'Debit Note', in: 'Receipt', out: 'Payment' };

const ledgerXml = (name, parent, extra = '') =>
  `<TALLYMESSAGE><LEDGER NAME="${esc(name)}" ACTION="Create"><NAME.LIST><NAME>${esc(name)}</NAME></NAME.LIST><PARENT>${esc(parent)}</PARENT>${extra}</LEDGER></TALLYMESSAGE>`;
const voucherXml = (type, date, no, party, list, narration) =>
  `<TALLYMESSAGE><VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${date.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>` +
  `<VOUCHERNUMBER>${esc(no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME><NARRATION>${esc(narration)}</NARRATION>` +
  list.map(([l, a]) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(l)}</LEDGERNAME><ISDEEMEDPOSITIVE>${a < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amt(a)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join('') +
  `</VOUCHER></TALLYMESSAGE>`;

// data: REPORTS.tally_export output — { parties, invoices, payments, expenses }
export function toTallyXml({ parties = [], invoices = [], payments = [], expenses = [] }, company = '') {
  const fixed = [['Sales', 'Sales Accounts'], ['Purchase', 'Purchase Accounts'], ['Round Off', 'Indirect Expenses'], ['UPI Collections', 'Bank Accounts'],
    ['Card Collections', 'Bank Accounts'], ['Bank Account', 'Bank Accounts'], ['TCS Payable', 'Duties & Taxes'], ['TCS Receivable', 'Duties & Taxes'],
    ['TDS Payable', 'Duties & Taxes'], ['TDS Receivable', 'Duties & Taxes'], ['Online Collections', 'Bank Accounts'],
    ['Loyalty Points Redeemed', 'Indirect Expenses'], ['Owner Capital', 'Capital Account'],
    ...['Output', 'Input'].flatMap((io) => ['CGST', 'SGST', 'IGST'].map((t) => [`${io} ${t}`, 'Duties & Taxes'])),
    ...[...new Set(expenses.map((e) => e.category || 'Expenses'))].map((c) => [c, 'Indirect Expenses'])];
  const masters = [
    ...fixed.map(([n, p]) => ledgerXml(n, p)),
    ...parties.map((p) => ledgerXml(p.name, p.type === 'supplier' ? 'Sundry Creditors' : 'Sundry Debtors',
      `<ISBILLWISEON>Yes</ISBILLWISEON>${p.gstin ? `<PARTYGSTIN>${esc(p.gstin)}</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : ''}` +
      `${p.state_code ? `<LEDSTATENAME>${esc(STATES[p.state_code])}</LEDSTATENAME>` : ''}${p.phone ? `<LEDGERMOBILE>${esc(p.phone)}</LEDGERMOBILE>` : ''}` +
      `${p.address ? `<ADDRESS.LIST><ADDRESS>${esc(p.address)}</ADDRESS></ADDRESS.LIST>` : ''}`)),
  ];
  const vouchers = [
    ...invoices.map((v) => voucherXml(VCH[v.type], v.date, v.no, v.party || 'Cash', entries(v), v.party ? '' : 'Counter sale')),
    ...payments.map((y) => voucherXml(VCH[y.direction], y.date, '', y.party || y.ledger, payEntries(y), y.note || '')),
    ...expenses.map((e) => voucherXml('Payment', e.date, '', e.category || 'Expenses',
      [[e.category || 'Expenses', -e.amount], [MODE_LEDGER[e.mode] || 'Cash', e.amount]], e.note || '')),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>` +
    `<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME>${company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : ''}</REQUESTDESC>` +
    `<REQUESTDATA>\n${[...masters, ...vouchers].join('\n')}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
export const voucherEntries = { entries, payEntries }; // for tests

// ---------- Import ----------
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t.replace('.', '\\.')}(?:\\s[^>]*)?>([^<]*)</${t.replace('.', '\\.')}>`)); return m ? unesc(m[1]) : ''; };
const tags = (xml, t) => [...xml.matchAll(new RegExp(`<${t}(?:\\s[^>]*)?>([^<]*)</${t}>`, 'g'))].map((m) => unesc(m[1]));
const blocks = (xml, t) => [...xml.matchAll(new RegExp(`<${t} NAME="([^"]*)"[^>]*>([\\s\\S]*?)</${t}>`, 'g'))].map((m) => [unesc(m[1]), m[2]]);
const num = (s) => { const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : 0; };

// Rows keyed like a CSV export, so Utilities → Import maps them the same way (see COLS there).
export function parseTally(xml, kind) {
  if (kind === 'parties') return blocks(xml, 'LEDGER').map(([name, b]) => [name, b, tag(b, 'PARENT')]).filter(([, , parent]) => /sundry (debtors|creditors)/i.test(parent))
    .map(([name, b, parent]) => {
      const ob = num(tag(b, 'OPENINGBALANCE')); // Tally: negative = debit = they owe us
      return { Name: name, Phone: tag(b, 'LEDGERMOBILE') || tag(b, 'LEDGERPHONE'), Email: tag(b, 'EMAIL'), Address: tags(b, 'ADDRESS').join(', '),
        GSTIN: tag(b, 'PARTYGSTIN') || tag(b, 'GSTIN'), State: tag(b, 'LEDSTATENAME') || tag(b, 'STATENAME'),
        'Party type': /creditors/i.test(parent) ? 'Supplier' : 'Customer', 'Receivable balance': ob < 0 ? -ob : 0, 'Payable balance': ob > 0 ? ob : 0 };
    });
  return blocks(xml, 'STOCKITEM').map(([name, b]) => {
    const qty = num(tag(b, 'OPENINGBALANCE')), value = Math.abs(num(tag(b, 'OPENINGVALUE')));
    const rates = Object.fromEntries([...b.matchAll(/<GSTRATEDUTYHEAD>([^<]*)<\/GSTRATEDUTYHEAD>[\s\S]*?<GSTRATE>([^<]*)<\/GSTRATE>/g)].map((m) => [m[1].trim(), num(m[2])]));
    return { Name: name, Category: tag(b, 'PARENT').replace(/^Primary$/, ''), Unit: tag(b, 'BASEUNITS'), HSN: tag(b, 'HSNCODE'),
      'GST rate': rates['Integrated Tax'] ?? rates.IGST ?? (rates['Central Tax'] ?? 0) * 2, MRP: num(tag(b, 'MRPRATE')) || '',
      'Purchase price': num(tag(b, 'OPENINGRATE')) || (qty ? round2(value / qty) : ''), 'Opening stock': qty || '' };
  });
}

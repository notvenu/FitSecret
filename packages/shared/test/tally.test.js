import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTallyXml, parseTally, voucherEntries } from '../tally.js';

const zero = (es) => Math.round(es.reduce((s, [, a]) => s + a, 0) * 100) || 0; // -0 → 0

test('every Tally voucher balances (debits = credits)', () => {
  const inv = { taxable: 847.46, cgst: 76.27, sgst: 76.27, igst: 0, round_off: 0, tcs: 1, total: 1001, party: 'Ravi' };
  for (const type of ['sale', 'purchase', 'sale_return', 'purchase_return']) assert.equal(zero(voucherEntries.entries({ ...inv, type })), 0, type);
  assert.equal(zero(voucherEntries.payEntries({ direction: 'in', amount: 900, tds: 100, mode: 'upi', party: 'Ravi' })), 0);
  const sale = voucherEntries.entries({ ...inv, type: 'sale' });
  assert.ok(sale.find(([l, a]) => l === 'Ravi' && a < 0), 'customer is debited on a sale');
  const xml = toTallyXml({ parties: [{ name: 'Ravi & Co', gstin: '37ABCDE1234F1Z5', state_code: '37' }], invoices: [{ ...inv, type: 'sale', date: '2026-10-22', no: 'VJA/26-27/0001' }] });
  assert.match(xml, /<LEDGER NAME="Ravi &amp; Co" ACTION="Create">/);
  assert.match(xml, /<DATE>20261022<\/DATE><VOUCHERTYPENAME>Sales/);
});

test('Tally masters export → import rows', () => {
  const xml = `<ENVELOPE><TALLYMESSAGE><LEDGER NAME="Sri Ram Traders" RESERVEDNAME=""><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE>5000.00</OPENINGBALANCE>
    <PARTYGSTIN>37AAAAA1111A1Z5</PARTYGSTIN><LEDSTATENAME>Andhra Pradesh</LEDSTATENAME><ADDRESS.LIST><ADDRESS>Main Rd</ADDRESS><ADDRESS>Guntur</ADDRESS></ADDRESS.LIST></LEDGER>
    <LEDGER NAME="Ravi"><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE>-1200.00</OPENINGBALANCE><LEDGERMOBILE>9000000001</LEDGERMOBILE></LEDGER>
    <LEDGER NAME="Sales"><PARENT>Sales Accounts</PARENT></LEDGER>
    <STOCKITEM NAME="Whey 1kg &amp; Shaker"><PARENT>Protein</PARENT><BASEUNITS>Nos</BASEUNITS><OPENINGBALANCE> 10 Nos</OPENINGBALANCE><OPENINGVALUE>-25000.00</OPENINGVALUE>
    <HSNCODE>2106</HSNCODE><GSTRATEDUTYHEAD>Central Tax</GSTRATEDUTYHEAD><GSTRATE>9</GSTRATE><GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD><GSTRATE>18</GSTRATE></STOCKITEM></TALLYMESSAGE></ENVELOPE>`;
  const parties = parseTally(xml, 'parties');
  assert.equal(parties.length, 2);
  assert.deepEqual([parties[0]['Party type'], parties[0]['Payable balance'], parties[0].Address], ['Supplier', 5000, 'Main Rd, Guntur']);
  assert.equal(parties[1]['Receivable balance'], 1200);
  const [it] = parseTally(xml, 'items');
  assert.deepEqual([it.Name, it.Category, it['GST rate'], it['Opening stock'], it['Purchase price'], it.HSN], ['Whey 1kg & Shaker', 'Protein', 18, 10, 2500, '2106']);
});

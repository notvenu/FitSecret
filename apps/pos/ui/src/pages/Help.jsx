import { useState } from 'react';
import { Page, cx } from '../ui.jsx';

// Staff guide, written for the shop counter. Keep it in sync with what the screens actually do.
const S = [
  ['online', 'Online orders', [
    ['Where they appear', 'Website orders arrive in Online Orders within about 10 seconds (the sidebar shows “Cloud synced”). Press “Fetch new orders” to check immediately. New orders sit under the “New” filter.'],
    ['Stock is already reserved', 'The moment a customer orders, those items are taken out of website stock, so two people can’t buy the last unit. You do not need to bill it again.'],
    ['Work an order', 'Open the order and move it along: Mark Confirmed → Mark Packed → type the courier name, AWB number and tracking link → Mark Shipped → Mark Out for delivery → Mark Delivered. Every step updates the customer’s tracking page on the website.'],
    ['Paid online or COD', 'Online-paid orders show “online · paid”. If a customer closed the payment window, the order shows “Awaiting payment” and can’t be packed until they pay from their tracking page. Cash-on-delivery orders are marked paid automatically when you mark them Delivered.'],
    ['Invoice', 'Press “Generate invoice” to create the GST invoice for the order and print it (A4) to put in the parcel. This does not reduce stock a second time. Press “Print invoice” later to reprint.'],
    ['Cancel', 'Cancel is available until the order is shipped. It puts the stock back and shows “Cancelled” to the customer. Add a reason when asked.'],
    ['Talk to the customer', 'Use the WhatsApp link on the order to send a status update, or the phone number to call.'],
  ]],
  ['website', 'Controlling the website', [
    ['What shows online', 'Every item with “Sell on website” ticked (Inventory → Edit) is on the website. Untick it to hide an item. Price, MRP, photo (Image URL) and description come from the same screen.'],
    ['Website stock', 'The website shows the stock of this branch. When stock reaches 0 the item shows “Out of stock” and can’t be ordered. Receive stock with a Purchase entry or Inventory → Stock ±.'],
    ['Featured items', 'Tick “Featured” to push an item to the front of “Popular right now” on the homepage.'],
    ['Categories', 'Inventory → Categories. Add a subcategory by choosing “Inside …”. Move an item by editing it and picking a new category.'],
    ['Sizes and flavours', 'Items with the same “Product group” show as one product with size/flavour buttons on the website.'],
    ['How fast changes appear', 'Edits sync to the cloud within seconds and show on the website within about a minute.'],
  ]],
  ['billing', 'Billing at the counter', [
    ['New sale', 'Press F1 (or New Sale). Scan the barcode, or type part of the name, SKU or brand and press Enter. Arrow keys pick from the list.'],
    ['Save', 'F9 saves and prints the receipt. Ctrl+Enter saves without printing. Choose Cash / UPI / Card / Bank first.'],
    ['Customer and credit', 'Leave “Cash Sale” for walk-ins. To sell on credit or take a part payment, pick or add the customer (+ New); the balance goes to their account.'],
    ['GST', 'Prices include GST. CGST/SGST are split automatically; a customer from another state gets IGST.'],
    ['Batches', 'Stock is sold earliest-expiry first automatically.'],
    ['Returns and estimates', 'Use the Sale Return tab for returns (stock goes back) and Estimate for quotations (no stock change).'],
    ['Mistakes', 'An admin can open the invoice (Invoices) and Cancel it. Stock and payments are reversed.'],
  ]],
  ['stock', 'Stock and purchases', [
    ['Receiving stock', 'Purchase → pick the supplier → add items with batch number and expiry → enter the supplier bill number → Save. This adds stock and updates the item’s cost.'],
    ['Corrections', 'Inventory → Stock ± for damaged, expired or found stock. Always add a reason.'],
    ['Alerts', 'The dashboard shows low-stock items and batches expiring in 60 days. Reports → Expiring soon lists them.'],
    ['History', 'Click any item in Inventory to see its batches and every stock movement.'],
  ]],
  ['money', 'Customers, suppliers and money', [
    ['Dues', 'Parties shows what each customer owes (orange) and what you owe suppliers. Click a name for the full ledger.'],
    ['Receive or pay', 'Press Payment on the party, or “Receive” on an unpaid invoice.'],
    ['Reminders', '“Remind” sends a polite WhatsApp message with the pending amount.'],
    ['Expenses', 'Record rent, salaries, electricity and other costs in Expenses so Profit & Loss is accurate.'],
  ]],
  ['reports', 'Reports and GST', [
    ['Daily close', 'Reports → Day book shows the day’s bills, payments, expenses and net cash/UPI.'],
    ['GST filing', 'Reports → GST gives B2B invoices, B2C totals by rate and the HSN summary for GSTR-1, plus output tax vs input tax credit. Export each table as CSV for your accountant.'],
    ['Profit', 'Reports → Profit & Loss uses the item cost at the time of sale. Costs fill in as you enter purchases.'],
  ]],
  ['system', 'Staff, sync and backups', [
    ['Users', 'Settings → Staff & PINs. Cashiers can bill, see stock and handle online orders. Admins can also edit items, cancel invoices, see GST/P&L and change settings. Press Lock when you leave the counter.'],
    ['No internet?', 'Keep billing. The sidebar shows “Offline, billing locally” and a count of changes waiting. Everything uploads by itself when the internet returns.'],
    ['Backups', 'A backup is saved automatically every 6 hours. Settings → Download backup now saves a copy; keep one on a USB drive or Google Drive every week.'],
    ['More counters', 'Other billing PCs on the shop Wi-Fi can open this same screen; ask whoever set it up for the address.'],
  ]],
];

export default function Help() {
  const [open, setOpen] = useState('online');
  const sec = S.find(([k]) => k === open);
  return (
    <Page title="Help">
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-60 lg:flex-col">
          {S.map(([k, t]) => (
            <button key={k} onClick={() => setOpen(k)} className={cx('rounded-full px-3.5 py-2 text-left text-sm', open === k ? 'bg-ink text-white' : 'hover:bg-black/5')}>{t}</button>
          ))}
        </nav>
        <div className="card min-w-0 flex-1 divide-y divide-line">
          {sec[2].map(([h, b]) => (
            <div key={h} className="grid gap-1 px-6 py-5 md:grid-cols-[220px_1fr] md:gap-8">
              <h3 className="font-semibold">{h}</h3>
              <p className="leading-relaxed text-black/70">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}

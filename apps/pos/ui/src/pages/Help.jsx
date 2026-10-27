import { useState } from 'react';
import { SideNav, SectionPage } from '../ui.jsx';

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
    ['Returns', 'Open the bill (Sale Invoices) and press Return. Remove what is not coming back and save: stock goes back and the credit note prints “Against invoice …”. You can never return more than was sold.'],
    ['Exchange', 'On the return, pick EXCHANGE instead of cash. The new sale opens with that credit already on it; the customer pays only the difference. Unused credit stays on the return for next time.'],
    ['Mistakes', 'Open the bill and press Edit: same number, stock and money are corrected, and the change (who, when, why) is kept in Reports → Audit Trail. Cancel asks for a reason too.'],
    ['Discounts', 'Type ₹200 or 10% in “Discount on bill”, or a coupon code. Click the Disc% heading to type line discounts in ₹. The owner can cap cashier discounts in Settings.'],
    ['Changing a price', 'Type a new rate on the line. Higher is fine (never above MRP). Lower than usual shows “Usual ₹…”; depending on Settings → Staff the owner types their PIN on the spot, it is allowed, or it is blocked. Every lowered price goes in Reports → Audit Trail.'],
    ['Offers at the counter', 'Counter coupons show as green chips under Coupon: tap one. Combos and near-expiry offers apply by themselves. In Offers (main menu or Online Store) each coupon and combo is set to Counter & website, Counter only or Website only.'],
    ['Reminders on Home', 'Home → Reminders lists customers who owe you (overdue first, then due this week) with a WhatsApp “Remind” button, and supplier bills due soon with “Pay”. It also flags lab reports about to expire and a missed day close.'],
    ['Cash & Bank', 'Cash & Bank → All accounts shows cash in hand, bank & UPI and cheques not yet deposited. One tap: Deposit cash in bank, Withdraw cash, Owner puts in / takes out. Add each bank account and tick what it is used for. Money in: UPI, card machine, bank transfers from customers (these count in that account’s balance and statement) and where received cheques are deposited. Money out: suppliers, expenses, salaries and your cheque book (those forms start with that account). Each use belongs to one account.'],
    ['Cheques', 'Record a cheque like any payment: Payment-In / Payment-Out → Mode: Cheque, with the cheque number and the date written on it (a later date = post-dated). Cash & Bank → Cheques lists them all. Received: Deposit (pick the bank; not before the cheque’s date) → Cleared. Given: Cleared when it leaves your bank. Bounced: the party owes (or is owed) again, the bill goes back to unpaid, any deposit is taken back out, and the cheque stays in the list marked Bounced. Add bank charges in Expenses.'],
    ['Product photo', 'Items → New item / Edit → Add photo (or paste a photo link). The photo shows in the item list and on the website.'],
    ['Website changes not showing', 'The website only sees what reaches the cloud. If the sidebar says “Sync error”, the reason is written under it; until it clears, switches like Paused / On website don’t reach the site.'],
    ['Companies', 'Main menu → Companies & Branches → + Add company: its name, the legal name printed on bills, and its GSTIN. Put branches and warehouses in it (Edit a branch → Company, or “Make these a company”). The switcher at the top of every screen moves this counter to any branch of any company. Bills print the company’s legal name with the branch under it. Bills → Branch → “Whole company” shows every bill of one company.'],
    ['Settings with companies', 'Settings → Company details: legal name and GSTIN, shared by every branch of the company (branches without their own GSTIN use it). Branch details: this branch only. Billing, printing, staff, customers and insights are per branch: set them once, then “Copy settings to other branches”. The line at the top of Settings says what you are changing.'],
    ['What a cashier can do', 'Staff → Logins & PINs → Edit a cashier → What they can do. New cashiers start on Counter (billing, day close, looking up items, adding a customer). Pick Senior cashier or Manager for more, then tick or untick: which screens they can open (purchases, payments, expenses, reports, online store, cash & bank…) and what they can change (items, stock, transfers, editing / cancelling bills, deleting, seeing cost price & profit). The menu hides what is off and the counter refuses it even from a link. Changes apply straight away, without signing in again. Billing customers is always allowed.'],
    ['Loyalty points everywhere', 'A customer has one points balance for every branch and the website. At the counter: pick the customer, press Redeem. On the website: the customer signs in (My account, with the email saved on their customer record) and ticks “Use my loyalty points” at checkout; the bill for that order records the points. Points already used on a website order can’t be spent again at the counter.'],
    ['Overview of everything', 'The switcher at the top: “All companies & branches” or “All of <company>” opens the overview with combined stock, sales and bills, then each company and branch. Picking a branch under “Work at” makes this counter bill as that branch.'],
    ['Sign-in safety', 'Pick your name on the lock screen and type your PIN. After 5 wrong PINs that login is locked for 5 minutes (longer each time); too many wrong PINs from one PC lock it too. The owner can still sign in.'],
    ['Who can work where', 'Staff → Logins & PINs → Edit a cashier → Can work at: tick branches (or a whole company). They are only offered on, and can only unlock, a counter set to one of those; with several ticked they can switch between them at the top of the screen. Nothing ticked = every branch. Owners always work everywhere. What cashiers may do (discount limit, price changes, editing bills) is set per branch in the same section; copy it to other branches with “Copy settings to other branches”.'],
    ['Items in several companies', 'Items are one list. With more than one company, the item form has “Sold by”: tick the companies that sell it (none ticked = every company). A new item starts as this company’s only. Billing and the item list show only what this company sells; Items → “All companies’ items” shows everything. Stock is still kept per branch.'],
    ['Branches & warehouses', 'Main menu → Branches & Warehouses. Add a store or a warehouse, see stock and sales at each, and move stock between any two (Transfer stock: many items at once, earliest expiry first). “Restock this store” lists what is low here and brings it from the warehouse in one click. Bills → Branch shows another branch, or all of them. “Work here” makes this counter bill as that location. Reports → Sales by Branch compares them.'],
    ['New product with batch and report', 'Items → New item has a “Stock, batch & testing report” box: opening quantity, batch no., expiry and the lab report (link or PDF upload). They save with the item, and the report shows on the website.'],
    ['Offers on the website', 'Public coupons, combos and banners show on the home page’s Offers board, each marked In store & online, In store only or Online only. For a banner, choose where its offer works in Online Store → Banners.'],
    ['Customer details', 'For a walk-in, open “Customer details” to add a name and phone (both optional; they print on the bill). Tick “Save as customer” to add them to Parties with email, GSTIN and address. A phone that is already a customer offers to use that customer.'],
    ['Cash', 'Tap ₹500 / ₹2000 under the cash box for the note handed over; the change to return shows in big green.'],
    ['Near expiry', 'An orange “Expires in 40d · give 10% off” on a line means that batch should go first. Tap it to apply the discount.'],
    ['Quick Billing', 'Main menu → Quick Billing (Alt+B): full-screen billing. Several bills can be open at once (Alt+N). Half-made bills survive a refresh or power cut.'],
    ['Day close', 'Sale → Day Close at closing time. Count notes in the box on the right, check UPI / card against the settlement, press Close the day. A cash shortage or excess is posted so tomorrow starts right. Print Z report for the file.'],
  ]],
  ['stock', 'Stock and purchases', [
    ['Receiving stock', 'Purchase → pick the supplier → add items with batch number and expiry → enter the supplier bill number → Save. This adds stock and updates the item’s cost.'],
    ['Corrections', 'Inventory → Stock ± for damaged, expired or found stock. Always add a reason.'],
    ['Alerts', 'The dashboard shows low-stock items and batches expiring in 60 days. Reports → Expiring soon lists them.'],
    ['History', 'Click any item in Inventory to see its batches and every stock movement.'],
  ]],
  ['insights', 'Insights and the weekly plan', [
    ['What it is', 'Insights (menu) reads your own bills, stock and payments and says what to do: items about to run out, stock not selling, low-margin items, overdue money, slow days, combos people buy together, and more. Red = act now, amber = watch, green = going well.'],
    ['On other screens', 'Home, Items, Parties, Reports and others show the one or two findings that matter there. Settings → Insights turns this on or off and picks which subjects show. “Hide for today” hides a card until tomorrow.'],
    ['Weekly plan', 'Insights → Overview lists this week’s actions, most urgent and most money first, each with steps. Tick them off as you go; the list starts fresh every Monday. It runs on this PC with fixed rules: no AI service, no key, no cost.'],
  ]],
  ['variants', 'Products, variants and certificates', [
    ['Variants', 'A product with several sizes or flavours (ON Gold Standard whey 907g, 2.27kg, Chocolate, Vanilla…) is one product with variants. The website shows it as one page with size and flavour buttons; each variant keeps its own barcode, price, stock, batches and expiry.'],
    ['Adding one', 'Type the new item’s name: if it matches a product, “Add as a variant” fills in the product details for you. Or open the product row in Items and press “+ Variant”.'],
    ['Find variants', 'Items → Find variants looks through existing items and proposes products to group. Untick anything that isn’t the same product, then press Group. Rows marked “looks like a duplicate” are the same item entered twice: delete the extra one.'],
    ['Certificates', 'Open an item → Certificates & lab reports: add the lab report, COA or FSSAI paper as a link or upload the PDF / photo, for one batch or all. Current ones show on the website product page.'],
  ]],
  ['offers', 'Combos and near-expiry offers', [
    ['Combos', 'Online Store → Offers & combos → Combos: pick two or more items and a combo price. It applies by itself at the counter and on the website, and shows on each item’s product page. It can’t be set below what the items cost you.'],
    ['Near-expiry offers', 'Offers & combos → Near-expiry lists batches close to expiry with a suggested discount (bigger as expiry nears, never below cost + your minimum margin). Nothing is discounted until someone presses Approve.'],
    ['At the counter', 'An approved offer applies by itself to that batch and the bill prints “Near-expiry offer · Expires DD MMM YYYY · Batch”. Print shelf labels from the same screen. Never change the pack’s label or sell anything after its expiry date: expired batches are listed to take off the shelf and are never billed.'],
  ]],
  ['followups', 'Follow-ups (more repeat sales)', [
    ['Refills due', 'Parties → Follow-ups lists customers whose last pack should be running out this week, with a ready WhatsApp message. Set “Lasts (days)” on items (2 kg whey ≈ 45); after a customer buys twice it learns their own rhythm.'],
    ['Not seen lately', 'Regulars with nothing in 60 days. One tap sends a “we miss you” message.'],
    ['Trainers and gyms', 'Put the trainer in “Referred by” (More options on the bill). Reports → Referral Commission works out what you owe them (% in Settings).'],
  ]],
  ['money', 'Customers, suppliers and money', [
    ['Dues', 'Parties shows what each customer owes (orange) and what you owe suppliers. Click a name for the full ledger.'],
    ['Receive or pay', 'Press Payment on the party, or “Receive” on an unpaid invoice.'],
    ['Fix or delete', 'Open any item, party, staff member, expense, payment, account or journal entry (click it, or ↓ then Enter) to edit it; Delete is at the bottom left. Deleted things wait in Utilities → Recycle Bin. A party who still owes money, or an account used in journals, can’t be deleted until that’s settled.'],
    ['Wrong stock count', 'Items → open the item → in Stock history, press Undo next to a Stock ± correction typed by mistake.'],
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
    <SectionPage wide={false} nav={<SideNav title="Help" search placeholder="Find help…  e.g. return, GST" value={open} onChange={setOpen}
      groups={[{ items: S.map(([key, label, rows]) => ({ key, label, words: rows.map(([h, b]) => h + ' ' + b).join(' ') })) }]}
      footer={<p className="mt-2 px-3.5 text-xs text-black/45">Press ? anywhere for the keyboard keys.</p>} />} title={sec[1]}>
        <div className="card min-w-0 divide-y divide-line">
          {sec[2].map(([h, b]) => (
            <div key={h} className="grid gap-1 px-6 py-5 md:grid-cols-[220px_1fr] md:gap-8">
              <h3 className="font-semibold">{h}</h3>
              <p className="leading-relaxed text-black/70">{b}</p>
            </div>
          ))}
        </div>
    </SectionPage>
  );
}

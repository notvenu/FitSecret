# Fit Secrets

Online store + offline-first billing & inventory for Fit Secrets, Vijayawada.

## Brand & catalogue

- Logo (from fitsecretsstore.com, cropped) lives in `apps/web/public/logo.png` and `apps/pos/ui/public/logo.png`.
- Fonts match the current site: Anek Latin (headings) and Satoshi (body, self-hosted in `apps/web/app/fonts`).
- Colours: `--color-ink` / `--color-brand` in `apps/web/app/globals.css` and `apps/pos/ui/src/app.css`.
- Catalogue: `node scripts/import-catalog.mjs` pulls all products, prices, photos and categories from fitsecretsstore.com into
  `packages/shared/catalog.js`. The POS setup imports it; the website uses it until Supabase is connected.
  GST/HSN are category defaults (the old site has none) and cost prices are blank until the first purchase entry. Verify GST with your CA.
- Subcategories (Whey, Creatine, Pre-workout, Nuts, Seeds, Tea & Coffee...) are assigned by name rules in `scripts/import-catalog.mjs` (`SUBS`).
  Items can be moved by hand in POS → Inventory → Edit; new subcategories via Inventory → Categories ("Inside …").
- Brand logos for the homepage background live in `apps/web/public/brands` and are listed in `apps/web/lib/brand-logos.ts`.
  They were taken from each brand's official site; brands without a clean logo are left out. Add more by dropping a file and adding a line.

```
apps/web        Next.js storefront (shop, cart, checkout, order tracking, customer accounts)
apps/pos        Billing / inventory / GST / online-order desk. Node + SQLite, runs on the shop PC
packages/shared Table definitions, GST maths, demo catalogue (used by both apps)
supabase/       Cloud Postgres schema, security policies, sync + ordering functions
```

## Coming from Vyapar

The POS menu uses Vyapar's names, order and Alt-key shortcuts (Alt+S sale, Alt+P purchase, Alt+I payment-in, Ctrl+F Open Anything…; see “Shortcuts” in the top bar).
Sale orders, proforma invoices, delivery challans and purchase orders don't touch stock or money until you **Convert** them. **POS mode** (top bar)
is a full-screen counter with several bills open at once, and the counter remembers it.
Gold-plan features: party credit limits (warning at billing), party-wise item rates (a party's last rate is reused), wholesale price from a
minimum quantity, Check profit on the bill, loyalty points (Parties → Loyalty Points; redeemed as payment mode `points`), and Accounting:
Chart of Accounts, fixed assets, Journal Entries, Account Statements, Balance Sheet and Trial Balance. These need `supabase/migrations/0002_gold.sql`.
Utilities imports Vyapar's item/party export (save the Excel file as CSV) and prints barcode labels. Reports live in `packages/shared/reports.js`,
one implementation used by every POS counter.
Also from Vyapar's settings (Settings → Invoice, print & billing): custom invoice prefixes, UPI QR / bank details / terms on invoices, three A4 layouts,
stop-sale-on-negative-stock, serial/IMEI and mfg dates, TCS on bills, foreign-currency totals and party custom fields. Parties get payment terms (due
dates + overdue badges), shipping address and groups; payments take TDS. Utilities adds Verify My Data, branch stock transfer (Items → Stock ±),
Export To Tally (voucher XML) and Import From Tally (masters XML). Reports add GSTR-3B, GSTR-9, TDS/TCS, Form 27EQ and party-group reports.
These need `supabase/migrations/0003_vyapar_rest.sql`.

**Online Store** (top bar → Online Store, or Alt+W) is a full-screen mode for the website, remembered per counter like POS mode:
orders (with search and status counts), products shown on the site (publish / hide / feature in bulk, photos, descriptions), categories
(order and images used by the site), offers & coupons (checked again by `place_order`), customers (from orders, save to Parties), banners and
the announcement bar, and store settings (taking orders on/off, delivery charge, free-delivery threshold, minimum order, COD limit, which branch
fulfils orders). Settings live in the online branch's `settings.store`. Needs `supabase/migrations/0004_online_store.sql`.
New items are no longer on the website until published in Online Store → Products.
Online Store also has an **Inbox** (product reviews to approve, with a public reply and a *Verified buyer* badge for people who received the
product; Contact-page messages; *Notify me when back in stock* requests with one-tap WhatsApp), bulk order actions, packing slips and
shipping labels (with AWB and order barcodes), staff notes, and refund tracking (a cancelled prepaid order shows *Refund due* until marked
refunded). Needs `supabase/migrations/0005_online_inbox.sql`.

**Live courier tracking** on the website's Track page: set the order's courier to *Shiprocket* or *Delhivery* and enter the AWB in the POS.
The website calls the courier from the server (`apps/web/app/api/shipment`) and shows the scan history and expected delivery date. Add
`SHIPROCKET_EMAIL` + `SHIPROCKET_PASSWORD` (an API user from Shiprocket → Settings → API) and/or `DELHIVERY_API_TOKEN` to the website env.
Responses are cached 10 minutes per AWB. Parsers: `packages/shared/couriers.js`.

**Scanning supplier bills** (Purchase → Scan supplier bill) is free: Tesseract OCR runs in the browser. Internet is needed the first time (about 15 MB
is downloaded, then cached). Every scan opens a review screen. Unmatched lines become new items and an unknown GSTIN becomes a new supplier,
but only after you confirm. Clear, flat photos work best; for PDFs, paste the text or screenshot the page.

**Counter upgrades** (needs `supabase/migrations/0007_counter.sql`): edit a saved bill in place with an audit trail (Reports → Audit Trail),
returns made against the original bill (capped at what was sold, printed “Against invoice …”), exchange credit spent on a new sale,
bill-level discount and coupons at the counter, cashier permissions (max discount, lowering prices: free / owner's PIN / never, who may edit), offers per channel (counter, website or both), branches & warehouses (stock per location, multi-item FEFO transfers, one-click restock from the warehouse, bills and sales across branches), optional walk-in name and phone, Sale → Day Close (Z report;
cash difference posted), Cash & Bank → Reconcile (bank statement CSV), Parties → Follow-ups (refills due, lapsed customers, dues),
referral commission and staff incentive reports, near-expiry markdown hints, batch numbers on printed bills, 58 mm receipts,
GSTR-1 JSON (Reports → GST) and e-way bill JSON (invoice → E-way bill) for the government portals (`packages/shared/gstjson.js`),
a short menu for cashiers and hidden document types (Settings → Counter), Telugu / Hindi menu labels, and a phone layout you can install
as an app. E-invoicing (IRN) is not built: it needs a GSP account and only applies above ₹5 Cr turnover.

**Insights** (menu → Insights, owner only): findings and recommendations per subject (sales, stock, profit, customers, money, staff,
online) worked out offline from the shop's data in `packages/shared/insights.js` (served as the `insights` report by both back ends).
The one or two that matter show on Home, Items, Parties, Reports and other screens; Settings → Insights & AI switches that on and picks subjects.
**Weekly plan** (Insights → Overview): the findings ranked by urgency and money at stake, each with steps (`weeklyPlan` in
`packages/shared/insights.js`). Fixed, readable rules on the shop PC: no AI model, no API key, no internet, no cost, and the same figures
always give the same advice.

**Variants, certificates, offers** (needs `supabase/migrations/0008_variants_offers.sql`): items sharing `group_key` are one product with
size / flavour variants (one page on the website, named without the variant's size / flavour). New items offer "Add as a variant" when their
name matches a product; Items → Find variants groups existing ones after you confirm (`packages/shared/variants.js`). Each variant has its own
batches, expiry and certificates (Items → open an item; a link or an uploaded PDF / photo, stored on the PC and in the public `certificates`
Supabase Storage bucket when sync is on). Online Store → Offers & combos: combos (priced the same by billing and by `place_order`,
`packages/shared/offers.js`) and near-expiry offers suggested per batch (never below cost + minimum margin) that go live only when a person
approves them; the bill prints the expiry date and batch. Expired batches are never sold (billing skips them). Product pages show combos,
"customers also bought" (`also_bought` RPC over shop bills and website orders) and current certificates.

## How the two databases work

- Each store PC keeps a **full SQLite copy** (`apps/pos/data/fitsecret.db`). Billing never waits for the internet.
- Every local write is queued in an outbox automatically (SQLite triggers). Every 10s, and ~1.5s after any change, the POS
  pushes the queue to Supabase and pulls everything newer than its last cursor.
- Conflicts: last edit wins per row. Stock is an append-only ledger of movements, so two counters or branches selling the same item offline
  never overwrite each other. The totals just add up.
- Website orders are placed in Supabase (`place_order` reserves stock atomically), pulled to the POS, and status updates
  (packed, shipped with AWB, delivered) flow back to the customer's tracking page.
- Backups: the POS writes a snapshot every 6 hours (last 30 kept) to `apps/pos/data/backups`, plus a download button in Settings.

## Run locally

```bash
npm install
npm test                      # 25 tests: GST maths, POS API, two-device sync against real Postgres (PGlite)
npm run build -w apps/pos && npm run pos      # POS → http://localhost:4321
cp apps/web/.env.example apps/web/.env.local
npm run web                   # Website → http://localhost:3000 (demo catalogue until Supabase is set)
```

**`/admin` on the website = the Online Orders console** (`apps/web/admin`): staff sign in (Supabase email + password) and work on
website orders (confirm, pack, ship with courier / tracking, deliver, cancel, refunds) and the inbox (reviews, messages, back-in-stock).
Nothing else: billing, stock, money and settings are only on the POS counters, which bill each order on their next sync.
It talks to the database only through `staff_orders`, `staff_update_order`, `staff_inbox`, `staff_inbox_update` (`supabase/migrations/0015_orders_console.sql`).
Add a console login: create the user in Supabase Auth, then `insert into staff (user_id, name, role) values ('<user id>', 'Ravi', 'orders');`.
Role `orders` can't read or change any table or use sync; `staff` / `admin` (the counters' sync account, the owner) keep full access.
`npm run web` (or `npm run build -w apps/web`) builds it into `apps/web/public/admin`.

The POS only answers on its own PC unless Settings → Cloud sync & backup → “Other devices on the shop network” is on (then other PCs on the shop's Wi-Fi open `http://<shop-pc-ip>:4321`; restart the POS after changing it). On Windows, `apps/pos/start-pos.bat` starts it with one double-click.

## Go-live checklist

1. **Create a Supabase project** (Mumbai region). In SQL editor, run `supabase/migrations/0001_init.sql`, then `0002_gold.sql`, `0003_vyapar_rest.sql`, `0004_online_store.sql` and `0005_online_inbox.sql`.
   (Already live? Run only the ones you haven't; they only add columns and tables and are safe to re-run.)
2. **Create the POS sync user**: Authentication → Add user (email + password, auto-confirm). Then in SQL:
   ```sql
   insert into staff (user_id, name, role) select id, 'POS Vijayawada', 'admin' from auth.users where email = 'pos-vja@yourdomain.in';
   ```
3. **Connect the POS**: POS → Settings → Cloud sync → project URL, anon key, that email/password. The sidebar turns green.
4. **Tell the website which branch ships online orders** (after the POS's first sync):
   ```sql
   update shop_config set online_branch_id = (select id from branches where code = 'VJA');
   -- optional: shipping_fee, free_shipping_above, cod_enabled, cod_limit
   ```
5. **Website env** (`apps/web/.env.local` or Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_STORE_PHONE`, and for online payments `NEXT_PUBLIC_RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`,
   and for live tracking `SHIPROCKET_EMAIL` + `SHIPROCKET_PASSWORD` and/or `DELHIVERY_API_TOKEN`.
   Without Razorpay keys the site offers Cash on Delivery only.
6. **Supabase Auth → URL configuration**: add the site URL so customer email sign-in links work.
7. Before launch: replace placeholder reviews (`apps/web/app/page.tsx`) and promo banners (`apps/web/components/Banners.tsx`),
   verify HSN codes / GST rates on every item, add product photos (Image URL field on each item).

## Adding a branch (expansion)

Install the POS on the new branch's PC, connect cloud sync with a new staff user, and run setup with a new branch code (e.g. `GNT`).
Catalogue, parties and online orders are shared; stock, invoices, numbering (`GNT/26-27/0001`) and reports are per branch.

## POS features

Fast barcode billing (F1 new sale, F2 search, F9 save & print), sales / purchases / credit & debit notes / estimates,
GST (CGST+SGST or IGST by place of supply), batch & expiry with first-expiry-first-out selling, low-stock and expiry alerts,
customer/supplier ledgers with WhatsApp reminders, partial payments, expenses, day book, P&L, GSTR-1 summary (B2B, B2C, HSN),
CSV export everywhere, thermal 80mm and A4 invoices, PIN login with admin/cashier roles, online order fulfilment with courier tracking.

## Legal pages

`/terms` and `/privacy` (apps/web/app/terms, apps/web/app/privacy) are templates written for an Indian online store (Consumer Protection Act 2019, DPDP Act 2023). The return window (7 days, sealed packs), refund timeline and grievance contact must be confirmed by the owner and reviewed by a legal adviser before launch.

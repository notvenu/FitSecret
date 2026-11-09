-- Rest of the Vyapar feature set: due dates & payment terms, shipping address, party groups and custom fields,
-- item rack location / model no, serial (IMEI) and mfg date on lines, TCS on invoices, TDS on payments, invoice currency.
-- Safe to run more than once. Run after 0002_gold.sql.
alter table items add column if not exists location text;
alter table items add column if not exists model text;
alter table parties add column if not exists shipping_address text;
alter table parties add column if not exists group_name text;
alter table parties add column if not exists payment_terms integer;
alter table parties add column if not exists extra jsonb;
alter table invoices add column if not exists due_date date;
alter table invoices add column if not exists ship_to text;
alter table invoices add column if not exists party_extra jsonb;
alter table invoices add column if not exists tcs numeric(12,2);
alter table invoices add column if not exists currency text;
alter table invoices add column if not exists fx_rate numeric(14,6);
alter table invoice_lines add column if not exists serial text;
alter table invoice_lines add column if not exists mfg date;
alter table stock_movements add column if not exists mfg date;
alter table payments add column if not exists tds numeric(12,2);

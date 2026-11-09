-- Vyapar Gold features: credit limits, wholesale prices, shop settings (loyalty), Chart of Accounts and Journal Entries.
-- Safe to run more than once. Run after 0001_init.sql.
alter table branches add column if not exists settings jsonb;
alter table items add column if not exists wholesale_price numeric(12,2);
alter table items add column if not exists wholesale_min_qty numeric(12,3);
alter table parties add column if not exists credit_limit numeric(12,2);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  branch_id uuid, name text, type text, opening_balance numeric(12,2) default 0, note text
);
create table if not exists journals (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  branch_id uuid, no text, date date, note text, lines jsonb
);

create or replace function sync_tables() returns text[] language sql immutable as $$
  select array['branches','categories','items','parties','invoices','invoice_lines','stock_movements','payments','expenses',
               'orders','order_lines','order_events','accounts','journals']
$$;

do $$ declare t text; begin
  foreach t in array array['accounts', 'journals'] loop
    execute format('drop trigger if exists stamp on %I', t);
    execute format('create trigger stamp before insert or update on %I for each row execute function _sync_stamp()', t);
    execute format('create index if not exists %I on %I (seq)', t || '_seq_idx', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_all on %I', t);
    execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

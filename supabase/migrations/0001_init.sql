-- FitSecret cloud schema (Supabase / Postgres).
-- Every synced table mirrors packages/shared/index.js TABLES. POS devices keep a full SQLite copy and sync via
-- sync_push / sync_pull. Website talks only through the shop_items view and place_order / track_order RPCs.

create sequence if not exists sync_seq;

-- Stamp every write with a monotonically increasing seq that devices pull by.
-- ponytail: global advisory xact lock serialises writers so seq order == commit order, so a pull can never skip a row
-- committed late. Ceiling: one writing transaction at a time across synced tables; fine for a retail chain.
create or replace function _sync_stamp() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(4242);
  new.seq := nextval('sync_seq');
  if new.created_at is null then new.created_at := now(); end if;
  if new.updated_at is null or tg_op = 'UPDATE' and new.updated_at = old.updated_at then new.updated_at := now(); end if;
  if new.deleted is null then new.deleted := false; end if;
  return new;
end $$;

create table if not exists branches (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  code text, name text, address text, phone text, gstin text, state_code text, is_online boolean default false
);
create table if not exists categories (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  name text, slug text, sort int, image text, parent_id uuid
);
create table if not exists items (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  name text, slug text, group_key text, sku text, barcode text, brand text, category_id uuid, flavour text, size text, unit text,
  hsn text, gst_rate numeric(5,2) default 0, mrp numeric(12,2), sale_price numeric(12,2), purchase_price numeric(12,2),
  low_stock numeric(12,3), online boolean default false, featured boolean default false, goals jsonb, description text, image text
);
create table if not exists parties (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  type text, name text, phone text, email text, gstin text, address text, state_code text, opening_balance numeric(12,2) default 0
);
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  branch_id uuid, type text, no text, date date, party_id uuid, party_name text, party_phone text, party_gstin text, party_state text,
  tax_inclusive boolean, subtotal numeric(12,2), discount numeric(12,2), taxable numeric(12,2), cgst numeric(12,2), sgst numeric(12,2),
  igst numeric(12,2), round_off numeric(12,2), total numeric(12,2), paid numeric(12,2), status text, notes text, order_id uuid, created_by text
);
create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  invoice_id uuid, item_id uuid, name text, hsn text, batch_no text, expiry date, qty numeric(12,3), rate numeric(12,2), mrp numeric(12,2),
  discount_pct numeric(5,2), gst_rate numeric(5,2), taxable numeric(12,2), tax numeric(12,2), total numeric(12,2), cost numeric(12,2), sort int
);
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  branch_id uuid, item_id uuid, qty numeric(12,3), batch_no text, expiry date, ref_type text, ref_id uuid, note text
);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  branch_id uuid, party_id uuid, invoice_id uuid, direction text, amount numeric(12,2), mode text, date date, note text
);
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  branch_id uuid, category text, amount numeric(12,2), mode text, date date, note text
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  order_no text unique, user_id uuid, branch_id uuid, name text, phone text, email text, address jsonb, subtotal numeric(12,2),
  shipping numeric(12,2), discount numeric(12,2), total numeric(12,2), payment_method text, payment_status text, payment_ref text,
  status text, courier text, awb text, tracking_url text, notes text, invoice_id uuid
);
create table if not exists order_lines (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  order_id uuid, item_id uuid, name text, variant text, qty numeric(12,3), price numeric(12,2), total numeric(12,2)
);
create table if not exists order_events (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  order_id uuid, status text, note text
);

create or replace function sync_tables() returns text[] language sql immutable as $$
  select array['branches','categories','items','parties','invoices','invoice_lines','stock_movements','payments','expenses',
               'orders','order_lines','order_events']
$$;

do $$ declare t text; begin
  foreach t in array sync_tables() loop
    execute format('drop trigger if exists stamp on %I', t);
    execute format('create trigger stamp before insert or update on %I for each row execute function _sync_stamp()', t);
    execute format('create index if not exists %I on %I (seq)', t || '_seq_idx', t);
  end loop;
end $$;

create index if not exists stock_item_branch_idx on stock_movements (item_id, branch_id);
create index if not exists items_slug_idx on items (slug);
create index if not exists order_lines_order_idx on order_lines (order_id);
create index if not exists order_events_order_idx on order_events (order_id);
create index if not exists orders_user_idx on orders (user_id);

-- ---------- Staff & config ----------
create table if not exists staff (
  user_id uuid primary key references auth.users on delete cascade,
  name text, role text not null default 'staff', branch_id uuid
);

create table if not exists shop_config (
  id int primary key default 1 check (id = 1),
  online_branch_id uuid, shipping_fee numeric(12,2) not null default 49, free_shipping_above numeric(12,2) not null default 999,
  cod_enabled boolean not null default true, cod_limit numeric(12,2) not null default 10000
);
insert into shop_config (id) values (1) on conflict do nothing;

create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid())
$$;

-- ---------- Row level security ----------
do $$ declare t text; begin
  foreach t in array sync_tables() loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_all on %I', t);
    execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

drop policy if exists public_read on categories;
create policy public_read on categories for select to anon, authenticated using (not deleted);
drop policy if exists own_orders on orders;
create policy own_orders on orders for select to authenticated using (user_id = auth.uid());
drop policy if exists own_lines on order_lines;
create policy own_lines on order_lines for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists own_events on order_events;
create policy own_events on order_events for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));

alter table staff enable row level security;
drop policy if exists self_read on staff;
create policy self_read on staff for select to authenticated using (user_id = auth.uid());
alter table shop_config enable row level security;
drop policy if exists public_read on shop_config;
create policy public_read on shop_config for select to anon, authenticated using (true);
drop policy if exists staff_write on shop_config;
create policy staff_write on shop_config for update to authenticated using (is_staff()) with check (is_staff());

-- ---------- Storefront catalogue (safe columns only; no purchase prices) ----------
create or replace view shop_items as
select i.id, i.name, i.slug, i.group_key, i.brand, i.category_id, c.slug as category_slug, c.name as category_name,
       pc.slug as parent_slug, pc.name as parent_name,
       i.flavour, i.size, i.mrp, i.sale_price, i.gst_rate, i.featured, i.goals, i.description, i.image, i.updated_at,
       greatest(coalesce((select sum(m.qty) from stock_movements m
                          where m.item_id = i.id and not m.deleted
                            and m.branch_id = (select online_branch_id from shop_config where id = 1)), 0), 0) as stock
from items i left join categories c on c.id = i.category_id left join categories pc on pc.id = c.parent_id
where i.online and not i.deleted;

-- ---------- Device sync ----------
-- p: {"items":[{...row}], "invoices":[...]} ; last-write-wins on updated_at.
create or replace function sync_push(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare t text; r jsonb; cols text; n int := 0;
begin
  if not is_staff() then raise exception 'not authorized' using errcode = '42501'; end if;
  for t, r in select * from jsonb_each(p) loop
    if not t = any (sync_tables()) then raise exception 'unknown table %', t; end if;
    select string_agg(format('%I = excluded.%I', attname, attname), ', ') into cols
      from pg_attribute where attrelid = t::regclass and attnum > 0 and not attisdropped and attname not in ('id', 'seq');
    execute format(
      'insert into %I as d select * from jsonb_populate_recordset(null::%I, $1)
       on conflict (id) do update set %s where d.updated_at <= excluded.updated_at', t, t, cols) using r;
    n := n + jsonb_array_length(r);
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- Returns {rows:[{t, r}], cursor, more}. Device stores cursor and calls again while more.
create or replace function sync_pull(p_since bigint, p_limit int default 1000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text; v_rows jsonb; v_max bigint; v_n int;
begin
  if not is_staff() then raise exception 'not authorized' using errcode = '42501'; end if;
  select string_agg(format('select seq, %L as t, to_jsonb(x) - ''seq'' as r from %I x where seq > $1', t, t), ' union all ')
    into q from unnest(sync_tables()) t;
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''t'', t, ''r'', r) order by seq), ''[]''::jsonb), max(seq), count(*)
                  from (select * from (%s) u order by seq limit $2) s', q)
    into v_rows, v_max, v_n using p_since, p_limit;
  return jsonb_build_object('rows', v_rows, 'cursor', coalesce(v_max, p_since), 'more', v_n >= p_limit);
end $$;

-- ---------- Website ordering ----------
create sequence if not exists order_no_seq;

-- p: {name, phone, email, address:{line1,line2,city,state,pincode}, items:[{item_id, qty}], payment_method:'cod'|'online', notes}
create or replace function place_order(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg shop_config; it record; line jsonb; v_order uuid := gen_random_uuid(); v_no text; v_sub numeric := 0; v_ship numeric;
  v_stock numeric; v_qty int; v_method text := coalesce(p->>'payment_method', 'cod'); v_phone text;
begin
  perform pg_advisory_xact_lock(4242); -- serialise stock check + reservation
  select * into cfg from shop_config where id = 1;
  if cfg.online_branch_id is null then raise exception 'STORE_NOT_READY'; end if;
  v_phone := right(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), 10);
  if length(v_phone) <> 10 then raise exception 'INVALID_PHONE'; end if;
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'INVALID_NAME'; end if;
  if coalesce(p->'address'->>'pincode', '') !~ '^\d{6}$' or length(coalesce(p->'address'->>'line1', '')) < 5 then
    raise exception 'INVALID_ADDRESS';
  end if;
  if v_method not in ('cod', 'online') then raise exception 'INVALID_PAYMENT'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 or jsonb_array_length(p->'items') > 30 then
    raise exception 'EMPTY_CART';
  end if;

  v_no := 'FS' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || lpad(nextval('order_no_seq')::text, 4, '0');

  for line in select * from jsonb_array_elements(p->'items') loop
    v_qty := (line->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 20 then raise exception 'INVALID_QTY'; end if;
    select * into it from items where id = (line->>'item_id')::uuid and online and not deleted;
    if not found then raise exception 'ITEM_UNAVAILABLE'; end if;
    select coalesce(sum(qty), 0) into v_stock from stock_movements
      where item_id = it.id and branch_id = cfg.online_branch_id and not deleted;
    if v_stock < v_qty then raise exception 'OUT_OF_STOCK:%', it.name; end if;
    insert into order_lines (order_id, item_id, name, variant, qty, price, total)
      values (v_order, it.id, it.name, concat_ws(' · ', it.size, it.flavour), v_qty, it.sale_price, it.sale_price * v_qty);
    insert into stock_movements (branch_id, item_id, qty, ref_type, ref_id, note)
      values (cfg.online_branch_id, it.id, -v_qty, 'order', v_order, v_no);
    v_sub := v_sub + it.sale_price * v_qty;
  end loop;

  if v_method = 'cod' and (not cfg.cod_enabled or v_sub > cfg.cod_limit) then raise exception 'COD_UNAVAILABLE'; end if;
  v_ship := case when v_sub >= cfg.free_shipping_above then 0 else cfg.shipping_fee end;

  insert into orders (id, order_no, user_id, branch_id, name, phone, email, address, subtotal, shipping, discount, total,
                      payment_method, payment_status, status, notes)
  values (v_order, v_no, auth.uid(), cfg.online_branch_id, trim(p->>'name'), v_phone, nullif(trim(p->>'email'), ''), p->'address',
          v_sub, v_ship, 0, v_sub + v_ship, v_method, 'pending',
          case when v_method = 'online' then 'pending_payment' else 'placed' end, left(p->>'notes', 500));
  insert into order_events (order_id, status, note)
    values (v_order, case when v_method = 'online' then 'pending_payment' else 'placed' end, null);

  return jsonb_build_object('id', v_order, 'order_no', v_no, 'total', v_sub + v_ship, 'payment_method', v_method);
end $$;

-- Called by the web server (service role) after verifying the payment gateway signature.
create or replace function confirm_payment(p_order uuid, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update orders set payment_status = 'paid', payment_ref = p_ref, status = 'placed'
   where id = p_order and status = 'pending_payment';
  if found then insert into order_events (order_id, status, note) values (p_order, 'placed', 'Payment received'); end if;
end $$;

create or replace function track_order(p_order_no text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'seq' - 'user_id' - 'deleted',
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'variant', l.variant, 'qty', l.qty, 'price', l.price, 'total', l.total)), '[]')
              from order_lines l where l.order_id = o.id and not l.deleted),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.created_at), '[]')
               from order_events e where e.order_id = o.id and not e.deleted))
  from orders o
  where o.order_no = upper(trim(p_order_no))
    and o.phone = right(regexp_replace(p_phone, '\D', '', 'g'), 10) and not o.deleted
$$;

-- ---------- Grants ----------
revoke all on function sync_push(jsonb), sync_pull(bigint, int) from public, anon;
revoke all on function confirm_payment(uuid, text) from public, anon, authenticated;
grant execute on function sync_push(jsonb), sync_pull(bigint, int) to authenticated;
grant execute on function confirm_payment(uuid, text) to service_role;
grant execute on function place_order(jsonb), track_order(text, text) to anon, authenticated;
grant select on shop_items to anon, authenticated;

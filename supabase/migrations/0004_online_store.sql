-- Online Store mode: coupons, store settings from the online branch (branches.settings.store), public store info for the website,
-- and place_order with coupons / minimum order / store open-closed. Safe to run more than once. Run after 0003_vyapar_rest.sql.
-- Coupon rules are mirrored in packages/shared/store.js (couponDiscount); keep them in step.

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  code text, kind text, value numeric(12,2), min_order numeric(12,2), max_discount numeric(12,2), starts date, ends date,
  usage_limit integer, per_phone integer, active boolean default true, public boolean default false, note text
);
alter table orders add column if not exists coupon text;

create or replace function sync_tables() returns text[] language sql immutable as $$
  select array['branches','categories','items','parties','invoices','invoice_lines','stock_movements','payments','expenses',
               'orders','order_lines','order_events','accounts','journals','coupons']
$$;

do $$ begin
  execute 'drop trigger if exists stamp on coupons';
  execute 'create trigger stamp before insert or update on coupons for each row execute function _sync_stamp()';
  execute 'create index if not exists coupons_seq_idx on coupons (seq)';
  execute 'alter table coupons enable row level security';
  execute 'drop policy if exists staff_all on coupons';
  execute 'create policy staff_all on coupons for all to authenticated using (is_staff()) with check (is_staff())';
end $$;

-- The branch flagged is_online (Online Store → Store settings) is the one that fulfils website orders.
create or replace function _online_branch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_online and not coalesce(new.deleted, false) then
    update shop_config set online_branch_id = new.id where id = 1 and online_branch_id is distinct from new.id;
  end if;
  return new;
end $$;
drop trigger if exists online_branch on branches;
create trigger online_branch after insert or update of is_online, deleted on branches for each row execute function _online_branch();
update shop_config set online_branch_id = (select id from branches where is_online and not deleted order by created_at limit 1)
 where id = 1 and online_branch_id is null;

-- shop_config defaults overlaid with the online branch's settings.store (edited from Online Store → Store settings).
create or replace function _store() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('open', true, 'shipping_fee', c.shipping_fee, 'free_shipping_above', c.free_shipping_above,
           'cod_enabled', c.cod_enabled, 'cod_limit', c.cod_limit, 'min_order', 0, 'announcement', '', 'banners', '[]'::jsonb)
         || coalesce(jsonb_strip_nulls((select b.settings->'store' from branches b where b.id = c.online_branch_id and not b.deleted)), '{}'::jsonb)
  from shop_config c where c.id = 1
$$;

-- What the storefront may see: store settings plus coupons marked public.
create or replace function store_info() returns jsonb language sql stable security definer set search_path = public as $$
  select _store() || jsonb_build_object('coupons', coalesce((
    select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'value', value, 'min_order', min_order, 'max_discount', max_discount, 'ends', ends, 'note', note) order by value desc)
    from coupons where public and active and not deleted
      and (starts is null or starts <= (now() at time zone 'Asia/Kolkata')::date)
      and (ends is null or ends >= (now() at time zone 'Asia/Kolkata')::date)), '[]'::jsonb))
$$;

create or replace function _coupon_discount(p_code text, p_sub numeric, p_phone text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare c coupons; v_used int; v_d numeric; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into c from coupons where upper(code) = upper(trim(p_code)) and active and not deleted limit 1;
  if not found then raise exception 'COUPON_INVALID'; end if;
  if (c.starts is not null and v_today < c.starts) or (c.ends is not null and v_today > c.ends) then raise exception 'COUPON_EXPIRED'; end if;
  if p_sub < coalesce(c.min_order, 0) then raise exception 'COUPON_MIN:%', c.min_order; end if;
  if c.usage_limit is not null then
    select count(*) into v_used from orders where upper(coupon) = upper(c.code) and status <> 'cancelled' and not deleted;
    if v_used >= c.usage_limit then raise exception 'COUPON_USED_UP'; end if;
  end if;
  if c.per_phone is not null and p_phone is not null then
    select count(*) into v_used from orders where upper(coupon) = upper(c.code) and phone = p_phone and status <> 'cancelled' and not deleted;
    if v_used >= c.per_phone then raise exception 'COUPON_ALREADY_USED'; end if;
  end if;
  v_d := case when c.kind = 'percent' then round(p_sub * c.value / 100, 2) else c.value end;
  if c.max_discount is not null then v_d := least(v_d, c.max_discount); end if;
  return least(v_d, p_sub);
end $$;

-- Checkout preview. place_order recomputes, so a tampered subtotal gains nothing.
create or replace function check_coupon(p_code text, p_subtotal numeric, p_phone text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('code', upper(trim(p_code)),
    'discount', _coupon_discount(p_code, p_subtotal, nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '')));
end $$;

-- p: {name, phone, email, address:{line1,line2,city,state,pincode}, items:[{item_id, qty}], payment_method:'cod'|'online', notes, coupon}
create or replace function place_order(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg shop_config; st jsonb; it record; line jsonb; v_order uuid := gen_random_uuid(); v_no text; v_sub numeric := 0; v_ship numeric;
  v_disc numeric := 0; v_coupon text := nullif(upper(trim(coalesce(p->>'coupon', ''))), ''); v_total numeric;
  v_stock numeric; v_qty int; v_method text := coalesce(p->>'payment_method', 'cod'); v_phone text;
begin
  perform pg_advisory_xact_lock(4242); -- serialise stock check + reservation (and coupon usage counts)
  select * into cfg from shop_config where id = 1;
  if cfg.online_branch_id is null then raise exception 'STORE_NOT_READY'; end if;
  st := _store();
  if not coalesce((st->>'open')::boolean, true) then raise exception 'STORE_CLOSED'; end if;
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

  if v_sub < coalesce((st->>'min_order')::numeric, 0) then raise exception 'MIN_ORDER:%', (st->>'min_order'); end if;
  if v_coupon is not null then v_disc := _coupon_discount(v_coupon, v_sub, v_phone); end if;
  v_ship := case when v_sub - v_disc >= (st->>'free_shipping_above')::numeric then 0 else (st->>'shipping_fee')::numeric end;
  v_total := v_sub - v_disc + v_ship;
  if v_method = 'cod' and (not (st->>'cod_enabled')::boolean or v_total > (st->>'cod_limit')::numeric) then raise exception 'COD_UNAVAILABLE'; end if;

  insert into orders (id, order_no, user_id, branch_id, name, phone, email, address, subtotal, shipping, discount, total, coupon,
                      payment_method, payment_status, status, notes)
  values (v_order, v_no, auth.uid(), cfg.online_branch_id, trim(p->>'name'), v_phone, nullif(trim(p->>'email'), ''), p->'address',
          v_sub, v_ship, v_disc, v_total, case when v_disc > 0 then v_coupon end, v_method, 'pending',
          case when v_method = 'online' then 'pending_payment' else 'placed' end, left(p->>'notes', 500));
  insert into order_events (order_id, status, note)
    values (v_order, case when v_method = 'online' then 'pending_payment' else 'placed' end, case when v_disc > 0 then 'Coupon ' || v_coupon end);

  return jsonb_build_object('id', v_order, 'order_no', v_no, 'total', v_total, 'discount', v_disc, 'payment_method', v_method);
end $$;

grant execute on function store_info(), check_coupon(text, numeric, text), place_order(jsonb) to anon, authenticated;
revoke execute on function _coupon_discount(text, numeric, text), _store() from public, anon, authenticated;

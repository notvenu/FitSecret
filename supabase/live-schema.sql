CREATE OR REPLACE FUNCTION public._buyer()
 RETURNS parties
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.* from parties p
  where p.type = 'customer' and not p.deleted and coalesce(p.email, '') <> ''
    and lower(trim(p.email)) = lower(nullif(auth.jwt() ->> 'email', ''))
    and (coalesce(p.price_discount, 0) > 0 or coalesce(p.rates, '{}'::jsonb) <> '{}'::jsonb)
  order by p.created_at limit 1
$function$
;

CREATE OR REPLACE FUNCTION public._coupon_discount(p_code text, p_sub numeric, p_phone text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c coupons; v_used int; v_d numeric; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into c from coupons where upper(code) = upper(trim(p_code)) and active and not deleted and coalesce(channel, 'both') <> 'counter' limit 1;
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
end $function$
;

CREATE OR REPLACE FUNCTION public._me()
 RETURNS parties
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.* from parties p
  where p.type = 'customer' and not p.deleted and coalesce(p.email, '') <> '' and lower(trim(p.email)) = lower(nullif(auth.jwt() ->> 'email', ''))
  order by p.created_at limit 1
$function$
;

CREATE OR REPLACE FUNCTION public._points(pid uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cfg jsonb; ev numeric; pv numeric; e numeric; r numeric;
begin
  select b.settings->'loyalty' into cfg from shop_config c join branches b on b.id = c.online_branch_id where c.id = 1;
  if not coalesce((cfg->>'enabled')::boolean, false) then return 0; end if;
  ev := coalesce((cfg->>'earn_per_100')::numeric, 0); pv := nullif((cfg->>'point_value')::numeric, 0);
  if pv is null then return 0; end if;
  select coalesce(sum(case when i.type = 'sale' then 1 else -1 end * floor((i.total - coalesce((select sum(y.amount) from payments y
           where y.invoice_id = i.id and y.mode = 'points' and not y.deleted), 0)) * ev / 100)), 0) into e
    from invoices i where i.party_id = pid and not i.deleted and i.status <> 'cancelled' and i.type in ('sale', 'sale_return');
  select coalesce((select sum(case when direction = 'in' then amount else -amount end) from payments where party_id = pid and mode = 'points' and not deleted), 0) / pv
       + coalesce((select sum(points) from orders where points_party = pid and invoice_id is null and status <> 'cancelled' and not deleted and points > 0), 0) / pv into r;
  return greatest(0, floor(greatest(0, e) - r)) * pv;
end $function$
;

CREATE OR REPLACE FUNCTION public._store()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('open', true, 'shipping_fee', c.shipping_fee, 'free_shipping_above', c.free_shipping_above,
           'cod_enabled', c.cod_enabled, 'cod_limit', c.cod_limit, 'min_order', 0, 'announcement', '', 'banners', '[]'::jsonb)
         || coalesce(jsonb_strip_nulls((select b.settings->'store' from branches b where b.id = c.online_branch_id and not b.deleted)), '{}'::jsonb)
  from shop_config c where c.id = 1
$function$
;

CREATE OR REPLACE FUNCTION public._sync_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  perform pg_advisory_xact_lock(4242);
  new.seq := nextval('sync_seq');
  if new.created_at is null then new.created_at := now(); end if;
  if new.updated_at is null or tg_op = 'UPDATE' and new.updated_at = old.updated_at then new.updated_at := now(); end if;
  if new.deleted is null then new.deleted := false; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._unit_price(it items, p_qty numeric, b parties)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
declare v numeric := nullif(b.rates ->> it.id::text, '')::numeric;
begin
  if v is null or v <= 0 then v := round(it.sale_price * (1 - coalesce(b.price_discount, 0) / 100), 2); end if;
  if coalesce(it.wholesale_price, 0) > 0 and coalesce(it.wholesale_min_qty, 0) > 0 and p_qty >= it.wholesale_min_qty then
    v := least(v, it.wholesale_price);
  end if;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.also_bought(p_items uuid[], p_limit integer DEFAULT 8)
 RETURNS TABLE(item_id uuid, n bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with baskets as (
    select l.invoice_id as b from invoice_lines l join invoices v on v.id = l.invoice_id
     where l.item_id = any(p_items) and not l.deleted and not v.deleted and v.type = 'sale' and v.status <> 'cancelled' and v.date > current_date - 365
       and v.order_id is null -- online orders are counted from order_lines below, not twice
    union
    select ol.order_id from order_lines ol join orders o on o.id = ol.order_id
     where ol.item_id = any(p_items) and not ol.deleted and o.status not in ('cancelled', 'pending_payment')
  ), lines as (
    select invoice_id as b, item_id from invoice_lines where invoice_id in (select b from baskets) and not deleted
    union all
    select order_id, item_id from order_lines where order_id in (select b from baskets) and not deleted
  )
  select x.item_id, count(distinct x.b) n from lines x join items i on i.id = x.item_id
  where not (x.item_id = any(p_items)) and i.online and not i.deleted
  group by x.item_id order by n desc limit greatest(1, least(p_limit, 20))
$function$
;

CREATE OR REPLACE FUNCTION public.check_coupon(p_code text, p_subtotal numeric, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return jsonb_build_object('code', upper(trim(p_code)),
    'discount', _coupon_discount(p_code, p_subtotal, nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '')));
end $function$
;

CREATE OR REPLACE FUNCTION public.confirm_payment(p_order uuid, p_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update orders set payment_status = 'paid', payment_ref = p_ref, status = 'placed'
   where id = p_order and status = 'pending_payment';
  if found then insert into order_events (order_id, status, note) values (p_order, 'placed', 'Payment received'); end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.is_order_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from staff where user_id = auth.uid())
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from staff where user_id = auth.uid() and role <> 'orders')
$function$
;

CREATE OR REPLACE FUNCTION public.my_points()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('name', m.name, 'value', _points(m.id)) from _me() m where m.id is not null
$function$
;

CREATE OR REPLACE FUNCTION public.my_rates()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('name', b.name, 'price_discount', coalesce(b.price_discount, 0), 'rates', coalesce(b.rates, '{}'::jsonb))
  from _buyer() b where b.id is not null
$function$
;

CREATE OR REPLACE FUNCTION public.place_order(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cfg shop_config; st jsonb; it items; line jsonb; v_order uuid := gen_random_uuid(); v_no text; v_sub numeric := 0; v_ship numeric;
  v_disc numeric := 0; v_coupon text := nullif(upper(trim(coalesce(p->>'coupon', ''))), ''); v_total numeric;
  v_stock numeric; v_qty int; v_method text := coalesce(p->>'payment_method', 'cod'); v_phone text; v_buyer parties; v_price numeric;
  v_left jsonb := '{}'; v_prices jsonb := '{}'; v_combo numeric := 0; v_names text[] := '{}'; c record; v_sets int; e jsonb;
  v_me parties; v_pts numeric := 0;
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
  v_buyer := _buyer();

  v_no := 'FS' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || lpad(nextval('order_no_seq')::text, 4, '0');

  for line in select * from jsonb_array_elements(p->'items') loop
    v_qty := (line->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 100 then raise exception 'INVALID_QTY'; end if;
    select * into it from items where id = (line->>'item_id')::uuid and online and not deleted;
    if not found then raise exception 'ITEM_UNAVAILABLE'; end if;
    select coalesce(sum(qty), 0) into v_stock from stock_movements
      where item_id = it.id and branch_id = cfg.online_branch_id and not deleted;
    if v_stock < v_qty then raise exception 'OUT_OF_STOCK:%', it.name; end if;
    v_price := _unit_price(it, v_qty, v_buyer);
    insert into order_lines (order_id, item_id, name, variant, qty, price, total)
      values (v_order, it.id, it.name, concat_ws(' · ', it.size, it.flavour), v_qty, v_price, v_price * v_qty);
    insert into stock_movements (branch_id, item_id, qty, ref_type, ref_id, note)
      values (cfg.online_branch_id, it.id, -v_qty, 'order', v_order, v_no);
    v_sub := v_sub + v_price * v_qty;
    v_left := v_left || jsonb_build_object(it.id::text, coalesce((v_left->>it.id::text)::int, 0) + v_qty);
    v_prices := v_prices || jsonb_build_object(it.id::text, v_price);
  end loop;

  if v_sub < coalesce((st->>'min_order')::numeric, 0) then raise exception 'MIN_ORDER:%', (st->>'min_order'); end if;

  for c in
    select o.name, o.items, (select sum((v_prices->>(x->>'item_id'))::numeric * (x->>'qty')::int) from jsonb_array_elements(o.items) x) - o.price as saving
    from offers o
    where o.kind = 'combo' and o.active and not o.deleted and (o.starts is null or o.starts <= current_date) and (o.ends is null or o.ends >= current_date)
      and coalesce(o.channel, 'both') <> 'counter'
    order by 3 desc nulls last
  loop
    continue when c.saving is null or c.saving <= 0;
    select min(floor(coalesce((v_left->>(x->>'item_id'))::numeric, 0) / (x->>'qty')::numeric))::int into v_sets from jsonb_array_elements(c.items) x;
    continue when coalesce(v_sets, 0) < 1;
    v_combo := v_combo + v_sets * c.saving;
    v_names := v_names || c.name;
    for e in select * from jsonb_array_elements(c.items) loop
      v_left := jsonb_set(v_left, array[e->>'item_id'], to_jsonb((v_left->>(e->>'item_id'))::int - v_sets * (e->>'qty')::int));
    end loop;
  end loop;

  if v_coupon is not null then v_disc := _coupon_discount(v_coupon, v_sub - v_combo, v_phone); end if;
  v_ship := case when v_sub - v_combo - v_disc >= (st->>'free_shipping_above')::numeric then 0 else (st->>'shipping_fee')::numeric end;
  v_total := v_sub - v_combo - v_disc + v_ship;
  -- loyalty points: only the signed-in customer's own, never more than they have or than the goods cost
  if coalesce((p->>'points')::numeric, 0) > 0 then
    v_me := _me();
    if v_me.id is null then raise exception 'POINTS_SIGN_IN'; end if;
    v_pts := greatest(0, round(least((p->>'points')::numeric, _points(v_me.id), v_total - v_ship), 2));
    v_total := v_total - v_pts;
  end if;
  if v_method = 'cod' and (not (st->>'cod_enabled')::boolean or v_total > (st->>'cod_limit')::numeric) then raise exception 'COD_UNAVAILABLE'; end if;

  insert into orders (id, order_no, user_id, branch_id, name, phone, email, address, subtotal, shipping, discount, combo_discount, total, coupon,
                      payment_method, payment_status, status, notes, points, points_party)
  values (v_order, v_no, auth.uid(), cfg.online_branch_id, trim(p->>'name'), v_phone, nullif(trim(p->>'email'), ''), p->'address',
          v_sub, v_ship, v_disc + v_combo, nullif(v_combo, 0), v_total, case when v_disc > 0 then v_coupon end, v_method, 'pending',
          case when v_method = 'online' then 'pending_payment' else 'placed' end, left(p->>'notes', 500), nullif(v_pts, 0), case when v_pts > 0 then v_me.id end);
  insert into order_events (order_id, status, note)
    values (v_order, case when v_method = 'online' then 'pending_payment' else 'placed' end,
            nullif(concat_ws(' · ', case when v_disc > 0 then 'Coupon ' || v_coupon end, case when v_combo > 0 then 'Combo: ' || array_to_string(v_names, ', ') end,
                             case when v_buyer.id is not null then 'Regular buyer rates: ' || v_buyer.name end,
                             case when v_pts > 0 then 'Loyalty points ₹' || v_pts end), ''));

  return jsonb_build_object('id', v_order, 'order_no', v_no, 'total', v_total, 'discount', v_disc + v_combo, 'combo_discount', v_combo, 'points', v_pts, 'payment_method', v_method);
end $function$
;

CREATE OR REPLACE FUNCTION public.staff_inbox()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_order_staff() then raise exception 'not authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(f order by f.created_at desc) from (select * from feedback where not deleted order by created_at desc limit 500) f), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.staff_inbox_update(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_order_staff() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p ? 'status' and p->>'status' not in ('new', 'done', 'approved', 'hidden', 'notified') then raise exception 'BAD_STATUS'; end if;
  update feedback set status = case when p ? 'status' then p->>'status' else status end,
    reply = case when p ? 'reply' then nullif(left(p->>'reply', 1000), '') else reply end, updated_at = now()
  where id = p_id and not deleted;
  if not found then raise exception 'NOT_FOUND'; end if;
  return (select to_jsonb(f) from feedback f where f.id = p_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.staff_orders(p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_order_staff() then raise exception 'not authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select o.*, coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'name', l.name, 'variant', l.variant, 'qty', l.qty, 'price', l.price, 'total', l.total))
                          from order_lines l where l.order_id = o.id and not l.deleted), '[]'::jsonb) as lines,
           coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'created_at', e.created_at) order by e.created_at)
                     from order_events e where e.order_id = o.id and not e.deleted), '[]'::jsonb) as events
    from orders o where not o.deleted and (p_status is null or o.status = p_status)
    order by o.created_at desc limit 300) x), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.staff_update_order(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders; v_status text := nullif(p->>'status', ''); v_pay text; v_who text;
begin
  if not is_order_staff() then raise exception 'not authorized' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(4242); -- same lock as place_order: stock and status change together
  select * into o from orders where id = p_id and not deleted;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status is not null and v_status not in ('placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled') then raise exception 'BAD_STATUS'; end if;
  if o.status = 'cancelled' and v_status is not null and v_status <> 'cancelled' then raise exception 'ORDER_CANCELLED'; end if;
  if coalesce(p->>'tracking_url', '') <> '' and p->>'tracking_url' !~ '^https://' then raise exception 'BAD_TRACKING_URL'; end if;
  v_pay := o.payment_status;
  if v_status = 'cancelled' and o.status <> 'cancelled' then
    insert into stock_movements (branch_id, item_id, qty, ref_type, ref_id, note)
      select o.branch_id, l.item_id, l.qty, 'order_cancel', o.id, o.order_no from order_lines l where l.order_id = o.id and not l.deleted;
    if o.payment_status = 'paid' and o.payment_method = 'online' then v_pay := 'refund_pending'; end if;
  end if;
  if v_status = 'delivered' and o.payment_method = 'cod' then v_pay := 'paid'; end if;
  if p->>'refund' = 'done' and o.payment_status = 'refund_pending' then v_pay := 'refunded'; end if;
  update orders set status = coalesce(v_status, status), payment_status = v_pay,
    courier = case when p ? 'courier' then left(p->>'courier', 80) else courier end,
    awb = case when p ? 'awb' then left(p->>'awb', 80) else awb end,
    tracking_url = case when p ? 'tracking_url' then nullif(left(p->>'tracking_url', 500), '') else tracking_url end,
    internal_note = case when p ? 'internal_note' then left(p->>'internal_note', 1000) else internal_note end,
    updated_at = now()
  where id = o.id;
  if v_status is not null and v_status <> o.status then
    select coalesce(name, 'staff') into v_who from staff where user_id = auth.uid();
    insert into order_events (order_id, status, note) values (o.id, v_status, coalesce(nullif(left(p->>'note', 300), ''), 'by ' || v_who));
  end if;
  return (select to_jsonb(x) from orders x where x.id = o.id);
end $function$
;

CREATE OR REPLACE FUNCTION public.store_info()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select _store() || jsonb_build_object('coupons', coalesce((
    select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'value', value, 'min_order', min_order, 'max_discount', max_discount, 'ends', ends, 'note', note,
      'channel', coalesce(channel, 'both')) order by value desc)
    from coupons where public and active and not deleted
      and (starts is null or starts <= (now() at time zone 'Asia/Kolkata')::date)
      and (ends is null or ends >= (now() at time zone 'Asia/Kolkata')::date)), '[]'::jsonb))
$function$
;

CREATE OR REPLACE FUNCTION public.submit_feedback(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text := p->>'kind'; v_phone text := right(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), 10);
  v_item uuid; v_rating int; v_verified boolean := false; v_id uuid;
begin
  if v_kind not in ('review', 'message', 'restock') then raise exception 'BAD_REQUEST'; end if;
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'INVALID_NAME'; end if;
  if length(v_phone) <> 10 then raise exception 'INVALID_PHONE'; end if;
  -- spam guard: 10 submissions per phone per day
  if (select count(*) from feedback where phone = v_phone and created_at > now() - interval '1 day') >= 10 then raise exception 'TOO_MANY'; end if;

  if v_kind in ('review', 'restock') then
    v_item := nullif(p->>'item_id', '')::uuid;
    if not exists (select 1 from items where id = v_item and online and not deleted) then raise exception 'ITEM_UNAVAILABLE'; end if;
  end if;
  if v_kind = 'review' then
    v_rating := (p->>'rating')::int;
    if v_rating is null or v_rating < 1 or v_rating > 5 then raise exception 'BAD_RATING'; end if;
    if length(trim(coalesce(p->>'body', ''))) < 10 then raise exception 'REVIEW_TOO_SHORT'; end if;
    -- "verified buyer": this phone has a delivered order containing this product
    v_verified := exists (select 1 from orders o join order_lines l on l.order_id = o.id
                          where o.phone = v_phone and o.status = 'delivered' and l.item_id = v_item and not o.deleted);
  end if;
  if v_kind = 'message' and length(trim(coalesce(p->>'body', ''))) < 3 then raise exception 'EMPTY_MESSAGE'; end if;
  if v_kind = 'restock' then
    select id into v_id from feedback where kind = 'restock' and phone = v_phone and item_id = v_item and status = 'new' and not deleted limit 1;
    if found then return jsonb_build_object('ok', true, 'id', v_id); end if; -- already asked
  end if;

  insert into feedback (kind, item_id, order_no, name, phone, email, rating, title, body, status, verified)
  values (v_kind, v_item, nullif(upper(trim(coalesce(p->>'order_no', ''))), ''), left(trim(p->>'name'), 80), v_phone,
          nullif(left(trim(coalesce(p->>'email', '')), 120), ''), v_rating, nullif(left(trim(coalesce(p->>'title', '')), 100), ''),
          nullif(left(trim(coalesce(p->>'body', '')), 1000), ''), 'new', v_verified)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_pull(p_since bigint, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q text; v_rows jsonb; v_max bigint; v_n int;
begin
  if not is_staff() then raise exception 'not authorized' using errcode = '42501'; end if;
  select string_agg(format('select seq, %L as t, to_jsonb(x) - ''seq'' as r from %I x where seq > $1', t, t), ' union all ')
    into q from unnest(sync_tables()) t;
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''t'', t, ''r'', r) order by seq), ''[]''::jsonb), max(seq), count(*)
                  from (select * from (%s) u order by seq limit $2) s', q)
    into v_rows, v_max, v_n using p_since, p_limit;
  return jsonb_build_object('rows', v_rows, 'cursor', coalesce(v_max, p_since), 'more', v_n >= p_limit);
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_push(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['branches','categories','items','parties','invoices','invoice_lines','stock_movements','payments','expenses',
               'orders','order_lines','order_events','accounts','journals','coupons','feedback','employees','attendance',
               'day_closes','audit_log','certificates','offers','companies']
$function$
;

CREATE OR REPLACE FUNCTION public.track_order(p_order_no text, p_phone text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'seq' - 'user_id' - 'deleted',
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'variant', l.variant, 'qty', l.qty, 'price', l.price, 'total', l.total)), '[]')
              from order_lines l where l.order_id = o.id and not l.deleted),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.created_at), '[]')
               from order_events e where e.order_id = o.id and not e.deleted))
  from orders o
  where o.order_no = upper(trim(p_order_no))
    and o.phone = right(regexp_replace(p_phone, '\D', '', 'g'), 10) and not o.deleted
$function$
;

create or replace view shop_certificates as SELECT c.id,
    c.item_id,
    c.batch_no,
    c.kind,
    c.title,
    c.url,
    c.valid_until
   FROM certificates c
     JOIN items i ON i.id = c.item_id
  WHERE NOT c.deleted AND i.online AND NOT i.deleted AND (c.valid_until IS NULL OR c.valid_until >= CURRENT_DATE);

create or replace view shop_combos as SELECT id,
    name,
    items,
    price,
    ends,
    COALESCE(channel, 'both'::text) AS channel
   FROM offers o
  WHERE kind = 'combo'::text AND active AND NOT deleted AND (starts IS NULL OR starts <= CURRENT_DATE) AND (ends IS NULL OR ends >= CURRENT_DATE) AND NOT (EXISTS ( SELECT 1
           FROM jsonb_array_elements(o.items) e(value)
             LEFT JOIN items i ON i.id = ((e.value ->> 'item_id'::text)::uuid)
          WHERE i.id IS NULL OR NOT i.online OR i.deleted));

create or replace view shop_items as SELECT i.id,
    i.name,
    i.slug,
    i.group_key,
    i.brand,
    i.category_id,
    c.slug AS category_slug,
    c.name AS category_name,
    pc.slug AS parent_slug,
    pc.name AS parent_name,
    i.flavour,
    i.size,
    i.mrp,
    i.sale_price,
    i.gst_rate,
    i.featured,
    i.goals,
    i.description,
    i.image,
    i.updated_at,
    GREATEST(COALESCE(( SELECT sum(m.qty) AS sum
           FROM stock_movements m
          WHERE m.item_id = i.id AND NOT m.deleted AND m.branch_id = (( SELECT shop_config.online_branch_id
                   FROM shop_config
                  WHERE shop_config.id = 1))), 0::numeric), 0::numeric) AS stock,
    i.wholesale_price,
    i.wholesale_min_qty
   FROM items i
     LEFT JOIN categories c ON c.id = i.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
  WHERE i.online AND NOT i.deleted;

create or replace view shop_reviews as SELECT f.id,
    f.item_id,
    COALESCE(i.group_key, i.slug) AS product_key,
    split_part(f.name, ' '::text, 1) AS name,
    f.rating,
    f.title,
    f.body,
    f.reply,
    f.verified,
    f.created_at
   FROM feedback f
     JOIN items i ON i.id = f.item_id
  WHERE f.kind = 'review'::text AND f.status = 'approved'::text AND NOT f.deleted AND NOT i.deleted;

-- table accounts: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, name text, type text, opening_balance numeric(12,2), note text

-- table attendance: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, employee_id uuid, date date, status text, in_time text, out_time text, note text

-- table audit_log: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, ref_type text, ref_id uuid, ref_no text, action text, by text, data jsonb

-- table branches: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, code text, name text, address text, phone text, gstin text, state_code text, is_online boolean, settings jsonb, kind text, company_id uuid

-- table categories: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, name text, slug text, sort integer, image text, parent_id uuid

-- table certificates: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, item_id uuid, batch_no text, kind text, title text, url text, valid_until date, note text

-- table companies: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, name text, legal_name text, gstin text, state_code text, address text, phone text, email text, logo text, note text

-- table coupons: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, code text, kind text, value numeric(12,2), min_order numeric(12,2), max_discount numeric(12,2), starts date, ends date, usage_limit integer, per_phone integer, active boolean, public boolean, note text, channel text

-- table day_closes: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, date date, expected jsonb, counted jsonb, diff numeric(12,2), closed_by text, note text

-- table employees: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, name text, phone text, role text, pay_type text, salary numeric(12,2), joined date, active boolean, note text

-- table expenses: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, category text, amount numeric(12,2), mode text, date date, note text, employee_id uuid

-- table feedback: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, kind text, item_id uuid, order_no text, name text, phone text, email text, rating integer, title text, body text, status text, reply text, verified boolean

-- table invoice_lines: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, invoice_id uuid, item_id uuid, name text, hsn text, batch_no text, expiry date, qty numeric(12,3), rate numeric(12,2), mrp numeric(12,2), discount_pct numeric(5,2), gst_rate numeric(5,2), taxable numeric(12,2), tax numeric(12,2), total numeric(12,2), cost numeric(12,2), sort integer, serial text, mfg date, note text

-- table invoices: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, type text, no text, date date, party_id uuid, party_name text, party_phone text, party_gstin text, party_state text, tax_inclusive boolean, subtotal numeric(12,2), discount numeric(12,2), taxable numeric(12,2), cgst numeric(12,2), sgst numeric(12,2), igst numeric(12,2), round_off numeric(12,2), total numeric(12,2), paid numeric(12,2), status text, notes text, order_id uuid, created_by text, due_date date, ship_to text, party_extra jsonb, tcs numeric(12,2), currency text, fx_rate numeric(14,6), ref_id uuid, ref_no text, ref_date date, bill_discount numeric(12,2), referrer text, salesperson text

-- table items: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, name text, slug text, group_key text, sku text, barcode text, brand text, category_id uuid, flavour text, size text, unit text, hsn text, gst_rate numeric(5,2), mrp numeric(12,2), sale_price numeric(12,2), purchase_price numeric(12,2), low_stock numeric(12,3), online boolean, featured boolean, goals jsonb, description text, image text, wholesale_price numeric(12,2), wholesale_min_qty numeric(12,3), location text, model text, refill_days integer, company_ids jsonb

-- table journals: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, no text, date date, note text, lines jsonb

-- table offers: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, kind text, name text, item_id uuid, batch_no text, expiry date, discount_pct numeric(6,2), items jsonb, price numeric(12,2), starts date, ends date, active boolean, approved_by text, note text, channel text

-- table order_events: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, order_id uuid, status text, note text

-- table order_lines: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, order_id uuid, item_id uuid, name text, variant text, qty numeric(12,3), price numeric(12,2), total numeric(12,2)

-- table orders: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, order_no text, user_id uuid, branch_id uuid, name text, phone text, email text, address jsonb, subtotal numeric(12,2), shipping numeric(12,2), discount numeric(12,2), total numeric(12,2), payment_method text, payment_status text, payment_ref text, status text, courier text, awb text, tracking_url text, notes text, invoice_id uuid, coupon text, internal_note text, combo_discount numeric(12,2), points numeric(12,2), points_party uuid

-- table parties: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, type text, name text, phone text, email text, gstin text, address text, state_code text, opening_balance numeric(12,2), credit_limit numeric(12,2), shipping_address text, group_name text, payment_terms integer, extra jsonb, price_discount numeric(5,2), rates jsonb

-- table payments: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, party_id uuid, invoice_id uuid, direction text, amount numeric(12,2), mode text, date date, note text, tds numeric(12,2), reconciled date, ref text, ref_date date, status text, deposit_to text

-- table shop_config: rls ON
--   id integer, online_branch_id uuid, shipping_fee numeric(12,2), free_shipping_above numeric(12,2), cod_enabled boolean, cod_limit numeric(12,2)

-- table staff: rls ON
--   user_id uuid, name text, role text, branch_id uuid

-- table stock_movements: rls ON
--   id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted boolean, seq bigint, branch_id uuid, item_id uuid, qty numeric(12,3), batch_no text, expiry date, ref_type text, ref_id uuid, note text, mfg date

create policy staff_all on accounts as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on attendance as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on audit_log as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on branches as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy public_read on categories as PERMISSIVE for SELECT to anon, authenticated using ((NOT deleted));

create policy staff_all on categories as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on certificates as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on companies as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on coupons as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on day_closes as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on employees as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on expenses as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on feedback as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on invoice_lines as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on invoices as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on items as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on journals as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on offers as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy own_events on order_events as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_events.order_id) AND (o.user_id = auth.uid())))));

create policy staff_all on order_events as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy own_lines on order_lines as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_lines.order_id) AND (o.user_id = auth.uid())))));

create policy staff_all on order_lines as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy own_orders on orders as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));

create policy staff_all on orders as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on parties as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy staff_all on payments as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

create policy public_read on shop_config as PERMISSIVE for SELECT to anon, authenticated using (true);

create policy staff_write on shop_config as PERMISSIVE for UPDATE to authenticated using (is_staff()) with check (is_staff());

create policy self_read on staff as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));

create policy staff_all on stock_movements as PERMISSIVE for ALL to authenticated using (is_staff()) with check (is_staff());

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.order_events FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.order_lines FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.journals FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.day_closes FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION _sync_stamp();

-- grant execute on _buyer to service_role

-- grant execute on _coupon_discount to service_role

-- grant execute on _me to service_role

-- grant execute on _points to service_role

-- grant execute on _store to service_role

-- grant execute on _sync_stamp to PUBLIC, anon, authenticated, service_role

-- grant execute on _unit_price to service_role

-- grant execute on also_bought to PUBLIC, anon, authenticated, service_role

-- grant execute on check_coupon to PUBLIC, anon, authenticated, service_role

-- grant execute on confirm_payment to service_role

-- grant execute on is_order_staff to authenticated, service_role

-- grant execute on is_staff to PUBLIC, anon, authenticated, service_role

-- grant execute on my_points to PUBLIC, anon, authenticated, service_role

-- grant execute on my_rates to PUBLIC, anon, authenticated, service_role

-- grant execute on place_order to PUBLIC, anon, authenticated, service_role

-- grant execute on staff_inbox to authenticated, service_role

-- grant execute on staff_inbox_update to authenticated, service_role

-- grant execute on staff_orders to authenticated, service_role

-- grant execute on staff_update_order to authenticated, service_role

-- grant execute on store_info to PUBLIC, anon, authenticated, service_role

-- grant execute on submit_feedback to PUBLIC, anon, authenticated, service_role

-- grant execute on sync_pull to authenticated, service_role

-- grant execute on sync_push to authenticated, service_role

-- grant execute on sync_tables to PUBLIC, anon, authenticated, service_role

-- grant execute on track_order to PUBLIC, anon, authenticated, service_role

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on accounts to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on accounts to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on attendance to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on attendance to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on audit_log to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on audit_log to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on branches to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on branches to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on categories to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on categories to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on certificates to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on certificates to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on companies to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on companies to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on coupons to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on coupons to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on day_closes to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on day_closes to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on employees to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on employees to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on expenses to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on expenses to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on feedback to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on feedback to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on invoice_lines to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on invoice_lines to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on invoices to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on invoices to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on items to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on items to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on journals to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on journals to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on offers to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on offers to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on order_events to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on order_events to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on order_lines to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on order_lines to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on orders to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on orders to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on parties to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on parties to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on payments to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on payments to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_certificates to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_certificates to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_combos to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_combos to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_config to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_config to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_items to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_items to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_reviews to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on shop_reviews to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on staff to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on staff to authenticated

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on stock_movements to anon

-- grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on stock_movements to authenticated
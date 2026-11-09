-- Store pickup + best-before on the website. Additive only: works on top of whatever place_order / shop_items version is live.

-- 1. Pickup orders (address.pickup = true, sent by the website checkout) pay no delivery charge.
-- A trigger rather than a place_order change, so later place_order versions keep working unchanged.
-- If place_order ever drops the flag from the address, the order just keeps its normal shipping (the note still says STORE PICKUP).
create or replace function _pickup_no_shipping() returns trigger language plpgsql as $$
begin
  if coalesce(new.address->>'pickup', '') = 'true' and coalesce(new.shipping, 0) > 0 then
    new.total := new.total - new.shipping;
    new.shipping := 0;
  end if;
  return new;
end $$;
drop trigger if exists pickup_no_shipping on orders;
create trigger pickup_no_shipping before insert on orders for each row execute function _pickup_no_shipping();

-- 2. Earliest unexpired batch in stock per item at the online branch: the batch FEFO ships next.
-- The product page shows "Best before <month> or later". Items without batch expiry are left out.
create or replace function shop_expiry(p_items uuid[]) returns table (item_id uuid, expiry date)
language sql stable security definer set search_path = public as $$
  select b.item_id, min(b.expiry)
  from (
    select m.item_id, m.batch_no, m.expiry
    from stock_movements m
    -- only items the website publishes (shop_items = online, not deleted): item ids are derivable from slugs
    where m.item_id = any(p_items) and m.item_id in (select id from shop_items) and not m.deleted and m.expiry is not null
      and m.branch_id = (select online_branch_id from shop_config where id = 1)
    group by m.item_id, m.batch_no, m.expiry
    having sum(m.qty) > 0
  ) b
  where b.expiry >= current_date
  group by b.item_id
$$;
grant execute on function shop_expiry(uuid[]) to anon, authenticated;

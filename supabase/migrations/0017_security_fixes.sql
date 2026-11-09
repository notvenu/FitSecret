-- Security fixes from the review of the live schema (2026-11-09). Safe to run on the live project.

-- 1. The website views are read-only for the API roles.
-- Supabase's default privileges grant anon/authenticated ALL on every new view, and a single-table view such as shop_combos
-- is automatically updatable. Views run as their owner, which skips row level security, so before this anyone with the
-- public key could PATCH /rest/v1/shop_combos and set a live combo's price (place_order then sells it at that price).
revoke insert, update, delete, truncate, references, trigger on shop_items, shop_combos, shop_certificates, shop_reviews from anon, authenticated;
-- 0016's shop_expiry is a function, so it needs nothing here. New views: add them to the line above.

-- 2. Order tracking (order number + phone) shows the customer's order, not staff-only fields.
-- Before: internal_note ("Only staff see this" in the POS), payment_ref, points_party, branch_id and invoice_id were returned too.
create or replace function track_order(p_order_no text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'seq' - 'user_id' - 'deleted' - 'internal_note' - 'payment_ref' - 'points_party' - 'branch_id' - 'invoice_id',
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'variant', l.variant, 'qty', l.qty, 'price', l.price, 'total', l.total)), '[]')
              from order_lines l where l.order_id = o.id and not l.deleted),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.created_at), '[]')
               from order_events e where e.order_id = o.id and not e.deleted))
  from orders o
  where o.order_no = upper(trim(p_order_no))
    and o.phone = right(regexp_replace(p_phone, '\D', '', 'g'), 10) and not o.deleted
$$;

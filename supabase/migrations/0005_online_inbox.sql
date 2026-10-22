-- Online Store inbox: product reviews (approved by staff before showing), contact messages, back-in-stock requests.
-- Plus internal order notes and refund states (payment_status refund_pending / refunded, set by the POS).
-- Safe to run more than once. Run after 0004_online_store.sql.

alter table orders add column if not exists internal_note text;

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(), created_at timestamptz, updated_at timestamptz, deleted boolean default false, seq bigint,
  kind text, item_id uuid, order_no text, name text, phone text, email text, rating integer, title text, body text,
  status text default 'new', reply text, verified boolean default false
);

create or replace function sync_tables() returns text[] language sql immutable as $$
  select array['branches','categories','items','parties','invoices','invoice_lines','stock_movements','payments','expenses',
               'orders','order_lines','order_events','accounts','journals','coupons','feedback']
$$;

do $$ begin
  execute 'drop trigger if exists stamp on feedback';
  execute 'create trigger stamp before insert or update on feedback for each row execute function _sync_stamp()';
  execute 'create index if not exists feedback_seq_idx on feedback (seq)';
  execute 'create index if not exists feedback_phone_idx on feedback (phone, created_at)';
  execute 'alter table feedback enable row level security';
  execute 'drop policy if exists staff_all on feedback';
  execute 'create policy staff_all on feedback for all to authenticated using (is_staff()) with check (is_staff())';
end $$;

-- p: {kind:'review'|'message'|'restock', item_id, name, phone, email, rating, title, body, order_no}
create or replace function submit_feedback(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
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
end $$;

-- Approved reviews for product pages: first name only, never the phone.
create or replace view shop_reviews as
select f.id, f.item_id, coalesce(i.group_key, i.slug) as product_key, split_part(f.name, ' ', 1) as name, f.rating, f.title, f.body, f.reply,
       f.verified, f.created_at
from feedback f join items i on i.id = f.item_id
where f.kind = 'review' and f.status = 'approved' and not f.deleted and not i.deleted;

grant execute on function submit_feedback(jsonb) to anon, authenticated;
grant select on shop_reviews to anon, authenticated;

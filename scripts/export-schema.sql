-- Run in Supabase → SQL Editor, then copy the single result cell into supabase/live-schema.sql.
-- Read-only: it only looks at the catalogue. Exports what a security review needs from the live database
-- (functions, views, row-level security, policies, triggers, grants), since migrations 0006+ are not in the repo.
with parts as (
  -- functions in public, with their security mode and full source
  select 1 as ord, p.proname as name, pg_get_functiondef(p.oid) || ';' as ddl
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  union all
  -- views
  select 2, c.relname, format('create or replace view %I as%s', c.relname, pg_get_viewdef(c.oid, true))
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  union all
  -- tables: columns and whether row level security is on
  select 3, c.relname, format('-- table %I: rls %s%s%s', c.relname, case when c.relrowsecurity then 'ON' else 'OFF' end,
    case when c.relforcerowsecurity then ' (forced)' else '' end,
    E'\n--   ' || (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
                  from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped))
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  union all
  -- row level security policies
  select 4, p.tablename || '.' || p.policyname, format('create policy %I on %I as %s for %s to %s%s%s;', p.policyname, p.tablename, p.permissive, p.cmd,
    array_to_string(p.roles, ', '), coalesce(' using (' || p.qual || ')', ''), coalesce(' with check (' || p.with_check || ')', ''))
  from pg_policies p where p.schemaname = 'public'
  union all
  -- triggers
  select 5, t.tgname, pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all
  -- who may call each function (anon / authenticated / service_role)
  select 6, r.routine_name, format('-- grant execute on %s to %s', r.routine_name, string_agg(distinct r.grantee, ', '))
  from information_schema.routine_privileges r
  where r.routine_schema = 'public' and r.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  group by r.routine_name
  union all
  -- table and view grants to the API roles
  select 7, g.table_name, format('-- grant %s on %s to %s', string_agg(distinct g.privilege_type, ', '), g.table_name, g.grantee)
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
  group by g.table_name, g.grantee
)
select string_agg(ddl, E'\n\n' order by ord, name) as live_schema from parts;

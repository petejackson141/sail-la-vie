-- =====================================================================
-- keep-alive.sql  (06.11.2026)
-- =====================================================================
-- A tiny table for the GitHub "Supabase keep-alive" job
-- (.github/workflows/supabase-keep-alive.yml) to read twice a week, so the
-- free-plan project is never paused for inactivity.
-- It holds no user data, so signed-out "anon" may read it - the only table
-- where that's allowed. Nobody can change it through the app.
--
-- Run once in the Supabase SQL Editor of the LIVE (Frankfurt) project.
-- Safe to run again. Already included in 00-full-database-setup.sql.
-- =====================================================================

-- 1. the table, with its one row
create table if not exists public.keep_alive (
  id        int primary key,
  pinged_at timestamptz not null default now()
);
insert into public.keep_alive (id) values (1) on conflict (id) do nothing;

-- 2. grants: anon may read, nothing else (needed since Supabase's 30.10.2026 change)
revoke all on public.keep_alive from anon, authenticated;
grant select on public.keep_alive to anon;
grant all    on public.keep_alive to service_role;

-- 3. security rules: RLS on, one read rule
alter table public.keep_alive enable row level security;
drop policy if exists keep_alive_select on public.keep_alive;
create policy keep_alive_select on public.keep_alive
  for select to anon using (true);

-- 4. check: should show one row with id = 1
select * from public.keep_alive;

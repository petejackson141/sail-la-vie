-- =====================================================================
-- Sail la Vie: ERROR REPORTS (crash reporting, 02.11.2026)
-- =====================================================================
-- Run this ONCE in the live Frankfurt project:
--   Supabase -> sail-la-vie-eu -> SQL Editor -> New query -> paste -> Run.
-- It is also included in 00-full-database-setup.sql, so a future new
-- project gets it automatically.
--
-- What it adds:
--   * table error_reports: when something goes wrong in the app (a
--     JavaScript error, or a failure the app catches and logs), the app
--     quietly sends a short technical report: the error message, where in
--     the code it happened, app version, device type and screen. No sails,
--     photos or positions. Written by js/error-report.js.
--   * the app can only ADD reports, never read them back. You read them in
--     Supabase -> Table Editor -> error_reports (newest first).
--   * reports older than 90 days are deleted automatically (each new
--     report clears out the old ones), and all of a person's reports go
--     when they delete their account.
--
-- To see the latest problems, run:
--   select created_at, app_version, platform, screen, kind, message, source
--   from public.error_reports order by created_at desc limit 50;
-- =====================================================================

create table if not exists public.error_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  happened_at  timestamptz,                    -- when it happened on the phone (may be earlier if it was offline)
  kind         text not null default 'error'
               constraint error_reports_kind_check check (kind in ('error', 'promise', 'logged')),
  message      text not null
               constraint error_reports_message_check check (char_length(message) between 1 and 1000),
  source       text  constraint error_reports_source_check check (source is null or char_length(source) <= 300),
  stack        text  constraint error_reports_stack_check  check (stack  is null or char_length(stack)  <= 4000),
  screen       text  constraint error_reports_screen_check check (screen is null or char_length(screen) <= 60),
  app_version  text  constraint error_reports_version_check check (app_version is null or char_length(app_version) <= 40),
  platform     text  constraint error_reports_platform_check check (platform is null or char_length(platform) <= 20),
  device       text  constraint error_reports_device_check check (device is null or char_length(device) <= 200),
  repeats      integer not null default 1 check (repeats between 1 and 1000)
);
create index if not exists error_reports_created_idx on public.error_reports (created_at desc);
create index if not exists error_reports_user_id_idx on public.error_reports (user_id);

-- access (needed since Supabase's 30 October 2026 change): add only, never read back
revoke all on public.error_reports from anon, authenticated;
grant insert on public.error_reports to authenticated;
grant all on public.error_reports to service_role;

alter table public.error_reports enable row level security;
drop policy if exists "Users can send their own error reports" on public.error_reports;
create policy "Users can send their own error reports" on public.error_reports
  for insert to authenticated with check (user_id = auth.uid());

-- keep only the last 90 days: every new report removes anything older
create or replace function private.trim_old_error_reports()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.error_reports where created_at < now() - interval '90 days';
  return null;
end;
$$;
revoke all on function private.trim_old_error_reports() from public, anon, authenticated;
drop trigger if exists error_reports_trim on public.error_reports;
create trigger error_reports_trim after insert on public.error_reports
  for each statement execute function private.trim_old_error_reports();

-- check: should show error_reports | true | INSERT
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select string_agg(g.privilege_type, ', ' order by g.privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'authenticated') as app_access
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname = 'error_reports';

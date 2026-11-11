-- =====================================================================
-- NimoSail: FIND A SAILOR BY EMAIL (02.11.2026)
-- =====================================================================
-- Run this ONCE in the live Frankfurt project:
--   Supabase -> NimoSail -> SQL Editor -> New query -> paste -> Run.
-- It is also included in 00-full-database-setup.sql, so a future new
-- project gets it automatically.
--
-- What it adds:
--   * find_sailor_by_email(email): typing a full email address in the
--     Friends search finds that sailor. Only an EXACT match counts (no
--     "starts with" or partial searches), and it returns only their public
--     card (username, name, small photo) — never the email itself.
--   * only signed-in users can call it, and it never returns yourself.
--   * sailors who haven't chosen a username yet have no public card, so
--     they aren't found.
-- =====================================================================

create or replace function public.find_sailor_by_email(p_email text)
returns table (user_id uuid, username text, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.username, p.display_name, p.avatar_url
  from public.public_profiles p
  join auth.users u on u.id = p.user_id
  where auth.uid() is not null
    and u.id <> auth.uid()
    and lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_sailor_by_email(text) from public, anon;
grant execute on function public.find_sailor_by_email(text) to authenticated;

-- check: should show one row, find_sailor_by_email | true
select p.proname as function_name, has_function_privilege('authenticated', p.oid, 'execute') as app_can_call
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname = 'find_sailor_by_email';

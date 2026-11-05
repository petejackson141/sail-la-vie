-- =====================================================================
-- Sail la Vie: PUSH NOTIFICATIONS (05.11.2026)
-- =====================================================================
-- Run this ONCE in the live Frankfurt project:
--   Supabase -> sail-la-vie-eu -> SQL Editor -> New query -> paste -> Run.
-- It is also included in 00-full-database-setup.sql (section 5c).
-- Needs email-alerts.sql first (it uses the same pg_net tool and the same
-- notify_secret in the Vault).
--
-- What it adds:
--   * table push_tokens: each phone's "push address" (an FCM token) and
--     whose phone it is. The app saves it after sign-in (js/push.js) and
--     removes it on sign-out. A signed-in person only ever sees their own.
--   * register_push_token / unregister_push_token: the two calls the app
--     uses. Registering a phone moves it to whoever is signed in now (one
--     phone, one account at a time).
--   * three triggers that ask the send-push Edge Function to send a push:
--       - a friend sends you a sail        (new row in sail_shares)
--       - a friend request arrives          (new pending row in friendships)
--       - your friend request is accepted   (friendships: pending -> accepted)
--     ADDING AN EVENT LATER: copy one trigger below, give it a new "type",
--     and add that type's message in send-push/index.ts. No new APK needed
--     unless tapping it should open a screen the app doesn't know yet.
--   * a Vault secret push_url (where send-push lives).
--
-- Nothing here can stop a share or a friend request being saved: the push
-- is sent in the background and any problem is ignored.
--
-- Check what send-push answered recently:
--   select created, status_code, content from net._http_response order by created desc limit 10;
-- =====================================================================

-- 1. the table
create table if not exists public.push_tokens (
  token       text primary key,                         -- the phone's FCM push address
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null default 'android'
              constraint push_tokens_platform_check check (platform in ('android', 'ios', 'web')),
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

-- access (since Supabase's 30 October 2026 change every table needs a grant):
-- the app reads/removes only through the two functions below, never directly
revoke all on public.push_tokens from anon, authenticated;
grant all on public.push_tokens to service_role;
alter table public.push_tokens enable row level security;
-- no policies on purpose: with RLS on and no policy, the app can't touch the
-- table directly; only the two functions (and the service role) can.

-- 2. the two calls the app makes
create or replace function public.register_push_token(p_token text, p_platform text default 'android')
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_token is null or char_length(p_token) not between 10 and 4096 then raise exception 'Bad token'; end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'android'), now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text)     from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text)     to authenticated;

-- 3. where send-push lives (made only if it doesn't exist yet)
--    NEW PROJECT: change the address to the new project's
--    https://<project-ref>.supabase.co/functions/v1/send-push
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_url') then
    perform vault.create_secret(
      'https://lccwbkarqjohunofsghd.supabase.co/functions/v1/send-push',
      'push_url', 'Address of the send-push Edge Function');
  end if;
end $$;

-- 4. one helper that hands a message to send-push (same secret as email alerts)
create or replace function private.call_push(payload jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_secret is null then return; end if;  -- not set up: do nothing
  perform net.http_post(
    url     := v_url,
    body    := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function private.call_push(jsonb) from public, anon, authenticated;

-- 5. the three events
-- 5a. a friend sends you a sail
create or replace function private.push_on_sail_share()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.call_push(jsonb_build_object('type', 'sail_share', 'id', new.id));
  return null;
exception when others then return null;   -- never block the share
end;
$$;
revoke all on function private.push_on_sail_share() from public, anon, authenticated;
drop trigger if exists sail_shares_push on public.sail_shares;
create trigger sail_shares_push after insert on public.sail_shares
  for each row execute function private.push_on_sail_share();

-- 5b. a friend request arrives / 5c. your request is accepted
create or replace function private.push_on_friendship()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.call_push(jsonb_build_object('type', 'friend_request', 'to', new.addressee_id, 'from', new.requester_id));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform private.call_push(jsonb_build_object('type', 'friend_accepted', 'to', new.requester_id, 'from', new.addressee_id));
  end if;
  return null;
exception when others then return null;   -- never block the friend request
end;
$$;
revoke all on function private.push_on_friendship() from public, anon, authenticated;
drop trigger if exists friendships_push on public.friendships;
create trigger friendships_push after insert or update on public.friendships
  for each row execute function private.push_on_friendship();

-- check: should show push_tokens | true | (empty = the app has no direct access)
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select string_agg(g.privilege_type, ', ' order by g.privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'authenticated') as app_access
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname = 'push_tokens';

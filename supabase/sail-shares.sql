-- =====================================================================
-- Sail la Vie: SENDING A SAIL TO A FRIEND (30.10.2026)
-- =====================================================================
-- Run this ONCE in the live Frankfurt project:
--   Supabase -> sail-la-vie-eu -> SQL Editor -> New query -> paste -> Run.
-- It is also included in 00-full-database-setup.sql, so a future new
-- project gets it automatically.
--
-- What it adds:
--   * table sail_shares: "Pete sent Gabriel a copy of this sail". A row waits
--     until the friend taps "Add to my log" (the app makes its own copy and
--     deletes the row) or "Decline" (deletes the row).
--   * only accepted friends can send to each other; only the sender and the
--     receiver can see or delete the row.
--   * while a share is waiting, the receiver may open that sail's photos, so
--     the app can copy them into their own photo storage.
--   * live updates, so the friend sees it straight away.
-- =====================================================================

create table if not exists public.sail_shares (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references auth.users(id) on delete cascade,
  recipient_id  uuid not null references auth.users(id) on delete cascade,
  trip_id       text not null,                 -- the sender's sail id (its photo folder)
  sender_name   text,
  data          jsonb not null,                -- the copy of the sail
  created_at    timestamptz not null default now(),
  constraint sail_shares_not_self check (sender_id <> recipient_id)
);
create index if not exists sail_shares_recipient_idx on public.sail_shares (recipient_id);
create index if not exists sail_shares_sender_idx    on public.sail_shares (sender_id);

-- access (needed since Supabase's 30 October 2026 change) + row rules
revoke all on public.sail_shares from anon, authenticated;
grant select, insert, delete on public.sail_shares to authenticated;
grant all on public.sail_shares to service_role;

alter table public.sail_shares enable row level security;

drop policy if exists "Send a sail to a friend" on public.sail_shares;
create policy "Send a sail to a friend" on public.sail_shares
  for insert to authenticated
  with check (sender_id = auth.uid() and private.are_friends(auth.uid(), recipient_id));
drop policy if exists "See sails sent by or to me" on public.sail_shares;
create policy "See sails sent by or to me" on public.sail_shares
  for select to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists "Remove a sent sail" on public.sail_shares;
create policy "Remove a sent sail" on public.sail_shares
  for delete to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- photos: same as before, plus "a sail someone sent me that's still waiting"
create or replace function private.can_view_trip_photo(object_name text)
returns boolean language sql stable security definer set search_path = 'public'
as $$
  select
    (storage.foldername(object_name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.trips t
      join public.friendships f
        on f.status = 'accepted'
       and (
            (f.requester_id::text = auth.uid()::text and f.addressee_id::text = t.user_id::text)
         or (f.addressee_id::text = auth.uid()::text and f.requester_id::text = t.user_id::text)
       )
      where t.user_id::text = (storage.foldername(object_name))[1]
        and t.id::text      = (storage.foldername(object_name))[2]
        and t.visibility    = 'friends'
        and t.deleted_at is null
    )
    -- a friend's profile or cover photo (folder <friend-id>/profile/), added 20.10.2026
    or (
      (storage.foldername(object_name))[2] = 'profile'
      and exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and (
               (f.requester_id::text = auth.uid()::text and f.addressee_id::text = (storage.foldername(object_name))[1])
            or (f.addressee_id::text = auth.uid()::text and f.requester_id::text = (storage.foldername(object_name))[1])
          )
      )
    )
    -- a sail a friend sent me that's still waiting (sail_shares), added 30.10.2026
    or exists (
      select 1 from public.sail_shares s
      where s.recipient_id = auth.uid()
        and s.sender_id::text = (storage.foldername(object_name))[1]
        and s.trip_id         = (storage.foldername(object_name))[2]
    );
$$;

-- live updates
do $$
begin
  alter publication supabase_realtime add table public.sail_shares;
exception when duplicate_object then null;
end $$;

-- check: should show sail_shares | true | DELETE, INSERT, SELECT
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select string_agg(g.privilege_type, ', ' order by g.privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'authenticated') as app_access
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname = 'sail_shares';

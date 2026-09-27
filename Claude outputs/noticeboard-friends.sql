-- Sail la Vie: let friends see the Noticeboard plans you share with them.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.
--
-- 1. Adds a `visibility` column to noticeboard ('private' or 'friends').
--    Existing plans become 'private' — nothing is shared until you choose to.
-- 2. Adds a read-only policy: ACCEPTED friends can read plans marked 'friends'.
--    Your own owner-only policies are unchanged, so only you can add/edit/delete.

alter table public.noticeboard
  add column if not exists visibility text not null default 'private';

alter table public.noticeboard
  drop constraint if exists noticeboard_visibility_check;
alter table public.noticeboard
  add constraint noticeboard_visibility_check check (visibility in ('private', 'friends'));

drop policy if exists "Friends can read shared plans" on public.noticeboard;

create policy "Friends can read shared plans"
  on public.noticeboard
  for select
  to authenticated
  using (
    visibility = 'friends'
    and deleted_at is null
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = noticeboard.user_id)
          or
          (f.addressee_id = auth.uid() and f.requester_id = noticeboard.user_id)
        )
    )
  );

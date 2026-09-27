-- Sail la Vie: let friends see each other's profile details
-- (cover photo, bio, role, licence, phone, email, website).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it replaces the policy if it already exists.
--
-- Who can read a profile row after this:
--   * you (your existing owner-only policy is unchanged), and
--   * anyone you are ACCEPTED friends with — read-only.
-- Pending requests, strangers and signed-out people still see nothing.

drop policy if exists "Friends can read profile" on public.profiles;

create policy "Friends can read profile"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = profiles.id)
          or
          (f.addressee_id = auth.uid() and f.requester_id = profiles.id)
        )
    )
  );

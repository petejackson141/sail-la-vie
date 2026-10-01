-- Sail la Vie: tighten two database helper functions (health check item 2).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Nothing changes in how the app behaves.
--
-- 1. are_friends(a, b)
--    The app can call this function directly, and it would answer "are these two
--    users friends?" for ANY two people, so anyone could map out who is friends
--    with whom. Now it only answers when YOU are one of the two people. The trip
--    sharing rule always asks about you (are_friends(auth.uid(), owner)), so it
--    keeps working exactly as before.
--
-- 2. handle_new_user()
--    Runs when someone signs up and creates their profile row. It has extra
--    rights but no fixed "search_path", which Supabase's Security Advisor flags
--    as a warning. Now it has a fixed, empty search_path (all names are written
--    in full, e.g. public.profiles).
--
-- accept_friend_request, can_view_trip_photo and delete_my_account were checked
-- and are fine as they are.

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() in (a, b)
     and exists (
       select 1 from public.friendships
        where status = 'accepted'
          and ((requester_id = a and addressee_id = b)
            or (requester_id = b and addressee_id = a))
     );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

-- Check: both should show search_path=""
select proname, proconfig from pg_proc
where proname in ('are_friends', 'handle_new_user');

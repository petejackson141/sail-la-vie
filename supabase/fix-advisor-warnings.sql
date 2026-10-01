-- Sail la Vie: clear the Security Advisor warnings + add speed-up indexes.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Nothing changes in how the app behaves.
--
-- WHAT THE WARNINGS MEANT
--   Supabase lets the app call database functions directly over the internet
--   (".../rpc/<name>"). Our 5 helper functions were callable that way - even by
--   people who aren't signed in. None of them could do harm (each checks who is
--   asking), but nothing should be callable that doesn't need to be.
--
-- WHAT THIS DOES
--   1. Signed-out visitors ("anon") can no longer call ANY of our functions.
--   2. The 3 behind-the-scenes helpers (are_friends, can_view_trip_photo,
--      handle_new_user) move into a "private" area the internet can't reach.
--      The sharing rules and the sign-up trigger still find them automatically
--      (Postgres links them by an internal number, not by name).
--   3. accept_friend_request and delete_my_account stay callable by signed-in
--      users ON PURPOSE - the app's buttons use them, and each one only ever
--      acts on the person calling it. The Advisor will keep listing these two
--      as warnings; that's expected and fine.
--   4. Indexes: like a book's index, they let the database find "all of this
--      user's trips" without reading every row. Unnoticeable now, matters later.

-- 1 + 2: private area for internal helpers
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.are_friends(uuid, uuid)       set schema private;
alter function public.can_view_trip_photo(text)     set schema private;
alter function public.handle_new_user()             set schema private;

-- the sharing rules run as the signed-in user, so they need to be able to use these two
revoke all on function private.are_friends(uuid, uuid)   from public, anon;
revoke all on function private.can_view_trip_photo(text) from public, anon;
grant execute on function private.are_friends(uuid, uuid)   to authenticated;
grant execute on function private.can_view_trip_photo(text) to authenticated;

-- the sign-up trigger needs no one to have execute rights
revoke all on function private.handle_new_user() from public, anon, authenticated;

-- 3: the two app buttons - signed-in users only
revoke all on function public.accept_friend_request(uuid) from public, anon;
revoke all on function public.delete_my_account()         from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.delete_my_account()         to authenticated;

-- 4: indexes
create index if not exists trips_user_id_idx             on public.trips (user_id);
create index if not exists boats_user_id_idx             on public.boats (user_id);
create index if not exists crew_user_id_idx              on public.crew (user_id);
create index if not exists friendships_requester_id_idx  on public.friendships (requester_id);
create index if not exists friendships_addressee_id_idx  on public.friendships (addressee_id);

-- Check: the rules should now mention private.are_friends / private.can_view_trip_photo
select tablename, policyname, qual from pg_policies
where qual like '%are_friends%' or qual like '%can_view_trip_photo%';

-- Sail la Vie: switch on live (Realtime) updates for friend requests.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once: it skips anything that's already switched on.
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then
  raise notice 'friendships is already in supabase_realtime';
end $$;

-- Check: this should list friendships (plus boats, crew, trips, profiles, noticeboard).
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;

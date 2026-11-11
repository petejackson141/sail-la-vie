-- =====================================================================
-- NimoSail: PERFORMANCE ADVISOR TIDY-UP (02.11.2026)
-- =====================================================================
-- Run this ONCE in the live Frankfurt project:
--   Supabase -> NimoSail -> SQL Editor -> New query -> paste -> Run.
-- The master file 00-full-database-setup.sql has the same rules, so a
-- future new project gets them automatically.
--
-- WHO CAN SEE WHAT DOES NOT CHANGE. The rules are only rewritten so the
-- database works them out faster, which is what the Performance Advisor
-- asked for:
--   1. auth.uid() -> (select auth.uid())
--      Postgres then works out "who is signed in" once per query instead of
--      once per row. (Advisor: "Auth RLS Initialization Plan".)
--   2. One read rule per table instead of two
--      profiles, trips and noticeboard each had "read your own" AND "friends
--      can read" as two separate rules; both were checked for every row.
--      Now each is one rule: "yours OR a friend's shared one".
--      (Advisor: "Multiple Permissive Policies".)
--   3. An index on feedback.user_id (Advisor: "Unindexed foreign keys").
--
-- Everything runs as one block (begin ... commit): if any line fails,
-- NOTHING is changed and the old rules stay exactly as they were.
-- The last query lists every rule afterwards (about 34 rows).
-- =====================================================================

begin;

-- 0. remove every existing rule on the app's tables (they're all recreated below)
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','public_profiles','boats','crew','trips','noticeboard',
                        'friendships','feedback','sail_shares','error_reports')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- profiles: you, plus accepted friends can read
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = (select auth.uid()) and f.addressee_id = profiles.id)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = profiles.id))
    )
  );
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- public_profiles: every signed-in user can see name / username / small photo
create policy public_profiles_select on public.public_profiles
  for select to authenticated using (true);
create policy public_profiles_insert on public.public_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy public_profiles_update on public.public_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- boats: owner only
create policy boats_owner_full_access on public.boats
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- crew: owner only
create policy crew_select_own on public.crew for select to authenticated using (user_id = (select auth.uid()));
create policy crew_insert_own on public.crew for insert to authenticated with check (user_id = (select auth.uid()));
create policy crew_update_own on public.crew for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy crew_delete_own on public.crew for delete to authenticated using (user_id = (select auth.uid()));

-- trips: owner does everything; friends can read sails marked "friends"
create policy trips_select on public.trips
  for select to authenticated using (
    user_id = (select auth.uid())
    or (deleted_at is null
        and (visibility = 'public'
             or (visibility = 'friends' and private.are_friends((select auth.uid()), user_id))))
  );
create policy trips_insert on public.trips for insert to authenticated with check (user_id = (select auth.uid()));
create policy trips_update on public.trips for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy trips_delete on public.trips for delete to authenticated using (user_id = (select auth.uid()));

-- noticeboard: owner does everything; friends can read plans marked "friends"
create policy noticeboard_select on public.noticeboard
  for select to authenticated using (
    user_id = (select auth.uid())
    or (visibility = 'friends'
        and deleted_at is null
        and exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = (select auth.uid()) and f.addressee_id = noticeboard.user_id)
              or (f.addressee_id = (select auth.uid()) and f.requester_id = noticeboard.user_id))
        ))
  );
create policy noticeboard_insert on public.noticeboard for insert to authenticated with check (user_id = (select auth.uid()));
create policy noticeboard_update on public.noticeboard for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy noticeboard_delete on public.noticeboard for delete to authenticated using (user_id = (select auth.uid()));

-- friendships: only the two people involved; accepting goes through accept_friend_request()
create policy friendships_select on public.friendships
  for select to authenticated using ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_insert on public.friendships
  for insert to authenticated with check (requester_id = (select auth.uid()) and status = 'pending');
create policy friendships_delete on public.friendships
  for delete to authenticated using ((select auth.uid()) in (requester_id, addressee_id));

-- feedback: you can send it, nobody can read it back through the app
create policy feedback_insert on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

-- sail_shares: friends send each other a copy of a sail; only sender and receiver see it
create policy sail_shares_insert on public.sail_shares
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.are_friends((select auth.uid()), recipient_id));
create policy sail_shares_select on public.sail_shares
  for select to authenticated using ((select auth.uid()) in (sender_id, recipient_id));
create policy sail_shares_delete on public.sail_shares
  for delete to authenticated using ((select auth.uid()) in (sender_id, recipient_id));

-- error_reports: you can send your own, nobody can read them back through the app
create policy error_reports_insert on public.error_reports
  for insert to authenticated with check (user_id = (select auth.uid()));

-- photo storage: same rules, faster form (the "view" rule uses a helper function, unchanged)
drop policy if exists "trip photos: upload own" on storage.objects;
create policy "trip photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "trip photos: update own" on storage.objects;
create policy "trip photos: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "trip photos: delete own" on storage.objects;
create policy "trip photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- missing index
create index if not exists feedback_user_id_idx on public.feedback (user_id);

commit;

-- check: every rule now in place (table, rule, action)
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' or (schemaname = 'storage' and policyname like 'trip photos:%')
order by tablename, cmd, policyname;

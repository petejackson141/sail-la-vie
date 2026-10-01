-- Sail la Vie: close the profile privacy leak (health check item 2).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- THE PROBLEM
--   The `profiles` table (your full profile: phone, email, bio, licence, photos)
--   had an old policy "Profiles are viewable by everyone" (using: true). It let
--   ANYONE read EVERY user's full profile - not just friends - using the app's
--   public key, which is visible in the app's code on GitHub. That overrides
--   the "Friends can read profile" rule, and breaks what the privacy policy says.
--
-- THE FIX
--   1. Remove the "everyone" policy.
--   2. Add an explicit "read your own profile" policy (the app needs this for
--      sign-in sync; until now it only worked because of the "everyone" rule).
--   3. "Friends can read profile" stays exactly as it is.
--   4. Make the update policy also check the row after the change (belt and braces).
--
-- Who can read a full profile after this: you, and your accepted friends. Nobody else.
-- Name, username and small photo stay visible via `public_profiles` (unchanged).

drop policy if exists "Profiles are viewable by everyone" on public.profiles;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Check: should list exactly 4 policies for profiles:
--   Friends can read profile (SELECT), Users can insert their own profile (INSERT),
--   Users can read their own profile (SELECT), Users can update their own profile (UPDATE)
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'profiles' order by policyname;

-- =====================================================================
-- Sail la Vie: COMPLETE DATABASE SETUP (health check item 3)
-- =====================================================================
-- What this is:
--   Everything the Sail la Vie database needs, in one file, in the right
--   order: tables, security rules, helper functions, the sign-up trigger,
--   photo storage and live updates. It matches the live database as it was
--   on 1 October 2026 (after fix-profiles-privacy.sql, harden-functions.sql
--   and fix-advisor-warnings.sql were run).
--
-- When to use it:
--   * Moving to a new Supabase project (e.g. Tokyo -> Frankfurt): create the
--     new project, then SQL Editor -> New query -> paste this whole file -> Run.
--   * As the reference for "what does the database look like?".
--   Running it on the LIVE project does no harm (everything is "if not exists"
--   or "replace"), but there's no need to.
--
-- After it runs on a NEW project you still need to, by hand:
--   1. Authentication -> URL Configuration: Site URL + Redirect URLs
--      (include saillavie://auth-callback for the Android app).
--   2. Authentication -> Sign In / Providers -> Email: "Confirm email" on/off.
--   3. Put the new project's URL + publishable key in docs/js/auth.js.
--   4. Copy the data across (users, rows and photos) - ask Claude for that step.
--
-- RULE FOR THE FUTURE: whenever a database change is made, update this file
-- too, so it always describes the real database.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABLES
--    Most tables follow one pattern: id (made by the app), user_id (owner),
--    data (the whole record as JSON), updated_at (newest wins when syncing),
--    deleted_at (soft delete, so other devices learn about deletions).
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  profile_data  jsonb,                 -- the full profile (name, bio, phone, photos...)
  avatar_url    text,                  -- old, unused by the app
  boat_name     text,                  -- old, unused by the app
  created_at    timestamptz default now()
);

create table if not exists public.public_profiles (   -- what everyone can see: name, username, small photo
  user_id       uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  display_name  text,
  avatar_url    text,
  updated_at    timestamptz not null default now(),
  constraint public_profiles_username_format check (
    char_length(username) between 3 and 20
    and username ~ '^[[:alnum:]._''’׳-]+( [[:alnum:]._''’׳-]+)*$'
  )
);
create unique index if not exists public_profiles_username_lower_key
  on public.public_profiles (lower(username));

create table if not exists public.boats (
  id          text primary key,
  user_id     uuid not null references auth.users(id),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.crew (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.trips (
  id          text primary key,
  user_id     uuid not null references auth.users(id),
  data        jsonb not null,
  visibility  text not null default 'private'
              constraint trips_visibility_check check (visibility in ('private', 'friends', 'public')),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.noticeboard (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  visibility  text not null default 'private'
              constraint noticeboard_visibility_check check (visibility in ('private', 'friends')),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id) on delete cascade,
  addressee_id  uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                constraint friendships_status_check check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint no_self_friend check (requester_id <> addressee_id)
);
-- one friendship per pair of people, whichever way round it was asked
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table if not exists public.feedback (          -- the About page's "Contact us" form
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid default auth.uid() references auth.users(id) on delete set null,
  topic        text not null default 'feedback'
               constraint feedback_topic_check check (topic in ('feedback', 'problem', 'idea', 'other')),
  message      text not null
               constraint feedback_message_check check (char_length(message) between 1 and 5000),
  email        text,
  screenshot   text
               constraint feedback_screenshot_check check (screenshot is null or char_length(screenshot) <= 2000000),
  device       text,
  app_version  text,
  created_at   timestamptz not null default now()
);

-- indexes: let the database find "this user's rows" quickly
create index if not exists trips_user_id_idx             on public.trips (user_id);
create index if not exists boats_user_id_idx             on public.boats (user_id);
create index if not exists crew_user_id_idx              on public.crew (user_id);
create index if not exists noticeboard_user_id_idx       on public.noticeboard (user_id);
create index if not exists friendships_requester_id_idx  on public.friendships (requester_id);
create index if not exists friendships_addressee_id_idx  on public.friendships (addressee_id);


-- ---------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
--    "private" = internal helpers the internet can't call directly.
--    "public"  = the two the app's buttons call (Accept friend, Delete account).
-- ---------------------------------------------------------------------

create schema if not exists private;
grant usage on schema private to authenticated;

-- Are these two people accepted friends? Only answers if YOU are one of them.
create or replace function private.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() in (a, b)
     and exists (
       select 1 from public.friendships
        where status = 'accepted'
          and ((requester_id = a and addressee_id = b)
            or (requester_id = b and addressee_id = a))
     );
$$;

-- May the signed-in user see this photo? Yes if it's theirs, or it belongs to
-- a sail a friend shared with them. Photo paths look like <owner-id>/<sail-id>/<photo>.jpg
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
    );
$$;

-- Runs automatically when someone signs up: creates their profiles row.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- "Accept" button on a friend request (only the person who was asked can accept).
create or replace function public.accept_friend_request(request_id uuid)
returns void language sql security definer set search_path = 'public'
as $$
  update public.friendships
     set status = 'accepted', updated_at = now()
   where id = request_id
     and addressee_id = auth.uid()
     and status = 'pending';
$$;

-- "Delete account" in Settings. The app deletes the user's photos from storage
-- first (auth.js), then calls this to remove every row and the login itself.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  delete from public.trips           where user_id = uid;
  delete from public.boats           where user_id = uid;
  delete from public.crew            where user_id = uid;
  delete from public.noticeboard     where user_id = uid;
  delete from public.friendships     where requester_id = uid or addressee_id = uid;
  delete from public.public_profiles where user_id = uid;
  delete from public.profiles        where id = uid;
  delete from public.feedback        where user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

-- who may call what
revoke all on function private.are_friends(uuid, uuid)      from public, anon;
revoke all on function private.can_view_trip_photo(text)    from public, anon;
revoke all on function private.handle_new_user()            from public, anon, authenticated;
revoke all on function public.accept_friend_request(uuid)   from public, anon;
revoke all on function public.delete_my_account()           from public, anon;
grant execute on function private.are_friends(uuid, uuid)    to authenticated;
grant execute on function private.can_view_trip_photo(text)  to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.delete_my_account()         to authenticated;


-- ---------------------------------------------------------------------
-- 3. SECURITY RULES (Row Level Security)
--    With RLS on, a table shows NOTHING unless a rule below allows it.
-- ---------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.public_profiles enable row level security;
alter table public.boats           enable row level security;
alter table public.crew            enable row level security;
alter table public.trips           enable row level security;
alter table public.noticeboard     enable row level security;
alter table public.friendships     enable row level security;
alter table public.feedback        enable row level security;

-- profiles: you, plus accepted friends (read-only)
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Friends can read profile" on public.profiles;
create policy "Friends can read profile" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = profiles.id)
          or (f.addressee_id = auth.uid() and f.requester_id = profiles.id))
    )
  );

-- public_profiles: every signed-in user can see name / username / small photo
drop policy if exists "Signed-in users can view public profiles" on public.public_profiles;
create policy "Signed-in users can view public profiles" on public.public_profiles
  for select to authenticated using (true);
drop policy if exists "Users create their own public profile" on public.public_profiles;
create policy "Users create their own public profile" on public.public_profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users update their own public profile" on public.public_profiles;
create policy "Users update their own public profile" on public.public_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- boats: owner only
drop policy if exists boats_owner_full_access on public.boats;
create policy boats_owner_full_access on public.boats
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- crew: owner only
drop policy if exists crew_select_own on public.crew;
create policy crew_select_own on public.crew for select to authenticated using (auth.uid() = user_id);
drop policy if exists crew_insert_own on public.crew;
create policy crew_insert_own on public.crew for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists crew_update_own on public.crew;
create policy crew_update_own on public.crew for update to authenticated using (auth.uid() = user_id);
drop policy if exists crew_delete_own on public.crew;
create policy crew_delete_own on public.crew for delete to authenticated using (auth.uid() = user_id);

-- trips: owner does everything; friends can read sails marked "friends"
drop policy if exists trips_owner_full_access on public.trips;
create policy trips_owner_full_access on public.trips
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Friends can view shared trips" on public.trips;
create policy "Friends can view shared trips" on public.trips
  for select to authenticated using (
    deleted_at is null
    and (visibility = 'public'
         or (visibility = 'friends' and private.are_friends(auth.uid(), user_id)))
  );

-- noticeboard: owner does everything; friends can read plans marked "friends"
drop policy if exists "noticeboard select own" on public.noticeboard;
create policy "noticeboard select own" on public.noticeboard for select to authenticated using (auth.uid() = user_id);
drop policy if exists "noticeboard insert own" on public.noticeboard;
create policy "noticeboard insert own" on public.noticeboard for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "noticeboard update own" on public.noticeboard;
create policy "noticeboard update own" on public.noticeboard for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "noticeboard delete own" on public.noticeboard;
create policy "noticeboard delete own" on public.noticeboard for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "Friends can read shared plans" on public.noticeboard;
create policy "Friends can read shared plans" on public.noticeboard
  for select to authenticated using (
    visibility = 'friends'
    and deleted_at is null
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = noticeboard.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = noticeboard.user_id))
    )
  );

-- friendships: only the two people involved; accepting goes through accept_friend_request()
drop policy if exists "See my own friendships" on public.friendships;
create policy "See my own friendships" on public.friendships
  for select to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);
drop policy if exists "Send a friend request" on public.friendships;
create policy "Send a friend request" on public.friendships
  for insert to authenticated with check (requester_id = auth.uid() and status = 'pending');
drop policy if exists "Remove a friendship" on public.friendships;
create policy "Remove a friendship" on public.friendships
  for delete to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- feedback: you can send it, nobody can read it back through the app
drop policy if exists "Users can send their own feedback" on public.feedback;
create policy "Users can send their own feedback" on public.feedback
  for insert to authenticated with check (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 4. PHOTO STORAGE
--    Private bucket, max 5 MB per photo, pictures only.
--    Each photo lives in <owner-id>/<sail-id>/<photo>.jpg
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "trip photos: view own or friends" on storage.objects;
create policy "trip photos: view own or friends" on storage.objects
  for select to authenticated
  using (bucket_id = 'trip-photos' and private.can_view_trip_photo(name));
drop policy if exists "trip photos: upload own" on storage.objects;
create policy "trip photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "trip photos: update own" on storage.objects;
create policy "trip photos: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "trip photos: delete own" on storage.objects;
create policy "trip photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text);


-- ---------------------------------------------------------------------
-- 5. LIVE UPDATES (Realtime)
--    Changes on one device appear on your other devices straight away.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['boats', 'crew', 'trips', 'noticeboard', 'profiles', 'friendships'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- already switched on
    end;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 6. CHECK
--    Should list 8 tables, all with rls_enabled = true.
-- ---------------------------------------------------------------------
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;

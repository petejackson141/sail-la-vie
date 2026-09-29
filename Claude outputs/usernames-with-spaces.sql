-- Sail la Vie: allow usernames with spaces and capitals ("Pete Jackson").
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.
--
-- What it does:
--   1. Removes the old username format rule (lowercase letters, numbers, _ and . only).
--   2. Adds the new rule: 3-20 characters; letters in any language, numbers, . _ - '
--      and single spaces between words (no space at the start or end).
--   3. Makes usernames unique regardless of capitals, so "pete jackson" counts as taken
--      when "Pete Jackson" already exists.
-- Existing usernames all fit the new rule, so nothing needs changing.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.public_profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%username%'
  loop
    execute format('alter table public.public_profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.public_profiles
  add constraint public_profiles_username_format
  check (
    char_length(username) between 3 and 20
    and username ~ '^[[:alnum:]._''’׳-]+( [[:alnum:]._''’׳-]+)*$'
  );

create unique index if not exists public_profiles_username_lower_key
  on public.public_profiles (lower(username));

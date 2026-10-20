-- Sail la Vie: let friends see profile and cover photos in photo storage.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- WHY
--   From version 20.10.2026.1815 the app moves your profile photo and cover photo
--   out of your profile record and into the same "trip-photos" storage as sail
--   photos, in the folder <your-user-id>/profile/.
--   Storage already lets you see your OWN photos. This adds one more case:
--   your FRIENDS may see the photos in your "profile" folder, exactly as they can
--   already read your full profile. Nobody else can.
--   Uploading and deleting still work only in your own folder (unchanged).

create or replace function private.can_view_trip_photo(object_name text)
returns boolean language sql stable security definer set search_path = 'public'
as $$
  select
    -- your own photos
    (storage.foldername(object_name))[1] = auth.uid()::text
    -- a sail a friend shared with you
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
    -- a friend's profile or cover photo (folder <friend-id>/profile/)
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
    );
$$;

-- keep the same permissions as before (signed-in users only)
revoke all on function private.can_view_trip_photo(text) from public, anon;
grant execute on function private.can_view_trip_photo(text) to authenticated;

-- Check: should say "true" (the function now mentions the profile folder)
select position('profile' in pg_get_functiondef('private.can_view_trip_photo(text)'::regprocedure)) > 0 as profile_rule_installed;

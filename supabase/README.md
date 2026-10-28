# Sail la Vie database (Supabase)

**`00-full-database-setup.sql`** is the master file. It builds the whole database
from nothing, in the right order: tables, security rules, helper functions, the
sign-up trigger, photo storage and live updates.

- **Moving to a new Supabase project** (e.g. Tokyo → Frankfurt): run this file
  in the new project's SQL Editor, then follow the "by hand" steps at the top of it.
- **Every time the database changes**, update this file too, so it always
  matches the real database.
- **Every new table needs a GRANT line** (section 1b of the master file) as well
  as RLS + policies. Since Supabase's change on 30 October 2026, a table without
  a grant gives the app "permission denied".

Last checked against the live Tokyo database: **28 October 2026** — all tables,
columns, policies, functions, the sign-up trigger, realtime and the photo bucket matched.

## The other files here

One-off fixes that have **already been run** on the live database (1 October 2026).
Their changes are already included in the master file, so they never need running again.
They're kept as a record of what was changed and why.

| File | What it did |
|---|---|
| `fix-profiles-privacy.sql` | Stopped anyone reading everyone's full profile (phone, email…) |
| `harden-functions.sql` | Tightened `are_friends` and the sign-up function |
| `fix-advisor-warnings.sql` | Cleared the Security Advisor warnings, added indexes |
| `profile-photos.sql` | Lets friends see profile and cover photos in photo storage (20 October 2026) |

## Expected Security Advisor warnings (all fine)

- `accept_friend_request`, `delete_my_account`: signed-in users must be able to
  call these (the Accept and Delete account buttons).
- Leaked password protection: Supabase Pro plan only.

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

Last checked against the live Frankfurt database: **4 November 2026** — all tables,
columns, grants, policies, functions, triggers, realtime and the photo bucket matched.

## The other files here

One-off fixes for the live database. All have been run (the last four checked on Frankfurt, 4 November 2026), except `push-notifications.sql`, which is new.
Their changes are already included in the master file, so they never need running again.
They're kept as a record of what was changed and why.

| File | What it did |
|---|---|
| `fix-profiles-privacy.sql` | Stopped anyone reading everyone's full profile (phone, email…) |
| `harden-functions.sql` | Tightened `are_friends` and the sign-up function |
| `fix-advisor-warnings.sql` | Cleared the Security Advisor warnings, added indexes |
| `profile-photos.sql` | Lets friends see profile and cover photos in photo storage (20 October 2026) |
| `sail-shares.sql` | "Send to a friend's app": the `sail_shares` table, its rules, and letting the friend copy that sail's photos (30 October 2026) — run on Frankfurt (checked 4 November 2026) |
| `advisor-tidy-up.sql` | Performance Advisor tidy-up: rules rewritten with (select auth.uid()), one read rule per table, feedback index. Who can see what is unchanged (2 November 2026) — run on Frankfurt (checked 4 November 2026) |
| `error-reports.sql` | Crash / error reporting: the `error_reports` table the app writes problems to, kept 90 days (2 November 2026) — run on Frankfurt (checked 4 November 2026) |
| `find-by-email.sql` | Friends search by full email address: the `find_sailor_by_email` function (2 November 2026) — run on Frankfurt (checked 4 November 2026) |
| `email-alerts.sql` | Email alerts: new Contact us feedback emailed straight away, daily error summary at 06:00 UTC, through the `notify-email` Edge Function and Resend (4 November 2026) — run on Frankfurt (4 November 2026) |
| `push-notifications.sql` | Push notifications: the `push_tokens` table, `register_push_token` / `unregister_push_token`, and triggers on `sail_shares` and `friendships` that call the `send-push` Edge Function (5 November 2026) — **to run on Frankfurt** |
| `keep-alive.sql` | The one-row `keep_alive` table the GitHub keep-alive job reads twice a week, so the free-plan project is never paused for inactivity. The only table signed-out "anon" may read (no user data in it) (6 November 2026) — **to run on Frankfurt** |

## Keep-alive job

`.github/workflows/supabase-keep-alive.yml` runs on GitHub every Monday and Thursday
(06:17 UTC) and reads `keep_alive`. It needs two GitHub repository secrets:
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (the same as in `docs/js/auth.js`).
GitHub only runs it from `main`. If it fails, GitHub emails you. Test it from the
Actions tab → Supabase keep-alive → Run workflow.
**After a project move, update both secrets to the new project.**

## Expected Security Advisor warnings (all fine)

- `accept_friend_request`, `delete_my_account`, `find_sailor_by_email`: signed-in
  users must be able to call these (the Accept, Delete account and Friends search).
- Leaked password protection: Supabase Pro plan only.

## Edge Functions

The code for Supabase Edge Functions lives in `functions/`. They are deployed by
pasting the file into Supabase → Edge Functions (no command line needed).

| Function | What it does | Settings |
|---|---|---|
| `notify-email` | Emails sailapp141@gmail.com: each new Contact us message (with screenshot), and the daily error summary. Only the database calls it (`email-alerts.sql`). | "Verify JWT" **off**. Secrets: `RESEND_API_KEY` (Resend, in Bitwarden), `NOTIFY_SECRET` (shown by `email-alerts.sql`) |
| `send-push` | Sends phone push notifications through Firebase (project sail-la-vie-38260): a friend sent you a sail, a friend request, a request accepted. Only the database calls it (`push-notifications.sql`). | "Verify JWT" **off**. Secrets: `FIREBASE_SERVICE_ACCOUNT` (whole firebase-service-account.json), `NOTIFY_SECRET` (shared with notify-email) |

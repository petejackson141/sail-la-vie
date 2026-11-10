-- =====================================================================
-- NimoSail: EMAIL ALERTS (feedback + daily error summary, 04.11.2026)
-- =====================================================================
-- Run this ONCE in the live Frankfurt project:
--   Supabase -> sail-la-vie-eu -> SQL Editor -> New query -> paste -> Run.
-- It is also included in 00-full-database-setup.sql (section 7).
--
-- What it adds:
--   * a trigger on the feedback table: every new "Contact us" message is
--     handed to the notify-email Edge Function, which emails it (with the
--     screenshot) to sailapp141@gmail.com straight away.
--   * a daily job at 06:00 UTC (08:00 Israel in winter, 09:00 in summer)
--     that asks notify-email for a summary of the last 24 hours of
--     error_reports. No errors = no email.
--   * two Vault secrets: notify_url (where the function is) and
--     notify_secret (a random password the function checks, so nobody
--     else can make it send emails). The secret is made here and shown
--     ONCE at the end: copy it into Edge Functions -> Secrets as NOTIFY_SECRET.
--
-- Nothing here can stop feedback being saved: the call is sent in the
-- background (pg_net), and any problem is ignored.
--
-- Useful checks later:
--   what the function answered recently:
--     select created, status_code, content from net._http_response order by created desc limit 10;
--   the daily job and its last runs:
--     select * from cron.job;
--     select start_time, status, return_message from cron.job_run_details order by start_time desc limit 5;
--   send a test error summary now (sends even if there are no errors):
--     select private.call_notify('{"type":"daily-errors","test":true}'::jsonb);
-- =====================================================================

-- 1. the two tools: pg_net (database can call a web address) and pg_cron (timed jobs)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 2. the Vault secrets (made only if they don't exist yet)
--    NEW PROJECT: change the address below to the new project's
--    https://<project-ref>.supabase.co/functions/v1/notify-email
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'notify_url') then
    perform vault.create_secret(
      'https://lccwbkarqjohunofsghd.supabase.co/functions/v1/notify-email',
      'notify_url', 'Address of the notify-email Edge Function');
  end if;
  if not exists (select 1 from vault.secrets where name = 'notify_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(24), 'hex'),
      'notify_secret', 'Shared secret: must match NOTIFY_SECRET in Edge Functions -> Secrets');
  end if;
end $$;

-- 3. one helper that sends a message to notify-email
create or replace function private.call_notify(payload jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_secret is null then
    return;  -- not set up: do nothing
  end if;
  perform net.http_post(
    url     := v_url,
    body    := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function private.call_notify(jsonb) from public, anon, authenticated;

-- 4. new feedback -> email straight away (only the id is sent; the
--    function reads the message and screenshot itself)
create or replace function private.notify_new_feedback()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.call_notify(jsonb_build_object('type', 'feedback', 'id', new.id));
  return null;
exception when others then
  return null;  -- never let an email problem block saving the feedback
end;
$$;
revoke all on function private.notify_new_feedback() from public, anon, authenticated;
drop trigger if exists feedback_email on public.feedback;
create trigger feedback_email after insert on public.feedback
  for each row execute function private.notify_new_feedback();

-- 5. daily error summary at 06:00 UTC
select cron.unschedule('daily-error-summary')
where exists (select 1 from cron.job where jobname = 'daily-error-summary');
select cron.schedule('daily-error-summary', '0 6 * * *',
  $job$ select private.call_notify('{"type":"daily-errors"}'::jsonb) $job$);

-- 6. show the secret ONCE: copy it into Edge Functions -> Secrets as NOTIFY_SECRET
--    (and into Bitwarden). You can show it again any time with this same line.
select decrypted_secret as copy_this_into_NOTIFY_SECRET
from vault.decrypted_secrets where name = 'notify_secret';

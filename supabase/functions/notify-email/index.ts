// =====================================================================
// NimoSail: notify-email (Supabase Edge Function, 04.11.2026)
// =====================================================================
// Sends Pete an email when:
//   1. someone sends the app's "Contact us" form (straight away), and
//   2. once a day, a summary of the app's error reports from the last
//      24 hours (only if there were any).
//
// Who calls it: never the app. Only the database calls it, through
// supabase/email-alerts.sql:
//   * a trigger on the feedback table sends {"type":"feedback","id":"..."}
//   * a daily cron job (08:00 Israel winter time) sends {"type":"daily-errors"}
// Every call must carry the secret header x-notify-secret, so nobody else
// can make it send emails.
//
// The emails go out through Resend (resend.com, free plan). With no domain of
// our own, Resend only delivers to the email the Resend account was opened
// with, which is sailapp141@gmail.com.
//
// Settings (Supabase -> Edge Functions -> Secrets):
//   RESEND_API_KEY  the key from Resend (starts with re_) - also in Bitwarden
//   NOTIFY_SECRET   the same secret the database keeps in its Vault
//                   (shown when email-alerts.sql is run)
//   ALERT_EMAIL     optional - where to send, default sailapp141@gmail.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via editor,
// name it notify-email, paste this whole file, and turn OFF
// "Verify JWT" (the secret header does that job instead).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const ALERT_EMAIL = Deno.env.get("ALERT_EMAIL") ?? "sailapp141@gmail.com";
const FROM = "NimoSail <onboarding@resend.dev>";

// The service role key can read everything (feedback, error reports, users).
// It lives only here on Supabase's servers, never in the app.
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  // 1. Only the database knows the secret, so only it can get past here.
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) {
    return new Response("Not allowed", { status: 401 });
  }

  try {
    const body = await req.json();
    if (body.type === "feedback") return await sendFeedback(body.id);
    if (body.type === "daily-errors") return await sendErrorSummary(body.test === true);
    return new Response("Unknown type", { status: 400 });
  } catch (e) {
    console.error(e);
    return new Response("Failed: " + (e as Error).message, { status: 500 });
  }
});

// ---------- 1. Contact us -> one email per message ----------
async function sendFeedback(id: string) {
  const { data: fb, error } = await db.from("feedback").select("*").eq("id", id).single();
  if (error || !fb) throw new Error("Feedback " + id + " not found");

  // who sent it: username from the public profile, email from their account
  let who = "a signed-out user";
  let accountEmail: string | null = null;
  if (fb.user_id) {
    const { data: pp } = await db.from("public_profiles")
      .select("username, display_name").eq("user_id", fb.user_id).maybeSingle();
    const { data: u } = await db.auth.admin.getUserById(fb.user_id);
    accountEmail = u?.user?.email ?? null;
    who = [pp?.display_name, pp?.username ? "@" + pp.username : null, accountEmail]
      .filter(Boolean).join(" · ") || fb.user_id;
  }
  const replyTo = fb.email || accountEmail; // "Reply" in Gmail goes straight to them

  // the screenshot is stored as a data URL ("data:image/jpeg;base64,....")
  const attachments = [];
  const m = typeof fb.screenshot === "string" && fb.screenshot.match(/^data:image\/(\w+);base64,(.+)$/);
  if (m) attachments.push({ filename: "screenshot." + (m[1] === "jpeg" ? "jpg" : m[1]), content: m[2] });

  const topicLabel: Record<string, string> = {
    feedback: "Feedback", problem: "Problem", idea: "Idea", other: "Other",
  };
  const topic = topicLabel[fb.topic] ?? fb.topic;

  const html = `
    <h2 style="font-family:sans-serif;color:#0b5c7a">${esc(topic)} from NimoSail</h2>
    <p style="font-family:sans-serif;white-space:pre-wrap;font-size:15px">${esc(fb.message)}</p>
    <table style="font-family:sans-serif;font-size:13px;color:#555">
      <tr><td><b>From</b></td><td>${esc(who)}</td></tr>
      ${fb.email ? `<tr><td><b>Reply email</b></td><td>${esc(fb.email)}</td></tr>` : ""}
      <tr><td><b>App version</b></td><td>${esc(fb.app_version ?? "-")}</td></tr>
      <tr><td><b>Device</b></td><td>${esc(fb.device ?? "-")}</td></tr>
      <tr><td><b>Sent</b></td><td>${israelTime(fb.created_at)}</td></tr>
      <tr><td><b>Screenshot</b></td><td>${attachments.length ? "attached" : "none"}</td></tr>
    </table>`;

  await sendEmail({
    subject: `NimoSail ${topic}: ${fb.message.slice(0, 60)}${fb.message.length > 60 ? "…" : ""}`,
    html,
    reply_to: replyTo ?? undefined,
    attachments,
  });
  return new Response("Feedback email sent");
}

// ---------- 2. Daily error summary ----------
async function sendErrorSummary(isTest: boolean) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await db.from("error_reports")
    .select("created_at, kind, message, source, screen, app_version, platform, user_id, repeats")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  if (!rows.length && !isTest) return new Response("No errors - no email");

  // group the same error (same message + same place in the code) together
  type Group = { message: string; source: string; count: number; users: Set<string>;
                 versions: Set<string>; platforms: Set<string>; screens: Set<string>; last: string };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = r.message + "|" + (r.source ?? "");
    const g = groups.get(key) ?? { message: r.message, source: r.source ?? "", count: 0,
      users: new Set(), versions: new Set(), platforms: new Set(), screens: new Set(), last: r.created_at };
    g.count += r.repeats ?? 1;
    if (r.user_id) g.users.add(r.user_id);
    if (r.app_version) g.versions.add(r.app_version);
    if (r.platform) g.platforms.add(r.platform);
    if (r.screen) g.screens.add(r.screen);
    if (r.created_at > g.last) g.last = r.created_at;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count);
  const total = list.reduce((n, g) => n + g.count, 0);
  const people = new Set(rows.map((r) => r.user_id).filter(Boolean)).size;

  const tableRows = list.map((g) => `
    <tr style="border-top:1px solid #ddd;vertical-align:top">
      <td style="padding:6px;text-align:right"><b>${g.count}</b></td>
      <td style="padding:6px">${esc(g.message)}<br><span style="color:#888;font-size:12px">${esc(g.source)}</span></td>
      <td style="padding:6px">${g.users.size}</td>
      <td style="padding:6px;font-size:12px">${esc([...g.versions].join(", "))}<br>${esc([...g.platforms].join(", "))}</td>
      <td style="padding:6px;font-size:12px">${esc([...g.screens].join(", "))}</td>
      <td style="padding:6px;font-size:12px">${israelTime(g.last)}</td>
    </tr>`).join("");

  const html = rows.length ? `
    <h2 style="font-family:sans-serif;color:#0b5c7a">NimoSail errors - last 24 hours</h2>
    <p style="font-family:sans-serif">${total} error${total === 1 ? "" : "s"}, ${list.length} different, from ${people} user${people === 1 ? "" : "s"}.</p>
    <table style="font-family:sans-serif;font-size:13px;border-collapse:collapse">
      <tr style="text-align:left;color:#555"><th style="padding:6px">Times</th><th style="padding:6px">Error / where</th><th style="padding:6px">Users</th><th style="padding:6px">Version / platform</th><th style="padding:6px">Screen</th><th style="padding:6px">Last seen</th></tr>
      ${tableRows}
    </table>
    <p style="font-family:sans-serif;font-size:12px;color:#888">Full details (stack traces): Supabase -> Table Editor -> error_reports.</p>`
    : `<p style="font-family:sans-serif">Test email: no errors in the last 24 hours. The daily summary is working.</p>`;

  await sendEmail({
    subject: rows.length
      ? `NimoSail: ${total} error${total === 1 ? "" : "s"} in the last 24 hours`
      : "NimoSail: error summary test (no errors)",
    html,
  });
  return new Response("Error summary sent");
}

// ---------- helpers ----------
async function sendEmail(msg: { subject: string; html: string; reply_to?: string;
                                 attachments?: { filename: string; content: string }[] }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + Deno.env.get("RESEND_API_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [ALERT_EMAIL], ...msg }),
  });
  if (!res.ok) throw new Error("Resend said " + res.status + ": " + await res.text());
}

// text from users goes into the email as plain text, never as HTML
function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function israelTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem",
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

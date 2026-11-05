// =====================================================================
// Sail la Vie: send-push (Supabase Edge Function, 05.11.2026)
// =====================================================================
// Sends a phone notification (push) through Firebase Cloud Messaging, so it
// arrives even when Sail la Vie is fully closed.
//
// Who calls it: never the app. Only the database, through the triggers in
// supabase/push-notifications.sql, with one of these:
//   {"type":"sail_share",      "id":"<sail_shares row>"}         a friend sent you a sail
//   {"type":"friend_request",  "to":"<user>", "from":"<user>"}    a friend request arrived
//   {"type":"friend_accepted", "to":"<user>", "from":"<user>"}    your request was accepted
// Every call must carry the x-notify-secret header (the same secret as the
// email alerts), so nobody else can make it send pushes.
//
// ADDING AN EVENT LATER: add a trigger in the SQL with a new "type", then
// add a case for it in buildMessage() below.
//
// Settings (Supabase -> Edge Functions -> Secrets):
//   FIREBASE_SERVICE_ACCOUNT  the whole contents of firebase-service-account.json
//                             (Firebase project sail-la-vie-38260; file kept in
//                             C:\Users\Pete\SailLaVie-keys and Google Drive)
//   NOTIFY_SECRET             already set for notify-email; shared
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via editor,
// name it send-push, paste this whole file, and turn OFF "Verify JWT".
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) {
    return new Response("Not allowed", { status: 401 });
  }
  try {
    const msg = await buildMessage(await req.json());
    if (!msg) return new Response("Nothing to send");
    const sent = await sendToUser(msg.to, msg.title, msg.body, msg.data);
    return new Response(`Sent to ${sent} device(s)`);
  } catch (e) {
    console.error(e);
    return new Response("Failed: " + (e as Error).message, { status: 500 });
  }
});

// ---------- what to say, and to whom ----------
type Msg = { to: string; title: string; body: string; data: Record<string, string> };

async function buildMessage(p: any): Promise<Msg | null> {
  if (p.type === "sail_share") {
    const { data: s } = await db.from("sail_shares")
      .select("recipient_id, sender_id, sender_name, data").eq("id", p.id).maybeSingle();
    if (!s) return null;
    const name = s.sender_name || await sailorName(s.sender_id);
    const title = s.data?.title ? `"${s.data.title}"` : "a sail";
    return { to: s.recipient_id, title: "A friend sent you a sail",
             body: `${name} sent you ${title}. Open Sail la Vie to add it to your log.`,
             data: { type: "sail_share", id: String(p.id) } };
  }
  if (p.type === "friend_request") {
    const name = await sailorName(p.from);
    return { to: p.to, title: "New friend request",
             body: `${name} wants to be friends on Sail la Vie.`,
             data: { type: "friend_request" } };
  }
  if (p.type === "friend_accepted") {
    const name = await sailorName(p.from);
    return { to: p.to, title: "Friend request accepted",
             body: `${name} accepted your friend request.`,
             data: { type: "friend_accepted" } };
  }
  return null;
}

async function sailorName(userId: string): Promise<string> {
  const { data } = await db.from("public_profiles")
    .select("display_name, username").eq("user_id", userId).maybeSingle();
  return data?.display_name || data?.username || "A sailor";
}

// ---------- sending through Firebase ----------
async function sendToUser(userId: string, title: string, body: string, data: Record<string, string>) {
  const { data: rows } = await db.from("push_tokens").select("token").eq("user_id", userId);
  if (!rows?.length) return 0;
  const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);
  const accessToken = await googleAccessToken(sa);
  let sent = 0;
  for (const { token } of rows) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: {
        token,
        notification: { title, body },
        data,
        android: { priority: "HIGH",
                   notification: { channel_id: "social", icon: "ic_stat_sail", color: "#0B5C7A" } },
      } }),
    });
    if (res.ok) { sent++; continue; }
    const err = await res.text();
    // The app was uninstalled or the token is old: forget this phone.
    if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(err)) {
      await db.from("push_tokens").delete().eq("token", token);
    } else {
      console.error("FCM said", res.status, err);
    }
  }
  return sent;
}

// A short-lived Google access token, made from the service account key.
async function googleAccessToken(sa: { client_email: string; private_key: string }) {
  const key = await importPKCS8(sa.private_key, "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error("Google token failed: " + await res.text());
  return (await res.json()).access_token as string;
}

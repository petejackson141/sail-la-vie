// =====================================================================
// NimoSail: send-push (Supabase Edge Function, 05.11.2026)
// =====================================================================
// Sends a phone notification (push), so it arrives even when NimoSail is
// fully closed. Two routes, chosen by each push address's platform in the
// push_tokens table:
//   'android'  the Android app, through Firebase Cloud Messaging (05.11.2026)
//   'web'      the iPhone / browser version, through web push (07.11.2026):
//              the address is the browser's subscription (JSON), and the
//              message is signed with our own key pair (the "VAPID" keys).
//
// Who calls it: never the app. Only the database, through the triggers in
// supabase/push-notifications.sql, with one of these:
//   {"type":"sail_share",      "id":"<sail_shares row>"}         a friend sent you a sail
//   {"type":"friend_request",  "to":"<user>", "from":"<user>"}    a friend request arrived
//   {"type":"friend_accepted", "to":"<user>", "from":"<user>"}    your request was accepted
// Every call must carry the x-notify-secret header (the same secret as the
// email alerts), so nobody else can make it send pushes.
//
// The one exception: a plain GET (no secret) answers {"publicKey": "..."},
// the PUBLIC web push key the app needs before it can subscribe (js/push.js).
// It's public by design: it can't send anything without the private key.
//
// ADDING AN EVENT LATER: add a trigger in the SQL with a new "type", then
// add a case for it in buildMessage() below.
//
// Settings (Supabase -> Edge Functions -> Secrets):
//   FIREBASE_SERVICE_ACCOUNT  the whole contents of firebase-service-account.json
//                             (Firebase project nimosail; file kept in
//                             C:\Users\Pete\NimoSail-keys and Google Drive)
//   NOTIFY_SECRET             already set for notify-email; shared
//   WEB_PUSH_PUBLIC_KEY       } the web push key pair, made once with
//   WEB_PUSH_PRIVATE_KEY      }   npx web-push generate-vapid-keys
//                             (private key also kept in Bitwarden; never in the project)
//   WEB_PUSH_SUBJECT          optional: who to contact about our pushes
//                             (default mailto:sailapp141@gmail.com; Apple requires one)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via editor,
// name it send-push, paste this whole file, and turn OFF "Verify JWT".
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  // The app asking for the public web push key (no secret needed).
  if (req.method === "GET" || req.method === "OPTIONS") {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    return new Response(JSON.stringify({ publicKey: Deno.env.get("WEB_PUSH_PUBLIC_KEY") || null }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  }
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
             body: `${name} sent you ${title}. Open NimoSail to add it to your log.`,
             data: { type: "sail_share", id: String(p.id) } };
  }
  if (p.type === "friend_request") {
    const name = await sailorName(p.from);
    return { to: p.to, title: "New friend request",
             body: `${name} wants to be friends on NimoSail.`,
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

// ---------- sending: split by platform ----------
type Payload = { title: string; body: string; data: Record<string, string> };

async function sendToUser(userId: string, title: string, body: string, data: Record<string, string>) {
  const { data: rows } = await db.from("push_tokens").select("token, platform").eq("user_id", userId);
  if (!rows?.length) return 0;
  const msg: Payload = { title, body, data };
  const android = rows.filter((r) => r.platform !== "web").map((r) => r.token);
  const web = rows.filter((r) => r.platform === "web").map((r) => r.token);
  let sent = 0;
  // One route failing (a missing secret, Firebase down) must not stop the other.
  if (android.length) { try { sent += await sendFirebase(android, msg); } catch (e) { console.error("Firebase:", e); } }
  if (web.length)     { try { sent += await sendWebPush(web, msg); }      catch (e) { console.error("web push:", e); } }
  return sent;
}

// ---------- Android app: Firebase Cloud Messaging ----------
async function sendFirebase(tokens: string[], { title, body, data }: Payload) {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) { console.warn("FIREBASE_SERVICE_ACCOUNT not set"); return 0; }
  const sa = JSON.parse(raw);
  const accessToken = await googleAccessToken(sa);
  let sent = 0;
  for (const token of tokens) {
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

// ---------- iPhone / browser version: web push ----------
// The web-push library encrypts the message for that one browser and signs it
// with our private key; the browser's push service (Apple, Google, Mozilla)
// then delivers it, and the app's service worker (sw.js) shows it.
async function sendWebPush(subscriptions: string[], msg: Payload) {
  const pub = Deno.env.get("WEB_PUSH_PUBLIC_KEY");
  const priv = Deno.env.get("WEB_PUSH_PRIVATE_KEY");
  if (!pub || !priv) { console.warn("WEB_PUSH keys not set"); return 0; }
  webpush.setVapidDetails(Deno.env.get("WEB_PUSH_SUBJECT") || "mailto:sailapp141@gmail.com", pub, priv);
  const payload = JSON.stringify(msg);
  let sent = 0;
  for (const token of subscriptions) {
    let sub;
    try { sub = JSON.parse(token); } catch { await db.from("push_tokens").delete().eq("token", token); continue; }
    try {
      // TTL: keep trying for a day if the phone is off; "high": deliver straight away.
      await webpush.sendNotification(sub, payload, { TTL: 86400, urgency: "high" });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404 / 410: the subscription has ended (app removed, notifications
      // turned off, browser data cleared): forget this phone.
      if (status === 404 || status === 410) {
        await db.from("push_tokens").delete().eq("token", token);
      } else {
        console.error("web push said", status, (e as { body?: string }).body || e);
      }
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

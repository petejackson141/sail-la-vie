// ===== notifications.js =====
// Noticeboard reminders: a phone notification 24 hours before each planned event.
//
// Uses Capacitor's @capacitor/local-notifications plugin, so it only works inside the
// installed Android/iOS app (needs `npm install @capacitor/local-notifications` +
// `npx cap sync` once). In the browser/PWA there is no reliable way to schedule a future
// notification, so everything here quietly does nothing there.
//
// How it works — one rule, applied to the whole Noticeboard every time it might have changed:
//   syncNoticeboardReminders() works out which plans should have a reminder (future plans whose
//   "24 hours before" moment hasn't passed yet), schedules those, and cancels any leftover
//   reminder for a plan that was deleted, moved into the past or no longer exists. Scheduling
//   the same plan twice just replaces the earlier reminder (same notification id), so it is safe to
//   call as often as we like: on app start, after saving/deleting a plan, after a cloud sync
//   brings in changes from another device, and after a restore/reset.
//
// When is "the event"? A plan with a time starts at that time. A plan with only a date counts as
// starting at 09:00 that day (REMINDER_DEFAULT_HOUR), so its reminder arrives at 09:00 the day before.
// A plan created less than 24 hours ahead gets no reminder (that moment is already past).
// Each device schedules its own reminders — nothing is sent from the server.

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;   // how long before the event the reminder goes off
const REMINDER_DEFAULT_HOUR = 9;                 // start time assumed for plans that only have a date
const REMINDER_CHANNEL_ID = 'noticeboard-reminders'; // Android notification channel

function getLocalNotifications(){
  return isNativeApp() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications || null;
}

// Local notification ids must be 32-bit integers, but plan ids are strings — turn each plan id into a
// stable positive integer (FNV-1a hash) so the same plan always maps to the same notification.
function noticeboardReminderId(planId){
  let h = 2166136261;
  for(let i = 0; i < planId.length; i++){ h ^= planId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 1) || 1;
}

// When the plan starts (local time), or null if it has no usable date.
function noticeboardStartTime(plan){
  const d = dtParseDate(plan.date);
  if(!d) return null;
  const tm = /^(\d{2}):(\d{2})$/.exec(plan.time || '');
  return new Date(d.y, d.m, d.d, tm ? +tm[1] : REMINDER_DEFAULT_HOUR, tm ? +tm[2] : 0);
}

// The reminder text: "Tomorrow: Weekend sail to Cyprus" / "Sat, 27 Sept · 08:30 · Herzliya Marina · Windswept"
function noticeboardReminderContent(plan, start){
  const boat = plan.boatId ? state.boats.find(b=>b.id===plan.boatId) : null;
  const when = new Intl.DateTimeFormat(dtLocale(), {weekday:'short', day:'numeric', month:'short'}).format(start) + (plan.time ? ' · ' + plan.time : '');
  return {
    title: t('noticeboard.remindTitle', {title: plan.title}),
    body: [when, plan.place, boat ? boat.name : ''].filter(Boolean).join(' · ')
  };
}

async function ensureNotificationPermission(askIfNeeded){
  const LN = getLocalNotifications();
  if(!LN) return false;
  let p = await LN.checkPermissions();
  if(p.display === 'granted') return true;
  if(!askIfNeeded) return false;
  p = await LN.requestPermissions(); // Android 13+ / iOS show the system "Allow notifications?" prompt
  return p.display === 'granted';
}

// Runs one sync at a time — several triggers can land together (boot + cloud pull, say).
let _reminderQueue = Promise.resolve();
function syncNoticeboardReminders(opts){
  const run = _reminderQueue.then(()=>syncNoticeboardRemindersImpl(opts || {}));
  _reminderQueue = run.catch(()=>{});
  return run.catch(e=>{ console.error('noticeboard reminders sync failed', e); });
}
let _reminderBlockedToastShown = false;
async function syncNoticeboardRemindersImpl({ask}){
  const LN = getLocalNotifications();
  if(!LN) return;

  // Which plans should have a reminder right now?
  const now = Date.now();
  const wanted = [];
  for(const plan of state.noticeboard){
    const start = noticeboardStartTime(plan);
    if(!start) continue;
    const at = new Date(start.getTime() - REMINDER_LEAD_MS);
    if(at.getTime() > now + 5000) wanted.push({ plan, start, at, id: noticeboardReminderId(plan.id) });
  }

  // Cancel reminders that no longer apply. Only this feature uses local notifications, so
  // "pending but not wanted" always means stale.
  const pending = ((await LN.getPending()).notifications) || [];
  const wantedIds = new Set(wanted.map(w=>w.id));
  const stale = pending.filter(n=>!wantedIds.has(n.id)).map(n=>({id: n.id}));
  if(stale.length) await LN.cancel({notifications: stale});
  if(!wanted.length) return;

  if(!(await ensureNotificationPermission(!!ask))){
    // Only tell the person when they just saved a plan (ask = true), and only once per session.
    if(ask && !_reminderBlockedToastShown){ _reminderBlockedToastShown = true; showToast(t('noticeboard.remindersBlocked')); }
    return;
  }
  try{
    await LN.createChannel({ id: REMINDER_CHANNEL_ID, name: t('noticeboard.channelName'), importance: 4, visibility: 1 });
  }catch(e){ /* Android-only; already existing or unsupported is fine */ }
  await LN.schedule({ notifications: wanted.map(w=>Object.assign(
    { id: w.id, schedule: { at: w.at, allowWhileIdle: true }, channelId: REMINDER_CHANNEL_ID, extra: { noticeboardId: w.plan.id } },
    noticeboardReminderContent(w.plan, w.start)
  )) });
}

// Tapping a reminder opens the app on the Noticeboard with that plan open.
function initNoticeboardNotificationTap(){
  const LN = getLocalNotifications();
  if(!LN || !LN.addListener) return;
  LN.addListener('localNotificationActionPerformed', ev=>{
    const planId = ev && ev.notification && ev.notification.extra && ev.notification.extra.noticeboardId;
    nav('noticeboard');
    if(planId && state.noticeboard.some(p=>p.id === planId)) openNoticeboardSheet(planId);
  });
}

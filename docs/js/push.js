// ===== push.js =====
// Push notifications: notifications that arrive even when Sail la Vie is
// fully closed, for:
//   * a friend sends you a sail        (type "sail_share")
//   * a friend request arrives          (type "friend_request")
//   * your friend request is accepted   (type "friend_accepted")
//
// There are two ways a push can reach a phone, and this file handles both:
//
//   A. ANDROID APP (05.11.2026): Firebase Cloud Messaging (FCM).
//      After sign-in, Android is asked for permission and the phone registers
//      with FCM, which gives back a "token": this phone's push address.
//      Needs @capacitor/push-notifications and android/app/google-services.json.
//
//   B. IPHONE / BROWSER VERSION (07.11.2026): web push.
//      The web version (GitHub Pages) uses the browser's own push service
//      (Apple's for iPhone, Google's for Chrome, and so on). Its "push address"
//      is a subscription: a web address plus two keys, saved as JSON text.
//      iPhone rules (Apple's, not ours):
//        - iOS 16.4 or later, and the app must be ADDED TO THE HOME SCREEN
//          and opened from there. Safari tabs can't get pushes at all.
//        - Permission may only be asked when the person taps something, so
//          the web version asks from a button in Settings > Notifications,
//          never by itself.
//      The notification itself is shown by the service worker (sw.js, the
//      'push' listener), because the app may not be running at all.
//
// Either way, the same steps follow:
//   1. The push address is saved in Supabase (push_tokens table, through the
//      register_push_token function) with platform 'android' or 'web', linked
//      to whoever is signed in.
//   2. When something happens (a new sail_shares or friendships row), a
//      database trigger asks the send-push Edge Function to send the push to
//      every push address of that person; it sends Android ones through
//      Firebase and web ones through web push.
//      (supabase/push-notifications.sql and supabase/functions/send-push/index.ts)
//   3. Tapping the notification opens the app on the right screen (onPushTapped).
//   4. On sign-out the address is removed, so the next person on this phone
//      doesn't get the previous person's notifications.

const PUSH_CHANNEL_ID = 'social'; // must match channel_id in send-push and the manifest default

function getPush(){
  return (typeof isNativeApp === 'function' && isNativeApp()
          && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) || null;
}

let _pushListenersAdded = false;
let _pushToken = null;          // this phone's push address (FCM token, or web subscription JSON), once known
let _pushPlatform = null;       // 'android' or 'web': which kind _pushToken is
let _pushRegisteredFor = null;  // the user id the address was last saved for
window.pushRegistered = false;  // share.js checks this to avoid a second, local notification

// Called by auth.js whenever the signed-in person changes (applySession).
function onPushSessionChanged(){
  if(state.user){
    initPush().catch(e => console.warn('push setup failed', e));
    initWebPush().catch(e => console.warn('web push setup failed', e));
  }
  renderWebPushUI();
}

/* ================= A. ANDROID APP (Firebase) ================= */

async function initPush(){
  const P = getPush();
  if(!P || !state.user) return;
  if(!_pushListenersAdded){
    _pushListenersAdded = true;
    await P.addListener('registration', t => savePushToken(t.value, 'android'));
    await P.addListener('registrationError', e => console.warn('push registration failed', e));
    await P.addListener('pushNotificationReceived', onPushWhileOpen);
    await P.addListener('pushNotificationActionPerformed', onPushTapped);
  }
  // Already registered for this person: nothing to do.
  if(_pushToken && _pushRegisteredFor === state.user.id) return;
  try{
    await P.createChannel({ id: PUSH_CHANNEL_ID, name: t('push.channelName'), description: t('push.channelDesc'), importance: 4, visibility: 1 });
  }catch(e){ /* already exists: fine */ }
  let perm = await P.checkPermissions();
  if(perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await P.requestPermissions();
  if(perm.receive !== 'granted') return; // they said no: the app still works, just without pushes
  await P.register(); // the token arrives in the 'registration' listener above
}

// Saves this phone's push address for whoever is signed in.
// platform: 'android' (an FCM token) or 'web' (a web push subscription as JSON text).
async function savePushToken(token, platform){
  _pushToken = token;
  _pushPlatform = platform;
  if(!state.user) return;
  try{
    const { error } = await getSupabaseClient().rpc('register_push_token', { p_token: token, p_platform: platform });
    if(error) throw error;
    _pushRegisteredFor = state.user.id;
    window.pushRegistered = true;
  }catch(e){
    console.warn('push address not saved', e.message || e);
  }
}

// auth.js calls this BEFORE signing out (it needs the session to delete the row).
async function removePushToken(){
  window.pushRegistered = false;
  _pushRegisteredFor = null;
  if(!_pushToken) return;
  try{ await getSupabaseClient().rpc('unregister_push_token', { p_token: _pushToken }); }catch(e){}
}

// Tapped a notification (app was closed or in the background): open the right screen.
// The Android plugin calls it with {notification:{data}}; the web version
// (handleWebPushTap below) passes the same shape.
function onPushTapped(ev){
  const d = (ev && ev.notification && ev.notification.data) || {};
  if(d.type === 'sail_share'){
    nav('history');                                   // sails sent to you wait at the top of History
    if(typeof loadIncomingSails === 'function') loadIncomingSails();
  }else if(d.type === 'friend_request' || d.type === 'friend_accepted'){
    nav('friends');
    if(typeof loadFriendsData === 'function') loadFriendsData();
  }
}

// A push arrived while the Android app is open on screen. Android doesn't show
// it as a notification then, and the live sync already updates the screens, so:
// shared sails get share.js's own pop-up; friend news gets a short message.
function onPushWhileOpen(n){
  const d = (n && n.data) || {};
  if(d.type === 'sail_share') return;
  if(n && (n.body || n.title)) showToast(n.body || n.title);
  if(typeof loadFriendsData === 'function') loadFriendsData();
}

/* ================= B. IPHONE / BROWSER VERSION (web push) ================= */

// Remembered on this phone when the person taps "Turn off", so the app doesn't
// quietly switch notifications back on at the next sign-in.
const WEB_PUSH_OFF_KEY = 'webPushTurnedOff';

// The service worker (sw.js) does the offline app caching AND shows web
// pushes, so the web version registers it as soon as this file loads. The
// Android app doesn't use it (its files are inside the APK, and it gets its
// pushes through Firebase), so it's skipped there.
let _swReady = null;
function registerAppServiceWorker(){
  if(_swReady) return _swReady;
  if((typeof isNativeApp === 'function' && isNativeApp()) || !('serviceWorker' in navigator)){
    _swReady = Promise.resolve(null);
    return _swReady;
  }
  _swReady = navigator.serviceWorker.register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .catch(e => { console.warn('service worker not registered', e); return null; });
  // A notification tapped while the app is already open: sw.js sends it here.
  navigator.serviceWorker.addEventListener('message', e => {
    if(e.data && e.data.pushTap) onPushTapped({ notification: { data: e.data.pushTap } });
  });
  return _swReady;
}
registerAppServiceWorker();

function isIOSWeb(){ return document.documentElement.classList.contains('ios'); }
function isHomeScreenApp(){
  return navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

// Where web push stands on this phone, for the Settings card:
//   'native'        Android app: the Settings card isn't shown at all
//   'needs-install' iPhone in a Safari tab: must add to Home Screen first
//   'unsupported'   this browser has no web push (e.g. iOS older than 16.4)
//   'signed-out'    needs an account first
//   'blocked'       the person said no; only the phone's settings can undo it
//   'on' / 'off'
function webPushStatus(){
  if(typeof isNativeApp === 'function' && isNativeApp()) return 'native';
  if(isIOSWeb() && !isHomeScreenApp()) return 'needs-install';
  if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if(!state.user) return 'signed-out';
  if(Notification.permission === 'denied') return 'blocked';
  return (window.pushRegistered && _pushPlatform === 'web') ? 'on' : 'off';
}

// At sign-in / app start: if this phone already allowed notifications (and the
// person didn't turn them off), save its subscription for whoever is signed in.
// Never asks for permission itself: on iPhone that must come from a tap.
async function initWebPush(){
  if(webPushStatus() !== 'off') return;
  if(Notification.permission !== 'granted') return;
  if(localStorage.getItem(WEB_PUSH_OFF_KEY) === '1') return;
  await subscribeWebPush();
  renderWebPushUI();
}

// The public half of the web push key pair. It lives on the server (Supabase
// secret WEB_PUSH_PUBLIC_KEY) and send-push hands it out on a plain GET, so
// changing the keys never needs an app update.
let _webPushKey = null;
async function getWebPushPublicKey(){
  if(_webPushKey) return _webPushKey;
  const res = await fetch(SUPABASE_URL + '/functions/v1/send-push');
  if(!res.ok) throw new Error('send-push answered ' + res.status);
  const j = await res.json();
  if(!j.publicKey) throw new Error('web push keys not set on the server yet');
  _webPushKey = j.publicKey;
  return _webPushKey;
}

// The browser wants the key as raw bytes; it's stored as base64url text.
function urlBase64ToUint8Array(s){
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// Gets (or makes) this phone's web push subscription and saves it. True if it worked.
async function subscribeWebPush(){
  const reg = await registerAppServiceWorker();
  if(!reg) return false;
  let sub = await reg.pushManager.getSubscription();
  if(!sub){
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // every push shows a notification (Apple and Chrome both insist)
      applicationServerKey: urlBase64ToUint8Array(await getWebPushPublicKey())
    });
  }
  await savePushToken(JSON.stringify(sub), 'web');
  return window.pushRegistered;
}

// Settings > Notifications > "Turn on notifications". Must run straight from
// the tap: iPhone only shows the "Allow notifications?" question then.
async function enableWebPush(){
  if(!state.user) return;
  // Fetch the key in the background now, so it's ready after the question.
  getWebPushPublicKey().catch(()=>{});
  let perm = Notification.permission;
  if(perm === 'default') perm = await Notification.requestPermission();
  if(perm !== 'granted'){ renderWebPushUI(); return; }
  localStorage.removeItem(WEB_PUSH_OFF_KEY);
  const btn = document.getElementById('webPushOnBtn');
  if(btn) btn.disabled = true;
  let ok = false;
  try{ ok = await subscribeWebPush(); }catch(e){ console.warn('web push subscribe failed', e); }
  if(btn) btn.disabled = false;
  showToast(t(ok ? 'push.web.onToast' : 'push.web.failed'));
  renderWebPushUI();
}

// Settings > Notifications > "Turn off notifications".
async function disableWebPush(){
  localStorage.setItem(WEB_PUSH_OFF_KEY, '1');
  await removePushToken();
  try{
    const reg = await registerAppServiceWorker();
    const sub = reg && await reg.pushManager.getSubscription();
    if(sub) await sub.unsubscribe();
  }catch(e){}
  _pushToken = null; _pushPlatform = null;
  showToast(t('push.web.offToast'));
  renderWebPushUI();
}

// Fills in the Settings > Notifications card (web version only).
function renderWebPushUI(){
  const box = document.getElementById('webPushSection');
  if(!box) return;
  const s = webPushStatus();
  box.style.display = s === 'native' ? 'none' : '';
  if(s === 'native') return;
  document.getElementById('webPushStatus').textContent = t('push.web.status.' + s);
  document.getElementById('webPushOnBtn').style.display = s === 'off' ? '' : 'none';
  document.getElementById('webPushOffBtn').style.display = s === 'on' ? '' : 'none';
}

// The app was opened by tapping a web push (sw.js adds ?push=<type> to the
// address). boot() calls this at the very end, once Home is showing.
function handlePushLaunch(){
  const params = new URLSearchParams(location.search);
  const type = params.get('push');
  if(!type) return;
  history.replaceState(history.state, '', location.pathname); // tidy the address bar
  onPushTapped({ notification: { data: { type } } });
}

Object.assign(TRANSLATIONS.en, {
  'push.channelName': 'Friends and shared sails',
  'push.channelDesc': 'When a friend sends you a sail, sends a friend request or accepts yours',
  'push.web.title': 'Notifications',
  'push.web.turnOn': 'Turn on notifications',
  'push.web.turnOff': 'Turn off notifications',
  'push.web.status.on': 'On. This phone gets a notification when a friend sends you a sail, sends a friend request or accepts yours.',
  'push.web.status.off': 'Get a notification when a friend sends you a sail, sends a friend request or accepts yours, even when the app is closed.',
  'push.web.status.needs-install': 'To get notifications on iPhone, add the app to your Home Screen first: tap Share, then Add to Home Screen. Open it from there and come back here.',
  'push.web.status.unsupported': "This browser can't receive notifications. On iPhone you need iOS 16.4 or later, with the app added to your Home Screen.",
  'push.web.status.signed-out': 'Sign in to get notifications when friends send you sails or friend requests.',
  'push.web.status.blocked': "Notifications are blocked for this app. To allow them, go to your phone's Settings > Notifications (or the browser's site settings), then come back here.",
  'push.web.onToast': 'Notifications are on',
  'push.web.offToast': 'Notifications are off',
  'push.web.failed': "Couldn't turn on notifications. Check your connection and try again.",
});

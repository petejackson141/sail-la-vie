// ===== push.js =====
// Push notifications (05.11.2026): phone notifications that arrive even when
// Sail la Vie is fully closed, for:
//   * a friend sends you a sail        (type "sail_share")
//   * a friend request arrives          (type "friend_request")
//   * your friend request is accepted   (type "friend_accepted")
//
// How it fits together:
//   1. After sign-in, this file asks Android for permission and registers the
//      phone with Firebase Cloud Messaging (FCM). FCM gives back a "token":
//      this phone's push address.
//   2. The token is saved in Supabase (push_tokens table, through the
//      register_push_token function), linked to whoever is signed in.
//   3. When something happens (a new sail_shares or friendships row), a
//      database trigger asks the send-push Edge Function to send the push
//      to every token of that person. (supabase/push-notifications.sql and
//      supabase/functions/send-push/index.ts)
//   4. Tapping the notification opens the app on the right screen (below).
//   5. On sign-out the token is removed, so the next person on this phone
//      doesn't get the previous person's notifications.
//
// Android app only (needs @capacitor/push-notifications and
// android/app/google-services.json). In the browser / iPhone web version
// everything here quietly does nothing; iPhone web push is a later step.

const PUSH_CHANNEL_ID = 'social'; // must match channel_id in send-push and the manifest default

function getPush(){
  return (typeof isNativeApp === 'function' && isNativeApp()
          && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) || null;
}

let _pushListenersAdded = false;
let _pushToken = null;          // this phone's FCM token, once known
let _pushRegisteredFor = null;  // the user id the token was last saved for
window.pushRegistered = false;  // share.js checks this to avoid a second, local notification

// Called by auth.js whenever the signed-in person changes (applySession).
function onPushSessionChanged(){
  if(state.user) initPush().catch(e => console.warn('push setup failed', e));
}

async function initPush(){
  const P = getPush();
  if(!P || !state.user) return;
  if(!_pushListenersAdded){
    _pushListenersAdded = true;
    await P.addListener('registration', t => savePushToken(t.value));
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

async function savePushToken(token){
  _pushToken = token;
  if(!state.user) return;
  try{
    const { error } = await getSupabaseClient().rpc('register_push_token', { p_token: token, p_platform: 'android' });
    if(error) throw error;
    _pushRegisteredFor = state.user.id;
    window.pushRegistered = true;
  }catch(e){
    console.warn('push token not saved', e.message || e); // e.g. push-notifications.sql not run yet
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

// A push arrived while the app is open on screen. Android doesn't show it as
// a notification then, and the live sync already updates the screens, so:
// shared sails get share.js's own pop-up; friend news gets a short message.
function onPushWhileOpen(n){
  const d = (n && n.data) || {};
  if(d.type === 'sail_share') return;
  if(n && (n.body || n.title)) showToast(n.body || n.title);
  if(typeof loadFriendsData === 'function') loadFriendsData();
}

Object.assign(TRANSLATIONS.en, {
  'push.channelName': 'Friends and shared sails',
  'push.channelDesc': 'When a friend sends you a sail, sends a friend request or accepts yours',
});

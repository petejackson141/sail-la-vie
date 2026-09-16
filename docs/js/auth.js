// ===== auth.js =====
// Cloud ACCOUNT layer, powered by Supabase (https://supabase.com). Handles
// sign up / sign in / sign out and keeps state.user in sync with whoever's
// currently logged in.
//
// Also owns the profile <-> cloud, boats <-> cloud, and crew <-> cloud sync
// (push-on-edit, pull-and-merge on sign-in, boot-time session restore, and
// the manual "Sync Now" button). Journeys are NOT synced yet — that's the
// next feature to build, following the same shape as boats/crew.
//
// state.user is null when signed out, or { id, email } when signed in.
// Set only by applySession() below — read it elsewhere in the app once we
// start building features that depend on being logged in.

// Project keys from your Supabase dashboard (Settings → API). The
// "publishable" key is safe to ship in frontend code — Supabase enforces
// actual security through Row Level Security policies on the database, not
// by keeping this key secret. Never put the "secret" key here.
const SUPABASE_URL = 'https://opejqowgcjltanvgxmxn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_GGREMl8C6rbCIkn0k7GVog_yCLJLtz9';

let _supabaseClient = null;
// Built lazily on first use rather than at file-load time — harmless either
// way now that the library loads as a normal blocking script (see
// index.html), but keeping it lazy costs nothing and avoids creating a
// client before it's actually needed.
function getSupabaseClient(){
  if(!_supabaseClient){
    // First attempt: cache:'no-store' + no-cache headers on the client's own
    // fetch — confirmed on-device this did NOT change anything, meaning
    // whatever is serving a stale, identical response for these GET
    // requests sits somewhere between the device and Supabase (a CDN/edge
    // cache in front of the API) and simply isn't honoring client
    // cache-control headers at all. The only fix that works against a cache
    // like that is making every GET request's URL genuinely unique, so
    // there's nothing matching to serve from cache — done here by appending
    // a constantly-changing dummy query param. PostgREST ignores unknown
    // query params, so this is harmless to the actual request.
    _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: (url, options) => {
          const method = ((options && options.method) || 'GET').toUpperCase();
          let finalUrl = url;
          if(method === 'GET'){
            try{
              const u = new URL(url);
              u.searchParams.set('_cb', Date.now() + '-' + Math.random().toString(36).slice(2));
              finalUrl = u.toString();
            }catch(e){ /* if URL parsing ever fails, fall back to the original url unchanged */ }
          }
          return fetch(finalUrl, {
            ...options,
            cache: 'no-store',
            headers: { ...(options && options.headers), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
          });
        }
      }
    });
  }
  return _supabaseClient;
}

// Serializes every cloud read/write for profile/boats/crew through one
// queue, so a push or delete can never be "overtaken" by a pull that
// started a moment later (or vice versa). Without this, deleting a boat
// and then syncing in quick succession could let the pull's SELECT run
// before the delete's tombstone write had actually landed — the pull would
// see the still-there row, and since this device no longer has it locally,
// pull it right back in. Every entry point below (push, delete, and the
// resolve*SyncOnSignIn functions) goes through this queue; the "Impl"
// versions they call internally do NOT re-enter it, since resolve* already
// holds the queue's single slot while it runs and re-entering would
// deadlock (the queued push would wait for a turn that can't come until
// resolve* — which is waiting on that same push — finishes).
let _cloudSyncQueue = Promise.resolve();
function withCloudSyncQueue(fn){
  const run = _cloudSyncQueue.then(fn, fn);
  _cloudSyncQueue = run.catch(()=>{}); // swallow so one failure doesn't wedge the queue
  return run;
}

let authMode = 'signin'; // 'signin' | 'signup' — which mode sheetAuth is currently showing

/* ---------- boot-time session check ----------
   Called once from boot() in state-core.js (not awaited there — see the
   comment at that call site). Checks whether a session already exists (e.g.
   the app was closed and reopened after a previous login) and subscribes to
   future auth changes so state.user + the Settings screen stay correct
   whenever the session changes (sign in, sign out, token refresh). */
async function initAuth(){
  const { data } = await getSupabaseClient().auth.getSession();
  applySession(data.session);

  if(data.session){
    // Silent pull on a restored session, so edits made on another device
    // while this one was closed show up without the person having to sign
    // out/in again or remember to tap "Sync Now". Relies on boot() in
    // state-core.js having already loaded local boats/profile from storage
    // before calling initAuth() — see the comment there. Same resolve
    // functions as an explicit sign-in: silent when there's nothing to
    // conflict with, a confirm prompt only if the cloud and local profile
    // genuinely differ.
    resolveProfileSyncOnSignIn().catch(e => console.error('boot-time profile sync failed', e));
    resolveBoatsSyncOnSignIn().catch(e => console.error('boot-time boats sync failed', e));
    resolveCrewSyncOnSignIn().catch(e => console.error('boot-time crew sync failed', e));
  }

  getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
}

function applySession(session){
  state.user = session ? { id: session.user.id, email: session.user.email } : null;
  renderAccountUI();
  ensureRealtimeSync();
}

/* ---------- live sync across devices (Supabase Realtime) ----------
   Without this, profile/boats/crew only ever re-pull from the cloud at
   sign-in, boot-time session restore, or the manual "Sync Now" button — an
   app left open on another device never notices a change made elsewhere.
   This subscribes to Postgres change notifications on the three synced
   tables (scoped to this user's own rows, same as the RLS policies already
   enforce) and re-runs the existing resolve*SyncOnSignIn merge whenever a
   row changes — so a boat added on the phone shows up on an already-open
   tablet within about a second, no reopen or manual tap required.
   NOTE: this requires each of the "boats", "crew", and "profiles" tables to
   have Realtime replication turned on in the Supabase dashboard (Database →
   Replication → toggle the table on, or
   `alter publication supabase_realtime add table boats;` etc. in the SQL
   editor) — the subscription below silently receives nothing otherwise. */
let _realtimeChannel = null;
let _realtimeUserId = null;
const _realtimeResyncTimers = {};

// ---- on-screen debug overlay ----
// console.log isn't reliably reaching Logcat or chrome://inspect on some
// older Android WebViews (confirmed on an Android 7/API 24 test tablet), so
// this writes straight to a small on-screen panel instead — no dependency
// on any external debugging tool. Set SHOW_SYNC_DEBUG = false once realtime
// sync is confirmed working, to hide this from real users.
const SHOW_SYNC_DEBUG = true;
function debugLog(msg){
  console.log(msg); // kept in case a device *does* forward it
  if(!SHOW_SYNC_DEBUG) return;

  // Small tap-to-open toggle, pinned to the middle of the right edge — out
  // of the way of every header button and bottom-nav item we've hit so far.
  // The log panel itself only appears once you tap the toggle, and starts
  // hidden again on every fresh app launch, so it never sits in front of
  // whatever you're trying to tap next.
  let toggle = document.getElementById('syncDebugToggle');
  let panel = document.getElementById('syncDebugOverlay');
  if(!toggle){
    toggle = document.createElement('div');
    toggle.id = 'syncDebugToggle';
    toggle.textContent = '🐛';
    toggle.style.cssText = 'position:fixed;right:0;top:50%;transform:translateY(-50%);'
      + 'background:rgba(0,0,0,0.55);color:#0f0;font-size:16px;line-height:1;padding:6px 4px;'
      + 'border-radius:6px 0 0 6px;z-index:100000;';
    toggle.onclick = () => { panel.style.display = (panel.style.display === 'none') ? 'block' : 'none'; };
    document.body.appendChild(toggle);

    panel = document.createElement('div');
    panel.id = 'syncDebugOverlay';
    panel.style.cssText = 'position:fixed;left:0;right:0;top:0;max-height:40vh;overflow-y:auto;'
      + 'background:rgba(0,0,0,0.9);color:#0f0;font:10px/1.35 monospace;padding:4px 6px;z-index:99999;'
      + 'white-space:pre-wrap;display:none;'; // hidden until the toggle is tapped
    document.body.appendChild(panel);
  }
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  panel.appendChild(line);
  while(panel.childNodes.length > 40) panel.removeChild(panel.firstChild);
  panel.scrollTop = panel.scrollHeight;
}

// Called from applySession() on every sign-in, boot-time session restore,
// and auth state change (including token refreshes) — guarded so a
// same-user re-call (e.g. token refresh) doesn't tear down and rebuild the
// channel for no reason, and a sign-out (state.user null) tears it down.
function ensureRealtimeSync(){
  if(!state.user){ teardownRealtimeSync(); return; }
  if(_realtimeChannel && _realtimeUserId === state.user.id) return; // already live for this user
  teardownRealtimeSync();
  _realtimeUserId = state.user.id;
  debugLog('[realtime] connecting for user ' + state.user.id);
  _realtimeChannel = getSupabaseClient()
    .channel(`sync-${state.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'boats', filter: `user_id=eq.${state.user.id}` },
      (payload) => { debugLog('[realtime] boats event: ' + payload.eventType); scheduleRealtimeResync('boats'); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'crew', filter: `user_id=eq.${state.user.id}` },
      (payload) => { debugLog('[realtime] crew event: ' + payload.eventType); scheduleRealtimeResync('crew'); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${state.user.id}` },
      (payload) => { debugLog('[realtime] profiles event: ' + payload.eventType); scheduleRealtimeResync('profile'); })
    .subscribe((status, err) => {
      debugLog('[realtime] channel status: ' + status + (err ? (' — ' + (err.message || err)) : ''));
    });
}
function teardownRealtimeSync(){
  if(_realtimeChannel){
    getSupabaseClient().removeChannel(_realtimeChannel);
    _realtimeChannel = null;
    _realtimeUserId = null;
  }
  Object.values(_realtimeResyncTimers).forEach(clearTimeout);
}

// Debounced so a burst of changes (e.g. this same device's own push echoing
// back, or several boats added in quick succession on another device)
// triggers one re-pull instead of one per row event. Reuses the existing
// resolve*SyncOnSignIn functions as-is — same merge-by-updated_at logic,
// same cloud sync queue, same confirm-prompt behavior for a genuinely
// conflicting profile — this just adds a new trigger that calls them.
function scheduleRealtimeResync(kind){
  clearTimeout(_realtimeResyncTimers[kind]);
  _realtimeResyncTimers[kind] = setTimeout(() => {
    debugLog('[realtime] running resync: ' + kind);
    if(kind === 'boats') resolveBoatsSyncOnSignIn().then(()=>debugLog('[realtime] boats resync done')).catch(e => debugLog('[realtime] boats resync FAILED: ' + (e.message||e)));
    if(kind === 'crew') resolveCrewSyncOnSignIn().then(()=>debugLog('[realtime] crew resync done')).catch(e => debugLog('[realtime] crew resync FAILED: ' + (e.message||e)));
    if(kind === 'profile') resolveProfileSyncOnSignIn().then(()=>debugLog('[realtime] profile resync done')).catch(e => debugLog('[realtime] profile resync FAILED: ' + (e.message||e)));
  }, 600);
}

// Updates the Account card on the Settings screen. Safe to call any time —
// those elements are static markup that's always in the DOM (unlike most of
// the app's screens, Settings isn't re-rendered per visit), so this doesn't
// need to be hooked into nav().
function renderAccountUI(){
  const signedOutEl = document.getElementById('accountSignedOut');
  const signedInEl = document.getElementById('accountSignedIn');
  if(!signedOutEl || !signedInEl) return;

  if(state.user){
    signedOutEl.style.display = 'none';
    signedInEl.style.display = 'block';
    document.getElementById('accountEmailLine').textContent = state.user.email;
  } else {
    signedOutEl.style.display = 'block';
    signedInEl.style.display = 'none';
  }
}

/* ---------- the sign in / sign up sheet ---------- */
function openAuthSheet(mode){
  authMode = mode || 'signin';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  resetPasswordVisibility();
  hideAuthError();
  updateAuthSheetLabels();
  openSheet('sheetAuth');
}

// Lets someone check what they actually typed, since typos in a masked
// password field are otherwise invisible until the submit fails.
function togglePasswordVisibility(){
  const input = document.getElementById('authPassword');
  const btn = document.getElementById('authPasswordToggle');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.classList.toggle('is-active', !showing);
  btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}
function resetPasswordVisibility(){
  document.getElementById('authPassword').type = 'password';
  const btn = document.getElementById('authPasswordToggle');
  btn.classList.remove('is-active');
  btn.setAttribute('aria-label', 'Show password');
}

function toggleAuthMode(){
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  hideAuthError();
  updateAuthSheetLabels();
}

function updateAuthSheetLabels(){
  const isSignUp = authMode === 'signup';
  document.getElementById('authSheetTitle').textContent = isSignUp ? 'Create Account' : 'Sign In';
  document.getElementById('authSheetHint').textContent = isSignUp
    ? 'Create an account to sync your journeys across devices.'
    : 'Sign in to sync your journeys across devices.';
  document.getElementById('authSubmitBtn').textContent = isSignUp ? 'Create Account' : 'Sign In';
  document.getElementById('authToggleModeBtn').textContent = isSignUp
    ? 'Already have an account? Sign in'
    : "Don't have an account? Sign up";
}

function showAuthError(msg){
  const el = document.getElementById('authErrorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideAuthError(){
  document.getElementById('authErrorMsg').style.display = 'none';
}

async function submitAuthForm(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  hideAuthError();

  if(!email || !password){
    showAuthError('Enter both an email and a password.');
    return;
  }
  if(password.length < 6){
    showAuthError('Password must be at least 6 characters.');
    return;
  }

  const btn = document.getElementById('authSubmitBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Please wait…';

  try{
    if(authMode === 'signup'){
      const { data, error } = await getSupabaseClient().auth.signUp({ email, password });
      if(error) throw error;
      closeSheets();
      if(data.session){
        // Email confirmation is off (or already satisfied) — signed in immediately.
        await resolveProfileSyncOnSignIn();
        await resolveBoatsSyncOnSignIn();
        await resolveCrewSyncOnSignIn();
        showToast('Account created.');
      } else {
        // Normal case: Supabase emails a confirmation link and there's no
        // session yet — nothing to sync to until that link is clicked and
        // they sign in for the first time (handled in the signin branch below).
        showToast('Check your email to confirm your account.');
      }
    } else {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if(error) throw error;
      closeSheets();
      await resolveProfileSyncOnSignIn();
      await resolveBoatsSyncOnSignIn();
      await resolveCrewSyncOnSignIn();
      showToast('Signed in.');
    }
  } catch(e){
    showAuthError(e.message || 'Something went wrong. Try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function signOutUser(){
  if(!(await showConfirm('Sign out of your account?'))) return;
  await getSupabaseClient().auth.signOut();
  showToast('Signed out.');
}

/* ---------- profile ↔ cloud resolution on sign-in ----------
   Runs once right after a successful sign-in (or a sign-up that logs
   straight in). Decides which direction data should move:
   - No cloud profile yet, or it matches this device exactly → push local up.
   - Cloud has a profile and this device is essentially blank (no name set)
     → pull it down with no prompt, since there's nothing local to lose.
   - Cloud has a profile AND this device already has its own local data that
     differs → ask before overwriting either side, rather than silently
     picking one. */
function resolveProfileSyncOnSignIn(){
  return withCloudSyncQueue(resolveProfileSyncOnSignInImpl);
}
async function resolveProfileSyncOnSignInImpl(){
  if(!state.user) return;

  let cloudProfile = null;
  try{
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('profile_data')
      .eq('id', state.user.id)
      .maybeSingle();
    if(error) throw error;
    cloudProfile = data ? data.profile_data : null;
  }catch(e){
    console.error('profile cloud fetch failed', e);
  }

  const localHasData = !!(state.profile && state.profile.name);

  if(cloudProfile){
    const sameAsLocal = JSON.stringify(cloudProfile) === JSON.stringify(state.profile);
    if(!localHasData || sameAsLocal){
      await applyCloudProfile(cloudProfile);
      return;
    }
    const loadCloud = await showConfirm("This account already has a profile saved in the cloud. Load it and replace what's on this device?");
    if(loadCloud){
      await applyCloudProfile(cloudProfile);
      return;
    }
    // They chose to keep what's on this device — fall through and push it up instead.
  }

  await syncLocalProfileToCloudImpl();
}

// Applies a profile fetched from the cloud onto this device — saves it to
// local storage and refreshes the screens that show profile info, the same
// way restoreFromFile() does in storage.js for a manual backup restore.
async function applyCloudProfile(cloudProfile){
  state.profile = cloudProfile;
  await storeSet(KEYS.PROFILE, state.profile);
  await applyThemePreference();
  document.getElementById('homeName').textContent = state.profile.name || t('default.sailorName');
  refreshAvatars();
  showToast('Profile loaded from your account.');
}

/* ---------- boats ↔ cloud ----------
   Deliberately NOT the same shape as the old (removed) boats/crew sync: that
   version made "the cloud match this device exactly" on every sync, which
   meant a device with no local boats yet — e.g. one that hadn't pulled down
   for the first time — would delete every boat in the cloud. This version
   never infers a delete from something being merely absent locally or in
   the cloud. A boat is only ever removed from the cloud by an explicit
   local delete (deleteBoatFromCloud, called from deleteBoatForm). Everything
   else is push-this-one-boat (upsert) or pull-and-merge by timestamp —
   never a full-list replace in either direction. Crew is intentionally left
   out of this for now; adding it later should follow the same shape. */

// Push a single boat. Called after every local save (add or edit) — never
// batches the whole boats list, so this can't accidentally drop boats this
// device doesn't know about yet. Goes through the cloud sync queue (see
// above) so it can't race a concurrent pull.
function pushBoatToCloud(boat){
  return withCloudSyncQueue(() => pushBoatToCloudImpl(boat));
}
async function pushBoatToCloudImpl(boat){
  if(!state.user) return { ok:false };
  try{
    const { error } = await getSupabaseClient()
      .from('boats')
      .upsert({ id: boat.id, user_id: state.user.id, data: boat, updated_at: boat.updatedAt || new Date().toISOString() });
    if(error) throw error;
    return { ok:true };
  }catch(e){
    console.error('boat cloud push failed', e);
    return { ok:false, message: e.message || String(e) };
  }
}

// Marks a boat deleted — a soft-delete (tombstone) rather than a real SQL
// delete. This is the ONLY way a boat is ever removed from the cloud, and
// it's what lets other devices tell "the cloud has never heard of this id"
// (push it up) apart from "the cloud knows this was deleted" (remove it
// locally, never resurrect it) — see mergeBoats below. A real row delete
// couldn't carry that distinction, which is exactly why a boat deleted on
// one device used to come back after syncing another. Also goes through
// the cloud sync queue, same reason as pushBoatToCloud.
function deleteBoatFromCloud(boatId){
  return withCloudSyncQueue(() => deleteBoatFromCloudImpl(boatId));
}
async function deleteBoatFromCloudImpl(boatId){
  if(!state.user) return { ok:false };
  try{
    const { error } = await getSupabaseClient()
      .from('boats')
      .upsert({ id: boatId, user_id: state.user.id, data: {}, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if(error) throw error;
    return { ok:true };
  }catch(e){
    console.error('boat cloud delete failed', e);
    return { ok:false, message: e.message || String(e) };
  }
}

// Fire-and-forget wrappers, called right after routine local edits — same
// no-op-when-signed-out, log-don't-toast pattern as the profile ones above.
async function syncBoatIfSignedIn(boat){
  if(!state.user) return;
  debugLog('[sync] pushing boat ' + boat.id + ' (' + boat.name + ')...');
  const result = await pushBoatToCloud(boat);
  if(!result.ok){
    console.error('background boat sync failed', result.message);
    debugLog('[sync] boat push FAILED: ' + result.message);
  } else {
    debugLog('[sync] boat push OK: ' + boat.id);
  }
}
async function syncBoatDeleteIfSignedIn(boatId){
  if(!state.user) return;
  const result = await deleteBoatFromCloud(boatId);
  if(!result.ok) console.error('background boat delete sync failed', result.message);
}

// Merges local + cloud boat lists by id, newest updated_at wins. Never
// drops a boat just because it's missing from one side — a boat only in
// the cloud gets pulled in locally; a boat only on this device gets kept
// (and queued to push up); a boat in both keeps whichever copy is newer.
// This is what makes it safe to run on every sign-in and every manual sync,
// even from a device with an empty or stale local list.
//
// A cloud row with deleted_at set is a tombstone (see deleteBoatFromCloud)
// and is handled before any of that: it's dropped from the merged result
// unconditionally, and never queued to push back up — even if this device
// still has a local copy. Without this, "cloud doesn't have it" was
// indistinguishable from "cloud never heard of it", so a device that still
// had the boat locally would keep it AND push it right back to the cloud,
// undoing the delete every time it synced.
function mergeBoats(localBoats, cloudRows){
  const localById = new Map((localBoats||[]).map(b=>[b.id, b]));
  const cloudById = new Map((cloudRows||[]).map(r=>[r.id, r]));
  const allIds = new Set([...localById.keys(), ...cloudById.keys()]);

  const merged = [];
  const toPushUp = []; // boats whose local copy is newer (or local-only) and needs pushing

  for(const id of allIds){
    const local = localById.get(id);
    const cloud = cloudById.get(id);
    if(cloud && cloud.deleted_at){
      continue; // tombstoned — drop it locally, never resurrect it in the cloud
    }
    if(local && cloud){
      const localTime = local.updatedAt ? Date.parse(local.updatedAt) : 0;
      const cloudTime = cloud.updated_at ? Date.parse(cloud.updated_at) : 0;
      if(cloudTime > localTime){
        merged.push(cloud.data);
      } else {
        merged.push(local);
        if(localTime > cloudTime) toPushUp.push(local);
      }
    } else if(local && !cloud){
      merged.push(local);
      toPushUp.push(local);
    } else if(!local && cloud){
      merged.push(cloud.data);
    }
  }
  return { merged, toPushUp };
}

// Runs on sign-in (and manual sync): fetches the cloud's boats, merges with
// whatever's local, saves + renders the merged result, then pushes up any
// boats where the local copy won the merge. Safe to call from a device with
// zero local boats (nothing to push, everything just gets pulled in) or a
// device with real data the cloud hasn't seen yet (nothing gets lost). Goes
// through the cloud sync queue as a whole (see above) so it can't
// interleave with a push or delete that's still in flight — uses the
// unqueued *Impl push internally since this function already holds the
// queue's one slot.
function resolveBoatsSyncOnSignIn(){
  debugLog('[sync] resolveBoatsSyncOnSignIn() called — queuing...');
  return withCloudSyncQueue(resolveBoatsSyncOnSignInImpl);
}
async function resolveBoatsSyncOnSignInImpl(){
  debugLog('[sync] boats task DEQUEUED, starting');
  if(!state.user) return { ok:true };

  let cloudRows;
  try{
    debugLog('[sync] boats: sending fetch to Supabase...');
    const { data, error } = await getSupabaseClient()
      .from('boats')
      .select('id,data,updated_at,deleted_at')
      .eq('user_id', state.user.id);
    if(error) throw error;
    cloudRows = data || [];
  }catch(e){
    console.error('boats cloud fetch failed', e);
    debugLog('[sync] boats fetch THREW: ' + (e.message || String(e)));
    return { ok:false, message: 'fetch failed: ' + (e.message || String(e)) };
  }

  debugLog(`[sync] boats fetch OK — cloud rows: ${cloudRows.length} [${cloudRows.map(r=>r.id).join(',')}], local: ${(state.boats||[]).length} [${(state.boats||[]).map(b=>b.id).join(',')}]`);

  const { merged, toPushUp } = mergeBoats(state.boats, cloudRows);
  debugLog(`[sync] boats merged -> ${merged.length} [${merged.map(b=>b.id).join(',')}], pushing up ${toPushUp.length}`);
  if(toPushUp.length){
    const cloudById = new Map(cloudRows.map(r=>[r.id, r]));
    for(const b of toPushUp){
      const cr = cloudById.get(b.id);
      debugLog(`[sync] toPushUp: ${b.id} "${b.name}" local.updatedAt=${b.updatedAt} vs cloud.updated_at=${cr ? cr.updated_at : '(no cloud row)'}`);
    }
  }
  state.boats = merged;
  await storeSet(KEYS.BOATS, state.boats);
  renderBoats();

  for(const boat of toPushUp){
    debugLog(`[sync] pushing up boat ${boat.id} with updatedAt=${boat.updatedAt}...`);
    const result = await pushBoatToCloudImpl(boat);
    debugLog(`[sync] push result for ${boat.id}: ${result.ok ? 'OK' : ('FAILED — ' + result.message)}`);
    if(!result.ok) return { ok:false, message: result.message };
  }
  return { ok:true };
}

/* ---------- crew ↔ cloud ----------
   Exactly the same shape as boats above: push-this-one-row on edit, explicit
   single-row delete, merge-by-id-and-updated_at on sign-in/boot/manual sync.
   Never a full-list replace in either direction — see the boats comment
   above for why. */

// Push a single crew member. Called after every local save (add or edit).
// Goes through the cloud sync queue, same reason as pushBoatToCloud.
function pushCrewToCloud(crewMember){
  return withCloudSyncQueue(() => pushCrewToCloudImpl(crewMember));
}
async function pushCrewToCloudImpl(crewMember){
  if(!state.user) return { ok:false };
  try{
    const { error } = await getSupabaseClient()
      .from('crew')
      .upsert({ id: crewMember.id, user_id: state.user.id, data: crewMember, updated_at: crewMember.updatedAt || new Date().toISOString() });
    if(error) throw error;
    return { ok:true };
  }catch(e){
    console.error('crew cloud push failed', e);
    return { ok:false, message: e.message || String(e) };
  }
}

// Marks a crew member deleted — a soft-delete (tombstone), same reasoning
// as deleteBoatFromCloud above. The ONLY way a crew member is ever removed
// from the cloud. Also goes through the cloud sync queue.
function deleteCrewFromCloud(crewId){
  return withCloudSyncQueue(() => deleteCrewFromCloudImpl(crewId));
}
async function deleteCrewFromCloudImpl(crewId){
  if(!state.user) return { ok:false };
  try{
    const { error } = await getSupabaseClient()
      .from('crew')
      .upsert({ id: crewId, user_id: state.user.id, data: {}, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if(error) throw error;
    return { ok:true };
  }catch(e){
    console.error('crew cloud delete failed', e);
    return { ok:false, message: e.message || String(e) };
  }
}

// Fire-and-forget wrappers, called right after routine local edits.
async function syncCrewIfSignedIn(crewMember){
  if(!state.user) return;
  const result = await pushCrewToCloud(crewMember);
  if(!result.ok) console.error('background crew sync failed', result.message);
}
async function syncCrewDeleteIfSignedIn(crewId){
  if(!state.user) return;
  const result = await deleteCrewFromCloud(crewId);
  if(!result.ok) console.error('background crew delete sync failed', result.message);
}

// Same merge shape as mergeBoats — newest updated_at wins, nothing is ever
// dropped just for being missing on one side, and a deleted_at tombstone is
// honored unconditionally (see mergeBoats for why).
function mergeCrew(localCrew, cloudRows){
  const localById = new Map((localCrew||[]).map(c=>[c.id, c]));
  const cloudById = new Map((cloudRows||[]).map(r=>[r.id, r]));
  const allIds = new Set([...localById.keys(), ...cloudById.keys()]);

  const merged = [];
  const toPushUp = [];

  for(const id of allIds){
    const local = localById.get(id);
    const cloud = cloudById.get(id);
    if(cloud && cloud.deleted_at){
      continue; // tombstoned — drop it locally, never resurrect it in the cloud
    }
    if(local && cloud){
      const localTime = local.updatedAt ? Date.parse(local.updatedAt) : 0;
      const cloudTime = cloud.updated_at ? Date.parse(cloud.updated_at) : 0;
      if(cloudTime > localTime){
        merged.push(cloud.data);
      } else {
        merged.push(local);
        if(localTime > cloudTime) toPushUp.push(local);
      }
    } else if(local && !cloud){
      merged.push(local);
      toPushUp.push(local);
    } else if(!local && cloud){
      merged.push(cloud.data);
    }
  }
  return { merged, toPushUp };
}

// Runs on sign-in, boot-time session restore, and manual sync — same
// safety properties as resolveBoatsSyncOnSignIn, including going through
// the cloud sync queue as a whole and using the unqueued *Impl push
// internally.
function resolveCrewSyncOnSignIn(){
  return withCloudSyncQueue(resolveCrewSyncOnSignInImpl);
}
async function resolveCrewSyncOnSignInImpl(){
  if(!state.user) return { ok:true };

  let cloudRows;
  try{
    const { data, error } = await getSupabaseClient()
      .from('crew')
      .select('id,data,updated_at,deleted_at')
      .eq('user_id', state.user.id);
    if(error) throw error;
    cloudRows = data || [];
  }catch(e){
    console.error('crew cloud fetch failed', e);
    return { ok:false, message: 'fetch failed: ' + (e.message || String(e)) };
  }

  const { merged, toPushUp } = mergeCrew(state.crew, cloudRows);
  state.crew = merged;
  await storeSet(KEYS.CREW, state.crew);
  renderCrew();

  for(const crewMember of toPushUp){
    const result = await pushCrewToCloudImpl(crewMember);
    if(!result.ok) return { ok:false, message: result.message };
  }
  return { ok:true };
}

/* ---------- profile → cloud sync ----------
   One-way for now: pushes this device's local profile up to the profiles
   table, overwriting whatever was there. Runs after every successful sign-in
   (not on session-restore at app boot — only on an actual sign-in action),
   so it's always this device's copy that wins. There's no pull-down yet
   (a second device won't fetch this automatically) — that's the next piece
   to build once this is confirmed working.
   Uses upsert rather than update: an account whose profiles row doesn't
   exist yet (e.g. it predates the profiles table, or the create-on-signup
   trigger didn't fire for some other reason) would silently no-op under
   update — upsert creates the row if it's missing. Returns true/false so
   callers can tell the person whether it actually worked. */
function syncLocalProfileToCloud(){
  return withCloudSyncQueue(syncLocalProfileToCloudImpl);
}
async function syncLocalProfileToCloudImpl(){
  if(!state.user) return { ok:false };
  try{
    const { error } = await getSupabaseClient()
      .from('profiles')
      .upsert({ id: state.user.id, display_name: state.profile.name || null, profile_data: state.profile });
    if(error){ console.error('profile cloud sync failed', error); return { ok:false, message: error.message }; }
    return { ok:true };
  }catch(e){
    console.error('profile cloud sync failed', e);
    return { ok:false, message: e.message || String(e) };
  }
}

// Fire-and-forget cloud push, called after any LOCAL edit to the profile
// (name, theme, units, etc.) so changes made after the initial sign-in sync
// also reach other devices — previously only the one-time sign-in
// resolution and the manual "Sync" button ever pushed to the cloud, so any
// edit made afterward silently stayed on that device only. No-ops (and no
// toast) when signed out; failures are logged, not surfaced, since these
// run silently after routine local saves.
async function syncProfileIfSignedIn(){
  if(!state.user) return;
  const result = await syncLocalProfileToCloud();
  if(!result.ok) console.error('background profile sync failed', result.message);
}

// Manual trigger from the Settings Account card. Reuses the same safe
// resolve logic as sign-in (pull down if the cloud has a profile this
// device lacks, ask before overwriting if both sides differ) rather than
// blindly pushing.
async function manualSyncProfile(){
  const btn = document.getElementById('syncProfileBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try{
    await resolveProfileSyncOnSignIn();
    const boatsResult = await resolveBoatsSyncOnSignIn();
    if(!boatsResult.ok){
      showToast('Sync failed: ' + boatsResult.message);
      return;
    }
    const crewResult = await resolveCrewSyncOnSignIn();
    if(crewResult.ok){
      showToast('Synced to cloud.');
    } else {
      showToast('Sync failed: ' + crewResult.message);
    }
  }catch(e){
    console.error('manual sync failed', e);
    showToast("Sync failed — check you're online.");
  }finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

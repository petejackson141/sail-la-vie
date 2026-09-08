// ===== auth.js =====
// Cloud ACCOUNT layer, powered by Supabase (https://supabase.com). Handles
// sign up / sign in / sign out and keeps state.user in sync with whoever's
// currently logged in.
//
// IMPORTANT — what this file does NOT do yet: it doesn't sync journeys, boats,
// or crew to the cloud — only the profile. Those are separate features to
// build next, on top of this.
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
    _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return _supabaseClient;
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

  getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
}

function applySession(session){
  state.user = session ? { id: session.user.id, email: session.user.email } : null;
  renderAccountUI();
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
async function resolveProfileSyncOnSignIn(){
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

  await syncLocalProfileToCloud();
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
// device doesn't know about yet.
async function pushBoatToCloud(boat){
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

// Explicit single-row delete — the ONLY way a boat is ever removed from the
// cloud. Called right after a local delete, never inferred elsewhere.
async function deleteBoatFromCloud(boatId){
  if(!state.user) return { ok:false };
  try{
    const { error } = await getSupabaseClient()
      .from('boats')
      .delete()
      .eq('id', boatId)
      .eq('user_id', state.user.id);
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
  const result = await pushBoatToCloud(boat);
  if(!result.ok) console.error('background boat sync failed', result.message);
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
function mergeBoats(localBoats, cloudRows){
  const localById = new Map((localBoats||[]).map(b=>[b.id, b]));
  const cloudById = new Map((cloudRows||[]).map(r=>[r.id, r]));
  const allIds = new Set([...localById.keys(), ...cloudById.keys()]);

  const merged = [];
  const toPushUp = []; // boats whose local copy is newer (or local-only) and needs pushing

  for(const id of allIds){
    const local = localById.get(id);
    const cloud = cloudById.get(id);
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
// device with real data the cloud hasn't seen yet (nothing gets lost).
async function resolveBoatsSyncOnSignIn(){
  if(!state.user) return { ok:true };

  let cloudRows;
  try{
    const { data, error } = await getSupabaseClient()
      .from('boats')
      .select('id,data,updated_at')
      .eq('user_id', state.user.id);
    if(error) throw error;
    cloudRows = data || [];
  }catch(e){
    console.error('boats cloud fetch failed', e);
    return { ok:false, message: 'fetch failed: ' + (e.message || String(e)) };
  }

  const { merged, toPushUp } = mergeBoats(state.boats, cloudRows);
  state.boats = merged;
  await storeSet(KEYS.BOATS, state.boats);
  renderBoats();

  for(const boat of toPushUp){
    const result = await pushBoatToCloud(boat);
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
async function syncLocalProfileToCloud(){
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
    if(boatsResult.ok){
      showToast('Synced to cloud.');
    } else {
      showToast('Sync failed: ' + boatsResult.message);
    }
  }catch(e){
    console.error('manual sync failed', e);
    showToast("Sync failed — check you're online.");
  }finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

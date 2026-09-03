// ===== auth.js =====
// Cloud ACCOUNT layer, powered by Supabase (https://supabase.com). Handles
// sign up / sign in / sign out and keeps state.user in sync with whoever's
// currently logged in.
//
// IMPORTANT — what this file does NOT do yet: it doesn't sync journeys,
// boats, crew or your profile to the cloud. Signing in right now just gives
// you an account; nothing about how the app stores your data on this device
// changes. Cloud sync is a separate feature we'll build next, on top of this.
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
// Built lazily on first use, not at file-load time. The library loads with
// `defer` now (see index.html) so the app's own screen appears instantly
// instead of waiting on that download — but that means `supabase` (the
// library) isn't guaranteed to exist yet the instant THIS file runs. By the
// time anything actually calls getSupabaseClient() (initAuth(), a sign-in
// tap, etc.), the page has finished loading and it's always ready.
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
  if(!state.user) return false;
  try{
    const { error } = await getSupabaseClient()
      .from('profiles')
      .upsert({ id: state.user.id, display_name: state.profile.name || null, profile_data: state.profile });
    if(error){ console.error('profile cloud sync failed', error); return false; }
    return true;
  }catch(e){
    console.error('profile cloud sync failed', e);
    return false;
  }
}

// Manual trigger from the Settings Account card — mainly useful while
// testing, but also a reasonable safety valve later if an automatic sync
// ever seems to have missed.
async function manualSyncProfile(){
  const btn = document.getElementById('syncProfileBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  const ok = await syncLocalProfileToCloud();
  btn.disabled = false;
  btn.textContent = originalLabel;
  showToast(ok ? 'Profile synced to cloud.' : "Sync failed — check you're online.");
}

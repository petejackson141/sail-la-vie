// ===== auth.js =====
// Cloud ACCOUNT layer, powered by Supabase (https://supabase.com). Handles
// sign up / sign in / sign out and keeps state.user in sync with whoever's
// currently logged in.
//
// IMPORTANT — what this file does NOT do yet: it doesn't sync journeys to the
// cloud. Profile, boats, and crew are handled below; journeys are a separate
// feature to build next, on top of this.
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
        await resolveBoatsCrewSyncOnSignIn();
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
      await resolveBoatsCrewSyncOnSignIn();
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

/* ---------- boats & crew ↔ cloud ----------
   Same pattern as profile, but for lists rather than a single object: each
   boat/crew member is its own row (id, user_id, data), matched by the same
   id your app already generates locally (uid()) — no separate cloud-id
   mapping needed. */

// Push = "make the cloud match this device exactly": deletes any cloud rows
// for this user that no longer exist locally (things deleted on this
// device), then upserts everything currently local.
async function pushBoatsAndCrewToCloud(){
  if(!state.user) return { ok:false };
  const client = getSupabaseClient();
  try{
    const boatIds = state.boats.map(b=>b.id);
    const crewIds = state.crew.map(c=>c.id);

    // .not() needs the "in" list preformatted as "(a,b,c)" — unlike .in(),
    // it doesn't auto-serialize a plain JS array. Passing the raw array here
    // was the actual cause of "Sync failed": PostgREST rejected the
    // malformed filter and the whole push aborted.
    const delBoats = boatIds.length
      ? client.from('boats').delete().eq('user_id', state.user.id).not('id','in',`(${boatIds.join(',')})`)
      : client.from('boats').delete().eq('user_id', state.user.id);
    const delCrew = crewIds.length
      ? client.from('crew').delete().eq('user_id', state.user.id).not('id','in',`(${crewIds.join(',')})`)
      : client.from('crew').delete().eq('user_id', state.user.id);
    const [{error:delBoatsErr},{error:delCrewErr}] = await Promise.all([delBoats, delCrew]);
    if(delBoatsErr) throw delBoatsErr;
    if(delCrewErr) throw delCrewErr;

    if(boatIds.length){
      const rows = state.boats.map(b=>({ id:b.id, user_id:state.user.id, data:b, updated_at:new Date().toISOString() }));
      const { error } = await client.from('boats').upsert(rows);
      if(error) throw error;
    }
    if(crewIds.length){
      const rows = state.crew.map(c=>({ id:c.id, user_id:state.user.id, data:c, updated_at:new Date().toISOString() }));
      const { error } = await client.from('crew').upsert(rows);
      if(error) throw error;
    }
    return { ok:true };
  }catch(e){
    console.error('boats/crew cloud push failed', e);
    return { ok:false, message: e.message || String(e) };
  }
}

async function fetchCloudBoatsAndCrew(){
  const client = getSupabaseClient();
  const [{data:boatRows,error:be},{data:crewRows,error:ce}] = await Promise.all([
    client.from('boats').select('data').eq('user_id', state.user.id),
    client.from('crew').select('data').eq('user_id', state.user.id)
  ]);
  if(be) throw be;
  if(ce) throw ce;
  return { boats:(boatRows||[]).map(r=>r.data), crew:(crewRows||[]).map(r=>r.data) };
}

async function resolveBoatsCrewSyncOnSignIn(){
  if(!state.user) return;

  let cloud = null;
  try{ cloud = await fetchCloudBoatsAndCrew(); }
  catch(e){ console.error('boats/crew cloud fetch failed', e); }

  const localHasData = (state.boats && state.boats.length) || (state.crew && state.crew.length);
  const cloudHasData = cloud && ((cloud.boats && cloud.boats.length) || (cloud.crew && cloud.crew.length));

  if(cloudHasData){
    const sameAsLocal = JSON.stringify(cloud.boats)===JSON.stringify(state.boats)
      && JSON.stringify(cloud.crew)===JSON.stringify(state.crew);
    if(!localHasData || sameAsLocal){
      await applyCloudBoatsAndCrew(cloud);
      return;
    }
    const loadCloud = await showConfirm("This account already has boats/crew saved in the cloud. Load them and replace what's on this device?");
    if(loadCloud){
      await applyCloudBoatsAndCrew(cloud);
      return;
    }
    // They chose to keep this device's boats/crew — fall through and push up instead.
  }

  await pushBoatsAndCrewToCloud();
}

async function applyCloudBoatsAndCrew(cloud){
  state.boats = cloud.boats || [];
  state.crew = cloud.crew || [];
  await storeSet(KEYS.BOATS, state.boats);
  await storeSet(KEYS.CREW, state.crew);
  renderBoats();
  renderCrew();
  showToast('Boats & crew loaded from your account.');
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

// Manual trigger from the Settings Account card — mainly useful while
// testing, but also a reasonable safety valve later if an automatic sync
// ever seems to have missed. Pushes profile, boats, and crew together —
// always upward (device → cloud), same direction as the automatic push.
async function manualSyncProfile(){
  const btn = document.getElementById('syncProfileBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  const profileResult = await syncLocalProfileToCloud();
  const boatsCrewResult = await pushBoatsAndCrewToCloud();
  btn.disabled = false;
  btn.textContent = originalLabel;
  if(profileResult.ok && boatsCrewResult.ok){
    showToast('Synced to cloud.');
  } else {
    const detail = profileResult.message || boatsCrewResult.message;
    showToast(detail ? `Sync failed: ${detail}` : "Sync failed — check you're online.");
  }
}

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

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let authMode = 'signin'; // 'signin' | 'signup' — which mode sheetAuth is currently showing

/* ---------- boot-time session check ----------
   Called once from boot() in state-core.js (not awaited there — see the
   comment at that call site). Checks whether a session already exists (e.g.
   the app was closed and reopened after a previous login) and subscribes to
   future auth changes so state.user + the Settings screen stay correct
   whenever the session changes (sign in, sign out, token refresh). */
async function initAuth(){
  const { data } = await supabaseClient.auth.getSession();
  applySession(data.session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
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
  hideAuthError();
  updateAuthSheetLabels();
  openSheet('sheetAuth');
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
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if(error) throw error;
      closeSheets();
      // Supabase emails a confirmation link by default — the account exists
      // but won't be able to sign in until that link is clicked.
      showToast('Check your email to confirm your account.');
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if(error) throw error;
      closeSheets();
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
  await supabaseClient.auth.signOut();
  showToast('Signed out.');
}

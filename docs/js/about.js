/* ============================================================
   HELP & ABOUT — About page, Contact us form, and the small info
   pages (What's new, Licence & copyright, Credits).

   Screens (index.html): #screen-about, #screen-contact, #screen-info.
   Settings has a "Help & About" group that links in here.

   ---- Fill these in when you have them ----
   Leaving any of them '' is safe: the matching row shows a
   "Coming soon" tag (manual / privacy / terms) or is hidden (email).
   ============================================================ */
const COPYRIGHT_HOLDER = 'Pete Jackson';
const COPYRIGHT_YEAR   = 2026;
const SUPPORT_EMAIL    = 'sailapp141@gmail.com';
// Always the live copy on GitHub Pages. To update the guide, replace
// docs/Sail-la-Vie-User-Guide.pdf with the new file (same name) and push.
const USER_MANUAL_URL  = 'https://petejackson141.github.io/sail-la-vie/Sail-la-Vie-User-Guide.pdf';
const PRIVACY_URL      = 'https://petejackson141.github.io/sail-la-vie/privacy.html';
const TERMS_URL        = 'https://petejackson141.github.io/sail-la-vie/terms.html';
// Always the newest Android app. Publish each new build as a GitHub Release
// with the APK attached and named exactly sail-la-vie.apk; this link then
// points at it automatically. (Don't put the APK in docs/: cap sync would pack it into the app.)
const ANDROID_APK_URL  = 'https://github.com/petejackson141/sail-la-vie/releases/latest/download/sail-la-vie.apk';

// Newest first. Add a line here with each release worth telling people about.
const WHATS_NEW = [
  { version: '29.09.2026', items: [
    'New About page with the user manual, contact form and legal information (Settings → Help & About).',
    'Privacy policy and terms of use added.',
    'Delete your account from Settings → Account.',
    'Send feedback, report a problem or suggest a feature straight from the app.',
    'Download the latest Android version from Settings → Help & About → About.',
    'An account is now needed to use the app, and you choose a username when you first sign in.',
    'Usernames can now have spaces and capitals, like “Pete Jackson”.'
  ]},
  { version: '27.09.2026', items: [
    'Friends: find other sailors, send friend requests and see the sails they share with you.',
    'Choose Only me or Friends each time you save a sail or a Noticeboard plan.',
    '"Weather on the water" report on each recorded sail.',
    'Sail photos are now stored in the cloud, compressed, up to 20 per sail.'
  ]},
  { version: '26.09.2026', items: [
    'Sailing certificate as an A4 PDF.',
    'Sail PDF export rebuilt with the Nautical Magazine, Minimalist Yacht Club and Memory Page designs.'
  ]}
];

/* ---------- small helpers ---------- */
function _esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _soonTag(){ return '<span class="soon-tag">Coming soon</span>'; }
function openExternalUrl(url){
  // In the Capacitor app, a _blank link opens in the phone's browser; on the web, a new tab.
  try{ window.open(url, '_blank', 'noopener'); }catch(e){ location.href = url; }
}

/* ---------- static bits filled in once at startup ---------- */
function initAboutPage(){
  document.querySelectorAll('.app-version-text').forEach(el => { el.textContent = 'Version ' + APP_VERSION; });
  document.querySelectorAll('.support-email-text').forEach(el => { el.textContent = SUPPORT_EMAIL; });
  document.querySelectorAll('.manual-soon').forEach(el => { el.innerHTML = USER_MANUAL_URL ? '' : _soonTag(); });
  document.querySelectorAll('.privacy-soon').forEach(el => { el.innerHTML = PRIVACY_URL ? '' : _soonTag(); });
  document.querySelectorAll('.terms-soon').forEach(el => { el.innerHTML = TERMS_URL ? '' : _soonTag(); });
  document.querySelectorAll('.android-soon').forEach(el => { el.innerHTML = ANDROID_APK_URL ? '' : _soonTag(); });
  // iPhone/iPad users can't install an APK, so hide the row for them.
  const androidRow = document.getElementById('aboutAndroidRow');
  if(androidRow && /iPhone|iPad|iPod/.test(navigator.userAgent || '')) androidRow.style.display = 'none';
  const emailRow = document.getElementById('aboutEmailRow');
  if(emailRow) emailRow.style.display = SUPPORT_EMAIL ? '' : 'none';
  const emailAlt = document.getElementById('contactEmailAlt');
  if(emailAlt) emailAlt.style.display = SUPPORT_EMAIL ? '' : 'none';
  const copy = document.getElementById('aboutCopyright');
  if(copy) copy.innerHTML = `© ${COPYRIGHT_YEAR} ${_esc(COPYRIGHT_HOLDER)}. All rights reserved.<br>Sail la Vie, its name and logo belong to ${_esc(COPYRIGHT_HOLDER)}.`;
}

/* ---------- Help links ---------- */
function openUserManual(){
  if(!USER_MANUAL_URL){ showToast('The user manual is coming soon'); return; }
  openExternalUrl(USER_MANUAL_URL);
}
function downloadAndroidApp(){
  if(!ANDROID_APK_URL){ showToast('The Android download is coming soon'); return; }
  showToast('Downloading. When it finishes, open the file and tap Install');
  openExternalUrl(ANDROID_APK_URL);
}
/* ---------- "Update available" check (Android app only) ----------
   On launch, asks GitHub for the newest Release and compares its tag with
   this build's APP_VERSION. If the release is newer, a prompt offers the
   download, and the About row shows "Update available".
   IMPORTANT when publishing: the release tag must be "v" + the APP_VERSION of
   the APK you attach (e.g. v29.09.2026.0916 — the number shown in Settings).
   "Later" hides the prompt for 24 hours; the About row keeps showing it. */
const ANDROID_RELEASE_API = 'https://api.github.com/repos/petejackson141/sail-la-vie/releases/latest';
const UPDATE_SNOOZE_KEY   = 'sailUpdateSnooze';
const UPDATE_SNOOZE_MS    = 24 * 60 * 60 * 1000;

function _isAndroidApp(){
  try{ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
                 && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android'); }
  catch(e){ return false; }
}
// "29.09.2026.0916" or "v29.09.2026.0916" -> 202609290916 (a comparable number). null if not a version.
function _versionNumber(v){
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\.(\d{3,4}))?$/);
  if(!m) return null;
  const hhmm = (m[4] || '0000').padStart(4, '0');
  return Number(m[3] + m[2].padStart(2, '0') + m[1].padStart(2, '0') + hhmm);
}
function _markAboutUpdate(newVersion){
  const row = document.getElementById('aboutAndroidRow');
  if(!row) return;
  const sub = row.querySelector('.ab-sub');
  if(sub){ sub.textContent = 'Update available: version ' + newVersion; sub.style.color = 'var(--coral-deep)'; sub.style.fontWeight = '600'; }
  const title = row.querySelector('.ab-title');
  if(title) title.textContent = 'Download the update';
}

async function checkForAppUpdate(){
  if(!_isAndroidApp() || !ANDROID_APK_URL) return;
  if(navigator.onLine === false) return;
  try{
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    const res = await fetch(ANDROID_RELEASE_API, {
      cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json' },
      signal: ctrl ? ctrl.signal : undefined
    });
    if(timer) clearTimeout(timer);
    if(!res.ok) return; // no release yet (404) or GitHub busy: stay quiet
    const rel = await res.json();
    const latest = _versionNumber(rel && rel.tag_name);
    const mine = _versionNumber(APP_VERSION);
    if(!latest || !mine || latest <= mine) return;

    const newVersion = String(rel.tag_name).replace(/^v/i, '');
    _markAboutUpdate(newVersion);

    // Snoozed recently for this same version? Don't pop up again yet.
    try{
      const snooze = JSON.parse(localStorage.getItem(UPDATE_SNOOZE_KEY) || 'null');
      if(snooze && snooze.tag === rel.tag_name && (Date.now() - snooze.at) < UPDATE_SNOOZE_MS) return;
    }catch(e){}

    const ok = await showConfirm(
      'Version ' + newVersion + ' of Sail la Vie is ready. Download it, open the file and tap Install. Your sails and settings stay as they are.',
      { title: 'Update available', okLabel: 'Download', cancelLabel: 'Later', icon: 'cloud' }
    ).catch(() => false);
    if(ok){ downloadAndroidApp(); }
    else{
      try{ localStorage.setItem(UPDATE_SNOOZE_KEY, JSON.stringify({ tag: rel.tag_name, at: Date.now() })); }catch(e){}
    }
  }catch(e){
    console.warn('update check failed', e);
  }
}

function openLegalLink(kind){
  const url = kind === 'privacy' ? PRIVACY_URL : TERMS_URL;
  if(!url){ showToast((kind === 'privacy' ? 'The privacy policy' : 'The terms of use') + ' will be added before public release'); return; }
  openExternalUrl(url);
}
function emailSupport(extraBody){
  if(!SUPPORT_EMAIL) return;
  const subject = encodeURIComponent('Sail la Vie ' + APP_VERSION);
  const body = extraBody ? '&body=' + encodeURIComponent(extraBody) : '';
  location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}${body}`;
}

/* ---------- info pages ---------- */
function showInfoPage(kind){
  const titleEl = document.getElementById('infoTitle');
  const bodyEl = document.getElementById('infoBody');
  let title = '', html = '';
  if(kind === 'whatsnew'){
    title = "What's new";
    html = WHATS_NEW.map(r => `<h3>${_esc(r.version)}</h3><ul>${r.items.map(i => `<li>${_esc(i)}</li>`).join('')}</ul>`).join('');
  } else if(kind === 'licence'){
    title = 'Licence & copyright';
    html = `
      <h3>Copyright</h3>
      <p>© ${COPYRIGHT_YEAR} ${_esc(COPYRIGHT_HOLDER)}. All rights reserved.</p>
      <p>The Sail la Vie app, including its source code, design, graphics, text and the Sail la Vie name and logo, belongs to ${_esc(COPYRIGHT_HOLDER)}.</p>
      <h3>What you may do</h3>
      <p>You may install and use the app for your own sailing logbook.</p>
      <h3>What you may not do</h3>
      <p>Without written permission, you may not copy, modify, redistribute, resell or publish the app or its code, or reuse its design, graphics or name.</p>
      <h3>Your content</h3>
      <p>Your sails, photos, notes and profile remain yours.</p>
      <p class="muted">The app uses third-party open-source components, which keep their own licences. See Credits &amp; open-source licences.</p>`;
  } else if(kind === 'credits'){
    title = 'Credits';
    html = `
      <h3>Maps</h3>
      <ul>
        <li>Map data © OpenStreetMap contributors (ODbL)</li>
        <li>Map tiles © CARTO</li>
        <li>Sea marks © OpenSeaMap</li>
      </ul>
      <h3>Weather</h3>
      <ul><li>Weather and marine data by Open-Meteo.com (CC BY 4.0)</li></ul>
      <h3>Open-source software</h3>
      <ul>
        <li>Leaflet (BSD-2-Clause)</li>
        <li>Capacitor (MIT)</li>
        <li>Supabase JavaScript client (MIT)</li>
        <li>jsPDF (MIT)</li>
        <li>html2canvas (MIT)</li>
      </ul>
      <h3>Fonts</h3>
      <ul><li>Inter, Space Grotesk, Playfair Display, Libre Baskerville and Alex Brush, via Google Fonts (SIL Open Font Licence)</li></ul>`;
  }
  titleEl.textContent = title;
  bodyEl.innerHTML = html;
  nav('info');
}

/* ---------- Contact us ---------- */
const CONTACT_PLACEHOLDERS = {
  feedback: 'What do you like, and what could be better?',
  problem:  'What happened, and what were you doing at the time?',
  idea:     'Describe the feature you would like to see.',
  other:    'Write your message here.'
};
let contactState = { topic: 'feedback', screenshot: null, sending: false };

function deviceSummary(){
  const ua = navigator.userAgent || '';
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  let os = 'Unknown device';
  const android = ua.match(/Android\s([\d.]+)/);
  const ios = ua.match(/(?:iPhone|iPad|iPod).*?OS\s([\d_]+)/);
  if(android) os = 'Android ' + android[1];
  else if(ios) os = 'iOS ' + ios[1].replace(/_/g, '.');
  else if(/Windows/.test(ua)) os = 'Windows';
  else if(/Mac OS X/.test(ua)) os = 'Mac';
  let model = '';
  const m = ua.match(/Android\s[\d.]+;\s([^;)]+)/);
  if(m && m[1] && m[1].trim() !== 'K') model = m[1].trim();
  return [os, model, isNative ? 'app' : 'web'].filter(Boolean).join(' · ');
}

function openContact(topic){
  setContactTopic(topic || 'feedback');
  document.getElementById('contactDeviceLine').textContent = 'Version ' + APP_VERSION + ' · ' + deviceSummary() + '. Helps us find problems faster.';
  nav('contact');
}
function setContactTopic(topic){
  contactState.topic = topic;
  document.querySelectorAll('#contactTopicChips .chip').forEach(c => c.classList.toggle('active', c.dataset.topic === topic));
  document.getElementById('contactMessage').placeholder = CONTACT_PLACEHOLDERS[topic] || '';
}
async function onContactShotPicked(event){
  const file = event.target.files && event.target.files[0];
  event.target.value = ''; // so picking the same file again still fires
  if(!file) return;
  try{
    contactState.screenshot = await resizeImage(file, 1280, 0.7);
    document.getElementById('contactShotImg').src = contactState.screenshot;
    document.getElementById('contactShot').classList.add('show');
    document.getElementById('contactAttachBtn').style.display = 'none';
  }catch(e){
    showToast("Couldn't read that image");
  }
}
function removeContactShot(){
  contactState.screenshot = null;
  document.getElementById('contactShotImg').removeAttribute('src');
  document.getElementById('contactShot').classList.remove('show');
  document.getElementById('contactAttachBtn').style.display = '';
}
function resetContactForm(){
  document.getElementById('contactMessage').value = '';
  document.getElementById('contactIncludeDevice').checked = true;
  removeContactShot();
  setContactTopic('feedback');
}

async function sendContactMessage(){
  if(contactState.sending) return;
  const message = document.getElementById('contactMessage').value.trim();
  if(!message){ showToast('Please write a message first'); return; }
  const includeDevice = document.getElementById('contactIncludeDevice').checked;

  // Not signed in: fall back to email if there is one, otherwise ask them to sign in.
  if(!state.user){
    if(SUPPORT_EMAIL){ emailSupport(message); return; }
    showToast('Please sign in to send a message');
    return;
  }
  if(navigator.onLine === false){ showToast("You're offline. Try again when you have a connection"); return; }

  const btn = document.getElementById('contactSendBtn');
  contactState.sending = true;
  btn.disabled = true; btn.textContent = 'Sending…';
  try{
    const row = {
      user_id: state.user.id,
      email: state.user.email || null,
      topic: contactState.topic,
      message,
      app_version: includeDevice ? APP_VERSION : null,
      device: includeDevice ? deviceSummary() : null,
      screenshot: contactState.screenshot || null
    };
    const { error } = await getSupabaseClient().from('feedback').insert(row);
    if(error) throw error;
    resetContactForm();
    showToast('Thanks! Your message has been sent');
    nav('about');
  }catch(e){
    console.warn('feedback send failed', e);
    showToast("Couldn't send your message. Please try again");
  }finally{
    contactState.sending = false;
    btn.disabled = false; btn.textContent = 'Send message';
  }
}

initAboutPage();
setContactTopic('feedback');
// Give the app a few seconds to finish opening before checking for updates.
setTimeout(checkForAppUpdate, 4000);

// ===== state-core.js =====
// Global app state object, boot(), nav()/screen switching, action sheets, wake lock, photo resize + crop/adjust tool
// Extracted from the original single-file app.js, lines 1470-1776, in original order.

// Bumped automatically on every change Claude hands over — format is
// DD.MM.YYYY.HHMM (the moment the fix was produced, UTC). Shown in Settings
// so you can ask a tester "what version does yours say?" instead of
// guessing whether they're on the latest code — this exists BECAUSE of the
// caching mess a few pushes back, where nobody could tell whether an old
// build was still stuck on someone's phone. You shouldn't need to touch
// this yourself.
const APP_VERSION = '28.08.2026.1052';

/* ============================================================
   CUSTOM CONFIRM DIALOG (shared across all screens)
   Drop-in replacement for the native confirm() popup (browser-styled,
   can't be customized) so every confirmation in the app matches its look
   instead of showing the browser's default alert box.
   Usage: if(await showConfirm(message)) { ... }
   Pass {danger:true} for destructive actions (discard/delete) to show
   the confirm button in red with a warning icon instead of blue.
   Lives here (state-core.js) rather than in journey.js/history-maps.js/etc.
   since this file loads first and every screen needs this dialog.
   ============================================================ */
function showConfirm(message, opts={}){
  const danger = !!opts.danger;
  const okLabel = opts.okLabel || 'Confirm';
  const cancelLabel = opts.cancelLabel || 'Cancel';

  if(!document.getElementById('customConfirmStyles')){
    const style = document.createElement('style');
    style.id = 'customConfirmStyles';
    style.textContent = `
      .cc-overlay{position:fixed;inset:0;background:rgba(8,15,26,0.55);backdrop-filter:blur(2px);
        display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px;
        opacity:0;transition:opacity .18s ease;}
      .cc-overlay.show{opacity:1;}
      .cc-card{background:#152233;color:#eaf1fb;border-radius:18px;max-width:340px;width:100%;
        padding:24px 22px 18px;box-shadow:0 12px 40px rgba(0,0,0,0.45);
        transform:scale(.92) translateY(6px);transition:transform .18s ease;
        border:1px solid rgba(255,255,255,0.06);}
      .cc-overlay.show .cc-card{transform:scale(1) translateY(0);}
      .cc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
      .cc-icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-size:20px;flex-shrink:0;}
      .cc-icon.danger{background:rgba(255,90,90,0.15);color:#ff6b6b;}
      .cc-icon.normal{background:rgba(64,160,255,0.15);color:#4da3ff;}
      .cc-icon.cc-icon-boat{background:rgba(255,255,255,0.08);color:#9fb3c8;}
      .cc-msg{font-size:15.5px;line-height:1.45;color:#cdd8e6;margin:0 0 20px;}
      .cc-actions{display:flex;gap:10px;}
      .cc-btn{flex:1;padding:12px 0;border-radius:12px;border:none;font-size:15px;font-weight:600;
        cursor:pointer;transition:opacity .12s ease;}
      .cc-btn:active{opacity:.7;}
      .cc-btn-cancel{background:rgba(255,255,255,0.08);color:#eaf1fb;}
      .cc-btn-ok{background:#4da3ff;color:#06121f;}
      .cc-btn-ok.danger{background:#ff5a5a;color:#22090a;}
    `;
    document.head.appendChild(style);
  }

  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'cc-overlay';
    overlay.innerHTML = `
      <div class="cc-card">
        <div class="cc-header">
          <div class="cc-icon ${danger?'danger':'normal'}">${danger?'⚠️':'❔'}</div>
          <div class="cc-icon cc-icon-boat">⛵</div>
        </div>
        <p class="cc-msg"></p>
        <div class="cc-actions">
          <button class="cc-btn cc-btn-cancel" data-act="cancel"></button>
          <button class="cc-btn cc-btn-ok ${danger?'danger':''}" data-act="ok"></button>
        </div>
      </div>`;
    overlay.querySelector('.cc-msg').textContent = message;
    overlay.querySelector('[data-act="cancel"]').textContent = cancelLabel;
    overlay.querySelector('[data-act="ok"]').textContent = okLabel;

    function close(result){
      overlay.classList.remove('show');
      setTimeout(()=>overlay.remove(), 180);
      resolve(result);
    }
    overlay.querySelector('[data-act="cancel"]').onclick = ()=>close(false);
    overlay.querySelector('[data-act="ok"]').onclick = ()=>close(true);
    overlay.addEventListener('click', e=>{ if(e.target===overlay) close(false); });

    document.body.appendChild(overlay);
    requestAnimationFrame(()=>overlay.classList.add('show'));
  });
}

let state = {
  tripIndex: [],   // lightweight list for History screen — NOT the full trip records (those are stored separately as 'trip:<id>')
  boats: [],
  crew: [],
  profile: { name:'', role:'', license:'', phone:'', email:'', social:'', bio:'', avatar:'', theme:'light', unitSystem:'nautical', language:'en' },
};

let currentTrip = null;   // the ONE journey/manual-entry/edit in progress right now; null when nothing's active — check this first if the active screen misbehaves
let watchId = null;       // navigator.geolocation.watchPosition() handle, so stopGPS() can cancel it
let timerId = null;       // setInterval() handle for the elapsed-time ticker
let startedAt = null;     // Date.now() when the current live journey began, used to compute elapsed time
let lastFixTime = null;   // Date.now() of the last GPS fix we RECEIVED (accepted or not) — drives the staleness watchdog in journey.js
let gpsWatchdogInterval = null; // setInterval() handle that checks lastFixTime and flags/restarts a silently-dead GPS watch
let bestRejectedFix = null;     // best (lowest-accuracy-radius) fix we've rejected for being too imprecise, kept as a fallback so chronically weak signal doesn't mean zero points get recorded
let pendingJumpCandidate = null; // last fix rejected for implying an implausible (60+kt) jump — held so a SECOND agreeing fix can confirm it's a real relocation rather than a one-off glitch (see acceptFix() in journey.js)
let wakeLock = null;      // Screen Wake Lock, held while a live journey is running to reduce the chance
                           // of the OS suspending/killing the tab when the screen would otherwise sleep

// Persists currentTrip + startedAt to storage so a killed/reloaded tab can pick the
// journey back up instead of silently losing it. Called after every GPS fix, every
// tick of the timer, and on any state-changing action while a trip is active.
// Cheap (small JSON) so it's safe to call this often; storeSet is fire-and-forget here.
function saveActiveTripCheckpoint(){
  if(!currentTrip) return;
  // Returns the storeSet promise (rather than fire-and-forget internally) so the one
  // call site that needs a guarantee — beginJourney(), right after Cast Off — can
  // await it. Every other call site just calls this without awaiting, same as before.
  return storeSet(KEYS.ACTIVE_TRIP, { trip: currentTrip, startedAt });
}
function clearActiveTripCheckpoint(){
  storeDelete(KEYS.ACTIVE_TRIP);
}
async function requestWakeLock(){
  try{
    if('wakeLock' in navigator){ wakeLock = await navigator.wakeLock.request('screen'); }
  }catch(e){ /* not fatal — recovery-on-reload is the real safety net */ }
}
function releaseWakeLock(){
  if(wakeLock){ wakeLock.release().catch(()=>{}); wakeLock = null; }
}

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

/* ---------- boot: runs once on page load, loads everything from storage,
   then reveals the app (hides the loading spinner) ---------- */
async function boot(){
  await initStorage();

  const [idx, boats, crew, profile] = await Promise.all([
    storeGet(KEYS.INDEX), storeGet(KEYS.BOATS), storeGet(KEYS.CREW), storeGet(KEYS.PROFILE)
  ]);
  state.tripIndex = idx || [];
  state.boats = boats || [];
  state.crew = crew || [];
  state.profile = profile || state.profile;
  currentLang = 'en'; // language picker hidden for now — es/pt/he dictionaries kept intact for later
  applyStaticTranslations();

  await applyThemePreference();
  renderUnitsSettingUI();

  refreshAvatars();
  document.getElementById('homeName').textContent = state.profile.name || t('default.sailorName');
  document.getElementById('appVersionLine').textContent = t('settings.version', {version: APP_VERSION});
  greet();

  // Baseline history entry for the Android back-button integration below —
  // gives popstate a known "home" state to fall back to.
  history.replaceState({type:'screen', name:'home'}, '', location.href);

  const resumed = await resumeActiveTripIfAny();
  if(!resumed) nav('home', true); // already home — skip pushing a duplicate entry
  renderHomeStats();
}
function greet(){
  const h = new Date().getHours();
  document.getElementById('homeGreeting').textContent = h<12 ? t('greet.morning') : h<18 ? t('greet.afternoon') : t('greet.evening');
}
function refreshAvatars(){
  const a = state.profile.avatar || placeholderAvatar();
  document.getElementById('homeAvatar').src = a;
  document.getElementById('profileAvatarImg').src = a;
}
function placeholderAvatar(){
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#16324F"/><circle cx="40" cy="32" r="14" fill="#BFE0EA"/><path d="M14 70c0-16 12-26 26-26s26 10 26 26" fill="#BFE0EA"/></svg>`);
}

/* ---------- navigation: nav(name) is the app's entire "router" — it just
   shows the matching .screen div and hides the rest. No URL involved, but it
   DOES push a browser history entry per screen switch (see the back-button
   block below) so Android's hardware/gesture back steps through the app
   instead of exiting it straight away.
   fromPopState=true means "the back button already got us here, just update
   the UI" — skips pushing a duplicate history entry. ---------- */
function nav(name, fromPopState){
  const prevActiveEl = document.querySelector('.screen.active');
  const prevName = prevActiveEl ? prevActiveEl.id.replace('screen-','') : null;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.navitem').forEach(n=>n.classList.toggle('active', n.dataset.tab===name));
  window.scrollTo(0,0);
  if(!fromPopState && name!==prevName){
    history.pushState({type:'screen', name}, '', location.href);
  }
  if(name==='history') renderHistory();
  if(name==='boats') renderBoats();
  if(name==='crew') renderCrew();
  if(name==='profile') renderProfileScreen();
  if(name==='resume') renderResume();
  if(name==='gallery') renderGallery();
  if(name==='active' && liveLeafletMap){
    // Leaflet sizes itself incorrectly if it was updated while its container was
    // hidden behind another screen (backgrounded journey) — fix it up now that
    // it's visible again.
    setTimeout(()=>{ liveLeafletMap.invalidateSize(); if(currentTrip && currentTrip.path.length) updateLiveLeafletTrack(currentTrip.path); }, 50);
  }
  updateRecordingBanner(name);
}
// Shows/hides the "🔴 Recording" banner above the bottom nav whenever a journey,
// manual entry, or edit is in progress and you've navigated away from the active
// screen (backgrounded, not stopped). Text and pulsing dot vary by what kind of
// entry is in flight.
function updateRecordingBanner(currentScreen){
  const banner = document.getElementById('recordingBanner');
  const show = !!currentTrip && currentScreen!=='active';
  banner.classList.toggle('show', show);
  banner.querySelector('.dot').style.display = (show && !currentTrip.isManual) ? 'block' : 'none';
  document.getElementById('recordingBannerTime').style.display = (show && !currentTrip.isManual) ? 'block' : 'none';
  if(show){
    const boat = state.boats.find(b=>b.id===currentTrip.boatId);
    if(currentTrip.isEditing){
      document.getElementById('recordingBannerText').textContent = t('banner.unsavedEdits');
    } else if(currentTrip.isManual){
      document.getElementById('recordingBannerText').textContent = t('banner.unsavedPastSail');
    } else {
      document.getElementById('recordingBannerText').textContent = boat ? t('banner.recordingBoat', {boat: boat.name}) : t('banner.recordingJourney');
    }
  }
}
function showToast(msg){
  const toastEl = document.getElementById('toast'); toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 2200);
}
function closeSheets(fromPopState){
  // Sheets (modals) are just divs toggled between display:none/block — hiding "all of them"
  // is simplest since only one is ever open at a time anyway.
  const wasOpen = [...document.querySelectorAll('.sheet')].some(s=>s.style.display==='block');
  document.querySelectorAll('.sheet').forEach(s=>s.style.display='none');
  document.getElementById('overlay').classList.remove('active');
  crewPickerActive = false;
  // Pop the history entry the open sheet was holding — but only when WE'RE
  // the ones closing it (a Cancel/Save/backdrop tap). If this close is a
  // reaction to the back button (fromPopState), the browser already moved
  // back on its own; calling history.back() again here would skip an extra
  // entry and throw the back-stack out of sync.
  if(wasOpen && !fromPopState){
    ignoreNextPopState = true;
    history.back();
  }
}
function openSheet(id){
  const wasSheetOpen = [...document.querySelectorAll('.sheet')].some(s=>s.style.display==='block');
  document.querySelectorAll('.sheet').forEach(s=>s.style.display='none');
  document.getElementById(id).style.display='block';
  document.getElementById('overlay').classList.add('active');
  // Swapping from one sheet straight to another (e.g. the photo adjuster
  // returning to the boat/crew sheet it was opened from) replaces the
  // current history entry rather than stacking a new one — otherwise each
  // hop through a chain of sheets would need its own extra back-press to
  // fully back out of, even though only one sheet is ever visible at a time.
  const state = {type:'sheet', id};
  if(wasSheetOpen){
    history.replaceState(state, '', location.href);
  } else {
    history.pushState(state, '', location.href);
  }
}

/* ---------- Android back-button integration ----------
   A PWA has no navigation history by default, so the phone's back button
   just exits the app immediately — this is what was happening. nav() and
   openSheet() above push a history entry per screen/sheet; this listener
   uses those entries to step back through the app instead, and only once
   you're back at Home with nothing open does a further back press fall
   through to actually exiting, which is the expected behavior.
   ignoreNextPopState suppresses the popstate our OWN history.back() call
   (from closeSheets) generates, so we don't double-handle it. ---------- */
let ignoreNextPopState = false;
window.addEventListener('popstate', (event)=>{
  if(ignoreNextPopState){ ignoreNextPopState = false; return; }
  const sheetOpen = [...document.querySelectorAll('.sheet')].some(s=>s.style.display==='block');
  if(sheetOpen){
    closeSheets(true);
  } else {
    const target = (event.state && event.state.type==='screen') ? event.state.name : 'home';
    nav(target, true);
  }
});

/* ---------- image resize helper (keeps localStorage payloads small) ---------- */
function resizeImage(file, maxDim, quality){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=>reject(new Error('read failed'));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=>reject(new Error('decode failed'));
      img.onload = ()=>{
        let w=img.width, h=img.height;
        if(w>h && w>maxDim){ h=Math.round(h*maxDim/w); w=maxDim; }
        else if(h>=w && h>maxDim){ w=Math.round(w*maxDim/h); h=maxDim; }
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/jpeg', quality||0.7));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- photo adjuster: drag to reposition, slider to zoom, used for
   profile avatar & crew photos ---------- */
let adjustState = null; // { naturalImg, naturalW, naturalH, baseScale, baseW, baseH, zoom, left, top, vw, vh, shape, outputW, outputH, target, returnSheetId }
function readFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onerror = ()=>reject(new Error('read failed'));
    r.onload = ()=>resolve(r.result);
    r.readAsDataURL(file);
  });
}
// Opens the crop/zoom sheet for a given file. Loads it at "cover fit" (baseScale)
// so the viewport starts fully covered, centered, with zoom=1.
// opts: { shape:'circle'|'rect', vw, vh, outputW, outputH } — defaults to the
// original 260x260 circular avatar crop if omitted, for profile/crew photos.
// Boats and trip covers pass a wide rect instead (see openBoatPhotoAdjuster /
// openCoverPhotoAdjuster below).
async function openPhotoAdjuster(file, target, returnSheetId, opts){
  if(!file) return;
  let dataUrl;
  try{ dataUrl = await readFileAsDataUrl(file); }
  catch(e){ showToast(t('toast.photoReadFail')); return; }
  startPhotoAdjuster(dataUrl, target, returnSheetId, opts);
}
// Same as openPhotoAdjuster but for a photo that's already a dataURL (e.g. one
// of a trip's existing photos, when picking/cropping a cover) rather than a
// fresh File from a file input.
function startPhotoAdjuster(dataUrl, target, returnSheetId, opts){
  opts = opts || {};
  const shape = opts.shape || 'circle';
  const vw = opts.vw || 260, vh = opts.vh || 260;
  const outputW = opts.outputW || 500, outputH = opts.outputH || 500;
  const img = new Image();
  img.onload = ()=>{
    const baseScale = Math.max(vw/img.naturalWidth, vh/img.naturalHeight);
    const baseW = img.naturalWidth*baseScale, baseH = img.naturalHeight*baseScale;
    adjustState = {
      naturalImg:img, naturalW:img.naturalWidth, naturalH:img.naturalHeight,
      baseScale, baseW, baseH, zoom:1,
      left:(vw-baseW)/2, top:(vh-baseH)/2,
      vw, vh, shape, outputW, outputH, target, returnSheetId: returnSheetId||null
    };
    const vp = document.getElementById('adjustViewport');
    vp.style.width = vw+'px'; vp.style.height = vh+'px';
    vp.style.borderRadius = shape==='circle' ? '50%' : '14px';
    vp.style.maxWidth = '100%';
    document.getElementById('adjustPreviewImg').src = dataUrl;
    document.getElementById('adjustZoomSlider').value = 1;
    renderAdjustTransform();
    openSheet('sheetPhotoAdjust');
    setupAdjustDrag();
  };
  img.onerror = ()=> showToast(t('toast.photoReadFail'));
  img.src = dataUrl;
}
// Applies the current zoom/position to the actual <img> element in the viewport —
// pure display, no math beyond what's already stored on adjustState.
function renderAdjustTransform(){
  const s = adjustState; if(!s) return;
  const el = document.getElementById('adjustPreviewImg');
  const dispW = s.baseW*s.zoom, dispH = s.baseH*s.zoom;
  el.style.width = dispW+'px'; el.style.height = dispH+'px';
  el.style.left = s.left+'px'; el.style.top = s.top+'px';
}
// Keeps the image from being dragged/zoomed so far that it no longer covers the
// full viewport (i.e. no empty gaps at the edges) — works for circle or rect.
function clampAdjustPosition(){
  const s = adjustState; if(!s) return;
  const dispW = s.baseW*s.zoom, dispH = s.baseH*s.zoom;
  const minLeft = s.vw-dispW, minTop = s.vh-dispH;
  s.left = Math.min(0, Math.max(minLeft, s.left));
  s.top = Math.min(0, Math.max(minTop, s.top));
}
function onAdjustZoomInput(){
  if(!adjustState) return;
  adjustState.zoom = parseFloat(document.getElementById('adjustZoomSlider').value)||1;
  clampAdjustPosition();
  renderAdjustTransform();
}
// Pointer-drag panning — Pointer Events cover mouse, touch, and pen in one
// listener set, so this works the same on desktop and phone.
function setupAdjustDrag(){
  const vp = document.getElementById('adjustViewport');
  if(vp._adjustBound) return; // only wire listeners once, state resets via adjustState
  vp._adjustBound = true;
  let dragging=false, startX=0, startY=0, startLeft=0, startTop=0;
  vp.addEventListener('pointerdown', (e)=>{
    if(!adjustState) return;
    dragging=true; startX=e.clientX; startY=e.clientY;
    startLeft=adjustState.left; startTop=adjustState.top;
    vp.setPointerCapture(e.pointerId);
  });
  vp.addEventListener('pointermove', (e)=>{
    if(!dragging || !adjustState) return;
    adjustState.left = startLeft + (e.clientX-startX);
    adjustState.top = startTop + (e.clientY-startY);
    clampAdjustPosition();
    renderAdjustTransform();
  });
  const endDrag = ()=>{ dragging=false; };
  vp.addEventListener('pointerup', endDrag);
  vp.addEventListener('pointercancel', endDrag);
}
function cancelPhotoAdjust(){
  const returnTo = adjustState?.returnSheetId;
  adjustState = null;
  if(returnTo) openSheet(returnTo); else closeSheets();
}
// Renders the final crop to a canvas and saves it. The math converts from
// "displayed viewport pixels" back to "original photo pixels" using k (the
// combined cover-fit + zoom scale factor), then crops exactly what's visible
// in the viewport into a fixed-size output image (outputW x outputH — square
// for avatars, wide for boat/cover photos).
async function confirmPhotoAdjust(){
  const s = adjustState; if(!s) return;
  const k = s.baseScale*s.zoom; // displayed px per natural px
  const srcX = (0 - s.left)/k, srcY = (0 - s.top)/k;
  const srcW = s.vw/k, srcH = s.vh/k;
  const c = document.createElement('canvas'); c.width=s.outputW; c.height=s.outputH;
  c.getContext('2d').drawImage(s.naturalImg, srcX, srcY, srcW, srcH, 0, 0, s.outputW, s.outputH);
  const dataUrl = c.toDataURL('image/jpeg', 0.85);

  if(s.target==='profile'){
    state.profile.avatar = dataUrl;
    await storeSet(KEYS.PROFILE, state.profile);
    refreshAvatars();
    showToast(t('toast.photoUpdated'));
  } else if(s.target==='crew'){
    pendingCrewPhoto = dataUrl;
    document.getElementById('crewPhotoPreview').src = dataUrl;
  } else if(s.target==='boat'){
    pendingBoatPhotos.push(dataUrl);
    if(!pendingBoatPhoto) pendingBoatPhoto = dataUrl; // first photo added becomes the default automatically
    renderBoatPhotoStrip();
    if(pendingBoatFilesQueue.length){
      adjustState = null;
      continueBoatPhotoQueue();
      return; // stay on the adjuster for the next queued photo instead of returning to sheetBoat yet
    }
  } else if(s.target==='cover'){
    currentTrip.coverPhoto = dataUrl;
  }
  const returnTo = s.returnSheetId;
  adjustState = null;
  if(returnTo) openSheet(returnTo); else closeSheets();
}

/* ============================================================
   HOME
   ============================================================ */

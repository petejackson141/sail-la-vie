// ===== state-core.js =====
// Global app state object, boot(), nav()/screen switching, action sheets, wake lock, photo resize + crop/adjust tool
// Extracted from the original single-file app.js, lines 1470-1776, in original order.

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
let lastFixTime = null;
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
  greet();

  const resumed = await resumeActiveTripIfAny();
  if(!resumed) nav('home');
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
   shows the matching .screen div and hides the rest. No URL/history involved. ---------- */
function nav(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.navitem').forEach(n=>n.classList.toggle('active', n.dataset.tab===name));
  window.scrollTo(0,0);
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
function closeSheets(){
  // Sheets (modals) are just divs toggled between display:none/block — hiding "all of them"
  // is simplest since only one is ever open at a time anyway.
  document.querySelectorAll('.sheet').forEach(s=>s.style.display='none');
  document.getElementById('overlay').classList.remove('active');
  crewPickerActive = false;
}
function openSheet(id){
  document.querySelectorAll('.sheet').forEach(s=>s.style.display='none');
  document.getElementById(id).style.display='block';
  document.getElementById('overlay').classList.add('active');
}

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

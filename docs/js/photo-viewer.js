// ===== photo-viewer.js =====
// The full-screen photo viewer (Gallery, sail pages, profile photos): swipe
// between photos, pinch or double-tap to zoom, share or delete a photo.
// Split out of the old pdf-export.js on 30.10.2026 - nothing else changed.

/* ---------- photo lightbox — swipe between photos, pinch / double-tap to zoom ---------- */
function openTripCoverLightbox(){
  const trip = window._detailTrip;
  if(!trip || !trip.coverPhoto) return;
  const photos = (trip.photos && trip.photos.length) ? trip.photos : [trip.coverPhoto];
  const idx = Math.max(0, photos.indexOf(trip.coverPhoto));
  openLightbox(photos, idx, window._friendDetail ? null : trip.id); // no photo delete on a friend's sail
}
function openTripPhotoLightbox(i){
  const trip = window._detailTrip;
  if(!trip || !trip.photos) return;
  openLightbox(trip.photos, i, window._friendDetail ? null : trip.id); // no photo delete on a friend's sail
}
let lightboxPhotos = [];
let lightboxIndex = 0;
// Set only when the lightbox is showing a trip's own photo set (trip detail or
// the Gallery) — this is what gates the delete button and tells it which trip
// record to save back to. Left null for contexts with nothing to delete, like
// the single manually-uploaded map image opened from the trip detail screen.
let lightboxTripId = null;
function openLightbox(photos, index, tripId){
  lightboxPhotos = (photos||[]).filter(Boolean);
  lightboxIndex = Math.max(0, Math.min(index||0, lightboxPhotos.length-1));
  lightboxTripId = tripId || null;
  const box = document.getElementById('photoLightbox');
  // The viewer takes a history entry, like sheets and screens do, so the phone's back
  // button/gesture closes the viewer first instead of going back a screen behind it.
  if(!box.classList.contains('show')) history.pushState({type:'lightbox'}, '', location.href);
  box.classList.add('show');
  renderLightboxImage();
}
// (Re)draws the three slides (previous / current / next photo), puts the strip back
// in its resting position and resets any zoom. Called on open, after a swipe
// completes, and after a delete.
function renderLightboxImage(){
  const setImg = (id, src)=>{
    const img = document.getElementById(id);
    if(src){ img.src = src; img.style.visibility = 'visible'; }
    else { img.removeAttribute('src'); img.style.visibility = 'hidden'; }
  };
  setImg('lightboxImgPrev', lightboxPhotos[lightboxIndex-1]);
  setImg('lightboxImg',     lightboxPhotos[lightboxIndex]);
  setImg('lightboxImgNext', lightboxPhotos[lightboxIndex+1]);
  lightboxResetView();
  const multi = lightboxPhotos.length > 1;
  const counter = document.getElementById('lightboxCounter');
  counter.textContent = multi ? (lightboxIndex+1)+' / '+lightboxPhotos.length : '';
  const deleteBtn = document.getElementById('lightboxDeleteBtn');
  if(deleteBtn) deleteBtn.style.display = lightboxTripId ? 'flex' : 'none';
}
// Slide to the previous (-1) / next (+1) photo. Stops at the first/last photo
// (the strip just springs back) rather than wrapping round.
function lightboxStep(dir){
  const ni = lightboxIndex + dir;
  if(LB.busy || ni < 0 || ni >= lightboxPhotos.length){ lbSetTrack(0, true); return; }
  LB.busy = true;
  lbSetTrack(-dir * document.getElementById('lightboxStage').clientWidth, true);
  setTimeout(()=>{ lightboxIndex = ni; LB.busy = false; renderLightboxImage(); }, 230);
}
function lightboxPrev(){ lightboxStep(-1); }
function lightboxNext(){ lightboxStep(1); }
// fromPopState = true when this close is the reaction to the back button (the browser has
// already stepped back, so we must not call history.back() a second time) — same rule as closeSheets().
function closeLightbox(fromPopState){
  const box = document.getElementById('photoLightbox');
  const wasOpen = box.classList.contains('show');
  box.classList.remove('show');
  lightboxPhotos = []; lightboxIndex = 0; lightboxTripId = null;
  lightboxResetView();
  if(wasOpen && fromPopState !== true){
    ignoreNextPopState = true;
    history.back();
  }
}
// Deletes the photo currently shown in the lightbox from its trip record —
// confirms first (matching deleteTripPrompt/deleteBoatForm/deleteCrewForm
// elsewhere in the app), then updates storage, the in-memory tripIndex, and
// whichever screen (trip detail or Gallery) is currently showing it.
async function deleteLightboxPhoto(){
  if(!lightboxTripId || !lightboxPhotos.length) return;
  if(!(await confirmDialog('deletePhoto', {danger:true, icon:'trash'}))) return;
  const photoToDelete = lightboxPhotos[lightboxIndex];
  const tripId = lightboxTripId;
  const trip = await storeGet('trip:'+tripId);
  if(!trip){ showToast(t('toast.tripLoadFail')); return; }

  const photoIdx = (trip.photos||[]).indexOf(photoToDelete);
  if(photoIdx>=0) trip.photos.splice(photoIdx,1);
  if(trip.coverPhoto===photoToDelete) trip.coverPhoto = trip.photos[0] || null;
  // Newer timestamp + push, so the deletion reaches your other devices too
  // (before, a deleted photo stayed in the cloud copy of the sail).
  trip.updatedAt = new Date().toISOString();

  const ok = await storeSet('trip:'+tripId, trip);
  if(!ok){ showToast(t('toast.saveFailed')); return; }
  const idxEntry = state.tripIndex.find(t=>t.id===tripId);
  if(idxEntry){ idxEntry.hasPhotos = trip.photos.length>0; idxEntry.coverPhoto = trip.coverPhoto; }
  await storeSet(KEYS.INDEX, state.tripIndex);
  showToast(t('toast.photoDeleted'));
  syncTripIfSignedIn(trip);
  // Remove the file from cloud storage as well, unless the sail still uses it.
  if(isPhotoRef(photoToDelete) && trip.coverPhoto !== photoToDelete && !trip.photos.includes(photoToDelete)){
    deleteStoredPhotos([photoToDelete]);
  }

  lightboxPhotos.splice(lightboxIndex,1);
  if(!lightboxPhotos.length){
    closeLightbox();
  } else {
    lightboxIndex = Math.min(lightboxIndex, lightboxPhotos.length-1);
    renderLightboxImage();
  }

  if(window._detailTrip && window._detailTrip.id===tripId) openTripDetail(tripId);
  const galleryScreen = document.getElementById('screen-gallery');
  if(galleryScreen && galleryScreen.classList.contains('active')) renderGallery();
}
async function shareLightboxPhoto(){
  const url = lightboxPhotos[lightboxIndex];
  if(!url) return;
  try{
    let blob;
    if(isPhotoRef(url)){
      blob = await getPhotoBlob(url);
      if(!blob){ showToast(t('toast.photoReadFail')); return; }
    } else {
      const res = await fetch(url);
      blob = await res.blob();
    }
    await shareOrDownloadFile(blob, 'sail-la-vie-photo.jpg', blob.type||'image/jpeg', 'Sail la Vie Photo', 'toast.photoDownloaded');
  }catch(e){
    if(e && e.name==='AbortError') return; // user cancelled the native share sheet
    console.error('share failed', e);
    showToast(t('toast.pdfGenFail'));
  }
}
/* ---------- lightbox gestures ----------
   One pointer-events handler on the stage covers everything (no arrows needed):
     • one finger at normal size  -> drag the strip; release past ~18% of the
       screen width (or with a quick flick) to move to the next/previous photo
     • pinch (two fingers) or mouse wheel -> zoom 1×–6× around the fingers
     • double-tap -> toggle between fit and 2.5× zoom at the tapped spot
     • one finger while zoomed -> pan the photo (kept inside its edges)
     • tap on the dark background at normal size -> close
   LB holds the live gesture state; lbApplyImg()/lbSetTrack() write it to the DOM. */
const LB = { scale:1, tx:0, ty:0, pts:new Map(), mode:null, moved:false, onImg:false, busy:false,
             startX:0, startY:0, startT:0, startTx:0, startTy:0, pinch:null, lastTap:{t:0,x:0,y:0} };
const LB_MAX_SCALE = 6, LB_DOUBLE_TAP_SCALE = 2.5;
function lbEls(){ return { stage:document.getElementById('lightboxStage'), track:document.getElementById('lightboxTrack'), img:document.getElementById('lightboxImg') }; }
function lbApplyImg(animate){
  const {img} = lbEls();
  img.style.transition = animate ? 'transform .2s ease' : 'none';
  img.style.transform = 'translate3d('+LB.tx+'px,'+LB.ty+'px,0) scale('+LB.scale+')';
}
function lbSetTrack(x, animate){
  const {track} = lbEls();
  track.style.transition = animate ? 'transform .23s ease' : 'none';
  track.style.transform = 'translate3d('+x+'px,0,0)';
}
function lightboxResetView(){
  LB.scale = 1; LB.tx = 0; LB.ty = 0; LB.pts.clear(); LB.mode = null; LB.pinch = null;
  lbApplyImg(false); lbSetTrack(0, false);
}
// Centre of the current photo as if it were unzoomed and unmoved (scaling happens about it).
function lbCenter(){
  const r = lbEls().img.getBoundingClientRect();
  return { x: r.left + r.width/2 - LB.tx, y: r.top + r.height/2 - LB.ty };
}
// How far the zoomed photo may be dragged before its edge would pass the screen edge.
function lbClampT(scale, tx, ty){
  const {stage, img} = lbEls(), st = stage.getBoundingClientRect();
  const mx = Math.max(0, (img.offsetWidth*scale  - st.width )/2);
  const my = Math.max(0, (img.offsetHeight*scale - st.height)/2);
  return { tx: Math.min(mx, Math.max(-mx, tx)), ty: Math.min(my, Math.max(-my, ty)) };
}
// Zoom to newScale keeping the point (px,py) — a finger or the cursor — fixed on screen.
function lbZoomAt(newScale, px, py, base){
  const b = base || {s:LB.scale, tx:LB.tx, ty:LB.ty, px, py};
  const c = lbCenter();
  LB.scale = newScale;
  LB.tx = (px - c.x) - (newScale / b.s) * (b.px - c.x - b.tx);
  LB.ty = (py - c.y) - (newScale / b.s) * (b.py - c.y - b.ty);
}
function lbSettle(){ // after a pinch/zoom ends: snap back to fit if barely zoomed, else keep inside the edges
  if(LB.scale < 1.05){ LB.scale = 1; LB.tx = 0; LB.ty = 0; }
  else { const c = lbClampT(LB.scale, LB.tx, LB.ty); LB.tx = c.tx; LB.ty = c.ty; }
  lbApplyImg(true);
}
function lbDoubleTap(x, y){
  if(LB.scale > 1){ LB.scale = 1; LB.tx = 0; LB.ty = 0; }
  else { lbZoomAt(LB_DOUBLE_TAP_SCALE, x, y, {s:1, tx:0, ty:0, px:x, py:y}); const c = lbClampT(LB.scale, LB.tx, LB.ty); LB.tx = c.tx; LB.ty = c.ty; }
  lbApplyImg(true);
}
(function setupLightboxGestures(){
  const stage = document.getElementById('lightboxStage');
  const isOpen = ()=> document.getElementById('photoLightbox').classList.contains('show');

  stage.addEventListener('pointerdown', e=>{
    if(!isOpen() || LB.busy) return;
    try{ stage.setPointerCapture(e.pointerId); }catch(_){}
    LB.pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(LB.pts.size === 1){
      LB.onImg = e.target.tagName === 'IMG';
      LB.startX = e.clientX; LB.startY = e.clientY; LB.startT = Date.now();
      LB.startTx = LB.tx; LB.startTy = LB.ty; LB.moved = false;
      LB.mode = LB.scale > 1 ? 'pan' : 'swipe';
    } else if(LB.pts.size === 2){
      const [a, b] = [...LB.pts.values()];
      LB.pinch = { d: Math.hypot(a.x-b.x, a.y-b.y) || 1, s: LB.scale, tx: LB.tx, ty: LB.ty, px: (a.x+b.x)/2, py: (a.y+b.y)/2 };
      LB.mode = 'pinch'; LB.moved = true;
      lbSetTrack(0, true); // a half-finished swipe snaps back before zooming
    }
  });

  stage.addEventListener('pointermove', e=>{
    if(!LB.pts.has(e.pointerId)) return;
    LB.pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(LB.mode === 'pinch' && LB.pts.size >= 2){
      const [a, b] = [...LB.pts.values()];
      const d = Math.hypot(a.x-b.x, a.y-b.y) || 1;
      const s = Math.min(LB_MAX_SCALE, Math.max(0.8, LB.pinch.s * d / LB.pinch.d));
      lbZoomAt(s, (a.x+b.x)/2, (a.y+b.y)/2, {s:LB.pinch.s, tx:LB.pinch.tx, ty:LB.pinch.ty, px:LB.pinch.px, py:LB.pinch.py});
      lbApplyImg(false);
    } else if(LB.mode === 'pan'){
      const dx = e.clientX - LB.startX, dy = e.clientY - LB.startY;
      if(!LB.moved && Math.hypot(dx, dy) < 6) return;
      LB.moved = true;
      const c = lbClampT(LB.scale, LB.startTx + dx, LB.startTy + dy);
      LB.tx = c.tx; LB.ty = c.ty; lbApplyImg(false);
    } else if(LB.mode === 'swipe'){
      const dx = e.clientX - LB.startX, dy = e.clientY - LB.startY;
      if(!LB.moved && Math.hypot(dx, dy) < 8) return;
      LB.moved = true;
      const atEnd = (dx > 0 && lightboxIndex === 0) || (dx < 0 && lightboxIndex === lightboxPhotos.length-1);
      lbSetTrack(atEnd ? dx * 0.3 : dx, false); // stiff resistance at the first/last photo
    }
  });

  const finish = (e, cancelled)=>{
    if(!LB.pts.has(e.pointerId)) return;
    LB.pts.delete(e.pointerId);
    if(LB.mode === 'pinch'){
      if(LB.pts.size === 0){ lbSettle(); LB.mode = null; }
      else if(LB.pts.size === 1){ // one finger stays down: carry on as a pan from where it is
        const [p] = [...LB.pts.values()];
        lbSettle();
        LB.startX = p.x; LB.startY = p.y; LB.startTx = LB.tx; LB.startTy = LB.ty; LB.moved = true;
        LB.mode = LB.scale > 1 ? 'pan' : null;
      }
      return;
    }
    if(LB.pts.size > 0) return;
    const mode = LB.mode; LB.mode = null;
    const dx = e.clientX - LB.startX, dt = Math.max(1, Date.now() - LB.startT);
    if(mode === 'swipe'){
      if(cancelled){ lbSetTrack(0, true); return; }
      if(!LB.moved){ lbTap(e); return; }
      const w = stage.clientWidth;
      if(Math.abs(dx) > w * 0.18 || (Math.abs(dx) > 30 && Math.abs(dx) / dt > 0.5)) lightboxStep(dx < 0 ? 1 : -1);
      else lbSetTrack(0, true);
    } else if(mode === 'pan'){
      if(!cancelled && !LB.moved) lbTap(e);
    }
  };
  stage.addEventListener('pointerup',     e=>finish(e, false));
  stage.addEventListener('pointercancel', e=>finish(e, true));

  // A tap that didn't move: second tap within 300 ms = zoom toggle; on the dark
  // background (not the photo) at normal size = close the viewer.
  function lbTap(e){
    const now = Date.now(), L = LB.lastTap;
    if(now - L.t < 300 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 30){
      LB.lastTap = {t:0, x:0, y:0};
      lbDoubleTap(e.clientX, e.clientY);
      return;
    }
    LB.lastTap = {t:now, x:e.clientX, y:e.clientY};
    if(!LB.onImg && LB.scale === 1) closeLightbox();
  }

  // Desktop: mouse wheel / trackpad zooms around the cursor.
  stage.addEventListener('wheel', e=>{
    if(!isOpen()) return;
    e.preventDefault();
    const s = Math.min(LB_MAX_SCALE, Math.max(1, LB.scale * Math.exp(-e.deltaY * 0.0025)));
    if(s === LB.scale) return;
    lbZoomAt(s, e.clientX, e.clientY);
    if(s < 1.02){ LB.scale = 1; LB.tx = 0; LB.ty = 0; }
    else { const c = lbClampT(LB.scale, LB.tx, LB.ty); LB.tx = c.tx; LB.ty = c.ty; }
    lbApplyImg(false);
  }, {passive:false});

  document.addEventListener('keydown', e=>{
    if(!isOpen()) return;
    if(e.key === 'ArrowLeft') lightboxPrev();
    else if(e.key === 'ArrowRight') lightboxNext();
    else if(e.key === 'Escape') closeLightbox();
  });
})();

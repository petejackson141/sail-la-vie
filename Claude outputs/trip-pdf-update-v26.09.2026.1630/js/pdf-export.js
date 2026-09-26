// ===== pdf-export.js =====
// PDF theme templates and HTML builders for trip PDFs, PDF generation/sharing, photo lightbox viewer
// Extracted from the original single-file app.js, lines 3611-4514, in original order.

function hexToRgbTuple(hex){
  const h = (hex||'#ffffff').replace('#','');
  const n = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
// Templates, page layout, preview and export for the trip PDF now live in
// js/trip-pdf.js. This file keeps the shared drawing helpers below, the
// file share/download helper and the photo lightbox.

/* ---------- Nautical Magazine theme ----------
   Ported 1:1 (grid numbers included) from the reportlab poster mockup:
   a 612x918 "page", navy/gold/cream palette, compass-rose motif, magazine
   masthead layout. See .pdf-theme-nautical rules in <style>. */
function navCompassSvg(size, ringColor, needleColor, labelColor){
  const r = size/2, lc = labelColor || ringColor;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;">
    <circle cx="${r}" cy="${r}" r="${r-1.5}" fill="none" stroke="${ringColor}" stroke-width="1.4"/>
    <circle cx="${r}" cy="${r}" r="${(r-1.5)*0.78}" fill="none" stroke="${ringColor}" stroke-width="1.1"/>
    <text x="${r}" y="${r-r*0.58}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${r*0.30}" fill="${lc}">N</text>
    <text x="${r}" y="${r+r*0.72}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${r*0.26}" fill="${lc}">S</text>
    <text x="${r+r*0.64}" y="${r+r*0.10}" text-anchor="start" font-family="Georgia,serif" font-weight="700" font-size="${r*0.24}" fill="${lc}">E</text>
    <text x="${r-r*0.64}" y="${r+r*0.10}" text-anchor="end" font-family="Georgia,serif" font-weight="700" font-size="${r*0.24}" fill="${lc}">W</text>
    <g fill="${needleColor}">
      <path d="M ${r} ${r} L ${r-r*0.13} ${r-r*0.13} L ${r} ${r-r*0.62} L ${r+r*0.13} ${r-r*0.13} Z"/>
      <path d="M ${r} ${r} L ${r+r*0.13} ${r-r*0.13} L ${r+r*0.62} ${r} L ${r+r*0.13} ${r+r*0.13} Z"/>
      <path d="M ${r} ${r} L ${r+r*0.13} ${r+r*0.13} L ${r} ${r+r*0.62} L ${r-r*0.13} ${r+r*0.13} Z"/>
      <path d="M ${r} ${r} L ${r-r*0.13} ${r+r*0.13} L ${r-r*0.62} ${r} L ${r-r*0.13} ${r-r*0.13} Z"/>
      <circle cx="${r}" cy="${r}" r="${r*0.09}"/>
    </g>
  </svg>`;
}
const PDF_ICON_SVG = {
  wind: `<svg viewBox="0 0 20 20" width="12" height="12"><path d="M2 7h10a3 3 0 1 0-2.5-4.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M2 12h13a2.6 2.6 0 1 1-2.2 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  wave: `<svg viewBox="0 0 20 20" width="12" height="12"><path d="M1 10c2-3 4-3 6 0s4 3 6 0 4-3 6 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  thermo: `<svg viewBox="0 0 20 20" width="12" height="12"><rect x="8" y="2" width="4" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="15" r="3.2" fill="currentColor"/></svg>`,
  calendar: `<svg viewBox="0 0 20 20" width="13" height="13"><rect x="2" y="4" width="16" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="2" y1="8.5" x2="18" y2="8.5" stroke="currentColor" stroke-width="1.4"/><line x1="6" y1="2" x2="6" y2="5.5" stroke="currentColor" stroke-width="1.4"/><line x1="14" y1="2" x2="14" y2="5.5" stroke="currentColor" stroke-width="1.4"/></svg>`,
  clock: `<svg viewBox="0 0 20 20" width="13" height="13"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="10" y1="10" x2="10" y2="5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="10" y1="10" x2="13.5" y2="11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  pin: `<svg viewBox="0 0 20 24" width="13" height="15"><path d="M10 0a7 7 0 0 0-7 7c0 5.2 7 15 7 15s7-9.8 7-15a7 7 0 0 0-7-7z" fill="currentColor"/><circle cx="10" cy="7" r="2.6" fill="#F8F4EE"/></svg>`,
  gauge: `<svg viewBox="0 0 20 20" width="14" height="14"><path d="M3 15A7 7 0 0 1 17 15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><line x1="10" y1="15" x2="14" y2="9.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  anchor: `<svg viewBox="0 0 20 20" width="15" height="15"><circle cx="10" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="10" y1="6" x2="10" y2="16" stroke="currentColor" stroke-width="1.4"/><line x1="5" y1="9" x2="15" y2="9" stroke="currentColor" stroke-width="1.4"/><path d="M4 12a6 6 0 0 0 5 6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M16 12a6 6 0 0 1-5 6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
  heart: `<svg viewBox="0 0 20 20" width="11" height="11"><path d="M10 17s-6.5-4.35-8.5-8.1C0.2 6.2 2 3 5.3 3c1.9 0 3.3 1.05 4.2 2.55C10.4 4.05 11.8 3 13.7 3 17 3 18.8 6.2 18.5 8.9 16.5 12.65 10 17 10 17z" fill="currentColor"/></svg>`,
  star: `<svg viewBox="0 0 20 20" width="10" height="10"><path d="M10 1l2.4 6.2 6.6.4-5.2 4.2 1.8 6.4L10 14.6 4.4 18.2l1.8-6.4L1 7.6l6.6-.4z" fill="currentColor"/></svg>`,
};
// Anchor glyph at an arbitrary pixel size, for badge interiors (PDF_ICON_SVG.anchor
// is fixed at 15px, too small for a ~70-84px badge disc).
function pdfAnchorSvgSized(size, color, lw){
  lw = lw || Math.max(1.1, size*0.045);
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:block;">
    <circle cx="10" cy="4" r="2" fill="none" stroke="${color}" stroke-width="${lw}"/>
    <line x1="10" y1="6" x2="10" y2="16" stroke="${color}" stroke-width="${lw}"/>
    <line x1="5" y1="9" x2="15" y2="9" stroke="${color}" stroke-width="${lw}"/>
    <path d="M4 12a6 6 0 0 0 5 6" fill="none" stroke="${color}" stroke-width="${lw}"/>
    <path d="M16 12a6 6 0 0 1-5 6" fill="none" stroke="${color}" stroke-width="${lw}"/>
  </svg>`;
}
// Splits a title "Just The Two Of Us" into a first-word / rest-of-title pair,
// same convention as the Minimalist Yacht Club reportlab mockup.
function yachtSplitTitle(title){
  const words = (title||'').trim().split(/\s+/).filter(Boolean);
  if(words.length<=1) return {line1: words.join(' ').toUpperCase(), line2:''};
  return {line1: words[0].toUpperCase(), line2: words.slice(1).join(' ').toUpperCase()};
}
// Splits a title into a script "lead" (first two words) + bold "main"
// (remaining words), same convention as the Memory Page reportlab mockup.
function memorySplitTitle(title){
  const words = (title||'').trim().split(/\s+/).filter(Boolean);
  if(words.length<=2) return {lead:'', main: words.join(' ').toUpperCase()};
  return {lead: words.slice(0,2).join(' '), main: words.slice(2).join(' ').toUpperCase()};
}
// Repeating gold wave motif for the Memory Page hero's bottom edge — a single
// wide inline SVG (not a CSS data-uri background) so html2canvas rasterizes
// it reliably.
function pdfWaveStripSvg(totalW, h, color){
  const period = 32, cycles = Math.ceil(totalW/period)+1;
  let d = `M0 ${h*0.5}`;
  for(let i=0;i<cycles;i++){
    const x0 = i*period;
    d += ` Q ${x0+period*0.25} ${h*0.05} ${x0+period*0.5} ${h*0.5} T ${x0+period} ${h*0.5}`;
  }
  return `<svg width="${totalW}" height="${h}" viewBox="0 0 ${totalW} ${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}
// Waits for every <img> inside a container to finish loading AND decoding
// before we measure or rasterize it. Without this, html2canvas can snapshot
// mid-load images at the wrong size (or blank), which is what produced the
// inconsistent photo sizes people saw after the PDF was re-opened/re-rendered
// by WhatsApp's own preview — the capture, not the sharing step, was the bug.
function waitForImagesToLoad(container){
  const imgs = Array.from(container.querySelectorAll('img'));
  const imgPromises = imgs.map(img=>{
    if(img.complete && img.naturalWidth>0){
      return img.decode ? img.decode().catch(()=>{}) : Promise.resolve();
    }
    return new Promise(resolve=>{
      const done = ()=>{ img.removeEventListener('load',done); img.removeEventListener('error',done); resolve(); };
      img.addEventListener('load',done);
      img.addEventListener('error',done);
    }).then(()=> img.decode ? img.decode().catch(()=>{}) : Promise.resolve());
  });

  // The map screenshot (trip.mapImage) is set via a CSS background-image
  // rather than an <img> (see js/trip-pdf.js), so it's invisible to
  // the querySelectorAll('img') above. There's no load/decode event for
  // background-images, so preload the same URL through an offscreen Image
  // object instead — once THAT decodes, the browser has it cached and
  // html2canvas paints the real background-image synchronously from cache.
  const bgEls = Array.from(container.querySelectorAll('[style*="background-image"]'));
  const bgPromises = bgEls.map(el=>{
    const m = /url\(['"]?(.*?)['"]?\)/.exec(el.style.backgroundImage||'');
    if(!m || !m[1]) return Promise.resolve();
    const preload = new Image();
    preload.src = m[1];
    return new Promise(resolve=>{
      if(preload.complete && preload.naturalWidth>0){ resolve(); return; }
      preload.addEventListener('load',resolve);
      preload.addEventListener('error',resolve);
    }).then(()=> preload.decode ? preload.decode().catch(()=>{}) : Promise.resolve());
  });

  return Promise.all([...imgPromises, ...bgPromises]);
}
// Shares/downloads a generated file. Browsers can trigger a real download or
// the Web Share API directly. Inside the native Capacitor app there's no
// browser chrome to hand a download to, so we write the file to the app's
// cache via the Filesystem plugin first, then hand that real on-device file
// off to Android's native share sheet (Save to Files, email, WhatsApp, etc.)
// via the Share plugin. Both plugins are registered on window.Capacitor.Plugins
// once installed + synced — no bundler/import needed for this vanilla-JS app.
async function shareOrDownloadFile(blob, fileName, mimeType, title, downloadedToastKey){
  if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
    const { Filesystem, Share } = window.Capacitor.Plugins;
    const base64Data = await new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const written = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });
    await Share.share({ title: title || fileName, url: written.uri, dialogTitle: title || fileName });
    return;
  }
  const file = new File([blob], fileName, {type: mimeType});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    await navigator.share({files:[file], title});
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast(t(downloadedToastKey || 'toast.pdfDownloaded'));
  }
}


/* ---------- photo lightbox — swipe between photos, pinch / double-tap to zoom ---------- */
function openTripCoverLightbox(){
  const trip = window._detailTrip;
  if(!trip || !trip.coverPhoto) return;
  const photos = (trip.photos && trip.photos.length) ? trip.photos : [trip.coverPhoto];
  const idx = Math.max(0, photos.indexOf(trip.coverPhoto));
  openLightbox(photos, idx, trip.id);
}
function openTripPhotoLightbox(i){
  const trip = window._detailTrip;
  if(!trip || !trip.photos) return;
  openLightbox(trip.photos, i, trip.id);
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

  const ok = await storeSet('trip:'+tripId, trip);
  if(!ok){ showToast(t('toast.saveFailed')); return; }
  const idxEntry = state.tripIndex.find(t=>t.id===tripId);
  if(idxEntry){ idxEntry.hasPhotos = trip.photos.length>0; idxEntry.coverPhoto = trip.coverPhoto; }
  await storeSet(KEYS.INDEX, state.tripIndex);
  showToast(t('toast.photoDeleted'));

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
    const res = await fetch(url);
    const blob = await res.blob();
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

/* ---------- utils ---------- */
function escapeHtml(s){
  return (s||'').toString().replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ---------- units: nautical (kts/NM) <-> metric (km/h/km) ----------
   Canonical storage is always kts/NM. These helpers only affect display
   and the parsing of what the person typed into a distance field. */

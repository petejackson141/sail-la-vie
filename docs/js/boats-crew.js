// ===== boats-crew.js =====
// Boat management (add/edit/delete/photos) and crew management (add/edit/delete/photos)
// Extracted from the original single-file app.js, lines 3123-3302, in original order.

let editingBoatId = null;   // null while adding a new boat, otherwise the id being edited
let pendingBoatPhotos = [];  // all photos for the boat currently being edited/added
let pendingBoatPhoto = null; // which one of pendingBoatPhotos is the default (shown in lists/wherever a single boat photo is needed)
function openBoatSheet(boat){
  editingBoatId = boat ? boat.id : null;
  // Backward compatible with older boats saved before multi-photo support (single `photo` field, no `photos` array)
  pendingBoatPhotos = boat ? (boat.photos && boat.photos.length ? [...boat.photos] : (boat.photo ? [boat.photo] : [])) : [];
  pendingBoatPhoto = boat ? (boat.photo || pendingBoatPhotos[0] || null) : null;
  document.getElementById('boatSheetTitle').textContent = boat ? t('sheet.editBoat') : t('sheet.addBoat');
  document.getElementById('boatName').value = boat ? boat.name : '';
  document.getElementById('boatType').value = boat ? boat.type : '';
  document.getElementById('boatNotes').value = boat ? boat.notes : '';
  document.getElementById('deleteBoatBtn').style.display = boat ? 'flex' : 'none';
  renderBoatPhotoStrip();
  openSheet('sheetBoat');
}
// Boat photos go through the crop/zoom adjuster in rectangular mode (matching
// how they're displayed — a wide thumbnail, not a circle) rather than a plain
// resize. Multiple files (from the upload tile) are queued and adjusted one
// at a time so each gets its own crop.
let pendingBoatFilesQueue = [];
async function handleBoatPhoto(ev){
  const files = Array.from(ev.target.files||[]);
  ev.target.value = '';
  if(!files.length) return;
  pendingBoatFilesQueue = files.slice(1);
  openPhotoAdjuster(files[0], 'boat', 'sheetBoat', {shape:'rect', vw:320, vh:150, outputW:800, outputH:375});
}
// Called by confirmPhotoAdjust() after each boat photo is cropped — if more
// files were queued from a multi-select upload, immediately opens the next one.
function continueBoatPhotoQueue(){
  if(pendingBoatFilesQueue.length){
    const next = pendingBoatFilesQueue.shift();
    openPhotoAdjuster(next, 'boat', 'sheetBoat', {shape:'rect', vw:320, vh:150, outputW:800, outputH:375});
  }
}
// Opens the shared photo lightbox (same swipeable/pinch viewer used by the
// Gallery and trip detail screens) over the boat's current in-progress photo
// set. tripId is left null since these aren't a trip's photos — that also
// keeps the lightbox's delete button hidden here, since removing a boat
// photo goes through removeBoatPhoto()/the strip's own ✕ instead.
function openBoatPhotoLightbox(i){
  openLightbox(pendingBoatPhotos, i, null);
}
function renderBoatPhotoStrip(){
  const strip = document.getElementById('boatPhotoStrip');
  // keep the two add-tiles, remove only the photo thumbs, then re-insert thumbs at the front
  strip.querySelectorAll('.photo-thumb').forEach(n=>n.remove());
  pendingBoatPhotos.forEach((p,i)=>{
    const isDefault = p===pendingBoatPhoto;
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    // Tapping the photo itself opens it fullscreen (swipeable, same viewer as
    // the Gallery); the star sets it as the boat's default photo instead —
    // previously these two actions were combined on a single tap, which
    // meant there was no way to just look at a photo without also changing
    // the default.
    div.innerHTML = `<img src="${p}" onclick="openBoatPhotoLightbox(${i})">
      <div class="setdef${isDefault ? ' is-default' : ''}" onclick="event.stopPropagation();setBoatDefaultPhoto(${i})" title="${t('action.setAsDefault')}">
        <svg viewBox="0 0 24 24" fill="${isDefault ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1z"/></svg>
      </div>
      ${isDefault ? `<div class="cover-badge">${t('sheet.defaultBadge')}</div>` : ''}
      <div class="rm" onclick="event.stopPropagation();removeBoatPhoto(${i})">✕</div>`;
    strip.insertBefore(div, strip.firstChild);
  });
}
function setBoatDefaultPhoto(i){ pendingBoatPhoto = pendingBoatPhotos[i]; renderBoatPhotoStrip(); }
function removeBoatPhoto(i){
  const removed = pendingBoatPhotos[i];
  pendingBoatPhotos.splice(i,1);
  if(pendingBoatPhoto===removed) pendingBoatPhoto = pendingBoatPhotos[0] || null;
  renderBoatPhotoStrip();
}
async function saveBoatForm(){
  const name = document.getElementById('boatName').value.trim();
  if(!name){ showToast(t('toast.giveBoatName')); return; }
  const type = document.getElementById('boatType').value, notes = document.getElementById('boatNotes').value;
  if(editingBoatId){
    const b = state.boats.find(x=>x.id===editingBoatId);
    b.name=name; b.type=type; b.notes=notes; b.photos=[...pendingBoatPhotos]; b.photo=pendingBoatPhoto;
  } else {
    state.boats.push({ id:uid(), name, type, notes, photos:[...pendingBoatPhotos], photo:pendingBoatPhoto });
  }
  const ok = await storeSet(KEYS.BOATS, state.boats);
  if(ok){ showToast(t('toast.boatSaved')); closeSheets(); renderBoats(); syncBoatsCrewIfSignedIn(); }
}
async function deleteBoatForm(){
  if(!confirm(t('confirm.removeBoat'))) return;
  state.boats = state.boats.filter(b=>b.id!==editingBoatId);
  await storeSet(KEYS.BOATS, state.boats);
  closeSheets(); renderBoats();
  syncBoatsCrewIfSignedIn();
}
function renderBoats(){
  const el = document.getElementById('boatsList');
  if(!state.boats.length){
    el.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 16l1.5 4h15L21 16"/><path d="M5 16l1-9h12l1 9"/></svg>
      <h3>${t('boats.emptyTitle')}</h3><p>${t('boats.emptyHint')}</p></div>`;
    return;
  }
  // Alphabetical by name — [...array] copies so .sort() doesn't reorder state.boats itself
  el.innerHTML = [...state.boats].sort((a,b)=>a.name.localeCompare(b.name)).map(b=>{
    const trips = state.tripIndex.filter(trip=>trip.boatId===b.id).length;
    const sailsLabel = trips===1 ? t('boats.sailsSingular',{count:trips}) : t('boats.sailsPlural',{count:trips});
    return `<div class="row-card" onclick='openBoatSheet(${JSON.stringify(b).replace(/'/g,"&apos;")})'>
      <img class="row-photo" src="${b.photo||placeholderAvatar()}">
      <div class="row-info"><div class="name">${escapeHtml(b.name)}</div><div class="sub">${escapeHtml(b.type||'')}${b.type?' · ':''}${sailsLabel}</div></div>
    </div>`;
  }).join('');
}

/* ============================================================
   CREW
   ============================================================ */
let editingCrewId = null;
let pendingCrewPhoto = null;
function openCrewSheet(member){
  editingCrewId = member ? member.id : null;
  pendingCrewPhoto = member ? member.photo : null;
  document.getElementById('crewSheetTitle').textContent = member ? t('sheet.editCrew') : t('active.addCrewTitle');
  document.getElementById('crewName').value = member ? member.name : '';
  document.getElementById('crewPhone').value = member ? (member.phone||'') : '';
  document.getElementById('crewEmail').value = member ? (member.email||'') : '';
  document.getElementById('crewSocial').value = member ? (member.social||'') : '';
  document.getElementById('crewNote').value = member ? member.note : '';
  document.getElementById('crewPhotoPreview').src = pendingCrewPhoto || placeholderAvatar();
  document.getElementById('deleteCrewBtn').style.display = member ? 'flex' : 'none';
  openSheet('sheetCrew');
}
// Photos here go through the crop/zoom adjuster (openPhotoAdjuster), not a
// plain resize — 'sheetCrew' tells the adjuster to return to this sheet when done.
async function handleCrewPhoto(ev){
  const f = ev.target.files[0]; if(!f) return;
  ev.target.value='';
  openPhotoAdjuster(f, 'crew', 'sheetCrew');
}
// If this crew member is being added from inside the trip's crew-picker sheet
// (crewPickerActive), saving returns to that picker with the new person
// already selected, instead of going back to the Crew tab.
async function saveCrewForm(){
  const name = document.getElementById('crewName').value.trim();
  if(!name){ showToast(t('toast.enterName')); return; }
  let newId = null;
  const phone = document.getElementById('crewPhone').value.trim();
  const email = document.getElementById('crewEmail').value.trim();
  const social = document.getElementById('crewSocial').value.trim();
  const note = document.getElementById('crewNote').value;
  if(editingCrewId){
    const c = state.crew.find(x=>x.id===editingCrewId);
    c.name=name; c.phone=phone; c.email=email; c.social=social; c.note=note; c.photo=pendingCrewPhoto;
  } else {
    newId = uid();
    state.crew.push({ id:newId, name, phone, email, social, note, photo:pendingCrewPhoto });
  }
  const ok = await storeSet(KEYS.CREW, state.crew);
  if(!ok) return;
  showToast(t('toast.crewSaved'));
  syncBoatsCrewIfSignedIn();
  if(crewPickerActive){
    crewPickerActive = false;
    if(newId) crewPickTempIds.push(newId);
    renderCrewPickList();
    openSheet('sheetSelectCrew');
  } else {
    closeSheets(); renderCrew();
  }
}
async function deleteCrewForm(){
  if(!confirm(t('confirm.removeCrew'))) return;
  state.crew = state.crew.filter(c=>c.id!==editingCrewId);
  await storeSet(KEYS.CREW, state.crew);
  closeSheets(); renderCrew();
  syncBoatsCrewIfSignedIn();
}
function renderCrew(){
  const el = document.getElementById('crewList');
  if(!state.crew.length){
    el.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
      <h3>${t('crew.emptyTitle')}</h3><p>${t('crew.emptyHint')}</p></div>`;
    return;
  }
  // Alphabetical by name — [...array] copies so .sort() doesn't reorder state.crew itself
  el.innerHTML = [...state.crew].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>{
    const contactBits = [c.phone, c.email].filter(Boolean).join(' · ');
    return `
    <div class="row-card" onclick='openCrewSheet(${JSON.stringify(c).replace(/'/g,"&apos;")})'>
      <img class="row-photo round" src="${c.photo||placeholderAvatar()}">
      <div class="row-info"><div class="name">${escapeHtml(c.name)}</div><div class="sub">${escapeHtml(contactBits || c.note || '')}</div></div>
    </div>`;
  }).join('');
}

/* ============================================================
   PROFILE & SETTINGS
   Two separate screens sharing this section: Profile holds personal info +
   backup/restore; Settings (reached via the gear icon) holds app-wide
   preferences — theme, default units, clear profile, full reset.
   ============================================================ */

// ===== journey.js =====
// Home stats, starting a journey, crew/skipper pickers, GPS tracking, live photo capture, ending + saving a journey
// Extracted from the original single-file app.js, lines 1777-2539, in original order.

function renderHomeStats(){
  const el = document.getElementById('homeStatsStrip');
  if(!state.tripIndex.length){ el.innerHTML=''; return; }
  const nm = state.tripIndex.reduce((s,t)=>s+(t.distanceNm||0),0);
  const secs = state.tripIndex.reduce((s,t)=>s+(t.elapsedSeconds||0),0);
  el.innerHTML = `<div class="stat-card stat-grid">
    <div class="cell"><div class="stat-label">${t('resume.totalSails')}</div><div class="stat-value">${state.tripIndex.length}</div></div>
    <div class="cell"><div class="stat-label">${t('home.distanceLogged')}</div><div class="stat-value">${nm.toFixed(1)}<span class="stat-unit"> NM</span></div></div>
  </div>`;
}

/* ============================================================
   START / ACTIVE JOURNEY
   The "screen-active" HTML section does triple duty: a live GPS-tracked
   journey, a manually-entered past sail, and editing an existing trip all
   share this one screen and form — see beginJourney/beginManualJourney/editTrip
   below for how each mode sets it up differently.
   ============================================================ */
function populateBoatSelects(){
  const opts = state.boats.length
    ? `<option value="" disabled selected>${t('sheet.chooseBoatOpt')}</option>` + state.boats.map(b=>`<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')
    : `<option value="">${t('sheet.noBoatsOpt')}</option>`;
  document.getElementById('startBoatSelect').innerHTML = opts;
  document.getElementById('activeBoatSelect').innerHTML = opts;
}
function openStartJourneySheet(){
  if(currentTrip){
    if(confirm(t('confirm.alreadyRecordingNew'))){
      nav('active');
      return;
    }
    return;
  }
  populateBoatSelects();
  openSheet('sheetStartJourney');
}
/* ---- weather slider labels & the per-entry unit toggle ----
   Sliders (windSpeed, gusts) always STORE kts internally regardless of what's
   displayed — activeUnitSystem only changes the label text via fmtSpeed(). This
   keeps the data model simple: one canonical unit, converted for display only. */
function updateWindSpeedLabel(){
  const kts = parseFloat(document.getElementById('windSpeed').value)||0;
  document.getElementById('windSpeedVal').textContent = (kts===0 ? '0 kts (Calm)' : fmtSpeed(kts, activeUnitSystem)).replace('kts', speedUnitLabel(activeUnitSystem));
}
function updateWaveHeightLabel(){
  const v = parseFloat(document.getElementById('waveHeight').value).toFixed(1);
  document.getElementById('waveHeightVal').textContent = v+' m';
}
function updateTempLabel(){
  const v = document.getElementById('temp').value;
  document.getElementById('tempVal').textContent = v+'°C';
}
function updateGustsLabel(){
  const kts = parseFloat(document.getElementById('gusts').value)||0;
  document.getElementById('gustsVal').textContent = fmtSpeed(kts, activeUnitSystem);
}
/* ---- guarded sliders ----
   The weather sliders live inline in a long scrolling form, so a thumb
   resting under a finger while the page scrolls used to drag the value by
   accident. Each slider starts "disarmed" (pointer-events:none, a "Tap to
   adjust" strip on top) so a scroll gesture just scrolls; tapping the strip
   arms it for one drag, and releasing the thumb re-locks it automatically. */
let armedSliderGuardId = null;
function armSlider(guardId){
  if(armedSliderGuardId && armedSliderGuardId!==guardId) disarmSlider(armedSliderGuardId);
  const guard = document.getElementById(guardId);
  if(!guard) return;
  guard.classList.add('armed');
  armedSliderGuardId = guardId;
}
function disarmSlider(guardId){
  const id = guardId || armedSliderGuardId;
  const guard = id && document.getElementById(id);
  if(guard) guard.classList.remove('armed');
  if(!guardId || guardId===armedSliderGuardId) armedSliderGuardId = null;
}
function disarmAllSliderGuards(){
  document.querySelectorAll('.slider-guard.armed').forEach(g=>g.classList.remove('armed'));
  armedSliderGuardId = null;
}
// Scrolling away (or navigating between screens) re-locks any slider left
// armed without a value change, so it never lingers "hot".
window.addEventListener('scroll', disarmAllSliderGuards, {passive:true, capture:true});
// The little ⚓/🌍 switch on the log screen. Unlike the sliders (which stay in
// kts and only relabel), the distance fields hold whatever unit is currently
// selected — so flipping here has to actually convert their typed values,
// not just relabel them.
function toggleLogUnitSystem(){
  const from = activeUnitSystem;
  const to = from==='metric' ? 'nautical' : 'metric';
  // NM<->km and kts<->km/h share the same 1.852 factor, so distance and speed
  // fields can all run through the same conversion loop.
  ['manualDistance','pastDistance','pastAvgSpeed','pastMaxSpeed'].forEach(id=>{
    const el = document.getElementById(id);
    const v = parseFloat(el.value);
    if(!isNaN(v)){
      const canonical = from==='metric' ? v/NM_TO_KM : v;
      el.value = (to==='metric' ? canonical*NM_TO_KM : canonical).toFixed(1);
    }
  });
  activeUnitSystem = to;
  refreshLogUnitsUI();
}
// Refreshes the avg/max speed + distance stat cards on the active screen to
// match activeUnitSystem. Called after every GPS fix and whenever units flip.
// BUG FIX (see notes): fmtSpeed/fmtDistance default to the app-wide Settings unit
// when no 'sys' argument is passed. On the log screen specifically we must pass
// activeUnitSystem explicitly, or the local ⚓/🌍 toggle silently does nothing.
function updateLiveStatDisplays(){
  if(!currentTrip) return;
  document.getElementById('avgSpeedDisplay').innerHTML = fmtSpeed(currentTrip.avgSpeed||0, activeUnitSystem).replace(' ', '<span class="stat-unit"> ')+'</span>';
  document.getElementById('maxSpeedDisplay').innerHTML = fmtSpeed(currentTrip.maxSpeed||0, activeUnitSystem).replace(' ', '<span class="stat-unit"> ')+'</span>';
  document.getElementById('distDisplay').innerHTML = fmtDistance(currentTrip.distanceNm||0, activeUnitSystem).replace(' ', '<span class="stat-unit"> ')+'</span>';
}
// Re-renders every unit-dependent label on the log screen at once — call this
// after seeding activeUnitSystem at the start of a journey/entry/edit.
function refreshLogUnitsUI(){
  const sys = activeUnitSystem;
  const label = sys==='metric' ? t('unit.metric') : t('unit.nautical');
  const knob = sys==='metric' ? '🌍' : '⚓';
  // Two visible instances of the same toggle — one under the live stat-grid, one
  // under the manual/edit distance field — both drive the same activeUnitSystem.
  document.getElementById('logUnitsKnobLive').textContent = knob;
  document.getElementById('logUnitsLabelLive').textContent = label;
  document.getElementById('logUnitsKnobPast').textContent = knob;
  document.getElementById('logUnitsLabelPast').textContent = label;
  document.getElementById('manualDistanceLabel').textContent = t('active.manualDistanceLabel', {unit: distUnitLabel(sys)});
  document.getElementById('pastDistanceLabel').textContent = t('active.distanceUnitLabel', {unit: distUnitLabel(sys)});
  document.getElementById('pastAvgSpeedLabel').textContent = t('active.avgSpeedUnitLabel', {unit: speedUnitLabel(sys)});
  document.getElementById('pastMaxSpeedLabel').textContent = t('active.maxSpeedUnitLabel', {unit: speedUnitLabel(sys)});
  updateWindSpeedLabel();
  updateGustsLabel();
  updateLiveStatDisplays();
}
/* ---- crew picker: only crew explicitly added to THIS trip show on the log
   screen (not the whole roster) — see renderAddedCrewChips vs renderCrewPickList ---- */
const SKIPPER_SELF_ID = 'self'; // sentinel id for "me" (state.profile), distinct from any crew uid()
// Resolves a crewIds/skipperId entry to a displayable {name,photo}. Handles
// the SKIPPER_SELF_ID sentinel (the profile owner, offered as a locked pick
// in both the crew and skipper pickers) as well as real saved crew members.
function crewMemberById(id){
  if(!id) return null;
  if(id===SKIPPER_SELF_ID) return { name: state.profile.name||t('default.sailorName'), photo: state.profile.avatar||'' };
  return state.crew.find(c=>c.id===id) || null;
}
function renderAddedCrewChips(){
  const row = document.getElementById('addedCrewRow');
  const added = (currentTrip?.crewIds||[]).map(id=>{ const m = crewMemberById(id); return m ? {...m, id} : null; }).filter(Boolean);
  if(!added.length){ row.innerHTML = `<p style="font-size:12.5px;">No crew added yet — tap "+ Add Crew" below.</p>`; return; }
  row.innerHTML = added.map(c=>`
    <div class="crew-chip active">
      <img src="${c.photo||placeholderAvatar()}"><span>${escapeHtml(c.name)}</span>
      <div class="rm" onclick="removeAddedCrew('${c.id}')">✕</div>
    </div>`).join('');
}
function removeAddedCrew(id){
  currentTrip.crewIds = (currentTrip.crewIds||[]).filter(cid=>cid!==id);
  renderAddedCrewChips();
}
let crewPickTempIds = [];   // draft selection while the "Add Crew" sheet is open — only committed to currentTrip.crewIds on Done
let crewPickerActive = false; // true while "+ Add New Crew Member" is open from inside the picker, so saveCrewForm() knows to return here instead of the Crew tab
function openSelectCrewSheet(){
  crewPickTempIds = [...(currentTrip.crewIds||[])];
  renderCrewPickList();
  openSheet('sheetSelectCrew');
}
function renderCrewPickList(){
  const el = document.getElementById('crewPickList');
  // The profile owner is always offered here — even before any crew has been
  // added — as a locked, non-editable row, so they can mark themselves as
  // aboard without it looking like they weren't on the sail. It only ever
  // appears in this picker, never in the managed Crew roster (renderCrew),
  // and there's no way to edit or delete it from here.
  const selfRow = `
    <div class="crew-pick-row${crewPickTempIds.includes(SKIPPER_SELF_ID)?' selected':''}" data-id="${SKIPPER_SELF_ID}" onclick="toggleCrewPick('${SKIPPER_SELF_ID}')">
      <img src="${state.profile.avatar||placeholderAvatar()}">
      <div class="name">${escapeHtml(state.profile.name||t('default.sailorName'))} ${t('active.youSuffix')}</div>
      <div class="crew-pick-check"></div>
    </div>`;
  const crewRows = [...state.crew].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`
    <div class="crew-pick-row${crewPickTempIds.includes(c.id)?' selected':''}" data-id="${c.id}" onclick="toggleCrewPick('${c.id}')">
      <img src="${c.photo||placeholderAvatar()}">
      <div class="name">${escapeHtml(c.name)}</div>
      <div class="crew-pick-check"></div>
    </div>`).join('');
  el.innerHTML = selfRow + crewRows;
}
function toggleCrewPick(id){
  if(crewPickTempIds.includes(id)) crewPickTempIds = crewPickTempIds.filter(x=>x!==id);
  else crewPickTempIds.push(id);
  renderCrewPickList();
}
function confirmCrewPick(){
  currentTrip.crewIds = [...crewPickTempIds];
  closeSheets();
  renderAddedCrewChips();
}
function startAddCrewFromPicker(){
  crewPickerActive = true;
  openCrewSheet();
}

/* ---- skipper picker: single-select from the crew roster (plus the app's
   own profile, since the person logging the sail is often the skipper too),
   shown on this same shared screen for both live and manual/edit entries ---- */
function skipperById(id){ return crewMemberById(id); }
function renderSkipperChip(){
  const row = document.getElementById('skipperChipRow');
  const skipper = currentTrip?.skipperId ? skipperById(currentTrip.skipperId) : null;
  if(!skipper){ row.innerHTML = `<p style="font-size:12.5px;">No skipper set — tap "Choose Skipper" below.</p>`; return; }
  row.innerHTML = `
    <div class="crew-chip active">
      <img src="${skipper.photo||placeholderAvatar()}"><span>${escapeHtml(skipper.name)}</span>
      <div class="rm" onclick="clearSkipper()">✕</div>
    </div>`;
}
function clearSkipper(){
  currentTrip.skipperId = null;
  renderSkipperChip();
}
function openSelectSkipperSheet(){
  renderSkipperPickList();
  openSheet('sheetSelectSkipper');
}
function renderSkipperPickList(){
  const el = document.getElementById('skipperPickList');
  const selfRow = `
    <div class="crew-pick-row${currentTrip.skipperId===SKIPPER_SELF_ID?' selected':''}" data-id="${SKIPPER_SELF_ID}" onclick="selectSkipper('${SKIPPER_SELF_ID}')">
      <img src="${state.profile.avatar||placeholderAvatar()}">
      <div class="name">${escapeHtml(state.profile.name||t('default.sailorName'))} ${t('active.youSuffix')}</div>
      <div class="crew-pick-check"></div>
    </div>`;
  const crewRows = [...state.crew].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`
    <div class="crew-pick-row${currentTrip.skipperId===c.id?' selected':''}" data-id="${c.id}" onclick="selectSkipper('${c.id}')">
      <img src="${c.photo||placeholderAvatar()}">
      <div class="name">${escapeHtml(c.name)}</div>
      <div class="crew-pick-check"></div>
    </div>`).join('');
  el.innerHTML = selfRow + crewRows;
}
function selectSkipper(id){
  currentTrip.skipperId = id;
  closeSheets();
  renderSkipperChip();
}
function clearSkipperPick(){
  currentTrip.skipperId = null;
  closeSheets();
  renderSkipperChip();
}

// Shared field-reset used by both a fresh live journey and a fresh manual entry
// (NOT used by editTrip, which pre-fills from the existing trip instead).
function resetActiveFormFields(){
  document.getElementById('tripTitle').value = '';
  document.getElementById('tripPlace').value = '';
  document.getElementById('windSpeed').value = 8; updateWindSpeedLabel();
  document.getElementById('waveHeight').value = 0.5; updateWaveHeightLabel();
  document.getElementById('temp').value = 20; updateTempLabel();
  document.getElementById('gusts').value = 10; updateGustsLabel();
  document.getElementById('waveDir').value = 'N';
  document.getElementById('activePhotoStrip').querySelectorAll('.photo-thumb').forEach(n=>n.remove());
  document.getElementById('tripNotes').value = '';
  document.getElementById('mapImagePreviewWrap').style.display = 'none';
  document.getElementById('mapImagePreview').src = '';
  renderSkipperChip();
  renderAddedCrewChips();
}
// MODE 1: live GPS journey. Creates a fresh currentTrip, starts the timer and
// GPS watch immediately. See beginManualJourney() and editTrip() for the other
// two ways this same screen gets used.
async function beginJourney(){
  const boatId = document.getElementById('startBoatSelect').value;
  currentTrip = {
    id: uid(),
    isManual: false,
    boatId: boatId || null,
    date: new Date().toISOString(),
    elapsedSeconds: 0,
    distanceNm: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    path: [],
    weather: {}, place:'', notes:'', skipperId: null, crewIds: [], photos: [], coverPhoto: null, mapImage: null
  };
  activeUnitSystem = appUnitSystem();
  closeSheets();
  nav('active');
  document.getElementById('liveStatsBlock').style.display = 'block';
  document.getElementById('pastStatsBlock').style.display = 'none';
  document.getElementById('endJourneyBtnLabel').textContent = t('active.endJourney');
  resetActiveFormFields();
  // BUG FIX: the boat chosen in the Start Journey sheet never used to carry
  // over to the log form's own boat select — it silently sat on whatever the
  // browser auto-selected. Sync it explicitly now that there's a real value to sync.
  document.getElementById('activeBoatSelect').value = boatId || '';
  refreshLogUnitsUI();
  startedAt = Date.now();
  document.getElementById('elapsedDisplay').textContent = '00:00:00';
  updateLiveStatDisplays();
  timerId = setInterval(tickTimer, 1000);
  startGPS();
  startLiveConnCheck();
  requestWakeLock();
  // Awaited deliberately, unlike the per-tick/per-fix checkpoints below: this is the
  // one-time "a journey now exists" write, and it's the only thing standing between
  // an instant crash right after tapping Cast Off and losing the journey entirely.
  await saveActiveTripCheckpoint();
}
// MODE 3: editing an existing trip. Deep-clones it into currentTrip (so
// discarding never touches the saved copy) and pre-fills every field, reusing
// the same "past sail" UI as manual entry. finalizeSaveTrip() checks
// currentTrip.isEditing to overwrite the original instead of creating a new trip.
function editTrip(){
  const trip = window._detailTrip;
  if(!trip){ showToast(t('toast.openTripFirst')); return; }
  if(currentTrip){
    showToast(t('toast.finishOrDiscardFirst'));
    return;
  }
  currentTrip = JSON.parse(JSON.stringify(trip)); // deep clone so cancel never touches the saved version
  currentTrip.isManual = true;
  currentTrip.isEditing = true;
  activeUnitSystem = appUnitSystem();
  populateBoatSelects();
  nav('active');
  document.getElementById('liveStatsBlock').style.display = 'none';
  document.getElementById('pastStatsBlock').style.display = 'block';
  document.getElementById('endJourneyBtnLabel').textContent = t('active.saveChanges');

  document.getElementById('tripTitle').value = trip._customTitle ? trip.title : '';
  document.getElementById('tripPlace').value = trip.place || '';
  document.getElementById('activeBoatSelect').value = trip.boatId || '';
  document.getElementById('windDir').value = trip.weather?.windDir || 'N';
  // windSpeed may be a plain kts number (current format) or older saved text like "8.0 kts" — handle both
  const wsRaw = trip.weather?.windSpeed;
  const wsNum = typeof wsRaw === 'number' ? wsRaw : parseFloat(String(wsRaw||'').match(/[\d.]+/)?.[0]) || 8;
  document.getElementById('windSpeed').value = wsNum;
  const gustsRaw = trip.weather?.gusts;
  const gustsNum = typeof gustsRaw === 'number' ? gustsRaw : parseFloat(String(gustsRaw||'').match(/[\d.]+/)?.[0]) || 10;
  document.getElementById('gusts').value = gustsNum;
  document.getElementById('waveDir').value = trip.weather?.waveDir || 'N';
  document.getElementById('seaState').value = trip.weather?.seaState || 'Moderate';
  document.getElementById('waveHeight').value = trip.weather?.waveHeight || 0.5;
  document.getElementById('temp').value = trip.weather?.temp || 20;
  document.getElementById('tripNotes').value = trip.notes || '';
  refreshLogUnitsUI();
  updateWindSpeedLabel();
  updateGustsLabel();
  updateWaveHeightLabel();
  updateTempLabel();

  const d = new Date(trip.date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  document.getElementById('pastDate').value = d.toISOString().slice(0,16);
  const totalMin = Math.round((trip.elapsedSeconds||0)/60);
  document.getElementById('pastHours').value = Math.floor(totalMin/60);
  document.getElementById('pastMinutes').value = totalMin%60;
  const distNm = trip.distanceNm || 0;
  document.getElementById('pastDistance').value = (activeUnitSystem==='metric' ? distNm*NM_TO_KM : distNm).toFixed(1);
  document.getElementById('pastAvgSpeed').value = fmtSpeed(trip.avgSpeed||0, activeUnitSystem).split(' ')[0];
  document.getElementById('pastMaxSpeed').value = fmtSpeed(trip.maxSpeed||0, activeUnitSystem).split(' ')[0];
  if(trip.mapImage){
    document.getElementById('mapImagePreview').src = trip.mapImage;
    document.getElementById('mapImagePreviewWrap').style.display = 'block';
  }

  renderSkipperChip();
  renderAddedCrewChips();
  renderActivePhotoStrip();
}
// Runs once on boot, before the home screen shows. If a journey/manual-entry/edit
// was still active when the tab last closed (screen-lock kill, browser reclaiming
// memory, accidental tab close, etc.), this restores it from the checkpoint saved by
// saveActiveTripCheckpoint() instead of silently losing it. For a live GPS journey,
// elapsed time is recomputed from the original startedAt (real wall-clock time), and
// the GPS watch + timer are restarted so tracking picks straight back up.
async function resumeActiveTripIfAny(){
  let ckpt;
  try{ ckpt = await storeGet(KEYS.ACTIVE_TRIP); }catch(e){ ckpt = null; }
  if(!ckpt || !ckpt.trip) return false;
  currentTrip = ckpt.trip;
  startedAt = ckpt.startedAt || Date.now();
  activeUnitSystem = appUnitSystem();
  populateBoatSelects();
  nav('active');
  const isLive = !currentTrip.isManual;
  document.getElementById('liveStatsBlock').style.display = isLive ? 'block' : 'none';
  document.getElementById('pastStatsBlock').style.display = isLive ? 'none' : 'block';
  document.getElementById('endJourneyBtnLabel').textContent = currentTrip.isEditing ? t('active.saveChanges') : currentTrip.isManual ? t('active.saveLogEntry') : t('active.endJourney');

  document.getElementById('tripTitle').value = currentTrip._customTitle ? currentTrip.title : '';
  document.getElementById('tripPlace').value = currentTrip.place || '';
  document.getElementById('activeBoatSelect').value = currentTrip.boatId || '';
  document.getElementById('windDir').value = currentTrip.weather?.windDir || 'N';
  document.getElementById('windSpeed').value = currentTrip.weather?.windSpeed ?? 8;
  document.getElementById('gusts').value = currentTrip.weather?.gusts ?? 10;
  document.getElementById('waveDir').value = currentTrip.weather?.waveDir || 'N';
  document.getElementById('seaState').value = currentTrip.weather?.seaState || 'Moderate';
  document.getElementById('waveHeight').value = currentTrip.weather?.waveHeight || 0.5;
  document.getElementById('temp').value = currentTrip.weather?.temp || 20;
  document.getElementById('tripNotes').value = currentTrip.notes || '';
  refreshLogUnitsUI();
  updateWindSpeedLabel(); updateGustsLabel(); updateWaveHeightLabel(); updateTempLabel();
  if(currentTrip.mapImage){
    document.getElementById('mapImagePreview').src = currentTrip.mapImage;
    document.getElementById('mapImagePreviewWrap').style.display = 'block';
  }
  renderSkipperChip();
  renderAddedCrewChips();
  renderActivePhotoStrip();

  if(isLive){
    updateLiveStatDisplays();
    timerId = setInterval(tickTimer, 1000);
    startGPS();
    startLiveConnCheck();
    requestWakeLock();
  } else {
    // Not a live journey (manual entry or edit draft): the duration/distance/speed
    // inputs on this screen aren't bound to currentTrip until Save is pressed, so
    // repopulate them the same way editTrip() does, from whatever was on currentTrip.
    const d = new Date(currentTrip.date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById('pastDate').value = d.toISOString().slice(0,16);
    const totalMin = Math.round((currentTrip.elapsedSeconds||0)/60);
    document.getElementById('pastHours').value = Math.floor(totalMin/60);
    document.getElementById('pastMinutes').value = totalMin%60;
    const distNm = currentTrip.distanceNm || 0;
    document.getElementById('pastDistance').value = (activeUnitSystem==='metric' ? distNm*NM_TO_KM : distNm).toFixed(1);
    document.getElementById('pastAvgSpeed').value = fmtSpeed(currentTrip.avgSpeed||0, activeUnitSystem).split(' ')[0];
    document.getElementById('pastMaxSpeed').value = fmtSpeed(currentTrip.maxSpeed||0, activeUnitSystem).split(' ')[0];
  }
  showToast(t('toast.tripResumed'));
  return true;
}
// MODE 2: manually logging a sail that already happened. No GPS/timer — the
// person fills in date, duration, and distance by hand instead.
function beginManualJourney(){
  if(currentTrip){
    if(confirm(t('confirm.alreadyRecordingPast'))){
      nav('active');
    }
    return;
  }
  populateBoatSelects();
  currentTrip = {
    id: uid(),
    isManual: true,
    boatId: null,
    date: new Date().toISOString(),
    elapsedSeconds: 0,
    distanceNm: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    path: [],
    weather: {}, place:'', notes:'', skipperId: null, crewIds: [], photos: [], coverPhoto: null, mapImage: null
  };
  activeUnitSystem = appUnitSystem();
  nav('active');
  document.getElementById('liveStatsBlock').style.display = 'none';
  document.getElementById('pastStatsBlock').style.display = 'block';
  document.getElementById('endJourneyBtnLabel').textContent = t('active.saveLogEntry');
  resetActiveFormFields();
  refreshLogUnitsUI();
  // default the date/time picker to now, in local time, formatted for datetime-local
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('pastDate').value = now.toISOString().slice(0,16);
  document.getElementById('pastHours').value = '';
  document.getElementById('pastMinutes').value = '';
  document.getElementById('pastDistance').value = '';
  document.getElementById('pastAvgSpeed').value = '';
  document.getElementById('pastMaxSpeed').value = '';
}
/* ---- live GPS: runs every second (timer) / on every position fix (GPS watch) ---- */
function tickTimer(){
  const secs = Math.floor((Date.now()-startedAt)/1000);
  currentTrip.elapsedSeconds = secs;
  const h = String(Math.floor(secs/3600)).padStart(2,'0');
  const m = String(Math.floor((secs%3600)/60)).padStart(2,'0');
  const s = String(secs%60).padStart(2,'0');
  document.getElementById('elapsedDisplay').textContent = `${h}:${m}:${s}`;
  const bannerTime = document.getElementById('recordingBannerTime');
  if(bannerTime) bannerTime.textContent = `${h}:${m}:${s}`;
  // Checkpoint every ~10s even without a GPS fix (e.g. anchored, weak signal) so
  // elapsed time is never more than ~10s stale if the tab gets killed.
  if(secs % 10 === 0) saveActiveTripCheckpoint();
}
// Great-circle distance between two lat/lng points, in nautical miles.
function haversineNm(a,b){
  const R=3440.065; // Earth's radius in nautical miles
  const toRad = d=>d*Math.PI/180;
  const dLat = toRad(b.lat-a.lat), dLon = toRad(b.lng-a.lng);
  const la1=toRad(a.lat), la2=toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
// A fix worse than this radius (meters) is almost certainly the browser falling
// back to coarse network/cell positioning rather than a real GPS lock — common
// offshore with a weak cell signal. These used to get plotted straight onto the
// track, snapping the line miles off course. Tune this up if legit fixes at sea
// are getting rejected too often (weak-signal status will show if so); tune it
// down if occasional jumps still slip through.
const GPS_ACCURACY_LIMIT_M = 60;
// How long to go without ANY fix (good or bad) before we treat GPS as silently
// dead rather than just between fixes. watchPosition can stop delivering
// callbacks on mobile (especially iOS Safari/PWAs) without ever firing an
// error — nothing previously caught this, so the elapsed timer (which runs on
// its own independent setInterval) just kept counting while nothing recorded.
const GPS_STALE_MS = 45000;

function startGPS(){
  document.getElementById('manualDistanceWrap').style.display='none';
  const gpsEl = document.getElementById('gpsStatus');
  renderLiveTrack();
  if(!('geolocation' in navigator)){
    gpsEl.textContent = t('gps.unavailable'); gpsEl.style.color='var(--coral)';
    document.getElementById('manualDistanceWrap').style.display='block';
    return;
  }
  gpsEl.textContent = t('gps.searching');
  lastFixTime = null;
  bestRejectedFix = null;
  pendingJumpCandidate = null;
  watchId = navigator.geolocation.watchPosition(onFix, onGpsError, {enableHighAccuracy:true, maximumAge:2000, timeout:15000});
  if(gpsWatchdogInterval) clearInterval(gpsWatchdogInterval);
  gpsWatchdogInterval = setInterval(checkGpsFreshness, 15000);
  showRecordingNotification();
}
// Mirrors the persistent "Trip Recording" system notification other tracking
// apps (SeePeople, etc.) show — makes it obvious at a glance, even with the
// phone locked or another app open, that a journey is currently being
// tracked. Best-effort: web notifications on Android Chrome behave a lot
// like this, but there's no true PWA equivalent of a native foreground
// service — the notification CAN be swiped away by the user without
// stopping tracking (a native app can pin theirs so it can't be dismissed;
// a web one can't). It also depends on notification permission being
// granted, and is more limited on iOS. The in-app recording banner stays as
// the reliable fallback either way — this is an addition to it, not a
// replacement.
async function showRecordingNotification(){
  try{
    if(!('serviceWorker' in navigator) || !('Notification' in window)) return;
    if(Notification.permission==='default'){ await Notification.requestPermission(); }
    if(Notification.permission!=='granted') return;
    const reg = await navigator.serviceWorker.ready;
    const boat = state.boats.find(b=>b.id===currentTrip?.boatId);
    reg.showNotification(t('notification.recordingTitle'), {
      body: boat ? t('notification.recordingBodyBoat', {boat: boat.name}) : t('notification.recordingBody'),
      icon: './images/icon-192.png',
      tag: 'trip-recording',
      silent: true
    });
  }catch(e){ /* not fatal — in-app recording banner is still there */ }
}
async function clearRecordingNotification(){
  try{
    if(!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    (await reg.getNotifications({tag:'trip-recording'})).forEach(n=>n.close());
  }catch(e){}
}
function onFix(pos){
  lastFixTime = Date.now();
  const gpsEl = document.getElementById('gpsStatus');
  const acc = pos.coords.accuracy; // meters, browser's own confidence radius for this fix
  const point = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now(), acc };

  if(acc != null && acc > GPS_ACCURACY_LIMIT_M){
    // Too imprecise to trust — keep it as a fallback candidate (in case signal
    // stays weak for a while and we'd otherwise record nothing at all) but
    // don't let it touch the path or stats.
    if(!bestRejectedFix || acc < bestRejectedFix.acc) bestRejectedFix = point;
    gpsEl.textContent = t('gps.weakSignal', {acc: Math.round(acc)});
    gpsEl.style.color = 'var(--coral)';
    return;
  }
  acceptFix(point);
}
// Actually commits a fix to the trip: sanity-checks it against the previous
// accepted point and only THEN adds it to the path. A fix implying 60+kts is
// almost certainly a glitch, not real sailing speed — but a plain "reject
// and wait" isn't enough on its own: the longer fixes keep getting rejected,
// the more elapsed time stacks up against that same stale last-good point,
// and distance÷time eventually dips back under the 60kt cutoff for ANY
// distance, however wrong — the filter quietly gets weaker over time instead
// of staying strict. That's what let a multi-mile jump back in after ~30s of
// "Ignored bad fix".
// Fix: once a fix gets rejected, we hold it as pendingJumpCandidate and stop
// trusting the stale-anchor math entirely — the ONLY way out of "disputed"
// state is a SECOND raw fix that closely agrees with the first rejected one
// (checked against each other, not the old anchor). Two fixes in a row
// landing in the same place is real, if abrupt, movement — e.g. GPS handing
// off between providers while another location app runs at the same time,
// which can happen even when each individual fix reports decent accuracy.
// An isolated one-off glitch won't have a second fix agreeing with it and
// just gets dropped. We don't count a confirmed jump's distance/speed toward
// trip stats, since we don't actually know the true path across whatever
// gap caused the dispute.
function acceptFix(point){
  const prev = currentTrip.path[currentTrip.path.length-1];
  if(!prev){ commitFix(point, false); return; }

  const segNm = haversineNm(prev, point);
  const dtHours = (point.t - prev.t)/3600000;
  const instSpeed = dtHours>0 ? segNm/dtHours : Infinity;

  if(instSpeed < 60 && !pendingJumpCandidate){
    commitFix(point, true);
    return;
  }

  if(pendingJumpCandidate){
    const confirmNm = haversineNm(pendingJumpCandidate, point);
    const confirmDtHours = (point.t - pendingJumpCandidate.t)/3600000;
    const confirmSpeed = confirmDtHours>0 ? confirmNm/confirmDtHours : Infinity;
    if(confirmSpeed < 15){
      pendingJumpCandidate = null;
      commitFix(point, false); // confirmed relocation, but skip stats — the true path across the disputed gap is unknown
      return;
    }
  }
  pendingJumpCandidate = point;
  const gpsEl = document.getElementById('gpsStatus');
  gpsEl.textContent = t('gps.rejectedJump'); gpsEl.style.color='var(--coral)';
}
function commitFix(point, countStats){
  const gpsEl = document.getElementById('gpsStatus');
  const prev = currentTrip.path[currentTrip.path.length-1];
  if(countStats && prev){
    const segNm = haversineNm(prev, point);
    const dtHours = (point.t - prev.t)/3600000;
    if(dtHours>0){
      const instSpeed = segNm/dtHours;
      currentTrip.distanceNm += segNm;
      currentTrip.maxSpeed = Math.max(currentTrip.maxSpeed, instSpeed);
    }
  }
  currentTrip.path.push(point);
  bestRejectedFix = null;
  gpsEl.textContent = t('gps.live'); gpsEl.style.color='var(--navy)';
  renderLiveTrack();
  const elapsedH = currentTrip.elapsedSeconds/3600;
  currentTrip.avgSpeed = elapsedH>0 ? currentTrip.distanceNm/elapsedH : 0;
  updateLiveStatDisplays();
  saveActiveTripCheckpoint();
}
function onGpsError(){
  const gpsEl = document.getElementById('gpsStatus');
  gpsEl.textContent = t('gps.noSignal'); gpsEl.style.color='var(--coral)';
  document.getElementById('manualDistanceWrap').style.display='block';
  renderLiveTrack();
}
// Watchdog: polls how long it's been since ANY fix arrived (not just accepted
// ones). Past GPS_STALE_MS it visibly flags "no fix" in the GPS status pill
// instead of silently saying "Live" forever, and tries to self-heal by
// tearing down and restarting the watch — cheap to attempt, and covers the
// case where the OS/browser has quietly stalled the watch rather than the
// boat genuinely having no signal. If we've been stuck long enough and have a
// weak-but-real fallback fix sitting around, accept it rather than leaving a
// total gap in the track.
function checkGpsFreshness(){
  if(!currentTrip || currentTrip.isManual || watchId===null) return;
  if(!lastFixTime) return; // still waiting on the very first fix — "Searching…" already covers this
  const staleFor = Date.now() - lastFixTime;
  if(staleFor <= GPS_STALE_MS) return;

  const gpsEl = document.getElementById('gpsStatus');
  const mins = Math.floor(staleFor/60000), secs = Math.floor((staleFor%60000)/1000);
  gpsEl.textContent = t('gps.stale', {time: mins>0 ? `${mins}m ${secs}s` : `${secs}s`});
  gpsEl.style.color = 'var(--coral)';

  if(bestRejectedFix){
    acceptFix(bestRejectedFix);
    bestRejectedFix = null;
  }
  if('geolocation' in navigator){
    navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(onFix, onGpsError, {enableHighAccuracy:true, maximumAge:2000, timeout:15000});
  }
}
function stopGPS(){
  if(watchId!==null && 'geolocation' in navigator){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  if(timerId){ clearInterval(timerId); timerId=null; }
  if(gpsWatchdogInterval){ clearInterval(gpsWatchdogInterval); gpsWatchdogInterval=null; }
  lastFixTime = null;
  bestRejectedFix = null;
  pendingJumpCandidate = null;
  clearRecordingNotification();
  stopLiveConnCheck();
  releaseWakeLock();
}
function confirmLeaveActive(){
  // Leaving the screen no longer stops tracking — GPS/timer keep running in the
  // background. The journey only ends when "End Journey" / "Save Log Entry" / "Save Changes" is pressed.
  nav('home');
  showToast(currentTrip.isEditing ? t('toast.editsKept') : currentTrip.isManual ? t('toast.draftKept') : t('toast.stillRecording'));
}
function discardJourney(){
  const msg = currentTrip.isEditing
    ? t('confirm.discardEdits')
    : currentTrip.isManual
    ? t('confirm.discardManual')
    : t('confirm.discardJourney');
  if(confirm(msg)){
    stopGPS();
    const wasEditing = currentTrip.isEditing, editedId = currentTrip.id;
    currentTrip = null;
    clearActiveTripCheckpoint();
    document.getElementById('recordingBanner').classList.remove('show');
    if(wasEditing){ nav('history'); openTripDetail(editedId); } else { nav('home'); }
  }
}
/* ---- photos while logging: added via camera or upload tile, tap any thumb
   to set it as the cover, ✕ to remove. Resized to 900px/72% quality on add to
   keep storage usage down. ---- */
// Optional reference map image for manual/edited entries, since there's no
// GPS track to draw for a past sail. Just a plain resize (not the crop
// adjuster) since the whole image content matters more than a tidy crop here.
async function handleMapImage(ev){
  const f = ev.target.files[0]; if(!f) return;
  ev.target.value = '';
  currentTrip.mapImage = await resizeImage(f, 1000, 0.8);
  document.getElementById('mapImagePreview').src = currentTrip.mapImage;
  document.getElementById('mapImagePreviewWrap').style.display = 'block';
}
function removeMapImage(){
  currentTrip.mapImage = null;
  document.getElementById('mapImagePreviewWrap').style.display = 'none';
}
async function handleActivePhotos(ev){
  const files = Array.from(ev.target.files||[]);
  for(const f of files){
    try{
      const dataUrl = await resizeImage(f, 900, 0.72);
      currentTrip.photos.push(dataUrl);
      if(!currentTrip.coverPhoto) currentTrip.coverPhoto = dataUrl;
    }catch(e){ showToast(t('toast.photoProcessFail')); }
  }
  renderActivePhotoStrip();
  ev.target.value='';
}
function renderActivePhotoStrip(){
  const strip = document.getElementById('activePhotoStrip');
  strip.querySelectorAll('.photo-thumb').forEach(n=>n.remove());
  currentTrip.photos.forEach((p,i)=>{
    const div = document.createElement('div'); div.className='photo-thumb';
    div.innerHTML = `<img src="${p}" onclick="setActiveCover(${i})">
      ${currentTrip.coverPhoto===p?`<div class="cover-badge">${t('active.coverBadge')}</div>`:''}
      <div class="rm" onclick="removeActivePhoto(${i})">✕</div>`;
    strip.insertBefore(div, strip.firstChild);
  });
  // Editing keeps the existing cover untouched by default (see endJourney) — this
  // link is the deliberate way to change it instead, rather than being forced
  // to re-pick on every save.
  const changeCoverLink = document.getElementById('changeCoverLink');
  if(changeCoverLink) changeCoverLink.style.display = (currentTrip.isEditing && currentTrip.photos.length) ? 'block' : 'none';
}
function setActiveCover(i){ currentTrip.coverPhoto = currentTrip.photos[i]; renderActivePhotoStrip(); }
function removeActivePhoto(i){
  const removed = currentTrip.photos.splice(i,1)[0];
  if(currentTrip.coverPhoto===removed) currentTrip.coverPhoto = currentTrip.photos[0]||null;
  renderActivePhotoStrip();
}

// The finish line for all three modes (live/manual/edit). Reads every form field
// into currentTrip, converting distance to canonical NM if the log was in metric.
// Then either prompts for a cover photo (if any were added) or saves straight away.
async function endJourney(){
  const confirmMsg = currentTrip.isEditing ? t('confirm.saveChanges') : currentTrip.isManual ? t('confirm.savePastSail') : t('confirm.endJourney');
  if(!confirm(confirmMsg)) return;

  if(currentTrip.isManual){
    const hrs = parseFloat(document.getElementById('pastHours').value)||0;
    const mins = parseFloat(document.getElementById('pastMinutes').value)||0;
    const distInput = parseFloat(document.getElementById('pastDistance').value)||0;
    const dist = activeUnitSystem==='metric' ? distInput/NM_TO_KM : distInput; // convert to canonical NM
    const dateVal = document.getElementById('pastDate').value;
    currentTrip.elapsedSeconds = Math.round(hrs*3600 + mins*60);
    currentTrip.distanceNm = dist;
    const h = currentTrip.elapsedSeconds/3600;
    const autoAvg = h>0 ? dist/h : 0;
    // Avg/Max Speed default to the distance÷duration estimate, but a typed
    // value in either field (e.g. from a boat's own instruments) always wins.
    const avgInput = parseFloat(document.getElementById('pastAvgSpeed').value);
    const maxInput = parseFloat(document.getElementById('pastMaxSpeed').value);
    currentTrip.avgSpeed = !isNaN(avgInput) ? (activeUnitSystem==='metric' ? avgInput/KT_TO_KMH : avgInput) : autoAvg;
    currentTrip.maxSpeed = !isNaN(maxInput) ? (activeUnitSystem==='metric' ? maxInput/KT_TO_KMH : maxInput) : currentTrip.avgSpeed;
    currentTrip.date = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
  } else {
    stopGPS();
    const manualInput = parseFloat(document.getElementById('manualDistance').value);
    if(!isNaN(manualInput) && (!currentTrip.path.length || currentTrip.distanceNm===0)){
      currentTrip.distanceNm = activeUnitSystem==='metric' ? manualInput/NM_TO_KM : manualInput; // canonical NM
      const h = currentTrip.elapsedSeconds/3600;
      currentTrip.avgSpeed = h>0 ? currentTrip.distanceNm/h : 0;
    }
  }
  currentTrip.weather = {
    windDir: document.getElementById('windDir').value,
    windSpeed: parseFloat(document.getElementById('windSpeed').value)||0, // canonical kts
    gusts: parseFloat(document.getElementById('gusts').value)||0, // canonical kts
    waveDir: document.getElementById('waveDir').value,
    seaState: document.getElementById('seaState').value,
    waveHeight: document.getElementById('waveHeight').value,
    temp: document.getElementById('temp').value,
  };
  currentTrip.place = document.getElementById('tripPlace').value.trim();
  currentTrip.notes = document.getElementById('tripNotes').value;
  const boat = state.boats.find(b=>b.id===document.getElementById('activeBoatSelect').value);
  currentTrip.boatId = boat ? boat.id : null;
  const typedTitle = document.getElementById('tripTitle').value.trim();
  currentTrip._customTitle = !!typedTitle;
  currentTrip.title = typedTitle || (boat ? `Sail aboard ${boat.name}` : 'Untitled Sail');

  if(currentTrip.isEditing){
    // Editing keeps whatever cover was already set — no forced re-pick. Use the
    // "Change Cover Photo" link in the Photos section if you want to swap it.
    finalizeSaveTrip();
  } else if(currentTrip.photos && currentTrip.photos.length){
    openCoverPickSheet('onSave');
  } else {
    currentTrip.coverPhoto = null;
    finalizeSaveTrip();
  }
}
let coverPickMode = 'onSave'; // 'onSave' (part of finishing a new entry) | 'swap' (changing the cover mid-edit, doesn't save)
function openCoverPickSheet(mode){
  coverPickMode = mode || 'onSave';
  if(!currentTrip.photos || !currentTrip.photos.length){ showToast(t('toast.addPhotoFirst')); return; }
  // Default the selection to whatever's already the cover (editing) or the first photo, so
  // "Adjust Cover" has something sensible to work on even before the person taps a thumbnail.
  const existingIdx = currentTrip.photos.indexOf(currentTrip.coverPhoto);
  currentTrip._pickedCoverIndex = existingIdx>=0 ? existingIdx : 0;
  const strip = document.getElementById('coverPickStrip');
  strip.innerHTML = currentTrip.photos.map((p,i)=>`
    <div class="photo-thumb pickable${i===currentTrip._pickedCoverIndex?' selected':''}" data-i="${i}" onclick="pickCoverThumb(${i})">
      <img src="${p}">
    </div>`).join('');
  document.getElementById('skipCoverPickBtn').style.display = coverPickMode==='onSave' ? 'block' : 'none';
  openSheet('sheetCoverPick');
}
function pickCoverThumb(i){
  document.querySelectorAll('#coverPickStrip .photo-thumb').forEach(n=>n.classList.remove('selected'));
  document.querySelector(`#coverPickStrip .photo-thumb[data-i="${i}"]`).classList.add('selected');
  currentTrip._pickedCoverIndex = i;
  currentTrip._coverAdjusted = false; // picking a different photo discards any crop made on the previous one
}
// Opens the rectangular crop/zoom adjuster on whichever photo is currently
// selected, matching the cover's actual wide-banner display shape. On confirm,
// confirmPhotoAdjust() sets currentTrip.coverPhoto directly (target:'cover'),
// which confirmCoverPick() below then respects instead of re-deriving from the
// raw, unedited photo array.
function openCoverPhotoAdjuster(){
  const i = currentTrip._pickedCoverIndex ?? 0;
  const src = currentTrip.photos[i];
  if(!src) return;
  currentTrip._coverAdjusted = true;
  startPhotoAdjuster(src, 'cover', 'sheetCoverPick', {shape:'rect', vw:320, vh:150, outputW:800, outputH:375});
}
function confirmCoverPick(){
  if(!currentTrip._coverAdjusted){
    const i = currentTrip._pickedCoverIndex;
    currentTrip.coverPhoto = (i!=null) ? currentTrip.photos[i] : (currentTrip.coverPhoto || currentTrip.photos[0]);
  } // else coverPhoto was already set by the adjuster — keep the cropped version
  delete currentTrip._pickedCoverIndex;
  delete currentTrip._coverAdjusted;
  closeSheets();
  if(coverPickMode==='onSave'){ finalizeSaveTrip(); }
  else { renderActivePhotoStrip(); showToast(t('toast.coverUpdated')); }
}
function skipCoverPick(){
  currentTrip.coverPhoto = null;
  delete currentTrip._pickedCoverIndex;
  delete currentTrip._coverAdjusted;
  closeSheets();
  if(coverPickMode==='onSave'){ finalizeSaveTrip(); }
  else { renderActivePhotoStrip(); showToast(t('toast.coverRemoved')); }
}
// The actual write to storage — shared by all three modes. Branches on
// isEditing to decide whether to overwrite the existing tripIndex entry in
// place or add a new one, since editing must never duplicate the trip.
async function finalizeSaveTrip(){
  const ok = await storeSet('trip:'+currentTrip.id, currentTrip);
  if(!ok){ showToast(t('toast.saveFailed')); return; }

  const indexEntry = {
    id: currentTrip.id, title: currentTrip.title, date: currentTrip.date,
    elapsedSeconds: currentTrip.elapsedSeconds, distanceNm: currentTrip.distanceNm,
    avgSpeed: currentTrip.avgSpeed, maxSpeed: currentTrip.maxSpeed,
    coverPhoto: currentTrip.coverPhoto, hasPhotos: currentTrip.photos.length>0,
    boatId: currentTrip.boatId, notes: currentTrip.notes, place: currentTrip.place,
    skipperId: currentTrip.skipperId||null
  };
  if(currentTrip.isEditing){
    const idx = state.tripIndex.findIndex(t=>t.id===currentTrip.id);
    if(idx>=0) state.tripIndex[idx] = indexEntry; else state.tripIndex.unshift(indexEntry);
  } else {
    state.tripIndex.unshift(indexEntry);
  }
  await storeSet(KEYS.INDEX, state.tripIndex);
  showToast(currentTrip.isEditing ? t('toast.changesSaved') : t('toast.journeySaved'));
  const savedId = currentTrip.id;
  currentTrip = null;
  clearActiveTripCheckpoint();
  nav('home');
  renderHomeStats();
  openTripDetail(savedId);
}

/* ============================================================
   HISTORY
   ============================================================ */

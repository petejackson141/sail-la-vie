// ===== profile-settings.js =====
// Profile screen, auto/manual theme (day/night by sun position), unit system setting, reset all data, resume/stats screen, certificate view
// Extracted from the original single-file app.js, lines 3303-3610, in original order.

function renderProfileScreen(){
  document.getElementById('profileName').value = state.profile.name || '';
  document.getElementById('profileRole').value = state.profile.role || '';
  document.getElementById('profileLicense').value = state.profile.license || '';
  document.getElementById('profilePhone').value = state.profile.phone || '';
  document.getElementById('profileEmail').value = state.profile.email || '';
  document.getElementById('profileSocial').value = state.profile.social || '';
  document.getElementById('profileBio').value = state.profile.bio || '';
  refreshAvatars();
  const nm = state.tripIndex.reduce((s,t)=>s+(t.distanceNm||0),0);
  const secs = state.tripIndex.reduce((s,t)=>s+(t.elapsedSeconds||0),0);
  document.getElementById('profileStats').innerHTML = `<div class="stat-card stat-grid">
    <div class="cell"><div class="stat-label">${t('resume.totalSails')}</div><div class="stat-value">${state.tripIndex.length}</div></div>
    <div class="cell"><div class="stat-label">${t('resume.totalDistance')}</div><div class="stat-value">${nm.toFixed(1)}<span class="stat-unit"> NM</span></div></div>
    <div class="cell" style="margin-top:14px;"><div class="stat-label">${t('resume.timeAtSea')}</div><div class="stat-value" style="font-size:18px;">${fmtDuration(secs)}</div></div>
    <div class="cell" style="margin-top:14px;"><div class="stat-label">${t('profile.boatsSailed')}</div><div class="stat-value">${state.boats.length}</div></div>
  </div>`;
}
async function handleAvatarUpload(ev){
  const f = ev.target.files[0]; if(!f) return;
  ev.target.value='';
  openPhotoAdjuster(f, 'profile', null);
}
async function saveProfileForm(){
  state.profile.name = document.getElementById('profileName').value.trim() || t('default.sailorName');
  state.profile.role = document.getElementById('profileRole').value.trim();
  state.profile.license = document.getElementById('profileLicense').value.trim();
  state.profile.phone = document.getElementById('profilePhone').value.trim();
  state.profile.email = document.getElementById('profileEmail').value.trim();
  state.profile.social = document.getElementById('profileSocial').value.trim();
  state.profile.bio = document.getElementById('profileBio').value;
  const ok = await storeSet(KEYS.PROFILE, state.profile);
  if(ok){ showToast(t('toast.profileSaved')); document.getElementById('homeName').textContent = state.profile.name; syncProfileIfSignedIn(); }
}
async function clearProfilePrompt(){
  if(!confirm(t('confirm.clearProfile'))) return;
  const theme = state.profile.theme; // keep the current theme, units, and language choices
  const unitSystem = state.profile.unitSystem;
  const language = state.profile.language;
  state.profile = { name:'', role:'', license:'', phone:'', email:'', social:'', bio:'', avatar:'', theme, unitSystem, language };
  const ok = await storeSet(KEYS.PROFILE, state.profile);
  if(ok){
    showToast(t('toast.profileCleared'));
    document.getElementById('homeName').textContent = state.profile.name || t('default.sailorName');
    renderProfileScreen();
    refreshAvatars();
    syncProfileIfSignedIn();
  }
}
/* ============================================================
   THEME — Day / Night / Auto.
   state.profile.theme holds the person's CHOICE: 'light' | 'dark' | 'auto'.
   applyThemePreference() resolves that choice to the actual data-theme
   attribute on <html>. For 'auto' it works out sunrise/sunset for the
   device's current location (via the sunTimes() formula below — no
   network call needed) and applies Day from 30 min after sunrise until
   30 min before sunset, Night otherwise. If location isn't available it
   falls back to a fixed 07:00–19:00 "daytime" window. A 15-minute
   interval keeps auto mode current while the app is left open across
   a sunrise/sunset boundary.
   ============================================================ */
let autoThemeTimerId = null;
let cachedThemeCoords = null; // {lat, lon} — cached for the session once geolocation succeeds once
let autoThemeLocationDenied = false; // avoids re-prompting every recheck once the user has said no

function stopAutoThemeWatch(){
  if(autoThemeTimerId){ clearInterval(autoThemeTimerId); autoThemeTimerId = null; }
}

// Approximate sunrise/sunset (accurate to within a minute or two) using the
// classic US Naval Observatory / "Sunrise Equation" algorithm. Returns
// {sunrise, sunset} as Date objects in local time, or null values for a
// given key on days where the sun doesn't rise/set at that latitude
// (polar day/night) — callers fall back to the fixed-hours heuristic then.
function sunTimes(date, lat, lon){
  const rad = Math.PI/180;
  const startOfYear = new Date(Date.UTC(date.getFullYear(),0,0));
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()) - startOfYear.getTime()) / 86400000);
  const lngHour = lon/15;
  function calc(isRise){
    const tt = dayOfYear + ((isRise?6:18) - lngHour)/24;
    const M = (0.9856*tt) - 3.289;
    let L = M + (1.916*Math.sin(rad*M)) + (0.020*Math.sin(2*rad*M)) + 282.634;
    L = ((L%360)+360)%360;
    let RA = (1/rad)*Math.atan(0.91764*Math.tan(rad*L));
    RA = ((RA%360)+360)%360;
    const Lq = Math.floor(L/90)*90, RAq = Math.floor(RA/90)*90;
    RA = (RA + (Lq-RAq)) / 15;
    const sinDec = 0.39782*Math.sin(rad*L);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(rad*90.833) - (sinDec*Math.sin(rad*lat))) / (cosDec*Math.cos(rad*lat));
    if(cosH>1 || cosH<-1) return null; // sun never rises, or never sets, at this latitude today
    let H = isRise ? (360 - (1/rad)*Math.acos(cosH)) : ((1/rad)*Math.acos(cosH));
    H = H/15;
    const T = H + RA - (0.06571*tt) - 6.622;
    let UT = ((T - lngHour)%24 + 24)%24;
    return UT; // hours, UTC
  }
  function toDate(utHours){
    if(utHours==null) return null;
    const d = new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate(),0,0,0,0));
    d.setUTCMilliseconds(utHours*3600000);
    return d;
  }
  return { sunrise: toDate(calc(true)), sunset: toDate(calc(false)) };
}

async function getCoordsForAutoTheme(){
  if(cachedThemeCoords) return cachedThemeCoords;
  if(autoThemeLocationDenied || !navigator.geolocation) return null;
  try{
    const pos = await new Promise((resolve,reject)=>{
      navigator.geolocation.getCurrentPosition(resolve, reject, {maximumAge:30*60000, timeout:8000});
    });
    cachedThemeCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    return cachedThemeCoords;
  }catch(e){
    autoThemeLocationDenied = true;
    showToast(t('toast.locationUnavailable'));
    return null;
  }
}

// Resolves the actual theme ('light'|'dark') that Auto mode should show
// right now, given today's sunrise/sunset (or null if unavailable).
function computeEffectiveAutoTheme(times){
  const now = new Date();
  if(!times || !times.sunrise || !times.sunset){
    const h = now.getHours();
    return (h>=7 && h<19) ? 'light' : 'dark';
  }
  const lightStart = new Date(times.sunrise.getTime() + 30*60000);
  const darkStart = new Date(times.sunset.getTime() - 30*60000);
  if(darkStart > lightStart){
    return (now>=lightStart && now<darkStart) ? 'light' : 'dark';
  }
  // Degenerate case (very high latitude, short day) — same comparison still holds.
  return (now>=lightStart || now<darkStart) ? 'light' : 'dark';
}

async function updateAutoTheme(){
  const coords = await getCoordsForAutoTheme();
  const times = coords ? sunTimes(new Date(), coords.lat, coords.lon) : null;
  const effective = computeEffectiveAutoTheme(times);
  document.documentElement.setAttribute('data-theme', effective);
  renderThemeSettingUI(effective);
  if(!autoThemeTimerId){ autoThemeTimerId = setInterval(updateAutoTheme, 15*60000); }
}

// Applies whatever the person has chosen (state.profile.theme) to the page.
async function applyThemePreference(){
  const pref = state.profile.theme || 'light';
  if(pref === 'auto'){
    await updateAutoTheme();
  } else {
    stopAutoThemeWatch();
    document.documentElement.setAttribute('data-theme', pref);
    renderThemeSettingUI(pref);
  }
}

function renderThemeSettingUI(effective){
  document.querySelectorAll('#themeChips .chip').forEach(el=>{
    el.classList.toggle('active', el.getAttribute('data-theme-choice')===(state.profile.theme||'light'));
  });
  const status = document.getElementById('autoThemeStatus');
  if(!status) return;
  if((state.profile.theme||'light') === 'auto'){
    const label = effective==='dark' ? t('settings.nightTheme') : t('settings.dayTheme');
    status.textContent = t('settings.autoNowLabel', {theme: label});
    status.style.display = 'block';
  } else {
    status.style.display = 'none';
  }
}

async function setThemeChoice(choice){
  if(choice!=='light' && choice!=='dark' && choice!=='auto') return;
  state.profile.theme = choice;
  await storeSet(KEYS.PROFILE, state.profile);
  await applyThemePreference();
  syncProfileIfSignedIn();
}
// Sets the DEFAULT unit system used app-wide (History, trip detail, PDF,
// certificate) and as the starting point for new log entries. This is
// distinct from activeUnitSystem, which is just the current session's
// quick-flip while actively logging — see toggleLogUnitSystem() above.
async function toggleDefaultUnitSystem(){
  const next = (state.profile.unitSystem==='metric') ? 'nautical' : 'metric';
  state.profile.unitSystem = next;
  renderUnitsSettingUI();
  await storeSet(KEYS.PROFILE, state.profile);
  showToast(next==='metric' ? t('toast.unitsMetric') : t('toast.unitsNautical'));
  syncProfileIfSignedIn();
}
function renderUnitsSettingUI(){
  const sys = appUnitSystem();
  const knob = document.getElementById('unitsKnob');
  const label = document.getElementById('unitsLabel');
  if(knob) knob.textContent = sys==='metric' ? '🌍' : '⚓';
  if(label) label.textContent = sys==='metric' ? t('unit.metric') : t('unit.nautical');
}
function openResetSheet(){ openSheet('sheetReset'); }
async function resetAllData(){
  for(const t of state.tripIndex){ await storeDelete('trip:'+t.id); }
  await storeDelete(KEYS.INDEX); await storeDelete(KEYS.BOATS); await storeDelete(KEYS.CREW); await storeDelete(KEYS.PROFILE);
  state = { tripIndex:[], boats:[], crew:[], profile:{name:'',role:'',license:'',phone:'',email:'',social:'',bio:'',avatar:'',theme:'light',unitSystem:'nautical',language:'en'} };
  currentLang = 'en';
  stopAutoThemeWatch();
  cachedThemeCoords = null;
  autoThemeLocationDenied = false;
  document.documentElement.setAttribute('data-theme','light');
  applyStaticTranslations();
  renderThemeSettingUI('light');
  closeSheets(); showToast(t('toast.allDataErased'));
  refreshAvatars(); nav('home'); renderHomeStats();
}

/* ============================================================
   RESUME / CERTIFICATE
   A date-range summary (all-time, this year, last 30 days, or custom) that
   can generate a printable "sea time" certificate. Shares the same
   window.print() + #printArea trick as the trip PDF export below —
   see the note there for how that works.
   ============================================================ */
let resumeRange = 'all';
function setResumeRange(r){
  resumeRange = r;
  document.querySelectorAll('#resumeChips .chip').forEach(c=>c.classList.toggle('active', c.dataset.r===r));
  document.getElementById('resumeCustomWrap').style.display = r==='custom' ? 'grid' : 'none';
  renderResume();
}
function tripsInRange(){
  const now = new Date();
  return state.tripIndex.filter(t=>{
    const d = new Date(t.date);
    if(resumeRange==='year') return d.getFullYear()===now.getFullYear();
    if(resumeRange==='30') return (now-d)/86400000 <= 30;
    if(resumeRange==='custom'){
      const from = document.getElementById('resumeFrom').value, to = document.getElementById('resumeTo').value;
      if(from && d < new Date(from)) return false;
      if(to && d > new Date(to+'T23:59:59')) return false;
      return true;
    }
    return true;
  });
}
function renderResume(){
  const trips = tripsInRange();
  const nm = trips.reduce((s,t)=>s+(t.distanceNm||0),0);
  const secs = trips.reduce((s,t)=>s+(t.elapsedSeconds||0),0);
  const avg = secs>0 ? nm/(secs/3600) : 0;
  document.getElementById('resSails').textContent = trips.length;
  document.getElementById('resDist').innerHTML = fmtDistance(nm).replace(' ', '<span class="stat-unit"> ')+'</span>';
  document.getElementById('resTime').textContent = fmtDuration(secs);
  document.getElementById('resAvg').innerHTML = fmtSpeed(avg).replace(' ', '<span class="stat-unit"> ')+'</span>';
  const el = document.getElementById('resumeList');
  el.innerHTML = trips.length ? trips.map(trip=>`<div class="trip-card" style="margin-top:12px;" onclick="openTripDetail('${trip.id}')">
      <div class="trip-body">
        <div class="trip-title">${escapeHtml(trip.title)}</div>
        <div class="trip-meta"><span>📅 ${new Date(trip.date).toLocaleDateString(currentLocale())}</span><span>📏 ${fmtDistance(trip.distanceNm||0)}</span><span>⏱ ${fmtDuration(trip.elapsedSeconds)}</span></div>
      </div></div>`).join('')
    : `<p style="margin-top:10px;">${t('resume.emptyRange')}</p>`;
  window._resumeStats = { count:trips.length, nm, secs, avg };
}
function openCertificateSheet(){
  document.getElementById('certName').value = state.profile.name || '';
  document.getElementById('certificateOutput').innerHTML = '';
  openSheet('sheetCertificate');
}
function renderCertificate(){
  const s = window._resumeStats || {count:0,nm:0,secs:0};
  const title = document.getElementById('certTitle').value || t('cert.defaultTitle');
  const name = document.getElementById('certName').value || t('default.sailorName');
  const rangeLabel = resumeRange==='all' ? t('resume.allTime') : resumeRange==='year' ? new Date().getFullYear() : resumeRange==='30' ? t('resume.last30') :
    `${document.getElementById('resumeFrom').value||'…'} ${t('cert.to')} ${document.getElementById('resumeTo').value||'…'}`;
  const html = `<div class="certificate" id="certBlock">
    <div class="cert-title">Sail la Vie · ${escapeHtml(String(rangeLabel))}</div>
    <h2>${escapeHtml(title)}</h2>
    <p style="font-size:12px;">${t('cert.certifiesThat')}</p>
    <div class="cert-name">${escapeHtml(name)}</div>
    <p style="font-size:12px;">${t('cert.hasLogged')}</p>
    <div class="cert-stats">
      <div><span>${s.count}</span><small>${t('cert.sails')}</small></div>
      <div><span>${appUnitSystem()==='metric' ? (s.nm*NM_TO_KM).toFixed(1) : s.nm.toFixed(1)}</span><small>${distUnitLabel()}</small></div>
      <div><span>${fmtDuration(s.secs)}</span><small>${t('resume.timeAtSea')}</small></div>
    </div>
    <div class="cert-foot">${t('cert.generated')} ${new Date().toLocaleDateString(currentLocale())} · Sail la Vie Logbook</div>
  </div>
  <button class="btn btn-outline" style="margin-top:14px;" onclick="printCertificate()">${t('cert.printSave')}</button>`;
  document.getElementById('certificateOutput').innerHTML = html;
}
// Printing trick: build the certificate's HTML, drop it into the otherwise-
// empty #printArea div, then call window.print(). The @media print CSS rule
// (see <style>) hides everything else on the page during printing, so only
// #printArea's content ends up on the printed page/PDF.
function printCertificate(){
  const block = document.getElementById('certBlock');
  document.getElementById('printArea').innerHTML = block.outerHTML;
  window.print();
}

/* ============================================================
   TRIP PDF EXPORT — themeable
   Each theme is a { label, pageW, pageH, sheetClass, build(trip) } entry in
   PDF_THEMES. pageW/pageH are in pt and doubling as the CSS px grid the
   theme's HTML is laid out at, so the html2canvas capture drops onto the
   jsPDF page at 1:1 with no letterboxing. Add a future theme by adding a
   new entry here plus its `.pdf-theme-<id>` CSS block — nothing else in the
   export pipeline needs to change.
   ============================================================ */

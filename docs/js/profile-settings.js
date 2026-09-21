// ===== profile-settings.js =====
// Profile screen, auto/manual theme (day/night by sun position), unit system setting, reset all data, resume/stats screen, certificate view
// Extracted from the original single-file app.js, lines 3303-3610, in original order.

/* ============================================================
   PROFILE SCREEN — Facebook-style page, top to bottom:
     1. cover photo + round profile photo (camera badges change them)
     2. bio card: name, role/license tags, bio, contact details — read-only here;
        the "Edit Profile" button opens #sheetEditProfile with every field
     3. lifetime stats
     4. crew, as a sideways-scrolling row of people
     5. posts, newest first: past sails and planned events from the Noticeboard
   Everything is drawn by renderProfileScreen() each time the screen is opened
   (see nav()) and re-drawn by refreshProfileIfVisible() when crew, trips or
   Noticeboard plans change underneath it (cloud sync, edits from a sheet).
   state.profile gains one field for this screen: `cover` (data-URL, like `avatar`).
   ============================================================ */
let profileFeedLimit = 10; // how many posts are shown before "Show more"
let profileFeedFilter = 'all'; // 'all' | 'plan' | 'sail' — the chips above the posts (more kinds can be added later)

function setProfileFeedFilter(f){
  profileFeedFilter = f;
  profileFeedLimit = 10;
  renderProfileFeed();
}
function renderProfileScreen(){
  profileFeedLimit = 10;
  renderProfileHeader();
  renderProfileStats();
  renderProfileCrew();
  renderProfileFeed();
}
// Called from places that change data the profile shows; a no-op unless it is on screen.
function refreshProfileIfVisible(){
  const el = document.getElementById('screen-profile');
  if(el && el.classList.contains('active')){
    const keep = profileFeedLimit;
    renderProfileScreen();
    profileFeedLimit = keep; renderProfileFeed();
  }
}

function renderProfileHeader(){
  const p = state.profile;
  const img = document.getElementById('profileCoverImg'), empty = document.getElementById('profileCoverEmpty');
  if(p.cover){ img.src = p.cover; img.style.display = 'block'; empty.style.display = 'none'; }
  else { img.removeAttribute('src'); img.style.display = 'none'; empty.style.display = 'flex'; }
  refreshAvatars();
  document.getElementById('profileNameText').textContent = p.name || t('default.sailorName');
  document.getElementById('profileTags').innerHTML =
    (p.role ? `<span class="pf-tag role">${escapeHtml(p.role)}</span>` : '') +
    (p.license ? `<span class="pf-tag license">${escapeHtml(p.license)}</span>` : '');
  document.getElementById('profileBioText').textContent = p.bio || '';
  // Contact details: phone and email are tappable; a website-looking value becomes a link too
  const rows = [];
  if(p.phone) rows.push(['📞', `<a href="tel:${escapeHtml(p.phone.replace(/\s+/g,''))}">${escapeHtml(p.phone)}</a>`]);
  if(p.email) rows.push(['✉️', `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>`]);
  if(p.social){
    const looksLikeSite = /^https?:\/\//i.test(p.social) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(p.social);
    const href = /^https?:\/\//i.test(p.social) ? p.social : 'https://' + p.social;
    rows.push(['🔗', looksLikeSite ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(p.social)}</a>` : `<span>${escapeHtml(p.social)}</span>`]);
  }
  document.getElementById('profileContacts').innerHTML = rows.map(([ico, html])=>`<div class="pf-contact"><span aria-hidden="true">${ico}</span>${html}</div>`).join('');
  document.getElementById('profileEmptyHint').style.display = (p.role || p.license || p.bio || rows.length) ? 'none' : 'block';
}

function renderProfileStats(){
  const nm = state.tripIndex.reduce((s,t)=>s+(t.distanceNm||0),0);
  const secs = state.tripIndex.reduce((s,t)=>s+(t.elapsedSeconds||0),0);
  document.getElementById('profileStats').innerHTML = `<div class="stat-card stat-grid">
    <div class="cell"><div class="stat-label">${t('resume.totalSails')}</div><div class="stat-value">${state.tripIndex.length}</div></div>
    <div class="cell"><div class="stat-label">${t('resume.totalDistance')}</div><div class="stat-value">${nm.toFixed(1)}<span class="stat-unit"> NM</span></div></div>
    <div class="cell"><div class="stat-label">${t('resume.timeAtSea')}</div><div class="stat-value" style="font-size:18px;">${fmtDuration(secs)}</div></div>
    <div class="cell"><div class="stat-label">${t('profile.boatsSailed')}</div><div class="stat-value">${state.boats.length}</div></div>
  </div>`;
}

// Crew as a sideways-scrolling row of photo cards (tap one to open that crew member),
// ending with a dashed "Add crew" card.
function openCrewById(id){ openCrewSheet(state.crew.find(c=>c.id===id)); }
function renderProfileCrew(){
  const sorted = [...state.crew].sort((a,b)=>a.name.localeCompare(b.name));
  const cards = sorted.map(c=>`<div class="pf-crew-card" onclick="openCrewById('${c.id}')">
      <img src="${c.photo || placeholderAvatar()}" alt="">
      <div class="nm">${escapeHtml(c.name)}</div>
      <div class="sb">${escapeHtml(c.note || '')}</div>
    </div>`).join('');
  document.getElementById('profileCrew').innerHTML = `<div class="pf-crew-scroll">${cards}
    <div class="pf-crew-add" onclick="openCrewSheet()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      <span>${t('profile.addCrewCard')}</span>
    </div>
  </div>`;
}

// Posts: every logged sail plus every Noticeboard plan, newest first. Built as a
// generic list of {kind, ts, ...} items so other kinds (comments…) can be added later.
function buildProfileFeed(){
  const items = [];
  state.tripIndex.forEach(tr=> items.push({kind:'sail', ts: Date.parse(tr.date) || 0, tr}));
  (state.noticeboard||[]).forEach(e=>{
    const d = dtParseDate(e.date);
    const tm = /^(\d{2}):(\d{2})$/.exec(e.time || '');
    items.push({kind:'plan', ts: d ? new Date(d.y, d.m, d.d, tm ? +tm[1] : 12, tm ? +tm[2] : 0).getTime() : 0, e});
  });
  return items.sort((a,b)=>b.ts - a.ts).filter(it=> profileFeedFilter === 'all' || it.kind === profileFeedFilter);
}
function renderProfileFeed(){
  const el = document.getElementById('profileFeed');
  document.querySelectorAll('#profileFeedChips .chip').forEach(c=>c.classList.toggle('active', c.dataset.f === profileFeedFilter));
  const items = buildProfileFeed();
  if(!items.length){
    // wording follows the chip that is selected: "No sails yet" under Sails, and so on
    const key = profileFeedFilter === 'sail' ? 'noSails' : profileFeedFilter === 'plan' ? 'noPlans' : 'noPosts';
    el.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5h16v11H8l-4 4z"/></svg>
      <h3>${t('profile.' + key)}</h3><p>${t('profile.' + key + 'Hint')}</p></div>`;
    return;
  }
  const avatar = state.profile.avatar || placeholderAvatar();
  const who = escapeHtml(state.profile.name || t('default.sailorName'));
  const shown = items.slice(0, profileFeedLimit);
  el.innerHTML = shown.map(it=> it.kind === 'sail' ? sailPostHtml(it.tr, avatar, who) : planPostHtml(it.e, avatar, who)).join('') +
    (items.length > shown.length ? `<button class="btn btn-tonal" style="margin-top:14px;" onclick="showMoreProfilePosts()">${t('profile.showMore')}</button>` : '');
}
function showMoreProfilePosts(){ profileFeedLimit += 10; renderProfileFeed(); }

function sailPostHtml(tr, avatar, who){
  const boat = tr.boatId ? state.boats.find(b=>b.id===tr.boatId) : null;
  const dateStr = new Date(tr.date).toLocaleDateString(currentLocale(), {day:'numeric', month:'short', year:'numeric'});
  const meta = [tr.place ? '📍 ' + escapeHtml(tr.place) : '', boat ? '⛵ ' + escapeHtml(boat.name) : ''].filter(Boolean).join(' · ');
  const chips = [];
  if(tr.distanceNm) chips.push('📏 ' + fmtDistance(tr.distanceNm));
  if(tr.elapsedSeconds) chips.push('⏱ ' + fmtDuration(tr.elapsedSeconds));
  if(tr.avgSpeed) chips.push('💨 ' + fmtSpeed(tr.avgSpeed));
  return `<div class="post-card" onclick="openTripDetail('${tr.id}','profile')">
    <div class="post-head"><img src="${avatar}" alt=""><div class="post-who"><div class="post-name">${who}</div><div class="post-when">${dateStr}</div></div><span class="post-badge sail">⛵ ${t('profile.postSail')}</span></div>
    <div class="post-title">${escapeHtml(tr.title || t('detail.tripFallback'))}</div>
    ${meta ? `<div class="post-meta">${meta}</div>` : ''}
    ${tr.notes ? `<div class="post-text">${escapeHtml(tr.notes)}</div>` : ''}
    ${tr.coverPhoto ? `<img class="post-photo" src="${tr.coverPhoto}" alt="">` : ''}
    ${chips.length ? `<div class="post-chips">${chips.map(c=>`<span class="post-chip">${c}</span>`).join('')}</div>` : ''}
  </div>`;
}
function planPostHtml(e, avatar, who){
  const p = dtParseDate(e.date);
  const boat = e.boatId ? state.boats.find(b=>b.id===e.boatId) : null;
  const dateStr = p ? dtFmtDate(p, {weekday:'short', day:'numeric', month:'short', year:'numeric'}) : '';
  const meta = [e.time ? '🕐 ' + e.time : '', e.place ? '📍 ' + escapeHtml(e.place) : '', boat ? '⛵ ' + escapeHtml(boat.name) : ''].filter(Boolean).join(' · ');
  return `<div class="post-card plan" onclick="openNoticeboardSheet('${e.id}')">
    <div class="post-head"><img src="${avatar}" alt=""><div class="post-who"><div class="post-name">${who}</div><div class="post-when">${dateStr} · ${noticeboardWhenLabel(noticeboardDaysFromToday(e.date))}</div></div><span class="post-badge plan">📌 ${t('profile.postPlan')}</span></div>
    <div class="post-title">${escapeHtml(e.title)}</div>
    ${meta ? `<div class="post-meta">${meta}</div>` : ''}
    ${e.notes ? `<div class="post-text">${escapeHtml(e.notes)}</div>` : ''}
  </div>`;
}

/* ---------- photos ---------- */
// Tapping the cover or profile picture just enlarges it in the photo viewer (swipe/zoom like any
// other photo). Changing a picture only happens through the camera buttons / Edit Profile.
function viewProfilePhoto(which){
  const src = which === 'cover' ? state.profile.cover : state.profile.avatar;
  if(src) openLightbox([src], 0, null);
}
// Both photo pickers can be started from the Edit Profile sheet; if it's open, come back to it
// afterwards (so half-typed edits aren't lost) instead of closing everything.
function profileReturnSheet(){ return document.getElementById('sheetEditProfile').style.display === 'block' ? 'sheetEditProfile' : null; }
async function handleAvatarUpload(ev){
  const f = ev.target.files[0]; if(!f) return;
  ev.target.value='';
  openPhotoAdjuster(f, 'profile', profileReturnSheet());
}
async function handleCoverUpload(ev){
  const f = ev.target.files[0]; if(!f) return;
  ev.target.value='';
  // wide crop, roughly Facebook's cover shape (8:3)
  openPhotoAdjuster(f, 'profileCover', profileReturnSheet(), {shape:'rect', vw:320, vh:120, outputW:1000, outputH:375});
}

/* ---------- Edit Profile sheet ---------- */
function openEditProfileSheet(){
  const p = state.profile;
  document.getElementById('profileName').value = p.name || '';
  document.getElementById('profileRole').value = p.role || '';
  document.getElementById('profileLicense').value = p.license || '';
  document.getElementById('profilePhone').value = p.phone || '';
  document.getElementById('profileEmail').value = p.email || '';
  document.getElementById('profileSocial').value = p.social || '';
  document.getElementById('profileBio').value = p.bio || '';
  openSheet('sheetEditProfile');
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
  if(ok){
    showToast(t('toast.profileSaved'));
    document.getElementById('homeName').textContent = state.profile.name;
    syncProfileIfSignedIn();
    closeSheets();
    renderProfileHeader();
    renderProfileFeed(); // posts carry the name
  }
}
async function clearProfilePrompt(){
  if(!confirm(t('confirm.clearProfile'))) return;
  const theme = state.profile.theme; // keep the current theme, units, and language choices
  const unitSystem = state.profile.unitSystem;
  const language = state.profile.language;
  state.profile = { name:'', role:'', license:'', phone:'', email:'', social:'', bio:'', avatar:'', cover:'', theme, unitSystem, language };
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
  await storeDelete(KEYS.INDEX); await storeDelete(KEYS.BOATS); await storeDelete(KEYS.CREW); await storeDelete(KEYS.NOTICEBOARD); await storeDelete(KEYS.PROFILE);
  state = { tripIndex:[], boats:[], crew:[], noticeboard:[], viewPrefs:{ boats:'list', crew:'list' }, profile:{name:'',role:'',license:'',phone:'',email:'',social:'',bio:'',avatar:'',theme:'light',unitSystem:'nautical',language:'en'} };
  syncNoticeboardReminders(); // nothing left on the Noticeboard -> cancel any pending reminders
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

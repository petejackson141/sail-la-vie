// ===== gpx-import.js =====
// "Import a GPX track" on the Manually log a sail screen (30.10.2026).
//
// Reads a .gpx file (from another app, a chartplotter, a watch, a friend…),
// and fills in the form from it: date and start time, duration, distance,
// average and max speed. The track itself is kept on the sail, so the sail
// gets a real map, a PDF route map and can be sent on as GPX again.
//
// An imported track is NOT counted as GPS-recorded by Sail la Vie: a GPX file
// can come from anywhere and can be edited, so the app can't vouch for it.
// The sail is marked "Imported track" (trip.importedTrack) and only counts on
// the general Sailing Record, never on the GPS Sea Time Record.

const GPX_MAX_POINTS = 4000; // very long tracks are thinned to this many points (invisible on a map)
// GPS "jumps": a point that would need more than this speed to reach is
// skipped. Same 30 kt limit as live tracking. Kept here in this file since
// 04.11.2026: it used to borrow a speed limit from journey.js that no longer
// exists there, so every GPX import failed with "is not defined".
const GPX_MAX_PLAUSIBLE_SPEED_KT = 30;
const GPX_EARLIEST_TIME = Date.UTC(2000, 0, 1); // time stamps before this are ignored

function openGpxImport(){
  if(!currentTrip || !currentTrip.isManual){ return; }
  const inp = document.getElementById('gpxFileInput');
  inp.value = '';
  inp.click();
}

// Reads every point (track points, or route points if there are no track
// points) with its time if it has one.
function parseGpx(text){
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if(xml.getElementsByTagName('parsererror').length) throw new Error('not a GPX file');
  let nodes = Array.from(xml.getElementsByTagName('trkpt'));
  if(!nodes.length) nodes = Array.from(xml.getElementsByTagName('rtept'));
  const pts = nodes.map(n=>{
    const lat = parseFloat(n.getAttribute('lat')), lng = parseFloat(n.getAttribute('lon'));
    const tEl = n.getElementsByTagName('time')[0];
    const t = tEl ? Date.parse(tEl.textContent.trim()) : NaN;
    // Some apps write a "zero" time (1 Jan 1970) or a nonsense date on a few
    // points. Treat anything before 2000 or more than a day in the future as
    // "no time", or it gets used as the start and the duration comes out as
    // decades (seen 04.11.2026: 489517 hours from a SeaPeople file).
    const okTime = !isNaN(t) && t >= GPX_EARLIEST_TIME && t <= Date.now() + 86400000;
    return { lat, lng, t: okTime ? t : null };
  }).filter(p=>isFinite(p.lat) && isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180);
  const nameEl = xml.querySelector('trk > name') || xml.querySelector('metadata > name');
  return { points: pts, name: nameEl ? nameEl.textContent.trim() : '' };
}

// Works out the numbers from the points.
//   GPS "jumps" (a point that would need more than GPX_MAX_PLAUSIBLE_SPEED_KT to
//   reach) are left out first, the same rule live tracking uses
//   distance — sum of the legs between the remaining points
//   duration — first to last time stamp
//   max speed — over stretches of at least 30 seconds, so one noisy point
//               can't produce a silly top speed
function gpxCleanPoints(points){
  const out = [];
  for(const p of points){
    const prev = out[out.length-1];
    if(prev && prev.t!=null && p.t!=null && p.t > prev.t){
      const kt = haversineNm(prev, p) / ((p.t - prev.t)/3600000);
      if(kt >= GPX_MAX_PLAUSIBLE_SPEED_KT) continue; // a jump — skip this point
    }
    out.push(p);
  }
  return out;
}
function gpxStats(points){
  // Use the points that have a (sensible) time, in time order. If fewer than
  // two have one, use every point in file order instead (distance only).
  const timedIn = points.filter(p=>p.t!=null);
  const pts = timedIn.length >= 2 ? gpxCleanPoints(timedIn.sort((a,b)=>a.t-b.t)) : points;
  let nm = 0;
  for(let i=1;i<pts.length;i++) nm += haversineNm(pts[i-1], pts[i]);
  const timed = pts.filter(p=>p.t!=null);
  const secs = timed.length>1 ? Math.round((timed[timed.length-1].t - timed[0].t)/1000) : 0;
  let maxKt = 0;
  for(let i=0, j=0; i<timed.length; i++){
    if(j < i) j = i;
    while(j < timed.length-1 && (timed[j].t - timed[i].t) < 30000) j++;
    const dt = (timed[j].t - timed[i].t)/3600000;
    if(dt <= 0) continue;
    let d = 0; for(let k=i+1;k<=j;k++) d += haversineNm(timed[k-1], timed[k]);
    const kt = d/dt;
    if(kt < GPX_MAX_PLAUSIBLE_SPEED_KT) maxKt = Math.max(maxKt, kt);
  }
  return { nm, secs, avgKt: secs>0 ? nm/(secs/3600) : 0, maxKt, start: timed.length ? timed[0].t : null, points: pts };
}

async function handleGpxFile(ev){
  const file = ev.target.files && ev.target.files[0];
  if(!file || !currentTrip) return;
  try{
    const { points, name } = parseGpx(await file.text());
    if(points.length < 2){ showToast(t('gpx.noPoints')); return; }
    const s = gpxStats(points);
    // keep the track (thinned if huge, start and finish always kept)
    const clean = s.points;
    const step = Math.max(1, Math.ceil(clean.length / GPX_MAX_POINTS));
    currentTrip.path = clean.filter((p,i)=> i%step===0 || i===clean.length-1);
    currentTrip.importedTrack = { fileName: file.name, points: points.length, importedAt: new Date().toISOString() };

    // fill in the form (the person can still change anything before saving)
    const sys = activeUnitSystem;
    if(s.start != null){
      const d = new Date(s.start); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      document.getElementById('pastDate').value = d.toISOString().slice(0,16);
      refreshPastDateDisplay();
    }
    if(s.secs){
      const mins = Math.round(s.secs/60);
      document.getElementById('pastHours').value = Math.floor(mins/60);
      document.getElementById('pastMinutes').value = mins%60;
    }
    document.getElementById('pastDistance').value = (sys==='metric' ? s.nm*NM_TO_KM : s.nm).toFixed(1);
    document.getElementById('pastAvgSpeed').value = s.avgKt ? fmtSpeed(s.avgKt, sys).split(' ')[0] : '';
    document.getElementById('pastMaxSpeed').value = s.maxKt ? fmtSpeed(s.maxKt, sys).split(' ')[0] : '';
    if(name && !document.getElementById('tripTitle').value.trim()) document.getElementById('tripTitle').value = name;
    renderGpxImportStatus();
    if(currentTrip.path.length) autoFillPlaceFrom(currentTrip.path[0].lat, currentTrip.path[0].lng); // name where the track starts (only if Place is empty)
    if(typeof saveActiveTripCheckpoint === 'function') saveActiveTripCheckpoint();
    showToast(s.secs ? t('gpx.imported') : t('gpx.importedNoTimes'));
  }catch(e){
    console.error('GPX import failed', e);
    showToast(t('gpx.failed'));
  }
}

function removeImportedGpx(){
  if(!currentTrip) return;
  currentTrip.path = [];
  delete currentTrip.importedTrack;
  renderGpxImportStatus();
}

// The little line under the button: "Imported: harbour.gpx · 1,240 points · Remove"
function renderGpxImportStatus(){
  const el = document.getElementById('gpxImportStatus'); if(!el) return;
  // long file names with no spaces (SeaPeople's are ~100 characters) must wrap,
  // or they push the whole screen sideways
  el.style.overflowWrap = 'anywhere'; el.style.wordBreak = 'break-word';
  const it = currentTrip && currentTrip.importedTrack;
  el.innerHTML = it && currentTrip.path && currentTrip.path.length > 1
    ? `${t('gpx.status', {file: escapeHtml(it.fileName||'GPX'), n: (it.points||currentTrip.path.length).toLocaleString()})} · <a href="#" onclick="event.preventDefault();removeImportedGpx()">${t('gpx.remove')}</a>`
    : '';
}
// Shown on new manual logs and when editing a manual log; hidden on GPS sails (locked).
function showGpxImportCard(show){
  const card = document.getElementById('gpxImportCard'); if(card) card.style.display = show ? 'block' : 'none';
  renderGpxImportStatus();
}

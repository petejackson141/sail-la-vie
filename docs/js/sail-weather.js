// ===== sail-weather.js =====
// "Weather on the water" — an automatic weather report for a GPS-tracked sail.
//
// How it works: the departure snapshot (trip.weather, filled in at Cast Off)
// stays exactly as it was. When a tracked sail is saved, it gets
// trip.weatherReport = {status:'pending'}. As soon as the phone is online
// (straight away, or later if the sail ended with no signal) we walk back
// along the recorded GPS track, take one sample per hour (position + time),
// and ask Open-Meteo (free, no API key — same service Cast Off already uses)
// what the conditions were at each of those points at that hour. The
// samples are saved into the trip record, so they sync to the cloud with
// the rest of the sail, and the summary/chart are worked out from them each
// time the sail's page is drawn.
//
// This is weather-MODEL data, not a reading from an instrument on the boat,
// which is why the card says "reported conditions" and lets the sailor add
// their own observations alongside it.
//
// Older sails (saved before this feature) get a "Get weather report" button
// instead of being changed silently.

const WX_PENDING_KEY = 'weatherPending'; // ids of this device's sails still waiting for a report
const WX_MAX_SAMPLES = 12;               // one per hour; longer passages are spread evenly over 12
const WX_HOUR = 3600000;
const wxInFlight = {};

/* ---------- pending list (so a sail ended offline gets filled in later) ---------- */
async function wxPendingList(){ return (await storeGet(WX_PENDING_KEY)) || []; }
async function wxAddPending(id){
  const l = await wxPendingList();
  if(!l.includes(id)){ l.push(id); await storeSet(WX_PENDING_KEY, l); }
}
async function wxRemovePending(id){
  const l = await wxPendingList();
  if(l.includes(id)) await storeSet(WX_PENDING_KEY, l.filter(x=>x!==id));
}
async function processWeatherPending(){
  if(!navigator.onLine) return;
  const l = await wxPendingList();
  for(const id of l){ await fillSailWeather(id); }
}
window.addEventListener('online', ()=> processWeatherPending());
window.addEventListener('load', ()=> setTimeout(processWeatherPending, 5000)); // after boot() has settled

// Called from finalizeSaveTrip() for a newly recorded (GPS) sail.
function wxHasTrack(trip){ return !!(trip && trip.path && trip.path.length>1 && trip.path[0].t); }

/* ---------- manually logged sails (02.11.2026) ----------
   Every sail can now get the same report, whatever it has to go on:
     'track'       — GPS points with times (recorded, or an imported GPX with times)
     'spreadTrack' — an imported GPX without times: the points are spread evenly
                     over the logged start time and duration, so it still follows the route
     'place'       — no track: the Place name is looked up on the map and the
                     weather is taken there, hour by hour over the logged duration
     'needPlace'   — no track and no Place name: the sailor is asked to add one
   (null = nothing to go on, e.g. no date.) */
Object.assign(TRANSLATIONS.en, {
  'wx.olderSailPlace': 'Get a report of the wind, waves and pressure at {place} during this sail.',
  'wx.fetchingPlace': 'Getting the weather at {place}…',
  'wx.needPlace': 'Add the place you sailed from (tap Edit, then Place) and the weather for this sail will be added automatically.',
  'wx.placeNotFound': 'We couldn\'t find "{place}" on the map. Try a fuller name, e.g. "Herzliya Marina, Israel" (tap Edit, then Place).',
  'wx.sourcePlace': 'Reported conditions from weather-model data at {place} over the time of your sail (Open-Meteo). Local gusts and sea breezes may differ from what you saw on the water.',
  'wx.hourlyPlace': 'Hourly readings during the sail',
  'wx.askPlaceTitle': 'Where did you sail from?',
  'wx.askPlaceBody': 'Add a place name (e.g. "Herzliya Marina") and the app will look up the wind, waves and pressure for this sail.',
  'wx.askPlaceOk': 'Add a place',
  'wx.askPlaceSkip': 'Save without weather',
});
function wxSourceFor(trip){
  if(!trip) return null;
  if(wxHasTrack(trip)) return 'track';
  const start = trip.date ? new Date(trip.date).getTime() : NaN;
  if(!isFinite(start) || start > Date.now()) return null;   // no date, or a sail still to come
  if(trip.path && trip.path.length>1 && trip.elapsedSeconds>0) return 'spreadTrack';
  return (trip.place||'').trim() ? 'place' : 'needPlace';
}
function wxCanReport(trip){ return ['track','spreadTrack','place'].includes(wxSourceFor(trip)); }
// What the report was worked out from — if the date, duration or place is
// edited later, the report is fetched again.
function wxBasisKey(trip){
  const src = wxSourceFor(trip);
  if(src==='track') return 'track';
  return [src, trip.date, trip.elapsedSeconds||0, src==='place' ? (trip.place||'').trim().toLowerCase() : (trip.path||[]).length].join('|');
}
function wxNeedsReport(trip){
  if(!wxCanReport(trip)) return false;
  const rep = trip.weatherReport;
  if(!rep) return true;
  if(rep.status==='pending') return true;
  if(rep.basis) return rep.basis !== wxBasisKey(trip);       // changed since → fetch again
  return rep.status !== 'ready';                              // older reports (no basis) stay as they are once ready
}
// Place name → position. OpenStreetMap first (knows marinas and clubs), then
// Open-Meteo's town list as a fallback. Same rules as lookupPlaceName() in journey.js.
async function wxGeocodePlace(place){
  const q = encodeURIComponent(place.trim());
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}&accept-language=${encodeURIComponent(currentLang||'en')}&email=${encodeURIComponent(typeof PLACE_LOOKUP_EMAIL!=='undefined' ? PLACE_LOOKUP_EMAIL : 'sailapp141@gmail.com')}`);
    if(r.ok){ const j = await r.json(); if(j && j[0]) return { lat:+(+j[0].lat).toFixed(3), lng:+(+j[0].lon).toFixed(3) }; }
  }catch(e){ if(!navigator.onLine) throw e; }
  const r2 = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${q}`);
  if(r2.ok){ const j = await r2.json(); if(j && j.results && j.results[0]) return { lat:+j.results[0].latitude.toFixed(3), lng:+j.results[0].longitude.toFixed(3) }; }
  return null;
}
// The points (with times) the weather is sampled from, for any kind of sail.
// Returns {path} or {notFound:true}.
async function wxPathFor(trip){
  const src = wxSourceFor(trip);
  if(src==='track') return { path: trip.path };
  const start = new Date(trip.date).getTime();
  const dur = Math.max(0, (trip.elapsedSeconds||0)*1000);
  if(src==='spreadTrack'){
    const n = trip.path.length;
    return { path: trip.path.map((p,i)=>({ lat:p.lat, lng:p.lng, t: start + (n>1 ? dur*i/(n-1) : 0) })) };
  }
  if(src==='place'){
    const pos = await wxGeocodePlace(trip.place);
    if(!pos) return { notFound:true };
    return { path: [{...pos, t:start}, {...pos, t:start+dur}], location: { ...pos, place: trip.place.trim() } };
  }
  return { path: [] };
}
async function queueSailWeather(id){
  await wxAddPending(id);
  fillSailWeather(id);
}

/* ---------- sampling the track ---------- */
function wxNearestPoint(pts, target){
  let lo=0, hi=pts.length-1;
  while(hi-lo>1){ const mid=(lo+hi)>>1; if(pts[mid].t<target) lo=mid; else hi=mid; }
  return Math.abs(pts[lo].t-target) <= Math.abs(pts[hi].t-target) ? pts[lo] : pts[hi];
}
function wxSampleTrack(path){
  const pts = (path||[]).filter(p=>p && p.t && isFinite(p.lat) && isFinite(p.lng));
  if(!pts.length) return [];
  const t0 = pts[0].t, t1 = pts[pts.length-1].t;
  let hours = [];
  for(let h=Math.round(t0/WX_HOUR)*WX_HOUR; h<=Math.round(t1/WX_HOUR)*WX_HOUR; h+=WX_HOUR) hours.push(h);
  if(!hours.length) hours = [Math.round(t0/WX_HOUR)*WX_HOUR];
  if(hours.length>WX_MAX_SAMPLES){
    const step = (hours.length-1)/(WX_MAX_SAMPLES-1);
    hours = Array.from({length:WX_MAX_SAMPLES}, (_,i)=>hours[Math.round(i*step)]);
  }
  return hours.map(h=>{
    const p = wxNearestPoint(pts, Math.min(Math.max(h,t0),t1));
    return { t:h, lat:+p.lat.toFixed(3), lng:+p.lng.toFixed(3) };
  });
}

/* ---------- fetching ---------- */
function wxDay(ms){ return new Date(ms).toISOString().slice(0,10); }
function wxHourKey(ms){ return new Date(ms).toISOString().slice(0,13)+':00'; }
async function wxFetchJson(url){
  const r = await fetch(url, {cache:'no-store'});
  if(!r.ok){ const e = new Error('HTTP '+r.status); e.http = true; throw e; }
  const j = await r.json();
  return Array.isArray(j) ? j : [j]; // one location -> object, several -> array
}
// Several positions in one request where possible; if that ever fails with an
// HTTP error, fall back to asking one position at a time.
async function wxFetchPerSample(buildUrl, samples){
  try{
    const res = await wxFetchJson(buildUrl(samples));
    if(res.length===samples.length) return res;
  }catch(e){ if(!e.http) throw e; }
  const out = [];
  for(const s of samples){ out.push((await wxFetchJson(buildUrl([s])))[0]); }
  return out;
}
function wxValueAt(loc, key, hourKey){
  if(!loc || !loc.hourly || !loc.hourly.time) return null;
  const i = loc.hourly.time.indexOf(hourKey);
  if(i<0) return null;
  const v = loc.hourly[key] && loc.hourly[key][i];
  return (v==null || isNaN(v)) ? null : v;
}
async function fetchSailWeatherSamples(path){
  const samples = wxSampleTrack(path);
  if(!samples.length) return [];
  const start = wxDay(samples[0].t), end = wxDay(samples[samples.length-1].t);
  const ageDays = (Date.now()-samples[0].t)/86400000;
  // The normal forecast service keeps roughly the last three months; older
  // sails use Open-Meteo's archive of past forecasts instead (from 2022), and
  // sails before that its long-term climate archive (back to 1940).
  const base = samples[0].t < Date.UTC(2022,0,1) ? 'https://archive-api.open-meteo.com/v1/archive'
    : ageDays>85 ? 'https://historical-forecast-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast';
  const coords = s => `latitude=${s.map(x=>x.lat).join(',')}&longitude=${s.map(x=>x.lng).join(',')}`;
  const wxUrl = s => `${base}?${coords(s)}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,pressure_msl,weather_code&wind_speed_unit=kn&timezone=GMT&start_date=${start}&end_date=${end}`;
  const seaUrl = s => `https://marine-api.open-meteo.com/v1/marine?${coords(s)}&hourly=wave_height,wave_direction&timezone=GMT&start_date=${start}&end_date=${end}`;

  const [wx, sea] = await Promise.all([
    wxFetchPerSample(wxUrl, samples),
    wxFetchPerSample(seaUrl, samples).catch(e=>{ if(!e.http) throw e; return []; }) // waves are a bonus — no marine data (e.g. very old sail) is fine
  ]);
  return samples.map((s,i)=>{
    const k = wxHourKey(s.t);
    return {
      t:s.t, lat:s.lat, lng:s.lng,
      wind: wxValueAt(wx[i],'wind_speed_10m',k),
      gust: wxValueAt(wx[i],'wind_gusts_10m',k),
      dir:  wxValueAt(wx[i],'wind_direction_10m',k),
      temp: wxValueAt(wx[i],'temperature_2m',k),
      pres: wxValueAt(wx[i],'pressure_msl',k),
      code: wxValueAt(wx[i],'weather_code',k),
      wave: wxValueAt(sea[i],'wave_height',k),
      waveDir: wxValueAt(sea[i],'wave_direction',k),
    };
  }).filter(s=>s.wind!=null);
}

/* ---------- filling a sail's report ---------- */
function fillSailWeather(id){
  if(wxInFlight[id]) return wxInFlight[id];
  wxInFlight[id] = (async()=>{
    let trip = await storeGet('trip:'+id);
    if(!trip || !wxCanReport(trip)){ await wxRemovePending(id); return; }
    if(trip.weatherReport && trip.weatherReport.status==='ready' && !wxNeedsReport(trip)){ await wxRemovePending(id); return; }
    if(!navigator.onLine) return; // stays pending — the 'online' listener retries

    let report;
    const basis = wxBasisKey(trip);
    const src = wxSourceFor(trip);
    try{
      const where = await wxPathFor(trip);
      if(where.notFound){
        report = { status:'placeNotFound', place: trip.place, basis, fetchedAt:new Date().toISOString() };
      } else {
        const samples = await fetchSailWeatherSamples(where.path);
        report = samples.length
          ? { status:'ready', source:'Open-Meteo', from: src, location: where.location || null, basis, fetchedAt:new Date().toISOString(), samples }
          : { status:'unavailable', basis, fetchedAt:new Date().toISOString() };
      }
    }catch(e){
      if(!e.http) return; // no connection after all — stays pending, tried again later
      report = { status:'unavailable', basis, fetchedAt:new Date().toISOString() };
    }

    // Re-read in case the sail was edited while we were fetching, so nothing else gets overwritten.
    trip = await storeGet('trip:'+id);
    if(!trip) { await wxRemovePending(id); return; }
    if(wxBasisKey(trip) !== basis){ fillSailWeather._again = id; return; } // date/place edited meanwhile — fetch again below
    trip.weatherReport = report;
    trip.updatedAt = new Date().toISOString();
    await storeSet('trip:'+id, trip);
    await wxRemovePending(id);
    syncTripIfSignedIn(trip);
    // Keep an open edit form / open sail page in step with the saved record.
    if(typeof currentTrip!=='undefined' && currentTrip && currentTrip.id===id){ currentTrip.weatherReport = report; currentTrip.updatedAt = trip.updatedAt; }
    if(window._detailTrip && window._detailTrip.id===id && !window._friendDetail){
      window._detailTrip.weatherReport = report;
      window._detailTrip.updatedAt = trip.updatedAt;
      rerenderSailWeatherCard();
    }
  })().finally(()=>{
    delete wxInFlight[id];
    if(fillSailWeather._again===id){ fillSailWeather._again = null; fillSailWeather(id); }
  });
  return wxInFlight[id];
}
// "Get weather report" button on an older sail, and "Try again" on an unavailable one.
async function requestSailWeather(){
  const trip = window._detailTrip;
  if(!trip || window._friendDetail) return;
  if(!navigator.onLine){ showToast(t('wx.needConnection')); }
  trip.weatherReport = {status:'pending'};
  const saved = await storeGet('trip:'+trip.id);
  if(saved){ saved.weatherReport = {status:'pending'}; await storeSet('trip:'+trip.id, saved); }
  rerenderSailWeatherCard();
  queueSailWeather(trip.id);
}

/* ---------- your own observations ---------- */
function editSailWeatherObs(){
  const box = document.getElementById('wxObsBox');
  if(!box) return;
  const cur = (window._detailTrip && window._detailTrip.weatherObs) || '';
  box.className = 'wx-obs editing';
  box.onclick = null;
  box.innerHTML = `
    <textarea id="wxObsInput" rows="3" placeholder="${escapeHtml(t('wx.obsPlaceholder'))}">${escapeHtml(cur)}</textarea>
    <div class="wx-obs-actions">
      <button class="btn btn-outline" onclick="rerenderSailWeatherCard()">${t('wx.cancel')}</button>
      <button class="btn btn-primary" onclick="saveSailWeatherObs()">${t('wx.save')}</button>
    </div>`;
  document.getElementById('wxObsInput').focus();
}
async function saveSailWeatherObs(){
  const trip = window._detailTrip;
  const input = document.getElementById('wxObsInput');
  if(!trip || !input) return;
  const text = input.value.trim();
  const saved = await storeGet('trip:'+trip.id);
  if(!saved){ showToast(t('toast.saveFailed')); return; }
  saved.weatherObs = text;
  saved.updatedAt = new Date().toISOString();
  if(!(await storeSet('trip:'+trip.id, saved))){ showToast(t('toast.saveFailed')); return; }
  trip.weatherObs = text; trip.updatedAt = saved.updatedAt;
  syncTripIfSignedIn(saved);
  rerenderSailWeatherCard();
}

/* ---------- summary ---------- */
function wxAngleDiff(a,b){ return ((b-a+540)%360)-180; } // signed, -180..180
function wxSpd(kts){
  return appUnitSystem()==='metric' ? Math.round(kts*KT_TO_KMH)+' km/h' : Math.round(kts)+' kts';
}
function wxSpdVal(kts){ return appUnitSystem()==='metric' ? kts*KT_TO_KMH : kts; }
function wxTime(ms){ return new Date(ms).toLocaleTimeString(currentLocale(), {hour:'numeric', minute:'2-digit'}); }
function wxCompass(deg){ return compassLabel(degToCompass8(deg)) || '—'; }

function wxSummarise(samples, departure){
  const s = samples;
  const winds = s.map(x=>x.wind);
  const gusts = s.map(x=>x.gust).filter(v=>v!=null);
  const temps = s.map(x=>x.temp).filter(v=>v!=null);
  const waves = s.map(x=>x.wave).filter(v=>v!=null);
  const first = s[0], last = s[s.length-1];
  let peak = s[0]; s.forEach(x=>{ if(x.wind>peak.wind) peak = x; });
  let low = s[0];  s.forEach(x=>{ if(x.wind<low.wind) low = x; });
  const maxGust = gusts.length ? Math.max(...gusts) : null;
  const shift = (first.dir!=null && last.dir!=null) ? wxAngleDiff(first.dir, last.dir) : 0;
  const bigShift = Math.abs(shift)>=35;
  const presFirst = first.pres, presLast = last.pres;
  const presDiff = (presFirst!=null && presLast!=null) ? presLast-presFirst : null;

  const w = (x, withDir)=> withDir ? `${wxSpd(x.wind)} ${wxCompass(x.dir)}` : wxSpd(x.wind);
  const parts = [];
  // Wind story: built / eased / steady, with direction when it swung round.
  if(s.length>1 && peak.wind-first.wind>=3 && peak!==first){
    let line = t('wx.sumBuilt', {from:w(first, bigShift), to:w(peak, bigShift), time:wxTime(peak.t)});
    if(maxGust!=null) line += t('wx.sumGusting', {gust:wxSpd(maxGust)});
    if(peak!==last && peak.wind-last.wind>=3) line += t('wx.sumThenEased', {to:wxSpd(last.wind)});
    parts.push(line+'.');
  } else if(s.length>1 && first.wind-last.wind>=3){
    let line = t('wx.sumEased', {from:w(first, bigShift), to:w(last, bigShift)});
    if(maxGust!=null) line += t('wx.sumGusting', {gust:wxSpd(maxGust)});
    parts.push(line+'.');
  } else {
    const avg = winds.reduce((a,b)=>a+b,0)/winds.length;
    let line = t('wx.sumSteady', {speed:wxSpd(avg), dir:wxCompass(first.dir)});
    if(maxGust!=null) line += t('wx.sumGusting', {gust:wxSpd(maxGust)});
    parts.push(line+'.');
    if(bigShift) parts.push(t('wx.sumBacked', {from:wxCompass(first.dir), to:wxCompass(last.dir)})+'.');
  }
  if(presDiff!=null && s.length>1){
    parts.push(Math.abs(presDiff)<1.5 ? t('wx.sumPresSteady') : presDiff<0 ? t('wx.sumPresFell', {n:Math.round(-presDiff)}) : t('wx.sumPresRose', {n:Math.round(presDiff)}));
  }
  if(waves.length) parts.push(t('wx.sumWaves', {m:Math.max(...waves).toFixed(1)}));

  // Compared with what was logged at departure.
  let vs = null;
  const dep = departure && departure.windSpeed!=null && departure.windSpeed!=='' ? parseFloat(departure.windSpeed) : null;
  if(dep!=null && !isNaN(dep) && s.length>1){
    const diff = peak.wind - dep;
    vs = Math.abs(diff)<3 ? {kind:'same', text:t('wx.vsSame')}
       : diff>0 ? {kind:'up', text:t('wx.vsStronger', {n:wxSpd(diff), time:wxTime(peak.t)})}
       : {kind:'down', text:t('wx.vsLighter', {n:wxSpd(-diff)})};
  }
  return {
    text: parts.join(' '),
    vs,
    windRange: `${Math.round(wxSpdVal(low.wind))}–${wxSpd(peak.wind)}`,
    maxGust: maxGust!=null ? wxSpd(maxGust) : '—',
    shift: bigShift ? `${wxCompass(first.dir)} → ${wxCompass(last.dir)}` : t('wx.steadyDir', {dir:wxCompass(first.dir)}),
    pressure: presDiff==null ? '—' : (Math.abs(presDiff)<1.5 ? '→ ' + t('wx.steady') : (presDiff<0 ? '↘ ' : '↗ ') + (presDiff>0?'+':'') + Math.round(presDiff) + ' hPa'),
    waves: waves.length ? Math.max(...waves).toFixed(1)+' m' : '—',
    temp: temps.length ? `${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}°C` : '—',
  };
}

/* ---------- chart ---------- */
function wxChartSvg(samples){
  if(samples.length<2) return '';
  const W=340, H=150, L=30, R=325, TOP=26, BOT=112;
  const vals = samples.map(x=>wxSpdVal(x.gust!=null ? x.gust : x.wind));
  const step = appUnitSystem()==='metric' ? 10 : 5;
  const yMax = Math.max(step*2, Math.ceil(Math.max(...vals)/(step*2))*step*2); // even multiple so the middle gridline is a round number
  const x = i => L+10 + i*((R-L-10)/(samples.length-1));
  const y = v => BOT - (v/yMax)*(BOT-TOP);
  const windPts = samples.map((s,i)=>`${x(i).toFixed(1)},${y(wxSpdVal(s.wind)).toFixed(1)}`);
  const gustIdx = samples.map((s,i)=>i).filter(i=>samples[i].gust!=null);
  const gustPts = gustIdx.map(i=>`${x(i).toFixed(1)},${y(wxSpdVal(samples[i].gust)).toFixed(1)}`);
  const band = gustIdx.length===samples.length
    ? `<path d="M${gustPts.join('L')}L${windPts.slice().reverse().join('L')}Z" fill="var(--coral)" opacity=".12"/>` : '';
  const grid = [0, yMax/2, yMax].map(v=>`<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" ${v?'stroke-dasharray="3 3"':''}/><text x="${L-6}" y="${y(v)+3}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const every = samples.length>7 ? 2 : 1;
  const labels = samples.map((s,i)=> i%every===0 || i===samples.length-1 ? `<text x="${x(i)}" y="${H-18}" text-anchor="middle">${new Date(s.t).toLocaleTimeString(currentLocale(),{hour:'numeric'})}</text>` : '').join('');
  const arrows = samples.map((s,i)=> s.dir==null ? '' : `<path transform="translate(${x(i).toFixed(1)} 12) rotate(${(s.dir+180)%360})" d="M0-7L4 3L0 1L-4 3Z" fill="var(--ink)"/>`).join('');
  const dots = samples.map((s,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(wxSpdVal(s.wind)).toFixed(1)}" r="2.8" fill="var(--teal, var(--navy-soft))"/>`).join('');
  return `
    <div class="wx-chart-legend">
      <span><i style="background:var(--teal, var(--navy-soft))"></i>${t('wx.wind')} (${speedUnitLabel()})</span>
      <span><i style="background:var(--coral)"></i>${t('wx.gusts')}</span>
      <span>↑ ${t('wx.direction')}</span>
    </div>
    <svg class="wx-chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(t('wx.chartLabel'))}">
      <g font-size="10" fill="var(--ink-muted)">${grid}${labels}</g>
      ${band}
      ${gustPts.length>1 ? `<polyline points="${gustPts.join(' ')}" fill="none" stroke="var(--coral)" stroke-width="2" stroke-dasharray="4 3"/>` : ''}
      <polyline points="${windPts.join(' ')}" fill="none" stroke="var(--teal, var(--navy-soft))" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}${arrows}
    </svg>`;
}

/* ---------- the card ---------- */
function sailWeatherSectionHtml(trip, readOnly){
  const rep = trip.weatherReport;
  const src = wxSourceFor(trip);
  if(!src) return '';
  if(readOnly && !(rep && rep.status==='ready')) return ''; // a friend's sail: only show a finished report
  if(trip.receivedFrom && !(rep && rep.status==='ready')) return ''; // a sail a friend sent you: their report or nothing
  return `<div id="sailWeatherCard">${sailWeatherInnerHtml(trip, readOnly)}</div>`;
}
function sailWeatherInnerHtml(trip, readOnly){
  const rep = trip.weatherReport;
  const src = wxSourceFor(trip);
  const placeName = escapeHtml((trip.place||'').trim());
  const title = (tag, cls)=>`<div class="section-title wx-title">${t('wx.title')}${tag?`<span class="wx-tag${cls?' '+cls:''}">${tag}</span>`:''}</div>`;

  // No track and no place name yet: tell them what to add.
  if(src==='needPlace' && !(rep && rep.status==='ready')){
    return `${title()}
      <div class="card wx-card wx-empty"><p>${t('wx.needPlace')}</p></div>`;
  }
  if(!rep || (rep.basis && rep.basis!==wxBasisKey(trip) && rep.status!=='pending')){
    return `${title()}
      <div class="card wx-card wx-empty">
        <p>${src==='place' ? t('wx.olderSailPlace', {place: placeName}) : t('wx.olderSail')}</p>
        <button class="btn btn-outline" onclick="requestSailWeather()">${t('wx.getReport')}</button>
      </div>`;
  }
  if(rep.status==='pending'){
    return `${title(t('wx.waiting'), 'coral')}
      <div class="card wx-card wx-pending"><div class="wx-spin"></div><div>${navigator.onLine ? (src==='place' ? t('wx.fetchingPlace', {place: placeName}) : t('wx.fetching')) : t('wx.pendingOffline')}</div></div>`;
  }
  if(rep.status==='placeNotFound'){
    return `${title()}
      <div class="card wx-card wx-empty">
        <p>${t('wx.placeNotFound', {place: escapeHtml(rep.place||'')})}</p>
        ${readOnly ? '' : `<button class="btn btn-outline" onclick="requestSailWeather()">${t('wx.tryAgain')}</button>`}
      </div>`;
  }
  if(rep.status!=='ready' || !rep.samples || !rep.samples.length){
    return `${title()}
      <div class="card wx-card wx-empty">
        <p>${t('wx.unavailable')}</p>
        ${readOnly ? '' : `<button class="btn btn-outline" onclick="requestSailWeather()">${t('wx.tryAgain')}</button>`}
      </div>`;
  }

  const s = rep.samples;
  const sum = wxSummarise(s, trip.weather);
  const obs = trip.weatherObs;
  const obsHtml = readOnly
    ? (obs ? `<div class="wx-obs filled"><b>${t('wx.yourObs')}</b><p>${escapeHtml(obs)}</p></div>` : '')
    : obs
      ? `<div class="wx-obs filled" id="wxObsBox" onclick="editSailWeatherObs()"><b>${t('wx.yourObs')} <span>✎</span></b><p>${escapeHtml(obs)}</p></div>`
      : `<div class="wx-obs" id="wxObsBox" onclick="editSailWeatherObs()">✎ ${t('wx.addObs')}</div>`;
  const tile = (label, val)=>`<div class="wx-cell"><small>${label}</small><b>${val}</b></div>`;
  const rows = s.map(x=>`<tr><td>${wxTime(x.t)}</td><td>${wxSpd(x.wind)}</td><td>${x.gust!=null?Math.round(wxSpdVal(x.gust)):'—'}</td><td>${wxCompass(x.dir)}</td><td>${x.wave!=null?x.wave.toFixed(1)+' m':'—'}</td></tr>`).join('');

  return `${title(t('wx.autoTag'))}
    <div class="card wx-card">
      <div class="wx-summary">${escapeHtml(sum.text)}</div>
      ${wxChartSvg(s)}
      <div class="wx-tiles">
        ${tile(t('wx.windRange'), sum.windRange)}
        ${tile(t('wx.maxGust'), sum.maxGust)}
        ${tile(t('wx.shift'), sum.shift)}
        ${tile(t('wx.pressure'), sum.pressure)}
        ${tile(t('wx.maxWaves'), sum.waves)}
        ${tile(t('wx.temp'), sum.temp)}
      </div>
      ${sum.vs ? `<div class="wx-vs ${sum.vs.kind}"><span>⚑</span><span>${escapeHtml(sum.vs.text)}</span></div>` : ''}
      ${obsHtml}
      <details class="wx-hourly">
        <summary>${rep.from==='place' ? t('wx.hourlyPlace') : t('wx.hourly')}</summary>
        <table><tr><th>${t('wx.colTime')}</th><th>${t('wx.wind')}</th><th>${t('wx.gustsShort')}</th><th>${t('wx.colDir')}</th><th>${t('wx.colWaves')}</th></tr>${rows}</table>
      </details>
      <div class="wx-source">${rep.from==='place' ? t('wx.sourcePlace', {place: escapeHtml((rep.location && rep.location.place) || trip.place || '')}) : t('wx.source')}</div>
    </div>`;
}
function rerenderSailWeatherCard(){
  const el = document.getElementById('sailWeatherCard');
  const trip = window._detailTrip;
  if(el && trip) el.innerHTML = sailWeatherInnerHtml(trip, !!window._friendDetail);
}
// Called at the end of openTripDetail(): if this sail's report is still
// waiting and we're online, go and get it now.
function maybeFillSailWeatherOnOpen(trip){
  if(window._friendDetail || !trip || !wxCanReport(trip)) return;
  if(trip.weatherReport && trip.weatherReport.status==='pending' && navigator.onLine) fillSailWeather(trip.id);
}

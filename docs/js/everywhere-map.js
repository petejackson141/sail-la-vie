// ===== everywhere-map.js =====
// Profile: "Everywhere I've sailed" (31.10.2026).
//
// Every GPS-tracked sail on one map, replayed together on ONE clock that runs
// through a single day. Each boat sets off when its sail really set off (a
// 07:30 sail leaves at 07:30 on the clock, an evening sail at 18:00) and takes
// as long as the sail really took — so dawn sails go first and sunset sails
// last. The map's lighting follows the clock (day → dusk → night), using the
// same sun calculation as Auto day/night on the other maps, for where the
// sails are and for today's date (so "sunset" is today's sunset there).
//
// How it plays: once the map scrolls into view, the whole day runs in about
// 20 seconds; a clock in the corner shows the time. Tap the map for full
// screen (the replay plays again there); "Replay" runs it again.
//
// Cost: one Mapbox map load per time the Profile builds it — it's only rebuilt
// when the sails themselves change, not on every visit.

const EW_MAX_SAILS = 60;        // newest 60 tracked sails
const EW_MAX_POINTS = 200;      // per sail, plenty for the drawing
const EW_PLAY_MS = 20000;       // one day on the clock, in real time
const EW_PAD = { top:60, bottom:60, left:30, right:30 };
const EW_PAD_FS = { top:80, bottom:80, left:40, right:40 };

let ewMap = null, ewSails = null, ewBounds = null, ewSig = '', ewClock = null;
let ewRaf = null, ewPlayed = false, ewObserver = null, ewBuilding = null, ewPreset = null;

async function renderEverywhereMap(){
  const outer = document.getElementById('everywhereOuter');
  if(!outer) return;
  const idx = (state.tripIndex || []).slice().sort((a,b)=>(Date.parse(b.date)||0) - (Date.parse(a.date)||0)).slice(0, EW_MAX_SAILS);
  const sig = idx.map(t=>t.id + ':' + (t.updatedAt || t.date || '')).join('|');
  if(ewMap && sig === ewSig){ ewPlayed = false; setTimeout(()=>{ ewMap.resize(); ewWatch(); }, 60); return; } // same sails: just play the day again
  if(ewBuilding) return ewBuilding;
  ewBuilding = (async()=>{
    try{
      if(!mapboxReady() || !navigator.onLine || !idx.length){ outer.style.display = 'none'; return; }
      const sails = [];
      for(const tr of idx){
        const trip = await storeGet('trip:' + tr.id);
        const s = trip && ewPrepareSail(trip);
        if(s) sails.push(s);
      }
      if(!sails.length){ outer.style.display = 'none'; return; }
      ewSig = sig; ewSails = sails;
      outer.style.display = '';
      ewBuildMap();
    } finally { ewBuilding = null; }
  })();
  return ewBuilding;
}

// One sail → what the replay needs: its points, and for each point how many
// minutes after the start it was reached; plus the start as minutes after
// midnight (phone's own time zone). Returns null for sails that aren't a real
// moving track (31.10.2026): only tracks where every point has its own time
// (recorded by GPS, or an imported GPX with times) and that last at least
// 3 minutes. Hand-drawn or time-less tracks would only appear in one go as a
// still picture, so they're left off this map.
const EW_MIN_MINUTES = 3;
const EW_STALE_GAP_MS = 20*60000; // a lone fix 20+ min before/after the rest is an old GPS position, not the sail
function ewPrepareSail(trip){
  if(!trip || !trip.path || trip.path.length < 2) return null;
  let pts = trip.path.filter(p=>p && typeof p.t === 'number' && isFinite(p.lat) && isFinite(p.lng));
  if(pts.length < trip.path.length || pts.length < 2) return null;
  pts = pts.slice().sort((a,b)=>a.t - b.t);
  while(pts.length > 2 && pts[1].t - pts[0].t > EW_STALE_GAP_MS) pts.shift();
  while(pts.length > 2 && pts[pts.length-1].t - pts[pts.length-2].t > EW_STALE_GAP_MS) pts.pop();
  if((pts[pts.length-1].t - pts[0].t)/60000 < EW_MIN_MINUTES) return null;
  const step = Math.max(1, Math.ceil(pts.length / EW_MAX_POINTS));
  const path = pts.filter((p,i)=> i % step === 0 || i === pts.length-1);
  const startMs = path[0].t;
  const mins = path.map(p=>(p.t - startMs)/60000);
  const d = new Date(startMs);
  return {
    id: trip.id,
    coords: path.map(p=>[p.lng, p.lat]),
    mins,
    start: d.getHours()*60 + d.getMinutes() + d.getSeconds()/60,
    marker: null
  };
}

function ewBuildMap(){
  if(ewMap){ try{ ewMap.remove(); }catch(e){} ewMap = null; }
  ewStop();
  const all = ewSails.flatMap(s=>s.coords);
  ewBounds = all.reduce((b,c)=>b.extend(c), new mapboxgl.LngLatBounds(all[0], all[0]));
  const c = ewBounds.getCenter();
  ewSails.center = { lat: c.lat, lng: c.lng };
  // the clock runs from a little before the earliest start to a little after the latest finish
  const starts = ewSails.map(s=>s.start), ends = ewSails.map(s=>s.start + s.mins[s.mins.length-1]);
  ewSails.from = Math.max(0, Math.floor((Math.min(...starts) - 30)/15)*15);
  ewSails.to = Math.ceil((Math.max(...ends) + 30)/15)*15;
  if(ewSails.to - ewSails.from < 180) ewSails.to = ewSails.from + 180; // at least three hours, so short days don't rush

  mapboxgl.accessToken = MAPBOX_TOKEN;
  ewPreset = ewPresetAt(ewSails.from);
  // Always the Standard map, whose lighting can change (day/dawn/dusk/night)
  ewMap = new mapboxgl.Map({
    container: 'everywhereMap',
    style: 'mapbox://styles/mapbox/standard',
    config: { basemap: { lightPreset: ewPreset } },
    bounds: ewBounds, fitBoundsOptions: { padding: EW_PAD, maxZoom: 13 },
    attributionControl: true, pitchWithRotate: false, dragRotate: false, interactive: true
  });
  DETAIL_MAP_HANDLERS.forEach(h=>{ if(ewMap[h]) ewMap[h].disable(); }); // the page scrolls over it; full screen switches these on
  const map = ewMap;
  map.on('style.load', ()=>{
    const paint = trackPaintFor(ewPreset);
    map.addSource('ew', { type:'geojson', data: ewGeo(ewSails.from) });
    map.addLayer({ id:'ew-halo', type:'line', source:'ew', filter:['==',['geometry-type'],'LineString'],
      layout:{ 'line-join':'round', 'line-cap':'round' },
      paint:{ 'line-color': paint.halo, 'line-width':6, 'line-opacity':0.8, 'line-emissive-strength':1 } });
    map.addLayer({ id:'ew-line', type:'line', source:'ew', filter:['==',['geometry-type'],'LineString'],
      layout:{ 'line-join':'round', 'line-cap':'round' },
      paint:{ 'line-color': paint.line, 'line-width':3, 'line-emissive-strength':1 } });
    map.addLayer({ id:'ew-start', type:'circle', source:'ew', filter:['==',['geometry-type'],'Point'],
      paint:{ 'circle-radius':4.5, 'circle-color':'#2E8B57', 'circle-stroke-color':'#fff', 'circle-stroke-width':1.5, 'circle-emissive-strength':1 } });
  });
  map.on('click', ()=>{ if(!mapFs) openEverywhereFullscreen(); });
  ewClock = document.getElementById('everywhereClock');
  ewShowClock(ewSails.from);
  map.once('load', ()=>{ ewPlayed = false; ewWatch(); });
  setTimeout(()=>map.resize(), 60);
}

// Plays the day once the map is at least 40% on screen (and not already played).
function ewWatch(){
  const wrap = document.getElementById('everywhereWrap');
  if(!wrap || !ewMap) return;
  if(ewObserver) ewObserver.disconnect();
  if(!('IntersectionObserver' in window)){ if(!ewPlayed) everywherePlay(); return; }
  ewObserver = new IntersectionObserver(es=>{
    if(es.some(e=>e.isIntersecting) && !ewPlayed && !ewRaf) everywherePlay();
  }, { threshold: 0.4 });
  ewObserver.observe(wrap);
}

// Lines drawn so far at clock minute `clock` (+ a start dot per sail that has set off)
function ewGeo(clock){
  const feats = [];
  for(const s of ewSails){
    const local = clock - s.start;
    if(local < 0) continue;
    feats.push({ type:'Feature', properties:{}, geometry:{ type:'Point', coordinates: s.coords[0] } });
    const tip = ewTip(s, local);
    if(tip.drawn.length > 1) feats.push({ type:'Feature', properties:{}, geometry:{ type:'LineString', coordinates: tip.drawn } });
  }
  return { type:'FeatureCollection', features: feats };
}
// Where sail s is `local` minutes after its start: the points so far + the boat's position
function ewTip(s, local){
  const m = s.mins, n = m.length;
  if(local >= m[n-1]) return { drawn: s.coords, pos: s.coords[n-1], done: true };
  let i = 0; while(i < n-2 && m[i+1] <= local) i++;
  const span = m[i+1] - m[i], k = span > 0 ? Math.min(1, Math.max(0, (local - m[i])/span)) : 1;
  const a = s.coords[i], b = s.coords[i+1];
  const pos = [a[0] + (b[0]-a[0])*k, a[1] + (b[1]-a[1])*k];
  return { drawn: s.coords.slice(0, i+1).concat([pos]), pos, done: false };
}

// Lighting at clock minute `clock`: today's date at that time of day, where the sails are
function ewPresetAt(clock){
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return lightPresetFor(new Date(d.getTime() + clock*60000), ewSails.center.lat, ewSails.center.lng);
}
function ewSetPreset(preset){
  if(!ewMap || preset === ewPreset) return;
  ewPreset = preset;
  if(!ewMap.getLayer('ew-line')) return;
  try{ ewMap.setConfigProperty('basemap', 'lightPreset', preset); }catch(e){}
  const c = trackPaintFor(preset);
  ewMap.setPaintProperty('ew-halo', 'line-color', c.halo);
  ewMap.setPaintProperty('ew-line', 'line-color', c.line);
}
function ewShowClock(clock){
  if(!ewClock) return;
  const m = Math.round(clock) % 1440, hh = String(Math.floor(m/60)).padStart(2,'0'), mm = String(m%60).padStart(2,'0');
  const icon = { day:'☀️', dawn:'🌅', dusk:'🌇', night:'🌙' }[ewPreset] || '';
  ewClock.textContent = `${icon} ${hh}:${mm}`;
}

function everywherePlay(){
  if(!ewMap || !ewSails) return;
  ewStop();
  ewPlayed = true;
  const btn = document.getElementById('everywherePlayBtn'); if(btn) btn.style.display = 'none';
  const src0 = ewMap.getSource('ew'); if(src0) src0.setData(ewGeo(ewSails.from)); // clear the lines from last time
  ewSails.forEach(s=>{ if(s.marker){ s.marker.remove(); s.marker = null; } });
  const t0 = performance.now(), from = ewSails.from, to = ewSails.to;
  let lastDraw = 0;
  const frame = (now)=>{
    if(!ewMap) return;
    // Profile closed → stop (plays again next time). Not offsetParent: that is
    // also empty while the map is full screen, which froze it there (31.10.2026).
    const wrap = document.getElementById('everywhereWrap');
    if(!wrap || !wrap.getClientRects().length){ ewStop(); ewPlayed = false; return; }
    const f = Math.min(1, (now - t0)/EW_PLAY_MS);
    const clock = from + (to - from)*f;
    ewSetPreset(ewPresetAt(clock));
    ewShowClock(clock);
    // the boats move every frame; the lines are redrawn ~10 times a second (kinder to slower phones)
    for(const s of ewSails){
      const local = clock - s.start;
      if(local < 0) continue;
      const tip = ewTip(s, local);
      if(tip.done){ if(s.marker){ s.marker.remove(); s.marker = null; } continue; }
      if(!s.marker) s.marker = new mapboxgl.Marker({ element: yachtMarkerEl(30) }).setLngLat(tip.pos).addTo(ewMap);
      else s.marker.setLngLat(tip.pos);
    }
    if(now - lastDraw > 100 || f >= 1){
      const src = ewMap.getSource('ew'); if(src) src.setData(ewGeo(clock));
      lastDraw = now;
    }
    if(f >= 1){ ewRaf = null; if(btn) btn.style.display = 'flex'; return; }
    ewRaf = requestAnimationFrame(frame);
  };
  ewRaf = requestAnimationFrame(frame);
}
// Stops the day; the Replay button comes back so it can always be run again.
function ewStop(){
  if(ewRaf) cancelAnimationFrame(ewRaf); ewRaf = null;
  const btn = document.getElementById('everywherePlayBtn'); if(btn && ewMap) btn.style.display = 'flex';
}

function openEverywhereFullscreen(){
  if(!ewMap) return;
  openMapFullscreen(document.getElementById('everywhereWrap'), ewMap, {
    refit: (fs)=> ewMap.fitBounds(ewBounds, { padding: fs ? EW_PAD_FS : EW_PAD, maxZoom: 13, duration: 0 }),
    onEnter: ()=> everywherePlay()
  });
}

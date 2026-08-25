// ===== history-maps.js =====
// History list + filters, trip detail view, Leaflet maps (live tracking + trip detail), map styles, sharing a trip
// Extracted from the original single-file app.js, lines 2540-3122, in original order.

let historyFilter = 'all';   // 'all' | 'recent' | 'photos' — set by the filter chips above the list
function setHistoryFilter(f){ historyFilter=f; document.querySelectorAll('#historyChips .chip').forEach(c=>c.classList.toggle('active', c.dataset.f===f)); renderHistory(); }
// Renders the History list from state.tripIndex (the lightweight summaries,
// NOT full trip records — that's why this doesn't need to be async).
function renderHistory(){
  const q = (document.getElementById('historySearch').value||'').toLowerCase();
  let list = state.tripIndex.filter(trip=>{
    const boat = state.boats.find(b=>b.id===trip.boatId);
    const hay = (trip.title+' '+(trip.notes||'')+' '+(trip.place||'')+' '+(boat?boat.name:'')).toLowerCase();
    if(q && !hay.includes(q)) return false;
    if(historyFilter==='recent'){ const days=(Date.now()-new Date(trip.date))/86400000; if(days>30) return false; }
    if(historyFilter==='photos' && !trip.hasPhotos) return false;
    return true;
  });
  // Order by the date of the sail itself (most recent first), not by
  // insertion order — state.tripIndex is unshift-ordered by when the entry
  // was saved, which drifts from sail date for manual/back-logged entries.
  list = list.slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const el = document.getElementById('historyList');
  if(!list.length){
    el.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 18l9-15 9 15z"/></svg>
      <h3>${t('history.emptyTitle')}</h3><p>${t('history.emptyHint')}</p></div>`;
    return;
  }
  el.innerHTML = list.map(trip=>{
    const d = new Date(trip.date);
    const dateStr = d.toLocaleDateString(currentLocale(),{month:'short',day:'numeric',year:'numeric'});
    const timeStr = d.toLocaleTimeString(currentLocale(),{hour:'numeric',minute:'2-digit'});
    const dur = fmtDuration(trip.elapsedSeconds);
    return `<div class="trip-card" onclick="openTripDetail('${trip.id}')">
      ${trip.coverPhoto
        ? `<div class="trip-cover-wrap"><img class="trip-cover" src="${trip.coverPhoto}">
            <div class="trip-cover-overlay">
              <div class="trip-cover-date">${dateStr} · ${timeStr}</div>
              ${trip.place ? `<div class="trip-cover-place">📍 ${escapeHtml(trip.place)}</div>` : ''}
            </div>
          </div>`
        : `<div class="trip-cover placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 18l9-15 9 15z"/></svg></div>`}
      <div class="trip-body">
        <div class="trip-title">${escapeHtml(trip.title)}</div>
        <div class="trip-meta">${trip.coverPhoto ? '' : `<span>📅 ${dateStr}</span>`}${trip.place && !trip.coverPhoto ? `<span>📍 ${escapeHtml(trip.place)}</span>` : ''}<span>⏱ ${dur}</span></div>
        <div class="trip-meta"><span>📏 <b>${fmtDistance(trip.distanceNm||0)}</b></span><span>⚓ ${t('common.avgShort')} <b>${fmtSpeed(trip.avgSpeed||0)}</b></span></div>
      </div>
    </div>`;
  }).join('');
}
function fmtDuration(secs){
  secs = secs||0;
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
  return h>0 ? `${h}${t('unit.hourAbbr')} ${m}${t('unit.minAbbr')}` : `${m}${t('unit.minAbbr')}`;
}

/* ============================================================
   GALLERY
   All photos across every sail, grouped by the log entry they came from and
   headed with that entry's sail date — NOT upload/insertion order, since
   back-logged manual entries are often added well after the sail itself.
   Full trip records (photos only live there, not the lightweight tripIndex)
   are cached in galleryTripsCache so tapping a photo — and deleting one —
   doesn't need another round-trip to storage.
   ============================================================ */
let galleryTripsCache = {};
async function renderGallery(){
  const el = document.getElementById('galleryContent');
  if(!el) return;
  const withPhotos = state.tripIndex.filter(t=>t.hasPhotos);
  if(!withPhotos.length){
    el.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
      <h3>${t('gallery.emptyTitle')}</h3><p>${t('gallery.emptyHint')}</p></div>`;
    return;
  }
  // Ordered by the sail date of the entry (most recent first), same convention as History.
  const ordered = withPhotos.slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const trips = await Promise.all(ordered.map(idxEntry=>storeGet('trip:'+idxEntry.id)));
  // Bail if the person navigated away while these were loading.
  if(!document.getElementById('screen-gallery')?.classList.contains('active')) return;
  galleryTripsCache = {};
  const html = trips.map(trip=>{
    if(!trip || !trip.photos || !trip.photos.length) return '';
    galleryTripsCache[trip.id] = trip;
    const d = new Date(trip.date);
    const dateStr = d.toLocaleDateString(currentLocale(),{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    return `<div class="gallery-date-group">
      <div class="gallery-date-heading">${dateStr}${trip.title?`<span class="gallery-date-sub"> · ${escapeHtml(trip.title)}</span>`:''}</div>
      <div class="gallery-photo-grid">${trip.photos.map((p,pi)=>
        `<div class="gallery-photo-cell" onclick="openGalleryPhotoLightbox('${trip.id}',${pi})"><img src="${p}" loading="lazy"></div>`
      ).join('')}</div>
    </div>`;
  }).join('');
  el.innerHTML = html || `<div class="empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
    <h3>${t('gallery.emptyTitle')}</h3><p>${t('gallery.emptyHint')}</p></div>`;
}
function openGalleryPhotoLightbox(tripId, index){
  const trip = galleryTripsCache[tripId];
  if(!trip || !trip.photos) return;
  openLightbox(trip.photos, index, tripId);
}

/* ============================================================
   ENTRY DETAIL
   ============================================================ */
let openTripId = null;
// Loads one full trip record from storage (tripIndex only has summaries) and
// renders the whole detail screen: cover, stats, live-track-style map of
// where the trip went, weather, notes, crew, and photo gallery.
async function openTripDetail(id){
  openTripId = id;
  const trip = await storeGet('trip:'+id);
  if(!trip){ showToast(t('toast.tripLoadFail')); return; }
  const boat = state.boats.find(b=>b.id===trip.boatId);
  document.getElementById('detailTitle').textContent = trip.title||t('detail.tripFallback');
  const tripCrew = (trip.crewIds||[]).map(cid=>crewMemberById(cid)).filter(Boolean);
  const crewNames = tripCrew.map(c=>c.name); // still used by shareTrip()'s plain-text summary
  const tripSkipper = trip.skipperId ? skipperById(trip.skipperId) : null;
  const d = new Date(trip.date);

  document.getElementById('detailBody').innerHTML = `
    ${trip.coverPhoto
      ? `<div class="trip-cover-wrap" style="border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--border);cursor:pointer;" onclick="openTripCoverLightbox()">
          <img class="trip-cover" src="${trip.coverPhoto}" style="height:200px;">
          <div class="trip-cover-overlay">
            <div class="trip-cover-date">${d.toLocaleDateString(currentLocale(),{weekday:'long',month:'long',day:'numeric',year:'numeric'})} · ${d.toLocaleTimeString(currentLocale(),{hour:'numeric',minute:'2-digit'})}</div>
            ${trip.place || boat ? `<div class="trip-cover-place">${trip.place?'📍 '+escapeHtml(trip.place):''}${trip.place&&boat?' · ':''}${boat?escapeHtml(boat.name):''}</div>` : ''}
          </div>
        </div>`
      : `<p style="margin-top:12px;font-size:13px;">${d.toLocaleDateString(currentLocale(),{weekday:'long',month:'long',day:'numeric',year:'numeric'})} · ${d.toLocaleTimeString(currentLocale(),{hour:'numeric',minute:'2-digit'})}${boat?' · '+escapeHtml(boat.name):''}${trip.place?' · 📍 '+escapeHtml(trip.place):''}</p>`}

    <div class="stat-card stat-grid" style="margin-top:14px;">
      <div class="cell"><div class="stat-label">${t('detail.elapsed')}</div><div class="stat-value" style="font-size:19px;">${fmtDuration(trip.elapsedSeconds)}</div></div>
      <div class="cell"><div class="stat-label">${t('stat.distance')}</div><div class="stat-value">${fmtDistance(trip.distanceNm||0)}</div></div>
      <div class="cell" style="margin-top:14px;"><div class="stat-label">${t('stat.avgSpeed')}</div><div class="stat-value">${fmtSpeed(trip.avgSpeed||0)}</div></div>
      <div class="cell" style="margin-top:14px;"><div class="stat-label">${t('stat.maxSpeed')}</div><div class="stat-value">${fmtSpeed(trip.maxSpeed||0)}</div></div>
    </div>

    <div id="detailMapArea"></div>

    <div class="section-title">${t('detail.weather')}</div>
    <div class="card" style="padding:16px;">
      <div class="trip-meta">
        <span>💨 ${compassLabel(trip.weather?.windDir)||'—'} ${trip.weather?.windSpeed!=null?fmtSpeed(trip.weather.windSpeed):''}</span>
        <span>${trip.weather?.gusts?`${t('detail.gustsShort')} ${fmtSpeed(trip.weather.gusts)}`:''}</span>
        <span>🌊 ${seaStateLabel(trip.weather?.seaState)||'—'}${trip.weather?.waveHeight?` (${trip.weather.waveHeight}m)`:''}${trip.weather?.waveDir?` ${t('detail.fromDir')} ${compassLabel(trip.weather.waveDir)}`:''}</span>
        <span>🌡 ${trip.weather?.temp?trip.weather.temp+'°C':'—'}</span>
      </div>
    </div>

    ${trip.notes ? `<div class="section-title">${t('active.notes')}</div><div class="card" style="padding:16px;"><p style="color:var(--ink);">${escapeHtml(trip.notes)}</p></div>` : ''}

    ${tripSkipper ? `<div class="section-title">${t('active.skipper')}</div><div class="crew-chip-row">
      <div class="crew-chip active"><img src="${tripSkipper.photo||placeholderAvatar()}"><span>${escapeHtml(tripSkipper.name)}</span></div></div>` : ''}

    ${tripCrew.length ? `<div class="section-title">${t('active.crewAboard')}</div><div class="crew-chip-row">${tripCrew.map(c=>`
      <div class="crew-chip active"><img src="${c.photo||placeholderAvatar()}"><span>${escapeHtml(c.name)}</span></div>`).join('')}</div>` : ''}

    ${trip.photos && trip.photos.length ? `<div class="section-title">${t('active.photos')}</div><div class="photo-strip">${trip.photos.map((p,i)=>`<div class="photo-thumb" onclick="openTripPhotoLightbox(${i})"><img src="${p}"></div>`).join('')}</div>` : ''}

    <div style="height:8px;"></div>
    <button class="btn btn-outline" onclick="shareTrip('${trip.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-3.9M8.6 13.4l6.8 3.9"/></svg>
      ${t('detail.shareCrewSocial')}
    </button>
    <div style="height:10px;"></div>
    <button class="btn btn-outline" onclick="openTripPdfPreview()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      ${t('detail.exportPdf')}
    </button>
  `;
  window._detailTrip = trip;
  nav('detail');
  renderTripDetailMap(trip);
}
// Fills in #detailMapArea after the rest of the detail screen has rendered.
// Three cases: a GPS track (try real map, fall back to offline porthole), a
// manually-uploaded map image (no GPS track to draw), or nothing at all.
async function renderTripDetailMap(trip){
  const area = document.getElementById('detailMapArea');
  if(!area) return; // navigated away before this finished loading
  detailLeafletMap = null; detailMapLocked = true; // fresh state per trip — rebuilt below if this trip has a GPS track

  if(trip.path && trip.path.length>1){
    area.innerHTML = `
      <div class="stat-label" style="text-align:center;margin-top:16px;">${t('detail.track')}</div>
      <div style="position:relative;">
        <div class="live-map" id="detailLeaflet" style="display:none;"></div>
        <div class="porthole" id="detailPorthole"></div>
        <div class="map-stats-overlay" id="detailMapStatsOverlay" style="display:none;">
          <div><b>${fmtDistance(trip.distanceNm||0)}</b><span>${t('stat.distance')}</span></div>
          <div><b>${fmtSpeed(trip.avgSpeed||0)}</b><span>${t('stat.avgSpeed')}</span></div>
          <div><b>${fmtDuration(trip.elapsedSeconds)}</b><span>${t('detail.duration')}</span></div>
        </div>
        <div class="map-style-toggle left" id="detailMapStyleToggle" style="display:none;" onclick="toggleMapStyleMenu('detail')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          <span id="detailMapStyleLabel">Standard</span>
        </div>
        <div class="map-style-menu left" id="detailMapStyleMenu"></div>
        <div class="map-lock-toggle" id="detailMapLockToggle" style="display:none;" onclick="toggleDetailMapLock()">
          <svg id="detailMapLockIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <span id="detailMapLockLabel">${t('detail.locked')}</span>
        </div>
      </div>
      <div style="text-align:center;font-size:11.5px;color:var(--ink-muted);margin-top:4px;">${portholeCoordsCaption(trip.path)}</div>`;

    const online = await checkTilesAvailable();
    // Bail if the person already navigated to a different trip/screen while this was checking
    if(!document.getElementById('detailLeaflet') || window._detailTrip!==trip) return;

    if(online && typeof L!=='undefined'){
      document.getElementById('detailLeaflet').style.display='block';
      document.getElementById('detailPorthole').style.display='none';
      document.getElementById('detailMapStatsOverlay').style.display='flex';
      // Starts fully non-interactive: this is a read-only history view (there's
      // nothing here to edit), so a touch that lands on the map should keep
      // scrolling the page, not pan the map out from under it. The lock pill
      // (bottom-right) lets someone explicitly opt in to pan/zoom it.
      const map = L.map('detailLeaflet', {
        attributionControl:true,
        dragging:false, touchZoom:false, scrollWheelZoom:false,
        doubleClickZoom:false, boxZoom:false, keyboard:false, tap:false
      });
      detailStyleLayers = applyMapStyle(map, currentMapStyle);
      const styleToggle = document.getElementById('detailMapStyleToggle');
      if(styleToggle){ styleToggle.style.display = 'flex'; renderMapStyleMenu('detail'); }
      const latlngs = trip.path.map(p=>[p.lat,p.lng]);
      const poly = L.polyline(latlngs, {color:'#16324F', weight:3}).addTo(map);
      L.circleMarker(latlngs[0], {radius:6, color:'#fff', weight:2, fillColor:'#2E8B57', fillOpacity:1}).addTo(map);
      L.circleMarker(latlngs[latlngs.length-1], {radius:6, color:'#fff', weight:2, fillColor:'#D65A4A', fillOpacity:1}).addTo(map);
      map.fitBounds(poly.getBounds(), {padding:[24,24]});
      setTimeout(()=>map.invalidateSize(), 50);
      detailLeafletMap = map;
      detailMapLocked = true;
      const toggle = document.getElementById('detailMapLockToggle');
      if(toggle) toggle.style.display = 'flex';
    } else {
      document.getElementById('detailPorthole').innerHTML = buildPortholeSvg(trip.path, false, appUnitSystem());
    }
  } else if(trip.mapImage){
    area.innerHTML = `
      <div class="stat-label" style="text-align:center;margin-top:16px;">${t('detail.map')}</div>
      <div style="position:relative;cursor:pointer;" onclick="openLightbox([window._detailTrip.mapImage],0)">
        <img src="${trip.mapImage}" style="width:100%;border-radius:var(--radius-lg);border:1px solid var(--border);display:block;">
        <div class="map-stats-overlay">
          <div><b>${fmtDistance(trip.distanceNm||0)}</b><span>${t('stat.distance')}</span></div>
          <div><b>${fmtSpeed(trip.avgSpeed||0)}</b><span>${t('stat.avgSpeed')}</span></div>
          <div><b>${fmtDuration(trip.elapsedSeconds)}</b><span>${t('detail.duration')}</span></div>
        </div>
      </div>`;
  }
}
let detailLeafletMap = null, detailMapLocked = true;

/* ---------- map base-layer styles: Standard / Nautical / Satellite / Colorful ----------
   All free, no-API-key tile sources so this stays consistent with the rest of the
   app (no backend, no credentials to manage). "Nautical" is OSM's standard base
   layer with the OpenSeaMap seamarks overlay on top (buoys, lights, depth areas —
   genuinely useful on the water, not just a different color scheme). "Colorful" is
   Esri's World Street Map — picked after a side-by-side comparison against several
   other free options. Picked style is remembered in localStorage and applied to
   both the live map and any trip's detail map; Colorful is the default for anyone
   who hasn't picked yet. */
const MAP_STYLES = {
  minimal: { labelKey:'mapStyle.minimal', base:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:'© OpenStreetMap contributors © CARTO', maxZoom:20 },
  standard: { labelKey:'mapStyle.standard', base:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:'© OpenStreetMap contributors', maxZoom:19 },
  nautical: { labelKey:'mapStyle.nautical', base:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    overlay:'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    attribution:'© OpenStreetMap contributors, seamarks © OpenSeaMap', maxZoom:18 },
  satellite: { labelKey:'mapStyle.satellite', base:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics', maxZoom:19 },
  voyager: { labelKey:'mapStyle.voyager', base:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution:'© OpenStreetMap contributors © CARTO', maxZoom:20 },
};
// "Minimal" (CARTO Positron) is the default — light grey background, thin
// roads, muted labels, no clutter. "Colorful" now points at real CARTO
// Voyager (soft pastel colors, colored parks/water, clean labels — designed
// to feel like a friendlier Google Maps) instead of the flatter Esri street
// tiles it used before. Standard/Nautical/Satellite are still there too.
let currentMapStyle = localStorage.getItem('mapStyle') || 'minimal';
if(!MAP_STYLES[currentMapStyle]) currentMapStyle = 'minimal';
let liveStyleLayers = null, detailStyleLayers = null; // {base, overlay?} L.tileLayer instances currently attached to each map

// Removes whatever base/overlay tile layers are on `map` and adds fresh ones for
// styleId, returning the new layer refs so the caller can track them (needed so
// swapping styles again later removes the RIGHT layers, not just "whatever's on it").
function applyMapStyle(map, styleId){
  if(!map) return null;
  const style = MAP_STYLES[styleId] || MAP_STYLES.standard;
  const layers = {};
  layers.base = L.tileLayer(style.base, {maxZoom: style.maxZoom, attribution: style.attribution}).addTo(map);
  if(style.overlay) layers.overlay = L.tileLayer(style.overlay, {maxZoom: style.maxZoom}).addTo(map);
  const tilePane = map.getPane('tilePane');
  if(tilePane) tilePane.style.filter = style.filter || '';
  return layers;
}
function removeMapStyleLayers(map, layers){
  if(!map || !layers) return;
  if(layers.base) map.removeLayer(layers.base);
  if(layers.overlay) map.removeLayer(layers.overlay);
}
function renderMapStyleMenu(which){
  const menu = document.getElementById(which==='live' ? 'liveMapStyleMenu' : 'detailMapStyleMenu');
  if(!menu) return;
  menu.innerHTML = Object.keys(MAP_STYLES).map(id=>
    `<div class="map-style-opt${id===currentMapStyle?' active':''}" onclick="selectMapStyle('${which}','${id}')">${t(MAP_STYLES[id].labelKey)}</div>`
  ).join('');
  const label = document.getElementById(which==='live' ? 'liveMapStyleLabel' : 'detailMapStyleLabel');
  if(label) label.textContent = t(MAP_STYLES[currentMapStyle].labelKey);
}
function toggleMapStyleMenu(which){
  const menu = document.getElementById(which==='live' ? 'liveMapStyleMenu' : 'detailMapStyleMenu');
  if(!menu) return;
  const opening = !menu.classList.contains('open');
  document.querySelectorAll('.map-style-menu').forEach(m=>m.classList.remove('open'));
  if(opening){ renderMapStyleMenu(which); menu.classList.add('open'); }
}
// Applies the chosen style everywhere at once (both maps, if currently built) and
// remembers it for next time, since it's a single global preference rather than a
// per-map setting.
function selectMapStyle(which, id){
  if(!MAP_STYLES[id]) return;
  currentMapStyle = id;
  localStorage.setItem('mapStyle', id);
  if(liveLeafletMap){ removeMapStyleLayers(liveLeafletMap, liveStyleLayers); liveStyleLayers = applyMapStyle(liveLeafletMap, id); }
  if(detailLeafletMap){ removeMapStyleLayers(detailLeafletMap, detailStyleLayers); detailStyleLayers = applyMapStyle(detailLeafletMap, id); }
  document.querySelectorAll('.map-style-menu').forEach(m=>m.classList.remove('open'));
  const liveLabel = document.getElementById('liveMapStyleLabel'); if(liveLabel) liveLabel.textContent = t(MAP_STYLES[id].labelKey);
  const detailLabel = document.getElementById('detailMapStyleLabel'); if(detailLabel) detailLabel.textContent = t(MAP_STYLES[id].labelKey);
}
// Closes an open style menu on any outside tap, same pattern as sheets/dropdowns elsewhere.
document.addEventListener('click', (e)=>{
  if(e.target.closest('.map-style-toggle') || e.target.closest('.map-style-menu')) return;
  document.querySelectorAll('.map-style-menu').forEach(m=>m.classList.remove('open'));
});


// Flips the read-only history map between "locked" (page scroll wins, map
// ignores touches) and "unlocked" (map handles its own pan/zoom) — see the
// dragging:false etc. set when the map is first created above.
function toggleDetailMapLock(){
  if(!detailLeafletMap) return;
  detailMapLocked = !detailMapLocked;
  const handlers = ['dragging','touchZoom','scrollWheelZoom','doubleClickZoom','boxZoom','keyboard'];
  handlers.forEach(h=>{
    if(!detailLeafletMap[h]) return;
    detailMapLocked ? detailLeafletMap[h].disable() : detailLeafletMap[h].enable();
  });
  const toggle = document.getElementById('detailMapLockToggle');
  const icon = document.getElementById('detailMapLockIcon');
  const label = document.getElementById('detailMapLockLabel');
  if(toggle) toggle.classList.toggle('unlocked', !detailMapLocked);
  if(label) label.textContent = detailMapLocked ? t('detail.locked') : t('detail.unlocked');
  if(icon) icon.innerHTML = detailMapLocked
    ? '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
    : '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1"/>';
}
// Draws the little circular "porthole" track map — an abstract line drawing
// scaled to fit the path's own bounding box, NOT a real map (no coastline/
// tiles — this app works fully offline, see the conversation history for why).
// live=true adds a pulsing marker at the last point instead of a static one,
// used while a journey is actively being tracked.
// Picks a "nice" round distance (in whatever unit sys uses) for the scale bar —
// never an awkward number like "0.37 NM".
function niceScaleValue(maxVal){
  const steps = [0.05,0.1,0.25,0.5,1,2,5,10,20,50,100,200,500];
  let best = steps[0];
  for(const s of steps){ if(s<=maxVal) best=s; else break; }
  return best;
}
// Draws the porthole track map: the line/markers as before, plus a compass
// rose (map is naturally north-up at this scale), a distance scale bar, and
// start/current coordinates as text — all computed offline from the GPS
// points themselves, no map tiles or internet involved. sys picks which unit
// the scale bar reads in ('nautical'|'metric'); live=true pulses the end marker.
/* ---- live/real map: shows actual OpenStreetMap tiles when there's a
   connection, falls back to the offline porthole (below) when there isn't.
   Rechecked periodically during a journey so it can switch either direction
   mid-sail as signal comes and goes — no manual toggle needed. ---- */
let liveLeafletMap=null, liveLeafletPolyline=null, liveLeafletMarker=null;
let liveMapIsOnline = false;
let liveConnCheckInterval = null;
let liveMapFollowing = true;   // true = auto-recenter/zoom on every fix (default); false once the sailor pans/zooms it themselves
let liveMapProgrammaticMove = false; // guards our own setView calls so they don't get mistaken for a user drag/zoom below
let liveLastLatLng = null;     // last known boat position, so the re-center button has somewhere to jump back to

// Live-tracking marker: the sailor's own uploaded sailboat glyph, shown as a
// static (non-rotating) icon at the boat's current position. Previously this
// rotated to match GPS heading (see git history for that top-down version) —
// this glyph is a side-profile icon, so it stays upright rather than spinning
// through 360° and looking upside-down/backwards at some headings.
const YACHT_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAECESURBVHja7d15lF3leef733PGmue5VCWVSiWpJg2lEpIQIBACCQ0gBhtwMAGMDcaYwQiQkcQs6MlZnXuzunNzu5OV7qQ7WUl3J+kknZu4M9iJ04nHeI7jCY+xMbMYNPHeP6oEAjSUpP3U2cP3sxbLLCy9++xnv+fs3372ZCEEAYgXM1so6eclrZM0IqlJ0n5J35X0KUm/LenPAl9gAKf7O8PvBxCrHX+XpI9JulaSneSPf0XSPSGE/4/KASAAAMnd+Z8n6XcltZ/iX30yhPAAFQRAAACSufP/X5JqTnOIXwwh3EUlARAAgOTs/LskffE0jvzf7udDCP+JigIgAADJCAC/Kek9EQz1jKQFIYTnqSqAk8lRAqCiO/8BSddENFyrpHupKgACABB/N0b8PbzTzDopKwACABBvV0U8Xq2k3ZQVwMlwDQBQqS+f2SJJX3cY+oCkRSGE71JlAHQAgPi53GnckqRHKC8AOgBAPDsAfyfpLKfhX5e0JITwFSoNgA4AEJ+df6+klc7f7cepNAACABAv23XyZ/2f8TLMbBWlBkAAAOLj8llazhOUGsCxcA0AMNtfOrNmST+VVJilRV4UQvg4lQdABwCorG2zuPOXpCcpOQACAFB5l8/y8ibN7ErKDuBonAIAZvMLZ1Yj6Wmd/mt/T9fXJI2HEA6zFQDQAQBm38YK7PwlaVjS9ZQfAAEAqIzLK7jsh82szCYAQAAAZpGZFSRtreBH6Jd0K1sCgMQ1AMBsBoANkv6swh/jp5IGQwj72CIAHQAAs+PyGHyGDkl3sykA0AEAZufo3yR9X1JvDD7Oi5LmhxCeYcsAdAAA+DorJjt/SWqQtJNNAhAAAPi7PGaf5/bpNxICIAAAyFAAqJL0IJsFyC6uAQC8v2RmI5K+EsOPdkjScAjhm2wlgA4AgPQf/R9RkPQYmwegAwDApwPwGUkrYvrxgqSJEMIX2FIAHQAA0e38+2K885ckk7SXLQUQAABE6/IEfMbNZnYOmwogAADIVgCQpCfZVEC2cA0A4PXlMmuV9BNJ+YR85C0hhD9mywF0AACcmUsTtPOXpL3TjywGQAAAcAYuT9jnXSbpajYbkA2cAgA8vlhmtZJ+pqkn7iXJNzX1cKBDbEWADgCAU3dJAnf+krRA0k1sPoAAAOD0XJ7gz/6gmVWxCQECAIBTYGZFSVsSvAq9km5nSwIEAACnZr2kxoSvw04za2BTAgQAADN3eQrWoVXSDjYlkF7cBQBE+YWauo/+R5K6UrA6+yQNhhB+ypYF6AAAOLE1Kdn5S1KdpAfYpAABAMDJXZ6y9bnVzPrZrAABAMCJbU/Z+pQlPcxmBdKHawCAqL5MZuOSvpjCVTssaTyE8DW2MkAHAMA7XZ7S9cpLepzNC9ABAHDsDsDnNfVCnbRaGUL4DFsaoAMA4M2d/7yU7/wl6Um2NEAAAPBWl2dgHTeY2Xo2NUAAAJCtACBJT7CpgXTgGgDgTL9EZu2S/jlDgfryEMLvseUBOgBA1l2Wse/S42bGbwdAAAAy7/KMre+opOvY7ECycQoAOJMvkFm9pKc19cS8LPmupEUhhAPMAoAOAJBFmzO485ekeZI+wOYHCABAVl2e4XXfbWa1TAGAAABkipmVpjsAWdUp6U5mAkAAALJmg6T6jNfgXjNrZioABAAgSy6nBGqSdD9lAJKHuwCA0/niTN0H/2NJHVRDr0haEEL4MaUA6AAAabeWnf8baiTtoQwAAQDIAtr/b3Wzmc2nDAABAEi77ZTgLYqSHqUMQHJwDQBwql8as2WSPk8l3uF1SctCCF+iFAAdACCNaP8f//dkL2UA6AAAae0AfFHSOJU4rrUhhE9RBoAOAJCmnf8gO/+TeoISAAQAIG1o/5/cOjPbSBkAAgBAAMhgF8DMjDIABAAg8cysS9JqKjEjE5KuogwAAQBIg8v4zpySx8wsTxkAAgCQdLT/T80iSTdQBiCeuA0QmMkXxaxR0k8llajGKfm+pKEQwn5KAdABAJJoCzv/09In6TbKABAAgKRKUvv/cMw+zwNmVs8UAggAQKKYWZWkTQn6yJ+J2edpk/QRZhJAAACS5iJJdVEPmve7Tf7jMazhPWbWxlQCCABAkri0/1e3dXl93i9L+ueY1bBe0gNMJYAAACTC9H3s2zzG3tI71/Ojx7ELcJuZ9TGrAAIAkATnauocduQ2987LWgAoS3qIKQUQAIAkcGn/L2luU19Nnefn/nhM63mDmS1iWgEEACDutnsMutW3/a8Qwg8lfT2G9cxLeoxpBRAAgNgysxWS+j3G3uLb/o97F+AqM5tghgEEACCuXNr/8+satbiheTY+/5/FNVtJeoLpBRAAgEwFAO/2/1H+UtKhmNZ2o5mtY4oBBAAgXoeoZgsljXiMPUvtf4UQXpT06RiXmS4AQAAAsnH031lVoxWtHbO5Hh+PcY3PNrNtTDWAAACkPgBs6Z0rm931+HjM67zXzPgdAggAQOWZWY+ks3wCwLzZXp2/lfRyjMs9LulaZh1AAADiYLsU/YF6Y7Gkte3ds7oiIYSDkv4q5vV+1MyKTDuAAABUmkv7f2NPv4q5inzl4n4aYL6km5l2AAEAqBgza5Z0vsfYFWj/JyUASNIeM6thBgIEAKBStkoqRD1oVb6g9Z1zKrJCIYQvSfpJzOveLenDTD+AAABUikv7/4LOXtUUCpVcr/+dgNrfb2ZNTEGAAADMKjOrlrTRY+ytlWv/H/FXCdgEzZLuZSYCBABgtm2UFPl56ILltLGnv9Lr9omEbIM7zayTqQgQAIDZ5NL+X9PepeZSuaIrFkL4uqSnE7ANaiXtZioCBABgVphZQVMXAEYuBu3/Iz6ZkM3xATObx6wECADAbFgnqSXyYCFp8+y9/S8tAaAk6RGmJEAAAGaDS/t/WUu7eqprCQCn7jozG2VaAgQAwI2ZmaYe/xu5GLX/JekLkl5K0G/T48xOgAAAeFopqddj4C3xaf8rhHBY0qcStF22m9kqpidAAAC8uLT/h+qbNFQfu+fafCJh2+YJpidAAAASFQDidPR/lE8mbNusN7MNTFGAAABEysyGJS3yGDtm5/+P+HtJ+xO2mZ5kpgIEACARR/891bVa1tIeu5UNIeyfDgFJMmlmVzBVAQIAEPsAsLl3riy+6/zJBG6nx80sz3QFCADAGTOzPkmTHmPHtP1/xCcSuLmGJb2XWQsQAIAouNz731wqa017V5zX+1OSDidwez1sZmWmLUAAAM6US/t/Y0+/Chbfr1YI4SVJ/+Ax9khji+dHnyvpVqYtQAAATpuZtUo6z2PsmLf/j3A5DbCpp195c7364QEzq2MGAwQA4HRtkxT5RWXV+YIu6OxNwvq7XAi479BBXT13yPNzd0i6m+kLEACA0+XS/r+wa46q8oXMBoDPPfu07h+dUDnnesH+jukODgACADBzZlYr6SKPsbcko/2vEMLTkr4e9bhfev4ZdVbV6MbBYc+P3yBpJzMZIAAAp2qTpOqoBy3mctrY05+kOvx11APuP3xYX3vhWd09vEy1haLnZ/+QmfUylQECAHAqXNr/a9u71VgsJakOLk8E/NxzP1NbuUq3LRzz/OzVkh5kKgMEAGBGzKwoaYvH2Elp/x/l0y4B4NmfTh2iL1yilpLrbfs3mdkCZjVAAABm4gJJkb+j1yRt7pmbtFp8WdKr0QeApyVJ9cWi7hpe5vn5C5IeY0oDBABgJlza/ytaO9RVXZOoQoQQDkn6fNTjfuPF5/XKoUOSpJsHR9RdXeu5Gleb2VKmNUAAAI5/lG5mki7zGDuB7f8jIr8O4HAI+sJzP5MklfN53Tey3HWzSnqC2Q0QAIATWS2p22Pgrb1zk1oTl+sAPv/c02/8+3sGFmp+XaPnOmw2s3OY3gABADgel/b/4oZm7x1cojoA0pvXAUhSwXJ6YGyF93o8yfQGCADArAaABLf/FUL4pqTnPAOAJG3vm6/xJteH951jZpuZ4gABAHgLMxuT5HLLWILb/0d8JuoBv/fyS/rZ/tferL+k3eOT3uuxd/o6DwAEAMD36H9OTZ2WNLclvTYupwE+/7YuwIauPq1p6/Jcj2WSrmaqAwQAwD0AJLn9fxSnBwI9/Y7/NgtdgEfNrMB0BwgAgMxsriSXe9G2JL/979cBeO6dAWB1W5cu7u7zXJchSTcx6wECAOB29N9artJq35b2rAgh/FjSDyMPAMfoAEjSrrGVcj5R/6CZVTHtAQIA4BIANvX0K5+ea84i7wL8bP9r+t7LL73jv481teiK/kHPdemVdDvTHiAAIMPMrF3SWo+xU3L+/4hZuw5Akj46ukIFc/352WlmDXwDAAIAsutSSfmoB60tFHV+R6peR+/+QKCjDdQ16LqBhZ7r0yppB9MfIAAgu1za/xu65qicz6epTp+RFKIe9FgXAh5x78iEqvKuF+zfbWYdfAUAAgAyxszqJG3wGDtl7X+FEF6Q9E9Rj/vF5545bqroqq7R+xeMeK5WnaQH+CYABABkz2ZJ5agHLeVyusj3VrZKifw0wL5DB495IeARdy5eqoZiyXOdbjWzfr4KAAEA2eLS/j+3o8d7p1UpLhcCfu2FZ4/7/zWXyrp90bjnOpUlPcxXASAAICPMrDTdAYhc2tr/nh0ASfrKCQKAJN06NKa2crXnel1vZsN8KwACALLhQkmR3waWM9MlPXPTWrMvSDoU9aBffeHELxusLRR1z/Ayz/XKS3qMrwRAAEA2uLT/V7Z2qKOqOpUFCyG8JukbkXcAnn/2pH/mhsFh9dXUea7elWY2ydcCIAAgxcwsp6n7/yOX4vb/EV+KesBv73tB+w8fPuGfKeVyun90wnvdnuDbARAAkG5nS+r0GHhzetv/R3wx6gEPh6B/fPG5k/65d88d0sKGJs91u8jM1vP1AAgASC+X9v9oY4sG6lL/dNkveQx6susAJClvpl1j7l16ugAAAQAptt1j0Ay0/x0DwLMz+nNbe+dpeUu75/qtMrPtfEUAAgBSxsyWSppPADhtT0l6KepBvzLDACBJe/y7AI9PXycCEACAFHFp/8+trddYU0vqixdCCB5dgK+eQgBY19mrczt6PFdzVNJ1fFVAAAAIABz9v1XkAeCnr72qn+1/beZdgHH3LsAj0w+LAggAQNKZ2XxJS3wCwNwsldLlOoCvnUIXYEVLhzb71nyepA/wrQEBAODo/7jaytU6q7UzS3X8osegp3IdgCTtGptUzsxzPXebWS1fGxAAAALAMW3uneu9I8pEB+CrpxgAFjc06139CzzXs1PSnXxtQAAAEszMOiWt8Rg7Y+1/hRCel/SDyDsAzz97yn9n5+iESjnXn6l7zayZbxAIAEByXeYxn+sKRZ3X0ZvFekZ+GuAfX3xer4dwSn+nv7Ze189f7LmeTZLu5+sDAgCQXC7t/4u7+72PQOMq8tMArx4+pO++/OIp/70dw8tVUyh4ruuHzaybrxAIAEDCmFmDJJdnvGet/e8ZAKTTOw3QXlWtW4bGPNe1RtIevkkgAADJs0VS5Pd0l3N5bejuIwBEaCbvBDjmIfqiJWoqlT3X9+bp20gBAgCQIC7t/3WdPaorFLNa069LOhh5B+CFZ0/r7zUWS7pj0RLP9S1KepSvEggAQEKYWVnSJS5thWw9/e8tQggHJP1j9B2AZ0/7794yNKrOqhrP1b7WzMb5VoEAACTDRZLqIv9imGlTz9ys1zby0wBPvfySXjl06LT+blW+oB0jy71/D/fylQIBAEgGl/b/6rZOtZWrsl7byG8FfD0E/eOLz53233/vwCLNq633XOdtZraGrxUIAECMmVle0qUeY2e5/e/ZAZCkb+574bT/bjGX086xFd7r/SSbHgQAIN7OkdTmMfBm2v9uAeDbL714Rn//yr5BjTS6vpp5nZltZPODAADEl0v7f0lTq/p928yJEEL4nqQXoh732/vObMicmXaNub8u+AmzbL0AAgQAIEm2ewxK+/8tvh71gN/a9+IZj7Gpp9/7DY0Tkq5i84MAAMSMmU1IcunTEwDe4p8i7wC8FE1TYfe4exfgsenrTAACABAjLu3/gboGDTfycrijfCPqAV84eEDP7H/tjMdZ296t9V1zPNd9kaQbmAIgAAAZCABbOfp37wBI0rcjOA0gSXvGJuV8ov6h6YdNAQQAoNLMbEjSqMfYtP/9OwCS9J2IAsCS5jZdOmfAc/37JN3GNAABAEjx0X9HVbUmWzuo7ix0AL61L7qbCx4Ym1Te94L9B8yM20JAAADSGgC29M4T9329VQjhJUn/HPW4Z/osgKMtqG/UtfMWepahTdJHmA0gAAAVZGbdklZ5BQDMThcgyg6AJN03MqFyzvWC/XvMrI2pAAIAUDnbpegP1BuKJZ3T3k11jy3y6wC+HXEA6K2p1U0Lhj1rUC/po0wFEACAynFp/2/s7lcxx9dhtjoALx08qJ/tfzXSMe9evEx1haJnHW4zszlMBxAAgFlmZk2SzvcYe0svz/6fzQ6AJH0rwusAJKm1XKXbFo571qFK0kNMBxAAgNm3VVLkh3jlfF4XdvVR3VnsAEjRnwaQpA8tGler72ucbzSzhUwJEACA2eXS/r+gc45qCgWqe3zflBSiDwAvRv5B6wpF3bV4qWct8pIeZ0qAAADMEjOrluTyitattP9PKITwmqTvJyEASNL7BkfUU13rWZKrpt9FARAAgFlwsaTIf9XzZtrYQwCYgejvBHjpBZcPWs7ndd+o6/7ZJD3BlAABAJgdLu3/Ne1dainxqPcZiPw6gKdefsntw75n3kIN1jd61mOjma1jWoAAAHgebpkVJG3zGJuX/1SuA/DCwQPad+igy4fNm+mB0RXeNaELAAIA4Ow8SS0eA2/uIQDM0Dc9Bv3BK/vcPvBlffO1pNn14X1nm9k2pgYIAIAfl/b/suY29dbUUt2Zecpj0B++8rLbBzZJu8cmveuy18z4HQUBAIj8R9zMNPX438jR/j8l30taB0CSLuyao7W+j3gel3Qt0wMEACB6k5JcHr/Ky39mLoTwgqTIr9rzDgCStHvcvQvwiJkVmSUgAADRcmn/L6hv1MKGJqpb4S7AbASAs1o7tbG733MRg5JuZnqAAAAkIADQ/o9HAPC8BuBou8YnlTPzXMSe6YdVAQQA4EyZ2WJJiz3Gpv1/WiJ/GuAPZ6EDIEmjjS26sm/QcxHdku5gioAAAMT46L+7ulbLW9qpbgw6AD969eXoXzJwHPePTni/8vn+6TdWAgQAII4BYHPvXBm1jUUH4MDrr+unr70yKx9+oK5B7x1Y5LmIZkn3Mk1AAADOgJnN0dQdAJHj/H98OgDS7F0HIEk7RparKu/65sc7zayTqQICAHD6tkvRH6g3lco6u72L6sakAyDNzp0AR3RW1eiWoVHPRdRK2s1UAQEAOH0u7f+N3f0q8OC2MwkAkZ+yn80AIEl3LFqihmLJcxEfMLN5TBcQAIBTZGYtmnr+f+Ro/5++EMIBST+JetzZPAUgTXWB7li0xHMRJUmPMGNAAABO3TZJkZ+orc4XdEFXL9U98y5AojsAknTL0Jjaq1xv27/OzEaZLiAAAKfGpf2/vmuOqn0vAMuCRD4N8O1qCgXtGF7u/dv6ONMFBABghsysRtLFHmPT/o9rB+DliqzI9fMXq7+23nMR281sFVMGBABgZjZJirw3W7CcLu7uo7ox7AA8s/9VHQqvz/qKlHI57Ryd8F7ME0wZEACAmXFp/6/t6FZTqUx1Y9gBCJKe3b+/Iivzrv4FWuT7Uqj1ZraBaQMCAHAC069U3eox9pbeuRQ4Gj/2GPTp/a9W5gfQTLvHVtIFAAEAqLDzJUV+OGaSNvcQACLyU49Bf/baqxVboc29czXh+26IlWZ2BVMHBADg+Fza/xMtHequrqW6MQ4AT+9/raIr9eC4exfgcTPLM31AAADefpRuZpIu8xib9n90QggvSDoQeQdg/6sVXa9zO3q0rtP1GRHDkt7LDAIBAHinVZJ6fALAPKob8QF79AHgtYqv1J6xSe9FPGxmJaYPCADAW7m0/xc2NGlBfSPVjVbkpwEqeQ3AEctb2r2fFTFX0q1MHxAAgFkIABz9JyMAPB2DDoAk7RqbVN7MdRFmVscUAgEAkDT9zPQhj7F5+l9COgD7X43Fii1saNK75w55LqJD0l1MIRAAAMej/96aWi1rbqO6SQgAr70am5W7f3RCpZzrT+O902+8BAgAIAB4DLq5h6N/J6m8CPCIvpo63TA47LmIBkkfZRqBAIBMM7N+SS4PZKf9n5wOwL5DB7X/8OHYrOA9w8tUU3B9c+SHzIx3U4MAAI7+o9ZSKmtNexfVTUgAkCr3OOBjaStX64ND456LqJb0IFMJBAAQACK2sWeu99XcBICIxek0gCTdvmhczb4vkLrJzBYwnUAAQOaYWZukczzG3srT/zw97TJojC4ElKSGYkl3Ll7quYiCpMeYTiAAIIsulRT589FrCgVd0DmH6iauA/Bq7Fb0/QtG1FVd47mIq81sKVMKBABkjUv7/8KuPpXzvHfFSwjhFUkvRx8AXovdulblC7p3ZMJzESZeFwwCALJk+mloGzzG5uU/yewCvHjwQCxX9LqBhRqoa/BcxGYzO4cpBQIAsuISSVVRD1rM5bSxu5/q+ns+6gFfOngwlitasJw+OrrCezFPMqVAAEBWuLT/z2nvVkORF67NghcjDwCHDsR2Za/oH9RYk+vD+84xs81MKxAAkGrTr0Td4jE2L/9JcACIaQdAmjpRv2tspfdi9ppx7yoIAEi39Zp6HGrkP9IEgCQHgAOxXuGLu/u0qq3TcxHLJF3N1AIBAGnm0v6fbO1QR1U11Z0dL0QeAA4djP1K7xl37wI8amYFphcIAEgdM8tJusxjbI7+6QB4W9PWpQ1dfZ6LGJJ0E9MLBACk0RpJLn1UXv6T9ABwMBErvnt8Us4n6h80syqmGAgASBuX9v9wY7P3vdrwDgCHDiRixcebWrW9b77nInol3c4UAwEABIAZoP2f/ADwyqFDej2ERKz8A2MrVDDXn8+dZkaiBQEA6WBmSyS5HDoRAJIfAKa6AMk4DTC/rlHvGVjouYhWSTuYZiAAgKP/E+ivrdeSplaqm4IAsC8h1wFI0n0jy73fOXG3mXUw1UAAAAHgODb38Oz/9HQADiSmAN3Vtbp5cMRzEXWSHmCqgQCARDOzAUkurz2l/Z+iAJCgDoAk3TW8TPXFoucibjUzXm4BAgA4+n+7tnKVVvs+nQ2zGgAOJKoILaWyPrRwieciypIeZrqBAAACwNts6pmrHI9PT08AOHQwcYW4beGY2squt+1fb2bDTDkQAJA40xcyne0xNu3/ygghvCop8r110joAklRbKOru4WWei8hLeoxZBwIAkugyj7lWVyhqXWcP1a2cl6MecP/hw4ksxI2Dw5pTU+e5iCvNbJIpBwIAksal/b+hu0/lXJ7qVk7kh+sHw+uJLEQ5l9d9IxPei3mCKQcCABJj+mlmF3qMvaWX2//SFgAOvP56YotxzbwhDdU3eS7iIjO7gGkHAgCSYrOkUtSDlnI5XdzN3VEVFvk1AIcSHADyZnpgbIX3Yp5k2oEAgKRwaf+f19GrukKR6qasA3AwwQFAkrbNGdDS5jbPRawys8uYeiAAINbMrCzpEo+xaf+nswOQ1GsA3pjzkvaMr/RezF4z47cbBADE2gZJ9ZFPWjNtJgCktANwOPFFuaCzV2vbuz0XMSrp55h+IAAgzlza/2e1dqqtXE1109gBeD2kojAP+ncBHjGzElMQBADEznSL8lKPsWn/p7cDcCjh1wAcMdnaoU2+L6kakPQBpiAIAIijcyS1+wSAeVQ3rR2A8HpqirN7bNL7MdW7zayWaQgCAOLGpf0/1tSiubX1VDelHYADKbgG4IjhxmZd1T/ouYhOSXcyDUEAQNxs5+ifDsCpSsspgCN2jq5QMef6M3uvmTUzFUEAQCyY2XJJLntqAkC6OwAHUxYA5tbW6/qBxZ6LaJJ0P1MRBADEhUv7f6CuQaONLVQ3xR2AAykLAJK0Y2S5qvMFz0V82My6mY4gACC1AWBzD1f/p70DcCikLwB0VFXrlqFRz0XUSNrDdAQBABVlZgskjXmMTfs//R2AgynsAEjSHYuXqrHoetv+zWY2nykJAgBSd/TfUVWtla0dVDdeIr9kP40dAElqLJZ0x+KlnosoSnqUKQkCAFIXAC7pmet9TzVOXT76H6T0buNbhkbVUeX6BMtrzWycaQkCAGbd9IVIqz3Gpv2fjQBQyKX3J6k6X9CO4eXev+d7mZYgAKASLpOiP4RrKJZ0bkcP1Y2fyC9tL6S8y3P9/MXeD7LaZmZrmJogAGC2ubT/L+ruUynHVM1CAMin/C23xVxOO0dXeC/mSaYmCACYNWbWKOkCj7Fp/8cWpwBOw1X9gxpudH143zoz28j0BAEAs2Wrpq5EjlQ5n9eGrjlUNyMdgEIGLvTMmWn32KT3Yp4w46pZEAAwO1za/+d39Kq2UKS6WekAWDZ+kjb1zNWk722tE5KuYoqCAABXZlYlaZPH2LT/s9UByOeyc9D64PhK70U8ZmZ5pikIAPB0saTI30ueN9Omnn6qm6EAkJUOgCStbe/WBZ29notYJOkGpikIAPDk0v5f3dal1nIV1Y0vh1MA2TptvWd8pfejjx4yszJTFQQARG66xbjNY+wtvbz8J2sdgHzGbvdc2tymbXMGPBfRJ+k2pioIAPBwnqRWnwAwj+pmrAOQz+CF6w+MrfBe7wfMrJ7pCgIAoubS/l/S3KY5NXVUN2MdgCxdA3DEUH2Trpk35LmINkkfYbqCAICobfcYdCvt/4wGgGzeun7fyITKOdcL9u8xszamLAgAiISZTWrqHGPkaP8nQvSnADL6yOc5NXW6cXDYcxH1kj7KlAUBAFFxaf/Pr2vU4oZmqht/NXQAonP38DLvh17dZmY8VhMEAMQ3AND+T4zILyyrzhcyW8y2cpVuWzjmuYgqSQ8xbUEAwBkxs0WSXHqWtP+zGwDqitl+7POHFi5RS8n1tv0bzWwhUxcEAMTu6L+rukYrfJ+RjmgCoEmK/DaN+kIp24mqWNRdw8s8F5GX9BgzGAQAxC4AbO6ZK15hlgh1UvSbqr7Ii59uHhxRd3Wt5yLeZWYTTGEQAHA6R3+9klzeZEL7PzkHqy6pgjc/qpzP676R5a5fYUl7mcIgAOB0bPc4+msslrS2vZvqEgAy7z0DCzW/rtFzEZvMbB2VJgAAp8ql/b+xp1/FHFMyIRpcAgCnACRNPRHxgbEV3ot5gkoTAIAZM7NmSS5HDrT/6QDQAXjT9r75Gm9q9VzE2Wa2jUoTAICZ2iaHR8BW5Qu6sItnlBAASlT2SNiWtHt80nsxe82M/QABAJgRl/b/BZ29mX4IDAFgaodXW2AOHG1DV5/WtHV5LmJc0rVUmgAAnPgH2qxG0kaPsbfS/k+ayK8BqCkUlTNuAn27PeMrvRfxiJlx7oUAAJzQRknVUQ9asJw29vRT3Yx3ADj/f2yr2jp1cXef5yIGJd1MpQkAwIm4tP/XtHep2ffxp0hCAOAOgOPaNbbS+wFZe8ysmkoTAIB3MLOCpK0eY9P+JwDQATixsaYWXdE/6LmIbkl3UGkCAHAs50uK/B29Jmkzb/9LosjvTyMAnNhHR1eo4HvB/v1m1kSlCQDA27m0/5e1tKvH97nn8BH5pen1RW4BPJGBugZdN+D6Ir9mSfdSaQIA8OZR+tSb37Z7jE37P7E6ox6wrVxFVU/i3pEJVfneLnunmXVSaQIAcMRZkno8Bt5C+58OwLSOKq5BO2nRq2v0/gUjnouolbSbShMAgCNc2v9D9U0aqueUY9JMXxAa+TUABIAZHqIvXqoG39MlHzCzeVSaAAC4BQCO/hOrQw5vg+yoqqGyM9BcKuv2ReOeiyhJeoRKEwDA0d6IJJcrjzj/n1gu54jby3QAZurWoTG1+dbrOjMbpdIEAHD0H7me6lotb2mnusnk8nD6Tk4BzFhtoah7hpd57xsep9IEABAAIse9/3QA3tEBIACckhsGh9VXU+e5iO1mtopKEwCQQWbWL2mFx9i0/+kAHK2cz3tf2JY6pVxO949OeC/mCSpNAEA2udz731wqa017F9WlA/CGDs7/n5Z3zx3SwgbXO2nWm9kGKk0AQPa4tP839vR7P9IUCesAcAfA6cmbadfYJF0AEAAQHTNrlXSux9i0/+kAvB3n/8/s++R8Qe1KM7uCShMAkB2XSspHPWhNoaALOnupLh2AtyYKAsAZ2ePfBXjczPJUmgCAbHBp/6/vnOP9LHP466YDEC/rOnt1bkeP5yKGJb2XShMAkHJmVivpIo+xt9D+T/rcaJEU+VVnPAY4gi7AuHsX4GEz41YNAgBS7hJJkb+arZjLaWNPP9VNtkUeg3IXwJlb0dLh/XyNuZJupdIEAKSbS/t/bXu3GrnXO+lcHgs9x/eBNpmxa2xSOTPXRZgZG4sAgDQys6KkLR5j0/4nABzPvLoGKhuBxQ3Nelf/As9FdEi6i0oTAJBO6yU1Rh4sxNv/UiLyUwCNxZKaS2UqG5GdoxMq5Vx/2ndMXwsCAgBSxqX9v6K1Q5087IUOwDEMcPQfqf7ael0/f7HnIhol7aTSBACkiJmZpMs8xqb9n5r5MUQAiL8dw8tVU3C93fZ2M+OBHgQApMgaOb3qdSvt/1QcXMrh7hDO/0evvapatwyNeS6iWtIeKk0AQHq4tP8XNzRrfl0j1U0+lwsAB2oJAB4+vGiJmnyvrXifmS2g0gQAEACOi/Z/arg8A2BeXT2VddBYLOmORUs8F1GQ9BiVJgAg4cxsXNKgx9i0/+kAnLADwCkAN7cMjXpffHu1mS2l0gQAcPT/Dn01dVrS3EZ1CQDHVM7n1V1dS2WdVOUL2jGy3PXYQbwumAAAAsCxbKb9nyaRnwKYW1svo66u3juwyLvLstnMzqHSBAAkkJnNk7TMY2we/pOaOVLW1F0AkeICQH/FXE73j054L4YuAAEAHP2/qbVcpdVtXVQ3HRZ4/F5w/n92XNk3qJFG14f3nWtmm6k0AQAEAEnSpp5+5Y0Gb0q43AFAAJilH3oz7Rpzf13w3umHRYEAgCQwsw5Jaz3G5va/VHF6CRC3AM6WTT39Oqu103MRyyRdTaUJAEiOSz3mQW2hqPM7eVIoAeAkHQCuAZhVu8fduwCPmlmBShMAkAwu7f8NXXNUzuWpbnpEfgqgKl/gMcCzbG17t9Z3zfFcxJCkm6g0AQAxZ2b1ki70GJv2Px2AkxlubOYakQrYMzbpfevlg2ZWRaUJAIi3zZIif1h4KZfTxd39VDc9QbFFUuRPcxpr5JXylbCkuU2XzhnwXESvpNupNAEA8ebS/j+3o0f1xSLV5ej/xAGgqZXKVsiusUnv7stOM+P8DgEAMT2qK093ACJH+58AMBOjTXQAKmWwvlHXzlvouYhWSTuoNAEA8XShpMjvwcqZaXMPT/9LGZdXyo1yCqCi7huZ8L5Q924za6fSBADEj0v7f2Vrh9qrqqluukT+nPf+2no1FEtUtoJ6a2p104Jhz0XUSdpFpQkAiBEzy2nq/v/I0f5P3VyplhT5g+Q5+o+HuxcvU13B9XqdW82MK4IJAIiRtZI6CACYgbMkRb6HGOP8fyy0lqt028Jxz0WUJT1MpQkAiA+X9v9oY4vm1fJo15Rxec0rdwDEx4cWjau17Hrb/vVmtphKEwCQ4gDA0X8qubwnglMA8VFXKOruxcs8F5GX9DiVJgCgwsxsmSSXPTUBIHVzJSfpbI8dDo8AjpebBofVW1PruYgrzWySShMAkMKj/3m19ZzXTZ8xSY2RH/03tYgHAMdLOZ/XfSMT3ot5gkoTAJDCALCZo/80cmn/jzVy/j+Orp23UIP1jZ6LuMjMLqDSBABUgJkNSnK55HdLLw//SSGXCwB5AmA85c20a8y9S/8klSYAIEVH/+1V1TqrtZPqEgBmZLK1g8rG1KVzBrSkuc1zEavM7DIqTQBASgLAJT1zleO1rqliZnMkRf4Al4ZiScMNzRQ4rttdU68LdrZ3+gJTEAAwSz/oXZJWe4xN+5+j/xkf/rV1EhZjbn3XHK1t7/ZcxKikn6PSBADMnss8tnd9sajzOnqpLgFgRla3dVHZBNg97t4FeMTMeBkEAQCzxKX9f1FXv0o5plEKudwBsKqNa0WS4KzWTm3qcX2E/4Ck91NpAgCcmVmjpPUeY9P+T+V8aZDDK4DLubwmmnk7bFLsGpv0Pl2z28xqqDQBAL62yOGFLuVcXhd191Hd9Fnj8duwrKVN5Xye6ibESGOLruwb9FxEl6Q7qTQBAL5c2v/rOntU6/sqUVSGS/uf8//Jc//ohIq+p/juMzNuCyEAwIOZVUm6xKWtwNP/0srtDgAky0Bdg947sMhzEU2S7qfSBAD4uEhS5G/5yJtpUw/n/1MYGAuSVkU+rqRVPCwqkXaMLFdVvuC5iA+bWTeVJgAgei7t/1VtnWrzfYc4KmO5pMgvzFrc2KymUpnqJlBnVY1uGRr1XESNpD1UmgCAaI/m8pK2eYxN+z+1uP8f73DHoiVqLLretn+zmc2n0gQAROdcSS4P9iYApJbL7aIEgGRrKpX14UVLPBdRlPQolSYAIDou7f8lTa3qq6mjuiljZvWaumbEIQBw/j/pbhkaU3tVtecirjWzcSpNAEA0tnP0j1OwVVLkJ+r7a+s1h8CYeDWFgnYML/feH+2l0gQAnPnR3Ao5vM2NAJBqV3oMelEXD4tKi+vnL1Z/bb3nIraZ2RoqTQDAmXFp/w/UNWi4ked2pDAw1sjpeRE8LTI9Srmcdo5OeC/mSSpNAEAMA8BWjv7T6hI53P5XlS/o3A5u8U6Td/Uv0OIG14OAdWa2kUoTAHB6R3MLJY14jE37P7Wu8hj0vI5u74fIYLZ3GmbaNeb+uuAnzHzfRAQCAEf/p6CzqkaTrR1UN32BsUpTL4yK3EXd/RQ4hTb3ztVEi+ubHSe8QikIAASA0/zSE8lT6WJJLld2cf4/vR4cX+m9iMemH2YGAgBmeDTXI+ksj7Fp/6eWy9X/w43NPC8ixc7t6NG6zl7PRSySdAOVJgBg5rZL0R+oNxZLOqedi7lSGBiLki51aSvQ/k+9Pf7XAjxkZrxEggCAGXJp/1/c3e/9XnBUxoWaeiVr5Gj/p9/ylnbvO4P6JN1GpQkAOPnRXLOk8z3G3tLLq39TyuVCq6ZSWWfx+t9M2DU2qbzvBfsPTD+mGgQAnMBWSZHfc1XO53UhT3NLY2DMy+lx0es753jvFBATCxua9O65Q56LaJP0ESpNAMCJubT/L+ico5oC93Kn0PmSWj0Gpv2fLfePTqjke4rwHjNro9IEABz7aK5aksvTs7bS/k8rl/Z/zkwXds2huhnSV1OnGwaHPRdRL+mjVJoAgGPbKIdHuebNtLGHAJDCwJiTU8forNZOtZarKHLG3DO8TLWFoucibjMzkiUBAMfg8mO+pr1LLSXuwkmhcyS5XKV3Rf98qptBbeVq3To05rmIKkkPUWkCAN56NFfQ1AWAkePlP6nl8vCfguV02RwCQFbdvmhczb4HDDdOv+sEBABMWyepxWPgzT0EgBQGRpN0hctE7OxRG+3/zGoolnTn4qWei8hLeoxKEwDwJpf2/7LmNvXW1FLd9FklyeVc6lX9C6huxr1/wYi6qms8F/EuM5ug0gQAjuamjuZc7uWm/Z9aN3oMWpUv8MAoqCpf0L0jrvtnk7SXShMAIK2U5PJGDl7+k8rAWC/pPR5jb+rp974KHAlx3cBCDdQ1eC5ik5mdR6UJAFnn0v5fUN+ohQ1NVDeFv82SXF7Rd1X/INWFpKmLQT86usJ7MU9SaQIAAcAB7f/UutVj0KZSmcdF4y2u6B/UWFOL5yLONrOtVJoAkElmNqypd2ZHjvZ/KufLGklLPMbe1jvP+1GwSNp8k7RrbKX3YvZOP9QKBACO/qPQXV2r5S3tVDd9Pug1MFf/41gu7u7TqjbXt0IukXQNlSYAEAAisrl3rniPW+qO/lskvctj7K7qGp3d3kWRcUx7xt27AI+aGVefEgAy9YPeJ2nSY2zO/6fSDZp6lGrkrugbVI5X/+I41rR1aYPv9SGDkm6m0gSALHG597+5VOZoLn1h0STd4jU+V//jZHaPT3p3FfdMvxEVBIBMcGn/X9zdrwLX1KTNhZJcnp++pLlNS5t5TTtObLypVdv7XN8R0S3pDipNAMjCEV2rJJeHYND+T6UdXgO/f8EI1cWMPDC2wvvg4n4za6TSBIC026apl2JEqjpf0PquXqqbrrC4VNJGj7FbSmVd2Uf7HzMzv65R7xlwfZFfs6T7qDQBIO1c2v/ru+aoKl+guulyv9fA1w0sUjmfp8KYsftGlnvPmTvNrJNKEwDSekRXK+lij7Fp/6durgxIerfLD4eZbhwcpsg4Jd3Vtbp50PW0Ua2k3VSaAJBWm+RwO1fBcrq4m0e5psw9cjhVJE1dLNpfW0+FccruGl6m+qLrbfsfMDOOZggAqeTS/l/b0a2mUpnqpufov03STV7jc/EfTldLqawPLVziuYiSpEeoNAEgbT/qRUlbPMbmPe6pc4ckl/uiF9Q3al0nF4vi9N22cExt5SrPRVxnZqNUmgCQJhdIivwdvSZpS888qpsetZI+5DX4zQtGeFQ0zmyCFoq6e3iZ977tcSpNAEgTl/b/REuHuqprqG56vF+Sy3tYawtFXTN3IRXGGbtxcFhzauo8F7HdzFZRaQJA4k0/zvUyj7Fp/6eO24/eNXOHvC/gQkaUc3ndNzLhvZgnqDQBIA1Wa+pxl5Hj9j/M1Pu4+A9RBsp5Qxqqb/JcxHoz20ClCQBJ59L+X9TQpMF6np6Jkzuvo0eLGpooBCKTN9MDYyvoAhAAUIkAsIWjf8zQPcPLKQIit23OgPcLpVaa2RVUmgCQSGY2JmmBx9i0/zETq9u6dE5HN4VA9L9vkvaMr/RezONmxnOrCQAc/R8xp6aOV7liRu4b4egffi7o7NXadteAOSzpvVSaAEAAmLaZq/8xAytbO3jwD9w96N8FeNjMSlSaAJAY08+0djn8ov2PmR39T1AEuJts7dCmHteDkrmSbqXSBIAk2e4xaGu5SqvbuqguTmiipV3ru+ZQCMyK3WOTypnrcyZ3mVkdlSYAJIVL+39jd7/yxgNdcWL3cvSPWTTc2Kyr+gc9F9Eh6S4qTQCIPTNrl3SOx9jc/oeTWdrcxiuiMet2jq5QMee6a9phZi1UmgAQd5d6bKOaQkEXcFEXToIr/1EJc2vrdf3AYs9FNEraSaUJAHHn0v7f0NWncp5bYnF8402t3hdkAcc/RB9Zrup8wXMRt5tZDwEAsWRm9ZJcnmFN+x8ncy9H/6igjqpq3TI06rmIakkPEgAQV5dIKkc9aDGX47wuTmi0sUWbCYmosDsWL1Vj0fW2/feZ2YIs15gAEF8u7f9zO3rUUORZGDi+h5ecJe4PQaU1Fku6Y/FSz0UUJD1KAECsTD+tarPH2LT/cSIXdfdx3z9i45ahUXVUVXsu4hozW5rV+hIA4ulCSQ2Rb2wzbebCLhxHMZfT40tXUwjERnW+oB2+16OYpL0EAMSJS/t/sqXDO00jwW4aHNGC+kYKgVi5fmCx5tbWey5ii5mdk8XaEgBixsxyki5zmeW0/3EcLaUy9/0jloq5nHaOrvBezBMEAMTB2Zp6XKVDAKD9j2PbObZCTaUyhUAsXdU/qOHGZs9FnGtmm7NWVwJA/Li0/0caWzRQ10B18Q6LG5p1w/xhCoH47qjMtHts0nsxe82y9YIUAkBGAgBH/zjur96y1bwYCrG3qWeuJls7PBexTNLVBABUxPTtKAM+AWAeBcY7bOzu1/m8FwIJ8eD4Su9FPGpmhazUkwCQgaP//tp6jTe1Ul28RTGX02NLV1EIJMba9m7vF5kNSbqJAIDUBADa/ziWmxeMaJDb/pAwe8ZXej+p8kEzq8pCLQtMp2hMXzyySNKkpMWnUduSpCUen+17L+/To1/6NBsJb/HqoUPMCyRSa7laP9v/qtfwvZJul/RvUr/fCiEwm85sx79W0mPTO/56KgIAifeMpPkhhBfTvJKcAjj9HX+Vmf1rSZ+QdAE7fwBIjVZJO+gA4Fg7/wWS/kASN08DQDrtm+4CPE0HAEd2/nlJv8HOHwBSrU7SrjSvIAHg1N0jiXunACD9bjWzfgIAZGbDkh6lEgCQCWVJHyEAQJI+OD0hAADZ8B4zKxIAMEkJACBT2iVtIABk2PTzoZdRCQDInFECABOgmjIAQObMIwBkWx0lAIBMSuXb1AgAM/cFSa9TBgDIHEvjShEAZiiE8LKkr1EJAAABIHs+QwkAAASA7PlvlAAAQADImBDC/5T0W1QCAEAAyJ7bJf2EMgAACADZ6gI8I+lmSQeoBgCAAJCtEPCHmnos8OepBgCAAJCtEPAlTb0W+FFJB6kIACBJLIRAFc60iGa1kpZPdwUmJS2WVKAymIGlDmM+Jel5SouMGpDUEPGYvx1CuCZthWInFU034GVJfz39D3Aq4dEjge8MIXC3CrL6nfo9SZdRiZPjFAAAAAQAAABAAAAAAAQAAABAAAAAAAQAAABAAAAAAAQAAABAAAAAABXEkwABADixDjO7SFJ5Bv/sk/Tt6X++HkLYRwAAAGSOmZmk0vTO8Xj/O9P/NpM/v8phNS6Y/udU7TOzX5H0CyGEH8Zu2/AyIKCiP44eX8BreRdAJudSVDvQqP98ka2jA5L2hhAepQMAAMncyRZjtnM9+n8RXyVJj5hZh6QPh5gceRMAAMRxJxvHo9mSJGML4Qx8aHq/eysBAECldrIFxa9VfOR/2ckizW4xs98IIVT89fFcAwD47GBthju8Tzos/luSXjrJ8rkFGKicz0o6K4TwOgEAOL2dbE6nfp70VP/M6Y5Hdw3AiWwPIfx+JT8AP1KYyU62UjvRk/0Z5i+ApForiQDATtbyFdyJnuzP5NlCABC5FZX+AJkJAG/bycZtR8tOFgCyZQkBIJqde6+k86cT1QpJA8fY0bKTBQDExcsEgDPb8TdK2iXpjukdPQAASfADAsDp7/yvkPQrklqZRwAAAkAGAoCZbZD0X8XjLwEAyfR7Fd+XJu05AGY2IekvJdUzfwAACfQjSfNCCAcr+SGS+DSw/8jOHwCQYP++0jv/xHUAzGzd9NE/AABJ9OeSLgkhHKj0B0laB+Au5g4AIKG+KOnyOOz8E9UBMLNWST8VLzEBACRz539JCOFHcflASdqZnsvOHwCQQH8kaW2cdv5JCwDnMYcAAAnzi5IuDSHsi9sHS9JzANYxjwAgG3K5nMqloorFgsrF0pv/XiqpVCyoVCqqVCxO//ep/z3y7//89DP6i099ptKrcEjSh0MIvxzXGiciAEw/8ncZXwkAiE4+n1OpWHzjn3Kp+LYd67F3uKVj/bc3xpn6O1N/980/+/Zx3jre0eMUVCqWlM+fXoP6s1/6mq6+7YFKl/YFSe8OIfxpnLd/UjoAa8X5fwCJ3cke2Qm+ufMrv21HWCoV37ajfHOH+cZ/K75th3tkh1kqveO/vWUn/PZlTv9zujvZuPr9P/2EPrBzr159bX8lP8Z3JG0NIXw17vVKSgCg/Q/g+D9k+fwbbeCjd55v3/kVi+/c8R59pFsuzrzNfKIdbrn45r/nchy7zIZ/+x//qx76hV9Rhe9s+xtN3eb3dCK+NwQAADPdyR5rh/iOHe5R/158e3u4VFS5eGpt5uPucIulN/6dnWx2HTp8WHc/8gv69d/9o0p/lN+U9L4Qwv6k1C72zwEws1pJzyvhry4GTmUne6Ij0Le2fI/a+RZP0PI97g73GDvuYlHFIzvqo3a47GQRNy++9LLee9eD+ou//WwlP0aQ9HAI4dHE/d4k4DOezc4fUSoWCm+2fGdyZfFxdognPMd6oh138Z1HzUf+jJmxgYAZeOoHP9a7PvhRff1b363kx3hN0o0hhN9K5AFHAj4j7f+E7mSPd5XvMXe4R+1kZ3SO9Y1/P86O+wRtanayQLJ9+h++qms+tEtPP/tcJT/GTyVdFkL4P0mtYxICAA8AOo7SGxcsnfi2miP30c74XO3RVyMfa5xS4QS3DRXZyQJw89//5C9060ef1Gv7K/o4/S9r6kr/p5Jcy1hfA2BmVZo6/1+u5E72VG6rmdG52mPscI89zluPcN9+tAsAWfKxX/lNPfqL/6HSV/r/iaSrQwgvJr2ece8ArPbY+V94zkrt/ODPn+TiKHayABAHBw8d0p0PfUy/8T/+V6U/yi9JuiuEcDgNdY17AHBp/19y/tlatXyMbxUAxNwLL+3TdXc8qL/6u89V8mMcnt7x/1Kaahv3AOByAeDayaV8qwAg5r77/R/pqg/u1De+/b1KfowXNdXy/5O01Te2N/aaWUnSmqjHbWqo18jQAN8sAIixv/v8l7X+2tsqvfN/SlOv8f2TNNY4zk/2mJRUHfWgqyfGuEIdAGLsd//4z7Xtpo/oZ88+X8mP8X8knRVC+HJa6xznUwC0/wEgY/7VL/9n7f2/f7XSV/r/lqYe8PNammuduQBw9oolfMMAIGYOHDyoOx76mP7L71W82/6oph7tG9Je81gGADPLa+oVwJGqrqrSstGFfNMAIEaef/El/dwde/TJv/9CJT/Gfk29zOc3s1L3uHYAJiTVRT3oWUtHVCzwWgEAiIvvfP9HuvKW+/XN736/kh/jaUnbQwifylLt43oRoE/7f5L2PwDExd9+7ktaf80HK73z/6qkVVnb+cc5ALg8AIgAAADx8Dt/+HFdetNH9MxzL1TyY/yppLNDCN/J4jaIXT/czHKSzo163GKhoLOWjvCtA4AK+xf/7tf1xC/9WqU/xr+XdEcI4VBWt0McT4gvkdQU9aDLRhequqqKbx4AVMiBgwd1+55/rd/6gz+t5Md4XdJHQgi/mPXtEccA4NP+5/Y/AKiY5154Ue/58B79zWf+oZIfY5+ka0IIf8QWiWcA4AFAAJAi33rqB7rq1p361lM/qOTH+J6kbSGEL7JFpsTqIkCbekbveQ7javUEb/8DgNn2N5/5B62/5rZK7/z/XlNX+rPzj2sAkDQsqS3qQUeGBtTUUM/WBoBZ9Nv/88902ft26LkXXqzkx/gdSeeHEP6ZLfJWcTsFQPsfAFLgiV/6Nf2Lf/frlf4YeyXtycJjfQkAx7FmxThbGgBmwf4DB3Xb7n+p3/nDj1fyYxyQ9P4Qwn9iiyQnAHAHAAAk1LPPv6hrb9+lv/3clyr5MZ6RdHkI4ZNskYQEADMbktQd9bgDfT3q7mhjSwOAo29+9/u68pb79Z3v/6iSH+PrkraGEL7FFjm5OF0EyPP/ASCB/vrTU1f6V3jn/78lrWHnn8AOgJza/ybT7/7xn7OlAcDBD378Ez3+f/2qDhw8WMmP8f9Kui3Lj/U9rf1jXC6ONLOnJPWzSQAAM/S6pPtCCB+jFAntAJjZPHb+AIBT8LKk94QQ/oBSJDgAyKn9DwBIpR9o6rG+X6AUpy8uFwGuY1MAAGbgs5LOYudPAAAAZMd/l3ReCOHHlCIFAcDMeiUNsikAACfwLyVdFUJ4hVJEIw7XAHD+HwBwPAcl3RJC+DVKQQAAAGTDs5KuCCH8FaVIZwAYZjMAAN7mG5p6rO8/UQofcbgIcD6bAQBwlL+UtJqdf/oDQD2bAQAw7VclXRxCeI5SpD8A/ITNAACZFyTdH0J4XwjhIOXIRgD4PpsBADLtFUlXhhD+FaXIVgD4YzYDAGTWjySdG0L4H5RidlX8bYBm1ifpKUnG5gCATPm8pp7p/0NKkcEOQAjh+5L+HzYFAGTK708f+bPzz2oHYLoL0CTpa5K62CQAkHr/RlMX/L1OKTLcAZjuAjwvaauk59kkAJBaByW9P4RwLzt/AsDRIeCzkjZK4i1PAJA+35W0MYTwHygFAeBYIeDvNfVo4F+WdJjNAwCJt0/SLknDIYS/oBzxEYtrAI75wcy6JF2jqVMD8yTNkVRmkwFArL0i6auSvjz9z38JIdDZjaH/H7gN7llj7GFNAAAAAElFTkSuQmCC';
function yachtDivIcon(){
  return L.divIcon({
    className: 'yacht-marker-icon',
    html: `<div style="width:100%;height:100%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));">
      <img src="${YACHT_ICON_DATA_URL}" width="34" height="34" style="display:block;">
    </div>`,
    iconSize: [34,34],
    iconAnchor: [17,17]
  });
}
// Great-circle initial bearing from a to b, in compass degrees (0=N, 90=E).
function bearingDeg(a,b){
  const toRad = d=>d*Math.PI/180, toDeg = r=>r*180/Math.PI;
  const lat1=toRad(a.lat), lat2=toRad(b.lat), dLon=toRad(b.lng-a.lng);
  const y = Math.sin(dLon)*Math.cos(lat2);
  const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  return (toDeg(Math.atan2(y,x))+360)%360;
}

// The actual test: try to load one real map tile. This checks the exact thing
// we need (can we draw a live map right now) rather than a generic "online"
// flag, which browsers can report inaccurately (e.g. connected to a router
// with no real internet).
function checkTilesAvailable(){
  return new Promise((resolve)=>{
    if(typeof L === 'undefined'){ resolve(false); return; } // Leaflet failed to load — offline on first-ever run, or the CDN is blocked
    const img = new Image();
    let done = false;
    const finish = (ok)=>{ if(done) return; done=true; resolve(ok); };
    const timeout = setTimeout(()=>finish(false), 4000);
    img.onload = ()=>{ clearTimeout(timeout); finish(true); };
    img.onerror = ()=>{ clearTimeout(timeout); finish(false); };
    img.src = 'https://tile.openstreetmap.org/1/1/1.png?_='+Date.now();
  });
}
function initLiveLeafletMap(){
  if(liveLeafletMap || typeof L==='undefined') return;
  liveLeafletMap = L.map('liveTrackLeaflet', {attributionControl:true});
  liveStyleLayers = applyMapStyle(liveLeafletMap, currentMapStyle);
  liveLeafletPolyline = L.polyline([], {color:'#16324F', weight:3}).addTo(liveLeafletMap);
  liveLeafletMarker = L.marker([0,0], {icon: yachtDivIcon()}).addTo(liveLeafletMap);
  liveLeafletMap.setView([0,0], 13);
  liveMapFollowing = true;
  const recenterBtn = document.getElementById('liveMapRecenterBtn');
  if(recenterBtn) recenterBtn.classList.remove('show');
  // 'dragstart'/'zoomstart' fire for BOTH a real touch/mouse gesture and our own
  // setView() calls below — liveMapProgrammaticMove distinguishes the two, so only
  // an actual pan/pinch from the sailor breaks auto-follow.
  liveLeafletMap.on('dragstart zoomstart', ()=>{
    if(liveMapProgrammaticMove) return;
    liveMapFollowing = false;
    if(recenterBtn) recenterBtn.classList.add('show');
  });
  const toggle = document.getElementById('liveMapStyleToggle');
  if(toggle){ toggle.style.display = 'flex'; renderMapStyleMenu('live'); }
}
// Jumps back to the boat's last known position and turns auto-follow back on —
// the recenter button's tap handler.
function recenterLiveMap(){
  if(!liveLeafletMap) return;
  liveMapFollowing = true;
  const recenterBtn = document.getElementById('liveMapRecenterBtn');
  if(recenterBtn) recenterBtn.classList.remove('show');
  if(liveLastLatLng){
    liveMapProgrammaticMove = true;
    liveLeafletMap.setView(liveLastLatLng, Math.max(liveLeafletMap.getZoom(), 14));
    liveMapProgrammaticMove = false;
  }
}
function updateLiveLeafletTrack(path){
  if(!liveLeafletMap || !path.length) return;
  const latlngs = path.map(p=>[p.lat,p.lng]);
  liveLeafletPolyline.setLatLngs(latlngs);
  const last = latlngs[latlngs.length-1];
  liveLeafletMarker.setLatLng(last);
  liveLastLatLng = last;
  // Only auto-recenter/zoom while following — if the sailor's panned or zoomed the
  // map themselves, leave it exactly where they put it until they tap "re-center".
  if(liveMapFollowing){
    liveMapProgrammaticMove = true;
    liveLeafletMap.setView(last, Math.max(liveLeafletMap.getZoom(), 14));
    liveMapProgrammaticMove = false;
  }
}
// Switches the visible UI between the real map and the offline porthole —
// called whenever a connectivity check's result changes.
function setLiveMapMode(online){
  liveMapIsOnline = online;
  const badge = document.getElementById('liveMapModeBadge');
  const text = document.getElementById('liveMapModeText');
  const leafletEl = document.getElementById('liveTrackLeaflet');
  const porthole = document.getElementById('liveTrackPorthole');
  if(!badge) return; // not on the active screen right now
  if(online){
    badge.className = 'map-mode-badge live';
    text.textContent = t('map.liveMap');
    leafletEl.style.display='block';
    porthole.style.display='none';
    initLiveLeafletMap();
    setTimeout(()=>{ if(liveLeafletMap) liveLeafletMap.invalidateSize(); }, 50); // Leaflet needs this after its container becomes visible
    if(currentTrip && currentTrip.path.length) updateLiveLeafletTrack(currentTrip.path);
  } else {
    badge.className = 'map-mode-badge offline';
    text.textContent = t('map.offlineTrack');
    leafletEl.style.display='none';
    porthole.style.display='block';
  }
}
async function refreshLiveMapMode(){
  const online = await checkTilesAvailable();
  setLiveMapMode(online);
}
function startLiveConnCheck(){
  // Fresh map instance per journey — Leaflet doesn't like being silently reused
  // across an unrelated new map() call on the same container.
  if(liveLeafletMap){ liveLeafletMap.remove(); liveLeafletMap=null; }
  refreshLiveMapMode();
  if(liveConnCheckInterval) clearInterval(liveConnCheckInterval);
  liveConnCheckInterval = setInterval(refreshLiveMapMode, 20000);
}
function stopLiveConnCheck(){
  if(liveConnCheckInterval){ clearInterval(liveConnCheckInterval); liveConnCheckInterval=null; }
}

function buildPortholeSvg(path, live, sys){
  const lats = path.map(p=>p.lat), lngs = path.map(p=>p.lng);
  const minLat=Math.min(...lats), maxLat=Math.max(...lats), minLng=Math.min(...lngs), maxLng=Math.max(...lngs);
  const padLat=(maxLat-minLat)*0.15||0.001, padLng=(maxLng-minLng)*0.15||0.001;
  const w=260,h=260;
  const viewMinLat=minLat-padLat, viewMaxLat=maxLat+padLat, viewMinLng=minLng-padLng, viewMaxLng=maxLng+padLng;
  const toXY = (p)=>{
    const x = ((p.lng-viewMinLng)/(viewMaxLng-viewMinLng))*w;
    const y = h - ((p.lat-viewMinLat)/(viewMaxLat-viewMinLat))*h;
    return [x,y];
  };
  const pts = path.map(toXY);
  const d = pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const start = pts[0], end = pts[pts.length-1];

  // Scale bar: convert the width of the view (in degrees longitude) to a real
  // distance at this latitude, pick a round number, then draw a bar that long.
  const meanLatRad = (viewMinLat+viewMaxLat)/2 * Math.PI/180;
  const totalNmAcrossView = (viewMaxLng-viewMinLng) * 60 * Math.cos(meanLatRad); // 1° longitude ≈ 60·cos(lat) NM
  const nmPerPx = totalNmAcrossView / w;
  const isMetric = sys==='metric';
  const maxBarNm = 90 * nmPerPx; // keep the bar comfortably inside the circle
  const barValue = isMetric ? niceScaleValue(maxBarNm*NM_TO_KM)/NM_TO_KM : niceScaleValue(maxBarNm);
  const barPx = barValue / nmPerPx;
  const barLabel = isMetric ? (barValue*NM_TO_KM).toFixed(barValue*NM_TO_KM<1?2:0)+' km' : barValue.toFixed(barValue<1?2:0)+' NM';
  const barX0 = 130 - barPx/2, barY = 222;

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="var(--water)"/>
    <path d="${d}" fill="none" stroke="var(--navy)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${start[0]}" cy="${start[1]}" r="6" fill="#2E8B57"/>
    ${live
      ? `<circle cx="${end[0]}" cy="${end[1]}" r="9" fill="var(--coral)" opacity=".35"><animate attributeName="r" values="7;13;7" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".45;.05;.45" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="${end[0]}" cy="${end[1]}" r="6" fill="var(--coral)"/>`
      : `<circle cx="${end[0]}" cy="${end[1]}" r="6" fill="var(--coral)"/>`}
    <g transform="translate(130,32)" opacity=".85">
      <path d="M0,-11 L5,4 L0,0.5 L-5,4 Z" fill="var(--navy)"/>
      <text x="0" y="17" text-anchor="middle" font-size="10" font-weight="700" fill="var(--navy)" font-family="sans-serif">N</text>
    </g>
    <g opacity=".85">
      <line x1="${barX0}" y1="${barY}" x2="${barX0+barPx}" y2="${barY}" stroke="var(--navy)" stroke-width="2"/>
      <line x1="${barX0}" y1="${barY-4}" x2="${barX0}" y2="${barY+4}" stroke="var(--navy)" stroke-width="2"/>
      <line x1="${barX0+barPx}" y1="${barY-4}" x2="${barX0+barPx}" y2="${barY+4}" stroke="var(--navy)" stroke-width="2"/>
      <text x="130" y="${barY+15}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--navy)" font-family="sans-serif">${barLabel}</text>
    </g>
  </svg>`;
}
// Small text caption shown under the porthole with the start/current lat-lng —
// pairs with the map to give real numbers alongside the abstract picture.
function portholeCoordsCaption(path){
  if(!path || !path.length) return '';
  const last = path[path.length-1];
  const fmt = (v,pos,neg)=> Math.abs(v).toFixed(4)+'°'+(v>=0?pos:neg);
  return `${fmt(last.lat,'N','S')}, ${fmt(last.lng,'E','W')}`;
}
// Called on the active journey screen after every GPS fix. Updates whichever
// map is currently visible — the real Leaflet map if online, the offline
// porthole SVG if not (see setLiveMapMode/liveMapIsOnline above).
function renderLiveTrack(){
  const el = document.getElementById('liveTrackPorthole');
  if(!el || !currentTrip) return;
  const path = currentTrip.path;
  const coordsEl = document.getElementById('liveTrackCoords');
  if(coordsEl) coordsEl.textContent = portholeCoordsCaption(path);

  if(liveMapIsOnline && liveLeafletMap){
    if(path && path.length) updateLiveLeafletTrack(path);
    return; // real map is showing; the offline porthole underneath doesn't need updating
  }

  if(!path || path.length<2){
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px;font-size:12px;color:var(--ink-muted);">${path && path.length===1 ? t('map.gotPosition') : t('map.waitingGps')}</div>`;
    return;
  }
  el.innerHTML = buildPortholeSvg(path, true, activeUnitSystem);
}
async function deleteTripPrompt(){
  if(!openTripId) return;
  if(!confirm(t('confirm.deleteTrip'))) return;
  await storeDelete('trip:'+openTripId);
  state.tripIndex = state.tripIndex.filter(t=>t.id!==openTripId);
  await storeSet(KEYS.INDEX, state.tripIndex);
  showToast(t('toast.tripDeleted'));
  nav('history'); renderHomeStats();
}
// Native share sheet if the browser supports it (navigator.share), otherwise
// falls back to copying a text summary to the clipboard.
function shareTrip(id){
  const trip = window._detailTrip;
  const text = t('share.tripSummary', {
    title: trip.title, date: new Date(trip.date).toLocaleDateString(currentLocale()),
    distance: fmtDistance(trip.distanceNm||0), duration: fmtDuration(trip.elapsedSeconds), avgSpeed: fmtSpeed(trip.avgSpeed||0)
  });
  if(navigator.share){
    navigator.share({ title: trip.title, text }).catch(()=>{});
  } else {
    navigator.clipboard?.writeText(text);
    showToast(t('toast.copiedSummary'));
  }
}

/* ============================================================
   BOATS
   Standard pattern used here and in Crew below: openXSheet(item) pre-fills
   the form (item=null means "adding new"), saveXForm() pushes/updates
   state.X and re-renders the list, deleteXForm() removes and re-renders.
   ============================================================ */

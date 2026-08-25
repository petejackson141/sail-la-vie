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

// "Minimal" (CARTO Positron) is now the default — light grey background, thin
// roads, muted labels, no clutter. Voyager/Standard/Nautical/Satellite are
// still there in the style switcher for anyone who wants them.
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
let liveMarkerHeading = 0; // degrees, last known — kept steady between fixes when the boat's barely moving
let liveMapFollowing = true;   // true = auto-recenter/zoom on every fix (default); false once the sailor pans/zooms it themselves
let liveMapProgrammaticMove = false; // guards our own setView calls so they don't get mistaken for a user drag/zoom below
let liveLastLatLng = null;     // last known boat position, so the re-center button has somewhere to jump back to

// Small top-down sailboat glyph used as the live-tracking marker (bow = 0°/north,
// rotated to the boat's heading between GPS fixes). Built as a divIcon so plain
// CSS transform:rotate can turn it, instead of juggling separate rotated PNGs.
function yachtDivIcon(headingDeg){
  return L.divIcon({
    className: 'yacht-marker-icon',
    html: `<div style="width:100%;height:100%;transform:rotate(${headingDeg}deg);transition:transform .4s ease;
        filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));">
      <svg viewBox="0 0 32 32" width="36" height="36">
        <ellipse cx="16" cy="25" rx="7" ry="1.6" fill="rgba(0,0,0,.18)"/>
        <path d="M16 2 C19.5 9 21 17.5 19.6 25.5 Q16 28.4 12.4 25.5 C11 17.5 12.5 9 16 2 Z" fill="#F7F3E8" stroke="#16324F" stroke-width="1.4"/>
        <line x1="16" y1="3.5" x2="16" y2="24" stroke="#16324F" stroke-width="1"/>
        <path d="M16 4.5 L16 21.5 L24 19 Z" fill="#C9A24B" stroke="#16324F" stroke-width="1"/>
        <path d="M16 4.5 L16 15 L9 16.2 Z" fill="#D65A4A" stroke="#16324F" stroke-width="1"/>
      </svg>
    </div>`,
    iconSize: [36,36],
    iconAnchor: [18,18]
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
  liveMarkerHeading = 0;
  liveLeafletMarker = L.marker([0,0], {icon: yachtDivIcon(liveMarkerHeading)}).addTo(liveLeafletMap);
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
  // Only re-point the boat once it's actually moved a meaningful amount —
  // otherwise GPS jitter while sitting still spins the icon back and forth.
  if(path.length>1){
    const prev = path[path.length-2], curr = path[path.length-1];
    if(haversineNm(prev,curr) > 0.005){ // ~9m
      liveMarkerHeading = bearingDeg(prev,curr);
      liveLeafletMarker.setIcon(yachtDivIcon(liveMarkerHeading));
    }
  }
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

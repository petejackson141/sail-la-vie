// ===== pdf-export.js =====
// PDF theme templates and HTML builders for trip PDFs, PDF generation/sharing, photo lightbox viewer
// Extracted from the original single-file app.js, lines 3611-4514, in original order.

function hexToRgbTuple(hex){
  const h = (hex||'#ffffff').replace('#','');
  const n = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
const PDF_THEMES = {
  classic: {
    label: 'pdf.themeClassic',
    swatch: '#16324F',
    pageW: 595.28, pageH: 841.89, // A4
    contentWidthPx: 794,
    formatLabel: 'pdf.formatA4',
    sheetClass: '',
    build: buildTripPdfHtmlClassic
  },
  nautical: {
    label: 'pdf.themeNautical',
    swatch: '#B8905A',
    pageW: 595.28, pageH: 841.89, // A4
    contentWidthPx: 794,
    formatLabel: 'pdf.formatA4',
    sheetClass: 'pdf-theme-nautical',
    // Most sails fit one page; a long note or a full 8-photo set can still
    // run to a 2nd. paginate:true now uses computeSectionPageBreaks() below,
    // which only ever breaks BETWEEN top-level sections, never through one.
    paginate: true, pageBg: '#F8F4EE',
    build: buildTripPdfHtmlNautical
  },
  story: {
    label: 'pdf.themeSailingStory',
    swatch: '#122F4E',
    pageW: 595.28, pageH: 841.89, // A4 — was a non-standard 8.5"x12.75" poster size
    contentWidthPx: 794,
    formatLabel: 'pdf.formatA4',
    sheetClass: 'pdf-theme-story',
    paginate: true, pageBg: '#FAF6EF',
    build: buildTripPdfHtmlStory
  },
  yacht: {
    label: 'pdf.themeMinimalistYacht',
    swatch: '#16324F',
    pageW: 595.28, pageH: 841.89, // A4 — was a non-standard 8.5"x12.75" poster size
    contentWidthPx: 794,
    formatLabel: 'pdf.formatA4',
    sheetClass: 'pdf-theme-yacht',
    paginate: true, pageBg: '#FAF8F6',
    build: buildTripPdfHtmlMinimalistYacht
  },
  memory: {
    label: 'pdf.themeMemoryPage',
    swatch: '#B4884F',
    pageW: 595.28, pageH: 841.89, // A4 — was a non-standard 8.5"x12.75" poster size
    contentWidthPx: 794,
    formatLabel: 'pdf.formatA4',
    sheetClass: 'pdf-theme-memory',
    paginate: true, pageBg: '#FAF6EF',
    build: buildTripPdfHtmlMemoryPage
  }
};
let currentPdfTheme = localStorage.getItem('pdfTheme') || 'nautical';
if(!PDF_THEMES[currentPdfTheme]) currentPdfTheme = 'nautical';

function renderPdfThemePicker(){
  const el = document.getElementById('pdfThemePicker');
  if(!el) return;
  el.innerHTML = Object.keys(PDF_THEMES).map(id=>{
    const theme = PDF_THEMES[id];
    return `<div class="pdf-theme-opt${id===currentPdfTheme?' active':''}" onclick="selectPdfTheme('${id}')">
      <span class="pdf-theme-swatch" style="background:${theme.swatch}"></span>${t(theme.label)}
    </div>`;
  }).join('');
  const fmt = document.getElementById('pdfThemeFormat');
  if(fmt) fmt.textContent = t(PDF_THEMES[currentPdfTheme].formatLabel);
}
function selectPdfTheme(id){
  if(!PDF_THEMES[id]) return;
  currentPdfTheme = id;
  localStorage.setItem('pdfTheme', id);
  openTripPdfPreview();
}

// Builds the PDF's HTML content — shared by the in-app preview and the final
// rendered PDF, so what you preview is exactly what gets shared (WYSIWYG).
// Designed to comfortably fit one A4 page even with 8 photos and full weather
// details; notes are capped so a very long one can't push it onto a 2nd page.
function buildTripPdfHtmlClassic(trip){
  const boat = state.boats.find(b=>b.id===trip.boatId);
  const tripCrew = (trip.crewIds||[]).map(cid=>crewMemberById(cid)).filter(Boolean);
  const tripSkipper = trip.skipperId ? skipperById(trip.skipperId) : null;
  const d = new Date(trip.date);
  const dateStr = d.toLocaleDateString(currentLocale(),{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const timeStr = d.toLocaleTimeString(currentLocale(),{hour:'numeric',minute:'2-digit'});
  const photos = (trip.photos||[]).filter(p=>p!==trip.coverPhoto); // never repeat the hero/cover photo in the grid below
  let notes = trip.notes || '';

  return `<div class="pdf-sheet" id="pdfTripBlock">
    <h1>${escapeHtml(trip.title||t('pdf.sailLogFallback'))}</h1>
    <div class="pdf-sub">${dateStr} · ${timeStr}${boat?' · '+escapeHtml(boat.name):''}${trip.place?' · 📍 '+escapeHtml(trip.place):''}</div>

    <div class="pdf-top-row">
      ${trip.coverPhoto ? `<div class="pdf-cover-cell"><img src="${trip.coverPhoto}"></div>` : ''}
      <div class="pdf-top-right">
        <div class="pdf-stats-grid">
          <div><b>${fmtDuration(trip.elapsedSeconds)}</b><span>${t('detail.elapsed')}</span></div>
          <div><b>${fmtDistance(trip.distanceNm||0)}</b><span>${t('stat.distance')}</span></div>
          <div><b>${fmtSpeed(trip.avgSpeed||0)}</b><span>${t('stat.avgSpeed')}</span></div>
          <div><b>${fmtSpeed(trip.maxSpeed||0)}</b><span>${t('stat.maxSpeed')}</span></div>
        </div>
        <p class="pdf-weather-line">
          💨 ${escapeHtml(compassLabel(trip.weather?.windDir)||'—')} ${trip.weather?.windSpeed!=null?fmtSpeed(trip.weather.windSpeed):''}${trip.weather?.gusts?` · ${t('detail.gustsShort')} ${fmtSpeed(trip.weather.gusts)}`:''}<br>
          🌊 ${escapeHtml(seaStateLabel(trip.weather?.seaState)||'—')}${trip.weather?.waveHeight?` (${escapeHtml(String(trip.weather.waveHeight))} m)`:''}${trip.weather?.waveDir?` ${t('detail.fromDir')} ${escapeHtml(compassLabel(trip.weather.waveDir))}`:''}
          ${trip.weather?.temp?` · 🌡 ${escapeHtml(String(trip.weather.temp))}°C`:''}
        </p>
      </div>
    </div>

    ${notes ? `<div class="pdf-section-title">${t('active.notes')}</div><p>${escapeHtml(notes)}</p>` : ''}

    ${tripSkipper ? `<div class="pdf-section-title">${t('active.skipper')}</div><div class="pdf-crew-grid"><div class="pdf-crew-chip"><img src="${tripSkipper.photo||placeholderAvatar()}"><span>${escapeHtml(tripSkipper.name)}</span></div></div>` : ''}

    ${tripCrew.length ? `<div class="pdf-section-title">${t('active.crewAboard')}</div><div class="pdf-crew-grid">${tripCrew.map(c=>`<div class="pdf-crew-chip"><img src="${c.photo||placeholderAvatar()}"><span>${escapeHtml(c.name)}</span></div>`).join('')}</div>` : ''}

    ${photos.length ? `<div class="pdf-section-title">${t('active.photos')}</div><div class="pdf-photos-grid">${photos.map(p=>`<div class="pdf-photo-cell"><img src="${p}"></div>`).join('')}</div>` : ''}

    <div class="pdf-foot">Sail la Vie Logbook · ${t('cert.generated')} ${new Date().toLocaleDateString(currentLocale())}</div>
  </div>`;
}

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
function buildTripPdfHtmlNautical(trip){
  const boat = state.boats.find(b=>b.id===trip.boatId);
  const tripCrew = (trip.crewIds||[]).map(cid=>crewMemberById(cid)).filter(Boolean);
  const tripSkipper = trip.skipperId ? skipperById(trip.skipperId) : null;
  const crewList = [ ...(tripSkipper ? [{...tripSkipper, role:t('active.skipper')}] : []),
                      ...tripCrew.map(c=>({...c, role:t('nav.crew')})) ];
  const d = new Date(trip.date);
  const dateLabel = d.toLocaleDateString(currentLocale(),{weekday:'long'}).toUpperCase();
  const dateValue = d.toLocaleDateString(currentLocale(),{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  const timeStr = d.toLocaleTimeString(currentLocale(),{hour:'numeric',minute:'2-digit'});
  const photos = (trip.photos||[]).filter(p=>p!==trip.coverPhoto); // every photo except the hero — never capped, never repeated elsewhere in this theme
  let notes = trip.notes || '';
  const paragraphs = notes ? notes.split(/\n+/).filter(Boolean) : [];

  const w = trip.weather || {};
  const condRows = [];
  if(w.windDir || w.windSpeed!=null) condRows.push({icon:'wind', label:t('pdf.condWind'), value:`${escapeHtml(compassLabel(w.windDir)||'')} ${w.windSpeed!=null?fmtSpeed(w.windSpeed):''}`.trim()});
  if(w.gusts) condRows.push({icon:'wind', label:t('pdf.condGusts'), value:fmtSpeed(w.gusts)});
  if(w.seaState) condRows.push({icon:'wave', label:t('pdf.condSea'), value:escapeHtml(seaStateLabel(w.seaState))});
  if(w.waveHeight) condRows.push({icon:'wave', label:t('pdf.condWaves'), value:`${escapeHtml(String(w.waveHeight))} m`});
  if(w.temp) condRows.push({icon:'thermo', label:t('pdf.condTemp'), value:`${escapeHtml(String(w.temp))}°C`});

  const stats = [
    {value:fmtDistance(trip.distanceNm||0).split(' ')[0], unit:distUnitLabel(), label:t('stat.distance'), icon:'pin'},
    {value:fmtDuration(trip.elapsedSeconds), unit:'', label:t('detail.elapsed'), icon:'clock'},
    {value:fmtSpeed(trip.avgSpeed||0).split(' ')[0], unit:speedUnitLabel(), label:t('stat.avgSpeed'), icon:'gauge'},
    {value:fmtSpeed(trip.maxSpeed||0).split(' ')[0], unit:speedUnitLabel(), label:t('stat.maxSpeed'), icon:'gauge'},
  ];

  // Three cases, same priority order as the app's own trip-detail map
  // (renderTripDetailMap in history-maps.js): a recorded GPS track, falling
  // back to a manually-uploaded map image (trip.mapImage) when there's no
  // track, falling back to the empty placeholder only when neither exists.
  // The old version only ever checked trip.path, so a trip with an uploaded
  // map but no GPS track silently fell through to "no track recorded".
  const mapInner = (trip.path && trip.path.length>1)
    ? buildPortholeSvg(trip.path, false, appUnitSystem(), 686, 280) // matches .n-map-box's rendered size (794 sheet − 34×2 .n-cards pad − 20×2 .n-card pad, × 280 tall)
    : trip.mapImage
      ? `<div class="n-map-img" style="background-image:url('${trip.mapImage}')"></div>`
      : `<div class="n-map-empty">${t('pdf.noTrack')}</div><div class="n-map-compass">${navCompassSvg(30,'rgba(12,42,74,.55)','rgba(12,42,74,.7)')}</div>`;

  return `<div class="pdf-sheet" id="pdfTripBlock">
    <div class="n-hero">
      ${trip.coverPhoto ? `<img src="${trip.coverPhoto}">` : `<div class="n-hero-noimg"></div>`}
      <div class="n-hero-content">
        <div class="n-hero-left">
          <div class="n-compass"><img class="n-logo-badge" src="images/Logo.png" alt=""></div>
          <div>
            <h1 class="n-hero-title">${escapeHtml(trip.title||t('pdf.sailLogFallback'))}</h1>
            ${trip.place ? `<div class="n-hero-subtitle">${escapeHtml(trip.place)}</div>` : ''}
          </div>
        </div>
        <div class="n-hero-meta">
          <div class="n-meta-row">${PDF_ICON_SVG.calendar}<b>${dateLabel}</b></div>
          <div class="n-meta-sub">${dateValue}</div>
          <div class="n-meta-row">${PDF_ICON_SVG.clock}<b>${timeStr}</b></div>
        </div>
      </div>
    </div>

    ${boat ? `<div class="n-boat-strip">${boat.photo ? `<img class="n-boat-photo" src="${boat.photo}">` : ''}<span class="n-boat-name">${escapeHtml(boat.name)}</span></div>` : ''}

    <div class="n-stats">
      ${stats.map(s=>`<div class="n-stat">
        <span class="n-stat-icon">${PDF_ICON_SVG[s.icon]}</span>
        <span class="n-stat-text"><b>${s.value}</b>${s.unit?`<span class="n-stat-unit">${s.unit}</span>`:''}<span class="n-stat-label">${s.label}</span></span>
      </div>`).join('')}
    </div>

    <div class="n-cards">
      ${condRows.length ? `<div class="n-card n-card-conditions">
        <div class="n-heading">${t('pdf.conditions')}</div>
        ${condRows.map(r=>`
          <div class="n-cond-row">
            <span class="n-cond-label"><span class="n-cond-icon">${PDF_ICON_SVG[r.icon]}</span>${escapeHtml(r.label)}</span>
            <span class="n-cond-value">${r.value}</span>
          </div>`).join('')}
      </div>` : ''}
      ${paragraphs.length ? `<div class="n-card n-card-day">
        <div class="n-heading">${t('pdf.theDay')}</div>
        <div class="n-quote-mark">&ldquo;</div>
        <div class="n-story">${paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</div>
      </div>` : ''}
      ${crewList.length ? `<div class="n-card n-card-crew">
        <div class="n-heading">${t('nav.crew')}</div>
        <div class="n-crew-list">${crewList.map(m=>`
          <div class="n-crew-item">
            <img class="n-crew-photo" src="${m.photo||placeholderAvatar()}">
            <div><span class="n-crew-role">${escapeHtml(m.role)}</span><span class="n-crew-name">${escapeHtml(m.name)}</span></div>
          </div>`).join('')}</div>
      </div>` : ''}
    </div>

    <div class="n-card n-card-route">
      <div class="n-heading">${t('pdf.theRoute')}</div>
      <div class="n-map-box">${mapInner}</div>
    </div>

    ${photos.length ? `<div class="n-card n-card-photos">
      <div class="n-heading">${t('active.photos')}</div>
      <div class="n-photos">${photos.map(p=>`<div class="n-photo-cell"><img src="${p}"></div>`).join('')}</div>
    </div>` : ''}

    <div class="n-footer">
      <div class="n-footer-motif"><span class="n-footer-line"></span><span class="n-footer-dot"></span><span class="n-footer-dot"></span><span class="n-footer-line"></span></div>
      <div class="n-footer-text">Sail la Vie Logbook · ${t('cert.generated')} ${new Date().toLocaleDateString(currentLocale())}</div>
    </div>
  </div>`;
}

/* ---------- Minimalist Yacht Club theme ---------- */
function buildTripPdfHtmlMinimalistYacht(trip){
  const boat = state.boats.find(b=>b.id===trip.boatId);
  const tripCrew = (trip.crewIds||[]).map(cid=>crewMemberById(cid)).filter(Boolean);
  const tripSkipper = trip.skipperId ? skipperById(trip.skipperId) : null;
  const crewList = [ ...(tripSkipper ? [{...tripSkipper, role:t('active.skipper')}] : []),
                      ...tripCrew.map(c=>({...c, role:t('nav.crew')})) ]; // full list — was capped at 2
  const d = new Date(trip.date);
  const dateLabel = d.toLocaleDateString(currentLocale(),{weekday:'long'}).toUpperCase();
  const dateValue = d.toLocaleDateString(currentLocale(),{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  const timeStr = d.toLocaleTimeString(currentLocale(),{hour:'numeric',minute:'2-digit'});
  const photos = (trip.photos||[]).filter(p=>p!==trip.coverPhoto); // every photo except the hero — never capped
  let notes = trip.notes || '';
  const paragraphs = notes ? notes.split(/\n+/).filter(Boolean) : [];
  const { line1, line2 } = yachtSplitTitle(trip.title||t('pdf.sailLogFallback'));

  const w = trip.weather || {};
  const condRows = [];
  if(w.windDir || w.windSpeed!=null) condRows.push({icon:'wind', label:t('pdf.condWind'), value:`${escapeHtml(compassLabel(w.windDir)||'')} ${w.windSpeed!=null?fmtSpeed(w.windSpeed):''}`.trim()});
  if(w.gusts) condRows.push({icon:'wind', label:t('pdf.condGusts'), value:fmtSpeed(w.gusts)});
  if(w.seaState) condRows.push({icon:'wave', label:t('pdf.condSea'), value:escapeHtml(seaStateLabel(w.seaState))});
  if(w.waveHeight) condRows.push({icon:'wave', label:t('pdf.condWaves'), value:`${escapeHtml(String(w.waveHeight))} m`});
  if(w.temp) condRows.push({icon:'thermo', label:t('pdf.condTemp'), value:`${escapeHtml(String(w.temp))}°C`});

  const stats = [
    {value:fmtDistance(trip.distanceNm||0).split(' ')[0], unit:distUnitLabel(), label:t('stat.distance'), icon:'pin'},
    {value:fmtDuration(trip.elapsedSeconds), unit:'', label:t('detail.elapsed'), icon:'clock'},
    {value:fmtSpeed(trip.avgSpeed||0).split(' ')[0], unit:speedUnitLabel(), label:t('stat.avgSpeed'), icon:'gauge'},
    {value:fmtSpeed(trip.maxSpeed||0).split(' ')[0], unit:speedUnitLabel(), label:t('stat.maxSpeed'), icon:'gauge'},
  ];

  // Same GPS-track → uploaded-map-image → empty-placeholder priority as the
  // app's own trip-detail map and the other themes.
  const mapInner = (trip.path && trip.path.length>1)
    ? buildPortholeSvg(trip.path, false, appUnitSystem(), 674, 180) // matches .y-map-box's rendered size (794 sheet - 40x2 sheet pad - 20x2 .y-card pad, x 180 tall)
    : trip.mapImage
      ? `<div class="y-map-img" style="background-image:url('${trip.mapImage}')"></div>`
      : `<div class="y-map-empty">${t('pdf.noTrack')}</div>`;

  return `<div class="pdf-sheet" id="pdfTripBlock">
    <div class="y-header">
      <div class="y-badge">
        <img class="y-badge-compass" src="images/Logo.png" alt="">
      </div>
      <div class="y-title-block">
        <div class="y-title-line1">${escapeHtml(line1)}</div>
        ${line2 ? `<div class="y-title-line2">${escapeHtml(line2)}</div>` : ''}
        <div class="y-title-rule"><span class="y-rule-line"></span><span class="y-rule-anchor">${pdfAnchorSvgSized(15,'#B4884F',1.3)}</span></div>
      </div>
      <div class="y-meta">
        <div class="y-meta-row">${PDF_ICON_SVG.calendar}<b>${dateLabel}</b></div>
        <div class="y-meta-time">${dateValue}</div>
        <div class="y-meta-row"><span class="y-meta-icon">${PDF_ICON_SVG.clock}</span><span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9.2px;">${timeStr}</span></div>
        <div class="y-meta-rule"></div>
        ${boat ? `<div class="y-boat">${boat.photo ? `<img class="y-boat-photo" src="${boat.photo}">` : ''}${escapeHtml(boat.name)}</div>` : ''}
        ${trip.place ? `<div class="y-route">${escapeHtml(trip.place.toUpperCase())}</div>` : ''}
      </div>
    </div>

    <div class="y-hero-row">
      <div class="y-hero">${trip.coverPhoto ? `<img src="${trip.coverPhoto}">` : ''}</div>
      <div class="y-story">
        <div class="y-story-rule"></div>
        ${paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}
      </div>
    </div>

    <div class="y-section-heading"><span class="y-sh-line"></span><span class="y-sh-text">${t('pdf.theNumbers').toUpperCase()}</span><span class="y-sh-line"></span></div>
    <div class="y-stats">
      ${stats.map(s=>`<div class="y-stat">
        <span class="y-stat-icon">${PDF_ICON_SVG[s.icon]}</span>
        <span class="y-stat-text"><b>${s.value}</b>${s.unit?`<span class="y-stat-unit">${s.unit}</span>`:''}<span class="y-stat-label">${s.label}</span></span>
      </div>`).join('')}
    </div>

    <div class="y-cards">
      ${condRows.length ? `<div class="y-card y-card-conditions">
        <div class="y-card-heading">${t('pdf.conditions')}</div>
        ${condRows.map(r=>`
          <div class="y-cond-row">
            <span class="y-cond-row-label"><span class="y-cond-icon">${PDF_ICON_SVG[r.icon]}</span>${escapeHtml(r.label)}</span>
            <span class="y-cond-row-value">${r.value}</span>
          </div>`).join('')}
      </div>` : ''}
      <div class="y-card y-card-route">
        <div class="y-card-heading">${t('pdf.theRoute')}</div>
        ${trip.place ? `<div class="y-route-text">${escapeHtml(trip.place)}</div>` : ''}
        <div class="y-map-box">${mapInner}</div>
      </div>
      ${crewList.length ? `<div class="y-card y-card-crew">
        <div class="y-card-heading">${t('nav.crew')}</div>
        <div class="y-crew-list">${crewList.map(m=>`
          <div class="y-crew-item">
            <img class="y-crew-photo-sm" src="${m.photo||placeholderAvatar()}">
            <div><span class="y-crew-role">${escapeHtml(m.role)}</span><span class="y-crew-name-sm">${escapeHtml(m.name)}</span></div>
          </div>`).join('')}</div>
      </div>` : ''}
    </div>

    ${photos.length ? `<div class="y-card y-card-photos">
      <div class="y-card-heading">${t('active.photos')}</div>
      <div class="y-photos">${photos.map(p=>`<div class="y-photo-cell"><img src="${p}"></div>`).join('')}</div>
    </div>` : ''}

    <div class="y-footer">Sail la Vie Logbook · ${t('cert.generated')} ${new Date().toLocaleDateString(currentLocale())}</div>
  </div>`;
}

/* ---------- Sailing Story theme ---------- */
function ssSailboatSvg(w, h, color){
  const mastX = w*0.42, waterY = h*0.88, boomY = h*0.80, mastTopY = h*0.10, jibBaseX = w*0.06;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
    <path d="M ${w*0.08} ${waterY} Q ${w*0.5} ${waterY+h*0.10} ${w*0.94} ${waterY}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="${mastX}" y1="${boomY}" x2="${mastX}" y2="${mastTopY}" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M ${mastX} ${mastTopY} L ${mastX+w*0.30} ${boomY} L ${mastX} ${boomY} Z" fill="none" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M ${mastX} ${boomY-h*0.42} L ${jibBaseX} ${boomY} L ${mastX} ${boomY} Z" fill="none" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M ${w*0.60} ${h*0.20} q 4 3 8 0 M ${w*0.74} ${h*0.14} q 4 3 8 0 M ${w*0.52} ${h*0.28} q 4 3 8 0" fill="none" stroke="${color}" stroke-width="0.9" stroke-linecap="round"/>
  </svg>`;
}
function ssSplitTitle(title){
  const words = (title||'').trim().split(/\s+/).filter(Boolean);
  if(words.length<=2) return {lead:'', main: words.join(' ').toUpperCase()};
  return {lead: words.slice(0,2).join(' '), main: words.slice(2).join(' ').toUpperCase()};
}
function buildTripPdfHtmlStory(trip){
  const boat = state.boats.find(b=>b.id===trip.boatId);
  const tripCrew = (trip.crewIds||[]).map(cid=>crewMemberById(cid)).filter(Boolean);
  const tripSkipper = trip.skipperId ? skipperById(trip.skipperId) : null;
  const crewList = [ ...(tripSkipper ? [{...tripSkipper, role:t('active.skipper')}] : []),
                      ...tripCrew.map(c=>({...c, role:t('nav.crew')})) ];
  const d = new Date(trip.date);
  const dateLabel = d.toLocaleDateString(currentLocale(),{weekday:'long'}).toUpperCase();
  const dateValue = d.toLocaleDateString(currentLocale(),{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  const timeStr = d.toLocaleTimeString(currentLocale(),{hour:'numeric',minute:'2-digit'});
  const allPhotos = trip.photos||[];
  const legPhotos = allPhotos.slice(0,4);
  const gridPhotos = allPhotos.slice(4); // every remaining photo — never repeats a leg-strip photo, never capped
  let notes = trip.notes || '';
  const paragraphs = notes ? notes.split(/\n+/).filter(Boolean) : [];
  const { lead, main } = ssSplitTitle(trip.title||t('pdf.sailLogFallback'));
  // The data model has no discrete route waypoints (only a continuous GPS
  // path + a single free-text place) — reuse `place` as a single "stop" so
  // the numbered route bar still renders meaningfully instead of inventing
  // waypoints that were never recorded.
  const routeItems = trip.place ? [trip.place] : [];

  const w = trip.weather || {};
  const condRows = [];
  if(w.windDir || w.windSpeed!=null) condRows.push({icon:'wind', label:t('pdf.condWind'), value:`${escapeHtml(compassLabel(w.windDir)||'')} ${w.windSpeed!=null?fmtSpeed(w.windSpeed):''}`.trim()});
  if(w.gusts) condRows.push({icon:'wind', label:t('pdf.condGusts'), value:fmtSpeed(w.gusts)});
  if(w.seaState) condRows.push({icon:'wave', label:t('pdf.condSea'), value:escapeHtml(seaStateLabel(w.seaState))});
  if(w.waveHeight) condRows.push({icon:'wave', label:t('pdf.condWaves'), value:`${escapeHtml(String(w.waveHeight))} m`});
  if(w.temp) condRows.push({icon:'thermo', label:t('pdf.condTemp'), value:`${escapeHtml(String(w.temp))}°C`});

  const stats = [
    {value:fmtDistance(trip.distanceNm||0).split(' ')[0], unit:distUnitLabel(), label:t('stat.distance'), icon:'pin'},
    {value:fmtDuration(trip.elapsedSeconds), unit:'', label:t('detail.elapsed'), icon:'clock'},
    {value:fmtSpeed(trip.avgSpeed||0).split(' ')[0], unit:speedUnitLabel(), label:t('stat.avgSpeed'), icon:'gauge'},
    {value:fmtSpeed(trip.maxSpeed||0).split(' ')[0], unit:speedUnitLabel(), label:t('stat.maxSpeed'), icon:'gauge'},
  ];

  // Same GPS-track → uploaded-map-image → empty-placeholder priority as the
  // app's own trip-detail map and the other themes.
  const mapInner = (trip.path && trip.path.length>1)
    ? buildPortholeSvg(trip.path, false, appUnitSystem(), 686, 220) // matches .ss-map-box's rendered size (794 sheet - 34x2 .ss-cards pad - 20x2 .ss-card pad, x 220 tall)
    : trip.mapImage
      ? `<div class="ss-map-img" style="background-image:url('${trip.mapImage}')"></div>`
      : `<div class="ss-map-empty">${t('pdf.noTrack')}</div>`;

  return `<div class="pdf-sheet" id="pdfTripBlock">
    <div class="ss-frame"></div><div class="ss-frame-inner"></div>

    <div class="ss-header">
      <div class="ss-compass"><img class="ss-logo-badge" src="images/Logo.png" alt=""></div>
      <div class="ss-title-block">
        ${lead ? `<div class="ss-title-lead">${escapeHtml(lead)}</div>` : ''}
        <div class="ss-title-main">${escapeHtml(main)}</div>
        <div class="ss-title-rule"><span class="ss-rule-line"></span><span class="ss-rule-heart">${PDF_ICON_SVG.heart}</span><span class="ss-rule-line"></span></div>
        ${trip.place ? `<div class="ss-subtitle">${escapeHtml(trip.place)}</div>` : ''}
      </div>
      <div class="ss-meta">
        <div class="ss-meta-row">${PDF_ICON_SVG.calendar}<b>${dateLabel}</b></div>
        <div class="ss-meta-sub">${dateValue}</div>
        <div class="ss-meta-row ss-meta-time"><span class="ss-meta-icon">${PDF_ICON_SVG.clock}</span><span>${timeStr}</span></div>
        ${boat ? `<div class="ss-meta-row ss-meta-boat">${boat.photo ? `<img class="ss-boat-photo" src="${boat.photo}">` : ''}<b>${escapeHtml(boat.name)}</b></div>` : ''}
        <div class="ss-meta-anchor">${PDF_ICON_SVG.anchor}</div>
      </div>
    </div>

    ${routeItems.length ? `<div class="ss-route-bar">${routeItems.map((r,i)=>`<span class="ss-route-num">${i+1}</span><span>${escapeHtml(r.toUpperCase())}</span>`).join('<span class="ss-route-arrow">→</span>')}</div>` : ''}

    ${legPhotos.length ? `<div class="ss-legs">${legPhotos.map(p=>`<div class="ss-leg-cell"><img src="${p}"></div>`).join('')}</div>` : ''}

    <div class="ss-sail-heading">
      <span class="ss-sail-line"></span><span class="ss-sail-star">${PDF_ICON_SVG.star}</span>
      <span class="ss-sail-text">${t('pdf.theSail').toUpperCase()}</span>
      <span class="ss-sail-star">${PDF_ICON_SVG.star}</span><span class="ss-sail-line"></span>
    </div>

    <div class="ss-stats">
      ${stats.map(s=>`<div class="ss-stat">
        <span class="ss-stat-icon">${PDF_ICON_SVG[s.icon]}</span>
        <span class="ss-stat-text"><b>${s.value}</b>${s.unit?`<span class="ss-stat-unit">${s.unit}</span>`:''}<span class="ss-stat-label">${s.label}</span></span>
      </div>`).join('')}
    </div>
    <div class="ss-stats-rule"></div>

    <div class="ss-cards">
      ${condRows.length ? `<div class="ss-card ss-card-conditions">
        <div class="ss-heading">${t('pdf.conditions')}</div>
        ${condRows.map(r=>`
          <div class="ss-cond-row">
            <span class="ss-cond-label"><span class="ss-cond-icon">${PDF_ICON_SVG[r.icon]}</span>${escapeHtml(r.label)}</span>
            <span class="ss-cond-value">${r.value}</span>
          </div>`).join('')}
      </div>` : ''}
      ${paragraphs.length ? `<div class="ss-card ss-card-day">
        <div class="ss-heading">${t('pdf.theDay')}</div>
        <div class="ss-day-text">${paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</div>
        <div class="ss-day-boat">${ssSailboatSvg(64,40,'#8FA4BE')}</div>
      </div>` : ''}
      ${crewList.length ? `<div class="ss-card ss-card-crew">
        <div class="ss-heading">${t('nav.crew')}</div>
        <div class="ss-crew-list">${crewList.map(m=>`
          <div class="ss-crew-item">
            <img class="ss-crew-photo" src="${m.photo||placeholderAvatar()}">
            <span class="ss-crew-role">${escapeHtml(m.role)}</span>
            <span class="ss-crew-name">${escapeHtml(m.name)}</span>
          </div>`).join('')}</div>
      </div>` : ''}
    </div>

    <div class="ss-card ss-card-route">
      <div class="ss-heading">${t('pdf.theRoute')}</div>
      <div class="ss-map-box">${mapInner}</div>
    </div>

    ${gridPhotos.length ? `<div class="ss-card ss-card-photos">
      <div class="ss-heading">${t('active.photos')}</div>
      <div class="ss-photos">${gridPhotos.map(p=>`<div class="ss-photo-cell"><img src="${p}"></div>`).join('')}</div>
    </div>` : ''}

    <div class="ss-footer">
      <div class="ss-footer-heart">${PDF_ICON_SVG.heart}</div>
      <div class="ss-footer-row">
        <span class="ss-footer-anchor">${PDF_ICON_SVG.anchor}</span>
        <span class="ss-footer-line"></span>
        <span class="ss-footer-text">Sail la Vie Logbook · ${t('cert.generated')} ${new Date().toLocaleDateString(currentLocale())}</span>
        <span class="ss-footer-line"></span>
        <span class="ss-footer-anchor">${PDF_ICON_SVG.anchor}</span>
      </div>
    </div>
  </div>`;
}

/* ---------- Memory Page theme ---------- */
function buildTripPdfHtmlMemoryPage(trip){
  const boat = state.boats.find(b=>b.id===trip.boatId);
  const tripCrew = (trip.crewIds||[]).map(cid=>crewMemberById(cid)).filter(Boolean);
  const tripSkipper = trip.skipperId ? skipperById(trip.skipperId) : null;
  const crewList = [ ...(tripSkipper ? [{...tripSkipper, role:t('active.skipper')}] : []),
                      ...tripCrew.map(c=>({...c, role:t('nav.crew')})) ]; // full list — was capped at 2
  const d = new Date(trip.date);
  const dateLabel = d.toLocaleDateString(currentLocale(),{weekday:'long'}).toUpperCase();
  const dateValue = d.toLocaleDateString(currentLocale(),{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  const timeStr = d.toLocaleTimeString(currentLocale(),{hour:'numeric',minute:'2-digit'});
  const photos = (trip.photos||[]).filter(p=>p!==trip.coverPhoto); // every photo except the hero — never capped
  let notes = trip.notes || '';
  const paragraphs = notes ? notes.split(/\n+/).filter(Boolean) : [];
  const { lead, main } = memorySplitTitle(trip.title||t('pdf.sailLogFallback'));
  const routeItems = trip.place ? [trip.place] : [];

  const w = trip.weather || {};
  const condRows = [];
  if(w.windDir || w.windSpeed!=null) condRows.push({icon:'wind', label:t('pdf.condWind'), value:`${escapeHtml(compassLabel(w.windDir)||'')} ${w.windSpeed!=null?fmtSpeed(w.windSpeed):''}`.trim()});
  if(w.gusts) condRows.push({icon:'wind', label:t('pdf.condGusts'), value:fmtSpeed(w.gusts)});
  if(w.seaState) condRows.push({icon:'wave', label:t('pdf.condSea'), value:escapeHtml(seaStateLabel(w.seaState))});
  if(w.waveHeight) condRows.push({icon:'wave', label:t('pdf.condWaves'), value:`${escapeHtml(String(w.waveHeight))} m`});
  if(w.temp) condRows.push({icon:'thermo', label:t('pdf.condTemp'), value:`${escapeHtml(String(w.temp))}°C`});

  const stats = [
    {value:fmtDistance(trip.distanceNm||0).split(' ')[0], unit:distUnitLabel(), label:t('stat.distance'), icon:'pin'},
    {value:fmtDuration(trip.elapsedSeconds), unit:'', label:t('detail.elapsed'), icon:'clock'},
    {value:fmtSpeed(trip.avgSpeed||0).split(' ')[0], unit:speedUnitLabel(), label:t('stat.avgSpeed'), icon:'gauge'},
    {value:fmtSpeed(trip.maxSpeed||0).split(' ')[0], unit:speedUnitLabel(), label:t('stat.maxSpeed'), icon:'gauge'},
  ];

  // Same GPS-track → uploaded-map-image → empty-placeholder priority as the
  // app's own trip-detail map and the other themes. The old version only
  // ever checked trip.path, so a trip with an uploaded map but no GPS track
  // silently fell through to "no track recorded".
  const mapInner = (trip.path && trip.path.length>1)
    ? buildPortholeSvg(trip.path, false, appUnitSystem(), 686, 200) // matches .m-map-box's rendered size (794 sheet - 34x2 .m-cards pad - 20x2 .m-card pad, x 200 tall)
    : trip.mapImage
      ? `<div class="m-map-img" style="background-image:url('${trip.mapImage}')"></div>`
      : `<div class="m-map-empty">${t('pdf.noTrack')}</div>`;

  return `<div class="pdf-sheet" id="pdfTripBlock">
    <div class="m-hero">
      ${trip.coverPhoto ? `<img src="${trip.coverPhoto}">` : `<div class="m-hero-noimg"></div>`}
      <div class="m-hero-scrim"></div>
      <div class="m-hero-wave">${pdfWaveStripSvg(794,12,'#B4884F')}</div>
      <div class="m-badge">
        <img class="m-badge-compass" src="images/Logo.png" alt="">
      </div>
      <div class="m-hero-content">
        <div class="m-hero-left">
          ${lead ? `<div class="m-title-lead">${escapeHtml(lead)}</div>` : ''}
          <div class="m-title-main">${escapeHtml(main)}</div>
          <div class="m-title-rule"><span class="m-rule-line"></span><span class="m-rule-heart">${PDF_ICON_SVG.heart}</span><span class="m-rule-line"></span></div>
          ${trip.place ? `<div class="m-subtitle">${escapeHtml(trip.place)}</div>` : ''}
        </div>
        <div class="m-hero-meta">
          <div class="m-meta-row">${PDF_ICON_SVG.calendar}<b>${dateLabel}</b></div>
          <div class="m-meta-sub">${dateValue}</div>
          <div class="m-meta-row m-meta-time"><span class="m-meta-icon">${PDF_ICON_SVG.clock}</span><span>${timeStr}</span></div>
          ${routeItems.length ? `<div class="m-meta-rule"></div><div class="m-meta-route">${routeItems.map(r=>escapeHtml(r.toUpperCase())).join('<br>')}</div>` : ''}
        </div>
      </div>
    </div>

    ${boat ? `<div class="m-boat-strip">${boat.photo ? `<img class="m-boat-photo" src="${boat.photo}">` : ''}<span class="m-boat-name">${escapeHtml(boat.name)}</span></div>` : ''}

    <div class="m-section-heading"><span class="m-sh-line"></span><span class="m-sh-text">${t('pdf.theNumbers').toUpperCase()}</span><span class="m-sh-line"></span></div>
    <div class="m-stats">
      ${stats.map(s=>`<div class="m-stat">
        <span class="m-stat-icon">${PDF_ICON_SVG[s.icon]}</span>
        <span class="m-stat-text"><b>${s.value}</b>${s.unit?`<span class="m-stat-unit">${s.unit}</span>`:''}<span class="m-stat-label">${s.label}</span></span>
      </div>`).join('')}
    </div>
    <div class="m-stats-rule"></div>

    <div class="m-cards">
      ${condRows.length ? `<div class="m-card m-card-conditions">
        <div class="m-heading">${t('pdf.conditions')}</div>
        ${condRows.map(r=>`
          <div class="m-cond-row">
            <span class="m-cond-label"><span class="m-cond-icon">${PDF_ICON_SVG[r.icon]}</span>${escapeHtml(r.label)}</span>
            <span class="m-cond-value">${r.value}</span>
          </div>`).join('')}
      </div>` : ''}
      ${paragraphs.length ? `<div class="m-card m-card-day">
        <div class="m-heading">${t('pdf.theDay')}</div>
        <div class="m-day-text">${paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</div>
      </div>` : ''}
      ${crewList.length ? `<div class="m-card m-card-crew">
        <div class="m-heading">${t('nav.crew')}</div>
        <div class="m-crew-list">${crewList.map(m=>`
          <div class="m-crew-item">
            <img class="m-crew-photo-sm" src="${m.photo||placeholderAvatar()}">
            <div><span class="m-crew-role">${escapeHtml(m.role)}</span><span class="m-crew-name-sm">${escapeHtml(m.name)}</span></div>
          </div>`).join('')}</div>
      </div>` : ''}
    </div>

    <div class="m-card m-card-route">
      <div class="m-heading">${t('pdf.theRoute')}</div>
      ${trip.place ? `<div class="m-route-text">${escapeHtml(trip.place)}</div>` : ''}
      <div class="m-map-box">${mapInner}</div>
    </div>

    ${photos.length ? `<div class="m-card m-card-photos">
      <div class="m-heading">${t('active.photos')}</div>
      <div class="m-photos">${photos.map(p=>`<div class="m-photo-cell"><img src="${p}"></div>`).join('')}</div>
    </div>` : ''}

    <div class="m-footer">
      <div class="m-tagline-rule"></div>
      <div class="m-tagline"><span>${t('pdf.gratefulJourney').toUpperCase()}</span><span class="m-tagline-heart">${PDF_ICON_SVG.heart}</span></div>
    </div>
  </div>`;
}

// Computes page-break Y offsets (in CSS px, relative to the top of `block`)
// for paginated themes. Greedy: keep adding whole top-level sections
// (n-hero, n-stats, n-cards, n-photos, n-footer, etc.) to the current page
// until the next one would overflow it, then start a new page at that
// section's top edge. This guarantees a page break only ever falls BETWEEN
// two sections — never through the middle of a crew list, a photo, or a
// stat block — which is what was producing decapitated content and
// near-empty trailing pages before.
function computeSectionPageBreaks(block, pageHeightPx){
  // Absolutely/fixed-positioned children (decorative overlays like the
  // Sailing Story theme's double border frame, ss-frame/ss-frame-inner) are
  // NOT real flow sections — they sit on top of the real content rather than
  // taking a slot in the page. Counting them as sections used to register
  // spurious page breaks right near the top of the document (since an
  // absolutely-positioned box's own top/bottom can land almost anywhere,
  // independent of where the actual content flow is), producing near-empty
  // leading pages before the real content ever appeared.
  const children = Array.from(block.children).filter(child=>{
    const pos = getComputedStyle(child).position;
    return pos!=='absolute' && pos!=='fixed';
  });
  const breaks = [];
  let pageStartY = 0;
  for(const child of children){
    const top = child.offsetTop;
    const bottom = top + child.offsetHeight;
    // A single section taller than a full page is a rare edge case (e.g. a
    // very long note) — better to let it overflow onto/through the next
    // page than to guillotine it at an arbitrary pixel row.
    if(bottom - pageStartY > pageHeightPx && top > pageStartY){
      breaks.push(top);
      pageStartY = top;
    }
  }
  return breaks;
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
  // rather than an <img> now (see PDF_THEMES notes), so it's invisible to
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
// Renders the preview sheet at true A4 proportions (794px ≈ 210mm at 96dpi),
// then scales it down to fit the sheet's width — an accurate shrink-to-fit
// preview of exactly what the final PDF page will look like, including
// whether the content is tall enough to risk spilling onto a 2nd page.
// Preview and export are both true single-page A4 portrait shrink-to-fit.
function openTripPdfPreview(){
  const trip = window._detailTrip;
  if(!trip){ showToast(t('toast.openTripFirst')); return; }
  const theme = PDF_THEMES[currentPdfTheme];
  const inner = document.getElementById('pdfPreviewInner');
  inner.className = theme.sheetClass;
  inner.innerHTML = theme.build(trip);
  inner.style.transform = 'none';
  inner.style.width = theme.contentWidthPx + 'px';
  renderPdfThemePicker();
  openSheet('sheetPdfPreview');
  waitForImagesToLoad(inner).then(()=>{
  requestAnimationFrame(()=>{
    const wrap = document.getElementById('pdfPreviewScaleWrap');
    const naturalHeight = inner.scrollHeight;
    const wrapWidth = wrap.clientWidth;
    const margin = 12;
    let scale;
    if(theme.paginate){
      // Content can span more than one physical page — fit to width and let
      // the preview grow to whatever height that produces, rather than
      // capping it to a single page's aspect ratio.
      scale = (wrapWidth - margin * 2) / theme.contentWidthPx;
      const pageHeightPx = theme.contentWidthPx * (theme.pageH / theme.pageW);
      const block = inner.querySelector('#pdfTripBlock');
      // Same section-aware break logic used at export time, so the page
      // count shown here always matches what actually gets generated.
      const pages = block ? computeSectionPageBreaks(block, pageHeightPx).length + 1
                           : Math.max(1, Math.ceil(naturalHeight / pageHeightPx));
      const fmt = document.getElementById('pdfThemeFormat');
      if(fmt) fmt.textContent = t(theme.formatLabel) + (pages>1 ? ` · ${pages} ${t('pdf.pages')}` : '');
    } else {
      const pageHeight = wrapWidth * (theme.pageH / theme.pageW);
      scale = Math.min(
        (wrapWidth - margin * 2) / theme.contentWidthPx,
        (pageHeight - margin * 2) / naturalHeight
      );
    }
    inner.style.transformOrigin = 'top left';
    inner.style.transform = `scale(${scale})`;
    wrap.style.height = Math.ceil(naturalHeight * scale + margin * 2) + 'px';
  });
  });
}

// IMPORTANT: Do not use jsPDF.doc.html() here (it paginates unpredictably).
// We render the COMPLETE log into one tall canvas first. Themes that are
// designed to always fit one page (theme.paginate is falsy) get shrunk to
// fit that single page, same as before. Themes that can legitimately run
// long (theme.paginate: true) get sliced into as many full-size pages as
// the content needs, instead of squeezing everything onto one page or
// silently clipping the overflow.
async function generateAndShareTripPdf(){
  const trip = window._detailTrip;
  if(!trip) return;
  if(typeof window.jspdf==='undefined' || typeof html2canvas==='undefined'){
    showToast(t('toast.pdfNeedsConnection'));
    return;
  }
  const theme = PDF_THEMES[currentPdfTheme];

  showToast(t('toast.preparingPdf'));
  const inner = document.getElementById('pdfPreviewInner');
  const prevTransform = inner.style.transform;
  const prevWidth = inner.style.width;
  const prevHeight = inner.style.height;
  const prevOverflow = inner.style.overflow;

  try{
    // Rebuild defensively so the exported file always matches the theme
    // currently selected, even if the preview sheet wasn't reopened.
    inner.className = theme.sheetClass;
    inner.innerHTML = theme.build(trip);
    inner.style.transform = 'none';
    inner.style.width = theme.contentWidthPx + 'px';
    inner.style.height = 'auto';
    inner.style.overflow = 'visible';

    // Wait for every photo to actually finish loading/decoding, then let
    // fonts/layout settle before measuring/capturing. Racing html2canvas
    // against still-loading images was the root cause of photos coming out
    // the wrong/inconsistent size in the shared PDF.
    await waitForImagesToLoad(inner);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await html2canvas(inner, {
      scale: 2,
      useCORS: true,
      backgroundColor: theme.pageBg || '#ffffff',
      logging: false,
      width: theme.contentWidthPx,
      height: inner.scrollHeight,
      windowWidth: theme.contentWidthPx,
      scrollX: 0,
      scrollY: 0
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: theme.pageH >= theme.pageW ? 'portrait' : 'landscape',
      unit: 'pt',
      format: [theme.pageW, theme.pageH],
      compress: true
    });

    if(theme.paginate){
      // Slice the single tall capture at section boundaries, not at fixed
      // pixel intervals — a page break only ever falls between two
      // top-level sections (hero, stats, cards, photos, footer), so nothing
      // ever gets cut through the middle, and there's no near-empty
      // trailing page from an arbitrary leftover slice.
      const pageHeightCanvasPx = canvas.width * (theme.pageH / theme.pageW);
      const scaleFactor = canvas.width / theme.contentWidthPx; // matches html2canvas's scale:2 above
      const block = inner.querySelector('#pdfTripBlock');
      const breaksCss = block ? computeSectionPageBreaks(block, pageHeightCanvasPx / scaleFactor) : [];
      const breakPointsCanvasPx = [0, ...breaksCss.map(y => y * scaleFactor), canvas.height];

      for(let i=0; i<breakPointsCanvasPx.length-1; i++){
        if(i>0) doc.addPage([theme.pageW, theme.pageH]);
        if(theme.pageBg){
          const bg = hexToRgbTuple(theme.pageBg);
          doc.setFillColor(bg[0], bg[1], bg[2]);
          doc.rect(0, 0, theme.pageW, theme.pageH, 'F');
        }
        const sliceStart = breakPointsCanvasPx[i];
        // Safety clamp: a single section taller than one page (rare — e.g. a
        // very long note) still gets capped to a page height per slice
        // rather than being skipped, so nothing silently vanishes.
        const sliceH = Math.min(pageHeightCanvasPx, breakPointsCanvasPx[i+1] - sliceStart);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        const sctx = sliceCanvas.getContext('2d');
        sctx.fillStyle = theme.pageBg || '#ffffff';
        sctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sctx.drawImage(canvas, 0, sliceStart, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const imgW = theme.pageW;
        const imgH = imgW * (sliceH / canvas.width);
        doc.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH, undefined, 'FAST');
      }
    } else {
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 18;
      const availableW = pageW - margin * 2;
      const availableH = pageH - margin * 2;

      // Fit the COMPLETE canvas into the printable page rectangle, preserving ratio.
      const scale = Math.min(availableW / canvas.width, availableH / canvas.height);
      const renderW = canvas.width * scale;
      const renderH = canvas.height * scale;
      const x = (pageW - renderW) / 2;
      const y = margin;

      doc.addImage(
        canvas.toDataURL('image/jpeg', 0.92),
        'JPEG', x, y, renderW, renderH, undefined, 'FAST'
      );

      // This theme is designed to always fit one page. Keep this defensive guard.
      while(doc.getNumberOfPages() > 1){
        doc.deletePage(doc.getNumberOfPages());
      }
    }

    const blob = doc.output('blob');
    const fileName = (trip.title||'sail-log').replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.pdf';
    const file = new File([blob], fileName, {type:'application/pdf'});

    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title: trip.title||'Sail Log'});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(t('toast.pdfDownloaded'));
    }
    closeSheets();
  }catch(e){
    if(e && e.name==='AbortError'){ /* user cancelled the native share sheet */ }
    else { console.error('PDF generation failed', e); showToast(t('toast.pdfGenFail')); }
  } finally {
    inner.style.transform = prevTransform;
    inner.style.width = prevWidth;
    inner.style.height = prevHeight;
    inner.style.overflow = prevOverflow;
  }
}

/* ---------- photo lightbox — supports swipe/arrow navigation across a photo set ---------- */
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
  renderLightboxImage();
  document.getElementById('photoLightbox').classList.add('show');
}
function renderLightboxImage(){
  document.getElementById('lightboxImg').src = lightboxPhotos[lightboxIndex] || '';
  const multi = lightboxPhotos.length > 1;
  document.querySelectorAll('.lightbox-nav').forEach(el=> el.style.display = multi ? 'flex' : 'none');
  const counter = document.getElementById('lightboxCounter');
  counter.textContent = multi ? (lightboxIndex+1)+' / '+lightboxPhotos.length : '';
  const deleteBtn = document.getElementById('lightboxDeleteBtn');
  if(deleteBtn) deleteBtn.style.display = lightboxTripId ? 'flex' : 'none';
}
function lightboxPrev(){
  if(lightboxPhotos.length<2) return;
  lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length;
  renderLightboxImage();
}
function lightboxNext(){
  if(lightboxPhotos.length<2) return;
  lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length;
  renderLightboxImage();
}
function closeLightbox(){
  document.getElementById('photoLightbox').classList.remove('show');
  lightboxPhotos = []; lightboxIndex = 0; lightboxTripId = null;
}
// Deletes the photo currently shown in the lightbox from its trip record —
// confirms first (matching deleteTripPrompt/deleteBoatForm/deleteCrewForm
// elsewhere in the app), then updates storage, the in-memory tripIndex, and
// whichever screen (trip detail or Gallery) is currently showing it.
async function deleteLightboxPhoto(){
  if(!lightboxTripId || !lightboxPhotos.length) return;
  if(!confirm(t('confirm.deletePhoto'))) return;
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
    const file = new File([blob], 'sail-la-vie-photo.jpg', {type: blob.type||'image/jpeg'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:'Sail la Vie Photo'});
      return;
    }
  }catch(e){
    if(e && e.name==='AbortError') return; // user cancelled the native share sheet
    console.error('share failed', e);
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sail-la-vie-photo.jpg';
  document.body.appendChild(a); a.click(); a.remove();
  showToast(t('toast.photoDownloaded'));
}
(function setupLightboxSwipe(){
  const img = document.getElementById('lightboxImg');
  let startX=0, startY=0, tracking=false;
  img.addEventListener('pointerdown', e=>{ tracking=true; startX=e.clientX; startY=e.clientY; });
  img.addEventListener('pointerup', e=>{
    if(!tracking) return;
    tracking = false;
    const dx = e.clientX-startX, dy = e.clientY-startY;
    if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.5){
      if(dx<0) lightboxNext(); else lightboxPrev();
    }
  });
  document.addEventListener('keydown', e=>{
    if(!document.getElementById('photoLightbox').classList.contains('show')) return;
    if(e.key==='ArrowLeft') lightboxPrev();
    else if(e.key==='ArrowRight') lightboxNext();
    else if(e.key==='Escape') closeLightbox();
  });
})();

/* ---------- utils ---------- */
function escapeHtml(s){
  return (s||'').toString().replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ---------- units: nautical (kts/NM) <-> metric (km/h/km) ----------
   Canonical storage is always kts/NM. These helpers only affect display
   and the parsing of what the person typed into a distance field. */

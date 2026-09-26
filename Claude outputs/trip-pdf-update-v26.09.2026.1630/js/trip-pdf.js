// ===== trip-pdf.js =====
// PDF export of a single historical sail — three templates (Nautical Magazine,
// Minimalist Yacht Club, Memory Page), rebuilt to the same standard as the
// Certificate of Sea Time (js/certificate.js):
//
//   • Real A4 pages. Every page is its own fixed 794 x 1123 px box (A4 portrait
//     at 96dpi) with margins, a frame, a footer (logo · log number · page X of Y)
//     and, from page 2 on, a running header. Nothing is ever sliced mid-section:
//     the layout engine below moves whole sections to the next page instead.
//   • Every section sits in its own container (card).
//   • All photos are included, none repeated, all cropped to the same 3:2
//     shape (CSS background-size:cover — html2canvas doesn't support object-fit,
//     which is what used to give inconsistent photo proportions).
//   • The route map is a purpose-built chart SVG with literal colours (the old
//     porthole SVG used CSS variables, which html2canvas can't resolve inside
//     an SVG image — one cause of the black boxes), with a lat/long grid,
//     start/finish markers, north arrow and scale bar. A trip without a GPS
//     track falls back to its uploaded map image (trip.mapImage).
//   • The app's Nautical palette and fonts, with the logo on every page.
//
// Flow: openTripPdfPreview() lays the pages out in the preview sheet (scaled
// down); generateAndShareTripPdf() lays them out again off-screen at full size,
// rasterizes each page with html2canvas and adds it to a jsPDF A4 document.

const TP_W = 794, TP_H = 1123; // A4 portrait in CSS px
const TP = { // Nautical palette (same values as the certificate)
  navy:'#16324F', navyDeep:'#0E2338', gold:'#C9A24B', goldDeep:'#A8843A', goldLight:'#E3C888',
  teal:'#17758F', coral:'#DE4457', ivory:'#FBF8F1', ink:'#142B44', muted:'#5C7A8F',
  water:'#DCEBF0', waterDeep:'#C6DFE8', line:'#E3DACB'
};

/* ============================================================
   DATA — everything any template shows, computed once per trip
   ============================================================ */

// Splits notes into paragraph-sized pieces. Very long paragraphs are cut at
// sentence boundaries (~650 chars) so they can flow across pages.
function tpNoteChunks(notes){
  const out = [];
  (notes||'').split(/\n+/).map(s=>s.trim()).filter(Boolean).forEach(p=>{
    if(p.length <= 700){ out.push(p); return; }
    const sentences = p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [p];
    let cur = '';
    sentences.forEach(s=>{ if((cur+s).length > 650 && cur){ out.push(cur.trim()); cur=''; } cur += s; });
    if(cur.trim()) out.push(cur.trim());
  });
  return out;
}

function tpLocale(){ return currentLang==='he' ? 'he-IL' : currentLang==='en' ? 'en-GB' : currentLocale(); }

// Log reference number printed in every footer, e.g. "SLV-L-2026-7K3Q".
// Derived from the trip id, so the same sail always carries the same number.
function tpLogNumber(trip){
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let h = 0x811c9dc5; const s = String(trip.id||trip.date||'');
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h >>>= 0; let code=''; for(let i=0;i<6;i++){ code += A[h%32]; h = Math.floor(h/32); }
  return `SLV-${new Date(trip.date).getFullYear()}-${code.slice(0,3)}-${code.slice(3)}`;
}

function tripPdfData(trip){
  const boat = state.boats.find(b=>b.id===trip.boatId) || null;
  const skipper = trip.skipperId ? skipperById(trip.skipperId) : null;
  const crew = [ ...(skipper ? [{...skipper, role:t('active.skipper')}] : []),
                 ...(trip.crewIds||[]).map(id=>crewMemberById(id)).filter(Boolean).map(c=>({...c, role:t('nav.crew')})) ];
  const d = new Date(trip.date);
  // Every photo except the cover (which is the hero), de-duplicated, never capped.
  const seen = new Set(trip.coverPhoto ? [trip.coverPhoto] : []);
  const photos = (trip.photos||[]).filter(p=>{ if(!p || seen.has(p)) return false; seen.add(p); return true; });
  const w = trip.weather || {};
  const cond = [];
  if(w.windDir || w.windSpeed!=null) cond.push({icon:'wind', label:t('pdf.condWind'), value:`${escapeHtml(compassLabel(w.windDir)||'')} ${w.windSpeed!=null&&w.windSpeed!==''?fmtSpeed(Number(w.windSpeed)):''}`.trim()});
  if(w.gusts) cond.push({icon:'wind', label:t('pdf.condGusts'), value:fmtSpeed(Number(w.gusts))});
  if(w.seaState) cond.push({icon:'wave', label:t('pdf.condSea'), value:escapeHtml(seaStateLabel(w.seaState))});
  if(w.waveHeight) cond.push({icon:'wave', label:t('pdf.condWaves'), value:`${escapeHtml(String(w.waveHeight))} m`});
  if(w.temp) cond.push({icon:'thermo', label:t('pdf.condTemp'), value:`${escapeHtml(String(w.temp))}°C`});
  const num = (s)=> s.split(' ')[0];
  const stats = [
    {value:num(fmtDistance(trip.distanceNm||0)), unit:distUnitLabel(), label:t('stat.distance'), icon:'pin'},
    {value:fmtDuration(trip.elapsedSeconds), unit:'', label:t('detail.elapsed'), icon:'clock'},
    {value:num(fmtSpeed(trip.avgSpeed||0)), unit:speedUnitLabel(), label:t('stat.avgSpeed'), icon:'gauge'},
    {value:num(fmtSpeed(trip.maxSpeed||0)), unit:speedUnitLabel(), label:t('stat.maxSpeed'), icon:'gauge'},
  ];
  const hasTrack = !!(trip.path && trip.path.length>1);
  return {
    trip, boat, crew, photos, cond, stats, hasTrack,
    title: trip.title || t('pdf.sailLogFallback'),
    place: trip.place || '',
    notes: tpNoteChunks(trip.notes),
    notesLen: (trip.notes||'').length,
    weekday: d.toLocaleDateString(tpLocale(), {weekday:'long'}),
    dateLong: d.toLocaleDateString(tpLocale(), {day:'numeric', month:'long', year:'numeric'}),
    time: d.toLocaleTimeString(tpLocale(), {hour:'2-digit', minute:'2-digit'}),
    logNo: tpLogNumber(trip),
    generated: new Date().toLocaleDateString(tpLocale(), {day:'numeric', month:'long', year:'numeric'}),
    rtl: currentLang==='he'
  };
}

/* ============================================================
   SHARED PIECES
   ============================================================ */

// Photo as a background-image div: cropped to its box with no distortion.
function tpImg(src, cls, extraStyle){
  return `<div class="${cls}" style="background-image:url('${src}');${extraStyle||''}"></div>`;
}

// Chart-style route map with explicit colours (no CSS variables — see header).
function tpMapSvg(path, w, h, pal){
  pal = Object.assign({water:TP.water, grid:'#9FC3D1', label:'#5C7A8F', track:TP.navy, halo:'#FFFFFF', start:'#2E8B57', end:TP.coral, frame:TP.navy}, pal||{});
  const lats = path.map(p=>p.lat), lngs = path.map(p=>p.lng);
  const minLat=Math.min(...lats), maxLat=Math.max(...lats), minLng=Math.min(...lngs), maxLng=Math.max(...lngs);
  const midLat=(minLat+maxLat)/2, midLng=(minLng+maxLng)/2;
  const lngScale = Math.max(Math.cos(midLat*Math.PI/180), 0.01);
  const latSpan = (maxLat-minLat) || 0.002, lngSpan = ((maxLng-minLng)*lngScale) || 0.002;
  const scale = Math.min(w/(lngSpan*1.35), h/(latSpan*1.45)); // px per latitude-degree
  const X = lng => w/2 + (lng-midLng)*lngScale*scale;
  const Y = lat => h/2 - (lat-midLat)*scale;
  // Graticule: pick a step (in arc-minutes) giving ~3-6 lines across the map.
  const visLat = h/scale, steps = [0.5,1,2,5,10,15,30,60,120,300];
  const stepMin = steps.find(s=> visLat*60/s <= 5) || 300, step = stepMin/60;
  const fmtDM = (v, pos, neg)=>{ const a=Math.abs(v), dd=Math.floor(a+1e-9), mm=Math.round((a-dd)*60*10)/10; return `${dd}°${String(mm%1?mm.toFixed(1):mm).padStart(2,'0')}′${v>=0?pos:neg}`; };
  let grid = '';
  const lat0 = midLat - (h/2)/scale, lat1 = midLat + (h/2)/scale;
  for(let la=Math.ceil(lat0/step)*step; la<=lat1; la+=step){
    const y=Y(la).toFixed(1);
    grid += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${pal.grid}" stroke-width=".7" stroke-dasharray="3 4"/>
      <text x="6" y="${(+y-4).toFixed(1)}" font-family="Arial,sans-serif" font-size="9" fill="${pal.label}">${fmtDM(la,'N','S')}</text>`;
  }
  const lngStep = step, lng0 = midLng - (w/2)/(scale*lngScale), lng1 = midLng + (w/2)/(scale*lngScale);
  for(let lo=Math.ceil(lng0/lngStep)*lngStep; lo<=lng1; lo+=lngStep){
    const x=X(lo).toFixed(1);
    grid += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${pal.grid}" stroke-width=".7" stroke-dasharray="3 4"/>
      ${+x < w-64 ? `<text x="${(+x+4).toFixed(1)}" y="12" font-family="Arial,sans-serif" font-size="9" fill="${pal.label}">${fmtDM(lo,'E','W')}</text>` : ''}`;
  }
  const pts = path.map(p=>[X(p.lng),Y(p.lat)]);
  const d = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join('');
  const s = pts[0], e = pts[pts.length-1];
  const roundTrip = Math.hypot(s[0]-e[0], s[1]-e[1]) < 14;
  const marker = (p, col, label, dy)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="6.5" fill="${col}" stroke="#fff" stroke-width="2.2"/>
    <text x="${(p[0]+11).toFixed(1)}" y="${(p[1]+dy).toFixed(1)}" font-family="Arial,sans-serif" font-size="9" font-weight="700" letter-spacing="1" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke">${label}</text>`;
  // Scale bar (nautical or metric, following the user's unit setting)
  const nmPerPx = 60/scale, metric = appUnitSystem()==='metric';
  const target = (w*0.22)*nmPerPx*(metric?NM_TO_KM:1);
  const nice = [0.1,0.2,0.25,0.5,1,2,2.5,5,10,20,25,50,100].reduce((b,v)=> v<=target ? v : b, 0.1);
  const barPx = (metric ? nice/NM_TO_KM : nice)/nmPerPx, bx = 16, by = h-20;
  const seg = barPx/4; let bar = '';
  for(let i=0;i<4;i++) bar += `<rect x="${(bx+i*seg).toFixed(1)}" y="${by}" width="${seg.toFixed(1)}" height="5" fill="${i%2?'#fff':pal.frame}" stroke="${pal.frame}" stroke-width=".8"/>`;
  const barLabel = `${nice} ${metric?'km':'NM'}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" direction="ltr" style="display:block;direction:ltr">
    <rect width="${w}" height="${h}" fill="${pal.water}"/>
    ${grid}
    <path d="${d}" fill="none" stroke="${pal.halo}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".9"/>
    <path d="${d}" fill="none" stroke="${pal.track}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${roundTrip ? marker(s, pal.start, t('pdf.startFinish').toUpperCase(), 3)
                : marker(s, pal.start, t('pdf.start').toUpperCase(), 3) + marker(e, pal.end, t('pdf.finish').toUpperCase(), 3)}
    <g transform="translate(${w-26},30)">
      <circle r="15" fill="#fff" fill-opacity=".85" stroke="${pal.frame}" stroke-width=".8"/>
      <path d="M0,-11 L4.5,3 L0,0.5 L-4.5,3 Z" fill="${pal.frame}"/><path d="M0,11 L4.5,3 L0,0.5 L-4.5,3 Z" fill="${pal.frame}" fill-opacity=".3"/>
      <text y="-19" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="${pal.frame}">N</text>
    </g>
    <rect x="${bx-6}" y="${by-16}" width="${(barPx+12).toFixed(1)}" height="30" rx="3" fill="#fff" fill-opacity=".75"/>
    ${bar}
    <text x="${bx}" y="${by-5}" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="${pal.frame}">${barLabel}</text>
    <rect x=".5" y=".5" width="${w-1}" height="${h-1}" fill="none" stroke="${pal.frame}" stroke-width="1"/>
  </svg>`;
}

// The route box: GPS chart → uploaded map image → nothing (section skipped).
function tpRouteInner(D, w, h, pal){
  if(D.hasTrack) return tpMapSvg(D.trip.path, w, h, pal);
  if(D.trip.mapImage) return tpImg(D.trip.mapImage, 'tp-mapimg', `width:${w}px;height:${h}px;`);
  return '';
}

// The route card as a flow block. It comes in a few map heights (tallest
// first): if the full-size card doesn't fit in the space left on a page, a
// shorter map (down to 160px) is tried before it moves to the next page.
function tpRouteBlock(D, cls, headingFn, w, h, pal){
  const heights = [h, h-25, h-50, h-75, h-100].filter(x=>x>=160);
  const cards = heights.map(hh=>{ const inner = tpRouteInner(D, w, hh, pal); return inner ? `<div class="${cls}">${headingFn(t('pdf.theRoute'))}<div class="tp-map">${inner}</div></div>` : ''; });
  if(!cards[0]) return null;
  return { float:true, html:cards[0], variants:cards.slice(1) };
}

// Rows of 3 photos (each row is one flow item, so the photo grid can break
// across pages between rows — never through a photo).
function tpPhotoRows(photos, cellCls, cols){
  cols = cols || 3;
  const rows = [];
  for(let i=0;i<photos.length;i+=cols){
    rows.push(`<div class="tp-photo-row">${photos.slice(i,i+cols).map(p=>`<div class="${cellCls}">${tpImg(p,'tp-photo')}</div>`).join('')}</div>`);
  }
  return rows;
}

function tpCrewItems(D, cls){
  return D.crew.map(m=>`<div class="${cls}">${tpImg(m.photo||placeholderAvatar(), 'tp-avatar')}
    <div><div class="tp-crew-role">${escapeHtml(m.role)}</div><div class="tp-crew-name">${escapeHtml(m.name)}</div></div></div>`).join('');
}

function tpCondRows(D){
  return D.cond.map(r=>`<div class="tp-cond-row"><span class="tp-cond-l"><i>${PDF_ICON_SVG[r.icon]}</i>${escapeHtml(r.label)}</span><span class="tp-cond-v">${r.value}</span></div>`).join('');
}

// Footer + running header shared by all templates (styled per template in CSS).
function tpFooter(D){
  return `<div class="tp-footer">
    <div class="tp-foot-brand"><img src="images/Logo.png" alt=""><span>SAIL LA VIE</span> ${t('cert.brandSub')}</div>
    <div class="tp-foot-log">${t('pdf.logNo')} <b dir="ltr">${D.logNo}</b></div>
    <div class="tp-foot-page">${t('pdf.pageOf', {n:'<b class="tp-pg-n"></b>', total:'<b class="tp-pg-total"></b>'})}</div>
  </div>`;
}
function tpRunningHeader(D){
  return `<div class="tp-runhead">
    <img src="images/Logo.png" alt="">
    <div class="tp-runhead-title">${escapeHtml(D.title)}</div>
    <div class="tp-runhead-date">${D.dateLong}</div>
  </div>`;
}

/* ============================================================
   TEMPLATES
   Each returns an ordered list of flow blocks. A block is either
     { html }                                   — placed whole, or
     { items:[html], wrap:(inner, cont)=>html }  — a card whose items may be
                                                  split across pages (cont=true
                                                  for the continuation part).
   ============================================================ */

// Notes as a (splittable) card. `cls` = card class for the template.
function tpNotesBlock(D, cls, headingFn){
  return { items: D.notes.map(p=>`<p>${escapeHtml(p)}</p>`),
           wrap:(inner, cont)=>`<div class="${cls} tp-notes-card">${headingFn(t('pdf.theDay') + (cont?` · ${t('pdf.continued')}`:''))}<div class="tp-notes">${inner}</div></div>` };
}
function tpPhotosBlock(D, cls, headingFn, cellCls){
  return { items: tpPhotoRows(D.photos, cellCls||'tp-photo-cell'),
           wrap:(inner, cont)=>`<div class="${cls}">${headingFn(t('active.photos') + (cont?` · ${t('pdf.continued')}`:''))}<div class="tp-photos">${inner}</div></div>` };
}

/* ---------- 1. Nautical Magazine ---------- */
function tpBlocksNautical(D){
  const H = s=>`<div class="n-heading">${s}</div>`;
  const B = [];
  // Hero: cover photo with a navy scrim, logo badge, title, place and date.
  B.push({ html:`<div class="n-hero">
    ${D.trip.coverPhoto ? tpImg(D.trip.coverPhoto,'n-hero-img') : `<div class="n-hero-img n-hero-noimg">${certContourSvg(714,340)}</div>`}
    <svg class="n-hero-scrim" width="714" height="340"><defs><linearGradient id="nScrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TP.navyDeep}" stop-opacity=".35"/><stop offset=".38" stop-color="${TP.navyDeep}" stop-opacity="0"/><stop offset=".55" stop-color="${TP.navyDeep}" stop-opacity=".15"/><stop offset="1" stop-color="${TP.navyDeep}" stop-opacity=".88"/></linearGradient></defs><rect width="714" height="340" fill="url(#nScrim)"/></svg>
    <img class="n-hero-logo" src="images/Logo.png" alt="">
    <div class="n-hero-kicker">SAIL LA VIE · ${t('pdf.logEntry')}</div>
    <div class="n-hero-bottom">
      <div class="n-hero-titles">
        <h1>${escapeHtml(D.title)}</h1>
        ${D.place ? `<div class="n-hero-place">${escapeHtml(D.place)}</div>` : ''}
      </div>
      <div class="n-hero-date"><span>${escapeHtml(D.weekday)}</span><b>${D.dateLong}</b><em>${D.time}</em></div>
    </div>
  </div>` });
  // Vessel + numbers band
  B.push({ html:`<div class="n-band">
    ${D.boat ? `<div class="n-band-boat">${tpImg(D.boat.photo||placeholderAvatar(),'tp-avatar')}<div><span>${t('pdf.vessel')}</span><b>${escapeHtml(D.boat.name)}</b></div></div>` : ''}
    ${D.stats.map(s=>`<div class="n-band-stat"><b>${s.value}${s.unit?`<small>${s.unit}</small>`:''}</b><span>${s.label}</span></div>`).join('')}
  </div>` });
  // Conditions + The Day side by side when the notes are short; otherwise the
  // notes get their own full-width card that can continue onto the next page.
  const condCard = D.cond.length ? `<div class="n-card n-cond">${H(t('pdf.conditions'))}${tpCondRows(D)}</div>` : '';
  const shortNotes = D.notes.length && D.notesLen <= 650;
  if(condCard || shortNotes){
    B.push({ html:`<div class="tp-row">${condCard}${shortNotes ? `<div class="n-card n-day">${H(t('pdf.theDay'))}<div class="tp-notes">${D.notes.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</div></div>` : ''}</div>` });
  }
  if(D.notes.length && !shortNotes) B.push(tpNotesBlock(D, 'n-card', H));
  const route = tpRouteBlock(D, 'n-card', H, 678, 270);
  if(route) B.push(route);
  if(D.crew.length) B.push({ float:true, html:`<div class="n-card">${H(t('nav.crew'))}<div class="tp-crew-grid">${tpCrewItems(D,'tp-crew-item')}</div></div>` });
  if(D.photos.length) B.push(tpPhotosBlock(D, 'n-card', H));
  return B;
}

/* ---------- 2. Minimalist Yacht Club ---------- */
function tpBlocksYacht(D){
  const H = s=>`<div class="y-heading"><span>${s}</span></div>`;
  const B = [];
  const { line1, line2 } = yachtSplitTitle(D.title);
  B.push({ html:`<div class="y-header">
    <img class="y-logo" src="images/Logo.png" alt="">
    <div class="y-titles">
      <div class="y-kicker">SAIL LA VIE · ${t('pdf.logEntry')}</div>
      <h1>${escapeHtml(line1)}${line2?`<br>${escapeHtml(line2)}`:''}</h1>
      <div class="y-rule"><span></span>${pdfAnchorSvgSized(14, TP.gold, 1.3)}</div>
    </div>
    <div class="y-meta">
      <span>${escapeHtml(D.weekday)}</span><b>${D.dateLong}</b><em>${D.time}</em>
      ${D.boat ? `<div class="y-meta-boat">${tpImg(D.boat.photo||placeholderAvatar(),'tp-avatar')}${escapeHtml(D.boat.name)}</div>` : ''}
      ${D.place ? `<div class="y-meta-place">${escapeHtml(D.place)}</div>` : ''}
    </div>
  </div>` });
  // Cover photo + the story beside it (short notes). Long notes get a full card.
  const shortNotes = D.notes.length && D.notesLen <= 700;
  if(D.trip.coverPhoto || shortNotes){
    B.push({ html:`<div class="y-hero${D.trip.coverPhoto && shortNotes ? '' : ' y-hero-single'}">
      ${D.trip.coverPhoto ? tpImg(D.trip.coverPhoto,'y-hero-img') : ''}
      ${shortNotes ? `<div class="y-story">${D.notes.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</div>` : ''}
    </div>` });
  }
  B.push({ html:`<div class="y-numbers">${H(t('pdf.theNumbers'))}<div class="y-stats">${D.stats.map(s=>
    `<div class="y-stat"><b>${s.value}${s.unit?`<small>${s.unit}</small>`:''}</b><span>${s.label}</span></div>`).join('')}</div></div>` });
  if(D.notes.length && !shortNotes) B.push(tpNotesBlock(D, 'y-card', H));
  const cond = D.cond.length ? `<div class="y-card">${H(t('pdf.conditions'))}${tpCondRows(D)}</div>` : '';
  const crew = D.crew.length ? `<div class="y-card">${H(t('nav.crew'))}<div class="tp-crew-list">${tpCrewItems(D,'tp-crew-item')}</div></div>` : '';
  if(cond || crew) B.push({ float:true, html:`<div class="tp-row">${cond}${crew}</div>` });
  const route = tpRouteBlock(D, 'y-card', H, 714, 260);
  if(route) B.push(route);
  if(D.photos.length) B.push(tpPhotosBlock(D, 'y-card', H));
  return B;
}

/* ---------- 3. Memory Page ---------- */
function tpBlocksMemory(D){
  const H = s=>`<div class="m-heading">${s}</div>`;
  const B = [];
  const { lead, main } = memorySplitTitle(D.title);
  B.push({ html:`<div class="m-hero">
    ${D.trip.coverPhoto ? tpImg(D.trip.coverPhoto,'m-hero-img') : `<div class="m-hero-img m-hero-noimg">${certContourSvg(714,380)}</div>`}
    <svg class="m-hero-scrim" width="714" height="380"><defs><linearGradient id="mScrim" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="${TP.navyDeep}" stop-opacity="0"/><stop offset="1" stop-color="${TP.navyDeep}" stop-opacity=".8"/></linearGradient></defs><rect width="714" height="380" fill="url(#mScrim)"/></svg>
    <img class="m-hero-logo" src="images/Logo.png" alt="">
    <div class="m-hero-date"><span>${escapeHtml(D.weekday)}</span><b>${D.dateLong}</b><em>${D.time}</em></div>
    <div class="m-hero-titles">
      ${lead ? `<div class="m-lead">${escapeHtml(lead)}</div>` : ''}
      <h1>${escapeHtml(main)}</h1>
      <div class="m-heart-rule"><span></span><i>${PDF_ICON_SVG.heart}</i><span></span></div>
      ${D.place ? `<div class="m-place">${escapeHtml(D.place)}</div>` : ''}
    </div>
    <div class="m-hero-wave">${pdfWaveStripSvg(714,12,TP.goldLight)}</div>
  </div>` });
  const tiles = ['#E9F5FD','#E7F7F2','#FEF5E1','#FDEDF0'];
  B.push({ html:`<div class="m-numbers">
    ${D.boat ? `<div class="m-boat">${tpImg(D.boat.photo||placeholderAvatar(),'tp-avatar')}<div><span>${t('pdf.vessel')}</span><b>${escapeHtml(D.boat.name)}</b></div></div>` : ''}
    <div class="m-stats">${D.stats.map((s,i)=>`<div class="m-stat" style="background:${tiles[i]}"><b>${s.value}${s.unit?`<small>${s.unit}</small>`:''}</b><span>${s.label}</span></div>`).join('')}</div>
  </div>` });
  const shortNotes = D.notes.length && D.notesLen <= 650;
  const cond = D.cond.length ? `<div class="m-card">${H(t('pdf.conditions'))}${tpCondRows(D)}</div>` : '';
  const day = shortNotes ? `<div class="m-card m-day">${H(t('pdf.theDay'))}<div class="tp-notes">${D.notes.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</div></div>` : '';
  if(cond || day) B.push({ html:`<div class="tp-row">${cond}${day}</div>` });
  if(D.notes.length && !shortNotes) B.push(tpNotesBlock(D, 'm-card', H));
  const route = tpRouteBlock(D, 'm-card', H, 678, 250, {water:'#E2F0F2', grid:'#A9CFD6'});
  if(route) B.push(route);
  if(D.crew.length) B.push({ float:true, html:`<div class="m-card">${H(t('nav.crew'))}<div class="tp-crew-grid">${tpCrewItems(D,'tp-crew-item')}</div></div>` });
  if(D.photos.length) B.push(tpPhotosBlock(D, 'm-card', H, 'tp-photo-cell m-polaroid'));
  B.push({ html:`<div class="m-tagline"><span></span>${t('pdf.gratefulJourney')} <i>${PDF_ICON_SVG.heart}</i><span></span></div>` });
  return B;
}

const PDF_THEMES = {
  nautical: { label:'pdf.themeNautical',        swatch:'#16324F', cls:'tp-nautical', pageBg:TP.ivory, blocks:tpBlocksNautical, contours:true },
  yacht:    { label:'pdf.themeMinimalistYacht', swatch:'#C9A24B', cls:'tp-yacht',    pageBg:'#FDFCF9', blocks:tpBlocksYacht,    contours:false },
  memory:   { label:'pdf.themeMemoryPage',      swatch:'#DE4457', cls:'tp-memory',   pageBg:'#FCF7EF', blocks:tpBlocksMemory,   contours:true }
};
let currentPdfTheme = (()=>{ try{ return localStorage.getItem('pdfTheme'); }catch(e){ return null; } })() || 'nautical';
if(!PDF_THEMES[currentPdfTheme]) currentPdfTheme = 'nautical';

/* ============================================================
   PAGE LAYOUT ENGINE
   ============================================================ */

function tpEl(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }

// Lays the template's blocks out into as many A4 pages as needed, inside
// `host` (which must be in the live DOM so things can be measured). Returns
// the page elements.
function layoutTripPdfPages(themeId, D, host){
  const theme = PDF_THEMES[themeId];
  host.innerHTML = '';
  const pages = [];
  let content = null;
  const newPage = ()=>{
    const page = tpEl(`<div class="tp-page ${theme.cls}" dir="${D.rtl?'rtl':'ltr'}" style="width:${TP_W}px;height:${TP_H}px;background:${theme.pageBg};">
      ${theme.contours ? `<div class="tp-bg">${certContourSvg(TP_W, TP_H)}</div>` : ''}
      <div class="tp-frame"></div>
      <div class="tp-content">${pages.length ? tpRunningHeader(D) : ''}</div>
      ${tpFooter(D)}
    </div>`);
    host.appendChild(page); pages.push(page);
    content = page.querySelector('.tp-content');
  };
  const overflows = ()=> content.scrollHeight > content.clientHeight + 1;
  const flowCount = ()=> content.querySelectorAll(':scope > :not(.tp-runhead)').length;
  newPage();

  // Before giving up on a page, "backfill" it: any later block flagged
  // float (independent cards like Crew or The Route) that still fits in
  // the space left is pulled forward, so pages don't end with a big gap.
  const queue = theme.blocks(D).slice();
  const backfill = ()=>{
    for(let k=0;k<queue.length;k++){
      const b = queue[k];
      if(!b.float || b.items) continue;
      if(tryPlace(b)){ queue.splice(k,1); k--; }
    }
  };
  // Places a whole block (or its first variant that fits) if it fits here.
  function tryPlace(b){
    for(const html of [b.html, ...(b.variants||[])]){
      const el = tpEl(html); content.appendChild(el);
      if(!overflows()) return true;
      el.remove();
    }
    return false;
  }
  const breakPage = ()=>{ backfill(); newPage(); };

  while(queue.length){
    const block = queue.shift();
    if(!block.items){
      if(tryPlace(block)) continue;
      if(flowCount() > 0){ breakPage(); if(tryPlace(block)) continue; }
      content.appendChild(tpEl(block.html)); // taller than a whole page: place it anyway
      continue;
    }
    // Splittable card: fit as many items as possible on this page, then carry on.
    let i = 0, cont = false;
    while(i < block.items.length){
      const start = i;
      let el = tpEl(block.wrap(block.items[i], cont)); content.appendChild(el);
      if(overflows() && flowCount() > 1){ el.remove(); breakPage(); continue; } // retry on a fresh page
      i++;
      while(i < block.items.length){
        const trial = tpEl(block.wrap(block.items.slice(start, i+1).join(''), cont));
        content.replaceChild(trial, el);
        if(overflows()){ content.replaceChild(el, trial); break; }
        el = trial; i++;
      }
      if(i < block.items.length){ breakPage(); cont = true; }
    }
  }

  pages.forEach((p, idx)=>{
    p.querySelector('.tp-pg-n').textContent = idx+1;
    p.querySelector('.tp-pg-total').textContent = pages.length;
  });
  return pages;
}

/* ============================================================
   THEME PICKER · PREVIEW · EXPORT
   ============================================================ */

function renderPdfThemePicker(){
  const el = document.getElementById('pdfThemePicker');
  if(!el) return;
  el.innerHTML = Object.keys(PDF_THEMES).map(id=>`<div class="pdf-theme-opt${id===currentPdfTheme?' active':''}" onclick="selectPdfTheme('${id}')">
      <span class="pdf-theme-swatch" style="background:${PDF_THEMES[id].swatch}"></span>${t(PDF_THEMES[id].label)}</div>`).join('');
}
function selectPdfTheme(id){
  if(!PDF_THEMES[id]) return;
  currentPdfTheme = id;
  try{ localStorage.setItem('pdfTheme', id); }catch(e){}
  renderPdfThemePicker();
  renderTripPdfPreview();
}

async function openTripPdfPreview(){
  if(featureComingSoon('pdfExport')) return;
  if(!window._detailTrip){ showToast(t('toast.openTripFirst')); return; }
  renderPdfThemePicker();
  openSheet('sheetPdfPreview');
  await renderTripPdfPreview();
}

// Lays the real pages out inside the preview (a CSS transform shrinks them to
// the sheet's width; transforms don't affect layout, so the measurement and
// page breaks are exactly the ones the exported PDF will have).
let _tpPreviewToken = 0;
async function renderTripPdfPreview(){
  const trip = window._detailTrip; if(!trip) return;
  const token = ++_tpPreviewToken;
  const wrap = document.getElementById('pdfPreviewScaleWrap');
  const inner = document.getElementById('pdfPreviewInner');
  inner.className = 'tp-preview-stack';
  inner.style.width = TP_W+'px';
  inner.style.transformOrigin = currentLang==='he' ? 'top right' : 'top left';
  if(document.fonts && document.fonts.ready) await document.fonts.ready;
  if(token !== _tpPreviewToken) return;
  const pages = layoutTripPdfPages(currentPdfTheme, tripPdfData(trip), inner);
  const s = (wrap.clientWidth || 360) / TP_W;
  inner.style.transform = `scale(${s})`;
  wrap.style.height = Math.ceil(inner.scrollHeight * s) + 'px';
  const fmt = document.getElementById('pdfThemeFormat');
  if(fmt) fmt.textContent = `${t('pdf.formatA4')} · ${pages.length} ${pages.length===1 ? t('pdf.pageSingular') : t('pdf.pages')}`;
  waitForImagesToLoad(inner).then(()=>{ if(token===_tpPreviewToken) wrap.style.height = Math.ceil(inner.scrollHeight * s) + 'px'; });
}

async function generateAndShareTripPdf(){
  const trip = window._detailTrip;
  if(!trip) return;
  if(typeof window.jspdf==='undefined' || typeof html2canvas==='undefined'){ showToast(t('toast.pdfNeedsConnection')); return; }
  const theme = PDF_THEMES[currentPdfTheme];
  showToast(t('toast.preparingPdf'));
  // Fresh full-size copy off-screen — never capture the scaled preview.
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-${TP_W+400}px;top:0;width:${TP_W}px;z-index:-1;`;
  document.body.appendChild(host);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const pages = layoutTripPdfPages(currentPdfTheme, tripPdfData(trip), host);
    await waitForImagesToLoad(host);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4', compress:true });
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    for(let i=0;i<pages.length;i++){
      const canvas = await html2canvas(pages[i], { scale:2, useCORS:true, backgroundColor:theme.pageBg, logging:false,
        width:TP_W, height:TP_H, windowWidth:TP_W, scrollX:0, scrollY:0 });
      if(i>0) doc.addPage('a4','portrait');
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
    }
    doc.setProperties({ title: trip.title || 'Sail Log', subject: tpLogNumber(trip), creator: 'Sail la Vie' });
    const fileName = (trip.title||'sail-log').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() + '.pdf';
    await shareOrDownloadFile(doc.output('blob'), fileName || 'sail-log.pdf', 'application/pdf', trip.title||'Sail Log');
    closeSheets();
  }catch(e){
    if(e && e.name==='AbortError'){ /* user cancelled the native share sheet */ }
    else { console.error('PDF generation failed', e); showToast(t('toast.pdfGenFail')); }
  }finally{
    host.remove();
  }
}

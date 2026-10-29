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
//   • All photos are included, none repeated, each at its own shape in
//     "justified" rows (see tpJustifiedRows) — no more heads cut off.
//   • Flexible fitting: the route box follows the shape of the track (or of the
//     uploaded map picture), and a nearly empty last page is avoided by retrying
//     with slightly smaller photos (see layoutTripPdfPages).
//   • The route map is a real Mapbox map picture (see tpPrepareMapImages), with the
//     drawn chart below as the offline fallback. That chart is a purpose-built SVG with literal colours (the old
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

// A sail's max speed, or null if there isn't a real one. Manually logged sails
// used to copy the average into max when the field was left empty (fixed
// 29.10.2026), so on those older logs "max = average" means "not recorded".
function tripMaxSpeed(trip){
  const max = Number(trip && trip.maxSpeed);
  if(!max || !isFinite(max)) return null;
  const tracked = !!(trip.path && trip.path.length>1);
  if(!tracked && Math.abs(max - (Number(trip.avgSpeed)||0)) < 0.005) return null;
  return max;
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
  const maxSpd = tripMaxSpeed(trip);
  const stats = [
    {value:num(fmtDistance(trip.distanceNm||0)), unit:distUnitLabel(), label:t('stat.distance'), icon:'pin'},
    {value:fmtDuration(trip.elapsedSeconds), unit:'', label:t('detail.elapsed'), icon:'clock'},
    {value:num(fmtSpeed(trip.avgSpeed||0)), unit:speedUnitLabel(), label:t('stat.avgSpeed'), icon:'gauge'},
    // Max speed only when it was really measured or typed in (see tripMaxSpeed)
    ...(maxSpd!=null ? [{value:num(fmtSpeed(maxSpd)), unit:speedUnitLabel(), label:t('stat.maxSpeed'), icon:'gauge'}] : []),
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
   THE STORY OF THE DAY (29.10.2026)
   "The Day" is no longer just the notes: the app writes a short story of the
   sail from everything it knows — date and time, boat, place, skipper, crew,
   weather and the numbers — in the voice of the chosen theme, and weaves the
   skipper's own notes into it (shown in italics, word for word, never changed).
     Nautical  — a ship's-log / sailing-magazine voice
     Yacht     — short, understated, club-like
     Memory    — warm, "we", like a scrapbook
   Wording is picked from a few variations using the sail's id, so two sails in
   the same theme don't read the same, but the same sail always reads the same.
   English only for now; in other languages the notes are shown as before.
   Returns { paras:[{text, quote}], len }.
   ============================================================ */
function tpPick(D, salt, options){
  let h = 0x811c9dc5; const s = String(D.trip.id||D.trip.date||'') + salt;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return options[(h>>>0) % options.length];
}
function tpList(names){
  if(names.length<=1) return names.join('');
  return names.slice(0,-1).join(', ') + ' and ' + names[names.length-1];
}
const TP_NUM_WORDS = ['no','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
function tpWindWords(kts){ // Beaufort-style description
  if(kts < 1)  return {noun:'calm', adj:'no wind to speak of'};
  if(kts < 4)  return {noun:'light air', adj:'barely a breath'};
  if(kts < 7)  return {noun:'light breeze', adj:'light'};
  if(kts < 11) return {noun:'gentle breeze', adj:'gentle'};
  if(kts < 17) return {noun:'moderate breeze', adj:'moderate'};
  if(kts < 22) return {noun:'fresh breeze', adj:'fresh'};
  if(kts < 28) return {noun:'strong breeze', adj:'strong'};
  return {noun:'near gale', adj:'very strong'};
}
const TP_DIR_WORDS = {N:'northerly', NE:'north-easterly', E:'easterly', SE:'south-easterly', S:'southerly', SW:'south-westerly', W:'westerly', NW:'north-westerly'};
const TP_SKY_WORDS = {'Clear / Sunny':'clear skies', 'Partly Cloudy':'broken cloud', 'Cloudy':'grey skies', 'Fog':'fog', 'Rain':'rain', 'Thunderstorm':'thunder about', 'Snow':'snow'};

function tpStory(D, themeId){
  const notes = D.notes.map(text=>({text, quote:true}));
  if(currentLang && currentLang!=='en') return { paras: D.notes.map(text=>({text, quote:false})), len: D.notesLen };

  const tr = D.trip, w = tr.weather || {};
  const skipper = tr.skipperId ? (skipperById(tr.skipperId)||{}).name : '';
  const crew = (tr.crewIds||[]).map(id=>(crewMemberById(id)||{}).name).filter(n=>n && n!==skipper);
  const boat = D.boat ? D.boat.name : '';
  const place = D.place;
  const hour = new Date(tr.date).getHours();
  const part = hour<5 ? 'night' : hour<12 ? 'morning' : hour<17 ? 'afternoon' : hour<21 ? 'evening' : 'night';
  const kts = Number(w.windSpeed)||0, gust = Number(w.gusts)||0;
  const hasWind = w.windSpeed!=null && w.windSpeed!=='' ;
  const wind = tpWindWords(kts), dir = TP_DIR_WORDS[w.windDir] || '';
  const gusty = gust && gust >= kts + 5;
  const sea = w.seaState ? String(w.seaState).toLowerCase() : '';
  const temp = w.temp ? Number(w.temp) : null;
  const sky = TP_SKY_WORDS[w.sky] || '';
  const dist = fmtDistance(tr.distanceNm||0), time = fmtDuration(tr.elapsedSeconds), avg = fmtSpeed(tr.avgSpeed||0);
  const maxS = tripMaxSpeed(tr);
  const n = crew.length + (skipper?1:0), nWord = TP_NUM_WORDS[n] || String(n);
  const hasNumbers = (tr.distanceNm||0) > 0 && (tr.elapsedSeconds||0) > 0;
  const out = [];
  const add = (text)=>{ if(text) out.push({text, quote:false}); };
  const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : s;

  if(themeId==='yacht'){
    // Short, understated sentences.
    add([
      `${D.weekday} ${part}${place?`, ${place}`:''}.`,
      boat ? `${boat}${skipper?`, skippered by ${skipper}`:''}${crew.length?`, with ${tpList(crew)} aboard`:''}.` : (skipper ? `Skipper ${skipper}${crew.length?`; crew ${tpList(crew)}`:''}.` : (crew.length ? `Aboard: ${tpList(crew)}.` : '')),
      hasWind ? `Wind ${w.windDir ? w.windDir+' ' : ''}${fmtSpeed(kts)}${gusty?`, gusting ${fmtSpeed(gust)}`:''}${sea?`; sea ${sea}`:''}${temp!=null?`; ${temp}°C`:''}.` : (sea ? `Sea ${sea}.` : ''),
      hasNumbers ? `${dist} in ${time}, averaging ${avg}${maxS!=null?`, ${fmtSpeed(maxS)} at best`:''}.` : ''
    ].filter(Boolean).join(' '));
    out.push(...notes);
    return { paras: out, len: out.reduce((a,p)=>a+p.text.length, 0) };
  }

  if(themeId==='memory'){
    // Warm, "we", scrapbook voice.
    const who = crew.length ? tpList(crew) : '';
    const opener = tpPick(D, 'mo', [
      `What a ${D.weekday} ${part} it was.`,
      `Some days on the water stay with you, and this ${D.weekday} ${part} was one of them.`,
      `There's no better way to spend a ${D.weekday} ${part}.`
    ]);
    const aboard = boat
      ? (who ? `${who} joined ${skipper?skipper+' ':'us '}aboard ${boat}${place?` off ${place}`:''}` : `${skipper?skipper+' took':'We took'} ${boat} out${place?` from ${place}`:''}`)
      : (who ? `${who} came sailing${skipper?` with ${skipper}`:''}${place?` off ${place}`:''}` : (place ? `We set out from ${place}` : ''));
    const weather = hasWind
      ? `${kts<4 ? 'with hardly a breath of wind' : `with a ${wind.adj} ${dir?dir+' ':''}breeze${gusty?' and the odd gust to keep us on our toes':''}`}${sea?`, a ${sea} sea`:''}${temp!=null?`${temp>=24?' and warm':temp<=14?' and a chill in the':' and'} ${temp>=24?'sunshine':temp<=14?'air':'pleasant air'} at ${temp}°C`:''}`
      : (sea ? `on a ${sea} sea` : '');
    add([opener, aboard ? `${aboard}${weather?', '+weather:''}.` : (weather ? `We sailed ${weather}.` : '')].filter(Boolean).join(' '));
    out.push(...notes);
    if(hasNumbers) add(tpPick(D, 'mc', [
      `Together we sailed ${dist} in ${time} — memories made, one mile at a time.`,
      `${dist} and ${time} on the water, and every minute of it worth it.`,
      `By the time we were back, we'd covered ${dist} in ${time}. A day to remember.`
    ]));
    return { paras: out, len: out.reduce((a,p)=>a+p.text.length, 0) };
  }

  // Nautical: ship's-log / sailing-magazine voice.
  const departed = boat
    ? tpPick(D, 'nd', [`${boat} slipped her lines`, `${boat} put to sea`, `${boat} cleared the harbour`])
    : tpPick(D, 'nd', ['The crew put to sea', 'Lines were cast off', 'The boat cleared the harbour']);
  const helm = skipper ? ` with ${skipper} in command` : '';
  const crewTxt = crew.length ? `${skipper?' and':' with'} ${crew.length===1 ? crew[0]+' crewing' : `a crew of ${TP_NUM_WORDS[crew.length]||crew.length} — ${tpList(crew)}`}` : '';
  add(`${D.weekday} ${part}, ${D.dateLong}. ${departed}${place?` off ${place}`:''} at ${D.time}${helm}${crewTxt}.`);
  if(hasWind || sea || sky){
    const from = {N:'north', NE:'north-east', E:'east', SE:'south-east', S:'south', SW:'south-west', W:'west', NW:'north-west'}[w.windDir];
    const windTxt = !hasWind ? '' : kts<1 ? 'a flat calm'
      : `a ${wind.noun}${from?` from the ${from}`:''} at ${fmtSpeed(kts)}${gusty?`, gusting ${fmtSpeed(gust)}`:''}`;
    const seaTxt = sea ? `a ${sea} sea${w.waveHeight?` with ${w.waveHeight} m waves`:''}` : '';
    const verdict = !hasWind ? '' : kts<4 ? ' Patience was the order of the day.' : kts<11 ? ' Easy, pleasant sailing.' : kts<17 ? ' A good sailing breeze.' : ' A lively day — a firm hand on the helm.';
    add(cap([windTxt, seaTxt, sky, temp!=null?`${temp}°C`:''].filter(Boolean).join(', ')) + '.' + verdict);
  }
  if(notes.length){ add(skipper ? `From ${skipper.split(' ')[0]}'s log:` : 'From the log:'); out.push(...notes); }
  if(hasNumbers){
    const best = maxS!=null ? `, with a best of ${fmtSpeed(maxS)}` : '';
    add(tpPick(D, 'nn', [
      `The log closed at ${dist} in ${time}, averaging ${avg}${best}.`,
      `All told, ${dist} covered in ${time} at an average of ${avg}${best}.`,
      `By the time the lines were made fast she had logged ${dist} in ${time}, averaging ${avg}${best}.`
    ]));
  }
  return { paras: out, len: out.reduce((a,p)=>a+p.text.length, 0) };
}
function tpParaHtml(p){ return `<p${p.quote?' class="tp-quote"':''}>${escapeHtml(p.text)}</p>`; }

/* ============================================================
   SHARED PIECES
   ============================================================ */

// Photo as a background-image div: cropped to its box with no distortion.
// Crew, skipper and boat pictures can be photo-storage references; the page is
// drawn from CSS backgrounds, so they're swapped for real image data first
// (tpPrepareImages). Sail photos are inlined separately (inlineTripImages).
const _tpImgData = new Map();
// Every picture's real shape (width ÷ height), so photos and uploaded maps are
// laid out at their own proportions instead of being cropped to one fixed box.
const _tpAspect = new Map();
function tpMeasure(src){
  if(!src || _tpAspect.has(src)) return Promise.resolve();
  return new Promise(res=>{
    const im = new Image();
    im.onload = ()=>{ if(im.naturalWidth && im.naturalHeight) _tpAspect.set(src, im.naturalWidth/im.naturalHeight); res(); };
    im.onerror = ()=> res();
    im.src = src;
  });
}
function tpAspectOf(src, fallback){ return _tpAspect.get(src) || fallback || 1.5; }

async function tpPrepareImages(trip, themeId){
  const boat = state.boats.find(b=>b.id===trip.boatId);
  const ids = [trip.skipperId, ...(trip.crewIds||[])].filter(Boolean);
  const refs = [boat && boat.photo, ...ids.map(id => (crewMemberById(id)||{}).photo)].filter(isPhotoRef);
  for(const r of refs) if(!_tpImgData.has(r)){ const d = await photoToDataUrl(r); if(d) _tpImgData.set(r, d); }
  const out = await inlineTripImages(trip);
  await Promise.all([...(out.photos||[]), out.mapImage].filter(Boolean).map(tpMeasure));
  // Real Mapbox map pictures, fetched at exactly the sizes this theme's route box can take
  const theme = PDF_THEMES[themeId] || PDF_THEMES.nautical;
  await tpPrepareMapImages(trip, theme.routeW, theme.routeMaxH);
  return out;
}
function tpImg(src, cls, extraStyle){
  if(isPhotoRef(src)) src = _tpImgData.get(src) || placeholderAvatar();
  return `<div class="${cls}" style="background-image:url('${src}');${extraStyle||''}"></div>`;
}

/* ---------- real map picture for the route section (Mapbox Static Images) ----------
   Since 23.10.2026 the PDF's route map is a real Mapbox map, matching the app: one
   picture is requested from Mapbox with the track already drawn on it, turned into
   image data (so html2canvas can put it in the PDF), and remembered per trip.
   If it can't be fetched (offline, Mapbox down) the drawn chart below is used instead.
   The PDF always uses the DAYTIME look, even if the app is on Dark — a dark map on a
   light printed page looks odd. Nautical uses Outdoors (sea marks can't be added to a
   still picture). */
// Since 29.10.2026 the picture is requested at EXACTLY the size of the box it
// goes in (each theme has its own width, and the height follows the shape of the
// track). Before, one 714x270 picture was squeezed into every box, so the ends of
// the track and the Mapbox logo were cut off.
const _tpMapImg = new Map(); // "tripId|style|w|h" -> image data
function tpStaticStyle(){
  return (typeof currentMapStyle!=='undefined' && currentMapStyle==='nautical') ? 'outdoors-v12' : 'standard';
}
// Google/Mapbox "encoded polyline" — squeezes the track into a short piece of text
// so it fits in the picture's web address.
function tpEncodePolyline(coords){
  let out = '', pLat = 0, pLng = 0;
  const enc = (v)=>{ v = v<0 ? ~(v<<1) : (v<<1); let s=''; while(v>=0x20){ s += String.fromCharCode((0x20|(v&0x1f))+63); v >>= 5; } return s + String.fromCharCode(v+63); };
  for(const [lat,lng] of coords){
    const a = Math.round(lat*1e5), b = Math.round(lng*1e5);
    out += enc(a-pLat) + enc(b-pLng); pLat = a; pLng = b;
  }
  return out;
}
function tpStaticMapUrl(path, style, pal, w, h){
  // Web addresses have a length limit, so long tracks are thinned to ~350 points
  // (start and finish always kept) — invisible at this picture size.
  const step = Math.max(1, Math.ceil(path.length/350));
  const pts = path.filter((p,i)=> i%step===0 || i===path.length-1).map(p=>[p.lat,p.lng]);
  const line = encodeURIComponent(tpEncodePolyline(pts));
  const hex = (c)=>String(c||'#16324F').replace('#','');
  const s = path[0], e = path[path.length-1];
  const roundTrip = haversineNm(s, e) < 0.05;
  const pins = roundTrip ? [`pin-s+${hex(pal.start||'#2E8B57')}(${s.lng.toFixed(5)},${s.lat.toFixed(5)})`]
                         : [`pin-s+${hex(pal.start||'#2E8B57')}(${s.lng.toFixed(5)},${s.lat.toFixed(5)})`,
                            `pin-s+${hex(pal.end||'#DE4457')}(${e.lng.toFixed(5)},${e.lat.toFixed(5)})`];
  const overlay = [`path-7+ffffff-0.9(${line})`, `path-3+${hex(pal.track)}(${line})`, ...pins].join(',');
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlay}/auto/${w}x${h}@2x`
       + `?padding=44,40&access_token=${MAPBOX_TOKEN}`;
}
// The route box heights to try (tallest first) for a box `w` wide: the first
// one follows the track's shape — a long north-south sail gets a taller box, a
// short hop along the coast a flatter one — capped at `maxH`. The shorter ones
// are only used if the page has less room left.
function tpTrackAspect(path){ // height ÷ width of the track on a map
  const lats = path.map(p=>p.lat), lngs = path.map(p=>p.lng);
  const midLat = (Math.min(...lats)+Math.max(...lats))/2;
  const latSpan = (Math.max(...lats)-Math.min(...lats)) || 0.002;
  const lngSpan = ((Math.max(...lngs)-Math.min(...lngs)) * Math.max(Math.cos(midLat*Math.PI/180),0.01)) || 0.002;
  return latSpan/lngSpan;
}
function tpRouteHeights(trip, w, maxH){
  maxH = maxH || 380;
  let ideal;
  if(trip.path && trip.path.length>1){
    ideal = (w-80)*tpTrackAspect(trip.path) + 86;              // track + the padding around it
  } else if(trip.mapImage){
    ideal = w / tpAspectOf(trip.mapImage, 1.6);                 // uploaded picture at its own shape
  } else return [];
  ideal = Math.round(Math.min(maxH, Math.max(220, ideal)) / 10) * 10;
  return [ideal, ideal-60, ideal-120].filter((h,i)=> i===0 || h>=200);
}
async function tpPrepareMapImages(trip, w, maxH){
  if(!trip || !trip.path || trip.path.length<2 || typeof MAPBOX_TOKEN==='undefined') return;
  const style = tpStaticStyle();
  const pal = {track:TP.navy, start:'#2E8B57', end:TP.coral};
  for(const h of tpRouteHeights(trip, w, maxH)){
    const key = [trip.id, style, w, h].join('|');
    if(_tpMapImg.has(key)) continue;
    let img = await tpFetchDataUrl(tpStaticMapUrl(trip.path, style, pal, w, h));
    if(!img && style==='standard') img = await tpFetchDataUrl(tpStaticMapUrl(trip.path, 'streets-v12', pal, w, h)); // backup look
    if(img) _tpMapImg.set(key, img);
    else { console.warn('[pdf] Mapbox map picture unavailable — using the drawn chart'); return; }
  }
}
async function tpFetchDataUrl(url, ms){
  const ctl = new AbortController(); const timer = setTimeout(()=>ctl.abort(), ms||9000);
  try{
    const res = await fetch(url, {signal: ctl.signal});
    if(!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(r=>{ const fr = new FileReader(); fr.onload = ()=>r(fr.result); fr.onerror = ()=>r(null); fr.readAsDataURL(blob); });
  } catch(e){ return null; } finally { clearTimeout(timer); }
}
function tpMapImageFor(trip, w, h){
  return trip ? _tpMapImg.get([trip.id, tpStaticStyle(), w, h].join('|')) : null;
}

// Chart-style route map with explicit colours (no CSS variables — see header).
// Used when the real map picture above couldn't be fetched.
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
  if(D.hasTrack){
    const real = tpMapImageFor(D.trip, w, h);
    if(real) return tpImg(real, 'tp-mapimg', `width:${w}px;height:${h}px;`);
    return tpMapSvg(D.trip.path, w, h, pal);
  }
  // An uploaded map picture (e.g. a screenshot) is always shown WHOLE, and the
  // box is exactly the picture's shape: a tall phone screenshot gets a narrow box
  // (no empty bands beside it — see tpMapBoxWidth).
  if(D.trip.mapImage) return tpImg(D.trip.mapImage, 'tp-mapimg tp-mapimg-whole', `width:${tpMapBoxWidth(D, w, h)}px;height:${h}px;`);
  return '';
}
// Width of the route box: the full width for GPS maps; for an uploaded picture,
// only as wide as the picture is at this height (never wider than the page allows).
function tpMapBoxWidth(D, w, h){
  if(D.hasTrack || !D.trip.mapImage) return w;
  return Math.min(w, Math.round(h * tpAspectOf(D.trip.mapImage, 1.6)));
}

// The route card as a flow block, in a few map heights (tallest first, see
// tpRouteHeights): if the full-size card doesn't fit in the space left on a
// page, a shorter one is tried before it moves to the next page.
function tpRouteBlock(D, cls, headingFn, themeId, pal){
  const theme = PDF_THEMES[themeId], w = theme.routeW;
  const cards = tpRouteHeights(D.trip, w, theme.routeMaxH).map(hh=>{
    const inner = tpRouteInner(D, w, hh, pal);
    if(!inner) return '';
    // If the map is narrower than the page (an uploaded picture), the card's
    // border is brought in to hug it, and the card is centred on the page.
    const boxW = tpMapBoxWidth(D, w, hh);
    const fit = boxW < w ? ` style="width:${Math.max(boxW + (theme.routeCardPad||0), 220)}px;align-self:center;"` : '';
    return `<div class="${cls}"${fit}>${headingFn(t('pdf.theRoute'))}<div class="tp-map" style="width:${boxW}px;margin:0 auto;">${inner}</div></div>`;
  });
  if(!cards[0]) return null;
  return { float:true, html:cards[0], variants:cards.slice(1) };
}

/* ---------- photos: "justified" rows ----------
   Since 29.10.2026 every photo keeps its own shape: portrait photos stay
   portrait, landscapes stay landscape, nothing gets its top or bottom cut off.
   Photos are put in rows; each row is scaled so it exactly fills the width,
   with all photos in the row the same height (like Google Photos). Each row is
   one flow item, so the grid can break across pages between rows — never
   through a photo. Only extreme shapes (very tall or very wide panoramas) are
   trimmed a little so one photo can't take over a whole row.
     photos — image data list      W — width of the photo area in px
     targetH — the row height we aim for    pad — extra px around each photo (Polaroid frames) */
function tpJustifiedRows(photos, W, targetH, pad){
  const gap = 10; pad = pad || 0;
  const aspect = p => Math.min(2.2, Math.max(0.55, tpAspectOf(p)));
  const heightFor = row => (W - gap*(row.length-1) - pad*row.length) / row.reduce((s,p)=>s+aspect(p),0);
  const rows = []; let cur = [];
  for(const p of photos){
    cur.push(p);
    if(heightFor(cur) <= targetH){ rows.push({photos:cur, h:heightFor(cur)}); cur = []; }
  }
  if(cur.length){
    const prev = rows[rows.length-1];
    // A single photo left over borrows one from the row above, so the grid
    // doesn't end with one photo on its own
    if(cur.length===1 && prev && prev.photos.length>=3){
      cur.unshift(prev.photos.pop()); prev.h = heightFor(prev.photos);
    }
    const h = heightFor(cur);
    if(h > targetH*1.2 && prev && heightFor(prev.photos.concat(cur)) >= targetH*0.62){
      prev.photos = prev.photos.concat(cur); prev.h = heightFor(prev.photos); // fold a short last row into the one before
    } else {
      rows.push({photos:cur, h:Math.min(h, targetH*1.2), last:true});      // last row: not stretched past the target
    }
  }
  return rows;
}
function tpPhotoRows(D, cellCls, W, pad){
  const n = D.photos.length;
  const base = n<=2 ? 270 : n<=5 ? 215 : n<=10 ? 185 : 165; // fewer photos → bigger photos
  const targetH = base * (D.photoScale||1);
  return tpJustifiedRows(D.photos, W, targetH, pad).map(r=>{
    const h = Math.floor(r.h);
    let used = 0;
    const cells = r.photos.map((p,i)=>{
      // widths in whole px; the last photo of a full row takes the rounding left-over
      let w = Math.floor(h*Math.min(2.2, Math.max(0.55, tpAspectOf(p))) + pad);
      if(!r.last && i===r.photos.length-1) w = W - used - 10*(r.photos.length-1);
      used += w;
      return `<div class="${cellCls}" style="width:${w}px;flex:0 0 auto;">${tpImg(p,'tp-photo',`padding-top:0;height:${h}px;`)}</div>`;
    }).join('');
    return `<div class="tp-photo-row" style="justify-content:center;">${cells}</div>`;
  });
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
function tpNotesBlock(S, cls, headingFn){
  return { items: S.paras.map(tpParaHtml),
           wrap:(inner, cont)=>`<div class="${cls} tp-notes-card">${headingFn(t('pdf.theDay') + (cont?` · ${t('pdf.continued')}`:''))}<div class="tp-notes">${inner}</div></div>` };
}
function tpPhotosBlock(D, cls, headingFn, cellCls, W, pad){
  return { items: tpPhotoRows(D, cellCls||'tp-photo-cell', W, pad),
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
  const S = tpStory(D, 'nautical');
  const shortNotes = S.paras.length && S.len <= 750;
  if(condCard || shortNotes){
    B.push({ html:`<div class="tp-row">${condCard}${shortNotes ? `<div class="n-card n-day">${H(t('pdf.theDay'))}<div class="tp-notes">${S.paras.map(tpParaHtml).join('')}</div></div>` : ''}</div>` });
  }
  if(S.paras.length && !shortNotes) B.push(tpNotesBlock(S, 'n-card', H));
  const route = tpRouteBlock(D, 'n-card', H, 'nautical');
  if(route) B.push(route);
  if(D.crew.length) B.push({ float:true, html:`<div class="n-card">${H(t('nav.crew'))}<div class="tp-crew-grid">${tpCrewItems(D,'tp-crew-item')}</div></div>` });
  if(D.photos.length) B.push(tpPhotosBlock(D, 'n-card', H, 'tp-photo-cell', 676, 0));
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
      <h1${Math.max(line1.length, line2.length) > 15 ? ' style="font-size:26px"' : ''}>${escapeHtml(line1)}${line2?`<br>${escapeHtml(line2)}`:''}</h1>
      <div class="y-rule"><span></span>${pdfAnchorSvgSized(14, TP.gold, 1.3)}</div>
    </div>
    <div class="y-meta">
      <span>${escapeHtml(D.weekday)}</span><b>${D.dateLong}</b><em>${D.time}</em>
      ${D.boat ? `<div class="y-meta-boat">${tpImg(D.boat.photo||placeholderAvatar(),'tp-avatar')}${escapeHtml(D.boat.name)}</div>` : ''}
      ${D.place ? `<div class="y-meta-place">${escapeHtml(D.place)}</div>` : ''}
    </div>
  </div>` });
  // Cover photo + the story beside it (short notes). Long notes get a full card.
  const S = tpStory(D, 'yacht');
  const shortNotes = S.paras.length && S.len <= 750;
  if(D.trip.coverPhoto || shortNotes){
    B.push({ html:`<div class="y-hero${D.trip.coverPhoto && shortNotes ? '' : ' y-hero-single'}">
      ${D.trip.coverPhoto ? tpImg(D.trip.coverPhoto,'y-hero-img') : ''}
      ${shortNotes ? `<div class="y-story">${S.paras.map(tpParaHtml).join('')}</div>` : ''}
    </div>` });
  }
  B.push({ html:`<div class="y-numbers">${H(t('pdf.theNumbers'))}<div class="y-stats">${D.stats.map(s=>
    `<div class="y-stat"><b>${s.value}${s.unit?`<small>${s.unit}</small>`:''}</b><span>${s.label}</span></div>`).join('')}</div></div>` });
  if(S.paras.length && !shortNotes) B.push(tpNotesBlock(S, 'y-card', H));
  const cond = D.cond.length ? `<div class="y-card">${H(t('pdf.conditions'))}${tpCondRows(D)}</div>` : '';
  const crew = D.crew.length ? `<div class="y-card">${H(t('nav.crew'))}<div class="tp-crew-list">${tpCrewItems(D,'tp-crew-item')}</div></div>` : '';
  if(cond || crew) B.push({ float:true, html:`<div class="tp-row">${cond}${crew}</div>` });
  const route = tpRouteBlock(D, 'y-card', H, 'yacht');
  if(route) B.push(route);
  if(D.photos.length) B.push(tpPhotosBlock(D, 'y-card', H, 'tp-photo-cell', 714, 0));
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
  const S = tpStory(D, 'memory');
  const shortNotes = S.paras.length && S.len <= 750;
  const cond = D.cond.length ? `<div class="m-card">${H(t('pdf.conditions'))}${tpCondRows(D)}</div>` : '';
  const day = shortNotes ? `<div class="m-card m-day">${H(t('pdf.theDay'))}<div class="tp-notes">${S.paras.map(tpParaHtml).join('')}</div></div>` : '';
  if(cond || day) B.push({ html:`<div class="tp-row">${cond}${day}</div>` });
  if(S.paras.length && !shortNotes) B.push(tpNotesBlock(S, 'm-card', H));
  const route = tpRouteBlock(D, 'm-card', H, 'memory', {water:'#E2F0F2', grid:'#A9CFD6'});
  if(route) B.push(route);
  if(D.crew.length) B.push({ float:true, html:`<div class="m-card">${H(t('nav.crew'))}<div class="tp-crew-grid">${tpCrewItems(D,'tp-crew-item')}</div></div>` });
  if(D.photos.length) B.push(tpPhotosBlock(D, 'm-card', H, 'tp-photo-cell m-polaroid', 676, 12));
  B.push({ html:`<div class="m-tagline"><span></span>${t('pdf.gratefulJourney')} <i>${PDF_ICON_SVG.heart}</i><span></span></div>` });
  return B;
}

const PDF_THEMES = {
  nautical: { label:'pdf.themeNautical',        swatch:'#16324F', cls:'tp-nautical', pageBg:TP.ivory, blocks:tpBlocksNautical, contours:true, routeW:676, routeMaxH:380, routeCardPad:38 },
  yacht:    { label:'pdf.themeMinimalistYacht', swatch:'#C9A24B', cls:'tp-yacht',    pageBg:'#FDFCF9', blocks:tpBlocksYacht,    contours:false, routeW:714, routeMaxH:360, routeCardPad:0 },
  memory:   { label:'pdf.themeMemoryPage',      swatch:'#DE4457', cls:'tp-memory',   pageBg:'#FCF7EF', blocks:tpBlocksMemory,   contours:true, routeW:676, routeMaxH:360, routeCardPad:38 }
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
// Flexible fitting (29.10.2026): the same theme can look different from one sail
// to the next. The pages are laid out once at the normal photo size; if that
// leaves a nearly empty last page (e.g. one lonely row of photos), the layout is
// tried again with slightly smaller photos, and the version with fewer pages is
// kept. If no page can be saved, the photos are made bigger instead so the last
// page is filled.
function layoutTripPdfPages(themeId, D, host){
  const first = tpLayoutOnce(themeId, Object.assign({}, D, {photoScale:1}), host);
  if(first.length < 2 || !D.photos.length || tpPageFill(first[first.length-1]) > 0.4) return first;
  for(const scale of [0.86, 0.74]){
    const pages = tpLayoutOnce(themeId, Object.assign({}, D, {photoScale:scale}), host);
    if(pages.length < first.length) return pages;
  }
  // Can't save the page: use the space instead — bigger photos on that last page
  for(const scale of [1.8, 1.5, 1.25]){
    const pages = tpLayoutOnce(themeId, Object.assign({}, D, {photoScale:scale}), host);
    if(pages.length === first.length) return pages;
  }
  return tpLayoutOnce(themeId, Object.assign({}, D, {photoScale:1}), host);
}
// How much of a page's content area is used (0–1), not counting the running header.
function tpPageFill(page){
  const content = page.querySelector('.tp-content');
  const kids = Array.from(content.children).filter(el=>!el.classList.contains('tp-runhead'));
  if(!kids.length) return 0;
  const last = kids[kids.length-1], head = content.querySelector('.tp-runhead');
  const top = head ? head.offsetTop + head.offsetHeight : 0;
  return (last.offsetTop + last.offsetHeight - top) / Math.max(1, content.clientHeight - top);
}

function tpLayoutOnce(themeId, D, host){
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
  const pdfTrip = await tpPrepareImages(trip, currentPdfTheme); // stored photos -> real image data for the page layout
  if(token !== _tpPreviewToken) return;
  const pages = layoutTripPdfPages(currentPdfTheme, tripPdfData(pdfTrip), inner);
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
    const pages = layoutTripPdfPages(currentPdfTheme, tripPdfData(await tpPrepareImages(trip, currentPdfTheme)), host);
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

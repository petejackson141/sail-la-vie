// ===== reel.js =====
// "Short reel" (30.10.2026): a 20-second vertical (9:16, 1080x1920) video of a
// sail, made on the phone and shared to Instagram / Facebook / WhatsApp.
//
// How it works
//   1. reelPrepare() gathers everything the video shows: the cover photo, up to
//      5 more photos, a real Mapbox map picture of the sail's area, the logo.
//      All are loaded as image data so the drawing canvas can be recorded.
//   2. reelDrawFrame(ctx, time) draws ONE frame for any moment 0–20 s. Every
//      frame is worked out from the time alone, so the preview and the
//      recording are always identical.
//   3. reelRecord() turns the frames into an MP4 (see "Two ways of making the
//      video" further down), then the phone's share sheet opens with it.
//

// No music on purpose: Instagram/Facebook let people add licensed music there.

const REEL_W = 1080, REEL_H = 1920, REEL_SECONDS = 20, REEL_FPS = 30; // 20 s since 30.10.2026 (was 15)
// Instagram/Facebook draw their buttons and caption over the bottom ~400px and
// the top ~200px of a reel, and their like/comment/share buttons down the
// right-hand edge (x > ~950 from y ~1150). Everything important stays clear
// of those: the numbers sit at y ~1260–1420, inside x 140–940 (31.10.2026 —
// they used to be at y 1530 and the username covered them).
const REEL_SAFE_BOTTOM = 1500;
const REEL_FADE = 0.45;          // seconds of cross-fade between scenes (Nautical; each theme has its own)
const RC = { navy:'#16324F', navyDeep:'#0E2338', gold:'#C9A24B', goldLight:'#E3C888', ivory:'#FBF8F1',
             coral:'#DE4457', teal:'#17758F', white:'#FFFFFF', start:'#2E8B57' };

let _reel = null; // { trip, assets, scenes, canvas, recording, blob, ext }

/* ============================================================
   SHEET
   ============================================================ */

async function openReelMaker(){
  const trip = window._detailTrip;
  if(!trip){ showToast(t('toast.openTripFirst')); return; }
  closeSheets();
  setTimeout(()=> openSheet('sheetReel'), 60);
  const status = document.getElementById('reelStatus');
  const canvas = document.getElementById('reelCanvas');
  document.getElementById('reelMakeBtn').disabled = true;
  document.getElementById('reelShareBtn').style.display = 'none';
  status.textContent = t('reel.preparing');
  try{
    const assets = await reelPrepare(trip);
    _reel = { trip, assets, scenes: reelTimeline(trip, assets), canvas };
    reelPickMode = 'photos';
    reelDrawFrame(canvas.getContext('2d'), 0.9); // a still from the opening as the preview
    renderReelThemePicker();
    renderReelPicker();
    status.textContent = reelCanRecord() ? t('reel.ready') : t('reel.cantRecord');
    document.getElementById('reelMakeBtn').disabled = !reelCanRecord();
  }catch(e){
    console.error('reel prepare failed', e);
    status.textContent = t('reel.failed');
  }
}

/* ---------- choosing the style (31.10.2026) ----------
   Three looks, matching the three PDF themes: Nautical (navy and gold, the
   original), Minimalist Yacht Club (ivory paper, navy hairlines, clean wipes)
   and Memory Page (warm cream, polaroids, pastel tiles, handwriting). The
   choice is remembered like the PDF one. REEL_THEMES is at the end of
   section 2, after the drawing code it points to. */
let currentReelTheme = (()=>{ try{ return localStorage.getItem('reelTheme'); }catch(e){ return null; } })() || 'nautical';
function reelTheme(){ return REEL_THEMES[currentReelTheme] || REEL_THEMES.nautical; }
function renderReelThemePicker(){
  const el = document.getElementById('reelThemePicker'); if(!el) return;
  if(!REEL_THEMES[currentReelTheme]) currentReelTheme = 'nautical';
  el.innerHTML = Object.keys(REEL_THEMES).map(id=>`<div class="pdf-theme-opt${id===currentReelTheme?' active':''}" onclick="selectReelTheme('${id}')">
      <span class="pdf-theme-swatch" style="background:${REEL_THEMES[id].swatch}"></span>${t(REEL_THEMES[id].label)}</div>`).join('');
}
function selectReelTheme(id){
  if(!REEL_THEMES[id] || (_reel && _reel.recording)) return;
  currentReelTheme = id;
  try{ localStorage.setItem('reelTheme', id); }catch(e){}
  renderReelThemePicker();
  if(!_reel) return;
  _reel.blob = null; document.getElementById('reelShareBtn').style.display = 'none'; // the old video no longer matches
  reelDrawFrame(_reel.canvas.getContext('2d'), 0.9);
}

/* ---------- choosing the photos and their order (30.10.2026) ----------
   All the sail's photos are shown as thumbnails under the preview. Tap them in
   the order you want them in the reel; each picked photo shows its number. Tap a
   picked one again to take it out (the ones after it move up). Up to
   REEL_MAX_PHOTOS. The preview jumps to that photo so you can see it in place. */
const REEL_DEFAULT_PHOTOS = 5, REEL_MAX_PHOTOS = 8;
// Two modes (tabs above the grid): "Opening photo" — tap one photo to be the
// big opening picture (marked with a star); "Photos in order" — as above.
let reelPickMode = 'photos';
function renderReelPicker(){
  const el = document.getElementById('reelPicker'); if(!el || !_reel) return;
  const a = _reel.assets;
  if(!a.pool.length){ el.innerHTML = ''; return; }
  const cover = reelPickMode === 'cover';
  el.innerHTML = `<div class="reel-pick-tabs">
      <div class="chip${cover ? ' active' : ''}" onclick="reelSetPickMode('cover')">${t('reel.tabCover')}</div>
      <div class="chip${cover ? '' : ' active'}" onclick="reelSetPickMode('photos')">${t('reel.tabPhotos')}</div>
    </div>
    <div class="reel-pick-head">${cover ? t('reel.coverHint') : t('reel.pickHint', {max: REEL_MAX_PHOTOS})}
      ${cover ? '' : `<span class="link-plain" onclick="reelPickClear()">${t('reel.pickClear')}</span>`}</div>
    <div class="reel-pick-grid">${a.pool.map((p, i)=>{
      const n = a.picked.indexOf(i), isCov = a.coverIndex === i;
      const on = cover ? isCov : n >= 0;
      const badge = cover ? (isCov ? '<b>★</b>' : '') : (n >= 0 ? `<b>${n+1}</b>` : '');
      return `<div class="reel-pick${on ? ' on' : ''}" onclick="reelPickTap(${i})">
        <img src="${safeSrc(p.src)}" alt="">${badge}</div>`;
    }).join('')}</div>`;
}
function reelSetPickMode(m){
  reelPickMode = m; renderReelPicker();
  if(_reel) reelDrawFrame(_reel.canvas.getContext('2d'), m === 'cover' ? 0.9 : _reel.scenes[1].start + 1.5);
}
function reelPickTap(i){
  if(!_reel || _reel.recording) return;
  if(reelPickMode !== 'cover'){ reelPickToggle(i); return; }
  const a = _reel.assets;
  a.coverIndex = i; a.cover = a.pool[i].img;
  _reel.blob = null; document.getElementById('reelShareBtn').style.display = 'none';
  renderReelPicker();
  reelDrawFrame(_reel.canvas.getContext('2d'), 0.9); // show the new opening
}
function reelPickApply(showIndex){
  const a = _reel.assets;
  a.photos = a.picked.map(i=>a.pool[i].img);
  _reel.blob = null; document.getElementById('reelShareBtn').style.display = 'none'; // the old video no longer matches
  renderReelPicker();
  // preview: show the photo just picked in its place in the reel (or the opening)
  const main = _reel.scenes.find(s=>s.kind==='main');
  let time = 0.9;
  if(showIndex != null && showIndex >= 0 && a.photos.length){
    const lead = 0.6, each = (main.end - main.start - lead) / a.photos.length;
    time = main.start + lead + each*showIndex + each*0.5;
  }
  reelDrawFrame(_reel.canvas.getContext('2d'), time);
}
function reelPickToggle(i){
  if(!_reel || _reel.recording) return;
  const a = _reel.assets, at = a.picked.indexOf(i);
  if(at >= 0){ a.picked.splice(at, 1); reelPickApply(null); return; }
  if(a.picked.length >= REEL_MAX_PHOTOS){ showToast(t('reel.pickMax', {max: REEL_MAX_PHOTOS})); return; }
  a.picked.push(i);
  reelPickApply(a.picked.length - 1);
}
function reelPickClear(){
  if(!_reel || _reel.recording) return;
  _reel.assets.picked = [];
  reelPickApply(null);
}

/* ============================================================
   1. GATHERING THE PICTURES
   ============================================================ */

function reelLoadImage(src){
  return new Promise(res=>{
    if(!src){ res(null); return; }
    const im = new Image();
    im.onload = ()=> res(im);
    im.onerror = ()=> res(null);
    im.src = src;
  });
}
async function reelImageFrom(ref){
  if(!ref) return null;
  try{ return await reelLoadImage(await photoToDataUrl(ref)); }catch(e){ return null; }
}

// Web Mercator (the maths every web map uses): longitude/latitude → pixels on a
// world map that is 512 * 2^zoom pixels wide (Mapbox's tile size).
function reelProject(lng, lat, zoom){
  const ws = 512 * Math.pow(2, zoom);
  const s = Math.sin(lat*Math.PI/180);
  return { x: (lng+180)/360*ws, y: (0.5 - Math.log((1+s)/(1-s))/(4*Math.PI))*ws };
}
// Picks the map's centre and zoom so the whole track fits the full-screen
// background with a margin. We choose them ourselves (instead of Mapbox's
// "auto") so we know exactly where every track point lands and can draw the
// line on top. The picture is requested at half size and @2x (Mapbox's limit
// is 1280px a side), which gives the full 1080 x 1920.
const REEL_MAP_PAD = { x: 140, top: 380, bottom: 680 }; // keep the track clear of the title and the numbers (numbers moved up 31.10.2026)
function reelMapView(path){
  const W = REEL_W/2, H = REEL_H/2;
  const p0 = path.map(p=>reelProject(p.lng, p.lat, 0));
  const minX=Math.min(...p0.map(p=>p.x)), maxX=Math.max(...p0.map(p=>p.x));
  const minY=Math.min(...p0.map(p=>p.y)), maxY=Math.max(...p0.map(p=>p.y));
  const availW = W - REEL_MAP_PAD.x, availH = H - (REEL_MAP_PAD.top + REEL_MAP_PAD.bottom)/2;
  const zoom = Math.max(1, Math.min(16, Math.log2(Math.min(availW/Math.max(maxX-minX,1e-6), availH/Math.max(maxY-minY,1e-6)))));
  // centre the track in the space between the title and the numbers
  const shift = (REEL_MAP_PAD.bottom - REEL_MAP_PAD.top)/4 / (512*Math.pow(2, zoom)) * 512; // in zoom-0 pixels
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2 + shift;
  const lng = cx/512*360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI*(1 - 2*cy/512))) * 180/Math.PI;
  return { lng, lat, zoom };
}
// Track point → pixel on the full-screen (REEL_W x REEL_H) map picture.
function reelToMapPx(p, view){
  const c = reelProject(view.lng, view.lat, view.zoom), q = reelProject(p.lng, p.lat, view.zoom);
  return { x: REEL_W/2 + (q.x - c.x)*2, y: REEL_H/2 + (q.y - c.y)*2 };
}
async function reelFetchImage(url){
  try{
    const res = await fetch(url);
    if(!res.ok) return null;
    return await reelLoadImage(URL.createObjectURL(await res.blob()));
  }catch(e){ return null; }
}

async function reelPrepare(trip){
  const hasTrack = !!(trip.path && trip.path.length > 1);
  if(document.fonts && document.fonts.load){
    try{ await Promise.all(["700 80px 'Playfair Display'", "700 40px 'Space Grotesk'", "400 40px 'Libre Baskerville'", "italic 700 50px 'Playfair Display'", "400 80px 'Alex Brush'"].map(f=>document.fonts.load(f))); }catch(e){}
  }
  const seen = new Set();
  const refs = [trip.coverPhoto, ...(trip.photos||[])].filter(p=>p && !seen.has(p) && seen.add(p));
  const cover = await reelImageFrom(refs[0]);
  // Every photo of the sail goes in the "pool" the person picks from (see the
  // photo picker below). Ready-picked to start with: the first few after the cover.
  const pool = [];
  for(const r of refs){
    let src = null; try{ src = await photoToDataUrl(r); }catch(e){}
    const img = await reelLoadImage(src);
    if(img) pool.push({ src, img, isCover: r === trip.coverPhoto });
  }
  const picked = pool.map((p,i)=>i).filter(i=>!pool[i].isCover).slice(0, REEL_DEFAULT_PHOTOS);
  const coverIndex = pool.findIndex(p=>p.isCover); // the opening photo (changeable in the picker)
  const photos = picked.map(i=>pool[i].img);
  const logo = await reelLoadImage('images/Logo.png');

  let map = null, view = null, trackPx = null;
  if(hasTrack){
    // thin long tracks (the line is drawn every frame)
    const step = Math.max(1, Math.ceil(trip.path.length / 600));
    const path = trip.path.filter((p,i)=> i%step===0 || i===trip.path.length-1);
    view = reelMapView(path);
    trackPx = path.map(p=>reelToMapPx(p, view));
    if(typeof MAPBOX_TOKEN !== 'undefined'){
      const style = (typeof tpStaticStyle === 'function') ? tpStaticStyle() : 'outdoors-v12';
      const url = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${view.lng.toFixed(6)},${view.lat.toFixed(6)},${view.zoom.toFixed(3)},0/${REEL_W/2}x${REEL_H/2}@2x?access_token=${MAPBOX_TOKEN}`;
      map = await reelFetchImage(url);
      if(!map && style === 'standard') map = await reelFetchImage(url.replace('/standard/', '/streets-v12/'));
    }
    // Timeline along the track: by time stamps when there are any, else by distance
    const times = (typeof replayTimeline === 'function') ? replayTimeline(path) : path.map((_,i)=>i/(path.length-1));
    return { cover, photos, pool, picked, coverIndex, logo, map, trackPx, trackTimes: times, mapImage: null };
  }
  const mapImage = trip.mapImage ? await reelImageFrom(trip.mapImage) : null;
  return { cover, photos, pool, picked, coverIndex, logo, map: null, trackPx: null, trackTimes: null, mapImage };
}

/* ============================================================
   2. THE TIMELINE AND THE DRAWING
   ============================================================ */

// Scenes with start/end times (seconds). Since 30.10.2026 (Pete's feedback:
// too long on the map, photos flew by) there are three:
//   Opening (cover photo + title) — 2.8 s
//   The sail — the map as a faint full-screen background, the track drawing
//              itself the WHOLE time, and the photos shown one by one on top as
//              framed cards (whole photo, nothing cropped), ~2 s each or more
//   Ending (totals + logo) — 2.8 s
function reelTimeline(trip, a){
  const open = 2.8, end = 2.8;
  return [
    { kind:'open', start:0, end:open },
    { kind:'main', start:open, end:REEL_SECONDS - end },
    { kind:'end',  start:REEL_SECONDS - end, end:REEL_SECONDS }
  ];
}

const reelEase = x => x<0 ? 0 : x>1 ? 1 : (x<0.5 ? 2*x*x : 1 - Math.pow(-2*x+2, 2)/2);
const reelClamp = x => Math.max(0, Math.min(1, x));

function reelDrawFrame(ctx, time){
  const r = _reel; if(!r) return;
  const th = reelTheme(), F = th.fade;
  ctx.save();
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, REEL_W, REEL_H);
  // each scene comes in over F seconds while the previous one is still
  // showing; HOW it comes in (fade, wipe, soft zoom) is up to the theme
  r.scenes.forEach((s, i)=>{
    if(time < s.start - (i ? F : 0) || time > s.end + F) return;
    const p = i ? reelClamp((time - (s.start - F)) / F) : 1;
    if(p <= 0) return;
    ctx.save();
    th.enter(ctx, p);
    th[s.kind](ctx, r, time - s.start, s.end - s.start);
    ctx.restore();
    if(p < 1 && th.afterEnter) th.afterEnter(ctx, p);
  });
  ctx.restore();
}

/* ---------- drawing helpers ---------- */

// Draws an image filling the box (cropping the overflow), zoomed by `scale` and
// shifted by (panX, panY) as fractions of the spare room — the "Ken Burns" move.
function reelDrawCover(ctx, img, x, y, w, h, scale, panX, panY){
  const s = Math.max(w/img.width, h/img.height) * (scale||1);
  const dw = img.width*s, dh = img.height*s;
  const dx = x + (w - dw)/2 + (panX||0)*(dw - w)/2;
  const dy = y + (h - dh)/2 + (panY||0)*(dh - h)/2;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}
function reelText(ctx, text, x, y, font, color, align, spacing){
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
  if('letterSpacing' in ctx) ctx.letterSpacing = spacing ? spacing+'px' : '0px';
  ctx.fillText(text, x, y);
  if('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
// Breaks a title into lines that fit maxW (at most 3), shrinking the font if needed.
function reelWrap(ctx, text, maxW, size, weightFamily){
  for(let s = size; s >= size*0.6; s -= 4){
    ctx.font = `${weightFamily.replace('{s}', s)}`;
    const words = String(text||'').split(/\s+/), lines = [];
    let cur = '';
    words.forEach(w=>{ const test = cur ? cur+' '+w : w; if(ctx.measureText(test).width > maxW && cur){ lines.push(cur); cur = w; } else cur = test; });
    if(cur) lines.push(cur);
    if(lines.length <= 3) return { lines, size: s };
  }
  return { lines:[String(text||'')], size: size*0.6 };
}
function reelLogo(ctx, img, cx, cy, r){
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r+8, 0, Math.PI*2); ctx.fillStyle = RC.gold; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r+4, 0, Math.PI*2); ctx.fillStyle = RC.white; ctx.fill();
  if(img){ ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.clip(); ctx.drawImage(img, cx-r, cy-r, 2*r, 2*r); }
  ctx.restore();
}
function reelGradient(ctx, y0, y1, a0, a1){
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(14,35,56,${a0})`); g.addColorStop(1, `rgba(14,35,56,${a1})`);
  ctx.fillStyle = g; ctx.fillRect(0, y0, REEL_W, y1-y0);
}
function reelDate(trip){
  return new Date(trip.date).toLocaleDateString(currentLocale(), {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
// A small sailboat (coral sail, navy hull) for the moving boat on the map
function reelBoat(ctx, x, y, s){
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, 30*s, 0, Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-2*s, -20*s); ctx.lineTo(-2*s, 8*s); ctx.lineTo(-18*s, 8*s); ctx.closePath(); ctx.fillStyle = RC.coral; ctx.fill();
  ctx.beginPath(); ctx.moveTo(2*s, -16*s); ctx.lineTo(2*s, 8*s); ctx.lineTo(15*s, 8*s); ctx.closePath(); ctx.fillStyle = RC.coral; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-20*s, 11*s); ctx.lineTo(20*s, 11*s); ctx.lineTo(13*s, 19*s); ctx.lineTo(-13*s, 19*s); ctx.closePath(); ctx.fillStyle = RC.navy; ctx.fill();
  ctx.restore();
}

/* ---------- the four scenes ---------- */

function reelSceneOpen(ctx, r, t, d){
  const trip = r.trip, a = r.assets;
  if(a.cover) reelDrawCover(ctx, a.cover, 0, 0, REEL_W, REEL_H, 1.04 + 0.10*(t/d), 0, -0.2);
  else { ctx.fillStyle = RC.navy; ctx.fillRect(0, 0, REEL_W, REEL_H); }
  reelGradient(ctx, 0, 420, 0.55, 0);
  reelGradient(ctx, REEL_H*0.45, REEL_H, 0, 0.9);
  const k = reelEase(t/0.9); // text slides up and fades in
  ctx.save(); ctx.globalAlpha *= k;
  reelLogo(ctx, a.logo, REEL_W/2, 210, 78);
  reelText(ctx, 'SAIL LA VIE', REEL_W/2, 360, "700 34px 'Space Grotesk', sans-serif", RC.white, 'center', 12);
  const off = (1-k)*40;
  const w = reelWrap(ctx, (trip.title||'').toUpperCase(), REEL_W - 140, 104, "900 {s}px 'Playfair Display', Georgia, serif");
  const lh = w.size*1.08, top = REEL_H - 700 - (w.lines.length-1)*lh + off;
  w.lines.forEach((ln, i)=> reelText(ctx, ln, REEL_W/2, top + i*lh, `900 ${w.size}px 'Playfair Display', Georgia, serif`, RC.white));
  ctx.fillStyle = RC.gold; ctx.fillRect(REEL_W/2 - 70, top + (w.lines.length-1)*lh + 46, 140, 4);
  reelText(ctx, reelDate(trip), REEL_W/2, top + (w.lines.length-1)*lh + 124, "400 40px 'Libre Baskerville', Georgia, serif", RC.goldLight);
  if(trip.place) reelText(ctx, trip.place.toUpperCase(), REEL_W/2, top + (w.lines.length-1)*lh + 186, "700 34px 'Space Grotesk', sans-serif", RC.white, 'center', 8);
  ctx.restore();
}

// The three numbers of the main scene, counting up to their final values.
// Shared by all themes: [value, label] pairs.
function reelStatItems(trip, k){
  return [
    [fmtDistance((trip.distanceNm||0)*k), t('stat.distance')],
    [fmtDuration(Math.round((trip.elapsedSeconds||0)*k)), t('detail.duration')],
    [fmtSpeed((trip.avgSpeed||0)*Math.min(1, k*1.5)), t('stat.avgSpeed')]
  ];
}
// The numbers sit in the band x 140–940 so Instagram's buttons on the right
// never cover the last one (31.10.2026).
const REEL_STATS_X0 = 140, REEL_STATS_X1 = 940;
function reelStats(ctx, trip, k, y){
  const colW = (REEL_STATS_X1 - REEL_STATS_X0)/3;
  reelStatItems(trip, k).forEach(([v, l], i)=>{
    const cx = REEL_STATS_X0 + colW*i + colW/2;
    reelText(ctx, v, cx, y, "700 54px 'Space Grotesk', sans-serif", RC.white);
    reelText(ctx, l.toUpperCase(), cx, y + 50, "700 23px 'Space Grotesk', sans-serif", RC.goldLight, 'center', 4);
    if(i) { ctx.fillStyle = 'rgba(201,162,75,.55)'; ctx.fillRect(REEL_STATS_X0 + colW*i, y - 58, 2, 116); }
  });
}
// Shades the bottom of the frame: fades in from y0 to y1, then stays at full
// strength ALL the way to the bottom edge. (The old gradient stopped at
// y 1680, so the map showed through brighter below it — the "light band"
// seen on Instagram, 31.10.2026.) rgb is "r,g,b" of the theme's colour.
function reelBottomShade(ctx, y0, y1, alpha, rgb){
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${alpha})`);
  ctx.fillStyle = g; ctx.fillRect(0, y0, REEL_W, y1 - y0);
  ctx.fillStyle = `rgba(${rgb},${alpha})`; ctx.fillRect(0, y1, REEL_W, REEL_H - y1);
}
function reelTopShade(ctx, y1, alpha, rgb){
  const g = ctx.createLinearGradient(0, 0, 0, y1);
  g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, REEL_W, y1);
}
// Where the photos sit in the main scene (between the title and the numbers)
const REEL_PHOTO = { cy: 790, maxW: 840, maxH: 800 };          // Nautical
const REEL_BIG_PHOTO = { cy: 805, maxW: 920, maxH: 870 };      // Yacht Club and Memory Page (bigger, 31.10.2026)
// Which photo is showing and how far through its turn: calls draw(img, j,
// progress 0–1, alpha) for the one photo on screen. Same timing in every theme.
function reelEachPhoto(a, tt, d, fade, draw){
  const ph = a.photos; if(!ph.length) return;
  const lead = 0.6;                                   // a moment of just the map first
  const each = (d - lead) / ph.length, lt = tt - lead;
  ph.forEach((img, j)=>{
    const s0 = j*each, s1 = s0 + each;
    if(lt < s0 || lt > s1) return;
    const alpha = Math.min(reelClamp((lt - s0)/fade), reelClamp((s1 - lt)/fade));
    draw(img, j, reelClamp((lt - s0)/each), alpha, (lt - s0), (s1 - lt));
  });
}
// The background for the main scene: the map (faint), the uploaded map picture
// (faint), or plain navy — with the track drawn up to fraction k on top.
// `look` (optional, per theme): base colour, veil colour/strength and track colours.
function reelBackground(ctx, a, k, tt, d, look){
  const L = Object.assign({ base:RC.navy, veil:'rgba(14,35,56,0.55)', halo:'rgba(14,35,56,.7)', line:RC.gold, start:RC.start, startRing:RC.white }, look||{});
  ctx.fillStyle = L.base; ctx.fillRect(0, 0, REEL_W, REEL_H);
  const z = 1.05 - 0.05*reelClamp(tt/d); // very slow zoom out over the whole scene
  ctx.save();
  ctx.translate(REEL_W/2, REEL_H/2); ctx.scale(z, z); ctx.translate(-REEL_W/2, -REEL_H/2);
  if(a.map) ctx.drawImage(a.map, 0, 0, REEL_W, REEL_H);
  else if(a.mapImage) reelDrawCover(ctx, a.mapImage, 0, 0, REEL_W, REEL_H, 1, 0, 0);
  ctx.restore();
  // faint: a veil over the WHOLE frame (outside the zoom, so it always reaches
  // every edge) so the photos and the track stand out
  if(a.map || a.mapImage){ ctx.fillStyle = L.veil; ctx.fillRect(0, 0, REEL_W, REEL_H); }
  if(a.trackPx){
    ctx.save();
    ctx.translate(REEL_W/2, REEL_H/2); ctx.scale(z, z); ctx.translate(-REEL_W/2, -REEL_H/2);
    reelTrack(ctx, a, k, L);
    ctx.restore();
  }
}
// The track drawn up to fraction k of the sail (by time), with the boat at its tip
function reelTrack(ctx, a, k, L){
  L = L || { halo:'rgba(14,35,56,.7)', line:RC.gold, start:RC.start, startRing:RC.white };
  const P = a.trackPx, T = a.trackTimes;
  let i = 0; while(i < T.length-2 && T[i+1] <= k) i++;
  const span = T[i+1] - T[i], f = span > 0 ? reelClamp((k - T[i])/span) : 1;
  const tip = { x: P[i].x + (P[i+1].x - P[i].x)*f, y: P[i].y + (P[i+1].y - P[i].y)*f };
  const line = (w, col)=>{
    ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y);
    for(let j=1;j<=i;j++) ctx.lineTo(P[j].x, P[j].y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  };
  line(16, L.halo);
  line(8, L.line);
  ctx.beginPath(); ctx.arc(P[0].x, P[0].y, 14, 0, Math.PI*2); ctx.fillStyle = L.start; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = L.startRing; ctx.stroke();
  reelBoat(ctx, tip.x, tip.y, 1.3);
}
// One photo as a framed card in the middle of the screen: the whole photo is
// shown (never cropped), with a white border, gently growing while it's on.
function reelPhotoCard(ctx, img, p, alpha){
  if(!img || alpha <= 0) return;
  const s0 = Math.min(REEL_PHOTO.maxW/img.width, REEL_PHOTO.maxH/img.height); // between the title and the numbers (smaller 31.10.2026 so the numbers fit above Instagram's caption)
  const sc = s0 * (0.96 + 0.06*p);
  const w = img.width*sc, h = img.height*sc, cx = REEL_W/2, cy = REEL_PHOTO.cy;
  const b = 16; // border
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.fillStyle = RC.white;
  if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(cx - w/2 - b, cy - h/2 - b, w + 2*b, h + 2*b, 18); ctx.fill(); }
  else ctx.fillRect(cx - w/2 - b, cy - h/2 - b, w + 2*b, h + 2*b);
  ctx.shadowColor = 'transparent';
  ctx.save();
  if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(cx - w/2, cy - h/2, w, h, 8); ctx.clip(); }
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h);
  ctx.restore();
  ctx.restore();
}
function reelSceneMain(ctx, r, tt, d){  // (tt, not t: t() is the translation function)
  const trip = r.trip, a = r.assets;
  const k = reelEase(reelClamp((tt - 0.2)/(d - 0.6))); // how far along the sail we are
  reelBackground(ctx, a, k, tt, d);
  // title at the top
  reelTopShade(ctx, 380, 0.75, '14,35,56');
  reelText(ctx, reelShortTitle(trip), REEL_W/2, 250, "700 58px 'Playfair Display', Georgia, serif", RC.white);
  reelText(ctx, reelDate(trip).toUpperCase(), REEL_W/2, 305, "700 26px 'Space Grotesk', sans-serif", RC.goldLight, 'center', 6);
  // the shade behind the numbers, running right to the bottom edge (no light band)
  reelBottomShade(ctx, 1080, 1250, 0.8, '14,35,56');
  // photos one by one over the map, each fading in and out — one at a time, no overlap
  reelEachPhoto(a, tt, d, 0.25, (img, j, p, alpha)=> reelPhotoCard(ctx, img, p, alpha));
  // the numbers, above where Instagram puts its caption
  reelStats(ctx, trip, k, 1340);
}
function reelShortTitle(trip){
  const s = trip.title || '';
  return s.length > 30 ? s.slice(0, 29)+'…' : s;
}

function reelSceneEnd(ctx, r, tt, d){
  const trip = r.trip, a = r.assets;
  ctx.fillStyle = RC.navy; ctx.fillRect(0, 0, REEL_W, REEL_H);
  if(a.cover){ ctx.save(); ctx.globalAlpha *= 0.18; reelDrawCover(ctx, a.cover, 0, 0, REEL_W, REEL_H, 1.15, 0, 0); ctx.restore(); }
  const k = reelEase(tt/0.8);
  ctx.save(); ctx.globalAlpha *= k;
  reelLogo(ctx, a.logo, REEL_W/2, 440, 120);
  reelText(ctx, 'SAIL LA VIE', REEL_W/2, 660, "700 46px 'Space Grotesk', sans-serif", RC.white, 'center', 16);
  ctx.fillStyle = RC.gold; ctx.fillRect(REEL_W/2 - 90, 710, 180, 4);
  const rows = [
    [fmtDistance(trip.distanceNm||0), t('stat.distance')],
    [fmtDuration(trip.elapsedSeconds||0), t('detail.duration')]
  ];
  const mx = (typeof tripMaxSpeed === 'function') ? tripMaxSpeed(trip) : trip.maxSpeed;
  if(mx) rows.push([fmtSpeed(mx), t('stat.maxSpeed')]);
  rows.forEach(([v, l], i)=>{
    reelText(ctx, v, REEL_W/2, 860 + i*150, "700 76px 'Space Grotesk', sans-serif", RC.white);
    reelText(ctx, l.toUpperCase(), REEL_W/2, 910 + i*150, "700 26px 'Space Grotesk', sans-serif", RC.goldLight, 'center', 6);
  });
  reelText(ctx, t('reel.loggedWith'), REEL_W/2, 1440, "400 38px 'Libre Baskerville', Georgia, serif", RC.goldLight);
  ctx.restore();
}

/* ---------- small shared shapes for the two light themes ---------- */

function reelRoundRect(ctx, x, y, w, h, rad){
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
  else ctx.rect(x, y, w, h);
}
// A heart (Memory Page), centred on x,y, about 2*s wide
function reelHeart(ctx, x, y, s, color){
  ctx.save(); ctx.translate(x, y - s*0.15);
  ctx.beginPath();
  ctx.moveTo(0, s*0.35);
  ctx.bezierCurveTo(-s*1.1, -s*0.35, -s*0.55, -s*1.15, 0, -s*0.55);
  ctx.bezierCurveTo(s*0.55, -s*1.15, s*1.1, -s*0.35, 0, s*0.35);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}
// Line – small diamond – line (Yacht Club), the canvas version of the PDF's anchor rule
function reelDiamondRule(ctx, cx, y, halfW, color){
  ctx.fillStyle = color;
  ctx.fillRect(cx - halfW, y - 1, halfW - 18, 2);
  ctx.fillRect(cx + 18, y - 1, halfW - 18, 2);
  ctx.save(); ctx.translate(cx, y); ctx.rotate(Math.PI/4); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
}
// Line – heart – line (Memory Page)
function reelHeartRule(ctx, cx, y, halfW, lineColor, heartColor){
  ctx.fillStyle = lineColor;
  ctx.fillRect(cx - halfW, y - 1, halfW - 30, 2);
  ctx.fillRect(cx + 30, y - 1, halfW - 30, 2);
  reelHeart(ctx, cx, y + 4, 18, heartColor);
}
// The gentle repeating wave along the bottom of the Memory Page hero
function reelWaveStrip(ctx, x0, x1, y, color){
  const period = 64, amp = 9;
  ctx.beginPath(); ctx.moveTo(x0, y);
  for(let x = x0; x < x1; x += period){
    ctx.quadraticCurveTo(x + period*0.25, y - amp*2, x + period*0.5, y);
    ctx.quadraticCurveTo(x + period*0.75, y + amp*2, x + period, y);
  }
  ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
}
function reelWeekday(trip){ return new Date(trip.date).toLocaleDateString(currentLocale(), {weekday:'long'}); }
function reelDayMonthYear(trip){ return new Date(trip.date).toLocaleDateString(currentLocale(), {day:'numeric', month:'long', year:'numeric'}); }

/* ============================================================
   THEME 2 — MINIMALIST YACHT CLUB (31.10.2026)
   Matches the PDF theme: ivory paper, navy type and hairline frame, gold
   rules, teal and coral small caps. Calm and clean: scenes change with a
   left-to-right wipe (a thin gold line leads it), photos glide in from the
   right and out to the left, mounted on a white mat with a navy hairline.
   ============================================================ */
const RY = { paper:'#FDFCF9', navy:'#16324F', gold:'#C9A24B', teal:'#17758F', coral:'#DE4457', ink:'#2A4560', muted:'#5C7A8F' };

function reelYachtFrame(ctx){
  ctx.lineWidth = 2; ctx.strokeStyle = RY.navy; ctx.strokeRect(44, 44, REEL_W - 88, REEL_H - 88);
}
function reelYachtOpen(ctx, r, tt, d){
  const trip = r.trip, a = r.assets;
  ctx.fillStyle = RY.paper; ctx.fillRect(0, 0, REEL_W, REEL_H);
  const k = reelEase(tt/0.9);
  // kicker above the photo
  ctx.save(); ctx.globalAlpha *= k;
  reelText(ctx, ('SAIL LA VIE \u00B7 ' + t('pdf.logEntry')).toUpperCase(), REEL_W/2, 225, "700 26px 'Space Grotesk', sans-serif", RY.teal, 'center', 9);
  ctx.restore();
  // the cover photo, square-cornered on the paper, with a slow push-in
  const px = 90, py = 255, pw = REEL_W - 180, ph = 760;
  if(a.cover) reelDrawCover(ctx, a.cover, px, py, pw, ph, 1.03 + 0.07*(tt/d), 0, -0.1);
  else { ctx.fillStyle = RY.navy; ctx.fillRect(px, py, pw, ph); }
  ctx.lineWidth = 2; ctx.strokeStyle = RY.navy; ctx.strokeRect(px, py, pw, ph);
  // the logo, ringed in paper and gold, sitting on the photo's bottom edge
  reelYachtLogo(ctx, a.logo, REEL_W/2, py + ph, 62);
  // titles slide up and fade in under the photo
  ctx.save(); ctx.globalAlpha *= k;
  const off = (1-k)*30;
  const { line1, line2 } = yachtSplitTitle(trip.title || '');
  const lines = [line1, line2].filter(Boolean);
  // one font size for both lines, shrunk until the longer line fits
  let size = 80;
  ctx.font = `700 ${size}px 'Playfair Display', Georgia, serif`;
  while(size > 44 && Math.max(...lines.map(l=>ctx.measureText(l).width + l.length*3)) > REEL_W - 200){
    size -= 4; ctx.font = `700 ${size}px 'Playfair Display', Georgia, serif`;
  }
  const lh = size*1.1;
  let y = (lines.length > 1 ? 1190 : 1215) + off;
  lines.forEach((ln, i)=> reelText(ctx, ln, REEL_W/2, y + i*lh, `700 ${size}px 'Playfair Display', Georgia, serif`, RY.navy, 'center', 3));
  y += (lines.length - 1)*lh + 46;             // last title line → the rule
  reelDiamondRule(ctx, REEL_W/2, y, 150, RY.gold);
  reelText(ctx, reelWeekday(trip).toUpperCase(), REEL_W/2, y + 56, "700 24px 'Space Grotesk', sans-serif", RY.coral, 'center', 7);
  reelText(ctx, reelDayMonthYear(trip), REEL_W/2, y + 104, "400 36px 'Libre Baskerville', Georgia, serif", RY.navy);
  if(trip.place) reelText(ctx, trip.place.toUpperCase(), REEL_W/2, y + 148, "600 24px 'Space Grotesk', sans-serif", RY.teal, 'center', 7);
  ctx.restore();
  reelYachtFrame(ctx);
}
function reelYachtLogo(ctx, img, cx, cy, rad){
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, rad+12, 0, Math.PI*2); ctx.fillStyle = RY.paper; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, rad+7, 0, Math.PI*2); ctx.lineWidth = 3; ctx.strokeStyle = RY.gold; ctx.stroke();
  if(img){ ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI*2); ctx.clip(); ctx.drawImage(img, cx-rad, cy-rad, 2*rad, 2*rad); }
  ctx.restore();
}
// A photo on a white mat with a navy hairline, gliding in from the right and
// out to the left. Never cropped.
function reelYachtPhoto(ctx, img, alpha, inT, outT){
  if(!img || alpha <= 0) return;
  // big (31.10.2026): the photo fills the space between the title rule (y ~360)
  // and the numbers (y ~1260), up to 920 wide
  const s0 = Math.min(REEL_BIG_PHOTO.maxW/img.width, (REEL_BIG_PHOTO.maxH - 40)/img.height);
  const w = img.width*s0, h = img.height*s0, mat = 20;
  const glide = 70*(1 - reelEase(reelClamp(inT/0.5))) - 70*(1 - reelEase(reelClamp(outT/0.5)));
  const cx = REEL_W/2 + glide, cy = REEL_BIG_PHOTO.cy;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(22,50,79,.16)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(cx - w/2 - mat, cy - h/2 - mat, w + 2*mat, h + 2*mat);
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2; ctx.strokeStyle = RY.navy; ctx.strokeRect(cx - w/2 - mat, cy - h/2 - mat, w + 2*mat, h + 2*mat);
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h);
  ctx.restore();
}
function reelYachtStats(ctx, items, y){
  const x0 = REEL_STATS_X0, x1 = REEL_STATS_X1, colW = (x1 - x0)/items.length;
  ctx.fillStyle = RY.navy; ctx.fillRect(x0, y - 82, x1 - x0, 3); ctx.fillRect(x0, y + 78, x1 - x0, 3);
  items.forEach(([v, l], i)=>{
    const cx = x0 + colW*i + colW/2;
    reelText(ctx, v, cx, y, "700 52px 'Space Grotesk', sans-serif", RY.navy);
    reelText(ctx, l.toUpperCase(), cx, y + 46, "600 21px 'Space Grotesk', sans-serif", RY.coral, 'center', 5);
    if(i){ ctx.fillStyle = RY.gold; ctx.fillRect(x0 + colW*i, y - 56, 2, 110); }
  });
}
function reelYachtMain(ctx, r, tt, d){
  const trip = r.trip, a = r.assets;
  const k = reelEase(reelClamp((tt - 0.2)/(d - 0.6)));
  reelBackground(ctx, a, k, tt, d, { base:RY.paper, veil:'rgba(253,252,249,0.72)', halo:'rgba(255,255,255,.95)', line:RY.navy, start:RY.teal, startRing:'#FFFFFF' });
  reelTopShade(ctx, 400, 0.96, '253,252,249');
  reelText(ctx, reelShortTitle(trip), REEL_W/2, 250, "700 54px 'Playfair Display', Georgia, serif", RY.navy, 'center', 1);
  reelText(ctx, reelDate(trip).toUpperCase(), REEL_W/2, 302, "700 23px 'Space Grotesk', sans-serif", RY.teal, 'center', 6);
  reelDiamondRule(ctx, REEL_W/2, 340, 110, RY.gold);
  reelBottomShade(ctx, 1080, 1230, 0.94, '253,252,249');
  reelEachPhoto(a, tt, d, 0.3, (img, j, p, alpha, inT, outT)=> reelYachtPhoto(ctx, img, alpha, inT, outT));
  reelYachtStats(ctx, reelStatItems(trip, k), 1345);
  reelYachtFrame(ctx);
}
function reelYachtEnd(ctx, r, tt, d){
  const trip = r.trip, a = r.assets;
  ctx.fillStyle = RY.paper; ctx.fillRect(0, 0, REEL_W, REEL_H);
  if(a.cover){ ctx.save(); ctx.globalAlpha *= 0.07; reelDrawCover(ctx, a.cover, 0, 0, REEL_W, REEL_H, 1.1, 0, 0); ctx.restore(); }
  const k = reelEase(tt/0.8);
  ctx.save(); ctx.globalAlpha *= k;
  reelYachtLogo(ctx, a.logo, REEL_W/2, 450, 112);
  reelText(ctx, 'SAIL LA VIE', REEL_W/2, 668, "700 44px 'Space Grotesk', sans-serif", RY.navy, 'center', 16);
  reelDiamondRule(ctx, REEL_W/2, 718, 150, RY.gold);
  const rows = [
    [fmtDistance(trip.distanceNm||0), t('stat.distance')],
    [fmtDuration(trip.elapsedSeconds||0), t('detail.duration')]
  ];
  const mx = (typeof tripMaxSpeed === 'function') ? tripMaxSpeed(trip) : trip.maxSpeed;
  if(mx) rows.push([fmtSpeed(mx), t('stat.maxSpeed')]);
  rows.forEach(([v, l], i)=>{
    const y = 860 + i*150;
    reelText(ctx, v, REEL_W/2, y, "700 72px 'Space Grotesk', sans-serif", RY.navy);
    reelText(ctx, l.toUpperCase(), REEL_W/2, y + 46, "600 23px 'Space Grotesk', sans-serif", RY.coral, 'center', 6);
  });
  ctx.fillStyle = RY.gold; ctx.fillRect(REEL_W/2 - 60, 1350, 120, 2);
  reelText(ctx, t('reel.loggedWith'), REEL_W/2, 1430, "400 36px 'Libre Baskerville', Georgia, serif", RY.teal);
  ctx.restore();
  reelYachtFrame(ctx);
}

/* ============================================================
   THEME 3 — MEMORY PAGE (31.10.2026)
   Matches the PDF theme: warm cream, a big rounded photo with a handwritten
   lead line and a heart rule, gold waves, pastel number tiles, polaroids.
   Soft and playful: scenes melt in with a gentle zoom, each photo drops in
   as a tilted polaroid and settles with a little bounce.
   ============================================================ */
const RM = { cream:'#FCF7EF', navy:'#16324F', gold:'#C9A24B', goldLight:'#E3C888', coral:'#DE4457', teal:'#17758F', border:'#EFE6D5',
             tiles:['#E9F5FD','#E7F7F2','#FEF5E1','#FDEDF0'] };
const reelBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3*Math.pow(x-1, 3) + c1*Math.pow(x-1, 2); }; // overshoot, then settle

function reelMemoryLogo(ctx, img, cx, cy, rad){
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, rad+10, 0, Math.PI*2); ctx.fillStyle = RM.goldLight; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, rad+6, 0, Math.PI*2); ctx.fillStyle = RM.cream; ctx.fill();
  if(img){ ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI*2); ctx.clip(); ctx.drawImage(img, cx-rad, cy-rad, 2*rad, 2*rad); }
  ctx.restore();
}
function reelMemoryOpen(ctx, r, tt, d){
  const trip = r.trip, a = r.assets;
  ctx.fillStyle = RM.cream; ctx.fillRect(0, 0, REEL_W, REEL_H);
  // the big rounded photo, centred with the same cream margin all round
  // (31.10.2026 — it used to run off the bottom edge, which looked lopsided).
  // Its dark lower half keeps Instagram's white name and caption readable.
  const M = 50, hx = M, hy = M, hw = REEL_W - 2*M, hh = REEL_H - 2*M;
  ctx.save(); reelRoundRect(ctx, hx, hy, hw, hh, 56); ctx.clip();
  if(a.cover) reelDrawCover(ctx, a.cover, hx, hy, hw, hh, 1.04 + 0.08*(tt/d), 0, -0.15);
  else { ctx.fillStyle = RM.teal; ctx.fillRect(hx, hy, hw, hh); }
  const g = ctx.createLinearGradient(0, hy, 0, REEL_H);
  g.addColorStop(0, 'rgba(14,35,56,0.30)'); g.addColorStop(0.22, 'rgba(14,35,56,0)'); g.addColorStop(0.62, 'rgba(14,35,56,0.55)'); g.addColorStop(1, 'rgba(14,35,56,0.88)');
  ctx.fillStyle = g; ctx.fillRect(hx, hy, hw, hh);
  ctx.restore();
  const k = reelEase(tt/0.9), off = (1-k)*36;
  ctx.save(); ctx.globalAlpha *= k;
  reelMemoryLogo(ctx, a.logo, hx + 110, 250, 58);   // below Instagram's top bar
  // date bubble, top right
  const wd = reelWeekday(trip).toUpperCase(), dm = reelDayMonthYear(trip);
  ctx.font = "400 30px 'Libre Baskerville', Georgia, serif";
  const bw = Math.max(ctx.measureText(dm).width, 180) + 56, bx = hx + hw - 40 - bw, by = 192;
  ctx.fillStyle = 'rgba(252,247,239,0.94)'; reelRoundRect(ctx, bx, by, bw, 116, 26); ctx.fill();
  reelText(ctx, wd, bx + bw/2, by + 46, "700 21px 'Space Grotesk', sans-serif", RM.coral, 'center', 5);
  reelText(ctx, dm, bx + bw/2, by + 90, "400 30px 'Libre Baskerville', Georgia, serif", RM.navy);
  // titles: handwritten lead + bold main, heart rule, place
  const { lead, main } = memorySplitTitle(trip.title || '');
  const w = reelWrap(ctx, main, hw - 120, 92, "900 {s}px 'Playfair Display', Georgia, serif");
  const lh = w.size*1.06;
  const bottom = 1330 + off;                       // the place line; all clear of Instagram's caption
  const mainTop = bottom - 150 - (w.lines.length-1)*lh;
  if(lead) reelText(ctx, lead, REEL_W/2, mainTop - w.size*0.95, "400 108px 'Alex Brush', cursive", RM.goldLight);
  w.lines.forEach((ln, i)=> reelText(ctx, ln, REEL_W/2, mainTop + i*lh, `900 ${w.size}px 'Playfair Display', Georgia, serif`, '#FFFFFF', 'center', 2));
  reelHeartRule(ctx, REEL_W/2, bottom - 80, 150, RM.goldLight, RM.goldLight);
  if(trip.place) reelText(ctx, trip.place.toUpperCase(), REEL_W/2, bottom, "600 28px 'Space Grotesk', sans-serif", '#FFFFFF', 'center', 8);
  reelWaveStrip(ctx, hx, hx + hw, bottom + 70, RM.goldLight);
  ctx.restore();
}
// A photo as a polaroid: white frame with a deeper bottom edge, tilted a
// little (alternating left/right), dropping in and settling with a bounce.
function reelMemoryPolaroid(ctx, img, j, alpha, inT){
  if(!img || alpha <= 0) return;
  const s0 = Math.min((REEL_BIG_PHOTO.maxW - 40)/img.width, (REEL_BIG_PHOTO.maxH - 135)/img.height); // big (31.10.2026); a bit of room left for the tilt
  const w = img.width*s0, h = img.height*s0, pad = 22, padB = 86;
  const settle = reelClamp(inT/0.7), b = reelBack(settle);
  const tilt = (j % 2 ? 1 : -1) * (2.2 + (j % 3)*0.6) * Math.PI/180;
  const rot = tilt + (j % 2 ? 1 : -1) * (1 - settle) * 7 * Math.PI/180;
  const dropY = (1 - b) * -120;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.translate(REEL_W/2, REEL_BIG_PHOTO.cy + dropY); ctx.rotate(rot);
  const fw = w + 2*pad, fh = h + pad + padB, fx = -fw/2, fy = -fh/2;
  ctx.shadowColor = 'rgba(20,43,68,.28)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#FFFFFF'; reelRoundRect(ctx, fx, fy, fw, fh, 8); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.drawImage(img, -w/2, fy + pad, w, h);
  reelHeart(ctx, 0, fy + pad + h + (padB - pad)/2 + 6, 12, RM.coral);
  ctx.restore();
}
function reelMemoryTiles(ctx, items, y){
  const gap = 18, x0 = REEL_STATS_X0, tw = (REEL_STATS_X1 - x0 - gap*(items.length-1))/items.length, th = 160;
  items.forEach(([v, l], i)=>{
    const x = x0 + i*(tw + gap);
    ctx.fillStyle = RM.tiles[i % RM.tiles.length]; reelRoundRect(ctx, x, y, tw, th, 30); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = RM.border; ctx.stroke();
    reelText(ctx, v, x + tw/2, y + 84, "700 46px 'Space Grotesk', sans-serif", RM.navy);
    reelText(ctx, l.toUpperCase(), x + tw/2, y + 126, "600 19px 'Space Grotesk', sans-serif", RM.coral, 'center', 4);
  });
}
function reelMemoryMain(ctx, r, tt, d){
  const trip = r.trip, a = r.assets;
  const k = reelEase(reelClamp((tt - 0.2)/(d - 0.6)));
  reelBackground(ctx, a, k, tt, d, { base:RM.cream, veil:'rgba(252,247,239,0.66)', halo:'rgba(255,255,255,.95)', line:RM.coral, start:RM.teal, startRing:'#FFFFFF' });
  reelTopShade(ctx, 400, 0.96, '252,247,239');
  reelText(ctx, reelShortTitle(trip), REEL_W/2, 248, "italic 700 56px 'Playfair Display', Georgia, serif", RM.navy);
  reelText(ctx, reelDate(trip).toUpperCase(), REEL_W/2, 300, "700 22px 'Space Grotesk', sans-serif", RM.coral, 'center', 5);
  reelHeartRule(ctx, REEL_W/2, 340, 110, RM.goldLight, RM.coral);
  reelBottomShade(ctx, 1080, 1230, 0.93, '252,247,239');
  reelEachPhoto(a, tt, d, 0.22, (img, j, p, alpha, inT)=> reelMemoryPolaroid(ctx, img, j, alpha, inT));
  reelMemoryTiles(ctx, reelStatItems(trip, k), 1262);
}
function reelMemoryEnd(ctx, r, tt, d){
  const trip = r.trip, a = r.assets;
  ctx.fillStyle = RM.cream; ctx.fillRect(0, 0, REEL_W, REEL_H);
  if(a.cover){ ctx.save(); ctx.globalAlpha *= 0.10; reelDrawCover(ctx, a.cover, 0, 0, REEL_W, REEL_H, 1.12, 0, 0); ctx.restore(); }
  const k = reelEase(tt/0.8);
  ctx.save(); ctx.globalAlpha *= k;
  reelMemoryLogo(ctx, a.logo, REEL_W/2, 420, 108);
  reelText(ctx, 'SAIL LA VIE', REEL_W/2, 628, "700 44px 'Space Grotesk', sans-serif", RM.navy, 'center', 16);
  reelHeartRule(ctx, REEL_W/2, 680, 150, RM.goldLight, RM.coral);
  const rows = [
    [fmtDistance(trip.distanceNm||0), t('stat.distance')],
    [fmtDuration(trip.elapsedSeconds||0), t('detail.duration')]
  ];
  const mx = (typeof tripMaxSpeed === 'function') ? tripMaxSpeed(trip) : trip.maxSpeed;
  if(mx) rows.push([fmtSpeed(mx), t('stat.maxSpeed')]);
  rows.forEach(([v, l], i)=>{
    const y = 740 + i*156;
    ctx.fillStyle = RM.tiles[i % RM.tiles.length]; reelRoundRect(ctx, 250, y, REEL_W - 500, 134, 30); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = RM.border; ctx.stroke();
    reelText(ctx, v, REEL_W/2, y + 76, "700 60px 'Space Grotesk', sans-serif", RM.navy);
    reelText(ctx, l.toUpperCase(), REEL_W/2, y + 114, "600 21px 'Space Grotesk', sans-serif", RM.coral, 'center', 5);
  });
  reelText(ctx, t('pdf.gratefulJourney'), REEL_W/2, 1310, "400 82px 'Alex Brush', cursive", RM.navy);
  reelHeart(ctx, REEL_W/2, 1372, 16, RM.coral);
  reelText(ctx, t('reel.loggedWith'), REEL_W/2, 1450, "400 32px 'Libre Baskerville', Georgia, serif", RM.teal);
  ctx.restore();
}

/* ---------- the theme list (used by the picker and reelDrawFrame) ---------- */
// enter(ctx, p): how a scene comes in as p goes 0 → 1 over `fade` seconds.
const REEL_THEMES = {
  nautical: { label:'pdf.themeNautical', swatch:'#16324F', bg:RC.navyDeep, fade:REEL_FADE,
              open:reelSceneOpen, main:reelSceneMain, end:reelSceneEnd,
              enter:(ctx, p)=>{ ctx.globalAlpha = p; } },                       // cross-fade
  yacht:    { label:'pdf.themeMinimalistYacht', swatch:'#C9A24B', bg:RY.paper, fade:0.6,
              open:reelYachtOpen, main:reelYachtMain, end:reelYachtEnd,
              enter:(ctx, p)=>{ if(p < 1){ ctx.beginPath(); ctx.rect(0, 0, REEL_W*reelEase(p), REEL_H); ctx.clip(); } }, // wipe left → right
              afterEnter:(ctx, p)=>{ ctx.fillStyle = RY.gold; ctx.fillRect(REEL_W*reelEase(p) - 2, 0, 4, REEL_H); } },   // gold line leading the wipe
  memory:   { label:'pdf.themeMemoryPage', swatch:'#DE4457', bg:RM.cream, fade:0.55,
              open:reelMemoryOpen, main:reelMemoryMain, end:reelMemoryEnd,
              enter:(ctx, p)=>{ ctx.globalAlpha = p; const z = 1.04 - 0.04*reelEase(p);   // soft melt with a gentle zoom
                                ctx.translate(REEL_W/2, REEL_H/2); ctx.scale(z, z); ctx.translate(-REEL_W/2, -REEL_H/2); } }
};

/* ============================================================
   3. RECORDING AND SHARING
   ============================================================ */

function reelMimeType(){
  if(typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  return ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(m=>MediaRecorder.isTypeSupported(m)) || null;
}
// Two ways of making the video:
//   1. ENCODER (preferred, since 30.10.2026): every frame is drawn and handed to
//      the phone's video encoder (WebCodecs), and mp4-muxer
//      (js/vendor-mp4-muxer.js) writes a standard MP4 with the full length in
//      its header. It doesn't need to play in real time, so it's usually faster
//      than 20 s.
//   2. RECORDER (fallback for phones without WebCodecs): plays the reel and
//      records the screen with MediaRecorder. Its MP4s are "fragmented", and
//      Instagram only took the first ~3 seconds of those — the reason for 1.
// Baseline (42e0..) first: it never reorders frames, so the timestamps we
// write in reelEncodeMp4 always match the frame order. High/Main are fallbacks.
const REEL_CODECS = ['avc1.42e032', 'avc1.42e028', 'avc1.4d0032', 'avc1.4d0028', 'avc1.640032', 'avc1.640028'];
let _reelEncoderCodec; // undefined = not checked yet, null = none works
async function reelEncoderCodec(){
  if(_reelEncoderCodec !== undefined) return _reelEncoderCodec;
  _reelEncoderCodec = null;
  if(typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined' || typeof Mp4Muxer === 'undefined') return null;
  for(const codec of REEL_CODECS){
    try{
      const res = await VideoEncoder.isConfigSupported({ codec, width: REEL_W, height: REEL_H, bitrate: 8000000, framerate: REEL_FPS });
      if(res && res.supported){ _reelEncoderCodec = codec; break; }
    }catch(e){}
  }
  return _reelEncoderCodec;
}
function reelCanRecord(){
  const c = document.getElementById('reelCanvas');
  return !!(c && ((typeof VideoEncoder !== 'undefined' && typeof Mp4Muxer !== 'undefined') || (c.captureStream && reelMimeType())));
}

async function reelRecord(){
  const r = _reel; if(!r || r.recording) return;
  r.recording = true;
  const status = document.getElementById('reelStatus');
  document.getElementById('reelMakeBtn').disabled = true;
  document.getElementById('reelShareBtn').style.display = 'none';
  try{
    const codec = await reelEncoderCodec();
    if(codec) await reelEncodeMp4(r, codec, status);
    else await reelRecordScreen(r, status);
    status.textContent = r.ext === 'mp4' ? t('reel.done') : t('reel.doneWebm');
    document.getElementById('reelShareBtn').style.display = '';
  }catch(e){
    console.error('reel making failed', e);
    status.textContent = t('reel.failed');
  }finally{
    r.recording = false;
    document.getElementById('reelMakeBtn').disabled = false;
  }
}

// 1. Frame by frame through the video encoder into a proper MP4
async function reelEncodeMp4(r, codec, status){
  const ctx = r.canvas.getContext('2d');
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: REEL_W, height: REEL_H, frameRate: REEL_FPS },
    fastStart: 'in-memory'   // length and index at the START of the file — what Instagram wants
  });
  let failure = null;
  const us = 1e6 / REEL_FPS;
  // We stamp every frame's time ourselves (frame n = n/30 s) instead of
  // trusting the timing the encoder hands back: on iPhone (Safari) that timing
  // came out wrong and the reel played at double speed (fixed 30.10.2026).
  let outIndex = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta)=>{
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      muxer.addVideoChunkRaw(data, chunk.type, Math.round(outIndex * us), Math.round(us), meta);
      outIndex++;
    },
    error: e=>{ failure = e; }
  });
  encoder.configure({ codec, width: REEL_W, height: REEL_H, bitrate: 8000000, framerate: REEL_FPS, avc: { format: 'avc' } });
  const total = REEL_SECONDS * REEL_FPS;
  for(let i = 0; i < total; i++){
    if(failure) throw failure;
    reelDrawFrame(ctx, i / REEL_FPS);
    const frame = new VideoFrame(r.canvas, { timestamp: Math.round(i*us), duration: Math.round(us) });
    encoder.encode(frame, { keyFrame: i % (REEL_FPS*2) === 0 });
    frame.close();
    // don't run ahead of the encoder, and let the screen update now and then
    while(encoder.encodeQueueSize > 8) await new Promise(res=>setTimeout(res, 5));
    if(i % 10 === 0){
      status.textContent = t('reel.making', {p: Math.round(i/total*100)});
      await new Promise(res=>setTimeout(res, 0));
    }
  }
  await encoder.flush();
  if(failure) throw failure;
  encoder.close();
  muxer.finalize();
  r.blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  r.ext = 'mp4';
}

// 2. Fallback: play it and record the screen (real time)
async function reelRecordScreen(r, status){
  const mime = reelMimeType(); if(!mime) throw new Error('no recorder');
  const canvas = r.canvas, ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(REEL_FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
  const chunks = [];
  rec.ondataavailable = e=>{ if(e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res=>{ rec.onstop = res; });
  reelDrawFrame(ctx, 0);
  rec.start();
  const t0 = performance.now();
  await new Promise(res=>{
    const tick = (now)=>{
      const time = (now - t0)/1000;
      if(time >= REEL_SECONDS){ reelDrawFrame(ctx, REEL_SECONDS - 0.001); res(); return; }
      reelDrawFrame(ctx, time);
      status.textContent = t('reel.recording', {s: Math.max(0, Math.ceil(REEL_SECONDS - time))});
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise(res=>setTimeout(res, 150));
  rec.stop(); stream.getTracks().forEach(tr=>tr.stop());
  await done;
  r.blob = new Blob(chunks, { type: mime.split(';')[0] });
  r.ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
}

async function reelShare(){
  const r = _reel; if(!r || !r.blob) return;
  const name = (r.trip.title||'sail').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'sail';
  try{
    await shareOrDownloadFile(r.blob, `${name}-reel.${r.ext}`, r.blob.type, r.trip.title || 'Sail la Vie', 'reel.downloaded');
  }catch(e){
    if(!(e && e.name === 'AbortError')){ console.error('reel share failed', e); showToast(t('share.failed')); }
  }
}

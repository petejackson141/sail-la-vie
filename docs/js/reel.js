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
// the top ~200px of a reel, so everything important stays between those.
const REEL_FADE = 0.45;          // seconds of cross-fade between scenes
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
    renderReelPicker();
    status.textContent = reelCanRecord() ? t('reel.ready') : t('reel.cantRecord');
    document.getElementById('reelMakeBtn').disabled = !reelCanRecord();
  }catch(e){
    console.error('reel prepare failed', e);
    status.textContent = t('reel.failed');
  }
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
const REEL_MAP_PAD = { x: 140, top: 380, bottom: 560 }; // keep the track clear of the title and the numbers
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
    try{ await Promise.all(["700 80px 'Playfair Display'", "700 40px 'Space Grotesk'", "400 40px 'Libre Baskerville'"].map(f=>document.fonts.load(f))); }catch(e){}
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
  ctx.save();
  ctx.fillStyle = RC.navyDeep; ctx.fillRect(0, 0, REEL_W, REEL_H);
  // each scene fades in over REEL_FADE as the previous one is still showing
  r.scenes.forEach((s, i)=>{
    if(time < s.start - (i ? REEL_FADE : 0) || time > s.end + REEL_FADE) return;
    const fadeIn = i ? reelClamp((time - (s.start - REEL_FADE)) / REEL_FADE) : 1;
    if(fadeIn <= 0) return;
    ctx.save(); ctx.globalAlpha = fadeIn;
    const local = time - s.start, dur = s.end - s.start;
    if(s.kind === 'open') reelSceneOpen(ctx, r, local, dur);
    if(s.kind === 'main') reelSceneMain(ctx, r, local, dur);
    if(s.kind === 'end') reelSceneEnd(ctx, r, local, dur);
    ctx.restore();
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

// The three numbers under the map, counting up to their final values
function reelStats(ctx, trip, k, y){
  const items = [
    [fmtDistance((trip.distanceNm||0)*k), t('stat.distance')],
    [fmtDuration(Math.round((trip.elapsedSeconds||0)*k)), t('detail.duration')],
    [fmtSpeed((trip.avgSpeed||0)*Math.min(1, k*1.5)), t('stat.avgSpeed')]
  ];
  const colW = (REEL_W - 80)/3;
  items.forEach(([v, l], i)=>{
    const cx = 40 + colW*i + colW/2;
    reelText(ctx, v, cx, y, "700 58px 'Space Grotesk', sans-serif", RC.white);
    reelText(ctx, l.toUpperCase(), cx, y + 52, "700 26px 'Space Grotesk', sans-serif", RC.goldLight, 'center', 5);
    if(i) { ctx.fillStyle = 'rgba(201,162,75,.55)'; ctx.fillRect(40 + colW*i, y - 60, 2, 120); }
  });
}
// The background for the main scene: the map (faint), the uploaded map picture
// (faint), or plain navy — with the track drawn up to fraction k on top.
function reelBackground(ctx, a, k, tt, d){
  ctx.fillStyle = RC.navy; ctx.fillRect(0, 0, REEL_W, REEL_H);
  const z = 1.05 - 0.05*reelClamp(tt/d); // very slow zoom out over the whole scene
  ctx.save();
  ctx.translate(REEL_W/2, REEL_H/2); ctx.scale(z, z); ctx.translate(-REEL_W/2, -REEL_H/2);
  if(a.map) ctx.drawImage(a.map, 0, 0, REEL_W, REEL_H);
  else if(a.mapImage) reelDrawCover(ctx, a.mapImage, 0, 0, REEL_W, REEL_H, 1, 0, 0);
  // faint: a navy veil over the map so the photos and the track stand out
  if(a.map || a.mapImage){ ctx.fillStyle = 'rgba(14,35,56,0.55)'; ctx.fillRect(0, 0, REEL_W, REEL_H); }
  if(a.trackPx) reelTrack(ctx, a, k);
  ctx.restore();
}
// The track drawn up to fraction k of the sail (by time), with the boat at its tip
function reelTrack(ctx, a, k){
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
  line(16, 'rgba(14,35,56,.7)');
  line(8, RC.gold);
  ctx.beginPath(); ctx.arc(P[0].x, P[0].y, 14, 0, Math.PI*2); ctx.fillStyle = RC.start; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = RC.white; ctx.stroke();
  reelBoat(ctx, tip.x, tip.y, 1.3);
}
// One photo as a framed card in the middle of the screen: the whole photo is
// shown (never cropped), with a white border, gently growing while it's on.
function reelPhotoCard(ctx, img, p, alpha){
  if(!img || alpha <= 0) return;
  const maxW = 940, maxH = 1000, s0 = Math.min(maxW/img.width, maxH/img.height); // big (30.10.2026), between the title and the numbers
  const sc = s0 * (0.96 + 0.06*p);
  const w = img.width*sc, h = img.height*sc, cx = REEL_W/2, cy = 900;
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
  reelGradient(ctx, 0, 380, 0.75, 0);
  reelText(ctx, (trip.title||'').length > 30 ? trip.title.slice(0, 29)+'…' : (trip.title||''), REEL_W/2, 250, "700 58px 'Playfair Display', Georgia, serif", RC.white);
  reelText(ctx, reelDate(trip).toUpperCase(), REEL_W/2, 305, "700 26px 'Space Grotesk', sans-serif", RC.goldLight, 'center', 6);
  // photos one by one over the map, each fading in and out
  const ph = a.photos;
  if(ph.length){
    const lead = 0.6;                                   // a moment of just the map first
    const each = (d - lead) / ph.length, fade = 0.25;
    const lt = tt - lead;
    // each photo fades in at the start of its turn and out at the end — one at a time, no overlap
    ph.forEach((img, j)=>{
      const s0 = j*each, s1 = s0 + each;
      if(lt < s0 || lt > s1) return;
      const alpha = Math.min(reelClamp((lt - s0)/fade), reelClamp((s1 - lt)/fade));
      reelPhotoCard(ctx, img, reelClamp((lt - s0)/each), alpha);
    });
  }
  // the numbers along the bottom (above where Instagram puts its caption)
  reelGradient(ctx, 1300, 1680, 0, 0.75);
  reelStats(ctx, trip, k, 1530);
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
const REEL_CODECS = ['avc1.640032', 'avc1.4d0032', 'avc1.42e032', 'avc1.640028', 'avc1.4d0028', 'avc1.42e028'];
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
  const encoder = new VideoEncoder({
    output: (chunk, meta)=> muxer.addVideoChunk(chunk, meta),
    error: e=>{ failure = e; }
  });
  encoder.configure({ codec, width: REEL_W, height: REEL_H, bitrate: 8000000, framerate: REEL_FPS, avc: { format: 'avc' } });
  const total = REEL_SECONDS * REEL_FPS, us = 1e6 / REEL_FPS;
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

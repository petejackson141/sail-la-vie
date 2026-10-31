// ===== map-wind.js =====
// Animated wind on the saved-sail map (31.10.2026).
//
// What it shows: little streaks drifting across the map the way the wind was
// blowing during the sail, faster and longer in stronger wind. A badge in the
// corner gives the direction it came FROM and the speed (e.g. "NE 12 kn").
// During the replay both follow the replay's clock, hour by hour.
//
// Where the wind comes from: the sail's own "Weather on the water" report
// (sail-weather.js) — one Open-Meteo reading per hour along the track, already
// saved with the sail. Sails without a report use the departure weather typed
// in or filled at Cast Off. So this costs nothing extra: no new service, no
// new requests. It is one reading for the whole area at each hour (weather-
// model data, not a wind map), so every streak moves the same way, with a
// little random wobble so it looks like moving air rather than marching lines.
//
// Switched on/off in the map's style menu ("Wind"); remembered on this phone.

let mapWindOn = (()=>{ try{ return localStorage.getItem('mapWind') !== '0'; }catch(e){ return true; } })();

const WIND_COMPASS_DEG = { N:0, NE:45, E:90, SE:135, S:180, SW:225, W:270, NW:315 };

// [{t, kt, dir}] sorted by time, or null when the sail has no wind data.
// dir = degrees the wind blows FROM (0 = north), kt = knots.
function tripWindSeries(trip){
  const rep = trip && trip.weatherReport;
  if(rep && rep.status==='ready' && Array.isArray(rep.samples)){
    const s = rep.samples.filter(x=>x && x.wind!=null && x.dir!=null && isFinite(x.t))
      .map(x=>({ t:x.t, kt:Number(x.wind)||0, dir:Number(x.dir)||0 }))
      .sort((a,b)=>a.t-b.t);
    if(s.length) return s;
  }
  const w = trip && trip.weather;
  if(w && w.windSpeed!=null && w.windSpeed!=='' && WIND_COMPASS_DEG[w.windDir]!=null){
    return [{ t: new Date(trip.date).getTime() || 0, kt: Number(w.windSpeed)||0, dir: WIND_COMPASS_DEG[w.windDir] }];
  }
  return null;
}
// The wind at clock time ms, blended between the hourly readings either side
// (the direction takes the short way round, so 350° → 10° passes through north).
function windAt(series, ms){
  if(!series || !series.length) return null;
  if(ms <= series[0].t) return series[0];
  const last = series[series.length-1];
  if(ms >= last.t) return last;
  let i = 0; while(i < series.length-2 && series[i+1].t <= ms) i++;
  const a = series[i], b = series[i+1], k = (ms - a.t)/((b.t - a.t) || 1);
  const dd = ((b.dir - a.dir + 540) % 360) - 180;
  return { t: ms, kt: a.kt + (b.kt - a.kt)*k, dir: (a.dir + dd*k + 360) % 360 };
}

class MapWind {
  constructor(map, series, badgeId){
    this.map = map; this.series = series; this.badgeId = badgeId;
    this.wind = series[0]; this.parts = []; this.raf = null; this.dead = false;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-wind-canvas';
    // just above the map picture, below the boat and the dots (markers come later in the DOM)
    const mc = map.getCanvas();
    mc.parentNode.insertBefore(this.canvas, mc.nextSibling);
    this.ctx = this.canvas.getContext('2d');
    this.onResize = ()=> this.resize();
    map.on('resize', this.onResize);
    this.onVis = ()=>{ if(document.hidden) this.stop(); else this.start(); };
    document.addEventListener('visibilitychange', this.onVis);
    this.resize();
    this.apply();
  }
  resize(){
    const c = this.map.getContainer();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    this.dpr = dpr;
    this.w = c.clientWidth; this.h = c.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.w*dpr)); this.canvas.height = Math.max(1, Math.round(this.h*dpr));
    this.canvas.style.width = this.w+'px'; this.canvas.style.height = this.h+'px';
    // about one streak per 2,200 px² of map, at most 380
    const n = Math.min(380, Math.round(this.w*this.h/2200));
    this.parts = Array.from({length:n}, ()=>this.spawn(true));
  }
  spawn(anyAge){
    return { x: Math.random()*this.w, y: Math.random()*this.h,
             age: anyAge ? Math.floor(Math.random()*120) : 0, life: 70 + Math.floor(Math.random()*90),
             sp: 0.85 + Math.random()*0.3, wob: (Math.random()-0.5)*0.2 };
  }
  setTime(ms){
    const w = windAt(this.series, ms); if(!w) return;
    this.wind = w; this.badge();
  }
  // switched on/off (menu) — show or hide everything
  apply(){
    const on = mapWindOn && !this.dead;
    this.canvas.style.display = on ? '' : 'none';
    this.badge();
    if(on) this.start(); else this.stop();
  }
  badge(){
    const el = document.getElementById(this.badgeId); if(!el) return;
    if(!mapWindOn || this.dead || !this.wind){ el.style.display = 'none'; return; }
    const w = this.wind, to = (w.dir + 180) % 360;
    const dir = (typeof degToCompass8==='function') ? compassLabel(degToCompass8(w.dir)) : Math.round(w.dir)+'°';
    const spd = (typeof wxSpd==='function') ? wxSpd(w.kt) : Math.round(w.kt)+' kn';
    el.style.display = 'flex';
    el.innerHTML = `<svg viewBox="0 0 24 24" style="transform:rotate(${to.toFixed(0)}deg)"><path d="M12 3l5 9h-3.5v9h-3v-9H7z" fill="currentColor"/></svg><span>${escapeHtml(dir)} ${escapeHtml(spd)}</span>`;
  }
  start(){
    if(this.raf || this.dead || !mapWindOn || document.hidden) return;
    const tick = ()=>{
      if(this.dead) return;
      this.raf = requestAnimationFrame(tick);
      if(!this.canvas.isConnected){ this.destroy(); return; }
      if(!this.canvas.offsetParent) return;           // screen not showing — skip drawing
      this.frame();
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop(){ if(this.raf) cancelAnimationFrame(this.raf); this.raf = null; }
  frame(){
    const ctx = this.ctx, dpr = this.dpr, w = this.wind;
    // fade what's there a little each frame — that leaves the trails
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
    if(!w) return;
    // the wind blows FROM w.dir, so the streaks move TOWARDS w.dir + 180
    const to = (w.dir + 180) * Math.PI/180;
    const base = (0.5 + Math.min(w.kt, 40)*0.11);   // px per frame: gentle in light air, brisk in 25 kn+
    const night = this.map._appliedPreset === 'night' || this.map._appliedPreset === 'dusk' || (typeof currentMapStyle!=='undefined' && currentMapStyle==='dark');
    ctx.strokeStyle = night ? 'rgba(255,255,255,0.75)' : 'rgba(22,50,79,0.5)';
    ctx.lineWidth = 1.5*dpr; ctx.lineCap = 'round';
    ctx.beginPath();
    for(const p of this.parts){
      const a = to + p.wob, v = base*p.sp;
      const nx = p.x + Math.sin(a)*v, ny = p.y - Math.cos(a)*v;
      if(p.age > 0){ ctx.moveTo(p.x*dpr, p.y*dpr); ctx.lineTo(nx*dpr, ny*dpr); }
      p.x = nx; p.y = ny; p.age++;
      if(p.age > p.life || nx < -5 || ny < -5 || nx > this.w+5 || ny > this.h+5) Object.assign(p, this.spawn(false));
    }
    ctx.stroke();
  }
  destroy(){
    if(this.dead) return;
    this.dead = true; this.stop();
    try{ this.map.off('resize', this.onResize); }catch(e){}
    document.removeEventListener('visibilitychange', this.onVis);
    if(this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    const el = document.getElementById(this.badgeId); if(el) el.style.display = 'none';
  }
}

// Wind on/off from the map's style menu
function toggleMapWind(){
  mapWindOn = !mapWindOn;
  try{ localStorage.setItem('mapWind', mapWindOn ? '1' : '0'); }catch(e){}
  if(typeof detailReplay!=='undefined' && detailReplay && detailReplay.wind) detailReplay.wind.apply();
  const m = document.getElementById('detailMapStyleMenu');
  if(m && m.classList.contains('open')) renderMapStyleMenu('detail');
}

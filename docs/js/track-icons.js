// ===== track-icons.js =====
// Choice of icon for the boat on the maps (31.10.2026), picked under the map's
// Settings button. The choice is remembered on this phone and used on every
// map: the live recording map, a saved sail's replay and "Everywhere I've sailed".
//
// Two kinds of icon:
//   • "side" (sailboat, motorboat, windsurfer) — drawn side-on facing right; flipped to
//     face left when heading west, so it's never upside down.
//   • "turn" (arrow, kayak) — drawn from above pointing up (north);
//     turned to point exactly where the boat is going.
// All drawn in the same style as the original sailboat: thick dark outline,
// coral and cream.
//
// The icon also sets the GPS jump filter while recording (journey.js): a fix
// implying more than maxKt is treated as a GPS glitch. 30 kt suits sailing
// and paddling; a motorboat or a windsurfer can genuinely go faster, so 60 kt.

const TI_INK = '#1E1E1E', TI_CORAL = '#EF5A63', TI_CREAM = '#F6E3C9';
const tiSvg = body => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`);

const TRACK_ICONS = {
  arrow: { label:'icon.arrow', kind:'turn', scale:0.6, maxKt:30,
    src: tiSvg(`<path d="M32 5 L54 58 L32 46 L10 58 Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>
                <path d="M32 5 L54 58 L32 46 L10 58 Z" fill="${TI_CORAL}" stroke="${TI_INK}" stroke-width="3" stroke-linejoin="round"/>`) },
  sail:  { label:'icon.sail', kind:'side', scale:1, maxKt:30,
    src: (typeof YACHT_ICON_DATA_URL!=='undefined') ? YACHT_ICON_DATA_URL : '' },
  motor: { label:'icon.motor', kind:'side', scale:0.85, maxKt:60,
    src: tiSvg(`<path d="M4 40 H49 L61 33 L55 49 H11 Z" fill="${TI_CREAM}" stroke="${TI_INK}" stroke-width="3" stroke-linejoin="round"/>
                <path d="M15 40 L20 27 H37 L46 40 Z" fill="${TI_CORAL}" stroke="${TI_INK}" stroke-width="3" stroke-linejoin="round"/>
                <path d="M23 30.5 H35 L39.5 37 H21 Z" fill="#BFE3EE" stroke="${TI_INK}" stroke-width="2" stroke-linejoin="round"/>
                <path d="M8 44.5 H55" stroke="${TI_CORAL}" stroke-width="2.5" stroke-linecap="round"/>`) },
  kayak: { label:'icon.kayak', kind:'turn', scale:0.85, maxKt:30,
    src: tiSvg(`<path d="M13 23 L51 43" stroke="${TI_INK}" stroke-width="3" stroke-linecap="round"/>
                <ellipse cx="11" cy="22" rx="3.5" ry="6.5" transform="rotate(-62 11 22)" fill="${TI_CREAM}" stroke="${TI_INK}" stroke-width="2"/>
                <ellipse cx="53" cy="44" rx="3.5" ry="6.5" transform="rotate(-62 53 44)" fill="${TI_CREAM}" stroke="${TI_INK}" stroke-width="2"/>
                <path d="M32 2 C41 16 41 48 32 62 C23 48 23 16 32 2 Z" fill="${TI_CORAL}" stroke="${TI_INK}" stroke-width="3" stroke-linejoin="round"/>
                <ellipse cx="32" cy="34" rx="4.5" ry="8" fill="${TI_INK}"/>`) },
  // windsurfer (31.10.2026, replaced the plain surfboard): side-on, facing right —
  // mast at the front, sail swept back, sailor holding the boom
  windsurf: { label:'icon.windsurf', kind:'side', scale:0.9, maxKt:60,
    src: tiSvg(`<path d="M5 51 H54 L61 47.5 L57 56 H9 Z" fill="${TI_CREAM}" stroke="${TI_INK}" stroke-width="3" stroke-linejoin="round"/>
                <path d="M37 50 L34 5 Q13 20 15 42 Z" fill="${TI_CORAL}" stroke="${TI_INK}" stroke-width="3" stroke-linejoin="round"/>
                <path d="M34 30 L17 35" stroke="${TI_INK}" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="21" cy="20" r="3.6" fill="${TI_INK}"/>
                <path d="M21 24 L23.5 39 M23.5 39 L19 50 M23.5 39 L28 50 M21.5 28 L31 31" stroke="${TI_INK}" stroke-width="3" stroke-linecap="round" fill="none"/>`) }
};
// Default: the arrow. New phones start on it; the choice is kept after that.
let currentTrackIcon = (()=>{ try{ return localStorage.getItem('trackIconV1'); }catch(e){ return null; } })() || 'arrow';
if(currentTrackIcon === 'surf') currentTrackIcon = 'windsurf'; // the surfboard became the windsurfer (31.10.2026)
if(!TRACK_ICONS[currentTrackIcon]) currentTrackIcon = 'arrow';

// GPS jump filter ceiling for the chosen icon (used by journey.js)
function maxPlausibleSpeedKt(){ return (TRACK_ICONS[currentTrackIcon] || TRACK_ICONS.arrow).maxKt; }

// Every icon element on a map, so a new choice can be shown on them straight away
const trackIconEls = new Set();

// The marker element for a map. `size` = how big the sailboat is drawn; the
// other icons are drawn a little smaller (their own `scale`) so they look balanced.
function trackIconEl(size){
  size = size || 68;
  const el = document.createElement('div');
  el.className = 'yacht-marker-icon';
  el._tiSize = size; el._tiHeading = 90;   // facing east until the first move
  el.appendChild(document.createElement('div')).className = 'track-icon-inner';
  trackIconEls.add(el);
  trackIconPaint(el);
  return el;
}
function trackIconPaint(el){
  const ic = TRACK_ICONS[currentTrackIcon] || TRACK_ICONS.arrow;
  const px = Math.round(el._tiSize * ic.scale);
  el.style.width = el.style.height = px + 'px';
  const inner = el.firstChild;
  inner.style.cssText = `width:${px}px;height:${px}px;transition:transform .35s ease;`;
  inner.innerHTML = `<img src="${ic.src}" width="${px}" height="${px}" alt="" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));">`;
  trackIconTurn(el, el._tiHeading, true);
}
// Points the icon along `deg` (compass degrees, 0 = north, 90 = east)
function trackIconTurn(el, deg, force){
  if(!el || deg==null || isNaN(deg)) return;
  deg = ((deg % 360) + 360) % 360;
  if(!force && Math.abs(((deg - el._tiHeading + 540) % 360) - 180) < 2) return; // tiny change: leave it
  el._tiHeading = deg;
  const ic = TRACK_ICONS[currentTrackIcon] || TRACK_ICONS.arrow;
  const inner = el.firstChild;
  if(ic.kind === 'turn') inner.style.transform = `rotate(${deg.toFixed(0)}deg)`;
  else inner.style.transform = deg > 180 ? 'scaleX(-1)' : 'none';   // side-on: face left when heading west
}
// Heading from point a to point b, both [lng, lat]; null if they're the same spot
function trackIconBearing(a, b){
  if(!a || !b || (a[0]===b[0] && a[1]===b[1])) return null;
  const r = Math.PI/180, la1 = a[1]*r, la2 = b[1]*r, dl = (b[0]-a[0])*r;
  const y = Math.sin(dl)*Math.cos(la2), x = Math.cos(la1)*Math.sin(la2) - Math.sin(la1)*Math.cos(la2)*Math.cos(dl);
  return (Math.atan2(y, x)/r + 360) % 360;
}

function selectTrackIcon(id){
  if(!TRACK_ICONS[id]) return;
  currentTrackIcon = id;
  try{ localStorage.setItem('trackIconV1', id); }catch(e){}
  trackIconEls.forEach(el=>{ if(el.isConnected) trackIconPaint(el); else trackIconEls.delete(el); });
  ['live','detail'].forEach(w=>{ const m = document.getElementById(w+'MapStyleMenu'); if(m && m.classList.contains('open')) renderMapStyleMenu(w); });
}
// The icon choices, for the bottom of the map's Settings menu
function trackIconMenuHtml(){
  return `<div class="map-style-sep"></div><div class="map-menu-head">${t('map.icon')}</div><div class="track-icon-grid">`
    + Object.keys(TRACK_ICONS).map(id=>`<div class="track-icon-opt${id===currentTrackIcon?' active':''}" onclick="selectTrackIcon('${id}')" title="${t(TRACK_ICONS[id].label)}">
        <img src="${TRACK_ICONS[id].src}" alt=""><span>${t(TRACK_ICONS[id].label)}</span></div>`).join('')
    + `</div>`;
}

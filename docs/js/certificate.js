// ===== certificate.js =====
// "Certificate of Sea Time" — a formal A4 LANDSCAPE PDF built from the
// Sailing Resume screen's selected date range (All Time / This Year /
// Last 30 Days / Custom).
//
// How it works (same pipeline as the trip PDF export in pdf-export.js):
//   1. buildCertificateHtml(data) lays the certificate out as plain HTML at a
//      fixed 1123 x 794 px — exactly A4 landscape at 96dpi (297 x 210 mm).
//   2. A scaled-down copy of that same HTML is shown in the sheet as a preview.
//   3. On "Save / Share PDF", html2canvas rasterizes it at 2.5x and jsPDF drops
//      the image onto one A4 landscape page, edge to edge, then it's handed to
//      shareOrDownloadFile() (native share sheet in the app, download/share on web).
//
// Everything decorative (frame, contour-line watermark, wave border, seal) is
// inline SVG generated here, so there are no extra image files to load and
// html2canvas renders it reliably. The only image is images/Logo.png.
//
// Colours are the app's Nautical theme palette (navy / gold / teal / coral on
// ivory), fonts are the ones already loaded in index.html (Playfair Display,
// Libre Baskerville, Space Grotesk, Inter).

const CERT_W = 1123, CERT_H = 794; // A4 landscape in CSS px (96dpi)
const CERT_COLORS = {
  navy:'#16324F', navyDeep:'#0E2338', gold:'#C9A24B', goldDeep:'#A8843A', goldLight:'#E3C888',
  teal:'#17758F', coral:'#DE4457', ivory:'#FBF8F1', ink:'#142B44', muted:'#5C7A8F'
};

/* ---------- small deterministic helpers ---------- */

// Tiny seeded PRNG so the contour watermark is identical every time (and in the
// preview vs. the exported PDF) — Math.random() would redraw it differently.
function certRng(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Simple string hash (FNV-1a) — used for the certificate number.
function certHash(str){
  let h = 0x811c9dc5;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// Certificate number, e.g. "SLV-2026-7K3Q-M9F2". Derived from the holder's name,
// the date range and the figures, so the same record always gets the same number,
// and any change to the underlying sails produces a different one.
function certNumber(d){
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid misreading
  const enc = n => { let s=''; for(let i=0;i<4;i++){ s += A[n % 32]; n = Math.floor(n/32); } return s; };
  const base = [d.name, d.fromISO, d.toISO, d.count, d.nm.toFixed(2), d.secs].join('|');
  return `SLV-${new Date(d.issuedISO).getFullYear()}-${enc(certHash(base))}-${enc(certHash(base+'#sea'))}`;
}
// Dates on the certificate are written out in full ("26 September 2026") —
// far more formal than 26/09/2026, and unambiguous across countries.
// English uses en-GB here ("26 September 2026") — the day-month-year order
// reads as the formal one on a certificate; other languages keep their locale.
function certLocale(){ return currentLang==='he' ? 'he-IL' : currentLang==='en' ? 'en-GB' : currentLocale(); }
function certDate(iso){
  return new Date(iso).toLocaleDateString(certLocale(), { day:'numeric', month:'long', year:'numeric' });
}

/* ---------- decorative SVG pieces ---------- */

// Faint depth-contour lines (same idea as the app's background texture):
// a few "shoals", each drawn as nested wobbly closed loops, smoothed with
// Catmull-Rom -> cubic Bezier so they read as real chart contours.
function certContourSvg(w, h){
  const rnd = certRng(20260926);
  const shoals = [
    {cx:w*0.12, cy:h*0.20, r:70,  n:8},
    {cx:w*0.92, cy:h*0.82, r:80,  n:9},
    {cx:w*0.86, cy:h*0.10, r:40,  n:5},
    {cx:w*0.06, cy:h*0.92, r:45,  n:6},
    {cx:w*0.50, cy:h*0.52, r:120, n:4}
  ];
  let paths = '';
  shoals.forEach(s=>{
    const ph = [rnd()*6.28, rnd()*6.28, rnd()*6.28], amp = [0.16, 0.09, 0.05];
    const stretch = 0.75 + rnd()*0.5;
    for(let k=0;k<s.n;k++){
      const R = s.r + k*26;
      const pts = [];
      for(let i=0;i<64;i++){
        const a = i/64*Math.PI*2;
        const wob = 1 + amp[0]*Math.sin(2*a+ph[0]+k*0.12) + amp[1]*Math.sin(3*a+ph[1]-k*0.08) + amp[2]*Math.sin(5*a+ph[2]);
        pts.push([s.cx + Math.cos(a)*R*wob*1.35, s.cy + Math.sin(a)*R*wob*stretch]);
      }
      let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
      for(let i=0;i<pts.length;i++){
        const p0=pts[(i-1+64)%64], p1=pts[i], p2=pts[(i+1)%64], p3=pts[(i+2)%64];
        const c1=[p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6], c2=[p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6];
        d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      // every 4th contour slightly stronger, like the index lines on a chart
      paths += `<path d="${d}Z" fill="none" stroke="${CERT_COLORS.teal}" stroke-width="${k%4===0?1.1:0.7}" stroke-opacity="${k%4===0?0.16:0.10}"/>`;
    }
  });
  return `<svg class="cert-contours" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${paths}</svg>`;
}

// The frame: navy outer band carrying fine gold "guilloche" waves (the
// interlaced-line pattern used on banknotes/official certificates), a gold
// hairline double rule inside it, and a small compass-star in each corner.
function certFrameSvg(w, h){
  const C = CERT_COLORS, o = 16, band = 22;         // outer inset, band width
  const inner = o + band;                          // where the band ends
  // One wavy line running around the whole band. Travelling along a closed
  // rectangle (perimeter parameter) keeps the pattern continuous at corners.
  const wave = (phase, amp, period) => {
    const mid = o + band/2, W = w - 2*mid, H = h - 2*mid, P = 2*(W+H);
    let d = '';
    const steps = Math.round(P/3);
    for(let i=0;i<=steps;i++){
      const s = i/steps*P, off = amp*Math.sin(s/period*Math.PI*2 + phase);
      let x, y;
      if(s < W){ x = mid+s; y = mid+off; }
      else if(s < W+H){ x = w-mid-off; y = mid+(s-W); }
      else if(s < 2*W+H){ x = w-mid-(s-W-H); y = h-mid-off; }
      else { x = mid+off; y = h-mid-(s-2*W-H); }
      d += (i?'L':'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    return d;
  };
  let waves = '';
  [[0,7,26],[Math.PI,7,26],[Math.PI/2,4,13],[Math.PI*1.5,4,13]].forEach(([p,a,per],i)=>{
    waves += `<path d="${wave(p,a,per)}" fill="none" stroke="${i<2?C.gold:C.goldLight}" stroke-width="${i<2?0.8:0.5}" stroke-opacity="${i<2?0.75:0.5}"/>`;
  });
  const star = (cx, cy, r) => {
    let pts = '';
    for(let i=0;i<16;i++){ const a = i/16*Math.PI*2 - Math.PI/2, rr = i%4===0 ? r : i%2===0 ? r*0.55 : r*0.28; pts += `${(cx+Math.cos(a)*rr).toFixed(1)},${(cy+Math.sin(a)*rr).toFixed(1)} `; }
    return `<rect x="${cx-band/2-3}" y="${cy-band/2-3}" width="${band+6}" height="${band+6}" fill="${C.navyDeep}" stroke="${C.gold}" stroke-width="1"/>
      <polygon points="${pts}" fill="${C.gold}"/><circle cx="${cx}" cy="${cy}" r="1.6" fill="${C.navyDeep}"/>`;
  };
  const m = o + band/2;
  return `<svg class="cert-frame" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="M${o},${o}H${w-o}V${h-o}H${o}Z M${inner},${inner}V${h-inner}H${w-inner}V${inner}Z" fill="${C.navy}" fill-rule="evenodd"/>
    ${waves}
    <rect x="${o+0.5}" y="${o+0.5}" width="${w-2*o-1}" height="${h-2*o-1}" fill="none" stroke="${C.gold}" stroke-width="1"/>
    <rect x="${inner+6}" y="${inner+6}" width="${w-2*inner-12}" height="${h-2*inner-12}" fill="none" stroke="${C.gold}" stroke-width="1.6"/>
    <rect x="${inner+11}" y="${inner+11}" width="${w-2*inner-22}" height="${h-2*inner-22}" fill="none" stroke="${C.gold}" stroke-width="0.6"/>
    ${star(m,m,11)}${star(w-m,m,11)}${star(m,h-m,11)}${star(w-m,h-m,11)}
  </svg>`;
}

// Gold rosette seal with the anchor and the record's year. Text is set with
// Georgia (a system serif) because SVG text rasterized by html2canvas can't
// use the page's web fonts.
function certSealSvg(size, yearLabel){
  const C = CERT_COLORS, r = size/2;
  let scallop = '';
  const N = 56;
  for(let i=0;i<N*2;i++){ const a = i/(N*2)*Math.PI*2, rr = i%2 ? r-1 : r-6; scallop += `${(r+Math.cos(a)*rr).toFixed(2)},${(r+Math.sin(a)*rr).toFixed(2)} `; }
  const tr = r-22; // radius the ring text runs along
  // ticks round the inner ring
  let ticks = '';
  for(let i=0;i<72;i++){ const a=i/72*Math.PI*2, r1=r-35, r2=r-(i%6===0?40:37.5); ticks += `<line x1="${(r+Math.cos(a)*r1).toFixed(1)}" y1="${(r+Math.sin(a)*r1).toFixed(1)}" x2="${(r+Math.cos(a)*r2).toFixed(1)}" y2="${(r+Math.sin(a)*r2).toFixed(1)}" stroke="${C.goldLight}" stroke-width="0.8"/>`; }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="certSealGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#E6CC8C"/><stop offset=".45" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/>
      </linearGradient>
      <path id="certSealTop" d="M${r-tr},${r} A${tr},${tr} 0 0 1 ${r+tr},${r}"/>
      <path id="certSealBot" d="M${r-tr},${r} A${tr},${tr} 0 0 0 ${r+tr},${r}"/>
    </defs>
    <polygon points="${scallop}" fill="url(#certSealGold)"/>
    <circle cx="${r}" cy="${r}" r="${r-10}" fill="none" stroke="#FFF6DD" stroke-width="0.9" stroke-opacity=".8"/>
    <circle cx="${r}" cy="${r}" r="${r-33}" fill="${C.navy}"/>
    <circle cx="${r}" cy="${r}" r="${r-33}" fill="none" stroke="${C.goldLight}" stroke-width="1"/>
    ${ticks}
    <text font-family="Georgia,'Times New Roman',serif" font-size="10.5" font-weight="700" letter-spacing="2.4" fill="${C.navyDeep}" text-anchor="middle"><textPath href="#certSealTop" startOffset="50%">SAIL LA VIE LOGBOOK</textPath></text>
    <text font-family="Georgia,'Times New Roman',serif" font-size="10.5" font-weight="700" letter-spacing="2.4" fill="${C.navyDeep}" text-anchor="middle" dy="8"><textPath href="#certSealBot" startOffset="50%">SEA TIME RECORD</textPath></text>
    <text x="${r-tr-2}" y="${r+3.5}" font-family="Georgia,serif" font-size="9" fill="${C.navyDeep}" text-anchor="middle">★</text>
    <text x="${r+tr+2}" y="${r+3.5}" font-family="Georgia,serif" font-size="9" fill="${C.navyDeep}" text-anchor="middle">★</text>
    <g transform="translate(${r-15} ${r-24}) scale(1.5)" fill="none" stroke="${C.gold}" stroke-width="1.5" stroke-linecap="round">
      <circle cx="10" cy="3.2" r="2"/><line x1="10" y1="5.2" x2="10" y2="18"/><line x1="5.5" y1="8.5" x2="14.5" y2="8.5"/>
      <path d="M3.5 12.5a6.8 6.8 0 0 0 6.5 5.5 6.8 6.8 0 0 0 6.5-5.5"/><path d="M2 13.8l1.5-1.8 1.9 1.3M18 13.8l-1.5-1.8-1.9 1.3"/>
    </g>
    <text x="${r}" y="${r+30}" font-family="Georgia,serif" font-size="12" font-weight="700" letter-spacing="1.5" fill="${C.goldLight}" text-anchor="middle">${yearLabel}</text>
  </svg>`;
}

/* ---------- data ---------- */

// Gathers every figure the certificate shows for the trips in the Resume's
// current range. Loads the full trip records only to learn which sails were
// GPS-tracked vs. manually logged (the lightweight tripIndex doesn't carry
// isManual) — that split is printed in the footer for transparency.
async function collectCertificateData(trips){
  const sorted = trips.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
  const nm = trips.reduce((s,tr)=>s+(tr.distanceNm||0),0);
  const secs = trips.reduce((s,tr)=>s+(tr.elapsedSeconds||0),0);
  const days = new Set(trips.map(tr=>{ const d=new Date(tr.date); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })).size;
  const longestNm = trips.reduce((m,tr)=>Math.max(m, tr.distanceNm||0), 0);
  const boatNames = [...new Set(trips.map(tr=>tr.boatId).filter(Boolean)
    .map(id=>(state.boats.find(b=>b.id===id)||{}).name).filter(Boolean))];
  let manual = 0;
  for(const tr of trips){
    try{ const full = await storeGet('trip:'+tr.id); if(full && full.isManual) manual++; }catch(e){}
  }
  return {
    count: trips.length, nm, secs, days, longestNm, boatNames,
    tracked: trips.length - manual, manual,
    fromISO: sorted.length ? sorted[0].date : new Date().toISOString(),
    toISO: sorted.length ? sorted[sorted.length-1].date : new Date().toISOString(),
    issuedISO: new Date().toISOString()
  };
}

/* ---------- layout ---------- */

// Big-number + small-unit formatting for the stat row, respecting the user's
// unit system (canonical data is always NM; converted only here, at display).
function certDistanceParts(nm){
  const sys = appUnitSystem();
  const v = sys==='metric' ? nm*NM_TO_KM : nm;
  return { value: v.toLocaleString(certLocale(), {minimumFractionDigits:1, maximumFractionDigits:1}), unit: distUnitLabel(sys) };
}
function certDurationParts(secs){
  const h = Math.floor((secs||0)/3600), m = Math.floor(((secs||0)%3600)/60);
  return { value: `${h.toLocaleString(certLocale())}<small>${t('unit.hourAbbr')}</small> ${m}<small>${t('unit.minAbbr')}</small>` };
}

function buildCertificateHtml(d){
  const C = CERT_COLORS;
  const rtl = currentLang==='he';
  const sameDay = new Date(d.fromISO).toDateString()===new Date(d.toISO).toDateString();
  const period = sameDay
    ? t('cert.onDate', {date:`<b>${certDate(d.fromISO)}</b>`})
    : t('cert.betweenDates', {from:`<b>${certDate(d.fromISO)}</b>`, to:`<b>${certDate(d.toISO)}</b>`});
  const dist = certDistanceParts(d.nm), longest = certDistanceParts(d.longestNm), dur = certDurationParts(d.secs);
  // Vessels line: up to 4 names, then "+N" so a big fleet never wraps into the stats.
  const shownBoats = d.boatNames.slice(0,4).map(escapeHtml).join(' · ') + (d.boatNames.length>4 ? ` · +${d.boatNames.length-4}` : '');
  const boats = d.boatNames.length
    ? `<div class="cert-vessels">${t('cert.vessels')}: <span>${shownBoats}</span></div>` : '';
  const fy = new Date(d.fromISO).getFullYear(), ty = new Date(d.toISO).getFullYear();
  const yearLabel = fy===ty ? String(ty) : `${fy}–${String(ty).slice(-2)}`;
  const stat = (value, unit, label) =>
    `<div class="cert-stat"><div class="cert-stat-v">${value}${unit?`<small>${unit}</small>`:''}</div><div class="cert-stat-l">${label}</div></div>`;

  return `<div class="cert-a4" id="certA4" dir="${rtl?'rtl':'ltr'}" style="width:${CERT_W}px;height:${CERT_H}px;">
    ${certContourSvg(CERT_W, CERT_H)}
    ${certFrameSvg(CERT_W, CERT_H)}
    <div class="cert-body">
      <div class="cert-head">
        <img class="cert-logo" src="images/Logo.png" alt="">
        <div class="cert-brand">SAIL LA VIE</div>
        <div class="cert-brand-sub">${t('cert.brandSub')}</div>
      </div>

      <h1 class="cert-title${d.title.length>34?' cert-title-long':''}">${escapeHtml(d.title)}</h1>
      <div class="cert-rule"><span></span>${pdfAnchorSvgSized(18, C.gold, 1.3)}<span></span></div>

      <div class="cert-certifies">${t('cert.certifiesThat')}</div>
      <div class="cert-name${d.name.length>26?' cert-name-long':''}">${escapeHtml(d.name)}</div>
      <div class="cert-period">${period}</div>
      ${boats}

      <div class="cert-stats">
        ${stat(d.count.toLocaleString(certLocale()), '', t('cert.voyages'))}
        ${stat(dist.value, dist.unit, t('cert.distance'))}
        ${stat(dur.value, '', t('resume.timeAtSea'))}
        ${stat(d.days.toLocaleString(certLocale()), '', t('cert.daysAtSea'))}
        ${stat(longest.value, longest.unit, t('cert.longest'))}
      </div>

      <div class="cert-seal-row">
        <div class="cert-seal">${certSealSvg(150, yearLabel)}</div>
      </div>
    </div>

    <div class="cert-foot">
      <div class="cert-foot-l"><span>${t('cert.certNo')}</span> <b dir="ltr">${d.number}</b></div>
      <div class="cert-foot-c">${t('cert.compiledFrom', {tracked:d.tracked, manual:d.manual})}</div>
      <div class="cert-foot-r"><span>${t('cert.issued')}</span> <b>${certDate(d.issuedISO)}</b></div>
    </div>
  </div>`;
}

/* ---------- sheet / preview / export ---------- */

let _certData = null;

function openCertificateSheet(){
  if(featureComingSoon('certificate')) return;
  if(!tripsInRange().length){ showToast(t('cert.noSails')); return; }
  document.getElementById('certName').value = state.profile.name || '';
  document.getElementById('certTitle').value = '';
  document.getElementById('certTitle').placeholder = t('cert.defaultTitle');
  document.getElementById('certificateOutput').innerHTML = '';
  document.getElementById('certActions').style.display = 'none';
  openSheet('sheetCertificate');
}

// Builds the certificate and shows a true-proportion, scaled-down preview
// (the same 1123x794 layout the PDF is captured from, just shrunk to fit).
async function renderCertificate(){
  const trips = tripsInRange();
  if(!trips.length){ showToast(t('cert.noSails')); return; }
  const d = await collectCertificateData(trips);
  d.title = document.getElementById('certTitle').value.trim() || t('cert.defaultTitle');
  d.name = document.getElementById('certName').value.trim() || state.profile.name || t('default.sailorName');
  d.number = certNumber(d);
  _certData = d;

  const out = document.getElementById('certificateOutput');
  out.innerHTML = `<div class="cert-preview-wrap"><div class="cert-preview-scale">${buildCertificateHtml(d)}</div></div>`;
  const wrap = out.querySelector('.cert-preview-wrap'), scaler = out.querySelector('.cert-preview-scale');
  const fit = ()=>{ const s = wrap.clientWidth / CERT_W; scaler.style.transform = `scale(${s})`; wrap.style.height = (CERT_H*s)+'px'; };
  fit(); requestAnimationFrame(fit);
  document.getElementById('certActions').style.display = 'block';
}

// Rasterizes the certificate off-screen at full size and saves it as a
// one-page A4 landscape PDF.
async function saveCertificatePdf(){
  if(!_certData) return;
  if(typeof window.jspdf==='undefined' || typeof html2canvas==='undefined'){
    showToast(t('toast.pdfNeedsConnection')); return;
  }
  showToast(t('cert.preparing'));
  // Render a fresh full-size copy off-screen (not the scaled preview), so
  // html2canvas captures it at its true 1123x794 layout.
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-${CERT_W+200}px;top:0;width:${CERT_W}px;height:${CERT_H}px;overflow:hidden;z-index:-1;`;
  host.innerHTML = buildCertificateHtml(_certData);
  document.body.appendChild(host);
  try{
    const node = host.firstElementChild;
    await waitForImagesToLoad(node);
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const canvas = await html2canvas(node, {
      scale: 2.5, useCORS: true, backgroundColor: CERT_COLORS.ivory, logging: false,
      width: CERT_W, height: CERT_H, windowWidth: CERT_W, scrollX: 0, scrollY: 0
    });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'a4', compress:true });
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
    doc.setProperties({ title: `${_certData.title} — ${_certData.name}`, subject: _certData.number, creator: 'Sail la Vie' });
    const safe = (_certData.name||'Sailor').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'') || 'Sailor';
    await shareOrDownloadFile(doc.output('blob'), `SeaTime_Certificate_${safe}.pdf`, 'application/pdf', _certData.title, 'cert.downloaded');
  }catch(e){
    console.error('Certificate PDF failed', e);
    showToast(t('cert.failed'));
  }finally{
    host.remove();
  }
}

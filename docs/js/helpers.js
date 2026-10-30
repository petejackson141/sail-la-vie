// ===== helpers.js =====
// Small shared helpers used across the app (was the first half of the old
// pdf-export.js, split 30.10.2026):
//   - icons and drawing bits the trip PDF (js/trip-pdf.js) and certificate use
//   - shareOrDownloadFile(): share a file on the phone, or download it on a computer
//   - escapeHtml(): makes text safe to put inside the page
// The photo viewer that used to live here is now js/photo-viewer.js.


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
// Splits a title over two lines for the Minimalist Yacht Club header, choosing
// the break that makes the two lines most even ("LOS NAVEGANTES / SAIL AGAIN",
// not "LOS / NAVEGANTES SAIL AGAIN"). Short titles stay on one line.
function yachtSplitTitle(title){
  const words = (title||'').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if(words.length<=1 || words.join(' ').length<=12) return {line1: words.join(' '), line2:''};
  let best = 1, bestLen = Infinity;
  for(let i=1;i<words.length;i++){
    const len = Math.max(words.slice(0,i).join(' ').length, words.slice(i).join(' ').length);
    if(len < bestLen){ bestLen = len; best = i; }
  }
  return {line1: words.slice(0,best).join(' '), line2: words.slice(best).join(' ')};
}
// Splits a title into a script "lead" (first two words) + bold "main"
// (the rest), as in the Memory Page mockup. Only for titles of 4+ words, so
// the bold part always has at least two words — "Liat's first / TIME" read
// oddly, so a 3-word title is now shown whole in the bold style.
function memorySplitTitle(title){
  const words = (title||'').trim().split(/\s+/).filter(Boolean);
  if(words.length<=3) return {lead:'', main: words.join(' ').toUpperCase()};
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
  // rather than an <img> (see js/trip-pdf.js), so it's invisible to
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
// Shares/downloads a generated file. Browsers can trigger a real download or
// the Web Share API directly. Inside the native Capacitor app there's no
// browser chrome to hand a download to, so we write the file to the app's
// cache via the Filesystem plugin first, then hand that real on-device file
// off to Android's native share sheet (Save to Files, email, WhatsApp, etc.)
// via the Share plugin. Both plugins are registered on window.Capacitor.Plugins
// once installed + synced — no bundler/import needed for this vanilla-JS app.
// `text` (optional) = a message sent with the file, e.g. the crew message from share.js
async function shareOrDownloadFile(blob, fileName, mimeType, title, downloadedToastKey, text){
  if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
    const { Filesystem, Share } = window.Capacitor.Plugins;
    const base64Data = await new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const written = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });
    await Share.share({ title: title || fileName, text: text || undefined, url: written.uri, dialogTitle: title || fileName });
    return;
  }
  const file = new File([blob], fileName, {type: mimeType});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    await navigator.share(text ? {files:[file], title, text} : {files:[file], title});
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast(t(downloadedToastKey || 'toast.pdfDownloaded'));
  }
}

/* ---------- utils ---------- */
function escapeHtml(s){
  return (s||'').toString().replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

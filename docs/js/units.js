// ===== units.js =====
// Unit conversion + formatting helpers (fmtSpeed, fmtDistance, unit labels) and service worker registration
// Extracted from the original single-file app.js, lines 4515-4547, in original order.

const KT_TO_KMH = 1.852, NM_TO_KM = 1.852;
let activeUnitSystem = 'nautical'; // session state for the log-entry screen, seeded from the profile default each time it opens
function appUnitSystem(){ return state.profile.unitSystem || 'nautical'; }
function fmtSpeed(kts, sys){
  sys = sys || appUnitSystem();
  return sys==='metric' ? (kts*KT_TO_KMH).toFixed(1)+' km/h' : (kts||0).toFixed(1)+' kts';
}
function fmtDistance(nm, sys){
  sys = sys || appUnitSystem();
  return sys==='metric' ? (nm*NM_TO_KM).toFixed(1)+' km' : (nm||0).toFixed(1)+' NM';
}
// "12.6 km" -> "12.6<span class="stat-unit"> km</span>", so a stat box can show the
// number big and the unit small (the same style as the Home page stats).
function statWithUnit(text){
  const i = text.lastIndexOf(' ');
  return i > 0 ? `${text.slice(0,i)}<span class="stat-unit"> ${text.slice(i+1)}</span>` : text;
}
function speedUnitLabel(sys){ return (sys||appUnitSystem())==='metric' ? 'km/h' : 'kts'; }
function distUnitLabel(sys){ return (sys||appUnitSystem())==='metric' ? 'km' : 'NM'; }

// Wake locks are released automatically by the browser whenever the tab is hidden
// and do NOT reacquire on their own — re-request it here so a live journey keeps
// trying to hold the lock every time the sailor switches back to the tab.
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && currentTrip && !currentTrip.isManual && watchId!==null){
    requestWakeLock();
  }
});
// Native splash handoff (Android app only). The native splash is configured to
// stay up for up to 3s (capacitor.config.json: launchShowDuration 3000) instead
// of vanishing the moment the WebView exists — that's what used to reveal a
// blank white screen. The 3s is only a safety net in case this script never runs.
// We hide it only once the web splash (#webSplash, identical navy + centred
// logo) has actually been painted, so the swap between them is invisible.
// Two requestAnimationFrames = "after the next real paint". Safe no-op in the
// browser/PWA, or if the @capacitor/splash-screen plugin isn't installed.
function hideNativeSplash(){
  const SplashScreen = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen;
  if(!SplashScreen) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
  }));
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideNativeSplash);
else hideNativeSplash();

(async () => {
  // Floor so the splash is never up for an awkwardly short flash on a fast
  // load — boot() itself can take longer (up to ~2.5s worst case, see its
  // own comments), in which case this floor has no effect and boot() alone
  // decides how long the splash stays up.
  const minDisplay = new Promise(r => setTimeout(r, 700));
  await Promise.all([boot(), minDisplay]);
  const splash = document.getElementById('webSplash');
  if(splash){
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 450); // logo fades (.15s), then background (.25s after a .15s delay) — see the critical CSS in index.html
  }
})();

// Register service worker for offline app-shell caching + installability.
// Requires https (or localhost) — it will silently no-op over plain http/file://.
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(err=>{
      console.warn('Service worker registration failed (expected on http:// or file://):', err);
    });
  });
}

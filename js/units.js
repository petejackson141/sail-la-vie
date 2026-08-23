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
boot();

// Register service worker for offline app-shell caching + installability.
// Requires https (or localhost) — it will silently no-op over plain http/file://.
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(err=>{
      console.warn('Service worker registration failed (expected on http:// or file://):', err);
    });
  });
}

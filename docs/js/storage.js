// ===== storage.js =====
// IndexedDB/localStorage abstraction layer (storeGet/Set/Delete), backup & restore to file
// Extracted from the original single-file app.js, lines 1261-1469, in original order.

const LS_PREFIX = 'sail-la-vie:';
const IDB_NAME = 'sail-la-vie-db';
const IDB_STORE = 'kv';

let memoryStore = {};       // always-on session fallback, keyed same as chosen tier
let storageTier = 'memory'; // 'idb' | 'localStorage' | 'memory' — set by initStorage()
let idb = null;             // open IDBDatabase once storageTier==='idb'

// Low-level IndexedDB wrappers — thin Promise wrappers around the callback-based
// IndexedDB API. Nothing outside this file's storeGet/storeSet/storeDelete calls
// these directly.
function openIDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){ reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e)=>{
      // Runs once on first use (or version bump) to create the single key/value object store
      const db = e.target.result;
      if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
    req.onblocked = ()=> reject(new Error('idb blocked'));
  });
}
function idbGet(key){
  return new Promise((resolve,reject)=>{
    const tx = idb.transaction(IDB_STORE,'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = ()=> resolve(req.result===undefined ? null : req.result);
    req.onerror = ()=> reject(req.error);
  });
}
function idbPut(key,value){
  return new Promise((resolve,reject)=>{
    const tx = idb.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
    tx.onabort = ()=> reject(tx.error);
  });
}
function idbDel(key){
  return new Promise((resolve,reject)=>{
    const tx = idb.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}
function lsAvailable(){
  try{
    const t = '__slv_test__';
    localStorage.setItem(t,'1');
    localStorage.removeItem(t);
    return true;
  }catch(e){ return false; }
}

// Picks the best available tier once at boot. Called from boot() before any load/save.
async function initStorage(){
  try{
    idb = await openIDB();
    // verify a real write actually round-trips (mirrors the Android file:// caution from localStorage)
    await idbPut('__slv_probe__', 1);
    const probe = await idbGet('__slv_probe__');
    if(probe !== 1) throw new Error('idb probe mismatch');
    await idbDel('__slv_probe__');
    storageTier = 'idb';
    clearPersistentStorageError();
    return;
  }catch(e){
    console.error('IndexedDB unavailable, falling back', e);
  }
  if(lsAvailable()){
    storageTier = 'localStorage';
    clearPersistentStorageError();
  } else {
    storageTier = 'memory';
    showPersistentStorageError();
  }
}

// storeGet / storeSet / storeDelete are the ONLY storage functions the rest of
// the app should call — everything above this line is internal plumbing for
// picking and talking to whichever tier is active.
async function storeGet(key){
  try{
    if(storageTier==='idb') return await idbGet(key);
    if(storageTier==='localStorage'){
      const raw = localStorage.getItem(LS_PREFIX+key);
      return raw ? JSON.parse(raw) : null;
    }
    return memoryStore[key] ? JSON.parse(memoryStore[key]) : null;
  }catch(e){
    console.error('storage get failed',key,e);
    return memoryStore[key] ? JSON.parse(memoryStore[key]) : null;
  }
}
async function storeSet(key,value){
  memoryStore[key] = JSON.stringify(value); // always keep an in-memory copy for this session
  try{
    if(storageTier==='idb'){
      await idbPut(key,value);
      clearPersistentStorageError();
      return true;
    }
    if(storageTier==='localStorage'){
      const json = memoryStore[key];
      localStorage.setItem(LS_PREFIX+key, json);
      const check = localStorage.getItem(LS_PREFIX+key);
      if(check !== json){ storageTier='memory'; showPersistentStorageError(); return false; }
      clearPersistentStorageError();
      return true;
    }
    showPersistentStorageError();
    return false;
  }catch(e){
    console.error('storage set failed',key,e);
    // step down a tier rather than losing everything outright
    storageTier = (storageTier==='idb') ? 'localStorage' : 'memory';
    if(storageTier==='localStorage' && !lsAvailable()) storageTier='memory';
    if(storageTier==='memory') showPersistentStorageError();
    return false;
  }
}
async function storeDelete(key){
  delete memoryStore[key];
  try{
    if(storageTier==='idb') await idbDel(key);
    else if(storageTier==='localStorage') localStorage.removeItem(LS_PREFIX+key);
  }catch(e){}
}

function showPersistentStorageError(){
  let el = document.getElementById('storageErrorBanner');
  if(!el){
    el = document.createElement('div');
    el.id = 'storageErrorBanner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:1000;background:var(--coral);color:#fff;font-size:12.5px;font-weight:600;text-align:center;padding:10px 16px;';
    el.textContent = "Storage isn't persisting on this device — entries will be lost on reload. Try opening this file from Chrome's Downloads page instead of a file manager/Drive share.";
    document.body.appendChild(el);
  }
}
function clearPersistentStorageError(){
  const el = document.getElementById('storageErrorBanner');
  if(el) el.remove();
}

/* ---------- backup / restore: exports everything to a downloadable .json,
   and can restore from one. This is the only way data moves between devices
   or off the phone, since storage above is device-local only. ---------- */
// ---- backup progress helpers (added 28.10.2026) ----
// The first backup on a device downloads every cloud photo so it can go inside
// the file. That can take minutes, and the button used to show nothing while
// it worked, so it looked broken. These keep a message on screen the whole time.
let _backupRunning = false;
// Shows a message in the toast bar and keeps it there (no auto-hide) until
// the next message or the final showToast().
function backupProgress(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastTimer);
}
// Gives up on a slow step after `ms` milliseconds and returns null instead of
// waiting forever (one stuck photo used to freeze the whole backup).
function withTimeout(promise, ms){
  return Promise.race([promise, new Promise(resolve => setTimeout(()=>resolve(null), ms))]);
}
const BACKUP_PHOTO_TIMEOUT_MS = 30000;

async function backupToFile(){
  if(_backupRunning) return; // a second tap while it's working does nothing
  _backupRunning = true;
  try{
    await _backupToFileInner();
  }catch(e){
    console.error('backup failed', e);
    showToast('Backup failed: ' + (e && e.message || String(e)));
  }finally{
    _backupRunning = false;
  }
}

async function _backupToFileInner(){
  backupProgress(t('toast.backupPreparing'));
  const canInline = typeof photoToDataUrl === 'function' && typeof isPhotoRef === 'function';

  // 1. Load every sail and count the cloud photos, so we can show "photo 12 of 85".
  const fullTrips = [];
  for(const entry of state.tripIndex){
    const full = await storeGet('trip:'+entry.id);
    if(full) fullTrips.push(full);
  }
  const photoFields = (tr)=> [...(tr.photos||[]), tr.coverPhoto, tr.mapImage];
  const total = canInline ? fullTrips.reduce((n, tr)=> n + photoFields(tr).filter(isPhotoRef).length, 0) : 0;
  let done = 0, failed = 0;

  // 2. Swap each cloud photo for the real image. If one fails or takes too
  //    long, keep its cloud reference instead and carry on.
  const inlineOne = async (src)=>{
    if(!canInline || !isPhotoRef(src)) return src;
    const data = await withTimeout(photoToDataUrl(src).catch(()=>null), BACKUP_PHOTO_TIMEOUT_MS);
    done++;
    if(!data) failed++;
    backupProgress(t('toast.backupPhotos', {done, total}));
    return data || src;
  };
  const trips = [];
  for(const tr of fullTrips){
    const out = { ...tr };
    if(Array.isArray(tr.photos)){
      out.photos = [];
      for(const ph of tr.photos) out.photos.push(await inlineOne(ph));
    }
    if(tr.coverPhoto) out.coverPhoto = await inlineOne(tr.coverPhoto);
    if(tr.mapImage) out.mapImage = await inlineOne(tr.mapImage);
    trips.push(out);
  }

  // 3. Profile, boat and crew photos (only a few), each with the same time limit.
  backupProgress(t('toast.backupPreparing'));
  const safe = async (fn, value)=> (typeof fn === 'function' ? (await withTimeout(fn(value).catch(()=>null), BACKUP_PHOTO_TIMEOUT_MS)) : null) || value;
  const profile = await safe(typeof inlineProfileImages === 'function' ? inlineProfileImages : null, state.profile);
  const boats = [];
  for(const b of (state.boats||[])) boats.push(await safe(typeof inlineItemImages === 'function' ? inlineItemImages : null, b));
  const crew = [];
  for(const c of (state.crew||[])) crew.push(await safe(typeof inlineItemImages === 'function' ? inlineItemImages : null, c));

  const payload = {
    app:'Sail la Vie', version:1, exportedAt:new Date().toISOString(),
    profile, boats, crew, noticeboard: state.noticeboard,
    tripIndex: state.tripIndex, trips
  };
  // Final message: plain "done", or a warning if some photos couldn't be included.
  const doneMsg = failed ? t('toast.backupPartial', {n: failed}) : t('toast.backupDownloaded');
  backupProgress(t('toast.backupSaving'));
  const json = JSON.stringify(payload, null, 2);
  const filename = `sail-la-vie-backup-${new Date().toISOString().slice(0,10)}.json`;

  // The browser "invisible link + click" download trick below only works in
  // an actual browser tab (the PWA build) — there's no download manager to
  // catch it inside a native Capacitor WebView, so on native it silently
  // wrote nowhere findable. On native, write the file via the Filesystem
  // plugin, then hand off to the OS Share sheet so the person explicitly
  // picks where it goes (Drive, email, Files, etc.) — that also means
  // there's never any ambiguity about the save location, since they choose
  // it themselves every time.
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if(isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem){
    try{
      const { Filesystem } = window.Capacitor.Plugins;
      // Directory.Cache isn't available here — 'Directory' is a plain JS
      // constants object exported by the @capacitor/filesystem npm package,
      // not something the native bridge exposes on window.Capacitor.Plugins,
      // and this app doesn't bundle that package. Pass the raw string value
      // the native side expects instead.
      const written = await Filesystem.writeFile({
        path: filename,
        data: json,
        directory: 'CACHE',
        encoding: 'utf8'
      });
      if(window.Capacitor.Plugins.Share){
        await window.Capacitor.Plugins.Share.share({ title: 'Sail la Vie backup', url: written.uri });
      }
      showToast(doneMsg);
    }catch(e){
      // Closing the share menu without picking anywhere isn't a failure.
      if(/cancel/i.test(e && e.message || '')){ showToast(t('toast.backupCancelled')); return; }
      console.error('native backup failed', e);
      showToast('Backup failed: ' + (e.message || String(e)));
    }
    return;
  }

  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast(doneMsg);
}
async function restoreFromFile(ev){
  const f = ev.target.files[0];
  ev.target.value = '';
  if(!f) return;
  try{
    const data = JSON.parse(await f.text());
    if(!data || !data.profile || !Array.isArray(data.trips)){ showToast(t('toast.invalidBackup')); return; }
    if(!(await confirmDialog('restore', {danger:true, icon:'restore', vars:{name: f.name}}))) return;

    await storeSet(KEYS.PROFILE, data.profile);
    await storeSet(KEYS.BOATS, data.boats||[]);
    await storeSet(KEYS.CREW, data.crew||[]);
    // (`data.diary` = backups made by the build where this was still called the Diary)
    const restoredNoticeboard = data.noticeboard || data.diary || [];
    await storeSet(KEYS.NOTICEBOARD, restoredNoticeboard);
    await storeSet(KEYS.INDEX, data.tripIndex||[]);
    for(const trip of data.trips){ await storeSet('trip:'+trip.id, trip); }

    state.profile = data.profile;
    state.boats = data.boats||[];
    state.crew = data.crew||[];
    state.noticeboard = restoredNoticeboard;
    syncNoticeboardReminders();
    state.tripIndex = data.tripIndex||[];

    currentLang = savedLanguage(); // English or Hebrew, from the restored profile
    applyStaticTranslations();
    await applyThemePreference();
    document.getElementById('homeName').textContent = state.profile.name || t('default.sailorName');
    refreshAvatars();
    showToast(t('toast.backupRestored'));
    nav('home');
    renderHomeStats();
  }catch(e){
    console.error('restore failed', e);
    showToast(t('toast.backupReadFail'));
  }
}

/* ---------- in-memory state ----------
   The single source of truth while the app is open. Loaded from storage in
   boot() and written back to storage piecemeal whenever something changes
   (see storeSet calls throughout — there's no single "save everything" call). */

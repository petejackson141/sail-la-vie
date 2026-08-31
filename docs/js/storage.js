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
async function backupToFile(){
  const trips = [];
  for(const t of state.tripIndex){
    const full = await storeGet('trip:'+t.id);
    if(full) trips.push(full);
  }
  const payload = {
    app:'Sail la Vie', version:1, exportedAt:new Date().toISOString(),
    profile: state.profile, boats: state.boats, crew: state.crew,
    tripIndex: state.tripIndex, trips
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `sail-la-vie-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast(t('toast.backupDownloaded'));
}
async function restoreFromFile(ev){
  const f = ev.target.files[0];
  ev.target.value = '';
  if(!f) return;
  try{
    const data = JSON.parse(await f.text());
    if(!data || !data.profile || !Array.isArray(data.trips)){ showToast(t('toast.invalidBackup')); return; }
    if(!(await showConfirm(t('confirm.restore', {name: f.name}), {danger:true}))) return;

    await storeSet(KEYS.PROFILE, data.profile);
    await storeSet(KEYS.BOATS, data.boats||[]);
    await storeSet(KEYS.CREW, data.crew||[]);
    await storeSet(KEYS.INDEX, data.tripIndex||[]);
    for(const trip of data.trips){ await storeSet('trip:'+trip.id, trip); }

    state.profile = data.profile;
    state.boats = data.boats||[];
    state.crew = data.crew||[];
    state.tripIndex = data.tripIndex||[];

    currentLang = 'en'; // language picker hidden for now — es/pt/he dictionaries kept intact for later
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

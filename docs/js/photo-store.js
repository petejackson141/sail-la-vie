// ===== photo-store.js =====
// SAIL PHOTOS IN SUPABASE STORAGE (not inside the database any more).
//
// How it works, in plain terms:
//   • When you add a photo it's compressed (see PHOTO_MAX_DIM / PHOTO_QUALITY)
//     and kept inside the sail on this device, exactly like before — so adding
//     photos works at sea with no signal.
//   • The next time that sail is sent to the cloud (on save, or on the next sync
//     if you were offline), each photo is uploaded to the "trip-photos" storage
//     bucket first, and the sail keeps only a short reference to it, like
//     "sbimg:<your-user-id>/<sail-id>/<photo-id>.jpg". The database row stays tiny.
//   • A copy of every uploaded/viewed photo is kept on the device
//     (IndexedDB "sail-la-vie-photos"), so your photos still show offline.
//   • Any <img> in the app whose src is one of those references is filled in
//     automatically (see the MutationObserver at the bottom) — the rest of the
//     app keeps treating photos as plain strings, as it always has.
//   • Existing sails with photos stored the old way are moved across
//     automatically on the next sync (see resolveTripsSyncOnSignInImpl in auth.js).
//   • Signed out ("Continue without an account"): photos simply stay on the
//     device the old way until you sign in.
//
// Needs photo-storage-supabase.sql to have been run once in Supabase. Until it
// is, uploads fail quietly and sails keep syncing the old way — nothing breaks.

const PHOTO_BUCKET = 'trip-photos';
const PHOTO_REF_PREFIX = 'sbimg:';
const PHOTO_MAX_DIM = 2000;                        // longest side, in pixels
const PHOTO_QUALITY = 0.82;                        // JPEG quality
const PHOTO_KEEP_ORIGINAL_MAX_BYTES = 600 * 1024;  // small JPEGs (e.g. WhatsApp copies) are kept as they are
const MAX_PHOTOS_PER_SAIL = 20;
const PHOTO_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

Object.assign(TRANSLATIONS.en, {
  'photos.counter': '{n} / {max}',
  'photos.limitReached': 'This sail already has {max} photos — the most one sail can hold.',
  'photos.limitPartial': 'Added {n} — a sail can hold up to {max} photos.',
});

function isPhotoRef(s){ return typeof s === 'string' && s.startsWith(PHOTO_REF_PREFIX); }
function isInlineImage(s){ return typeof s === 'string' && s.startsWith('data:image/'); }
function photoRefPath(ref){ return ref.slice(PHOTO_REF_PREFIX.length); }

/* ---------- adding photos: compress, but leave already-small ones alone ---------- */
function imageDimensions(file){
  return new Promise((resolve)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{ URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = ()=>{ URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
// Recompressing a photo that's already small (e.g. saved from WhatsApp) makes it
// slightly BIGGER and a bit worse, so those are kept exactly as they are.
async function preparePhotoForSail(file){
  const isJpeg = /jpe?g/i.test(file.type || '') || /\.jpe?g$/i.test(file.name || '');
  if(isJpeg && file.size <= PHOTO_KEEP_ORIGINAL_MAX_BYTES){
    const dims = await imageDimensions(file);
    if(dims && Math.max(dims.w, dims.h) <= PHOTO_MAX_DIM) return readFileAsDataUrl(file);
  }
  return resizeImage(file, PHOTO_MAX_DIM, PHOTO_QUALITY);
}

/* ---------- on-device photo cache (separate database from the logbook) ----------
   Stored as {type, buf} rather than a Blob, because some iPhone versions can't
   keep Blobs in IndexedDB. */
let _photoDbPromise = null;
const _photoMemCache = new Map(); // fallback if IndexedDB isn't usable
function photoDb(){
  if(!_photoDbPromise){
    _photoDbPromise = new Promise((resolve)=>{
      try{
        const req = indexedDB.open('sail-la-vie-photos', 1);
        req.onupgradeneeded = (e)=>{
          const db = e.target.result;
          if(!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
        };
        req.onsuccess = ()=> resolve(req.result);
        req.onerror = ()=> resolve(null);
        req.onblocked = ()=> resolve(null);
      }catch(e){ resolve(null); }
    });
  }
  return _photoDbPromise;
}
async function photoCacheGet(path){
  if(_photoMemCache.has(path)) return _photoMemCache.get(path);
  const db = await photoDb();
  if(!db) return null;
  return new Promise((resolve)=>{
    try{
      const req = db.transaction('photos', 'readonly').objectStore('photos').get(path);
      req.onsuccess = ()=>{
        const v = req.result;
        resolve(v && v.buf ? new Blob([v.buf], { type: v.type || 'image/jpeg' }) : null);
      };
      req.onerror = ()=> resolve(null);
    }catch(e){ resolve(null); }
  });
}
async function photoCachePut(path, blob){
  const db = await photoDb();
  if(!db){ _photoMemCache.set(path, blob); return; }
  try{
    const buf = await blob.arrayBuffer();
    await new Promise((resolve)=>{
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put({ type: blob.type || 'image/jpeg', buf }, path);
      tx.oncomplete = ()=> resolve();
      tx.onerror = ()=>{ _photoMemCache.set(path, blob); resolve(); };
      tx.onabort = ()=>{ _photoMemCache.set(path, blob); resolve(); };
    });
  }catch(e){ _photoMemCache.set(path, blob); }
}
async function photoCacheDelete(path){
  _photoMemCache.delete(path);
  const db = await photoDb();
  if(!db) return;
  try{ db.transaction('photos', 'readwrite').objectStore('photos').delete(path); }catch(e){}
}

/* ---------- getting a photo back (device copy first, then the cloud) ---------- */
const _photoUrls = new Map();     // path -> object URL, for this session
const _photoInflight = new Map(); // path -> Promise<Blob|null>, so one photo is never fetched twice at once
let _photoDownloadsActive = 0;
const _photoDownloadWaiters = [];
async function withDownloadSlot(fn){
  // At most 4 downloads at once, so opening a big Gallery doesn't flood a weak connection.
  if(_photoDownloadsActive >= 4) await new Promise(r=>_photoDownloadWaiters.push(r));
  _photoDownloadsActive++;
  try{ return await fn(); }
  finally{ _photoDownloadsActive--; const next = _photoDownloadWaiters.shift(); if(next) next(); }
}
function getPhotoBlob(ref){
  const path = photoRefPath(ref);
  if(_photoInflight.has(path)) return _photoInflight.get(path);
  const p = (async ()=>{
    const cached = await photoCacheGet(path);
    if(cached) return cached;
    if(!state.user) return null; // photos are private — you must be signed in to fetch them
    return withDownloadSlot(async ()=>{
      try{
        const { data, error } = await getSupabaseClient().storage.from(PHOTO_BUCKET).download(path);
        if(error || !data) throw error || new Error('no data');
        await photoCachePut(path, data);
        return data;
      }catch(e){
        console.warn('photo download failed', path, e);
        return null;
      }
    });
  })();
  _photoInflight.set(path, p);
  p.finally(()=> _photoInflight.delete(path));
  return p;
}
async function photoObjectUrl(ref){
  const path = photoRefPath(ref);
  if(_photoUrls.has(path)) return _photoUrls.get(path);
  const blob = await getPhotoBlob(ref);
  if(!blob) return null;
  if(!_photoUrls.has(path)) _photoUrls.set(path, URL.createObjectURL(blob));
  return _photoUrls.get(path);
}
function blobToDataUrl(blob){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = ()=> reject(r.error);
    r.readAsDataURL(blob);
  });
}
// For the few places that need the actual image data (PDF export, cover crop,
// backup file). Returns the original string for anything that isn't a reference.
async function photoToDataUrl(src){
  if(!isPhotoRef(src)) return src;
  const blob = await getPhotoBlob(src);
  return blob ? blobToDataUrl(blob) : null;
}
// A copy of a sail with every photo reference swapped for real image data.
async function inlineTripImages(trip){
  if(!trip) return trip;
  const out = { ...trip };
  if(Array.isArray(trip.photos)){
    out.photos = [];
    for(const p of trip.photos) out.photos.push((await photoToDataUrl(p)) || p);
  }
  if(trip.coverPhoto) out.coverPhoto = (await photoToDataUrl(trip.coverPhoto)) || trip.coverPhoto;
  if(trip.mapImage) out.mapImage = (await photoToDataUrl(trip.mapImage)) || trip.mapImage;
  return out;
}

/* ---------- uploading (moving a sail's photos out of the database) ---------- */
let _photoStorageUnavailable = false; // set if the bucket isn't set up yet — stops retrying every photo this session
const _uploadedInline = new Map();    // inline image -> reference, so the same photo is never uploaded twice

function dataUrlToBlob(dataUrl){
  const [head, body] = dataUrl.split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
async function uploadInlineImage(dataUrl, tripId){
  if(_uploadedInline.has(dataUrl)) return _uploadedInline.get(dataUrl);
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${state.user.id}/${tripId}/${uid()}.${ext}`;
  const { error } = await getSupabaseClient().storage.from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
  if(error){
    if(/bucket not found|row-level security|violates|not authorized|unauthorized/i.test(error.message || '')) _photoStorageUnavailable = true;
    throw error;
  }
  await photoCachePut(path, blob);
  const ref = PHOTO_REF_PREFIX + path;
  _uploadedInline.set(dataUrl, ref);
  return ref;
}
function tripHasInlineImages(trip){
  return !!trip && ((trip.photos || []).some(isInlineImage) || isInlineImage(trip.coverPhoto) || isInlineImage(trip.mapImage));
}
// Uploads any photos still stored inside this sail and swaps them for references.
// Saves the updated sail on this device. Returns true if anything changed.
// Throws if an upload fails — the sail is left exactly as it was.
async function offloadTripPhotos(trip){
  if(!state.user || _photoStorageUnavailable || !tripHasInlineImages(trip)) return false;
  const conv = async (s)=> isInlineImage(s) ? uploadInlineImage(s, trip.id) : s;
  const photos = [];
  for(const p of (trip.photos || [])) photos.push(await conv(p));
  const coverPhoto = trip.coverPhoto ? await conv(trip.coverPhoto) : trip.coverPhoto;
  const mapImage = trip.mapImage ? await conv(trip.mapImage) : trip.mapImage;

  trip.photos = photos;
  trip.coverPhoto = coverPhoto;
  trip.mapImage = mapImage;
  trip.updatedAt = new Date().toISOString(); // newer, so other devices take the lighter version
  await storeSet('trip:'+trip.id, trip);
  const entry = state.tripIndex.find(x=>x.id===trip.id);
  if(entry){ entry.coverPhoto = trip.coverPhoto; entry.hasPhotos = photos.length > 0; await storeSet(KEYS.INDEX, state.tripIndex); }
  // Keep whatever copy of this sail is open on screen in step too.
  const open = window._detailTrip;
  if(open && open !== trip && open.id === trip.id && !window._friendDetail){
    open.photos = photos; open.coverPhoto = coverPhoto; open.mapImage = mapImage; open.updatedAt = trip.updatedAt;
  }
  return true;
}

/* ---------- deleting ---------- */
// Removes photos from the cloud (only your own) and from this device.
async function deleteStoredPhotos(refs){
  const paths = (refs || []).filter(isPhotoRef).map(photoRefPath)
    .filter(p=> state.user && p.startsWith(state.user.id + '/'));
  if(!paths.length) return;
  paths.forEach(photoCacheDelete);
  try{ await getSupabaseClient().storage.from(PHOTO_BUCKET).remove(paths); }
  catch(e){ console.warn('photo delete failed', e); }
}
// Removes every photo of a deleted sail.
async function deleteTripPhotoFolder(tripId){
  if(!state.user || !tripId) return;
  const folder = `${state.user.id}/${tripId}`;
  try{
    const { data, error } = await getSupabaseClient().storage.from(PHOTO_BUCKET).list(folder, { limit: 100 });
    if(error || !data || !data.length) return;
    await deleteStoredPhotos(data.map(f=> PHOTO_REF_PREFIX + folder + '/' + f.name));
  }catch(e){ console.warn('photo folder delete failed', e); }
}

/* ---------- filling in <img> tags that point at a stored photo ---------- */
let _lazyPhotoObserver = null;
function fillPhotoImg(img){
  const ref = img.dataset.photoRef;
  if(!ref) return;
  photoObjectUrl(ref).then(url=>{
    if(img.dataset.photoRef !== ref) return; // the img was pointed at a different photo meanwhile
    if(url){ delete img.dataset.photoPending; img.src = url; }
    else img.dataset.photoPending = '1'; // offline / not synced yet — retried when back online
  });
}
function hydratePhotoImg(img){
  const src = img.getAttribute('src');
  if(!isPhotoRef(src)){
    // Pointed at something else now (or cleared) — forget the old photo so a
    // slow download can't land on this img later.
    if(src !== PHOTO_PLACEHOLDER && !(src || '').startsWith('blob:')){ delete img.dataset.photoRef; delete img.dataset.photoPending; }
    return;
  }
  img.dataset.photoRef = src;
  img.setAttribute('src', PHOTO_PLACEHOLDER);
  // Gallery thumbnails are marked loading="lazy" — only fetch those once they're near the screen.
  if(img.getAttribute('loading') === 'lazy' && 'IntersectionObserver' in window){
    if(!_lazyPhotoObserver){
      _lazyPhotoObserver = new IntersectionObserver((entries)=>{
        entries.forEach(en=>{ if(en.isIntersecting){ _lazyPhotoObserver.unobserve(en.target); fillPhotoImg(en.target); } });
      }, { rootMargin: '600px' });
    }
    _lazyPhotoObserver.observe(img);
  } else {
    fillPhotoImg(img);
  }
}
function retryPendingPhotos(){
  document.querySelectorAll('img[data-photo-pending]').forEach(fillPhotoImg);
}
(function startPhotoHydration(){
  const scan = (node)=>{
    if(node.nodeType !== 1) return;
    if(node.tagName === 'IMG') hydratePhotoImg(node);
    else if(node.querySelectorAll) node.querySelectorAll('img[src^="'+PHOTO_REF_PREFIX+'"]').forEach(hydratePhotoImg);
  };
  const obs = new MutationObserver((muts)=>{
    for(const m of muts){
      if(m.type === 'attributes') hydratePhotoImg(m.target);
      else m.addedNodes.forEach(scan);
    }
  });
  obs.observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['src'] });
  window.addEventListener('online', retryPendingPhotos);
})();

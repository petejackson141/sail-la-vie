// ===== share.js =====
// "Share with Crew / Social" on a sail's page (30.10.2026). One button opens a
// sheet with four choices:
//
//   1. Send the PDF to the crew — opens the PDF preview (pick a theme), and the
//      phone's share sheet then gets the PDF plus a ready-made message naming
//      the crew, so you just pick the WhatsApp group / email.
//   2. Send the track (GPX) — a standard .gpx file of the GPS track that opens
//      in Navionics, Google Earth and most sailing apps. Only for tracked sails.
//   3. Send to a friend's app — puts a copy of the sail in a Sail la Vie
//      friend's account. It waits in their History ("Pete sent you a sail")
//      until they add it or decline. Uses the `sail_shares` table
//      (supabase/sail-shares.sql). The friend gets their own copy: the photos
//      are copied into their own storage when they accept, and the sail is
//      marked "Sent by …" — it does NOT count on their GPS Sea Time Record,
//      because it was recorded on someone else's phone.
//   4. 15-second reel — coming next (its own project).

/* ============================================================
   THE SHARE SHEET
   ============================================================ */

function openShareSheet(){
  const trip = window._detailTrip;
  if(!trip){ showToast(t('toast.openTripFirst')); return; }
  const hasTrack = !!(trip.path && trip.path.length > 1);
  const opt = (icon, title, sub, onclick, disabled)=>`
    <div class="share-opt${disabled ? ' disabled' : ''}"${disabled ? '' : ` onclick="${onclick}"`}>
      <span class="share-opt-ico" aria-hidden="true">${icon}</span>
      <span class="share-opt-txt"><b>${title}</b><span>${sub}</span></span>
    </div>`;
  document.getElementById('shareOptions').innerHTML =
    opt('📄', t('share.pdfTitle'), t('share.pdfSub'), 'sharePdfToCrew()') +
    opt('🧭', t('share.gpxTitle'), hasTrack ? t('share.gpxSub') : t('share.gpxNoTrack'), 'shareTripGpx()', !hasTrack) +
    opt('⛵', t('share.friendTitle'), state.user ? t('share.friendSub') : t('share.friendSignIn'), 'openSendToFriend()', !state.user) +
    opt('🎬', t('share.reelTitle'), t('share.reelSub'), 'openReelMaker()');
  openSheet('sheetShare');
}

/* ---------- 1. PDF to the crew ---------- */

// The message that goes with the PDF, e.g.
// "Los Navegantes sail again, 29 Sep 2026 — Gabriel, Nataly: here's our sail log! ⛵"
function crewShareMessage(trip){
  const names = [];
  if(trip.skipperId && trip.skipperId !== SKIPPER_SELF_ID){ const s = skipperById(trip.skipperId); if(s) names.push(s.name); }
  (trip.crewIds||[]).filter(id=>id !== SKIPPER_SELF_ID).forEach(id=>{ const c = crewMemberById(id); if(c) names.push(c.name); });
  const date = new Date(trip.date).toLocaleDateString(currentLocale(), {day:'numeric', month:'short', year:'numeric'});
  return names.length
    ? t('share.crewMessage', {title: trip.title, date, names: names.join(', ')})
    : t('share.crewMessageNoNames', {title: trip.title, date});
}
// Opens the normal PDF preview; generateAndShareTripPdf (trip-pdf.js) picks up
// the message and hands it to the share sheet with the file.
function sharePdfToCrew(){
  const trip = window._detailTrip; if(!trip) return;
  const msg = crewShareMessage(trip);
  closeSheets();
  setTimeout(()=> openTripPdfPreview(msg), 60);
}

/* ---------- 2. GPX track ---------- */

function gpxEscape(s){ return String(s==null ? '' : s).replace(/[<>&'"]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c])); }
// Builds a GPX 1.1 file: one track, one segment, every recorded point with
// its time (when the point has one).
function tripToGpx(trip){
  const pts = (trip.path||[]).map(p=>{
    const time = p.t ? `<time>${new Date(p.t).toISOString()}</time>` : '';
    return `      <trkpt lat="${Number(p.lat).toFixed(6)}" lon="${Number(p.lng).toFixed(6)}">${time}</trkpt>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Sail la Vie" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${gpxEscape(trip.title)}</name>
    <time>${new Date(trip.date).toISOString()}</time>
  </metadata>
  <trk>
    <name>${gpxEscape(trip.title)}</name>
    <desc>${gpxEscape([trip.place, fmtDistance(trip.distanceNm||0), fmtDuration(trip.elapsedSeconds)].filter(Boolean).join(' · '))}</desc>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}
async function shareTripGpx(){
  const trip = window._detailTrip;
  if(!trip || !trip.path || trip.path.length < 2){ showToast(t('share.gpxNoTrack')); return; }
  closeSheets();
  const name = (trip.title||'sail').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'sail';
  try{
    await shareOrDownloadFile(new Blob([tripToGpx(trip)], {type:'application/gpx+xml'}), name + '.gpx',
      'application/gpx+xml', trip.title || 'Sail', 'share.gpxDownloaded');
  }catch(e){
    if(!(e && e.name==='AbortError')){ console.error('GPX share failed', e); showToast(t('share.failed')); }
  }
}

/* ---------- 3. Send to a friend's app ---------- */

function openSendToFriend(){
  if(!state.user){ showToast(t('share.friendSignIn')); return; }
  const friends = friendRows().map(r=>personById(friendOtherId(r))).filter(Boolean);
  const el = document.getElementById('sendFriendList');
  el.innerHTML = friends.length
    ? friends.map(p=>friendRowHtml(p, `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();sendSailToFriend('${safeId(p.user_id)}')">${t('share.send')}</button>`)).join('')
    : `<p style="font-size:13px;">${t('share.noFriends')}</p>`;
  closeSheets();
  setTimeout(()=> openSheet('sheetSendFriend'), 60);
}

// What the friend receives: the whole sail, minus anything that only makes
// sense in YOUR app (your boat/crew record ids). Names are kept as plain text.
function sailForFriend(trip){
  const names = id => { const m = crewMemberById(id); return m ? m.name : null; };
  const copy = JSON.parse(JSON.stringify(trip));
  copy.sharedSkipper = trip.skipperId ? names(trip.skipperId) : null;
  copy.sharedCrew = (trip.crewIds||[]).map(names).filter(Boolean);
  copy.boatName = trip.boatName || ((state.boats.find(b=>b.id===trip.boatId)||{}).name) || null;
  delete copy.skipperId; delete copy.crewIds; delete copy.boatId;
  delete copy.isEditing; delete copy.visibility; delete copy.gpsLock;
  return copy;
}
async function sendSailToFriend(userId){
  const trip = window._detailTrip;
  if(!trip || !state.user) return;
  const p = personById(userId);
  if(!(await showConfirm(t('share.sendConfirm', {name: personName(p), title: trip.title}), {title: t('share.friendTitle'), okLabel: t('share.send'), icon:'check'}))) return;
  try{
    // The friend can only open the photos if they're in the cloud, so make sure they are first
    try{ await offloadTripPhotos(trip); }catch(e){}
    const { error } = await getSupabaseClient().from('sail_shares').insert({
      sender_id: state.user.id, recipient_id: userId, trip_id: trip.id,
      sender_name: (friendsState.me && personName(friendsState.me)) || state.profile.name || null,
      data: sailForFriend(trip)
    });
    if(error) throw error;
    closeSheets();
    showToast(t('share.sent', {name: personName(p)}));
  }catch(e){
    console.error('send sail failed', e);
    showToast(/sail_shares|relation|permission/i.test(e.message||'') ? t('share.notSetUp') : t('share.failed'));
  }
}

/* ============================================================
   SAILS SENT TO ME — shown at the top of History
   ============================================================ */

let incomingSails = [];
async function loadIncomingSails(){
  if(!state.user){ incomingSails = []; renderIncomingSails(); return; }
  try{
    const { data, error } = await getSupabaseClient().from('sail_shares')
      .select('id,sender_id,sender_name,trip_id,data,created_at')
      .eq('recipient_id', state.user.id).order('created_at', {ascending:false});
    if(error) throw error;
    incomingSails = data || [];
  }catch(e){
    console.warn('incoming sails not loaded', e.message || e); // table not set up yet → just nothing to show
    incomingSails = [];
  }
  renderIncomingSails();
  announceNewIncomingSails();
}

/* ---------- telling the person a sail has arrived (30.10.2026) ----------
   Each incoming sail is announced once:
     * app open on screen → a pop-up saying who sent what and where to find it
       (top of History), with a "Show me" button
     * app in the background → a phone notification; tapping it opens History
       (the pop-up then shows when they come back to the app)
   Which ones were already announced is remembered on this device.
   Note: a notification when the app is fully CLOSED needs real push
   notifications (Firebase) — a later step. */
const SEEN_SHARES_KEY = 'seenSailShares';
function seenShareIds(){ try{ return JSON.parse(localStorage.getItem(SEEN_SHARES_KEY) || '[]'); }catch(e){ return []; } }
function rememberSharesSeen(ids){
  try{ localStorage.setItem(SEEN_SHARES_KEY, JSON.stringify([...new Set([...seenShareIds(), ...ids])].slice(-200))); }catch(e){}
}
let _notifiedShareIds = new Set(); // phone notification already sent this session
async function announceNewIncomingSails(){
  const seen = new Set(seenShareIds());
  const fresh = incomingSails.filter(s=>!seen.has(s.id));
  if(!fresh.length) return;
  if(document.visibilityState === 'hidden'){ notifyIncomingSails(fresh.filter(s=>!_notifiedShareIds.has(s.id))); return; }
  if(currentTrip) return; // don't interrupt a recording or a log being written — they'll see it later
  if(announceNewIncomingSails._open) return;
  announceNewIncomingSails._open = true;
  rememberSharesSeen(fresh.map(s=>s.id));
  const first = fresh[0], name = first.sender_name || t('default.sailorName');
  const body = fresh.length === 1
    ? t('share.popupOne', {name, title: (first.data && first.data.title) || ''})
    : t('share.popupMany', {n: fresh.length});
  const show = await showConfirm(body, { title: t('share.popupTitle'), okLabel: t('share.popupShow'), cancelLabel: t('share.popupLater'), icon:'check' });
  announceNewIncomingSails._open = false;
  if(show) nav('history');
  if(typeof ensureNotificationPermission === 'function') ensureNotificationPermission(true).catch(()=>{}); // so next time it can notify
}
async function notifyIncomingSails(list){
  const LN = typeof getLocalNotifications === 'function' ? getLocalNotifications() : null;
  if(!LN || !list.length) return;
  if(!(await ensureNotificationPermission(false))) return;
  try{ await LN.createChannel({ id:'sail-shares', name: t('share.channelName'), importance: 4, visibility: 1 }); }catch(e){}
  list.forEach(s=>_notifiedShareIds.add(s.id));
  const first = list[0];
  await LN.schedule({ notifications: [{
    id: (Date.now() % 2000000000) | 0,
    title: t('share.popupTitle'),
    body: list.length === 1 ? t('share.popupOne', {name: first.sender_name || t('default.sailorName'), title: (first.data && first.data.title) || ''}) : t('share.popupMany', {n: list.length}),
    channelId: 'sail-shares', schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
    extra: { sailShare: true }
  }] });
}
// coming back to the app → show the pop-up for anything that arrived meanwhile
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible' && incomingSails.length) announceNewIncomingSails(); });
function renderIncomingSails(){
  const el = document.getElementById('incomingSails');
  if(!el) return;
  el.innerHTML = incomingSails.map(s=>{
    const d = s.data || {};
    const date = d.date ? new Date(d.date).toLocaleDateString(currentLocale(), {day:'numeric', month:'short', year:'numeric'}) : '';
    return `<div class="incoming-sail">
      <div class="incoming-sail-txt"><b>${t('share.incomingTitle', {name: escapeHtml(s.sender_name || t('default.sailorName'))})}</b>
        <span>${escapeHtml(d.title || '')}${date ? ' · ' + date : ''}${d.distanceNm ? ' · ' + fmtDistance(d.distanceNm) : ''}</span></div>
      <div class="incoming-sail-btns">
        <button class="btn btn-primary btn-sm" onclick="acceptIncomingSail('${safeId(s.id)}')">${t('share.add')}</button>
        <button class="btn btn-outline btn-sm" onclick="declineIncomingSail('${safeId(s.id)}')">${t('share.decline')}</button>
      </div>
    </div>`;
  }).join('');
}
// Makes the sail your own: new id, photos copied into YOUR photo storage
// (while the share exists you're allowed to read the sender's), saved to
// History and synced like any other sail, then the share is removed.
async function acceptIncomingSail(shareId){
  const s = incomingSails.find(x=>x.id===shareId); if(!s) return;
  showToast(t('share.adding'));
  try{
    const src = s.data || {};
    const copyImg = async (ref)=> ref ? ((await photoToDataUrl(ref)) || null) : null;
    const photos = [];
    for(const p of (src.photos||[])){ const d = await copyImg(p); if(d) photos.push(d); }
    const trip = {
      ...src, id: uid(), photos,
      coverPhoto: await copyImg(src.coverPhoto), mapImage: await copyImg(src.mapImage),
      skipperId: null, crewIds: [], boatId: null,
      receivedFrom: { userId: s.sender_id, name: s.sender_name || null, at: new Date().toISOString() },
      visibility: 'private', updatedAt: new Date().toISOString()
    };
    delete trip.gpsLock; delete trip.isEditing;
    const ok = await storeSet('trip:'+trip.id, trip);
    if(!ok) throw new Error('save failed');
    state.tripIndex.unshift(tripIndexEntryFrom(trip));
    await storeSet(KEYS.INDEX, state.tripIndex);
    await getSupabaseClient().from('sail_shares').delete().eq('id', shareId);
    incomingSails = incomingSails.filter(x=>x.id!==shareId);
    renderIncomingSails(); renderHistory(); renderHomeStats();
    syncTripIfSignedIn(trip); // uploads the copied photos to your own storage
    showToast(t('share.added'));
  }catch(e){
    console.error('accept sail failed', e);
    showToast(t('share.failed'));
  }
}
async function declineIncomingSail(shareId){
  if(!(await showConfirm(t('share.declineConfirm'), {title: t('share.decline'), okLabel: t('share.decline'), icon:'trash'}))) return;
  try{ await getSupabaseClient().from('sail_shares').delete().eq('id', shareId); }catch(e){}
  incomingSails = incomingSails.filter(x=>x.id!==shareId);
  renderIncomingSails();
}

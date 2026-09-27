// ===== friends.js =====
// FRIENDS — mutual friendships (request + accept), like Facebook.
//
// Needs the friends-supabase.sql tables to exist in Supabase:
//   public_profiles  — the small, searchable "business card" (username, name, avatar)
//                      other signed-in users may see. The full profile stays private.
//   friendships      — one row per pair: 'pending' (request sent) or 'accepted'.
//                      Declining, cancelling and unfriending all DELETE the row.
//   trips.visibility — 'private' | 'friends'. Friends can read 'friends' sails only;
//                      the database's security rules enforce that, not this file.
//
// Screens:
//   screen-friends — your username, search for sailors, requests, your friends
//   screen-friend  — one friend's page: their card + the sails they shared
// A friend's sail opens in the normal trip detail screen in read-only mode
// (see openTripDetail(id, from, friendView) in history-maps.js).
//
// Everything here is a no-op while signed out.
//
// TESTING PHASE: SHOW_ALL_SAILORS_FOR_TESTING lists every sailor who has a public
// card (i.e. has chosen a username) — at the bottom of the Friends screen and as a
// sideways-scrolling row on the Profile screen — so testers can find each other
// without knowing usernames. Set it to false before a wider release.
const SHOW_ALL_SAILORS_FOR_TESTING = true;

Object.assign(TRANSLATIONS.en, {
  'friends.title': 'Friends',
  'friends.signedOutTitle': 'Sign in to add friends',
  'friends.signedOutHint': 'Friends can see the sails you choose to share with them.',
  'friends.signIn': 'Sign In / Create Account',
  'friends.loading': 'Loading…',
  'friends.loadFailed': "Couldn't load friends — check your connection.",
  'friends.retry': 'Try again',
  'friends.chooseTitle': 'Choose your username',
  'friends.chooseHint': 'This is how other sailors find you. 3–20 characters: lowercase letters, numbers, _ and .',
  'friends.usernamePh': 'e.g. pete_sails',
  'friends.save': 'Save username',
  'friends.cancel': 'Cancel',
  'friends.change': 'Change',
  'friends.badFormat': 'Use 3–20 characters: lowercase letters, numbers, _ or .',
  'friends.taken': 'That username is already taken.',
  'friends.saved': 'Username saved ⚓',
  'friends.searchPh': 'Find sailors by username or name…',
  'friends.searchHint': 'Type at least 2 letters.',
  'friends.noResults': 'No sailors found.',
  'friends.requests': 'Friend requests',
  'friends.sent': 'Requests sent',
  'friends.yourFriends': 'Your friends',
  'friends.noFriends': 'No friends yet — search for a sailor above to send a request.',
  'friends.add': 'Add',
  'friends.accept': 'Accept',
  'friends.decline': 'Decline',
  'friends.cancelRequest': 'Cancel',
  'friends.requested': 'Requested',
  'friends.isFriend': 'Friends ✓',
  'friends.needUsername': 'Choose a username first.',
  'friends.requestSent': 'Friend request sent',
  'friends.nowFriends': "You're now friends ⚓",
  'friends.actionFailed': 'Something went wrong — try again.',
  'friends.count': '{n} friends',
  'friends.countOne': '1 friend',
  'friends.pending': '{n} new',
  'friends.cardEmpty': 'Find sailors you know and share your sails.',
  'friends.sharedSails': 'Shared sails',
  'friends.noSharedSails': "{name} hasn't shared any sails with friends yet.",
  'friends.remove': 'Remove friend',
  'friends.removed': 'Friend removed',
  'friends.sharedBy': 'Shared by {name}',
  'friends.onApp': 'Sailors on Sail la Vie',
  'friends.onAppHint': 'Everyone testing the app who has chosen a username.',
  'friends.onAppEmpty': 'No other sailors yet.',
  'friends.you': 'You',
  'friends.notFriendsYet': 'Become friends with {name} to see the sails they share.',
  'friends.addFriend': 'Add friend',
  'friends.requestPending': 'Friend request sent — waiting for {name} to accept.',
  'friends.acceptRequest': 'Accept friend request',
  'friends.pickUsernameForList': 'Choose a username on the Friends screen so other testers can find you too.',
  'dlg.removeFriend.title': 'Remove {name}?',
  'dlg.removeFriend.body': "You'll stop seeing each other's shared sails. You can send a new request later.",
  'dlg.removeFriend.ok': 'Remove',
  'vis.askTitle': 'Who can see this sail?',
  'vis.askBody': 'You can change this later from the sail’s page.',
  'vis.private': '🔒 Only me',
  'vis.friends': '👥 Friends',
  'vis.chipPrivate': '🔒 Only me',
  'vis.chipFriends': '👥 Friends can see this',
  'vis.nowPrivate': 'Only you can see this sail now',
  'vis.nowFriends': 'Your friends can see this sail now',
});

// A "two people" icon for the visibility question, used through showConfirm().
CONFIRM_ICONS.users = '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.3c2.5.4 4.5 2.5 4.5 5.4"/>';

let _friendsReloadQueued = false;
let friendsState = { loaded:false, loading:false, failed:false, me:null, rows:[], people:{} };
let friendUsernameEditing = false;   // true while the "change username" form is open
let openFriendId = null;             // whose page screen-friend is showing
let friendPageFrom = 'friends';      // screen the friend page's back arrow returns to
// TESTING: every public card on the app (see SHOW_ALL_SAILORS_FOR_TESTING)
let allSailors = { list:null, loading:false, failed:false };

function resetFriendsState(){
  friendsState = { loaded:false, loading:false, failed:false, me:null, rows:[], people:{} };
  friendUsernameEditing = false;
  allSailors = { list:null, loading:false, failed:false };
}

/* ---------- derived lists ---------- */
function friendOtherId(row){ return row.requester_id === state.user.id ? row.addressee_id : row.requester_id; }
function friendRows(){ return friendsState.rows.filter(r=>r.status==='accepted'); }
function incomingRequests(){ return friendsState.rows.filter(r=>r.status==='pending' && r.addressee_id===state.user.id); }
function outgoingRequests(){ return friendsState.rows.filter(r=>r.status==='pending' && r.requester_id===state.user.id); }
function friendshipWith(userId){ return friendsState.rows.find(r=>friendOtherId(r)===userId) || null; }
// Someone's public card: from the friends data, or failing that the all-sailors list.
function personById(id){
  return friendsState.people[id] || (allSailors.list||[]).find(p=>p.user_id===id) || null;
}
function personName(p){ return (p && (p.display_name || p.username)) || t('default.sailorName'); }

/* ---------- loading ---------- */
// Pulls this person's public card, every friendship row they're part of, and
// the public cards of everyone on the other side of those rows.
async function loadFriendsData(){
  if(!state.user){ resetFriendsState(); refreshFriendsUI(); return; }
  if(friendsState.loading){ _friendsReloadQueued = true; return; } // one more pass once this finishes
  friendsState.loading = true;
  _friendsReloadQueued = false;
  const me = state.user.id;
  try{
    const sb = getSupabaseClient();
    const [mine, rel] = await Promise.all([
      sb.from('public_profiles').select('user_id,username,display_name,avatar_url').eq('user_id', me).maybeSingle(),
      sb.from('friendships').select('id,requester_id,addressee_id,status,created_at')
    ]);
    if(mine.error) throw mine.error;
    if(rel.error) throw rel.error;
    const rows = rel.data || [];
    const otherIds = [...new Set(rows.map(r=> r.requester_id===me ? r.addressee_id : r.requester_id))];
    const people = {};
    if(otherIds.length){
      const { data, error } = await sb.from('public_profiles')
        .select('user_id,username,display_name,avatar_url').in('user_id', otherIds);
      if(error) throw error;
      (data||[]).forEach(p=>{ people[p.user_id] = p; });
    }
    if(!state.user || state.user.id !== me) return; // signed out / switched account while loading
    friendsState = { loaded:true, loading:false, failed:false, me: mine.data || null, rows, people };
  }catch(e){
    console.error('friends load failed', e);
    friendsState.failed = !friendsState.loaded;
  }finally{
    friendsState.loading = false;
  }
  if(!state.user || state.user.id !== me) return;
  if(_friendsReloadQueued){ _friendsReloadQueued = false; return loadFriendsData(); }
  refreshFriendsUI();
  // Keep the public card's name/photo in step with the local profile, quietly.
  if(friendsState.me) syncPublicProfileIfSignedIn(true);
}

// Called by applySession() (auth.js) whenever the signed-in account changes.
function onFriendsSessionChanged(){
  const uid = state.user ? state.user.id : null;
  if(onFriendsSessionChanged._last === uid) return;
  onFriendsSessionChanged._last = uid;
  resetFriendsState();
  refreshFriendsUI();
  if(uid) loadFriendsData();
}

// Redraws whatever friends UI is currently visible, plus the nav badge.
function refreshFriendsUI(){
  updateFriendsBadge();
  const active = (document.querySelector('.screen.active')||{}).id;
  if(active==='screen-friends') renderFriendsScreen();
  if(active==='screen-friend') renderFriendPage();
  if(active==='screen-profile' && typeof renderProfileFriends==='function'){ renderProfileFriends(); renderProfileSailors(); }
}
function updateFriendsBadge(){
  const n = state.user && friendsState.loaded ? incomingRequests().length : 0;
  const el = document.getElementById('navFriendsBadge');
  if(el){ el.textContent = n>9 ? '9+' : String(n); el.style.display = n ? 'flex' : 'none'; }
}

/* ---------- public card (username / name / small avatar) ---------- */
// Shrinks the profile photo to a small square JPEG so the public card stays light.
function smallAvatarFrom(src){
  return new Promise(resolve=>{
    if(!src) return resolve(null);
    const img = new Image();
    img.onload = ()=>{
      const size = 128, c = document.createElement('canvas');
      c.width = size; c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, size, size);
      try{ resolve(c.toDataURL('image/jpeg', 0.8)); }catch(e){ resolve(null); }
    };
    img.onerror = ()=>resolve(null);
    img.src = src;
  });
}
let _publicAvatarCache = { src:null, small:null };
async function currentSmallAvatar(){
  const src = state.profile.avatar || null;
  if(_publicAvatarCache.src !== src){ _publicAvatarCache = { src, small: await smallAvatarFrom(src) }; }
  return _publicAvatarCache.small;
}
// Pushes the local name + photo to the public card (only once a username exists).
// onlyIfChanged skips the write when nothing differs.
async function syncPublicProfileIfSignedIn(onlyIfChanged){
  if(!state.user || !friendsState.me) return;
  const display_name = (state.profile.name||'').trim() || null;
  const avatar_url = await currentSmallAvatar();
  if(onlyIfChanged && friendsState.me.display_name===display_name && friendsState.me.avatar_url===avatar_url) return;
  const { error } = await getSupabaseClient().from('public_profiles')
    .update({ display_name, avatar_url, updated_at: new Date().toISOString() }).eq('user_id', state.user.id);
  if(error){ console.error('public profile sync failed', error); return; }
  friendsState.me = { ...friendsState.me, display_name, avatar_url };
}

async function saveUsername(){
  const input = document.getElementById('friendUsernameInput');
  const errEl = document.getElementById('friendUsernameError');
  const username = (input.value||'').trim().toLowerCase().replace(/^@/, '');
  errEl.style.display = 'none';
  if(!/^[a-z0-9_.]{3,20}$/.test(username)){ errEl.textContent = t('friends.badFormat'); errEl.style.display = 'block'; return; }
  const btn = document.getElementById('friendUsernameSave');
  btn.disabled = true;
  try{
    const row = {
      user_id: state.user.id, username,
      display_name: (state.profile.name||'').trim() || null,
      avatar_url: await currentSmallAvatar(),
      updated_at: new Date().toISOString()
    };
    const { error } = await getSupabaseClient().from('public_profiles').upsert(row);
    if(error){
      if(error.code === '23505'){ errEl.textContent = t('friends.taken'); errEl.style.display = 'block'; return; }
      throw error;
    }
    friendsState.me = row;
    friendUsernameEditing = false;
    showToast(t('friends.saved'));
    refreshFriendsUI();
  }catch(e){
    console.error('username save failed', e);
    errEl.textContent = t('friends.actionFailed'); errEl.style.display = 'block';
  }finally{
    btn.disabled = false;
  }
}
function startChangeUsername(){ friendUsernameEditing = true; renderFriendsScreen(); }
function cancelChangeUsername(){ friendUsernameEditing = false; renderFriendsScreen(); }

/* ---------- friend requests ---------- */
async function sendFriendRequest(userId){
  if(!friendsState.me){ showToast(t('friends.needUsername')); return; }
  const { error } = await getSupabaseClient().from('friendships')
    .insert({ requester_id: state.user.id, addressee_id: userId });
  if(error && error.code !== '23505'){ console.error(error); showToast(t('friends.actionFailed')); return; }
  showToast(t('friends.requestSent'));
  await loadFriendsData();
  rerenderFriendSearch();
}
async function acceptFriendRequest(rowId){
  const { error } = await getSupabaseClient().rpc('accept_friend_request', { request_id: rowId });
  if(error){ console.error(error); showToast(t('friends.actionFailed')); return; }
  showToast(t('friends.nowFriends'));
  await loadFriendsData();
  rerenderFriendSearch();
}
// Decline / cancel / unfriend — all the same delete.
async function deleteFriendship(rowId){
  const { error } = await getSupabaseClient().from('friendships').delete().eq('id', rowId);
  if(error){ console.error(error); showToast(t('friends.actionFailed')); return false; }
  await loadFriendsData();
  rerenderFriendSearch();
  return true;
}
async function removeFriendPrompt(userId){
  const row = friendshipWith(userId);
  if(!row) return;
  const name = personName(friendsState.people[userId]);
  if(!(await confirmDialog('removeFriend', {danger:true, icon:'userMinus', vars:{name}}))) return;
  if(await deleteFriendship(row.id)){ showToast(t('friends.removed')); nav('friends'); }
}

/* ---------- search ---------- */
let _friendSearchTimer = null;
let _friendSearchResults = null; // last result list, so status buttons can be redrawn after an action
function onFriendSearchInput(){
  clearTimeout(_friendSearchTimer);
  _friendSearchTimer = setTimeout(runFriendSearch, 350);
}
async function runFriendSearch(){
  const box = document.getElementById('friendSearchResults');
  const input = document.getElementById('friendSearchInput');
  if(!box || !input || !state.user) return;
  const q = input.value.trim().replace(/^@/, '');
  if(q.length < 2){ _friendSearchResults = null; box.innerHTML = q.length ? `<div class="fr-hint">${t('friends.searchHint')}</div>` : ''; return; }
  const like = '%' + q.replace(/[\\%_]/g, m=>'\\'+m) + '%'; // treat _ and % as plain characters
  const sb = getSupabaseClient();
  const cols = 'user_id,username,display_name,avatar_url';
  try{
    const [byUser, byName] = await Promise.all([
      sb.from('public_profiles').select(cols).ilike('username', like).neq('user_id', state.user.id).limit(20),
      sb.from('public_profiles').select(cols).ilike('display_name', like).neq('user_id', state.user.id).limit(20)
    ]);
    if(byUser.error) throw byUser.error;
    if(byName.error) throw byName.error;
    if(input.value.trim().replace(/^@/, '') !== q) return; // typed on since — a newer search will draw
    const seen = new Map();
    [...(byUser.data||[]), ...(byName.data||[])].forEach(p=>seen.set(p.user_id, p));
    _friendSearchResults = [...seen.values()];
    rerenderFriendSearch();
  }catch(e){
    console.error('friend search failed', e);
    box.innerHTML = `<div class="fr-hint">${t('friends.actionFailed')}</div>`;
  }
}
function rerenderFriendSearch(){
  const box = document.getElementById('friendSearchResults');
  if(!box || !_friendSearchResults) return;
  if(!_friendSearchResults.length){ box.innerHTML = `<div class="fr-hint">${t('friends.noResults')}</div>`; return; }
  box.innerHTML = _friendSearchResults.map(p=>friendRowHtml(p, friendActionHtml(p.user_id), `openFriendPage('${p.user_id}')`)).join('');
}
// The status/button for one person: Friends ✓ / Requested / Accept / Add.
function friendActionHtml(userId){
  const row = friendshipWith(userId);
  if(row && row.status==='accepted') return `<span class="fr-status">${t('friends.isFriend')}</span>`;
  if(row && row.requester_id===state.user.id) return `<span class="fr-status">${t('friends.requested')}</span>`;
  if(row) return `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();acceptFriendRequest('${row.id}')">${t('friends.accept')}</button>`;
  return `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();sendFriendRequest('${userId}')">${t('friends.add')}</button>`;
}

/* ---------- TESTING: everyone on the app ---------- */
// Every public card except your own, A–Z. Only people who've chosen a username have one.
async function loadAllSailors(){
  if(!SHOW_ALL_SAILORS_FOR_TESTING || !state.user || allSailors.loading) return;
  allSailors.loading = true;
  const me = state.user.id;
  try{
    const { data, error } = await getSupabaseClient().from('public_profiles')
      .select('user_id,username,display_name,avatar_url').neq('user_id', me).limit(500);
    if(error) throw error;
    if(!state.user || state.user.id !== me) return;
    allSailors = { list: (data||[]).sort((a,b)=>personName(a).localeCompare(personName(b))), loading:false, failed:false };
  }catch(e){
    console.error('all sailors load failed', e);
    allSailors = { list: allSailors.list, loading:false, failed: !allSailors.list };
  }finally{
    allSailors.loading = false;
  }
  refreshFriendsUI();
}
function allSailorsListHtml(){
  if(!allSailors.list){
    if(!allSailors.loading && !allSailors.failed) loadAllSailors();
    return `<div class="fr-hint">${allSailors.failed ? t('friends.loadFailed') : t('friends.loading')}</div>`;
  }
  if(!allSailors.list.length) return `<div class="fr-hint" style="padding:14px 4px;">${t('friends.onAppEmpty')}</div>`;
  return allSailors.list.map(p=>friendRowHtml(p, friendActionHtml(p.user_id), `openFriendPage('${p.user_id}')`)).join('');
}

// Profile screen row: sideways-scrolling photo cards (same look as the old Crew row),
// your own card first, then everyone else. Tap a card to open that sailor's page.
function renderProfileSailors(){
  const wrap = document.getElementById('profileSailorsWrap');
  const el = document.getElementById('profileSailors');
  if(!wrap || !el) return;
  if(!SHOW_ALL_SAILORS_FOR_TESTING || !state.user){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  if(!allSailors.list){
    if(!allSailors.loading && !allSailors.failed) loadAllSailors();
    el.innerHTML = `<div class="fr-hint">${allSailors.failed ? t('friends.loadFailed') : t('friends.loading')}</div>`;
    return;
  }
  const loaded = friendsState.loaded;
  const meCard = friendsState.me
    ? `<div class="pf-crew-card pf-sailor-card me">
        <img src="${state.profile.avatar || friendsState.me.avatar_url || placeholderAvatar()}" alt="">
        <div class="nm">${escapeHtml((state.profile.name||'').trim() || personName(friendsState.me))}</div>
        <div class="sb">@${escapeHtml(friendsState.me.username)}</div>
        <div class="pf-sailor-act"><span class="fr-status">${t('friends.you')}</span></div>
      </div>` : '';
  const cards = allSailors.list.map(p=>`<div class="pf-crew-card pf-sailor-card" onclick="openFriendPage('${p.user_id}','profile')">
      <img src="${p.avatar_url || placeholderAvatar()}" alt="">
      <div class="nm">${escapeHtml(personName(p))}</div>
      <div class="sb">${p.username ? '@'+escapeHtml(p.username) : ''}</div>
      ${loaded && friendsState.me ? `<div class="pf-sailor-act">${friendActionHtml(p.user_id)}</div>` : ''}
    </div>`).join('');
  const hint = loaded && !friendsState.me ? `<div class="fr-hint" style="text-align:left;padding:0 2px 10px;">${t('friends.pickUsernameForList')}</div>` : '';
  el.innerHTML = (meCard || cards)
    ? `${hint}<div class="pf-crew-scroll">${meCard}${cards}</div>`
    : `${hint}<div class="fr-hint" style="padding:14px 4px;">${t('friends.onAppEmpty')}</div>`;
}

/* ---------- rendering ---------- */
function friendRowHtml(p, actionHtml, onclick){
  return `<div class="row-card fr-row"${onclick ? ` onclick="${onclick}"` : ''}>
    <img class="row-photo round" src="${(p && p.avatar_url) || placeholderAvatar()}" alt="">
    <div class="row-info"><div class="name">${escapeHtml(personName(p))}</div>
      <div class="sub">${p && p.username ? '@'+escapeHtml(p.username) : ''}</div></div>
    ${actionHtml ? `<div class="fr-actions">${actionHtml}</div>` : ''}
  </div>`;
}

function renderFriendsScreen(){
  const out = document.getElementById('friendsSignedOut');
  const main = document.getElementById('friendsMain');
  const meBox = document.getElementById('friendsMeCard');
  const lists = document.getElementById('friendsLists');
  const searchWrap = document.getElementById('friendSearchWrap');
  if(!out) return;

  if(!state.user){ out.style.display = 'block'; main.style.display = 'none'; return; }
  out.style.display = 'none'; main.style.display = 'block';

  if(!friendsState.loaded){
    searchWrap.style.display = 'none'; lists.innerHTML = '';
    meBox.innerHTML = friendsState.failed
      ? `<div class="fr-hint">${t('friends.loadFailed')}</div><button class="btn btn-outline" style="margin-top:10px;" onclick="loadFriendsData()">${t('friends.retry')}</button>`
      : `<div class="fr-hint">${t('friends.loading')}</div>`;
    if(!friendsState.loading && !friendsState.failed) loadFriendsData();
    return;
  }

  // 1. Your username — a form until one is chosen (or while changing it)
  const me = friendsState.me;
  if(!me || friendUsernameEditing){
    meBox.innerHTML = `<div class="form-card">
      <div class="fr-card-title">${t('friends.chooseTitle')}</div>
      <p class="fr-hint" style="margin:4px 0 12px;text-align:left;">${t('friends.chooseHint')}</p>
      <input type="text" id="friendUsernameInput" maxlength="21" autocapitalize="none" autocomplete="off" spellcheck="false"
        placeholder="${t('friends.usernamePh')}" value="${me ? escapeHtml(me.username) : ''}">
      <div class="fr-error" id="friendUsernameError" style="display:none;"></div>
      <button class="btn btn-primary" id="friendUsernameSave" style="margin-top:12px;" onclick="saveUsername()">${t('friends.save')}</button>
      ${me ? `<button class="btn btn-outline" style="margin-top:8px;" onclick="cancelChangeUsername()">${t('friends.cancel')}</button>` : ''}
    </div>`;
  } else {
    meBox.innerHTML = friendRowHtml({ ...me, display_name: (state.profile.name||'').trim() || me.display_name, avatar_url: state.profile.avatar || me.avatar_url },
      `<button class="btn btn-outline btn-sm" onclick="startChangeUsername()">${t('friends.change')}</button>`, '');
  }
  searchWrap.style.display = me ? 'block' : 'none';

  // 2. Requests in, requests out, friends
  const P = id=>friendsState.people[id] || null;
  const incoming = incomingRequests(), outgoing = outgoingRequests(), friends = friendRows();
  let html = '';
  if(incoming.length){
    html += `<div class="section-title">${t('friends.requests')}</div>` + incoming.map(r=>friendRowHtml(P(r.requester_id),
      `<button class="btn btn-primary btn-sm" onclick="acceptFriendRequest('${r.id}')">${t('friends.accept')}</button>
       <button class="btn btn-outline btn-sm" onclick="deleteFriendship('${r.id}')">${t('friends.decline')}</button>`, '')).join('');
  }
  if(outgoing.length){
    html += `<div class="section-title">${t('friends.sent')}</div>` + outgoing.map(r=>friendRowHtml(P(r.addressee_id),
      `<button class="btn btn-outline btn-sm" onclick="deleteFriendship('${r.id}')">${t('friends.cancelRequest')}</button>`, '')).join('');
  }
  html += `<div class="section-title">${t('friends.yourFriends')}</div>`;
  const sorted = friends.map(r=>friendOtherId(r)).sort((a,b)=>personName(P(a)).localeCompare(personName(P(b))));
  html += sorted.length
    ? sorted.map(id=>friendRowHtml(P(id) || {user_id:id}, '', `openFriendPage('${id}')`)).join('')
    : `<div class="fr-hint" style="padding:14px 4px;">${t('friends.noFriends')}</div>`;
  if(SHOW_ALL_SAILORS_FOR_TESTING && me){
    html += `<div class="section-title">${t('friends.onApp')}</div>
      <div class="fr-hint" style="text-align:left;padding:0 4px 8px;">${t('friends.onAppHint')}</div>` + allSailorsListHtml();
  }
  lists.innerHTML = html;
  rerenderFriendSearch();
}

// The "Friends" card on the Profile screen: a few faces, a count, and a badge for new requests.
function renderProfileFriends(){
  const el = document.getElementById('profileFriends');
  if(!el) return;
  if(!state.user){
    el.innerHTML = `<div class="row-card fr-summary" onclick="openAuthSheet('signin')">
      <div class="row-info"><div class="name">${t('friends.signedOutTitle')}</div><div class="sub">${t('friends.signedOutHint')}</div></div>
      <svg class="fr-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>`;
    return;
  }
  if(!friendsState.loaded && !friendsState.loading && !friendsState.failed) loadFriendsData();
  const ids = friendsState.loaded ? friendRows().map(friendOtherId) : [];
  const pending = friendsState.loaded ? incomingRequests().length : 0;
  const faces = ids.slice(0,4).map(id=>`<img src="${(friendsState.people[id]||{}).avatar_url || placeholderAvatar()}" alt="">`).join('');
  const countText = !friendsState.loaded ? (friendsState.failed ? t('friends.title') : t('friends.loading')) : ids.length===1 ? t('friends.countOne') : ids.length ? t('friends.count', {n: ids.length}) : t('friends.title');
  el.innerHTML = `<div class="row-card fr-summary" onclick="nav('friends')">
    ${faces ? `<div class="fr-faces">${faces}</div>` : ''}
    <div class="row-info"><div class="name">${countText}</div>${ids.length ? '' : `<div class="sub">${t('friends.cardEmpty')}</div>`}</div>
    ${pending ? `<span class="fr-pill">${t('friends.pending', {n: pending})}</span>` : ''}
    <svg class="fr-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
  </div>`;
}

/* ---------- one friend's page ---------- */
let _friendSails = { userId:null, list:null, failed:false };
// from = the screen the back arrow should return to ('friends' or 'profile').
// Works for anyone: friends see shared sails; for everyone else the page offers Add / Accept.
function openFriendPage(userId, from){
  openFriendId = userId;
  friendPageFrom = from || 'friends';
  const row = friendshipWith(userId);
  const isFriend = !!(row && row.status==='accepted');
  _friendSails = { userId, list:null, failed:false, requested:isFriend };
  if(isFriend) loadFriendSails(userId);
  nav('friend');
}
function friendPageBack(){ nav(friendPageFrom || 'friends'); }
async function loadFriendSails(userId){
  try{
    // Only the summary fields — photos and GPS tracks load when a sail is opened.
    const { data, error } = await getSupabaseClient().from('trips')
      .select('id,title:data->>title,date:data->>date,distanceNm:data->distanceNm,elapsedSeconds:data->elapsedSeconds,place:data->>place,coverPhoto:data->>coverPhoto')
      .eq('user_id', userId).is('deleted_at', null).neq('visibility', 'private');
    if(error) throw error;
    if(openFriendId !== userId) return;
    _friendSails = { userId, list: (data||[]).sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)), failed:false };
  }catch(e){
    console.error('friend sails load failed', e);
    _friendSails = { userId, list:null, failed:true };
  }
  if((document.querySelector('.screen.active')||{}).id==='screen-friend') renderFriendPage();
}
function renderFriendPage(){
  const body = document.getElementById('friendBody');
  if(!body || !openFriendId) return;
  const p = personById(openFriendId) || {};
  const name = personName(p);
  document.getElementById('friendTitle').textContent = name;
  const row = friendshipWith(openFriendId);
  const isFriend = !!(row && row.status==='accepted');
  let sails;
  if(!isFriend){
    // Not friends (yet): no sails to show — the database wouldn't return them anyway.
    let action;
    if(!friendsState.me) action = `<button class="btn btn-primary" onclick="nav('friends')">${t('friends.chooseTitle')}</button>`;
    else if(row && row.requester_id===state.user.id) action = `<div class="fr-hint">${t('friends.requestPending', {name: escapeHtml(name)})}</div>`;
    else if(row) action = `<button class="btn btn-primary" onclick="acceptFriendRequest('${row.id}')">${t('friends.acceptRequest')}</button>`;
    else action = `<button class="btn btn-primary" onclick="sendFriendRequest('${openFriendId}')">${t('friends.addFriend')}</button>`;
    sails = `<div class="fr-hint" style="padding:14px 4px;">${t('friends.notFriendsYet', {name: escapeHtml(name)})}</div>${action}`;
  }
  else if(_friendSails.userId===openFriendId && !_friendSails.list && !_friendSails.failed && !_friendSails.requested){
    _friendSails.requested = true; loadFriendSails(openFriendId); // just became friends while on this page
    sails = `<div class="fr-hint">${t('friends.loading')}</div>`;
  }
  else if(_friendSails.failed) sails = `<div class="fr-hint">${t('friends.loadFailed')}</div>`;
  else if(!_friendSails.list) sails = `<div class="fr-hint">${t('friends.loading')}</div>`;
  else if(!_friendSails.list.length) sails = `<div class="fr-hint" style="padding:14px 4px;">${t('friends.noSharedSails', {name: escapeHtml(name)})}</div>`;
  else sails = _friendSails.list.map(s=>{
    const d = new Date(s.date);
    const meta = [isNaN(d) ? '' : d.toLocaleDateString(currentLocale(), {day:'numeric', month:'short', year:'numeric'}),
      s.place ? '📍 '+escapeHtml(s.place) : '', fmtDistance(Number(s.distanceNm)||0)].filter(Boolean).join(' · ');
    return `<div class="row-card" onclick="openFriendTrip('${s.id}')">
      ${s.coverPhoto ? `<img class="row-photo" src="${s.coverPhoto}" alt="">` : `<div class="row-photo fr-noimg">⛵</div>`}
      <div class="row-info"><div class="name">${escapeHtml(s.title || t('detail.tripFallback'))}</div><div class="sub">${meta}</div></div>
    </div>`;
  }).join('');
  body.innerHTML = `
    <div class="fr-hero">
      <img src="${p.avatar_url || placeholderAvatar()}" alt="">
      <div class="fr-hero-name">${escapeHtml(name)}</div>
      ${p.username ? `<div class="fr-hero-user">@${escapeHtml(p.username)}</div>` : ''}
    </div>
    <div class="section-divider pf"><span>${t('friends.sharedSails')}</span></div>
    ${sails}
    ${isFriend ? `<div class="link-plain" style="color:var(--coral);text-align:center;margin-top:22px;" onclick="removeFriendPrompt('${openFriendId}')">${t('friends.remove')}</div>` : ''}`;
}
async function openFriendTrip(tripId){
  try{
    const { data, error } = await getSupabaseClient().from('trips').select('data').eq('id', tripId).single();
    if(error) throw error;
    const p = personById(openFriendId) || {};
    openTripDetail(null, 'friend', { trip: data.data, ownerName: personName(p) });
  }catch(e){
    console.error('friend trip load failed', e);
    showToast(t('toast.tripLoadFail'));
  }
}

/* ---------- sail visibility ---------- */
// Asked once when a NEW sail is saved (signed in only). Tapping outside = Only me.
async function askTripVisibility(){
  const friends = await showConfirm(t('vis.askBody'), {
    title: t('vis.askTitle'), okLabel: t('vis.friends'), cancelLabel: t('vis.private'), icon: 'users'
  });
  return friends ? 'friends' : 'private';
}
function tripVisibilityChipHtml(trip){
  const isFriends = trip.visibility === 'friends';
  return `<div class="vis-chip${isFriends ? ' on' : ''}" onclick="toggleTripVisibility()">${isFriends ? t('vis.chipFriends') : t('vis.chipPrivate')}</div>`;
}
// Flips the open sail between Only me and Friends, saves it, and pushes it up.
async function toggleTripVisibility(){
  const trip = window._detailTrip;
  if(!trip || window._friendDetail || !state.user) return;
  trip.visibility = trip.visibility === 'friends' ? 'private' : 'friends';
  trip.updatedAt = new Date().toISOString();
  await storeSet('trip:'+trip.id, trip);
  const chip = document.querySelector('#detailBody .vis-chip');
  if(chip) chip.outerHTML = tripVisibilityChipHtml(trip);
  showToast(trip.visibility === 'friends' ? t('vis.nowFriends') : t('vis.nowPrivate'));
  syncTripIfSignedIn(trip);
}

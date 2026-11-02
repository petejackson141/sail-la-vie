// ===== crew-friends.js =====
// MERGING CREW AND FRIENDS (02.11.2026)
//
// Your Crew cards are people you've typed in yourself. Friends are real Sail la
// Vie accounts. Often they're the same person ("Dan" in your crew = @Dan Cohen
// as a friend). This file links the two, always asking first:
//
//   1. "Same person?" — when a friend's name matches a crew card, the app asks
//      whether they're the same person. Yes = the crew card gets linked to the
//      friend (crew.friendUserId). No = it never asks about that pair again
//      (crew.notSameAs). It's also possible by hand: "Link to a friend" on the
//      crew card, or "Link to a crew card" on a friend's page.
//   2. "Share your past sails?" — once linked, if you've sailed together, the
//      app offers to send those sails to the friend's app. Yes = each one goes
//      through the normal "Send to a friend's app" route (sail_shares, share.js).
//   3. The friend still decides: each sail waits at the top of their History
//      to Add or Decline (plus "Add all" when several came from the same person).
//
// Nothing new in the database: the link is stored on the crew card itself, which
// already syncs (crew table, data jsonb). Sails a friend sent YOU are never
// offered back to them.

Object.assign(TRANSLATIONS.en, {
  'cf.sameTitle': 'Same person?',
  'cf.sameBody': '"{crew}" in your crew looks like your friend {friend}. Link them, so your crew card and their account are one person?',
  'cf.sameYes': 'Yes, link them',
  'cf.sameNo': 'No, different people',
  'cf.linked': 'Linked to {name} ⚓',
  'cf.shareTitle': 'Share your past sails?',
  'cf.shareBodyOne': "You've sailed once with {name}. Send that sail to their app? They can add it to their log or decline it.",
  'cf.shareBodyMany': "You've sailed {n} times with {name}. Send these sails to their app? They can add each one to their log or decline it.",
  'cf.shareYes': 'Send',
  'cf.shareNo': 'Not now',
  'cf.sending': 'Sending sails…',
  'cf.sentMany': 'Sent {n} sails to {name} ⛵',
  'cf.sentOne': 'Sent 1 sail to {name} ⛵',
  'cf.nothingNew': 'No new sails to send to {name}.',
  'cf.linkedTo': 'Linked to your friend',
  'cf.unlink': 'Unlink',
  'cf.unlinkConfirm': 'Unlink {crew} from {friend}? Your sails stay as they are.',
  'cf.unlinked': 'Unlinked',
  'cf.sendOurSails': 'Send our sails to their app',
  'cf.linkToFriend': 'Link to a friend',
  'cf.linkToFriendHint': 'Is this person on Sail la Vie? Link their crew card to their account.',
  'cf.pickFriendTitle': 'Which friend is {crew}?',
  'cf.pickCrewTitle': 'Which crew card is {friend}?',
  'cf.noFriendsToLink': 'No friends to link yet. Add them on the Friends screen first.',
  'cf.noCrewToLink': 'No unlinked crew cards. Add them to your Crew first.',
  'cf.inYourCrew': 'In your crew as {crew}',
  'cf.linkToCrew': 'Link to a crew card',
  'cf.link': 'Link',
  'cf.friendBadge': '⚓ Friend',
  'share.addAll': 'Add all {n}',
  'share.declineAll': 'Decline all',
  'share.fromHeading': '{n} sails from {name}',
  'share.declineAllConfirm': 'Decline all {n} sails from {name}?',
  'share.addedMany': 'Added {n} sails to your log ⚓',
});

/* ---------- helpers ---------- */
function cfNorm(s){ return String(s||'').replace(/^\s*@/, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function crewLinkedTo(userId){ return state.crew.find(c=>c.friendUserId===userId) || null; }
function acceptedFriendIds(){ return state.user && friendsState.loaded ? friendRows().map(friendOtherId) : []; }

// Does this crew card's name look like this friend? Full name or username match,
// or a one-word crew name ("Dan") matching the friend's first name ("Dan Cohen").
function crewNameMatches(crew, person){
  const cn = cfNorm(crew.name);
  if(!cn || !person) return false;
  const names = [person.display_name, person.username].map(cfNorm).filter(Boolean);
  if(names.includes(cn)) return true;
  if(!cn.includes(' ')) return names.some(n=>n.split(' ')[0] === cn);
  return false;
}

async function saveCrewCard(c){
  c.updatedAt = new Date().toISOString();
  const ok = await storeSet(KEYS.CREW, state.crew);
  if(ok) syncCrewIfSignedIn(c);
  if(typeof renderCrew === 'function') renderCrew();
  return ok;
}

/* ---------- 1. automatic "Same person?" check ----------
   Runs after the friends list loads (friends.js). Asks about at most one pair
   at a time; the answer is saved either way, so it never asks twice. */
let _cfAsking = false;
async function checkCrewFriendMatches(){
  if(_cfAsking || !state.user || !friendsState.loaded) return;
  if(typeof currentTrip !== 'undefined' && currentTrip) return;          // not during a recording or log entry
  if(document.visibilityState === 'hidden') return;
  if(document.querySelector('.cc-overlay.show, .sheet[style*="block"]')) return; // something else is open
  for(const fid of acceptedFriendIds()){
    if(crewLinkedTo(fid)) continue;
    const person = personById(fid);
    const matches = state.crew.filter(c=>!c.friendUserId && !(c.notSameAs||[]).includes(fid) && crewNameMatches(c, person));
    if(matches.length !== 1) continue;   // none, or too many to guess between (use the manual link)
    const crew = matches[0];
    _cfAsking = true;
    const yes = await showConfirm(t('cf.sameBody', {crew: crew.name, friend: personName(person)}),
      { title: t('cf.sameTitle'), okLabel: t('cf.sameYes'), cancelLabel: t('cf.sameNo'), icon: 'users' });
    _cfAsking = false;
    if(yes) await linkCrewToFriend(crew.id, fid);
    else { crew.notSameAs = [...new Set([...(crew.notSameAs||[]), fid])]; await saveCrewCard(crew); }
    return; // one question per check
  }
}

/* ---------- linking / unlinking ---------- */
async function linkCrewToFriend(crewId, userId){
  const crew = state.crew.find(c=>c.id===crewId);
  if(!crew) return;
  const other = crewLinkedTo(userId);             // one crew card per friend
  if(other && other.id !== crewId){ delete other.friendUserId; await saveCrewCard(other); }
  crew.friendUserId = userId;
  crew.notSameAs = (crew.notSameAs||[]).filter(id=>id!==userId);
  await saveCrewCard(crew);
  closeSheets();
  showToast(t('cf.linked', {name: personName(personById(userId))}));
  refreshCrewFriendViews();
  await offerShareSailsWith(crewId);
}
async function unlinkCrew(crewId){
  const crew = state.crew.find(c=>c.id===crewId);
  if(!crew || !crew.friendUserId) return;
  const fid = crew.friendUserId;
  if(!(await showConfirm(t('cf.unlinkConfirm', {crew: crew.name, friend: personName(personById(fid))}), {title: t('cf.unlink'), okLabel: t('cf.unlink'), icon: 'userMinus'}))) return;
  delete crew.friendUserId;
  crew.notSameAs = [...new Set([...(crew.notSameAs||[]), fid])]; // don't ask "Same person?" again
  await saveCrewCard(crew);
  showToast(t('cf.unlinked'));
  refreshCrewFriendViews();
}
function refreshCrewFriendViews(){
  const active = (document.querySelector('.screen.active')||{}).id;
  if(active==='screen-friend' && typeof renderFriendPage==='function') renderFriendPage();
  const crewSheet = document.getElementById('sheetCrew');
  if(crewSheet && crewSheet.style.display==='block' && typeof editingCrewId!=='undefined') renderCrewFriendLink(editingCrewId);
}

/* ---------- 2. "Share your past sails?" ---------- */
// Your own sails (not ones a friend sent you) with this crew card aboard,
// as crew or skipper, that haven't already been sent to that friend.
async function sailsWithCrew(crew){
  const already = new Set(crew.sentToFriend || []);
  const out = [];
  for(const e of state.tripIndex){
    if(already.has(e.id)) continue;
    const trip = await storeGet('trip:'+e.id);
    if(!trip || trip.receivedFrom) continue;
    if((trip.crewIds||[]).includes(crew.id) || trip.skipperId===crew.id) out.push(trip);
  }
  return out;
}
async function offerShareSailsWith(crewId, fromButton){
  const crew = state.crew.find(c=>c.id===crewId);
  if(!crew || !crew.friendUserId || !state.user) return;
  const name = personName(personById(crew.friendUserId));
  const trips = await sailsWithCrew(crew);
  if(!trips.length){ if(fromButton) showToast(t('cf.nothingNew', {name})); return; }
  const body = trips.length===1 ? t('cf.shareBodyOne', {name}) : t('cf.shareBodyMany', {n: trips.length, name});
  if(!(await showConfirm(body, {title: t('cf.shareTitle'), okLabel: t('cf.shareYes'), cancelLabel: t('cf.shareNo'), icon: 'check'}))) return;
  await sendSailsToFriend(crew, trips);
}
async function sendSailsToFriend(crew, trips){
  const userId = crew.friendUserId, name = personName(personById(userId));
  showToast(t('cf.sending'));
  const senderName = (friendsState.me && personName(friendsState.me)) || state.profile.name || null;
  const sent = [];
  try{
    for(const trip of trips){
      try{ await offloadTripPhotos(trip); }catch(e){} // the friend can only open photos that are in the cloud
      const { error } = await getSupabaseClient().from('sail_shares').insert({
        sender_id: state.user.id, recipient_id: userId, trip_id: trip.id,
        sender_name: senderName, data: sailForFriend(trip)
      });
      if(error) throw error;
      sent.push(trip.id);
    }
  }catch(e){
    console.error('sending sails to friend failed', e);
    showToast(/sail_shares|relation|permission/i.test(e.message||'') ? t('share.notSetUp') : t('share.failed'));
  }
  if(sent.length){
    crew.sentToFriend = [...new Set([...(crew.sentToFriend||[]), ...sent])]; // so they're not offered again
    await saveCrewCard(crew);
    showToast(sent.length===1 ? t('cf.sentOne', {name}) : t('cf.sentMany', {n: sent.length, name}));
  }
}

/* ---------- manual linking: the picker sheet ---------- */
function openLinkFriendPicker(crewId){
  const crew = state.crew.find(c=>c.id===crewId); if(!crew) return;
  const linked = new Set(state.crew.filter(c=>c.friendUserId).map(c=>c.friendUserId));
  const friends = acceptedFriendIds().filter(id=>!linked.has(id)).map(personById).filter(Boolean);
  document.getElementById('linkCrewTitle').textContent = t('cf.pickFriendTitle', {crew: crew.name});
  document.getElementById('linkCrewList').innerHTML = friends.length
    ? friends.map(p=>friendRowHtml(p, `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();linkCrewToFriend('${safeId(crewId)}','${safeId(p.user_id)}')">${t('cf.link')}</button>`)).join('')
    : `<p class="fr-hint">${t('cf.noFriendsToLink')}</p>`;
  closeSheets();
  setTimeout(()=>openSheet('sheetLinkCrew'), 60);
}
function openLinkCrewPicker(userId){
  const cards = state.crew.filter(c=>!c.friendUserId).sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById('linkCrewTitle').textContent = t('cf.pickCrewTitle', {friend: personName(personById(userId))});
  document.getElementById('linkCrewList').innerHTML = cards.length
    ? cards.map(c=>`<div class="row-card fr-row">
        <img class="row-photo round" src="${safeSrc(c.photo||placeholderAvatar())}" alt="">
        <div class="row-info"><div class="name">${escapeHtml(c.name)}</div><div class="sub">${escapeHtml([c.phone, c.email].filter(Boolean).join(' · '))}</div></div>
        <div class="fr-actions"><button class="btn btn-primary btn-sm" onclick="linkCrewToFriend('${safeId(c.id)}','${safeId(userId)}')">${t('cf.link')}</button></div>
      </div>`).join('')
    : `<p class="fr-hint">${t('cf.noCrewToLink')}</p>`;
  openSheet('sheetLinkCrew');
}

/* ---------- what the crew card sheet and friend page show ---------- */
// Inside the crew sheet (boats-crew.js openCrewSheet calls this).
function renderCrewFriendLink(crewId){
  const el = document.getElementById('crewFriendLink');
  if(!el) return;
  const crew = crewId ? state.crew.find(c=>c.id===crewId) : null;
  if(!crew || !state.user){ el.innerHTML = ''; return; }
  if(crew.friendUserId){
    const p = personById(crew.friendUserId);
    el.innerHTML = `<div class="cf-box">
      <div class="cf-label">${t('cf.linkedTo')}</div>
      ${friendRowHtml(p, `<button class="btn btn-ghost btn-sm" style="color:var(--coral);" onclick="unlinkCrew('${safeId(crew.id)}')">${t('cf.unlink')}</button>`)}
      <button class="btn btn-outline btn-sm" style="width:100%;margin-top:8px;" onclick="offerShareSailsWith('${safeId(crew.id)}', true)">${t('cf.sendOurSails')}</button>
    </div>`;
  } else if(acceptedFriendIds().length){
    el.innerHTML = `<div class="cf-box">
      <div class="cf-label">${t('cf.linkToFriendHint')}</div>
      <button class="btn btn-outline btn-sm" style="width:100%;" onclick="openLinkFriendPicker('${safeId(crew.id)}')">${t('cf.linkToFriend')}</button>
    </div>`;
  } else el.innerHTML = '';
}
// On a friend's page (friends.js renderFriendPage), above "Remove friend".
function crewLinkOnFriendPageHtml(userId){
  const crew = crewLinkedTo(userId);
  if(crew) return `<div class="cf-box" style="margin-top:18px;">
      <div class="cf-label">${t('cf.inYourCrew', {crew: escapeHtml(crew.name)})}</div>
      <button class="btn btn-outline btn-sm" style="width:100%;" onclick="offerShareSailsWith('${safeId(crew.id)}', true)">${t('cf.sendOurSails')}</button>
    </div>`;
  if(!state.crew.some(c=>!c.friendUserId)) return '';
  return `<div style="margin-top:18px;"><button class="btn btn-outline btn-sm" style="width:100%;" onclick="openLinkCrewPicker('${safeId(userId)}')">${t('cf.linkToCrew')}</button></div>`;
}

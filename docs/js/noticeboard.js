// ===== noticeboard.js =====
// Sailing Noticeboard: a place to write down PLANNED future sails — date (and optionally a time),
// what the plan is, where, which boat, and notes.
//
// Data: state.noticeboard is an array of plans, saved under KEYS.NOTICEBOARD through storeGet/storeSet
// (so it follows the same storage tiers as everything else) and included in the
// backup/restore file and in "Reset App Data". It also syncs to the signed-in account
// (Supabase table `noticeboard`, same push/merge/tombstone scheme as boats and crew — see
// the noticeboard section of auth.js). A plan looks like:
//   { id, title, date:'YYYY-MM-DD', time:'HH:mm' or '', place, boatId, notes, updatedAt }
// Dates are plain local calendar dates (no timezone maths), so "19 Sept" stays "19 Sept".
//
// The date/time controls reuse the themed picker (dtOpen in journey.js) — it hands the
// answer back through the `apply` callback below and then reopens this form.

let noticeboardFilter = 'upcoming';   // 'upcoming' | 'past' — set by the chips above the list
let editingNoticeboardId = null;      // null while adding a new plan, otherwise the id being edited
let noticeboardDraft = { date:'', time:'' };  // the date/time currently chosen in the open form

function setNoticeboardFilter(f){
  noticeboardFilter = f;
  document.querySelectorAll('#noticeboardChips .chip').forEach(c=>c.classList.toggle('active', c.dataset.f===f));
  renderNoticeboard();
}

// Whole days between today and a 'YYYY-MM-DD' date: 0 = today, 1 = tomorrow, -1 = yesterday…
function noticeboardDaysFromToday(dateStr){
  const p = dtParseDate(dateStr);
  if(!p) return 0;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(p.y, p.m, p.d) - today) / 86400000);
}
function noticeboardWhenLabel(n){
  if(n === 0) return t('noticeboard.today');
  if(n === 1) return t('noticeboard.tomorrow');
  if(n === -1) return t('noticeboard.yesterday');
  return n > 1 ? t('noticeboard.inDays', {n}) : t('noticeboard.daysAgo', {n: -n});
}
function noticeboardSortKey(e){ return (e.date || '') + ' ' + (e.time || '00:00'); }

function renderNoticeboard(){
  refreshProfileIfVisible(); // the Profile screen's posts include Noticeboard plans
  const el = document.getElementById('noticeboardList');
  if(!el) return;
  const items = state.noticeboard.map(e=>({e, n: noticeboardDaysFromToday(e.date)}));
  let list;
  if(noticeboardFilter === 'upcoming') list = items.filter(x=>x.n >= 0).sort((a,b)=>noticeboardSortKey(a.e).localeCompare(noticeboardSortKey(b.e)));   // soonest first
  else                           list = items.filter(x=>x.n < 0).sort((a,b)=>noticeboardSortKey(b.e).localeCompare(noticeboardSortKey(a.e)));    // most recent first
  if(!list.length){
    const key = noticeboardFilter === 'upcoming' ? 'emptyUpcoming' : 'emptyPast';
    el.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="15" height="18" rx="2"/><path d="M8 3v18M11 8h5M11 12h5"/></svg>
      <h3>${t('noticeboard.' + key + 'Title')}</h3><p>${t('noticeboard.' + key + 'Hint')}</p></div>`;
    return;
  }
  el.innerHTML = list.map(({e, n})=>{
    const p = dtParseDate(e.date);
    const boat = e.boatId ? state.boats.find(b=>b.id===e.boatId) : null;
    const meta = [e.time ? '🕐 ' + e.time : '', e.place ? '📍 ' + escapeHtml(e.place) : '', boat ? '⛵ ' + escapeHtml(boat.name) : ''].filter(Boolean).join(' · ');
    const cls = 'noticeboard-card tint-cream' + (n === 0 ? ' is-today' : '') + (n < 0 ? ' is-past' : '');
    return `<div class="${cls}" onclick="openNoticeboardSheet('${e.id}')">
      <div class="dc-date">
        <div class="dc-mon">${dtFmtDate(p, {month:'short'})}</div>
        <div class="dc-day">${p.d}</div>
        <div class="dc-wd">${dtFmtDate(p, {weekday:'short'})}</div>
      </div>
      <div class="dc-body">
        <div class="dc-top"><div class="dc-title">${escapeHtml(e.title)}</div><span class="dc-when">${noticeboardWhenLabel(n)}</span></div>
        ${meta ? `<div class="dc-meta">${meta}</div>` : ''}
        ${e.notes ? `<div class="dc-notes">${escapeHtml(e.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ---------- the New / Edit form (a bottom sheet) ---------- */
function noticeboardTodayStr(){
  const n = dtNowParts();
  return n.y + '-' + dtPad(n.m + 1) + '-' + dtPad(n.d);
}
function openNoticeboardSheet(id){
  const entry = id ? state.noticeboard.find(e=>e.id===id) : null;
  editingNoticeboardId = entry ? entry.id : null;
  noticeboardDraft = { date: entry ? entry.date : noticeboardTodayStr(), time: entry ? (entry.time || '') : '' };
  document.getElementById('noticeboardSheetTitle').textContent = entry ? t('noticeboard.editTitle') : t('noticeboard.newTitle');
  document.getElementById('noticeboardTitle').value = entry ? entry.title : '';
  document.getElementById('noticeboardPlace').value = entry ? (entry.place || '') : '';
  document.getElementById('noticeboardNotes').value = entry ? (entry.notes || '') : '';
  document.getElementById('noticeboardBoat').innerHTML = `<option value="">${t('noticeboard.noBoat')}</option>` +
    state.boats.map(b=>`<option value="${b.id}"${entry && entry.boatId===b.id ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
  document.getElementById('deleteNoticeboardBtn').style.display = entry ? 'flex' : 'none';
  refreshNoticeboardWhen();
  openSheet('sheetNoticeboard');
}
function refreshNoticeboardWhen(){
  const p = dtParseDate(noticeboardDraft.date);
  document.getElementById('noticeboardDateDisplay').textContent = p ? dtFmtDate(p, {day:'numeric', month:'short', year:'numeric'}) : '—';
  document.getElementById('noticeboardTimeDisplay').textContent = noticeboardDraft.time || t('noticeboard.anyTime');
}
// Opens the shared date/time picker for this form; it comes back to this sheet afterwards.
function openNoticeboardPicker(tab){
  dtOpen(tab, {
    get: ()=>{
      const p = dtParseDate(noticeboardDraft.date);
      if(!p) return null;
      const tm = /^(\d{2}):(\d{2})$/.exec(noticeboardDraft.time || '');
      return Object.assign(p, {hasTime: !!tm, h: tm ? +tm[1] : 0, mi: tm ? +tm[2] : 0});
    },
    apply: (d, tm)=>{ noticeboardDraft.date = d; noticeboardDraft.time = tm; refreshNoticeboardWhen(); },
    optionalTime: true,
    returnSheet: 'sheetNoticeboard'
  });
}
async function saveNoticeboardForm(){
  const title = document.getElementById('noticeboardTitle').value.trim();
  if(!title){ showToast(t('noticeboard.needTitle')); return; }
  const fields = {
    title, date: noticeboardDraft.date, time: noticeboardDraft.time,
    place: document.getElementById('noticeboardPlace').value.trim(),
    boatId: document.getElementById('noticeboardBoat').value || null,
    notes: document.getElementById('noticeboardNotes').value.trim(),
    updatedAt: new Date().toISOString()
  };
  let saved;
  if(editingNoticeboardId){
    saved = state.noticeboard.find(e=>e.id===editingNoticeboardId);
    Object.assign(saved, fields);
  } else {
    saved = Object.assign({id: uid()}, fields);
    state.noticeboard.push(saved);
  }
  const ok = await storeSet(KEYS.NOTICEBOARD, state.noticeboard);
  if(!ok) return;
  syncNoticeboardIfSignedIn(saved);
  syncNoticeboardReminders({ask: true}); // schedule the 24-hour reminder (asks for notification permission the first time)
  showToast(t('noticeboard.saved'));
  // Show the list that now contains the plan just saved (e.g. saving a date in the past)
  const f = noticeboardDaysFromToday(fields.date) >= 0 ? 'upcoming' : 'past';
  closeSheets();
  setNoticeboardFilter(f);
}
async function deleteNoticeboardEntry(){
  if(!editingNoticeboardId) return;
  if(!(await showConfirm(t('noticeboard.confirmDelete'), {danger:true}))) return;
  const deletedId = editingNoticeboardId;
  state.noticeboard = state.noticeboard.filter(e=>e.id!==deletedId);
  await storeSet(KEYS.NOTICEBOARD, state.noticeboard);
  syncNoticeboardDeleteIfSignedIn(deletedId);
  syncNoticeboardReminders();
  showToast(t('noticeboard.deleted'));
  closeSheets();
  renderNoticeboard();
}

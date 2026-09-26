// ===== diary.js =====
// Sailing Diary: a place to write down PLANNED future sails — date (and optionally a time),
// what the plan is, where, which boat, and notes.
//
// Data: state.diary is an array of plans, saved under KEYS.DIARY through storeGet/storeSet
// (so it follows the same storage tiers as everything else) and included in the
// backup/restore file and in "Reset App Data". A plan looks like:
//   { id, title, date:'YYYY-MM-DD', time:'HH:mm' or '', place, boatId, notes, updatedAt }
// Dates are plain local calendar dates (no timezone maths), so "19 Sept" stays "19 Sept".
//
// The date/time controls reuse the themed picker (dtOpen in journey.js) — it hands the
// answer back through the `apply` callback below and then reopens this form.

let diaryFilter = 'upcoming';   // 'upcoming' | 'past' — set by the chips above the list
let editingDiaryId = null;      // null while adding a new plan, otherwise the id being edited
let diaryDraft = { date:'', time:'' };  // the date/time currently chosen in the open form

function setDiaryFilter(f){
  diaryFilter = f;
  document.querySelectorAll('#diaryChips .chip').forEach(c=>c.classList.toggle('active', c.dataset.f===f));
  renderDiary();
}

// Whole days between today and a 'YYYY-MM-DD' date: 0 = today, 1 = tomorrow, -1 = yesterday…
function diaryDaysFromToday(dateStr){
  const p = dtParseDate(dateStr);
  if(!p) return 0;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(p.y, p.m, p.d) - today) / 86400000);
}
function diaryWhenLabel(n){
  if(n === 0) return t('diary.today');
  if(n === 1) return t('diary.tomorrow');
  if(n === -1) return t('diary.yesterday');
  return n > 1 ? t('diary.inDays', {n}) : t('diary.daysAgo', {n: -n});
}
function diarySortKey(e){ return (e.date || '') + ' ' + (e.time || '00:00'); }

function renderDiary(){
  const el = document.getElementById('diaryList');
  if(!el) return;
  const items = state.diary.map(e=>({e, n: diaryDaysFromToday(e.date)}));
  let list;
  if(diaryFilter === 'upcoming') list = items.filter(x=>x.n >= 0).sort((a,b)=>diarySortKey(a.e).localeCompare(diarySortKey(b.e)));   // soonest first
  else                           list = items.filter(x=>x.n < 0).sort((a,b)=>diarySortKey(b.e).localeCompare(diarySortKey(a.e)));    // most recent first
  if(!list.length){
    const key = diaryFilter === 'upcoming' ? 'emptyUpcoming' : 'emptyPast';
    el.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="15" height="18" rx="2"/><path d="M8 3v18M11 8h5M11 12h5"/></svg>
      <h3>${t('diary.' + key + 'Title')}</h3><p>${t('diary.' + key + 'Hint')}</p></div>`;
    return;
  }
  el.innerHTML = list.map(({e, n})=>{
    const p = dtParseDate(e.date);
    const boat = e.boatId ? state.boats.find(b=>b.id===e.boatId) : null;
    const meta = [e.time ? '🕐 ' + e.time : '', e.place ? '📍 ' + escapeHtml(e.place) : '', boat ? '⛵ ' + escapeHtml(boat.name) : ''].filter(Boolean).join(' · ');
    const cls = 'diary-card tint-cream' + (n === 0 ? ' is-today' : '') + (n < 0 ? ' is-past' : '');
    return `<div class="${cls}" onclick="openDiarySheet('${e.id}')">
      <div class="dc-date">
        <div class="dc-mon">${dtFmtDate(p, {month:'short'})}</div>
        <div class="dc-day">${p.d}</div>
        <div class="dc-wd">${dtFmtDate(p, {weekday:'short'})}</div>
      </div>
      <div class="dc-body">
        <div class="dc-top"><div class="dc-title">${escapeHtml(e.title)}</div><span class="dc-when">${diaryWhenLabel(n)}</span></div>
        ${meta ? `<div class="dc-meta">${meta}</div>` : ''}
        ${e.notes ? `<div class="dc-notes">${escapeHtml(e.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ---------- the New / Edit form (a bottom sheet) ---------- */
function diaryTodayStr(){
  const n = dtNowParts();
  return n.y + '-' + dtPad(n.m + 1) + '-' + dtPad(n.d);
}
function openDiarySheet(id){
  const entry = id ? state.diary.find(e=>e.id===id) : null;
  editingDiaryId = entry ? entry.id : null;
  diaryDraft = { date: entry ? entry.date : diaryTodayStr(), time: entry ? (entry.time || '') : '' };
  document.getElementById('diarySheetTitle').textContent = entry ? t('diary.editTitle') : t('diary.newTitle');
  document.getElementById('diaryTitle').value = entry ? entry.title : '';
  document.getElementById('diaryPlace').value = entry ? (entry.place || '') : '';
  document.getElementById('diaryNotes').value = entry ? (entry.notes || '') : '';
  document.getElementById('diaryBoat').innerHTML = `<option value="">${t('diary.noBoat')}</option>` +
    state.boats.map(b=>`<option value="${b.id}"${entry && entry.boatId===b.id ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
  document.getElementById('deleteDiaryBtn').style.display = entry ? 'flex' : 'none';
  refreshDiaryWhen();
  openSheet('sheetDiary');
}
function refreshDiaryWhen(){
  const p = dtParseDate(diaryDraft.date);
  document.getElementById('diaryDateDisplay').textContent = p ? dtFmtDate(p, {day:'numeric', month:'short', year:'numeric'}) : '—';
  document.getElementById('diaryTimeDisplay').textContent = diaryDraft.time || t('diary.anyTime');
}
// Opens the shared date/time picker for this form; it comes back to this sheet afterwards.
function openDiaryPicker(tab){
  dtOpen(tab, {
    get: ()=>{
      const p = dtParseDate(diaryDraft.date);
      if(!p) return null;
      const tm = /^(\d{2}):(\d{2})$/.exec(diaryDraft.time || '');
      return Object.assign(p, {hasTime: !!tm, h: tm ? +tm[1] : 0, mi: tm ? +tm[2] : 0});
    },
    apply: (d, tm)=>{ diaryDraft.date = d; diaryDraft.time = tm; refreshDiaryWhen(); },
    optionalTime: true,
    returnSheet: 'sheetDiary'
  });
}
async function saveDiaryForm(){
  const title = document.getElementById('diaryTitle').value.trim();
  if(!title){ showToast(t('diary.needTitle')); return; }
  const fields = {
    title, date: diaryDraft.date, time: diaryDraft.time,
    place: document.getElementById('diaryPlace').value.trim(),
    boatId: document.getElementById('diaryBoat').value || null,
    notes: document.getElementById('diaryNotes').value.trim(),
    updatedAt: new Date().toISOString()
  };
  if(editingDiaryId){
    Object.assign(state.diary.find(e=>e.id===editingDiaryId), fields);
  } else {
    state.diary.push(Object.assign({id: uid()}, fields));
  }
  const ok = await storeSet(KEYS.DIARY, state.diary);
  if(!ok) return;
  showToast(t('diary.saved'));
  // Show the list that now contains the plan just saved (e.g. saving a date in the past)
  const f = diaryDaysFromToday(fields.date) >= 0 ? 'upcoming' : 'past';
  closeSheets();
  setDiaryFilter(f);
}
async function deleteDiaryEntry(){
  if(!editingDiaryId) return;
  if(!(await confirmDialog('deleteDiary', {danger:true, icon:'trash'}))) return;
  state.diary = state.diary.filter(e=>e.id!==editingDiaryId);
  await storeSet(KEYS.DIARY, state.diary);
  showToast(t('diary.deleted'));
  closeSheets();
  renderDiary();
}

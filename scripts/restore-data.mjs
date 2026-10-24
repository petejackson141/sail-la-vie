// Sail la Vie - put a backup BACK into a Supabase project.
// Run it with scripts\7-restore-data.bat (double-click).
//
// When you'd use it:
//   * The Supabase project is lost or broken, and you've made a new one.
//   * Moving the database (e.g. Tokyo -> Frankfurt).
//   * Practising a restore into a spare TEST project (recommended first!).
//
// Before running it, the target project must already be set up:
//   1. Create the new Supabase project.
//   2. SQL Editor -> paste supabase\00-full-database-setup.sql -> Run
//      (this makes the tables, security rules and the photo bucket).
//   3. Save the NEW project's secret key, alone in a text file, here:
//        C:\Users\Pete\SailLaVie-keys\restore-target-secret-key.txt
//      (new project -> Project Settings -> API Keys -> the secret key)
//
// What it does, in this order, using a backup made by 5-backup-data.bat:
//   1. Accounts: re-creates every account with the SAME id and email, marked
//      as confirmed. Passwords are NOT in the backup (Supabase never gives
//      them out), so every user must use "Forgot password" once.
//   2. Tables: puts every row back (profiles, sails, boats, crew, friends...).
//   3. Photos: uploads every photo back into the same folders.
//   4. Check: counts what's now in the project and compares it with the backup.
//
// It never deletes anything. Rows that already exist are overwritten with the
// backup's copy, so running it twice is safe.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const LIVE_URL    = 'https://opejqowgcjltanvgxmxn.supabase.co';   // the current live (Tokyo) project
const KEY_FILE    = 'C:\\Users\\Pete\\SailLaVie-keys\\restore-target-secret-key.txt';
const BACKUP_ROOT = process.env.SLV_BACKUP_ROOT || 'C:\\Users\\Pete\\SailLaVie-backups';
// Order matters: accounts first, then tables that point at them.
const TABLES      = ['profiles', 'public_profiles', 'boats', 'crew', 'trips', 'noticeboard', 'friendships', 'feedback'];
const BUCKET      = 'trip-photos';
const MIME        = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Questions typed in the window: answers are queued, so none get lost.
const rl = readline.createInterface({ input: process.stdin });
const answers = [], waiting = [];
rl.on('line', l => waiting.length ? waiting.shift()(l) : answers.push(l));
rl.on('close', () => { while(waiting.length) waiting.shift()(''); });
function fail(msg){ console.error('\nSTOP: ' + msg + '\n'); rl.close(); process.exit(1); }
const ask = q => { process.stdout.write(q);
  return new Promise(r => answers.length ? r(answers.shift()) : waiting.push(r)).then(a => a.trim()); };

// ---------- 1. Which backup? ----------
if(!fs.existsSync(BACKUP_ROOT)) fail(`Can't find the backups folder:\n  ${BACKUP_ROOT}`);
const backups = fs.readdirSync(BACKUP_ROOT)
  .filter(n => fs.existsSync(path.join(BACKUP_ROOT, n, 'auth-users.json')))
  .sort();
if(!backups.length) fail(`No backups found in ${BACKUP_ROOT} (each one needs an auth-users.json).`);

console.log('Backups found (newest last):');
backups.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
const pick = await ask(`\nWhich one? Press Enter for the newest (${backups.length}), or type a number: `);
const idx = pick === '' ? backups.length - 1 : Number(pick) - 1;
if(!(idx >= 0 && idx < backups.length)) fail('That number is not in the list.');
const backupDir = path.join(BACKUP_ROOT, backups[idx]);

const users = JSON.parse(fs.readFileSync(path.join(backupDir, 'auth-users.json'), 'utf8'));
const tableRows = {};
for(const t of TABLES){
  const f = path.join(backupDir, 'tables', t + '.json');
  tableRows[t] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
const photoRoot = path.join(backupDir, 'photos', BUCKET);
const photos = [];
const walk = dir => { if(!fs.existsSync(dir)) return;
  for(const e of fs.readdirSync(dir, { withFileTypes: true })){
    const full = path.join(dir, e.name);
    if(e.isDirectory()) walk(full); else photos.push(path.relative(photoRoot, full).split(path.sep).join('/'));
  } };
walk(photoRoot);

console.log(`\nBackup ${backups[idx]} contains:`);
console.log(`  accounts: ${users.length}`);
for(const t of TABLES) console.log(`  ${t}: ${tableRows[t] ? tableRows[t].length + ' rows' : 'not in this backup (skipped)'}`);
console.log(`  photos: ${photos.length}`);

// ---------- 2. Which project? ----------
let url = (await ask('\nPaste the TARGET project URL (e.g. https://abcdefgh.supabase.co): ')).replace(/\/+$/, '');
if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) fail('That does not look like a Supabase project URL.');

if(!fs.existsSync(KEY_FILE)) fail(`Can't find the target project's secret key file:\n  ${KEY_FILE}\nCreate it with just the NEW project's secret key inside.`);
const KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
if(!KEY) fail('The secret key file is empty.');
if(/^sb_publishable_/.test(KEY) || /"role"\s*:\s*"anon"/.test(Buffer.from((KEY.split('.')[1] || ''), 'base64').toString()))
  fail('That is the PUBLIC key. The restore needs the SECRET (service_role) key.');
const headers = KEY.startsWith('sb_secret_') ? { apikey: KEY } : { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function call(p, opts = {}){
  const res = await fetch(url + p, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, json: () => JSON.parse(text || 'null') };
}

// Does the key belong to this project, and is the database set up?
const probe = await call('/rest/v1/trips?select=id&limit=1');
if(probe.status === 401 || probe.status === 403) fail('The secret key does not work for that project (wrong project, or wrong key).');
if(!probe.ok) fail(`The project isn't set up yet - run supabase\\00-full-database-setup.sql in its SQL Editor first.\n(${probe.status} ${probe.text.slice(0, 200)})`);

const existingCount = await countRows('trips');

// How many rows does a table have? (asks Supabase for the count only)
async function countRows(table){
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, { method: 'HEAD', headers: { ...headers, Prefer: 'count=exact' } });
  const m = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
  return m ? Number(m[1]) : NaN;
}

console.log('\n==============================================');
if(url === LIVE_URL){
  console.log(' WARNING: this is the LIVE project that testers use.');
  console.log(' The restore will OVERWRITE their current data with the');
  console.log(' backup copy. Anything newer than the backup is lost.');
  console.log('==============================================');
  if(await ask('Type RESTORE LIVE to carry on, anything else to stop: ') !== 'RESTORE LIVE') fail('Stopped. Nothing was changed.');
} else {
  console.log(` Target: ${url}`);
  console.log(` It already has ${existingCount} sails in it.`);
  if(existingCount > 0) console.log(' Sails with the same id will be overwritten by the backup copy.');
  console.log('==============================================');
  if((await ask('Type YES to restore into this project: ')).toUpperCase() !== 'YES') fail('Stopped. Nothing was changed.');
}

// ---------- 3. Accounts ----------
console.log('\n1/4 Accounts');
let made = 0, already = 0;
for(const u of users){
  const r = await call('/auth/v1/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: u.id, email: u.email, email_confirm: true, user_metadata: u.user_metadata || {} })
  });
  if(r.ok){
    const got = r.json();
    const gotId = got?.id || got?.user?.id;
    if(gotId !== u.id) fail(`Account ${u.email} was created with a DIFFERENT id (${gotId}).\nThis Supabase version ignores the id, so the rows would not match. Send this to Claude.`);
    made++;
  } else if(r.status === 422 || /already|exists|registered/i.test(r.text)){
    already++;   // re-running: the account is already there
  } else fail(`Creating account ${u.email} failed: ${r.status} ${r.text.slice(0, 300)}`);
}
console.log(`  ${made} created, ${already} already there`);

// ---------- 4. Tables ----------
console.log('\n2/4 Tables');
for(const t of TABLES){
  const rows = tableRows[t];
  if(!rows){ console.log(`  ${t}: skipped (not in backup)`); continue; }
  const size = t === 'feedback' ? 20 : 200;   // feedback rows can hold big screenshots
  for(let i = 0; i < rows.length; i += size){
    const r = await call(`/rest/v1/${t}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + size))
    });
    if(!r.ok) fail(`Putting rows back into "${t}" failed: ${r.status} ${r.text.slice(0, 300)}`);
  }
  console.log(`  ${t}: ${rows.length} rows`);
}

// ---------- 5. Photos ----------
console.log('\n3/4 Photos');
let up = 0;
for(const p of photos){
  const ext = path.extname(p).toLowerCase();
  const body = fs.readFileSync(path.join(photoRoot, ...p.split('/')));
  const r = await call(`/storage/v1/object/${BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'x-upsert': 'true' }, body
  });
  if(!r.ok) fail(`Uploading photo ${p} failed: ${r.status} ${r.text.slice(0, 300)}`);
  if(++up % 25 === 0) console.log(`  ${up} of ${photos.length}...`);
}
console.log(`  ${up} photos uploaded`);

// ---------- 6. Check ----------
console.log('\n4/4 Check (in the project now / in the backup)');
let allGood = true;
for(const t of TABLES){
  if(!tableRows[t]) continue;
  const n = await countRows(t);
  const good = n >= tableRows[t].length;
  if(!good) allGood = false;
  console.log(`  ${good ? 'OK  ' : 'LESS'} ${t}: ${n} / ${tableRows[t].length}`);
}
rl.close();

console.log('\n==============================================');
console.log(allGood ? ' Restore finished and the counts match.' : ' Restore finished, but some counts are LOWER than the backup - send this to Claude.');
console.log(' Still to do by hand (see the restore-steps doc):');
console.log('  - Authentication -> URL Configuration (Site URL, redirect URLs');
console.log('    including saillavie://auth-callback)');
console.log('  - Put the new project URL + publishable key in docs\\js\\auth.js');
console.log('  - Tell every user to sign in with "Forgot password" once');
console.log('==============================================');
if(!allGood) process.exit(1);

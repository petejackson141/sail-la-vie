// Sail la Vie - full backup of the Supabase data and photos to this laptop.
// Run it with scripts\5-backup-data.bat (double-click). Read-only: it never
// changes anything in Supabase.
//
// What it saves, in C:\Users\Pete\SailLaVie-backups\<date-time>\ :
//   tables\<table>.json   every row of every table (all users' profiles, sails,
//                         boats, crew, noticeboard, friends, feedback)
//   auth-users.json       the list of accounts (email, id, sign-up date).
//                         Passwords are NOT included - Supabase never gives them out.
//   photos\...            every file in photo storage, same folders as in Supabase
//   summary.txt           what was saved, with counts
//
// It needs the project's secret key, kept OUTSIDE the project folder so it can
// never end up on GitHub:  C:\Users\Pete\SailLaVie-keys\supabase-secret-key.txt
// (Supabase -> Project Settings -> API Keys -> the secret / service_role key).

import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://opejqowgcjltanvgxmxn.supabase.co';
const KEY_FILE     = 'C:\\Users\\Pete\\SailLaVie-keys\\supabase-secret-key.txt';
const BACKUP_ROOT  = 'C:\\Users\\Pete\\SailLaVie-backups';
const TABLES       = ['profiles', 'public_profiles', 'boats', 'crew', 'trips', 'noticeboard', 'friendships', 'feedback'];
const BUCKETS      = ['trip-photos'];

function fail(msg){ console.error('\nSTOP: ' + msg + '\n'); process.exit(1); }

if(!fs.existsSync(KEY_FILE)) fail(`Can't find the secret key file:\n  ${KEY_FILE}\nCreate it with just the key inside (see the backup guide).`);
const KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
if(!KEY) fail('The secret key file is empty.');
if(/^sb_publishable_/.test(KEY) || /"role"\s*:\s*"anon"/.test(Buffer.from((KEY.split('.')[1]||''), 'base64').toString()))
  fail('That is the PUBLIC key. The backup needs the SECRET (service_role) key.');

// New-style secret keys go in the apikey header only; old-style (JWT) keys go in both.
const headers = KEY.startsWith('sb_secret_') ? { apikey: KEY } : { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function getJson(url, opts = {}){
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if(!res.ok) throw new Error(`${res.status} ${res.statusText} - ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const d = new Date(), pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; // your local time
const outDir = path.join(BACKUP_ROOT, stamp);
fs.mkdirSync(path.join(outDir, 'tables'), { recursive: true });
const summary = [`Sail la Vie backup ${new Date().toString()}`, `Project: ${SUPABASE_URL}`, ''];

// 1. Tables
for(const table of TABLES){
  const rows = [];
  let skipped = false;
  for(let offset = 0; ; offset += 1000){
    let page;
    try{ page = await getJson(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`); }
    catch(e){
      if(/404|PGRST205|does not exist/i.test(e.message)){ summary.push(`table ${table}: not found (skipped)`); skipped = true; break; }
      fail(`Reading table "${table}" failed: ${e.message}`);
    }
    rows.push(...page);
    if(page.length < 1000) break;
  }
  if(skipped) continue;
  fs.writeFileSync(path.join(outDir, 'tables', table + '.json'), JSON.stringify(rows, null, 1));
  summary.push(`table ${table}: ${rows.length} rows`);
  console.log(`  ${table}: ${rows.length} rows`);
}

// 2. Accounts (no passwords)
const users = [];
for(let page = 1; ; page++){
  const data = await getJson(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`).catch(e => fail('Reading accounts failed: ' + e.message));
  const list = data.users || [];
  users.push(...list.map(u => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, user_metadata: u.user_metadata })));
  if(list.length < 1000) break;
}
fs.writeFileSync(path.join(outDir, 'auth-users.json'), JSON.stringify(users, null, 1));
summary.push(`accounts: ${users.length}`);
console.log(`  accounts: ${users.length}`);

// 3. Photos
for(const bucket of BUCKETS){
  let count = 0, bytes = 0;
  const walk = async (prefix) => {
    for(let offset = 0; ; offset += 1000){
      const items = await getJson(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
      }).catch(e => fail(`Listing photos in "${prefix || '/'}" failed: ${e.message}`));
      for(const it of items){
        const full = prefix ? `${prefix}/${it.name}` : it.name;
        if(!it.id){ await walk(full); continue; } // a folder
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${full.split('/').map(encodeURIComponent).join('/')}`, { headers });
        if(!res.ok) fail(`Downloading photo ${full} failed: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const dest = path.join(outDir, 'photos', bucket, ...full.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        count++; bytes += buf.length;
        if(count % 25 === 0) console.log(`  photos: ${count} so far...`);
      }
      if(items.length < 1000) break;
    }
  };
  await walk('');
  summary.push(`photos in ${bucket}: ${count} files, ${(bytes / 1048576).toFixed(1)} MB`);
  console.log(`  photos in ${bucket}: ${count} files, ${(bytes / 1048576).toFixed(1)} MB`);
}

fs.writeFileSync(path.join(outDir, 'summary.txt'), summary.join('\r\n') + '\r\n');
console.log('\nSaved to: ' + outDir);

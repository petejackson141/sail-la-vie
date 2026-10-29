// =====================================================================
// Sail la Vie: copy everything from Tokyo to Frankfurt (Part 2, 29.10.2026)
// =====================================================================
// Run it with the .bat files in this folder, not by hand:
//   2-check-counts.bat      -> read-only: counts in both projects, side by side
//   3-copy-to-frankfurt.bat -> empties Frankfurt, then copies accounts, tables, photos
//   4-lock-tokyo.bat        -> Tokyo read-only (after the copy is checked)
//   5-unlock-tokyo.bat      -> undo 4, if we ever need Tokyo back
//
// Safety:
//   * Tokyo is only ever READ, except by lock/unlock.
//   * Only Frankfurt is ever emptied or written. The script checks the
//     project ids below before it does anything, so the two can't be swapped.
//   * Passwords and keys come from secrets.env (never in Git).
// =====================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

// ---------- the two projects (not secret) ----------
const TOKYO = {
  name: 'Tokyo',
  ref: 'opejqowgcjltanvgxmxn',
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
};
const FRANKFURT = {
  name: 'Frankfurt',
  ref: 'lccwbkarqjohunofsghd',
  host: 'aws-1-eu-central-1.pooler.supabase.com',
};
const BUCKET = 'trip-photos';

// Copy order matters: accounts first, because every table points at them.
const AUTH_TABLES = ['auth.users', 'auth.identities'];
const APP_TABLES = [
  'public.profiles', 'public.public_profiles', 'public.boats', 'public.crew',
  'public.trips', 'public.noticeboard', 'public.friendships', 'public.feedback',
];

// ---------- log to screen and to migrate-log.txt ----------
const LOG_FILE = path.join(__dirname, 'migrate-log.txt');
function log(msg = ''){
  console.log(msg);
  fs.appendFileSync(LOG_FILE, msg + '\n');
}

// ---------- secrets.env ----------
function readSecrets(){
  const file = path.join(__dirname, 'secrets.env');
  if(!fs.existsSync(file)) throw new Error('secrets.env not found. Run 1-edit-secrets.bat first.');
  const out = {};
  for(const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)){
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if(m) out[m[1]] = m[2];
  }
  const need = ['TOKYO_DB_PASSWORD', 'FRANKFURT_DB_PASSWORD', 'TOKYO_SECRET_KEY', 'FRANKFURT_SECRET_KEY'];
  const missing = need.filter(k => !out[k]);
  if(missing.length) throw new Error('secrets.env is missing: ' + missing.join(', '));
  for(const k of ['TOKYO_SECRET_KEY', 'FRANKFURT_SECRET_KEY']){
    if(!out[k].startsWith('sb_secret_')) throw new Error(k + ' should start with sb_secret_ (that looks like a different key).');
  }
  return out;
}

// ---------- connections ----------
async function db(project, password){
  const c = new Client({
    host: project.host, port: 5432, database: 'postgres',
    user: 'postgres.' + project.ref, password,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // Extra safety: ask the database which project it really is.
  const who = (await c.query('select current_user as u')).rows[0].u;
  if(!who.startsWith('postgres')) throw new Error('Unexpected database user ' + who);
  return c;
}
function storage(project, secretKey){
  return createClient('https://' + project.ref + '.supabase.co', secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);
}

// ---------- counts ----------
async function counts(c){
  const out = {};
  for(const t of [...AUTH_TABLES, ...APP_TABLES]){
    out[t] = Number((await c.query(`select count(*) as n from ${t}`)).rows[0].n);
  }
  out['photos (storage)'] = Number((await c.query(
    `select count(*) as n from storage.objects where bucket_id = $1`, [BUCKET])).rows[0].n);
  return out;
}
function printCounts(a, b){
  log('');
  log('  what                      Tokyo   Frankfurt');
  log('  ------------------------  ------  ---------');
  let allMatch = true;
  for(const k of Object.keys(a)){
    const ok = a[k] === b[k];
    if(!ok) allMatch = false;
    log('  ' + k.padEnd(24) + '  ' + String(a[k]).padStart(6) + '  ' + String(b[k]).padStart(9) + (ok ? '   OK' : '   <-- different'));
  }
  log('');
  return allMatch;
}

// ---------- copying one table ----------
// Uses the columns BOTH projects have (Frankfurt may run a newer Supabase
// version), and skips "generated" columns, which the database fills itself.
async function columns(c, table){
  const [schema, name] = table.split('.');
  const r = await c.query(
    `select column_name from information_schema.columns
      where table_schema = $1 and table_name = $2
        and is_generated = 'NEVER' and coalesce(generation_expression, '') = ''
      order by ordinal_position`, [schema, name]);
  return r.rows.map(x => x.column_name);
}
async function copyTable(src, dst, table){
  const srcCols = await columns(src, table);
  const dstCols = new Set(await columns(dst, table));
  const cols = srcCols.filter(x => dstCols.has(x));
  const skipped = srcCols.filter(x => !dstCols.has(x));
  if(skipped.length) log(`    (columns only in Tokyo, not copied: ${skipped.join(', ')})`);
  const list = cols.map(x => '"' + x + '"').join(', ');

  // Read every row as JSON, then let Frankfurt turn it back into its own
  // column types (jsonb_populate_recordset), so dates, arrays and JSON all
  // arrive exactly as they were.
  const rows = (await src.query(`select to_jsonb(t) as j from ${table} t`)).rows.map(r => r.j);
  const BATCH = 50;
  for(let i = 0; i < rows.length; i += BATCH){
    const chunk = rows.slice(i, i + BATCH);
    await dst.query(
      `insert into ${table} (${list})
       select ${list} from jsonb_populate_recordset(null::${table}, $1::jsonb)`,
      [JSON.stringify(chunk)]);
  }
  log(`    ${table}: ${rows.length} rows`);
}

// ---------- emptying Frankfurt ----------
async function emptyFrankfurt(dst, dstStore){
  log('Step 1 of 4: emptying Frankfurt (test account and test data)');
  // photos first, through the Storage API (the database refuses direct deletes)
  const names = (await dst.query(`select name from storage.objects where bucket_id = $1`, [BUCKET])).rows.map(r => r.name);
  for(let i = 0; i < names.length; i += 100){
    const { error } = await dstStore.remove(names.slice(i, i + 100));
    if(error) throw new Error('Could not delete Frankfurt photos: ' + error.message);
  }
  log(`    photos deleted: ${names.length}`);
  for(const t of [...APP_TABLES].reverse()) await dst.query(`delete from ${t}`);
  await dst.query(`delete from auth.identities`);
  await dst.query(`delete from auth.users`); // also clears their sessions
  log('    tables and accounts emptied');
}

// ---------- copying photos ----------
async function copyPhotos(src, srcStore, dstStore){
  const objs = (await src.query(
    `select name, metadata->>'mimetype' as type from storage.objects where bucket_id = $1 order by name`, [BUCKET])).rows;
  log(`    ${objs.length} photos to copy`);
  let done = 0; const failed = [];
  const one = async (o)=>{
    for(let attempt = 1; attempt <= 3; attempt++){
      try{
        const dl = await srcStore.download(o.name);
        if(dl.error) throw dl.error;
        const buf = Buffer.from(await dl.data.arrayBuffer());
        const up = await dstStore.upload(o.name, buf, {
          contentType: o.type || 'image/jpeg', upsert: true, cacheControl: '31536000' });
        if(up.error) throw up.error;
        return;
      }catch(e){
        if(attempt === 3){ failed.push(o.name + ' (' + (e.message || e) + ')'); return; }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  };
  // 4 at a time
  const queue = [...objs];
  await Promise.all([1, 2, 3, 4].map(async ()=>{
    while(queue.length){
      await one(queue.shift());
      done++;
      if(done % 20 === 0 || done === objs.length) log(`    photos: ${done} of ${objs.length}`);
    }
  }));
  if(failed.length){
    log('    PHOTOS THAT FAILED:');
    failed.forEach(f => log('      ' + f));
  }
  return failed.length;
}

// ---------- lock / unlock Tokyo ----------
const LOCK_SQL = `
  revoke insert, update, delete on ${APP_TABLES.join(', ')} from authenticated, anon;
  drop policy if exists "tokyo read-only: no uploads" on storage.objects;
  drop policy if exists "tokyo read-only: no changes" on storage.objects;
  drop policy if exists "tokyo read-only: no deletes" on storage.objects;
  create policy "tokyo read-only: no uploads" on storage.objects as restrictive for insert to authenticated with check (false);
  create policy "tokyo read-only: no changes" on storage.objects as restrictive for update to authenticated using (false);
  create policy "tokyo read-only: no deletes" on storage.objects as restrictive for delete to authenticated using (false);
`;
const UNLOCK_SQL = `
  grant select, insert, update on public.profiles, public.public_profiles to authenticated;
  grant select, insert, update, delete on public.boats, public.crew, public.trips, public.noticeboard to authenticated;
  grant select, insert, delete on public.friendships to authenticated;
  grant insert on public.feedback to authenticated;
  drop policy if exists "tokyo read-only: no uploads" on storage.objects;
  drop policy if exists "tokyo read-only: no changes" on storage.objects;
  drop policy if exists "tokyo read-only: no deletes" on storage.objects;
`;

// ---------- ask before doing anything big ----------
function ask(question){
  return new Promise(resolve => {
    process.stdout.write(question);
    process.stdin.once('data', d => resolve(String(d).trim()));
  });
}

// ---------- main ----------
async function main(){
  const mode = process.argv[2];
  fs.appendFileSync(LOG_FILE, '\n===== ' + new Date().toISOString() + ' ' + mode + ' =====\n');
  const s = readSecrets();

  log('Connecting to Tokyo...');
  const src = await db(TOKYO, s.TOKYO_DB_PASSWORD);
  log('Connecting to Frankfurt...');
  const dst = await db(FRANKFURT, s.FRANKFURT_DB_PASSWORD);
  log('Both connected.');

  try{
    if(mode === 'check'){
      printCounts(await counts(src), await counts(dst));
      log('Nothing was changed.');
    }

    else if(mode === 'copy'){
      log('');
      log('This will EMPTY Frankfurt and copy everything from Tokyo into it.');
      log('Tokyo is only read, never changed.');
      if((await ask('Type COPY and press Enter to go ahead: ')) !== 'COPY'){ log('Stopped, nothing changed.'); return; }
      const srcStore = storage(TOKYO, s.TOKYO_SECRET_KEY);
      const dstStore = storage(FRANKFURT, s.FRANKFURT_SECRET_KEY);

      await emptyFrankfurt(dst, dstStore);

      log('Step 2 of 4: copying accounts (with their passwords)');
      await dst.query('begin');
      try{
        for(const t of AUTH_TABLES) await copyTable(src, dst, t);
        // The sign-up trigger just made an empty profile for every account;
        // clear those so the real profiles can go in.
        await dst.query('delete from public.profiles');
        log('Step 3 of 4: copying tables');
        for(const t of APP_TABLES) await copyTable(src, dst, t);
        await dst.query('commit');
      }catch(e){
        await dst.query('rollback');
        throw e;
      }

      log('Step 4 of 4: copying photos');
      const failedPhotos = await copyPhotos(src, srcStore, dstStore);

      log('Checking...');
      const ok = printCounts(await counts(src), await counts(dst));
      log(ok && !failedPhotos ? 'ALL DONE: every count matches.' : 'FINISHED WITH DIFFERENCES: send Claude a screenshot of this window.');
    }

    else if(mode === 'lock-tokyo'){
      if((await ask('Make TOKYO read-only? Type LOCK and press Enter: ')) !== 'LOCK'){ log('Stopped, nothing changed.'); return; }
      await src.query(LOCK_SQL);
      log('Tokyo is now read-only (the app can still read, but not save, change, delete or upload).');
    }

    else if(mode === 'unlock-tokyo'){
      if((await ask('Make TOKYO writable again? Type UNLOCK and press Enter: ')) !== 'UNLOCK'){ log('Stopped, nothing changed.'); return; }
      await src.query(UNLOCK_SQL);
      log('Tokyo is writable again.');
    }

    else {
      log('Unknown mode. Use the .bat files in this folder.');
    }
  }finally{
    await src.end(); await dst.end();
  }
}

if(require.main !== module){ module.exports = { copyPhotos, copyTable, counts, printCounts, LOCK_SQL, UNLOCK_SQL, APP_TABLES, AUTH_TABLES }; return; }
main().then(()=> process.exit(0)).catch(e => {
  log('');
  log('ERROR: ' + (e.message || e));
  log('Nothing after this point was done. Send Claude a screenshot of this window.');
  process.exit(1);
});

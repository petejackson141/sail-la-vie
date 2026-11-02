// ===== error-report.js =====
// CRASH / ERROR REPORTING (02.11.2026)
//
// Loaded first (right after the Supabase library) so it can catch problems in
// every other file. When something goes wrong it quietly saves a short
// technical report to the error_reports table (supabase/error-reports.sql):
//   * 'error'   — a JavaScript error nobody caught (a button that does nothing)
//   * 'promise' — the same, inside something that was waiting (a fetch, a save)
//   * 'logged'  — a failure the app DID catch and wrote to the console with
//                 console.error (e.g. "send sail failed"), so we see those too
// Each report: the message, where in the code, app version, Android/web,
// device type and which screen was open. Never sails, photos or positions.
//
// Rules so it never gets in the way:
//   * nothing is shown to the person, and this file can never break the app
//     (everything is wrapped in try/catch)
//   * the same problem is only sent once per session (a repeat count is kept)
//   * at most 20 reports per session
//   * reports wait on the phone while offline or signed out, and are sent
//     when the app is next online and signed in (at most 30 kept waiting)
//   * Android crashes that close the app are reported separately by Google
//     Play (Play Console -> Android vitals), not here.
//
// To read them: Supabase -> Table Editor -> error_reports, or the query at the
// top of supabase/error-reports.sql.

(function(){
  const QUEUE_KEY = 'errorReportQueue';
  const MAX_PER_SESSION = 20, MAX_QUEUED = 30;
  const seen = new Map();   // message+source -> the queued report (for repeat counts)
  let sentThisSession = 0, flushing = false;

  // Noise that isn't ours to fix: browser quirks, extensions, cross-origin "Script error."
  const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /chrome-extension:|moz-extension:/i, /Non-Error promise rejection captured/i];

  const cut = (s, n)=> s==null ? null : String(s).slice(0, n);
  function platform(){
    try{ return (window.Capacitor && Capacitor.getPlatform && Capacitor.getPlatform()) || 'web'; }catch(e){ return 'web'; }
  }
  function screenName(){
    try{
      const open = [...document.querySelectorAll('.sheet')].find(s=>s.style.display==='block');
      const scr = document.querySelector('.screen.active');
      return cut([scr && scr.id, open && open.id].filter(Boolean).join(' > ') || null, 60);
    }catch(e){ return null; }
  }
  function appVersion(){ try{ return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null; }catch(e){ return null; } }
  function readQueue(){ try{ return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }catch(e){ return []; } }
  function writeQueue(q){ try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUED))); }catch(e){} }

  function describe(x){
    if(x == null) return '';
    if(x instanceof Error) return (x.name && x.name!=='Error' ? x.name+': ' : '') + x.message;
    if(typeof x === 'object'){
      if(x.message) return String(x.message) + (x.code ? ' ('+x.code+')' : '');
      try{ return JSON.stringify(x); }catch(e){ return String(x); }
    }
    return String(x);
  }

  function record(kind, message, source, stack){
    try{
      message = cut((message || '').trim(), 1000);
      if(!message || IGNORE.some(r=>r.test(message) || (source && r.test(source)))) return;
      const key = kind+'|'+message+'|'+(source||'');
      if(seen.has(key)){ const r = seen.get(key); if(r.repeats < 1000) r.repeats++; writeQueueFromSeen(); return; }
      if(seen.size >= MAX_PER_SESSION) return;
      const report = {
        kind, message, source: cut(source, 300), stack: cut(stack, 4000),
        screen: screenName(), app_version: appVersion(), platform: platform(),
        device: cut(navigator.userAgent, 200), happened_at: new Date().toISOString(), repeats: 1
      };
      seen.set(key, report);
      const q = readQueue(); q.push(report); writeQueue(q);
      setTimeout(flush, 2000); // a moment later, so a burst of errors goes in one send
    }catch(e){ /* never let reporting itself cause trouble */ }
  }
  // Keep the waiting copies' repeat counts in step (only matters if not yet sent).
  function writeQueueFromSeen(){
    try{
      const q = readQueue();
      q.forEach(r=>{ const s = seen.get(r.kind+'|'+r.message+'|'+(r.source||'')); if(s) r.repeats = s.repeats; });
      writeQueue(q);
    }catch(e){}
  }

  async function flush(){
    if(flushing) return;
    try{
      if(navigator.onLine === false) return;
      if(typeof state === 'undefined' || !state.user || typeof getSupabaseClient !== 'function') return; // signed out: wait
      const q = readQueue();
      if(!q.length || sentThisSession >= MAX_PER_SESSION) return;
      flushing = true;
      const batch = q.slice(0, MAX_PER_SESSION - sentThisSession);
      const { error } = await getSupabaseClient().from('error_reports').insert(batch);
      if(!error){
        sentThisSession += batch.length;
        writeQueue(readQueue().slice(batch.length));
      } else if(/error_reports|relation|permission|schema cache/i.test(error.message || '')){
        writeQueue([]); // table not set up yet: drop them rather than pile up
      }
    }catch(e){ /* offline / not ready — they stay waiting */ }
    finally{ flushing = false; }
  }

  // 1. errors nobody caught
  window.addEventListener('error', ev=>{
    if(ev.target && ev.target !== window && ev.target.tagName) return; // a missing image etc., not code
    const src = ev.filename ? `${ev.filename.replace(location.origin, '')}:${ev.lineno||0}:${ev.colno||0}` : null;
    record('error', describe(ev.error) || ev.message, src, ev.error && ev.error.stack);
  });
  window.addEventListener('unhandledrejection', ev=>{
    const r = ev.reason;
    record('promise', describe(r), null, r && r.stack);
  });

  // 2. failures the app caught and logged with console.error
  const origError = console.error.bind(console);
  console.error = function(...args){
    origError(...args);
    try{
      const err = args.find(a=>a instanceof Error);
      const text = args.map(describe).filter(Boolean).join(' ');
      record('logged', text, null, err && err.stack);
    }catch(e){}
  };

  // 3. send what's waiting: on start-up, when back online, every few minutes
  window.addEventListener('online', ()=>setTimeout(flush, 3000));
  window.addEventListener('load', ()=>setTimeout(flush, 8000));
  setInterval(flush, 5 * 60 * 1000);
  window.flushErrorReports = flush; // e.g. after signing in
})();

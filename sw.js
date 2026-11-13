// Hudud.AI service worker — makes the app installable and keeps the shell available offline.
// Network-first for everything; the dataset API (/api/*) and cross-origin requests are never cached.
const CACHE='hudud-shell-v12';
const TTL=7*24*60*60*1000, AUDIT_INTERVAL=60*60*1000;
let lastAudit=0,auditing=null;
const SHELL=['/','/manifest.json','/icons/icon-192.png','/icons/icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting()));
});

// Approval gate: audit only. Never delete caches or touch application storage.
async function auditCache(){
  if(auditing)return auditing;
  if(Date.now()-lastAudit<AUDIT_INTERVAL)return;
  auditing=(async()=>{
    let entries=0,expired=0,protectedEntries=0,totalBytes=0,unknownSizes=0;
    const candidates=[];
    for(const name of await caches.keys()){
      if(!/^hudud-shell-v\d+$/.test(name))continue;
      const c=await caches.open(name);
      for(const req of await c.keys()){
        entries++;
        const url=new URL(req.url);
        // Keep the current offline shell, all API paths, and unknown entries.
        if(url.origin!==location.origin||!SHELL.includes(url.pathname)||url.search||name===CACHE){protectedEntries++;continue}
        const res=await c.match(req),date=Date.parse(res?.headers.get('date')||'');
        if(Number.isFinite(date)&&Date.now()-date>TTL){
          expired++;
          let bytes=0;
          try{
            const reader=res.body?.getReader();
            if(reader)for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength}
          }catch{bytes=null;unknownSizes++}
          if(bytes!==null)totalBytes+=bytes;
          candidates.push({cache:name,url:url.href,expiredAt:new Date(date+TTL).toISOString(),bodyBytes:bytes});
        }
      }
    }
    const estimate=await self.navigator?.storage?.estimate?.().catch(()=>null);
    console.info('[hudud-cache]',JSON.stringify({dryRun:true,deleted:0,storage:'browser Cache Storage',entries,expired,protectedEntries,candidates,totalCandidateBodyBytes:unknownSizes?null:totalBytes,knownCandidateBodyBytes:totalBytes,unknownSizes,usageBytes:estimate?.usage,quotaBytes:estimate?.quota}));
    lastAudit=Date.now();
  })().catch(()=>console.warn('[hudud-cache] audit unavailable')).finally(()=>{auditing=null});
  return auditing;
}
self.addEventListener('activate',e=>{
  e.waitUntil(auditCache().then(()=>self.clients.claim()));
});

// Page loads: if the network is slow (no answer within 6 s) and a cached copy exists, show the cached
// shell instead of leaving the user on an endless loading screen. The fresh copy still updates the cache.
const timeout=(p,ms)=>new Promise((ok,no)=>{const t=setTimeout(()=>no(new Error('timeout')),ms);p.then(v=>{clearTimeout(t);ok(v)},e=>{clearTimeout(t);no(e)})});

self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  e.waitUntil(auditCache());
  const key=req.mode==='navigate'?'/':req;
  const net=fetch(req).then(res=>{
    if(res.ok&&res.type==='basic'&&(req.mode==='navigate'||(!url.search&&SHELL.includes(url.pathname)))){const copy=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(key,copy)).catch(()=>{}))}
    return res;
  });
  net.catch(()=>{});
  e.respondWith(
    (req.mode==='navigate'
      ?timeout(net,6000).catch(()=>caches.match(key).then(r=>r||net))
      :net
    ).catch(()=>caches.match(key).then(r=>r||Response.error()))
  );
});

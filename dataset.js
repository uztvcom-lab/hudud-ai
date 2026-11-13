const COUNT = 4, META = 'meta/slots.json', PREFIX = 'slots/slot-', TTL = 8 * 60 * 60 * 1000, MAX = 5.8 * 1024 * 1024;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const slotOf = v => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < COUNT ? n : -1; };
function auth(req, env, bodyPw = '') { const expected = env.ADMIN_PASSWORD, supplied = req.headers.get('X-Admin-Password') || bodyPw || ''; return typeof expected === 'string' && expected.length >= 4 && supplied === expected; }
async function meta(bucket) { const o = await bucket.get(META); if (!o) return Array(COUNT).fill(null); try { const a = await o.json(); return Array.from({length: COUNT}, (_, i) => a?.[i] || null); } catch { return Array(COUNT).fill(null); } }
async function expire(bucket, slots) { let changed = false; for (let i = 0; i < COUNT; i++) { const x = slots[i]; if (!x) continue; const t = Date.parse(x.expiresAt || ''); if (!Number.isFinite(t) || t <= Date.now()) { await bucket.delete(`${PREFIX}${i}.json`); slots[i] = null; changed = true; } } if (changed) await bucket.put(META, JSON.stringify(slots), {httpMetadata:{contentType:'application/json'}}); return slots; }
async function bodyText(req) { const b = await req.arrayBuffer(); if (b.byteLength > MAX) throw new Error('Siqilgan fayl 5.8 MB dan oshmasligi kerak.'); let s = new Blob([b]).stream(); if (/gzip/i.test(req.headers.get('content-type') || '')) s = s.pipeThrough(new DecompressionStream('gzip')); return new Response(s).text(); }
export async function onRequest({request, env}) {
  const bucket = env.HUDUD_DATASET; if (!bucket) return json({error:'R2 ombori ulanmagan.'},503);
  const u = new URL(request.url); let slots = await expire(bucket, await meta(bucket));
  if (request.method === 'GET') {
    const p = u.searchParams.get('slot'); if (p === null) return json({slots}); const i = slotOf(p); if (i < 0 || !slots[i]) return json({empty:true},404);
    const o = await bucket.get(`${PREFIX}${i}.json`); if (!o) { slots[i] = null; await bucket.put(META,JSON.stringify(slots)); return json({empty:true},404); }
    const raw = await o.text(); if (u.searchParams.get('format') === 'gz') return new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')), {headers:{'Content-Type':'application/gzip','Cache-Control':'no-store'}});
    return new Response(raw,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  }
  if (request.method === 'POST') {
    if (u.searchParams.get('verify') === '1') return auth(request,env) ? json({ok:true}) : json({error:'Unauthorized'},401);
    if (!auth(request,env)) return json({error:'Unauthorized'},401);
    let payload; try { payload = JSON.parse(await bodyText(request)); } catch(e) { return json({error:e.message || 'JSON ma’lumotini o‘qib bo‘lmadi'},400); }
    const i = slotOf(u.searchParams.get('slot') ?? payload.slotIndex ?? 0); if (i < 0) return json({error:'Noto‘g‘ri slot indeksi'},400);
    if (!payload || !Array.isArray(payload.rows)) return json({error:'Excel ma’lumotlari noto‘g‘ri formatda'},400);
    const now = new Date(), id = `slot-${i}-${now.getTime()}`, updatedAt = payload.uploadedAt || now.toISOString(), expiresAt = new Date(now.getTime()+TTL).toISOString();
    await bucket.put(`${PREFIX}${i}.json`,JSON.stringify({...payload,id,slotIndex:i,updatedAt,expiresAt}),{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{expiresAt}});
    slots[i] = {id,slotIndex:i,fileName:payload.fileName || `Hisobot_${i+1}.xlsx`,totalRows:Number(payload.totalRows || payload.rows.length || 0),updatedAt,expiresAt};
    await bucket.put(META,JSON.stringify(slots),{httpMetadata:{contentType:'application/json'}}); return json({ok:true,id,slots});
  }
  if (request.method === 'DELETE') {
    let b={}; try { b=await request.json(); } catch {}
    if (!auth(request,env,b.password)) return json({error:'Unauthorized'},401);
    if (u.searchParams.get('all') === '1' || b.all) { await Promise.all(Array.from({length:COUNT},(_,i)=>bucket.delete(`${PREFIX}${i}.json`))); slots=Array(COUNT).fill(null); }
    else { const i=slotOf(u.searchParams.get('slot') ?? b.slotIndex ?? -1); if (i<0) return json({error:'Noto‘g‘ri slot indeksi'},400); await bucket.delete(`${PREFIX}${i}.json`); slots[i]=null; }
    await bucket.put(META,JSON.stringify(slots),{httpMetadata:{contentType:'application/json'}}); return json({ok:true,slots});
  }
  return json({error:'Method not allowed'},405);
}

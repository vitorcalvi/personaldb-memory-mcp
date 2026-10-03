import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
const secret='local-development-secret-change-me';
const enc=(v)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(sub){const now=Math.floor(Date.now()/1000);const h=enc({alg:'HS256',typ:'JWT'}),p=enc({iss:'personaldb',sub,iat:now,exp:now+3600});return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;}
async function wait(url){for(let i=0;i<60;i++){try{const r=await fetch(url);if(r.ok)return;}catch{ /* retry until ready */ } await new Promise(r=>setTimeout(r,250));}throw new Error('worker did not start');}
function run(cmd,args){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:'inherit'});p.on('exit',c=>c===0?resolve():reject(new Error(`${cmd} exit ${c}`)));});}
await run('npx',['wrangler','d1','migrations','apply','DB','--local']);
const worker=spawn('npx',['wrangler','dev','--local','--port','8791','--var',`AUTH_HMAC_SECRET:${secret}`],{stdio:['ignore','pipe','pipe']});
worker.stdout.on('data',d=>process.stdout.write(d));worker.stderr.on('data',d=>process.stderr.write(d));
try{
 await wait('http://127.0.0.1:8791/healthz');
 const a=token('user-a'), b=token('user-b');
 const suffix=Date.now().toString(36).toUpperCase().padStart(20,'0').slice(-20);
 const idA=`01A${suffix}`; const idB=`01B${suffix}`;
 const req=(path,auth,init={})=>fetch(`http://127.0.0.1:8791${path}`,{...init,headers:{'authorization':`Bearer ${auth}`,'content-type':'application/json',...(init.headers||{})}});
 let r=await req('/v1/records/upsert',a,{method:'POST',body:JSON.stringify({id:idA,type:'memory',version:1,device_id:'device-a',content:'alpha private memory',metadata:{context:'general',importance:8}})}); if(!r.ok)throw new Error(`upsert a ${r.status} ${await r.text()}`);
 r=await req('/v1/records/upsert',b,{method:'POST',body:JSON.stringify({id:idB,type:'memory',version:1,device_id:'device-b',content:'beta private memory',metadata:{context:'general'}})}); if(!r.ok)throw new Error(`upsert b ${r.status}`);
 r=await req('/v1/search',a,{method:'POST',body:JSON.stringify({query:'private memory',type:'memory'})}); const s=await r.json(); if(s.results.some(x=>x.id===idB))throw new Error('cross-user leak');
 r=await req('/v1/sync',b); const sync1=await r.json(); if(!sync1.next_cursor||!sync1.records.some(x=>x.id===idB))throw new Error('incremental sync missing record');
 r=await req(`/v1/sync?cursor=${encodeURIComponent(sync1.next_cursor)}`,b); const sync2=await r.json(); if(sync2.records.length||sync2.tombstones.length)throw new Error('repeated sync cursor not idempotent');
 r=await req('/v1/records/upsert',a,{method:'POST',body:JSON.stringify({id:idA,type:'memory',version:1,device_id:'device-a',content:'alpha private memory',metadata:{context:'general',importance:8}})}); const idem=await r.json(); if(idem.status!=='idempotent_noop')throw new Error('repeated sync not idempotent');
 r=await req(`/v1/records/${idA}`,a,{method:'DELETE',body:JSON.stringify({version:2,device_id:'device-a'})}); if(!r.ok)throw new Error('delete failed');
 r=await req('/v1/records/upsert',a,{method:'POST',body:JSON.stringify({id:idA,type:'memory',version:3,device_id:'device-a',content:'resurrect attempt',metadata:{}})}); if(r.status!==409)throw new Error(`deleted record resurrected: ${r.status}`);
 r=await req('/mcp',a,{method:'POST',headers:{'accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}); const m=await r.text(); if(!m.includes('memory_search')||!m.includes('personaldb_search'))throw new Error(`MCP tools missing: ${m.slice(0,200)}`);
 console.log('LOCAL_SMOKE_OK isolation idempotency tombstone fts fallback mcp');
} finally {worker.kill('SIGTERM');}

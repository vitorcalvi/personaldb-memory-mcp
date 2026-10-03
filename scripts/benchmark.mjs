import { performance } from 'node:perf_hooks';
const base=process.env.PERSONALDB_URL, token=process.env.PERSONALDB_TOKEN;
if(!base||!token){console.error('Set PERSONALDB_URL and PERSONALDB_TOKEN');process.exit(2);}
const queries=JSON.parse(process.env.BENCH_QUERIES || '[{"query":"refund policy","expected":[]}]');
const lat=[];let hits=0,total=0,d1=0,dims=0;
for(const q of queries){const t=performance.now();const r=await fetch(`${base.replace(/\/$/,'')}/v1/search`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','x-benchmark':'1'},body:JSON.stringify({query:q.query,vector:q.vector,top_k:q.top_k||10,type:q.type})});const body=await r.json();lat.push(performance.now()-t);d1+=body.metrics?.d1_rows_read||0;dims+=body.metrics?.vector_dimensions_queried||0;const ids=new Set((body.results||[]).map(x=>x.id));for(const id of q.expected||[]){total++;if(ids.has(id))hits++;}}
lat.sort((a,b)=>a-b);const pct=p=>lat[Math.min(lat.length-1,Math.floor((lat.length-1)*p))]||0;
console.log(JSON.stringify({queries:lat.length,p50_ms:+pct(.5).toFixed(2),p95_ms:+pct(.95).toFixed(2),recall_at_k:total?hits/total:null,d1_rows_read:d1,vector_dimensions_queried:dims},null,2));

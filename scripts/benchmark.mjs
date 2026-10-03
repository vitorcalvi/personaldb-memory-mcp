import { performance } from 'node:perf_hooks';

const base = process.env.PERSONALDB_URL;
const accessToken = process.env.PERSONALDB_ACCESS_TOKEN;
if (!base) {
  console.error('Set PERSONALDB_URL. For production, optionally provide a Cloudflare Access OAuth token in PERSONALDB_ACCESS_TOKEN.');
  process.exit(2);
}

const queries = JSON.parse(process.env.BENCH_QUERIES || '[{"query":"refund policy","expected":[]}]');
const latencies = [];
let hits = 0;
let total = 0;
let d1Rows = 0;
let vectorDimensions = 0;

for (const query of queries) {
  const headers = { 'content-type': 'application/json', 'x-benchmark': '1' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const started = performance.now();
  const response = await fetch(`${base.replace(/\/$/, '')}/v1/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: query.query,
      vector: query.vector,
      top_k: query.top_k || 10,
      type: query.type,
    }),
  });
  if (!response.ok) throw new Error(`benchmark request failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  latencies.push(performance.now() - started);
  d1Rows += body.metrics?.d1_rows_read || 0;
  vectorDimensions += body.metrics?.vector_dimensions_queried || 0;
  const ids = new Set((body.results || []).map((item) => item.id));
  for (const id of query.expected || []) {
    total += 1;
    if (ids.has(id)) hits += 1;
  }
}

latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] || 0;
console.log(JSON.stringify({
  queries: latencies.length,
  p50_ms: +percentile(0.5).toFixed(2),
  p95_ms: +percentile(0.95).toFixed(2),
  recall_at_k: total ? hits / total : null,
  d1_rows_read: d1Rows,
  vector_dimensions_queried: vectorDimensions,
}, null, 2));

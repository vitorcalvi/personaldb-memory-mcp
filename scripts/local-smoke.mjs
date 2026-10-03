import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';

const configPath = '.wrangler.smoke.json';
const databaseId = '11111111-1111-4111-8111-111111111111';

function config(userUuid, email) {
  return {
    name: 'personaldb-memory-mcp-smoke',
    main: 'src/index.ts',
    compatibility_date: '2026-10-03',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    vars: { EMBEDDING_DIMENSIONS: '384', RRF_K: '60' },
    access: {
      dev: {
        aud: 'personaldb-smoke',
        identity: { user_uuid: userUuid, email, name: email.split('@')[0] },
      },
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'personaldb-memory-smoke',
        database_id: databaseId,
        migrations_dir: 'migrations',
      },
    ],
  };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`)));
  });
}

async function wait(url) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* worker is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('worker did not start');
}

async function start(userUuid, email, port) {
  await writeFile(configPath, `${JSON.stringify(config(userUuid, email), null, 2)}\n`);
  const worker = spawn(
    'npx',
    ['wrangler', 'dev', '--local', '--config', configPath, '--port', String(port)],
    { stdio: 'inherit', detached: true },
  );
  worker.unref();
  await wait(`http://127.0.0.1:${port}/healthz`);
  return worker;
}

async function stop(worker) {
  if (worker?.pid) {
    try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* already stopped */ }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

function request(port, path, init = {}) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

const suffix = Date.now().toString(36).toUpperCase().padStart(20, '0').slice(-20);
const idA = `01A${suffix}`;
const idB = `01B${suffix}`;
let worker;

try {
  await writeFile(configPath, `${JSON.stringify(config('access-user-a', 'a@example.test'), null, 2)}\n`);
  await run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--config', configPath]);

  worker = await start('access-user-a', 'a@example.test', 8791);
  let response = await request(8791, '/v1/records/upsert', {
    method: 'POST',
    body: JSON.stringify({
      id: idA,
      type: 'memory',
      version: 1,
      device_id: 'device-a',
      content: 'alpha private memory',
      metadata: { context: 'general', importance: 8 },
    }),
  });
  if (!response.ok) throw new Error(`upsert A ${response.status} ${await response.text()}`);

  response = await request(8791, '/mcp', {
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'personaldb-smoke', version: '1.0.0' },
      },
    }),
  });
  if (!response.ok) throw new Error(`authenticated MCP initialize failed: ${response.status} ${await response.text()}`);
  await stop(worker);
  worker = undefined;

  worker = await start('access-user-b', 'b@example.test', 8792);
  response = await request(8792, '/v1/records/upsert', {
    method: 'POST',
    body: JSON.stringify({
      id: idB,
      type: 'memory',
      version: 1,
      device_id: 'device-b',
      content: 'beta private memory',
      metadata: { context: 'general' },
    }),
  });
  if (!response.ok) throw new Error(`upsert B ${response.status} ${await response.text()}`);

  response = await request(8792, '/v1/search', {
    method: 'POST',
    body: JSON.stringify({ query: 'private memory', type: 'memory' }),
  });
  const searchB = await response.json();
  if (searchB.results.some((item) => item.id === idA)) throw new Error('cross-user leak: B can see A');
  if (!searchB.results.some((item) => item.id === idB)) throw new Error('B cannot see own record');

  const sync = await request(8792, '/v1/sync');
  const syncBody = await sync.json();
  if (!syncBody.records.some((item) => item.id === idB)) throw new Error('incremental sync missing B record');
  await stop(worker);
  worker = undefined;

  worker = await start('access-user-a', 'a@example.test', 8793);
  response = await request(8793, '/v1/search', {
    method: 'POST',
    body: JSON.stringify({ query: 'private memory', type: 'memory' }),
  });
  const searchA = await response.json();
  if (searchA.results.some((item) => item.id === idB)) throw new Error('cross-user leak: A can see B');
  if (!searchA.results.some((item) => item.id === idA)) throw new Error('A cannot see own record');

  response = await request(8793, `/v1/records/${idA}`, {
    method: 'DELETE',
    body: JSON.stringify({ version: 2, device_id: 'device-a' }),
  });
  if (!response.ok) throw new Error('delete failed');
  response = await request(8793, '/v1/records/upsert', {
    method: 'POST',
    body: JSON.stringify({ id: idA, type: 'memory', version: 3, device_id: 'device-a', content: 'resurrect attempt', metadata: {} }),
  });
  if (response.status !== 409) throw new Error(`deleted record resurrected: ${response.status}`);

  console.log('LOCAL_SMOKE_OK access identity isolation mcp sync tombstone fts fallback');
} finally {
  await stop(worker);
  await rm(configPath, { force: true });
}

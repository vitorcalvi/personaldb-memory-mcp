import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const distRoot = path.join(root, 'dist');
const stageDir = path.join(distRoot, 'personaldb-memory-plugin');
const zipPath = path.join(distRoot, 'personaldb-memory-plugin.zip');

const pluginManifestPath = path.join(root, 'plugin.json');
const mcpManifestPath = path.join(root, 'mcp.json');
const pluginManifest = JSON.parse(await readFile(pluginManifestPath, 'utf8'));
const mcpManifest = JSON.parse(await readFile(mcpManifestPath, 'utf8'));

function fail(message) {
  console.error(`Plugin package validation failed: ${message}`);
  process.exit(2);
}

if (pluginManifest.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') {
  fail('plugin.json must use the Agent Plugins 1.0.0 schema.');
}
if (!pluginManifest.name || !pluginManifest.version || !pluginManifest.description) {
  fail('plugin.json requires name, version, and description.');
}
if (mcpManifest.$schema !== 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json') {
  fail('mcp.json must use the Agent Plugins MCP 1.0.0 schema.');
}

const servers = Object.entries(mcpManifest.mcpServers ?? {});
if (servers.length !== 1) fail('mcp.json must declare exactly one PersonalDB MCP server.');
const [serverName, server] = servers[0];
if (server.type !== 'streamable-http') fail(`${serverName} must use type streamable-http.`);
if (typeof server.url !== 'string' || !server.url.startsWith('https://') || !server.url.endsWith('/mcp')) {
  fail(`${serverName} must use the production HTTPS /mcp endpoint.`);
}

const openai = pluginManifest.extensions?.['com.openai'];
if (!openai?.interface) fail('plugin.json must include extensions.com.openai.interface.');
if (openai.apps) fail('Uploaded portable ZIP must not reference .app.json; use mcp.json for this package.');

const requiredFiles = [
  'plugin.json',
  'mcp.json',
  'PRIVACY.md',
  'TERMS.md',
  'SUPPORT.md',
  'assets/icon.svg',
  'assets/logo.svg',
  'skills/personaldb-memory/SKILL.md',
];
for (const relative of requiredFiles) {
  try {
    const info = await stat(path.join(root, relative));
    if (!info.isFile()) fail(`${relative} is not a regular file.`);
  } catch {
    fail(`missing required file: ${relative}`);
  }
}

await rm(distRoot, { recursive: true, force: true });
await mkdir(path.join(stageDir, 'assets'), { recursive: true });
await mkdir(path.join(stageDir, 'skills', 'personaldb-memory'), { recursive: true });

for (const relative of requiredFiles) {
  const destination = path.join(stageDir, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, relative), destination);
}

function makeZip() {
  // Put plugin.json at the ZIP root. This removes plugin-root ambiguity and matches
  // the current portable Agent Plugins upload format exactly.
  const nativeZip = spawnSync('zip', ['-qr', zipPath, '.'], {
    cwd: stageDir,
    encoding: 'utf8',
  });
  if (nativeZip.status === 0) return;

  const pythonScript = [
    'import os, sys, zipfile',
    'root, out = sys.argv[1], sys.argv[2]',
    'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
    '    for base, dirs, files in os.walk(root):',
    '        dirs.sort(); files.sort()',
    '        for name in files:',
    '            src = os.path.join(base, name)',
    '            arc = os.path.relpath(src, root).replace(os.sep, "/")',
    '            z.write(src, arc)',
  ].join('\n');

  for (const python of ['python3', 'python']) {
    const fallback = spawnSync(python, ['-c', pythonScript, stageDir, zipPath], {
      encoding: 'utf8',
    });
    if (fallback.status === 0) return;
  }
  fail('could not create ZIP: neither zip nor Python zipfile is available.');
}

makeZip();

const verifyScript = [
  'import sys, zipfile',
  'p=sys.argv[1]',
  'with zipfile.ZipFile(p) as z:',
  '    names=set(z.namelist())',
  '    required={"plugin.json","mcp.json","assets/icon.svg","assets/logo.svg","skills/personaldb-memory/SKILL.md"}',
  '    missing=sorted(required-names)',
  '    assert not missing, "missing: " + ", ".join(missing)',
  '    assert z.testzip() is None, "corrupt ZIP member"',
].join('\n');

let verified = false;
for (const python of ['python3', 'python']) {
  const result = spawnSync(python, ['-c', verifyScript, zipPath], { encoding: 'utf8' });
  if (result.status === 0) {
    verified = true;
    break;
  }
}
if (!verified) fail('ZIP verification failed.');

console.log(`Plugin stage directory: ${stageDir}`);
console.log(`Installable ChatGPT plugin ZIP: ${zipPath}`);
console.log(`MCP server: ${server.url}`);

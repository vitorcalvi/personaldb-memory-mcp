import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const cliAppId = process.argv.find((arg) => arg.startsWith('--app-id='))?.slice('--app-id='.length);
const appId = (cliAppId || process.env.PERSONALDB_CHATGPT_APP_ID || '').trim();

if (!appId || /^<.*>$/.test(appId) || /replace|example|dummy/i.test(appId)) {
  console.error('Missing real ChatGPT App ID. Set PERSONALDB_CHATGPT_APP_ID=<app-id> or pass --app-id=<app-id>.');
  console.error('Do not use the MCP URL directly in a web plugin: OpenAI marks direct mcp.json/.mcp.json plugins Desktop only.');
  process.exit(2);
}

const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
const distRoot = path.join(root, 'dist');
const pluginName = manifest.name;
const pluginDir = path.join(distRoot, pluginName);
const zipPath = path.join(distRoot, `${pluginName}-plugin.zip`);

await rm(distRoot, { recursive: true, force: true });
await mkdir(path.join(pluginDir, 'skills', 'personaldb-memory'), { recursive: true });
await mkdir(path.join(pluginDir, '.codex-plugin'), { recursive: true });
await mkdir(path.join(pluginDir, 'assets'), { recursive: true });

for (const file of ['PRIVACY.md', 'TERMS.md', 'SUPPORT.md']) {
  await cp(path.join(root, file), path.join(pluginDir, file));
}
await cp(path.join(root, 'assets', 'icon.svg'), path.join(pluginDir, 'assets', 'icon.svg'));
await cp(path.join(root, 'assets', 'logo.svg'), path.join(pluginDir, 'assets', 'logo.svg'));
await cp(path.join(root, 'skills', 'personaldb-memory', 'SKILL.md'), path.join(pluginDir, 'skills', 'personaldb-memory', 'SKILL.md'));

// ChatGPT web plugins reference an already-created ChatGPT App by id.
const appMap = {
  apps: {
    personaldb_memory: { id: appId },
  },
};
await writeFile(path.join(pluginDir, '.app.json'), `${JSON.stringify(appMap, null, 2)}\n`);

const openai = manifest.extensions?.['com.openai'] ?? {};
const nativeManifest = {
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  author: manifest.author,
  homepage: manifest.homepage,
  repository: manifest.repository,
  license: manifest.license,
  keywords: manifest.keywords,
  skills: './skills/',
  apps: './.app.json',
  interface: openai.interface,
};
await writeFile(path.join(pluginDir, '.codex-plugin', 'plugin.json'), `${JSON.stringify(nativeManifest, null, 2)}\n`);

function makeZip() {
  const nativeZip = spawnSync('zip', ['-qr', zipPath, pluginName], { cwd: distRoot, encoding: 'utf8' });
  if (nativeZip.status === 0) return;
  for (const python of ['python3', 'python']) {
    const fallback = spawnSync(python, ['-m', 'zipfile', '-c', zipPath, pluginName], { cwd: distRoot, encoding: 'utf8' });
    if (fallback.status === 0) return;
  }
  console.error('Could not create ZIP: neither `zip` nor Python zipfile is available.');
  process.exit(1);
}

makeZip();
console.log(`Plugin directory: ${pluginDir}`);
console.log(`Plugin ZIP: ${zipPath}`);
console.log(`ChatGPT App ID: ${appId}`);

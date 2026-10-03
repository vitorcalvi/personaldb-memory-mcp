import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const cliAppId = process.argv.find((arg) => arg.startsWith('--app-id='))?.slice('--app-id='.length);
const rawAppId = (cliAppId || process.env.PERSONALDB_CHATGPT_APP_ID || '').trim();

function fail(message) {
  console.error(`App-reference plugin validation failed: ${message}`);
  process.exit(2);
}

if (!rawAppId) {
  fail('missing app id. Create the MCP App in ChatGPT first, then pass --app-id=asdk_app_...');
}

// ChatGPT browser URLs may expose plugin_asdk_app_..., while .app.json requires
// the app id itself: asdk_app_... (without the leading plugin_ wrapper).
const appId = rawAppId.startsWith('plugin_asdk_app_') ? rawAppId.slice('plugin_'.length) : rawAppId;
if (!/^(asdk_app_|connector_|templated_apps_)[A-Za-z0-9][A-Za-z0-9_-]*$/.test(appId)) {
  fail('app id must start with asdk_app_, connector_, or templated_apps_.');
}

const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
const openai = manifest.extensions?.['com.openai'];
if (!openai?.interface) fail('plugin.json must include extensions.com.openai.interface.');

const webManifest = structuredClone(manifest);
webManifest.extensions['com.openai'].apps = './.app.json';
webManifest.extensions['com.openai'].publication = {
  ...(webManifest.extensions['com.openai'].publication ?? {}),
  release_notes: 'ChatGPT app-reference package for web/workspace use. References an existing registered PersonalDB MCP App through .app.json.',
};

const appManifest = {
  apps: {
    'personaldb-memory': {
      id: appId,
      required: true,
    },
  },
};

const distRoot = path.join(root, 'dist');
const stageDir = path.join(distRoot, 'personaldb-memory-app-plugin');
const zipPath = path.join(distRoot, 'personaldb-memory-app-plugin.zip');

const requiredFiles = [
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

await rm(stageDir, { recursive: true, force: true });
await mkdir(path.join(stageDir, 'assets'), { recursive: true });
await mkdir(path.join(stageDir, 'skills', 'personaldb-memory'), { recursive: true });
await writeFile(path.join(stageDir, 'plugin.json'), `${JSON.stringify(webManifest, null, 2)}\n`);
await writeFile(path.join(stageDir, '.app.json'), `${JSON.stringify(appManifest, null, 2)}\n`);
for (const relative of requiredFiles) {
  const destination = path.join(stageDir, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, relative), destination);
}

function makeZip() {
  const nativeZip = spawnSync('zip', ['-qr', zipPath, '.'], { cwd: stageDir, encoding: 'utf8' });
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
    const fallback = spawnSync(python, ['-c', pythonScript, stageDir, zipPath], { encoding: 'utf8' });
    if (fallback.status === 0) return;
  }
  fail('could not create ZIP: neither zip nor Python zipfile is available.');
}

makeZip();
console.log(`Web/workspace ChatGPT plugin ZIP: ${zipPath}`);
console.log(`Referenced app id: ${appId}`);

import { rm, mkdir, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, 'dist-source');
const name = 'personaldb-memory-mcp-source';
const stage = path.join(dist, name);
const zipPath = path.join(root, 'dist', `${name}.zip`);
await rm(dist, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
const exclude = new Set(['.git', 'node_modules', 'dist', 'dist-source', '.wrangler']);
for (const entry of ['src','scripts','tests','migrations','skills','assets','chatgpt','docs','.github','package.json','package-lock.json','plugin.json','wrangler.jsonc','tsconfig.json','eslint.config.js','README.md','PRIVACY.md','SECURITY.md','SUPPORT.md','TERMS.md','LICENSE','.dev.vars.example','.gitignore']) {
  const src = path.join(root, entry);
  await cp(src, path.join(stage, entry), { recursive: true, force: true, filter: (p) => !p.split(path.sep).some(x => exclude.has(x)) });
}
await mkdir(path.join(root, 'dist'), { recursive: true });
await rm(zipPath, { force: true });
let ok = false;
const nativeZip = spawnSync('zip', ['-qr', zipPath, name], { cwd: dist, encoding: 'utf8' });
if (nativeZip.status === 0) ok = true;
if (!ok) {
  for (const python of ['python3', 'python']) {
    const fallback = spawnSync(python, ['-m', 'zipfile', '-c', zipPath, name], { cwd: dist, encoding: 'utf8' });
    if (fallback.status === 0) { ok = true; break; }
  }
}
if (!ok) throw new Error('Could not create source ZIP: neither zip nor Python zipfile is available.');
console.log(`Source ZIP: ${zipPath}`);

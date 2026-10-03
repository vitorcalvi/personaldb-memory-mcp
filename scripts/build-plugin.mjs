import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const root = process.cwd();
const cliUrl = process.argv.find((arg) => arg.startsWith('--mcp-url='))?.slice('--mcp-url='.length);
const mcpUrl = cliUrl || process.env.PERSONALDB_MCP_URL;

if (!mcpUrl) {
  console.error('Missing MCP URL. Set PERSONALDB_MCP_URL=https://<host>/mcp or pass --mcp-url=https://<host>/mcp');
  process.exit(2);
}

let parsed;
try {
  parsed = new URL(mcpUrl);
} catch {
  console.error('PERSONALDB_MCP_URL must be a valid URL.');
  process.exit(2);
}

if (parsed.protocol !== 'https:' || !parsed.hostname || !parsed.pathname.endsWith('/mcp')) {
  console.error('PERSONALDB_MCP_URL must be a public HTTPS URL whose path ends in /mcp.');
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

await cp(path.join(root, 'plugin.json'), path.join(pluginDir, 'plugin.json'));
await cp(path.join(root, 'PRIVACY.md'), path.join(pluginDir, 'PRIVACY.md'));
await cp(path.join(root, 'TERMS.md'), path.join(pluginDir, 'TERMS.md'));
await cp(
  path.join(root, 'skills', 'personaldb-memory', 'SKILL.md'),
  path.join(pluginDir, 'skills', 'personaldb-memory', 'SKILL.md'),
);

const portableMcp = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
  mcpServers: {
    personaldb_memory: {
      type: 'streamable-http',
      url: mcpUrl,
    },
  },
};
await writeFile(path.join(pluginDir, 'mcp.json'), `${JSON.stringify(portableMcp, null, 2)}\n`);

const compatibilityMcp = {
  mcpServers: {
    personaldb_memory: {
      type: 'http',
      url: mcpUrl,
    },
  },
};
await writeFile(path.join(pluginDir, '.mcp.json'), `${JSON.stringify(compatibilityMcp, null, 2)}\n`);

const compatibilityManifest = {
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  skills: './skills/',
  mcpServers: './.mcp.json',
  interface: manifest.extensions?.['com.openai']?.interface,
};
await writeFile(
  path.join(pluginDir, '.codex-plugin', 'plugin.json'),
  `${JSON.stringify(compatibilityManifest, null, 2)}\n`,
);

const zip = spawnSync('zip', ['-qr', zipPath, pluginName], {
  cwd: distRoot,
  encoding: 'utf8',
});
if (zip.status !== 0) {
  console.error(zip.stderr || 'zip command failed. Install the zip utility and retry.');
  process.exit(zip.status || 1);
}

console.log(`Plugin directory: ${pluginDir}`);
console.log(`Plugin ZIP: ${zipPath}`);
console.log(`MCP URL: ${mcpUrl}`);

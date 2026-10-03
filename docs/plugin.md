# ChatGPT plugin packaging and installation

PersonalDB supports two distinct plugin package modes. Do not mix them in one ZIP.

## A. Direct MCP portable ZIP

Use this for the current portable Agent Plugins format and Desktop/direct-MCP testing.

```bash
npm run plugin:build
```

Output:

```text
dist/personaldb-memory-plugin.zip
```

The ZIP root contains:

- `plugin.json` — canonical Agent Plugins manifest
- `mcp.json` — production `streamable-http` MCP endpoint
- `skills/personaldb-memory/SKILL.md`
- `assets/icon.svg` and `assets/logo.svg`
- `PRIVACY.md`, `TERMS.md`, and `SUPPORT.md`

The MCP endpoint is:

```text
https://personaldb-memory-mcp-production.vitorcalvi.workers.dev/mcp
```

This package intentionally contains no `.app.json` and no `.codex-plugin` overlay, which prevents duplicate or conflicting MCP declarations.

## B. Existing ChatGPT MCP App reference ZIP

Use this when ChatGPT has already registered the PersonalDB MCP through **Create MCP App** and you want the plugin to reference that existing app for web/workspace use.

1. In ChatGPT, create the MCP App with the production MCP URL.
2. Copy the app's technical ID. Browser URLs may show `plugin_asdk_app_...`; `.app.json` requires `asdk_app_...` without the leading `plugin_` wrapper.
3. Build:

```bash
npm run plugin:build:app -- --app-id=asdk_app_...
```

You may also paste `plugin_asdk_app_...`; the builder normalizes it automatically.

Output:

```text
dist/personaldb-memory-app-plugin.zip
```

This ZIP contains root `plugin.json` plus `.app.json`, the skill, assets, and policy documents. It intentionally does **not** contain `mcp.json`.

## Complete source bundle

For auditing, backup, self-hosting, or release distribution of the full implementation:

```bash
npm run plugin:source
```

Output:

```text
dist/personaldb-memory-mcp-source.zip
```

The source bundle is not the ChatGPT install ZIP.

## Installation

### Direct package

1. Run `npm run plugin:build`.
2. Open ChatGPT → Plugins → Add → Upload plugin.
3. Upload `dist/personaldb-memory-plugin.zip`.
4. Complete Cloudflare authorization when ChatGPT connects to the MCP server.

### App-reference package

1. Open ChatGPT → Plugins → Add → Create MCP App.
2. Register `https://personaldb-memory-mcp-production.vitorcalvi.workers.dev/mcp` and complete OAuth setup.
3. Build the app-reference ZIP with the resulting app ID.
4. Upload `dist/personaldb-memory-app-plugin.zip`.

After installation, test `memory_health`, then `memory_add`, then `memory_search`.

## Public submission readiness

For public directory submission, verify production OAuth, the MCP tool scan, privacy/terms/support URLs, developer identity, and required review materials. Keep reviewer credentials, OAuth tokens, API keys, and private memory content out of the repository and ZIP.

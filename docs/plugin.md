# ChatGPT plugin packaging and installation

PersonalDB has two different distributable artifacts. Do not confuse them.

## 1. Installable ChatGPT plugin ZIP

The installable ZIP follows the current portable Agent Plugins format. It contains the plugin manifest, remote MCP declaration, skill, listing assets, and policy documents. The Cloudflare Worker itself remains remote and is not bundled.

Build it with:

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
- `skills/personaldb-memory/SKILL.md` — workflow instructions
- `assets/icon.svg` and `assets/logo.svg` — listing assets
- `PRIVACY.md`, `TERMS.md`, and `SUPPORT.md`

The package intentionally does **not** include `.app.json`, does not require a pre-created `plugin_asdk_app...` id, and does not emit a second legacy MCP declaration. This avoids ambiguous plugin roots and incompatible portable/legacy MCP mappings.

The MCP endpoint currently packaged is:

```text
https://personaldb-memory-mcp-production.vitorcalvi.workers.dev/mcp
```

Authentication is handled by the MCP service through Cloudflare Access Managed OAuth.

## 2. Complete source bundle

For auditing, backup, self-hosting, or release distribution of the entire implementation:

```bash
npm run plugin:source
```

Output:

```text
dist/personaldb-memory-mcp-source.zip
```

That archive contains the Worker source, migrations, tests, build/deploy scripts, docs, skills, assets, manifests, and package lock. It is **not** the file to upload as a ChatGPT plugin.

## Install in ChatGPT

When your account exposes plugin ZIP upload:

1. Run `npm run plugin:build`.
2. Open ChatGPT → Plugins → Add → Upload plugin.
3. Upload `dist/personaldb-memory-plugin.zip`.
4. Complete the Cloudflare authorization flow when ChatGPT connects to the MCP server.
5. Test `memory_health`, then `memory_add`, then `memory_search`.

If you deliberately want to reference an already-registered ChatGPT MCP app instead, use an `.app.json`-based package as a separate distribution mode. Do not mix that mode with the direct portable `mcp.json` package.

## Public submission readiness

For public directory submission, verify production OAuth, the MCP tool scan, privacy/terms/support URLs, developer identity, and required review materials. Keep reviewer credentials, OAuth tokens, API keys, and private memory content out of the repository and ZIP.

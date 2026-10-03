# ChatGPT plugin packaging and installation

PersonalDB has two different distributable artifacts. Do not confuse them.

## 1. ChatGPT web plugin ZIP

The web plugin is intentionally small because the PersonalDB server runs remotely on Cloudflare. The ZIP contains metadata, skills, assets, and an **app reference**. It does not contain the Worker runtime or `node_modules`.

A web plugin must reference an existing ChatGPT App in `.app.json`. Directly declaring the remote MCP in `mcp.json` or `.mcp.json` makes the plugin **Desktop only**, even when the endpoint is remote HTTPS.

First create/register the PersonalDB MCP as a ChatGPT App and obtain its App ID. Then build:

```bash
PERSONALDB_CHATGPT_APP_ID=plugin_asdk_app_... npm run plugin:build
```

or:

```bash
npm run plugin:build -- --app-id=plugin_asdk_app_...
```

The build refuses to run without a real App ID so it cannot silently generate the previous invalid web package.

Output:

```text
dist/personaldb-memory/
dist/personaldb-memory-plugin.zip
```

The ChatGPT ZIP contains:

- `.codex-plugin/plugin.json` — native plugin manifest
- `.app.json` — reference to the existing ChatGPT App ID
- `skills/personaldb-memory/SKILL.md` — workflow instructions
- `assets/icon.svg` and `assets/logo.svg` — listing assets
- privacy, terms, and support documents

It intentionally does **not** contain `mcp.json` or `.mcp.json`.

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

When your ChatGPT account or workspace exposes plugin ZIP upload:

1. Ensure the underlying PersonalDB ChatGPT App already exists and is available to your account/workspace.
2. Build the plugin with that real App ID.
3. Open ChatGPT web → Admin / Plugins → Add → Upload plugin.
4. Upload `dist/personaldb-memory-plugin.zip`.
5. Install/connect the referenced PersonalDB app and complete its Cloudflare authorization flow.
6. Test `memory_health`, then `memory_add`, then `memory_search`.

Installing a plugin does not create the referenced ChatGPT App and does not bypass its authentication or workspace permissions.

## Public submission readiness

Before public distribution, the underlying PersonalDB App must be created/submitted and have a stable app identifier. Also verify production OAuth, MCP tool scan, privacy/terms/support URLs, developer identity, and any review attestations required by the current ChatGPT publishing flow.

Do not put reviewer credentials, OAuth tokens, API keys, or private memory content in the repository or plugin ZIP.

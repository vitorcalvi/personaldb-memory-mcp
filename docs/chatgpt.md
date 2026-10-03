# Connect PersonalDB Memory to ChatGPT

## End-user experience

PersonalDB is designed to require no technical configuration from the user after the plugin/app is prepared by the product owner.

1. Install **PersonalDB Memory** in ChatGPT.
2. ChatGPT connects to the PersonalDB MCP service or the registered PersonalDB MCP App.
3. ChatGPT opens the Cloudflare Access authorization flow when authentication is required.
4. Sign in with your Cloudflare account and approve access.
5. Return to ChatGPT. PersonalDB is ready.

The end user does not need a PersonalDB API key, GitHub account, OAuth client id/secret, Wrangler, D1 configuration, Vectorize configuration, or a hand-written MCP config file.

## Production MCP URL

```text
https://personaldb-memory-mcp-production.vitorcalvi.workers.dev/mcp
```

Cloudflare Access Managed OAuth provides the authentication discovery/challenge and authorization flow at the edge.

## First tests

```text
Use PersonalDB Memory to run memory_health.
Save this as a memory: "I prefer concise technical reports."
Search my memories for "technical reports".
```

## Identity model

Cloudflare Access authenticates the user. The Worker reads `ctx.access.getIdentity()` and requires a stable `user_uuid`. PersonalDB hashes that value into an opaque internal `usr_...` tenant id. Email is display metadata only and is not the database partition key.

## Operator requirement

Before users can connect, the product owner must configure Cloudflare Access once for the production Worker/hostname and enable Managed OAuth. See [`cloudflare-access.md`](cloudflare-access.md).

## Plugin package modes

### Direct portable MCP package

```bash
npm run plugin:build
```

Produces:

```text
dist/personaldb-memory-plugin.zip
```

This package uses root `plugin.json` plus root `mcp.json`.

### Existing ChatGPT MCP App reference package

For web/workspace use, first register the production MCP through **Create MCP App** in ChatGPT. Then build with the resulting app id:

```bash
npm run plugin:build:app -- --app-id=asdk_app_...
```

If the browser URL exposes `plugin_asdk_app_...`, that value is accepted too; the build script strips the leading `plugin_` wrapper before writing `.app.json`.

Produces:

```text
dist/personaldb-memory-app-plugin.zip
```

This package references the registered app through root `.app.json` and deliberately omits `mcp.json`.

For a complete repository/source archive (not a ChatGPT install ZIP):

```bash
npm run plugin:source
```

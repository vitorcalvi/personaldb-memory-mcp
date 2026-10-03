# Connect PersonalDB Memory to ChatGPT

## End-user experience

PersonalDB is designed to require no technical configuration from the user.

1. Install **PersonalDB Memory** in ChatGPT.
2. ChatGPT connects to the packaged PersonalDB MCP endpoint.
3. ChatGPT opens the Cloudflare Access authorization flow when authentication is required.
4. Sign in with your Cloudflare account and approve access.
5. Return to ChatGPT. PersonalDB is ready.

The user does not need a PersonalDB API key, GitHub account, OAuth client id/secret, Wrangler, D1 configuration, Vectorize configuration, or a hand-written MCP config file.

## Production MCP URL

The installable plugin contains this production MCP endpoint in root `mcp.json`:

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

## Plugin packaging

Build the current portable Agent Plugins package directly:

```bash
npm run plugin:build
```

The output is:

```text
dist/personaldb-memory-plugin.zip
```

The ZIP uses root `plugin.json` plus root `mcp.json`. It does not require a pre-created ChatGPT App ID and does not contain `.app.json`.

For a complete repository/source archive (not a ChatGPT install ZIP):

```bash
npm run plugin:source
```

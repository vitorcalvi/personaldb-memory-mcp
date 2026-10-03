# Connect PersonalDB Memory to ChatGPT

## End-user experience

PersonalDB is designed to require no technical configuration from the user.

1. Select **Set up PersonalDB Memory** in ChatGPT.
2. ChatGPT opens the Cloudflare Access authorization flow.
3. Sign in with your Cloudflare account.
4. Review the request and choose **Allow**.
5. Return to ChatGPT. PersonalDB is ready.

The user does not need a PersonalDB API key, GitHub account, OAuth client id/secret, Wrangler, D1 configuration, Vectorize configuration, or an MCP config file.

## MCP URL

The published ChatGPT app/plugin contains the production MCP URL:

```text
https://<production-host>/mcp
```

For development-only manual MCP setup, use the same URL. Cloudflare Access Managed OAuth provides the OAuth discovery/challenge and authorization flow at the edge.

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

## Web plugin packaging

The ChatGPT web plugin ZIP must reference an existing ChatGPT App in `.app.json`. Do **not** package a remote MCP directly in `mcp.json` or `.mcp.json` for web distribution; OpenAI classifies those plugins as Desktop only even when the MCP URL is HTTPS.

Build only after the PersonalDB MCP has been created as a ChatGPT App and you have its App ID:

```bash
PERSONALDB_CHATGPT_APP_ID=plugin_asdk_app_... npm run plugin:build
```

For a complete repository/source archive (not a ChatGPT install ZIP):

```bash
npm run plugin:source
```

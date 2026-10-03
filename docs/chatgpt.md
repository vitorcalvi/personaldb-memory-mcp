# Attach PersonalDB Memory MCP to ChatGPT

PersonalDB exposes a remote **Streamable HTTP MCP** at:

```text
https://<your-worker-host>/mcp
```

The MCP endpoint uses OAuth 2.1. ChatGPT discovers the protected-resource and authorization-server metadata automatically, then opens the authorization flow. Do **not** paste a bearer token into ChatGPT.

## One-time deployment setup

1. Provision D1, Vectorize, and the `OAUTH_KV` namespace (`bash scripts/provision.sh` for a new deployment).
2. Create a GitHub OAuth App for this Worker.
3. Set its Authorization callback URL to:

```text
https://<your-worker-host>/oauth/github/callback
```

4. Store the GitHub OAuth credentials as Worker secrets:

```bash
npx wrangler secret put GITHUB_CLIENT_ID --env production
npx wrangler secret put GITHUB_CLIENT_SECRET --env production
```

5. Keep the existing REST/mobile authentication configured separately:

```bash
openssl rand -hex 32 | npx wrangler secret put AUTH_HMAC_SECRET --env production
```

6. For a private PersonalDB deployment, optionally restrict who may authorize it:

```bash
npx wrangler secret put ALLOWED_GITHUB_LOGINS --env production
```

Use a comma-separated value such as `alice,bob`. When unset, any GitHub account can authorize an isolated PersonalDB tenant.

7. Deploy:

```bash
npm run deploy
```

## Add to ChatGPT

In ChatGPT, create a custom MCP/app using this server URL:

```text
https://<your-worker-host>/mcp
```

Authentication is discovered automatically. During authorization, PersonalDB shows the requesting client, redirect host, and requested scopes, then redirects to GitHub for identity. The stable numeric GitHub user id becomes the PersonalDB tenant id; repository access is not required.

The server supports CIMD and Dynamic Client Registration, PKCE through the Cloudflare OAuth provider, refresh tokens, RFC 9728 protected-resource metadata, and audience-bound access tokens.

## First tests

```text
Use PersonalDB Memory to run memory_health.
Use PersonalDB Memory to add a memory: "I prefer concise technical reports."
Search my memories for "technical reports".
```

## Authentication split

- `/mcp`: OAuth 2.1 for ChatGPT and other remote MCP clients.
- `/v1/*`: existing HMAC bearer tokens for Ava Mobile / My Thoughs sync clients.

The two paths intentionally share the same PersonalDB storage model without forcing the mobile clients to migrate authentication at the same time.

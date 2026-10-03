# Security

## Authentication

Production authentication is delegated to Cloudflare Access with Managed OAuth. PersonalDB does not issue API keys, shared HMAC bearer tokens, or application-level OAuth credentials.

The Worker fails closed for protected routes when `ctx.access` is absent. The only unauthenticated application route is `/healthz`; a Worker-level Access policy may still protect it at the edge.

## Identity isolation

PersonalDB requires a stable Cloudflare Access `user_uuid` and derives an opaque internal `usr_...` tenant id using SHA-256. Email is not used as a tenant key.

All D1 reads/writes are scoped by authenticated `user_id`. Vectorize uses a derived per-user namespace, and vector hits are joined back through D1 using the same authenticated tenant id.

Request bodies containing `user_id` are rejected.

## Secrets and logs

Do not log or persist:

- `Authorization` bearer tokens
- `Cf-Access-Jwt-Assertion`
- Cloudflare Access session cookies
- raw private memory contents unless required by the actual storage operation
- embedding vectors

No PersonalDB API key exists in the production design.

## Cloudflare Access configuration

For a public consumer deployment using Cloudflare accounts, the Cloudflare identity provider must not be restricted to members of the product owner's Cloudflare account. Access policies should still require successful authentication, and Managed OAuth must be enabled for MCP/non-browser clients.

## Reporting

Report security issues privately to the repository owner. Do not include real user memories, tokens, cookies, or credentials in public issues.

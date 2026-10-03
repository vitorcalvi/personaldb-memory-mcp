# Cloudflare Access production setup

This is a **one-time product-owner setup**. End users do not perform these steps.

## Target UX

```text
ChatGPT -> Set up PersonalDB -> Cloudflare sign-in -> Allow -> done
```

## Requirements

- PersonalDB Worker deployed on Cloudflare.
- Cloudflare Zero Trust enabled for the product-owner account.
- Cloudflare identity provider enabled.
- Managed OAuth enabled for the Access application that protects PersonalDB.

## Configure the application

1. In Cloudflare, open **Zero Trust -> Access controls -> Applications**.
2. Protect the production PersonalDB Worker or its production hostname.
3. Use the **Cloudflare** identity provider.
4. If PersonalDB is intended for external customers, disable **Restrict to account members** on the Cloudflare identity provider. Leaving it enabled restricts sign-in to members of the product owner's Cloudflare account.
5. Create an **Allow** policy that permits **Everyone** who successfully authenticates.
6. Under the application's advanced settings, enable **Managed OAuth**.
7. Keep the Worker itself fail-closed: production requests to `/mcp` and `/v1/*` require `ctx.access`.

## Why Managed OAuth

Managed OAuth turns Cloudflare Access into the OAuth authorization server for non-browser clients such as ChatGPT, CLIs, AI agents, SDKs, and mobile clients. PersonalDB therefore does not need to implement authorization-code exchange, dynamic client registration, refresh-token storage, GitHub OAuth, or its own bearer-token issuer.

## Identity and tenancy

The Worker calls:

```ts
const identity = await ctx.access.getIdentity();
```

It requires `identity.user_uuid`, then derives an opaque PersonalDB tenant id from that stable subject. Never accept `user_id` from request bodies.

## Verification

After Access is configured:

1. Open the MCP URL without an Access session and confirm Cloudflare blocks/challenges it.
2. Confirm the protected resource/OAuth discovery exposed by Access is reachable by the MCP client.
3. Complete Cloudflare sign-in with two separate Cloudflare users and verify each sees only their own PersonalDB records.
4. Revoke one user's Access/OAuth authorization and verify subsequent requests are rejected.

## Important

Do not put another OAuth server behind Access Managed OAuth. Managed OAuth is the OAuth layer for this architecture. PersonalDB's former `@cloudflare/workers-oauth-provider` + GitHub OAuth implementation has intentionally been removed.

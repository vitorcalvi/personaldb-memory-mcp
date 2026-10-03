# PersonalDB Memory MCP

Production-oriented private memory and hybrid retrieval for **ChatGPT**, **Ava Mobile**, and **My Thoughs**, built on Cloudflare Workers + D1 FTS5 + Vectorize + weighted Reciprocal Rank Fusion (RRF).

## Product goal

End-user setup is intentionally minimal:

```text
Install / Set up PersonalDB Memory
        ↓
Sign in with Cloudflare
        ↓
Allow access
        ↓
Done
```

There are **no PersonalDB API keys, no GitHub login, no OAuth client secrets, and no end-user configuration**.

A Cloudflare account is the user identity. Cloudflare Access Managed OAuth handles OAuth 2.0/2.1 for ChatGPT and other non-browser clients, and the Worker reads the authenticated identity from `ctx.access`.

## Architecture

```text
ChatGPT / mobile OAuth client
          │
          ▼
Cloudflare Access Managed OAuth
Cloudflare identity provider
          │
          ▼
PersonalDB Worker
  ├─ ctx.access.getIdentity()
  ├─ opaque PersonalDB user id derived from Access user_uuid
  ├─ D1 records/chunks/tombstones (canonical)
  ├─ D1 FTS5 BM25 (lexical)
  └─ Vectorize (semantic; namespace per PersonalDB user)
             │
             └─ parallel retrieval → weighted RRF → top_k
```

The cloud never requires embedding inference. Mobile clients may generate embeddings locally. The default Vectorize index is 384 dimensions; all clients writing vectors to one index must use the same embedding model/dimension.

## Authentication and isolation

Cloudflare Access is the only production authentication boundary.

- ChatGPT and other MCP clients authenticate through **Access Managed OAuth**.
- Mobile/REST clients use the same OAuth flow; they do not receive a PersonalDB API key.
- The Worker fails closed when `ctx.access` is absent.
- The Access `user_uuid` is hashed into an opaque `usr_...` PersonalDB tenant id; email is not used as the database key.
- Request bodies may never supply `user_id`.
- Every D1 query is scoped by the authenticated PersonalDB user id.
- Every Vectorize query uses a per-user namespace and results are joined back through D1 as a second isolation boundary.

## MCP tools

Personal memory:

- `memory_add`
- `memory_get`
- `memory_search`
- `memory_list`
- `memory_update`
- `memory_delete`
- `memory_health`

Business knowledge:

- `knowledge_search`
- `knowledge_list`

Lower-level:

- `personaldb_search`
- `personaldb_sync`

## REST contract

The same Cloudflare Access identity protects the REST endpoints:

- `POST /v1/records/upsert`
- `GET /v1/records/:id`
- `DELETE /v1/records/:id`
- `POST /v1/search`
- `GET /v1/sync?cursor=...`
- `POST /v1/sync/ack`

Writes are versioned/idempotent. Deletion writes a tombstone and the same id cannot be resurrected by a later sync. Sync is cursor-based and incremental; whole SQLite files are never uploaded.

## Local development

Local development simulates a Cloudflare Access user through `wrangler.jsonc -> access.dev`.

```bash
npm install
npm run check
npm run local:smoke
npm run dev
```

`local:smoke` verifies authenticated MCP startup, cross-user data isolation using two simulated Access identities, incremental sync, FTS fallback, deletion/tombstone behavior, and no-resurrection semantics.

## Deploy

Authenticate Wrangler once as the product owner:

```bash
npx wrangler login
npm run check
bash scripts/provision.sh
```

The provisioning script creates or reuses D1 and Vectorize, applies migrations, and deploys the Worker. It does **not** create API keys or application OAuth secrets.

### One-time Cloudflare Access setup

After deployment, configure the Worker/hostname in Cloudflare Zero Trust:

1. Protect the Worker or production hostname with **Cloudflare Access**.
2. Select **Cloudflare** as the identity provider.
3. For a public end-user product, turn **off** `Restrict to account members` so users can sign in with their own Cloudflare accounts rather than needing membership in your Cloudflare account.
4. Add an **Allow / Everyone** policy for authenticated users.
5. Enable **Managed OAuth** on the Access application.

This is product-owner infrastructure setup, not end-user configuration. See [`docs/cloudflare-access.md`](docs/cloudflare-access.md).

## Connect ChatGPT

The production MCP URL is simply:

```text
https://<your-production-host>/mcp
```

ChatGPT follows the OAuth challenge exposed by Cloudflare Access Managed OAuth, opens Cloudflare sign-in, and reconnects with the issued OAuth token. PersonalDB itself does not run an OAuth authorization server.

See [`docs/chatgpt.md`](docs/chatgpt.md).

## Mobile sync guidance

Keep existing SQLite local-first storage intact:

1. Local transaction commits first.
2. Enqueue changed record id/version + on-device embedding.
3. Upload incremental changed records only.
4. Save server cursor per device.
5. Pull `/v1/sync` from the cursor and apply newer versions/tombstones locally.

Mobile clients authenticate to the same Access-protected origin using OAuth; never ship a shared PersonalDB secret in the app.

## Benchmark

```bash
PERSONALDB_URL=https://... \
PERSONALDB_ACCESS_TOKEN='<oauth-access-token>' \
BENCH_QUERIES='[{"query":"refund policy","expected":["record-id"]}]' \
npm run benchmark
```

`PERSONALDB_ACCESS_TOKEN` is an OAuth access token for operator testing, not a long-lived API key. It is unnecessary when benchmarking a local `access.dev` instance.

## Security

See [`SECURITY.md`](SECURITY.md). PersonalDB does not log API keys because it does not issue them. Do not log Access assertions, OAuth bearer tokens, raw private memory, or vectors.

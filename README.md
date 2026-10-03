# PersonalDB Memory MCP

Production-oriented hybrid retrieval backend for **Ava Mobile**, **My Thoughs**, and **ChatGPT**, built on Cloudflare Workers + D1 FTS5 + Vectorize + weighted Reciprocal Rank Fusion (RRF).

## Architecture

```text
ChatGPT ── OAuth 2.1 ───────────────┐
                                    ▼
Ava Mobile / My Thoughs ── REST ── Cloudflare Worker
                                    │
                                    ├── D1 records/chunks/tombstones (canonical)
                                    ├── D1 FTS5 BM25 (lexical)
                                    └── Vectorize (semantic; namespace per user)
                                              │
                                   parallel retrieval → weighted RRF → top_k
```

The cloud never requires embedding inference. Mobile generates embeddings locally. The default index is 384 dimensions; every client using one Vectorize index must use the same embedding model/dimension.

## ChatGPT-ready MCP authentication

`POST /mcp` is a Streamable HTTP MCP protected by OAuth 2.1 using `@cloudflare/workers-oauth-provider`.

The deployment publishes OAuth protected-resource and authorization-server metadata, supports PKCE, CIMD and Dynamic Client Registration, refresh tokens, and audience-bound access tokens. GitHub OAuth is used only as the upstream identity step; the stable numeric GitHub account id becomes the PersonalDB tenant id. Repository access is not required.

The OAuth consent flow requests:

- `memory.read`
- `memory.write`

For a private deployment, set `ALLOWED_GITHUB_LOGINS` to a comma-separated allow-list.

The existing HMAC bearer authentication remains on `/v1/*` so Ava Mobile / My Thoughs do not need an auth migration just to enable ChatGPT.

## MCP tools

Existing My Thoughs names remain unchanged:

`memory_add`, `memory_get`, `memory_search`, `memory_list`, `memory_update`, `memory_delete`, `memory_health`.

Ava business knowledge tools:

`knowledge_search`, `knowledge_list`.

Lower-level tools:

`personaldb_search`, `personaldb_sync`.

## PersonalDB REST contract

Authenticated REST endpoints (HMAC bearer token; `user_id` is never accepted in a body):

- `POST /v1/records/upsert`
- `GET /v1/records/:id`
- `DELETE /v1/records/:id`
- `POST /v1/search`
- `GET /v1/sync?cursor=...`
- `POST /v1/sync/ack`

Writes are versioned/idempotent. Deletion writes a tombstone and the same id cannot be resurrected by a later sync. Sync is cursor-based and incremental; whole SQLite files are never uploaded.

## Retrieval

- Lexical: D1 FTS5 + `bm25()`
- Semantic: Vectorize only when the client supplies a query vector
- Fusion: weighted RRF, default `k=60`
- Ava hook: title-token match boost
- My Thoughs hook: bounded importance/confidence boost
- No vector / Vectorize unavailable: FTS-only
- Empty/unusable lexical query + vector: vector-only

Vectorize uses one shared index. Each verified user gets a SHA-256-derived namespace. Vector hits are joined back through D1 with the verified `user_id`, providing a second isolation boundary.

## Local development

```bash
npm install
npm run check
npm run local:smoke
```

`local:smoke` verifies cross-user REST isolation, FTS fallback, idempotency, tombstone/no-resurrection behavior, and OAuth MCP discovery/challenge behavior.

## Deploy to Cloudflare

Wrangler authentication is required.

```bash
npx wrangler login
npm run check
bash scripts/provision.sh
```

For an existing deployment, ensure `wrangler.jsonc` contains a production `OAUTH_KV` binding as well as the D1 and Vectorize bindings.

Create a GitHub OAuth App with callback URL:

```text
https://<your-worker-host>/oauth/github/callback
```

Store secrets:

```bash
npx wrangler secret put GITHUB_CLIENT_ID --env production
npx wrangler secret put GITHUB_CLIENT_SECRET --env production
openssl rand -hex 32 | npx wrangler secret put AUTH_HMAC_SECRET --env production
```

Optional private allow-list:

```bash
npx wrangler secret put ALLOWED_GITHUB_LOGINS --env production
```

Then deploy:

```bash
npm run deploy
```

## Connect ChatGPT

Create a custom MCP/app in ChatGPT using only the remote MCP URL:

```text
https://<your-worker-host>/mcp
```

Do not configure a static Authorization header. ChatGPT follows OAuth discovery and opens the GitHub-backed authorization flow automatically.

Recommended first tests:

```text
Use PersonalDB Memory to run memory_health.
Use PersonalDB Memory to add a memory: "I prefer concise technical reports."
Search my memories for "technical reports".
```

See [`docs/chatgpt.md`](docs/chatgpt.md) for the complete setup.

## Mobile sync guidance

Keep existing SQLite intact. Add a sync queue/cursor layer:

1. Local transaction commits first.
2. Enqueue changed record id/version + on-device embedding.
3. Upload incremental changed records only.
4. Save server cursor per device.
5. Pull `/v1/sync` from cursor and apply newer versions/tombstones locally.

Do not upload SQLite database files.

## Benchmark

```bash
PERSONALDB_URL=https://... \
PERSONALDB_TOKEN=... \
BENCH_QUERIES='[{"query":"refund policy","expected":["record-id"]}]' \
npm run benchmark
```

Outputs p50/p95 latency, Recall@k, D1 rows read, and queried vector dimensions.

## Security

See [`SECURITY.md`](SECURITY.md). No secret, token, raw memory, or vector is logged.

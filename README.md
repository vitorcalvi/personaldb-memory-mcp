# PersonalDB Memory MCP

Production-oriented hybrid retrieval backend for **Ava Mobile** and **My Thoughs**, built on Cloudflare Workers + D1 FTS5 + Vectorize + weighted Reciprocal Rank Fusion (RRF).

## Architecture

```text
Ava Mobile / My Thoughs / ChatGPT
        │  text + optional on-device vector
        ▼
Cloudflare Worker ── verified bearer identity (`sub` => user_id)
        │
        ├── D1 records/chunks/tombstones (canonical)
        ├── D1 FTS5 BM25 (lexical)
        └── Vectorize (semantic; one shared index, namespace per user)
                 │
        parallel retrieval → weighted RRF (k=60) → app ranking hook → top_k
```

The cloud **never requires embedding inference**. Mobile generates embeddings locally. Default deployment is 384 dimensions to keep storage/query cost modest; every client for one index must use the same embedding model/dimension.

## Preserved contracts

### My Thoughs MCP
Existing names remain unchanged:
`memory_add`, `memory_get`, `memory_search`, `memory_list`, `memory_update`, `memory_delete`, `memory_health`.

### Ava Mobile
`src/adapters/ava.ts` preserves the current `KnowledgeEntry` shape (`id,title,content,createdAt,updatedAt,version`) and maps it to `type=business_knowledge` without replacing the on-device SQLite source/cache.

## PersonalDB REST contract

Authenticated endpoints (bearer token; `user_id` is **never** accepted in a body):

- `POST /v1/records/upsert`
- `GET /v1/records/:id`
- `DELETE /v1/records/:id`
- `POST /v1/search`
- `GET /v1/sync?cursor=...`
- `POST /v1/sync/ack`
- `POST /mcp` — Streamable HTTP MCP

Writes are versioned/idempotent. Deletion writes a tombstone and the same id cannot be resurrected by a later sync. Sync is cursor-based and incremental; whole SQLite files are never uploaded.

## Retrieval

- Lexical: D1 FTS5 + `bm25()`
- Semantic: Vectorize only when the client supplies a query vector
- Fusion: weighted RRF, default `k=60`
- Ava hook: title-token match boost
- My Thoughs hook: bounded importance/confidence boost
- No vector / Vectorize unavailable: FTS-only
- Empty/unusable lexical query + vector: vector-only

Vectorize is a single shared index. Each verified user gets a SHA-256-derived Vectorize namespace. Vector hits are always joined back through D1 with the verified `user_id`, which provides a second isolation boundary.

## Local development

```bash
npm install
npm run check
npm run local:smoke
```

`local:smoke` applies D1 migrations locally, starts Wrangler without Vectorize (Vectorize has no local simulator), and verifies:
- cross-user isolation
- FTS-only search
- repeated upsert idempotency
- tombstone/no-resurrection behavior
- remote MCP tool discovery

## Deploy to Cloudflare

Wrangler authentication is required.

```bash
npx wrangler login
npm run check
bash scripts/provision.sh
openssl rand -hex 32 | npx wrangler secret put AUTH_HMAC_SECRET --env production
npm run deploy
```

`provision.sh` creates one D1 database and one 384-dimension cosine Vectorize index, patches the production D1 id, and runs migrations.

Issue a bearer token for a user locally (use the **same** HMAC secret as the Worker):

```bash
AUTH_HMAC_SECRET='...' npm run token -- user-123 365
```

Connect ChatGPT to:

```text
https://personaldb-memory-mcp.<your-subdomain>.workers.dev/mcp
Authorization: Bearer <issued-token>
```

Cloudflare OAuth 2.1 can later replace the HMAC token issuer without changing PersonalDB: all storage/search code receives the same verified `{ userId }` context.

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

Outputs p50/p95 latency, Recall@k, D1 rows read (from D1 query metadata), and queried vector dimensions.

## Free-tier notes

- One shared Vectorize index, not one index per user.
- Default vectors: 384 dimensions.
- Search fetches bounded candidate sets (`<=50` vector hits).
- D1 sync is incremental.
- Vectorize free tier currently limits namespaces per index; plan paid capacity before exceeding that account limit.

## Security

See [SECURITY.md](SECURITY.md). No secret, token, raw memory, or vector is logged.

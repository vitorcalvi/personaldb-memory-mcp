# Privacy Policy

PersonalDB Memory stores user-provided memories and knowledge so authenticated users can retrieve them through ChatGPT and other approved clients.

## Authentication data

Authentication is handled by Cloudflare Access. PersonalDB does not require GitHub authentication and does not issue PersonalDB API keys.

The Worker reads the authenticated Cloudflare Access identity. A stable Access `user_uuid` is transformed with SHA-256 into an opaque internal PersonalDB tenant id. The raw Access subject is not used as the database key. Email/name may be available transiently from Access for display purposes but are not required to partition stored memory.

OAuth bearer tokens, Access assertions, and session cookies must not be logged or stored by PersonalDB.

## Stored data

PersonalDB may store memory text, business knowledge, metadata supplied with those records, content hashes, synchronization metadata, deletion tombstones, and optional embedding vectors supplied by a client.

## Retrieval

Text may be indexed in D1 FTS5 for lexical retrieval. Optional embeddings may be stored in Cloudflare Vectorize for semantic retrieval. Vector namespaces and all D1 queries are scoped to the authenticated PersonalDB user.

## User control

Users can create, retrieve, update, search, list, and delete their stored memories through supported PersonalDB tools. Deleted records are represented by tombstones to prevent accidental resurrection during synchronization.

## Third parties

Cloudflare provides the hosting, Access authentication, D1, and Vectorize infrastructure used by this service. ChatGPT or another authorized client initiates requests on the user's behalf after the user completes OAuth authorization.

## Security

Do not store passwords, API keys, private signing keys, or other authentication secrets as memories. See [`SECURITY.md`](SECURITY.md) for the service security model.

# Security

- `user_id` is never accepted from request bodies; it is derived from a verified bearer token `sub`.
- Every D1 query is scoped by the verified user id.
- Every Vectorize operation uses a per-user namespace derived from SHA-256(user_id).
- Vector hits are re-authorized against D1 before any row is returned, preventing stale/cross-user vector leakage.
- Raw memory content, vectors, bearer tokens, and secrets are never logged.
- Deletes create tombstones and a tombstoned id cannot be resurrected by sync.
- Report security issues privately to the repository owner rather than opening a public issue with sensitive data.

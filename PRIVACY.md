# Privacy Policy — PersonalDB Memory

PersonalDB Memory stores content that an authenticated user explicitly writes to their PersonalDB account and returns content that belongs to that authenticated account.

## Data handled

The service may process memory text, knowledge text, metadata, search queries, client-generated embedding vectors, and the authenticated user's GitHub identity used to isolate the PersonalDB tenant.

## Authentication

The ChatGPT MCP endpoint uses OAuth 2.1. GitHub is used as the upstream identity provider. The service uses the stable GitHub account identifier for tenant isolation and does not require repository access.

## Storage and isolation

Canonical records are stored in Cloudflare D1. Search vectors are stored in Cloudflare Vectorize. Data is isolated by authenticated user identity and Vectorize namespace. Secrets, bearer tokens, raw memory content, and vectors must not be written to application logs.

## User control

Users can create, retrieve, update, search, list, and delete their stored memories using the MCP tools exposed by the service. Deleted records are represented by tombstones to prevent accidental resurrection during synchronization.

## Third parties

Cloudflare provides the Worker, D1, KV, and Vectorize infrastructure. GitHub provides OAuth identity. Their respective policies apply to data they process as service providers.

## Contact

For privacy or security issues, open an issue in the project repository without including secrets or private memory content: https://github.com/vitorcalvi/personaldb-memory-mcp/issues

Last updated: 2026-10-03.

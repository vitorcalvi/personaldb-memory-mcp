# Attach PersonalDB Memory MCP to ChatGPT

After the Worker is deployed, connect ChatGPT to the remote Streamable HTTP endpoint:

- MCP URL: `https://personaldb-memory-mcp.<account>.workers.dev/mcp`
- Authentication: Bearer token
- Header: `Authorization: Bearer <PERSONALDB_TOKEN>`

Generate a token locally using the same `AUTH_HMAC_SECRET` stored in the Worker:

```bash
AUTH_HMAC_SECRET='...' npm run token -- <stable-user-id> 365
```

The Worker verifies the token signature and derives `user_id` from the signed `sub` claim. The MCP schemas intentionally expose no `user_id` field.

Recommended first tests in a new ChatGPT chat:

```text
Use PersonalDB Memory to run memory_health.
Use PersonalDB Memory to add a memory: "I prefer concise technical reports."
Search my memories for "technical reports".
```

For Ava business knowledge, use `knowledge_search` / `knowledge_list`. Mobile clients should use the REST PersonalDB contract and submit their on-device vectors; ChatGPT memory tools degrade safely to FTS5 when no vector is supplied.

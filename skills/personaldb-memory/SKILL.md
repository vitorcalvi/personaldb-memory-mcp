---
name: personaldb-memory
description: Use PersonalDB Memory to store, retrieve, update, delete, and search the user's private persistent memories and knowledge.
---

Use the PersonalDB Memory MCP tools whenever the user asks to remember, recall, find, list, update, or delete information in their PersonalDB.

Prefer `memory_search` for natural-language recall and `memory_get` when the exact memory id is known. Use `memory_list` for browsing recent or filtered memories. Use `memory_add` only when the user clearly wants information persisted. Use `memory_update` only for an existing memory. Use `memory_delete` only when the user explicitly requests deletion.

Use `knowledge_search` and `knowledge_list` for Ava/business knowledge rather than personal memories. Use lower-level `personaldb_search` or `personaldb_sync` only when the higher-level memory or knowledge tools do not fit.

Do not invent memory contents, ids, search results, or successful writes. If a tool fails or authentication is unavailable, report the failure plainly. Keep private memory content scoped to the authenticated PersonalDB user.

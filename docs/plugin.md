# ChatGPT plugin packaging and installation

PersonalDB Memory is packaged using OpenAI's portable Agent Plugins layout and includes a Codex compatibility manifest in the generated ZIP.

## Prerequisite: production MCP endpoint

The plugin must point to a real public HTTPS Streamable HTTP MCP endpoint whose path ends in `/mcp`.

Deploy PersonalDB first, then build the plugin package with the production URL:

```bash
PERSONALDB_MCP_URL=https://<your-worker-host>/mcp npm run plugin:build
```

or:

```bash
npm run plugin:build -- --mcp-url=https://<your-worker-host>/mcp
```

The build refuses missing, non-HTTPS, or non-`/mcp` URLs so a broken placeholder package is not produced.

Output:

```text
dist/personaldb-memory/
dist/personaldb-memory-plugin.zip
```

The ZIP contains:

- `plugin.json` — portable Agent Plugins manifest
- `mcp.json` — portable remote MCP declaration
- `.codex-plugin/plugin.json` — compatibility manifest
- `.mcp.json` — compatibility MCP declaration
- `skills/personaldb-memory/SKILL.md` — workflow instructions
- `assets/icon.svg` and `assets/logo.svg` — install/listing assets
- privacy, terms, and support documents

## Install in ChatGPT

When your ChatGPT account or workspace exposes plugin ZIP upload:

1. Open ChatGPT on the web.
2. Open Plugins / Admin > Plugins, depending on the account or workspace surface.
3. Select Add.
4. Choose Upload plugin.
5. Upload `dist/personaldb-memory-plugin.zip`.
6. Complete the OAuth connection to the PersonalDB MCP server.
7. Test `memory_health`, then `memory_add`, then `memory_search`.

For developer testing, ChatGPT can also register the remote MCP server first and use Plugin Creator to create or refresh the plugin package.

## Public submission readiness

`plugin.json` includes listing metadata, support/privacy/terms URLs, icons, three starter prompts, exactly five positive review cases, exactly three negative review cases, and release notes.

Before public submission you still need:

- a stable production MCP URL
- domain verification for the MCP host
- a successful current MCP tool scan
- a reviewer-accessible demo recording URL
- verified developer or business identity and required attestations

Do not put reviewer credentials, OAuth tokens, API keys, or private memory content in the repository or plugin ZIP.

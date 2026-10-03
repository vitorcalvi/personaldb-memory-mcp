#!/usr/bin/env bash
set -euo pipefail
if ! npx wrangler whoami >/dev/null 2>&1; then echo 'Run: npx wrangler login'; exit 2; fi

json="$(npx wrangler d1 create personaldb-memory --json 2>/dev/null || true)"
DB_ID="$(printf '%s' "$json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{let j=JSON.parse(s);console.log(j.uuid||j.database_id||'')}catch{}})")"
if [ -z "$DB_ID" ]; then echo 'D1 may already exist. Run: npx wrangler d1 list'; exit 3; fi

npx wrangler vectorize create personaldb-memory-v1 --dimensions=384 --metric=cosine || true

kv_output="$(npx wrangler kv namespace create OAUTH_KV --env production 2>&1 || true)"
KV_ID="$(printf '%s' "$kv_output" | grep -Eo 'id[[:space:]]*=[[:space:]]*"[0-9a-fA-F]{32}"' | head -1 | grep -Eo '[0-9a-fA-F]{32}' || true)"
if [ -z "$KV_ID" ]; then
  printf '%s\n' "$kv_output"
  echo 'OAuth KV may already exist. Run: npx wrangler kv namespace list and patch REPLACE_WITH_OAUTH_KV_ID in wrangler.jsonc.'
  exit 4
fi

node - "$DB_ID" "$KV_ID" <<'NODE'
import fs from 'node:fs';
const [id, kv] = process.argv.slice(2);
const p = 'wrangler.jsonc';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('REPLACE_WITH_D1_DATABASE_ID', id).replace('REPLACE_WITH_OAUTH_KV_ID', kv);
fs.writeFileSync(p, s);
NODE

npx wrangler d1 migrations apply DB --env production --remote
cat <<'TXT'

Cloud resources are provisioned.

Before deployment:
1. Create a GitHub OAuth App.
2. Set its callback URL to:
   https://<your-worker-host>/oauth/github/callback
3. Store the app credentials:
   npx wrangler secret put GITHUB_CLIENT_ID --env production
   npx wrangler secret put GITHUB_CLIENT_SECRET --env production
4. Keep REST/mobile HMAC auth configured:
   openssl rand -hex 32 | npx wrangler secret put AUTH_HMAC_SECRET --env production
5. Optional private deployment allow-list:
   npx wrangler secret put ALLOWED_GITHUB_LOGINS --env production
6. Deploy:
   npm run deploy

Then add this MCP URL to ChatGPT:
   https://<your-worker-host>/mcp
OAuth discovery is automatic.
TXT

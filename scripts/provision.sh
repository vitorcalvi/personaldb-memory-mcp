#!/usr/bin/env bash
set -euo pipefail
if ! npx wrangler whoami >/dev/null 2>&1; then echo 'Run: npx wrangler login'; exit 2; fi
json="$(npx wrangler d1 create personaldb-memory --json 2>/dev/null || true)"
DB_ID="$(printf '%s' "$json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{let j=JSON.parse(s);console.log(j.uuid||j.database_id||'')}catch{}})")"
if [ -z "$DB_ID" ]; then echo 'D1 may already exist. Run: npx wrangler d1 list'; exit 3; fi
npx wrangler vectorize create personaldb-memory-v1 --dimensions=384 --metric=cosine || true
node - "$DB_ID" <<'NODE'
import fs from 'node:fs'; const id=process.argv[2]; const p='wrangler.jsonc'; let s=fs.readFileSync(p,'utf8'); s=s.replace('REPLACE_WITH_D1_DATABASE_ID',id); fs.writeFileSync(p,s);
NODE
npx wrangler d1 migrations apply DB --env production --remote
printf 'Set AUTH_HMAC_SECRET next:\n  npx wrangler secret put AUTH_HMAC_SECRET --env production\nThen deploy:\n  npm run deploy\n'

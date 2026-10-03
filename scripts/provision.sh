#!/usr/bin/env bash
set -euo pipefail

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo 'Authenticate Cloudflare first: npx wrangler login'
  exit 2
fi

D1_ID="$(npx wrangler d1 list 2>/dev/null | grep 'personaldb-memory' | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
if [ -z "$D1_ID" ]; then
  output="$(npx wrangler d1 create personaldb-memory 2>&1)"
  printf '%s\n' "$output"
  D1_ID="$(printf '%s' "$output" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
fi
if [ -z "$D1_ID" ]; then
  echo 'Could not resolve the PersonalDB D1 database id.'
  exit 3
fi

if ! npx wrangler vectorize list 2>/dev/null | grep -q 'personaldb-memory-v1'; then
  npx wrangler vectorize create personaldb-memory-v1 --dimensions=384 --metric=cosine
fi

node - "$D1_ID" <<'NODE'
import fs from 'node:fs';
const id = process.argv[2];
const path = 'wrangler.jsonc';
let config = fs.readFileSync(path, 'utf8');
config = config.replace('REPLACE_WITH_D1_DATABASE_ID', id);
fs.writeFileSync(path, config);
NODE

npx wrangler d1 migrations apply DB --env production --remote
npm run deploy

cat <<'TXT'

Cloud resources and Worker are deployed. No application API keys or OAuth client secrets are required.

One-time product-owner setup in Cloudflare Zero Trust:
1. Protect the PersonalDB Worker (or its production hostname) with Cloudflare Access.
2. Use "Cloudflare" as the identity provider.
3. For a public end-user product, turn OFF "Restrict to account members".
4. Create an Allow policy for authenticated users (Everyone).
5. Enable Managed OAuth for the Access application.

After that, end users only:
  Set up PersonalDB -> sign in with their Cloudflare account -> Allow -> done.

See docs/cloudflare-access.md for the exact production checklist.
TXT

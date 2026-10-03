import { createHmac } from 'node:crypto';
const [userId, daysRaw = '365'] = process.argv.slice(2);
const secret = process.env.AUTH_HMAC_SECRET;
if (!userId || !secret || secret.length < 24) {
  console.error('Usage: AUTH_HMAC_SECRET=<24+ chars> npm run token -- <user-id> [days]'); process.exit(2);
}
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const now = Math.floor(Date.now()/1000); const days = Number(daysRaw);
const head = enc({alg:'HS256',typ:'JWT'}); const payload = enc({iss:'personaldb',sub:userId,iat:now,exp:now+Math.floor(days*86400)});
const sig = createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url');
console.log(`${head}.${payload}.${sig}`);

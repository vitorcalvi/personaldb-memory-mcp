import {
  AuthorizationError,
  authorizationErrorRedirect,
  type ConsentDescription,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import type { Env } from './types';

export interface OAuthProps {
  userId: string;
  name: string;
  nickname: string;
}

type OAuthEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
};

function oauth(env: Env): OAuthHelpers {
  const helpers = (env as OAuthEnv).OAUTH_PROVIDER;
  if (!helpers) throw new Error('oauth_provider_not_available');
  return helpers;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function consentPage(details: ConsentDescription, handle: string): string {
  const name = escapeHtml(details.clientName);
  const origin = details.clientDomain
    ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : 'This app registered itself; its name is not independently verified.';
  const scopes = details.scope
    .map((scope) => `<label><input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked> ${escapeHtml(scope)}</label>`)
    .join('<br>');
  const loopback = details.redirectIsLoopback
    ? '<p><strong>This sends access to an app running on your computer.</strong> Continue only if you started this sign-in.</p>'
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize ${name}</title><style>
body{font:16px system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.5}button{padding:10px 16px;margin-right:8px}label{display:block;margin:8px 0}.muted{color:#555}
</style></head><body>
<h1>Allow ${name} to access PersonalDB Memory?</h1>
<p>${origin} Access will be sent to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>${loopback}
<p class="muted">PersonalDB uses your GitHub account only to establish a stable identity. It does not need repository access.</p>
<form method="post"><input type="hidden" name="handle" value="${escapeHtml(handle)}">${scopes}
<p><button name="decision" value="approve">Allow</button><button name="decision" value="deny">Deny</button></p></form>
</body></html>`;
}

function githubCallbackUrl(request: Request): string {
  return new URL('/oauth/github/callback', request.url).href;
}

function requireGitHubConfig(env: Env): void {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new Error('github_oauth_not_configured');
}

function githubAuthorizeUrl(request: Request, env: Env, state: string): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', githubCallbackUrl(request));
  url.searchParams.set('scope', 'read:user');
  url.searchParams.set('state', state);
  return url.href;
}

async function exchangeGitHubCode(request: Request, env: Env, code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'personaldb-memory-mcp',
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: githubCallbackUrl(request),
    }),
  });
  const data = await response.json() as GitHubTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(`github_token_exchange_failed:${data.error ?? response.status}`);
  }
  return data.access_token;
}

async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'personaldb-memory-mcp',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`github_user_fetch_failed:${response.status}`);
  const user = await response.json() as GitHubUser;
  if (!Number.isInteger(user.id) || !user.login) throw new Error('github_user_invalid');
  return user;
}

function isAllowedGitHubUser(env: Env, login: string): boolean {
  const configured = (env.ALLOWED_GITHUB_LOGINS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length === 0 || configured.includes(login.toLowerCase());
}

async function authorize(request: Request, env: Env): Promise<Response> {
  requireGitHubConfig(env);
  const helpers = oauth(env);

  if (request.method === 'GET') {
    const authRequest = await helpers.parseAuthRequest(request);
    const details = await helpers.describeConsent(authRequest);
    const consent = await helpers.beginConsent(authRequest);
    consent.headers.set('content-type', 'text/html; charset=utf-8');
    return new Response(consentPage(details, consent.handle), { headers: consent.headers });
  }

  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const form = await request.formData();
  const handle = String(form.get('handle') ?? '');
  if (form.get('decision') !== 'approve') {
    const denied = await helpers.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }

  const approved = await helpers.approveConsent(request, handle, {
    scope: form.getAll('scope').map(String),
  });
  const upstream = await helpers.beginUpstream(approved.request, { headers: approved.headers });
  upstream.headers.set('location', githubAuthorizeUrl(request, env, upstream.state));
  return new Response(null, { status: 302, headers: upstream.headers });
}

async function githubCallback(request: Request, env: Env): Promise<Response> {
  requireGitHubConfig(env);
  const helpers = oauth(env);
  const resumed = await helpers.finishUpstream(request);
  const url = new URL(request.url);

  if (url.searchParams.has('error')) {
    resumed.headers.set('location', authorizationErrorRedirect(resumed.request, 'access_denied', 'GitHub sign-in was not completed.'));
    return new Response(null, { status: 302, headers: resumed.headers });
  }

  const code = url.searchParams.get('code');
  if (!code) {
    resumed.headers.set('location', authorizationErrorRedirect(resumed.request, 'access_denied', 'GitHub did not return an authorization code.'));
    return new Response(null, { status: 302, headers: resumed.headers });
  }

  const accessToken = await exchangeGitHubCode(request, env, code);
  const user = await fetchGitHubUser(accessToken);
  if (!isAllowedGitHubUser(env, user.login)) {
    resumed.headers.set('location', authorizationErrorRedirect(resumed.request, 'access_denied', 'This GitHub account is not allowed to use this PersonalDB deployment.'));
    return new Response(null, { status: 302, headers: resumed.headers });
  }

  const props: OAuthProps = {
    userId: `github:${user.id}`,
    name: user.name?.trim() || user.login,
    nickname: user.login,
  };
  const completed = await helpers.completeAuthorization({
    request: resumed.request,
    userId: props.userId,
    metadata: { label: props.nickname },
    scope: resumed.request.scope,
    props,
  });
  resumed.headers.set('location', completed.redirectTo);
  return new Response(null, { status: 302, headers: resumed.headers });
}

export async function handleOAuthRequest(request: Request, env: Env): Promise<Response | null> {
  try {
    const path = new URL(request.url).pathname;
    if (path === '/authorize') return await authorize(request, env);
    if (path === '/oauth/github/callback') return await githubCallback(request, env);
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError) {
      return new Response(error.description, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (error instanceof Error && error.message === 'github_oauth_not_configured') {
      return new Response('GitHub OAuth is not configured.', { status: 503 });
    }
    throw error;
  }
}

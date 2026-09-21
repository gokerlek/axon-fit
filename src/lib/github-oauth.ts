import 'server-only';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { serverEnv } from './env';

/**
 * GitHub ile giriş (SPEC §5) — yalnız PT için.
 *
 * Kimlik kuralı: dönen GitHub kullanıcısı `GITHUB_OWNER` ile aynı kişi olmalı. Yani
 * "bu repoların sahibi mi" diye sorulur; e-posta karşılaştırması yapılmaz.
 * Harici kütüphane yok: iki HTTP çağrısı yeterli (Octokit veri katmanında kullanılacak).
 */

const STATE_COOKIE = 'pc_oauth_state';
const STATE_TTL_SECONDS = 600;
const SCOPE = 'read:user';

export function githubLoginEnabled(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function clientCredentials(): { id: string; secret: string } {
  const id = process.env.GITHUB_CLIENT_ID;
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET tanımlı değil');
  return { id, secret };
}

/** Yetki ekranına gidecek adresi üretir ve CSRF için tek kullanımlık `state` çerezi kurar. */
export async function startGithubLogin(callbackUrl: string): Promise<string> {
  const state = randomBytes(32).toString('base64url');
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  });

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientCredentials().id);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'false');
  return url.toString();
}

/** `state` çerezini doğrular ve her durumda yakar (tek kullanımlık). */
export async function consumeState(received: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  return Boolean(expected && received && expected === received);
}

export type GithubUser = { login: string; id: number };

/** Yetki kodunu erişim anahtarına çevirir ve kullanıcıyı okur. Anahtar saklanmaz. */
export async function exchangeCodeForUser(code: string, callbackUrl: string): Promise<GithubUser | null> {
  const { id, secret } = clientCredentials();

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: callbackUrl }),
  });
  if (!tokenResponse.ok) return null;

  const token = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!token.access_token) return null;

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!userResponse.ok) return null;

  const user = (await userResponse.json()) as { login?: unknown; id?: unknown };
  if (typeof user.login !== 'string' || typeof user.id !== 'number') return null;
  return { login: user.login, id: user.id };
}

/** Giren kişi uygulamanın sahibi mi? (SPEC §5: kimlik kontrolü budur.) */
export function isOwner(user: GithubUser): boolean {
  return user.login.toLowerCase() === serverEnv().owner.toLowerCase();
}

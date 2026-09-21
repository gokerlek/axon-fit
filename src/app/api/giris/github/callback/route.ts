import { NextResponse } from 'next/server';
import { consumeState, exchangeCodeForUser, githubLoginEnabled, isOwner } from '@/lib/github-oauth';
import { createSession } from '@/lib/session';
import { callbackUrl } from '@/lib/urls';

/**
 * GitHub dönüşü. Sırayla: eklenti açık mı → `state` doğru mu → kod anahtara çevrilebildi mi
 * → giren kişi repoların sahibi mi. Hepsi geçerse PT oturumu açılır.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (reason: string) => NextResponse.redirect(new URL(`/giris?hata=${reason}`, request.url));

  if (!githubLoginEnabled()) return fail('github_kapali');
  if (url.searchParams.get('error')) return fail('iptal');

  const stateOk = await consumeState(url.searchParams.get('state'));
  if (!stateOk) return fail('oturum_suresi');

  const code = url.searchParams.get('code');
  if (!code) return fail('kod_yok');

  const user = await exchangeCodeForUser(code, callbackUrl(request));
  if (!user) return fail('github_hatasi');
  // Sahibi değilse oturum AÇILMAZ: uygulama tek kişiliktir.
  if (!isOwner(user)) return fail('yetkisiz');

  await createSession({ role: 'pt', via: 'github', subject: user.login });
  return NextResponse.redirect(new URL('/panel', request.url));
}

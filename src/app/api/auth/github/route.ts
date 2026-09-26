import { NextResponse } from 'next/server';
import { githubLoginEnabled, startGithubLogin } from '@/lib/github-oauth';
import { RETURN_PARAM } from '@/lib/navigation';
import { callbackUrl } from '@/lib/urls';

/** "GitHub ile devam et" → GitHub yetki ekranı. `?next=` (PT sayfası) dönüşte açılır. */
export async function GET(request: Request) {
  if (!githubLoginEnabled()) {
    return NextResponse.redirect(new URL('/login?error=github_kapali', request.url));
  }
  const returnTo = new URL(request.url).searchParams.get(RETURN_PARAM);
  const target = await startGithubLogin(callbackUrl(request), returnTo);
  return NextResponse.redirect(target);
}

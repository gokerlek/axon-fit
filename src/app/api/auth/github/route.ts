import { NextResponse } from 'next/server';
import { githubLoginEnabled, startGithubLogin } from '@/lib/github-oauth';
import { callbackUrl } from '@/lib/urls';

/** "GitHub ile devam et" → GitHub yetki ekranı. */
export async function GET(request: Request) {
  if (!githubLoginEnabled()) {
    return NextResponse.redirect(new URL('/login?error=github_kapali', request.url));
  }
  const target = await startGithubLogin(callbackUrl(request));
  return NextResponse.redirect(target);
}

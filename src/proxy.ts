import { NextResponse, type NextRequest } from 'next/server';
import { environmentStatus } from './lib/installation/readiness';
import { PATH_HEADER } from '@/lib/navigation';

/**
 * PT sayfalarına istenen yolu iletir: oturum yoksa `requirePt` girişe `?next=` ile yollar ve
 * girişten sonra oraya dönülür (`src/lib/navigation.ts`, `safeReturnPath`). Kimlik denetimi
 * burada değil, sayfalarda (`src/lib/guards.ts`).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (environmentStatus(process.env) !== 'ready' && !path.startsWith('/install') && !path.startsWith('/api/install')) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Kurulum tamamlanmalı.' }, { status: 503 });
    return NextResponse.redirect(new URL('/install', request.url));
  }
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|woff2)$).*)'],
};

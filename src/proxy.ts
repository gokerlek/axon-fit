import { NextResponse, type NextRequest } from 'next/server';
import { PATH_HEADER } from '@/lib/navigation';

/**
 * PT sayfalarına istenen yolu iletir: oturum yoksa `requirePt` girişe `?next=` ile yollar ve
 * girişten sonra oraya dönülür (`src/lib/navigation.ts`, `safeReturnPath`). Kimlik denetimi
 * burada değil, sayfalarda (`src/lib/guards.ts`).
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/dashboard/:path*'],
};

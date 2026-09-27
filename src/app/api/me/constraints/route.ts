import { NextResponse } from 'next/server';
import { reportPostRoute } from '@/lib/me-constraint-routes';
import { sessionRouteDeps } from '@/lib/session-files';
import { origin } from '@/lib/urls';

/**
 * Danışan yeni bir şey bildirir (tasarım `kisit-tarama.md` §2.4). Kurallar `me-constraint-routes.ts` ve
 * `constraints.ts`'te. Yalnız bu siteden ve JSON'la; kimlik yalnız oturumdan.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await reportPostRoute(await sessionRouteDeps(), request.headers, origin(request), body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

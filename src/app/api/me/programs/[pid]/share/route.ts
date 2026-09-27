import { NextResponse } from 'next/server';
import { shareOwnRoute } from '@/lib/own-program-routes';
import { sessionRouteDeps } from '@/lib/session-files';
import { origin } from '@/lib/urls';

/**
 * Kendi programı antrenörle paylaş ya da kapat (`docs/design/kendi-program.md` §2.7, §3.5): `{ shared }`;
 * revision artmaz, program ve index tek commit, kapatınca PT'ye olay. Kapatmayı telefon "Geri al" süresi
 * bitince gönderir (`keepalive`). Yalnız bu siteden ve JSON'la; kimlik yalnız oturumdan.
 */
export async function POST(request: Request, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const body = await request.json().catch(() => null);
  const result = await shareOwnRoute(await sessionRouteDeps(), request.headers, origin(request), pid, body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

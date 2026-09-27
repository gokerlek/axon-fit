import { NextResponse } from 'next/server';
import { activeOwnRoute } from '@/lib/own-program-routes';
import { sessionRouteDeps } from '@/lib/session-files';
import { origin } from '@/lib/urls';

/**
 * Bugün'ün programı, kalıcı seçim (`docs/design/kendi-program.md` §3.2): `{ programId: "op_…" | null }` (null: PT'nin
 * programı). Yalnız index yazılır; yarım antrenman engellemez (kendi programıyla sürer); PT'ye bildirilir. Bilinmeyen
 * program 404. "Yalnız bugün" buraya gelmez (hiçbir şey yazılmaz). Yalnız bu siteden ve JSON'la.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await activeOwnRoute(await sessionRouteDeps(), request.headers, origin(request), body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

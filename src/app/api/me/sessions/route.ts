import { NextResponse } from 'next/server';
import { sessionRouteDeps } from '@/lib/session-files';
import { indexRoute } from '@/lib/session-routes';

/**
 * Danışanın antrenman listesi (`sessions-index.json`, tasarım §4.1): her okumada `sessions/` ağacıyla
 * onarılır, onarım yazılmaz (bir sonraki bitişin commit'ine biner). Kimlik yalnız oturumdan.
 */
export async function GET() {
  const result = await indexRoute(await sessionRouteDeps());
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

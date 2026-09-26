import { NextResponse } from 'next/server';
import { sessionRouteDeps } from '@/lib/session-files';
import { origin } from '@/lib/urls';
import { waterRoute } from '@/lib/workout-routes';

/**
 * Antrenman dışı su (tasarım §0): Bugün'deki "+1" dokunuşları, telefonda 10 sn biriktirilmiş hâlde
 * `{ taps }`. `water.json`'a kimlikle birleşir (aynı dokunuşu yeniden göndermek zararsız); yanıt
 * `water.json`'daki bugünkü bardak sayısı. Yalnız bu siteden ve JSON'la; kimlik yalnız oturumdan.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await waterRoute(await sessionRouteDeps(), request.headers, origin(request), body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

import { NextResponse } from 'next/server';
import { checkInContextRoute, checkInPostRoute } from '@/lib/check-in-routes';
import { sessionRouteDeps } from '@/lib/session-files';
import { origin } from '@/lib/urls';

/**
 * Seans yoklaması (tasarım §2.2, §2.9; SPEC §7.5). Kurallar `check-in-routes.ts` ve `session-check.ts`'te.
 * - GET: antrenman başındaki sheet'in girdisi (onaylı parçalar, ağrı geçmişi) ve Bugün'ün antrenman
 *   sonrası kartı ("Antrenman ne kadar zordu?").
 * - POST: cevaplar yalnız onay varken `health.json`'a; onayın kapsamadığı alanlar atılır.
 * Yalnız bu siteden ve JSON'la; kimlik yalnız oturumdan.
 */
export async function GET() {
  const result = await checkInContextRoute(await sessionRouteDeps());
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await checkInPostRoute(await sessionRouteDeps(), request.headers, origin(request), body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

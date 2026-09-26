import { NextResponse, type NextRequest } from 'next/server';
import { workoutRouteDeps } from '@/lib/session-files';
import { alternativesRoute } from '@/lib/workout-routes';

/**
 * "Değiştir" (tasarım §2.6): `?day=d_…&row=r_…` satırın muadilleri, ekipmana göre gruplu; her biri
 * satırın set düzeniyle ve kendi geçmişiyle planlı. Kurallar `workout-routes.ts`'te. Kimlik yalnız oturumdan.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await alternativesRoute(await workoutRouteDeps(), params.get('day'), params.get('row'));
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

import { NextResponse, type NextRequest } from 'next/server';
import { workoutRouteDeps } from '@/lib/session-files';
import { workoutRoute } from '@/lib/workout-routes';

/**
 * Antrenman ekranının günü (tasarım §4.3 "Başlangıç", §4.7): `?day=d_…` ya da yarım antrenmanın günü ya
 * da sıradaki gün; satır başına plan ve geçen seferki setler, "bu hafta x/3", bugünkü su ve sunucudaki
 * yarım antrenman. Bugün açılınca çekilir ve telefonda saklanır: "Antrenmana başla" ağ beklemez.
 * Kurallar `workout-routes.ts`'te. Kimlik yalnız oturumdan.
 */
export async function GET(request: NextRequest) {
  const result = await workoutRoute(await workoutRouteDeps(), request.nextUrl.searchParams.get('day'));
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

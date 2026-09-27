import { NextResponse, type NextRequest } from 'next/server';
import { workoutRouteDeps } from '@/lib/session-files';
import { workoutRoute } from '@/lib/workout-routes';

/**
 * Antrenman ekranının günü (tasarım §4.3 "Başlangıç", §4.7): `?day=d_…` ya da yarım antrenmanın günü ya
 * da sıradaki gün; satır başına plan ve geçen seferki setler, "bu hafta x/3", bugünkü su ve sunucudaki
 * yarım antrenman. Bugün açılınca çekilir ve telefonda saklanır: "Antrenmana başla" ağ beklemez.
 * Program (`docs/design/kendi-program.md` §3.2): yarım antrenmanınki, yoksa `?program=op_…|pt` ("Yalnız
 * bugün"), o da yoksa kalıcı seçim. Kurallar `workout-routes.ts`'te. Kimlik yalnız oturumdan.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await workoutRoute(await workoutRouteDeps(), params.get('day'), params.get('program'));
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

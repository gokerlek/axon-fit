import { NextResponse } from 'next/server';
import { sessionRouteDeps } from '@/lib/session-files';
import { origin } from '@/lib/urls';
import { scheduleRoute } from '@/lib/workout-routes';

/**
 * Danışanın antrenman günleri (tasarım §2.11): Bugün'deki ve Ayarlar'daki "Günlerini değiştir" `{ weekdays }`
 * (ISO, 1 = Pazartesi). Doğrudan uygulanır (`program.json` → `clientSchedule`, revision artmaz), program
 * geçmişine danışan kaydı olarak yazılır, PT'ye bildirim gider. Kurallar `workout-routes.ts`'te. Yalnız bu
 * siteden ve JSON'la; kimlik yalnız oturumdan.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await scheduleRoute(await sessionRouteDeps(), request.headers, origin(request), body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

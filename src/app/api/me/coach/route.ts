import { NextResponse } from 'next/server';
import { coachClientSession } from '@/lib/ai/coach-session';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { requestAssistant, getAssistant } from '@/lib/ai/assistant-routes';
import { origin } from '@/lib/urls';
import { failed } from '@/lib/health-respond';
export const maxDuration = 60;
const respond = (result: Awaited<ReturnType<typeof getAssistant>>) => NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: 'Danışan oturumu gerekiyor.' }, { status: 403 });
    return respond(await getAssistant(assistantDeps(coachClientSession), session.clientId));
  } catch (error) { return failed(error, 'AI koç şu an açılamadı.'); }
}
export async function POST(request: Request) {
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: 'Danışan oturumu gerekiyor.' }, { status: 403 });
    return respond(await requestAssistant(assistantDeps(coachClientSession), request.headers, origin(request), session.clientId, await request.json().catch(() => null)));
  } catch (error) { return failed(error, 'AI yanıtı hazırlanamadı. Gemini bağlantısını kontrol et veya yeniden dene.'); }
}

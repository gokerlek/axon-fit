import { NextResponse } from 'next/server';
import { getAssistant, requestAssistant } from '@/lib/ai/assistant-routes';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { readPtSession } from '@/lib/session';
import { generalCoachDeps, PT_COACH_ID } from '@/lib/ai/coach-global';
import { origin } from '@/lib/urls';
import { failed } from '@/lib/health-respond';
export const maxDuration = 60;
const respond = (result: Awaited<ReturnType<typeof getAssistant>>) => NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  try { return respond(await getAssistant(assistantDeps(readPtSession, generalCoachDeps()), PT_COACH_ID)); }
  catch (error) { return failed(error, 'Genel koç sohbeti açılamadı.'); }
}
export async function POST(request: Request) {
  try { return respond(await requestAssistant(assistantDeps(readPtSession, generalCoachDeps()), request.headers, origin(request), PT_COACH_ID, await request.json().catch(() => null))); }
  catch (error) { return failed(error, 'Yanıt hazırlanamadı. Gemini bağlantısını kontrol et.'); }
}

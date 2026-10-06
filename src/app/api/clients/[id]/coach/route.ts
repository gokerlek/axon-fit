import * as v from 'valibot';
import { programFormSchema } from '@/lib/schemas/program';
import { NextResponse } from 'next/server';
import { readPtSession } from '@/lib/session';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { requestAssistant, saveAssistantDraft, getAssistant } from '@/lib/ai/assistant-routes';
import { origin } from '@/lib/urls';
import { failed } from '@/lib/health-respond';
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const respond = (result: Awaited<ReturnType<typeof getAssistant>>) => NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(_request: Request, { params }: Context) {
  try { return respond(await getAssistant(assistantDeps(readPtSession), (await params).id)); }
  catch (error) { return failed(error, 'AI koç şu an açılamadı.'); }
}
export async function POST(request: Request, { params }: Context) {
  try { return respond(await requestAssistant(assistantDeps(readPtSession), request.headers, origin(request), (await params).id, await request.json().catch(() => null))); }
  catch (error) { return failed(error, 'AI yanıtı hazırlanamadı. Gemini bağlantısını kontrol et veya yeniden dene.'); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const input = await request.json().catch(() => null);
    const parsed = v.safeParse(v.strictObject({ id: v.pipe(v.string(), v.uuid()), body: v.optional(programFormSchema) }), input);
    if (!parsed.success) return NextResponse.json({ error: 'Taslak kimliği veya program bilgileri geçersiz.' }, { status: 400 });
    return respond(await saveAssistantDraft(assistantDeps(readPtSession), request.headers, origin(request), (await params).id, parsed.output.id, parsed.output.body ?? null, 'pt'));
  } catch (error) { return failed(error, 'Taslak uygulanamadı.'); }
}

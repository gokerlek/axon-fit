import { NextResponse } from 'next/server';
import { coachClientSession } from '@/lib/ai/coach-session';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { saveAssistantDraft } from '@/lib/ai/assistant-routes';
import { origin } from '@/lib/urls';
import { failed } from '@/lib/health-respond';
export async function PUT(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: 'Danışan oturumu gerekiyor.' }, { status: 403 });
    const result = await saveAssistantDraft(assistantDeps(coachClientSession), request.headers, origin(request), session.clientId, (await params).draftId, await request.json().catch(() => null), 'client');
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failed(error, 'Program kaydedilemedi. Yeniden dene.'); }
}

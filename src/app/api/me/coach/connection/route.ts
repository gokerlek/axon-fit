import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { coachClientSession } from '@/lib/ai/coach-session';
import { postGuard } from '@/lib/client-auth-routes';
import { origin } from '@/lib/urls';
import { readClient } from '@/lib/client-record';
import { geminiKeySchema, geminiKeyError } from '@/lib/ai/gemini-key-input';
import { ownCoachKey, setOwnCoachKey } from '@/lib/ai/coach-keys';
import { failed } from '@/lib/health-respond';
const keySchema = v.strictObject({ key: v.nullable(geminiKeySchema) });
export async function GET() {
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: 'Danışan oturumu gerekiyor.' }, { status: 403 });
    return NextResponse.json({ ownKey: !!await ownCoachKey(session.clientId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failed(error, 'AI bağlantısı açılamadı.'); }
}
export async function PUT(request: Request) {
  const blocked = postGuard(request.headers, origin(request));
  if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: 'Danışan oturumu gerekiyor.' }, { status: 403 });
    const stored = await readClient(session.clientId);
    if (!stored) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });
    const body = await request.json().catch(() => null);
    const parsed = v.safeParse(keySchema, body);
    if (!parsed.success) return NextResponse.json({ error: body && typeof body === 'object' && 'key' in body ? geminiKeyError(body.key) || 'Anahtar isteği geçersiz.' : 'Gemini API anahtarını kontrol et.' }, { status: 400 });
    if (parsed.output.key && !stored.client.modules.ai?.enabled) return NextResponse.json({ error: 'Önce PT AI desteğini açmalı.' }, { status: 403 });
    await setOwnCoachKey(session.clientId, parsed.output.key);

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failed(error, 'AI bağlantısı kaydedilemedi.'); }
}

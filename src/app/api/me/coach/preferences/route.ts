import { NextResponse } from 'next/server';
import { coachClientSession } from '@/lib/ai/coach-session';
import { readCoachPreferences, writeCoachPreferences } from '@/lib/ai/coach-preferences';
import { postGuard } from '@/lib/client-auth-routes';
import { origin } from '@/lib/urls';
import { failed } from '@/lib/health-respond';
import { safeParse } from 'valibot';
import { coachPreferencesSchema } from '@/lib/ai/coach-contract';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  try {
    const session = await coachClientSession();
    if (!session) return json({ error: 'Danışan oturumu gerekiyor.' }, 403);
    return json(await readCoachPreferences(session.clientId));
  } catch (error) { return failed(error, 'Koç tercihleri okunamadı.'); }
}
export async function PUT(request: Request) {
  const blocked = postGuard(request.headers, origin(request));
  if (blocked) return json(blocked.body, blocked.status);
  try {
    const session = await coachClientSession();
    if (!session) return json({ error: 'Danışan oturumu gerekiyor.' }, 403);
    const result = safeParse(coachPreferencesSchema, await request.json().catch(() => null));
    if (!result.success) return json({ error: 'Tercihleri kontrol et.' }, 400);
    return json(await writeCoachPreferences(session.clientId, result.output));
  } catch (error) { return failed(error, 'Koç tercihleri kaydedilemedi.'); }
}

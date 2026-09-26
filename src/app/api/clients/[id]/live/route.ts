import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { GithubError } from '@/lib/github/client';
import { readLiveSession } from '@/lib/live-store';
import type { LiveResponse } from '@/lib/live-text';
import { clientIdSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';

/**
 * PT: danışanın açık antrenmanı (canlı görünüm, tasarım §4.6; SPEC §7). Danışanın sayfası sekme görünürken
 * 10 sn'de bir sorar (kimse çalışmıyorken 60 sn). Değişiklik yokken GitHub'a tek koşullu okuma gider (304,
 * birincil kotadan düşmez; `live-store.ts`). Yanıt önbelleğe alınmaz.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });

  try {
    const now = new Date();
    const body: LiveResponse = { live: await readLiveSession(id, now), checkedAt: now.toISOString() };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Canlı durum okunamadı.' }, { status: failure?.status ?? 502 });
  }
}

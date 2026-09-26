import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { GithubError } from '@/lib/github/client';
import { resetSchedule } from '@/lib/programs';
import { clientIdSchema } from '@/lib/schemas/client';
import { programScheduleActionSchema } from '@/lib/schemas/program';
import { readPtSession } from '@/lib/session';

/**
 * PT: "PT'nin günlerine dön" (tasarım §2.11). Danışanın değiştirdiği antrenman günleri silinir, PT'nin
 * günleri geçerli olur; program geçmişine yazılır. Revision artmaz: aynı sayfadaki açık düzenleyici 412
 * almaz. Danışanın katmanı yoksa değişiklik yok.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });
  if (!v.is(programScheduleActionSchema, await request.json().catch(() => null))) {
    return NextResponse.json({ error: 'İstek geçersiz.' }, { status: 400 });
  }

  try {
    const result = await resetSchedule(id);
    switch (result.status) {
      case 'saved':
        return NextResponse.json({ ok: true });
      case 'unchanged':
        return NextResponse.json({ ok: true, unchanged: true });
      case 'missing':
        return NextResponse.json({ error: 'Program bulunamadı; silinmiş olabilir.' }, { status: 404 });
      case 'invalid':
        return NextResponse.json({ error: 'Program dosyası okunamıyor; önce programı düzelt.' }, { status: 409 });
    }
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Günler geri alınamadı.' }, { status: failure?.status ?? 502 });
  }
}

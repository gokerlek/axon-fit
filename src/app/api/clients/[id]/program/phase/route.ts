import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { GithubError } from '@/lib/github/client';
import { switchPhase } from '@/lib/programs';
import { clientIdSchema } from '@/lib/schemas/client';
import { programPhaseSwitchSchema } from '@/lib/schemas/program';
import { readPtSession } from '@/lib/session';

/**
 * PT onaylı evre geçişi (program sayfasındaki "Sonraki evreye geç"). Geçiş program
 * geçmişine yazılır; sayfa yüklendikten sonra program değiştiyse (revision ya da silinip
 * yeniden oluşturulduysa oluşturulma anı tutmuyorsa) 412 döner.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });

  const parsed = v.safeParse(programPhaseSwitchSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'İstek geçersiz.' }, { status: 400 });

  try {
    const { phaseId, baseRevision, baseCreatedAt } = parsed.output;
    const result = await switchPhase(id, phaseId, { revision: baseRevision, createdAt: baseCreatedAt });
    switch (result.status) {
      case 'saved':
        return NextResponse.json({ revision: result.revision });
      case 'unchanged':
        return NextResponse.json({ revision: result.revision, unchanged: true });
      case 'unknown':
        return NextResponse.json({ error: 'Evre bulunamadı.' }, { status: 400 });
      case 'missing':
        return NextResponse.json({ error: 'Program bulunamadı; silinmiş olabilir.' }, { status: 404 });
      case 'stale':
        return NextResponse.json(
          { error: 'Program bu arada başka bir yerde değişti; sayfayı yeniledim, öneriye yeniden bak.' },
          { status: 412 },
        );
    }
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Evre değiştirilemedi.' }, { status: failure?.status ?? 502 });
  }
}

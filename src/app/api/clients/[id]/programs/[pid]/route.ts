import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { readClient } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { saveResponse } from '@/lib/own-program-routes';
import { isOwnProgramId } from '@/lib/own-programs';
import { ptSaveOwnProgram } from '@/lib/own-programs-store';
import { clientIdSchema } from '@/lib/schemas/client';
import { ownProgramSaveSchema } from '@/lib/schemas/own-program';
import { readPtSession } from '@/lib/session';

/**
 * PT: danışanın paylaştığı programı kaydeder (`docs/design/kendi-program.md` §3.5, §4). Dosya dalın ucunda okunur;
 * paylaşılmamışsa 403 (index'teki `shared` gösterimdir, karar dosyadan). Commit aynı uçla; dal o arada ilerlediyse
 * yeniden okunur ve paylaşım yeniden denetlenir. Ad, paylaşım, kimlik, geçmiş, rotasyon ve (günler değişmediyse)
 * günler kayıttan gelir; geçmişe `by: "pt"`, danışana bildirim (index `ptEditedAt`). 412 eski sürüm, 404 silinmiş.
 * `pid` kalıba uymuyorsa yol kurulmadan 404.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  const { id, pid } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });
  if (!isOwnProgramId(pid)) return NextResponse.json({ error: 'Program bulunamadı.' }, { status: 404 });

  const parsed = v.safeParse(ownProgramSaveSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 });
  }
  // PT program oluşturamaz: yalnız danışanın paylaştığı var olan programı kaydeder.
  if (parsed.output.baseRevision === null) return NextResponse.json({ error: 'Program bulunamadı.' }, { status: 404 });

  try {
    if (!(await readClient(id))) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });
    const result = saveResponse(await ptSaveOwnProgram(id, pid, parsed.output), 'pt');
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Program kaydedilemedi.' }, { status: failure?.status ?? 502 });
  }
}

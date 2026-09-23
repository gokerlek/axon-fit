import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { createClient, updateClient } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { createProgramFromTemplate, programIdSource, type ProgramState } from '@/lib/program-plan';
import { clientSaveSchema } from '@/lib/schemas/client';
import { readSession } from '@/lib/session';
import { readTemplateFile } from '@/lib/templates';

/**
 * Yeni danışan ya da (kimlikle) güncelleme. Yeni danışanda sunucu `client-<id>` özel
 * repo'sunu açar, kaydı oraya yazar; uygulama repo'suna yalnız kimlik ve durum girer.
 * Başlangıç şablonu seçildiyse program ("Evre 1 · Gün A") aynı adımda danışanın
 * repo'suna yazılır; şablon o arada silindiyse repo hiç açılmaz.
 */
export async function POST(request: Request) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const parsed = v.safeParse(clientSaveSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 });
  }

  const { id, startTemplateId, ...input } = parsed.output;
  try {
    if (id) {
      await updateClient(id, input);
      return NextResponse.json({ id });
    }
    let program: ProgramState | undefined;
    if (startTemplateId) {
      const file = await readTemplateFile(startTemplateId);
      if (!file?.template) {
        return NextResponse.json(
          { error: 'Bilgileri kontrol et.', fields: { startTemplateId: 'Şablon bulunamadı.' } },
          { status: 400 },
        );
      }
      program = createProgramFromTemplate(file.template, programIdSource([]), new Date());
    }
    return NextResponse.json({ id: await createClient(input, { program }) });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Danışan kaydedilemedi.' }, { status: failure?.status ?? 502 });
  }
}

import { NextResponse } from 'next/server';
import { GithubError } from '@/lib/github/client';
import { TEMPLATE_ID_PATTERN } from '@/lib/schemas/template';
import { readPtSession } from '@/lib/session';
import { deleteTemplateFile, readTemplateFile } from '@/lib/templates';

/**
 * Şablon dosyasını siler (okunamayan dosya da silinebilir). Git geçmişinde kaydı durur.
 * Kimlik kalıba uymuyorsa GitHub'a hiç gidilmez.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  if (!TEMPLATE_ID_PATTERN.test(id)) return NextResponse.json({ error: 'Şablon bulunamadı.' }, { status: 404 });
  try {
    const stored = await readTemplateFile(id);
    if (!stored) return NextResponse.json({ error: 'Şablon bulunamadı.' }, { status: 404 });
    await deleteTemplateFile(id, stored.sha, `Şablon silindi: ${stored.name ?? id}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Şablon silinemedi.' }, { status: failure?.status ?? 502 });
  }
}

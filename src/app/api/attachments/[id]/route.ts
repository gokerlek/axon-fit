import { NextResponse } from 'next/server';
import { readCustomAttachments, writeCustomAttachments } from '@/lib/attachments';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha } from '@/lib/github/files';
import { readSession } from '@/lib/session';

/**
 * PT'nin aparatını siler; hazır bir aparatın PT sürümüyse varsayılana döner. Hazır
 * havuzdakiler silinemez. Cihazlarda seçili kalan kimlikler çözülemez olur; cihaz
 * kaydedilince listeden düşer. Aparatın fotoğrafı da silinir.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  try {
    const { items, sha } = await readCustomAttachments();
    const target = items.find((item) => item.id === id);
    if (!target) return NextResponse.json({ error: 'Bu aparat hazır havuzdan geliyor, silinemez.' }, { status: 404 });
    await writeCustomAttachments(items.filter((item) => item.id !== id), `Aparat silindi: ${target.name}`, sha);
    if (target.image) {
      const repo = appRepo();
      const fileSha = await getFileSha(repo, target.image).catch(() => null);
      if (fileSha) await deleteFile(repo, target.image, { sha: fileSha, message: 'Aparat fotoğrafı silindi' }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Aparat silinemedi.' }, { status: failure?.status ?? 502 });
  }
}

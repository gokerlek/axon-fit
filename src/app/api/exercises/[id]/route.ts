import { NextResponse } from 'next/server';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha } from '@/lib/github/files';
import { readCustomExercises, writeCustomExercises } from '@/lib/exercises';
import { readSession } from '@/lib/session';

/**
 * PT'nin kendi egzersizini siler (hazır bir egzersizin sürümüyse varsayılana döner).
 * Hazır kütüphanedekiler silinemez (pakette gelir). Görseli varsa o da silinir.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const { items, sha } = await readCustomExercises();
    const target = items.find((item) => item.id === id);
    if (!target) {
      return NextResponse.json(
        { error: 'Bu egzersiz hazır kütüphaneden geliyor, silinemez.' },
        { status: 404 },
      );
    }

    await writeCustomExercises(
      items.filter((item) => item.id !== id),
      `Egzersiz silindi: ${target.title}`,
      sha,
    );
    if (target.image) {
      const repo = appRepo();
      const fileSha = await getFileSha(repo, target.image).catch(() => null);
      if (fileSha) await deleteFile(repo, target.image, { sha: fileSha, message: 'Egzersiz görseli silindi' }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'Egzersiz silinemedi.' },
      { status: failure?.status ?? 502 },
    );
  }
}

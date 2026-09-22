import { NextResponse } from 'next/server';
import { GithubError } from '@/lib/github/client';
import { readCustomExercises, writeCustomExercises } from '@/lib/exercises';
import { readSession } from '@/lib/session';

/**
 * PT'nin kendi egzersizini siler (hazır bir egzersizin sürümüyse varsayılana döner).
 * Hazır kütüphanedekiler silinemez (pakette gelir).
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'Egzersiz silinemedi.' },
      { status: failure?.status ?? 502 },
    );
  }
}

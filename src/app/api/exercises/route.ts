import { NextResponse } from 'next/server';
import { appRepoFiles } from '@/lib/app-repo-files';
import { saveExercise } from '@/lib/catalog-actions';
import { GithubError } from '@/lib/github/client';
import { listExercises } from '@/lib/exercises';
import { readAnySession, readPtSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await readAnySession();
    // Danışan da egzersizleri görür (kendi antrenmanını kurarken); yazma yalnız PT'de.
    if (!session) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });

    return NextResponse.json({ exercises: await listExercises() });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'Egzersizler okunamadı.' },
      { status: failure?.status ?? 502 },
    );
  }
}

/** Yeni egzersiz ya da (kimlikle) güncelleme; kurallar `saveExercise`'ta (`src/lib/catalog-actions.ts`). */
export async function POST(request: Request) {
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  const { status, body } = await saveExercise(appRepoFiles(), await request.json().catch(() => null));
  return NextResponse.json(body, { status });
}

import { NextResponse } from 'next/server';
import { appRepoFiles } from '@/lib/app-repo-files';
import { deleteExercise } from '@/lib/catalog-actions';
import { readPtSession } from '@/lib/session';

/**
 * PT'nin kendi egzersizini siler (hazır bir egzersizin sürümüyse varsayılana döner).
 * Hazır kütüphanedekiler silinemez (pakette gelir). Silinen egzersiz, PT'nin diğer
 * egzersizlerinde sabitlendiği muadillerden de düşer ve kimliği bir daha verilmez;
 * varsayılana dönüşte kimlik hazır kütüphanede yaşadığı için sabitlemeler kalır.
 * Kurallar `deleteExercise`'ta (`src/lib/catalog-actions.ts`).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  const { id } = await params;
  const { status, body } = await deleteExercise(appRepoFiles(), id);
  return NextResponse.json(body, { status });
}

import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import { GithubError } from '@/lib/github/client';
import { readCustomExercises, writeCustomExercises } from '@/lib/exercises';
import { readSession } from '@/lib/session';

const bodySchema = v.object({
  alternatives: v.pipe(
    v.array(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))),
    v.maxLength(12, 'En fazla 12 muadil sabitlenebilir.'),
  ),
});

/**
 * PT'nin sabitlediği muadilleri yazar (sıra korunur). Hazır bir egzersizde bu,
 * düzenlemede olduğu gibi PT'nin sürümünü oluşturur.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  const parsed = v.safeParse(bodySchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.issues[0].message }, { status: 400 });

  try {
    const { items, sha } = await readCustomExercises();
    const entry = items.find((item) => item.id === id) ?? EXERCISE_LIBRARY.find((item) => item.id === id);
    if (!entry) return NextResponse.json({ error: 'Egzersiz bulunamadı.' }, { status: 404 });

    const known = new Set([...items.map((item) => item.id), ...EXERCISE_LIBRARY.map((item) => item.id)]);
    const alternatives = [...new Set(parsed.output.alternatives)].filter((other) => other !== id && known.has(other));

    const updated = { ...entry, alternatives: alternatives.length > 0 ? alternatives : undefined };
    const next = items.some((item) => item.id === id)
      ? items.map((item) => (item.id === id ? updated : item))
      : [...items, updated];
    await writeCustomExercises(next, `Muadiller güncellendi: ${entry.title}`, sha);
    return NextResponse.json({ alternatives });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Muadiller kaydedilemedi.' }, { status: failure?.status ?? 502 });
  }
}

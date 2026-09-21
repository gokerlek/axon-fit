import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import { GithubError } from '@/lib/github/client';
import { listExercises, readCustomExercises, slugify, writeCustomExercises } from '@/lib/exercises';
import { exerciseSchema } from '@/lib/schemas/exercise';
import { readSession } from '@/lib/session';

/** Kimliksiz gelen istek yeni egzersizdir: kimlik başlıktan üretilir. */
const saveSchema = v.object({ ...exerciseSchema.entries, id: v.optional(exerciseSchema.entries.id) });

export async function GET() {
  const session = await readSession();
  // Danışan da egzersizleri görür (kendi antrenmanını kurarken); yazma yalnız PT'de.
  if (!session) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });

  try {
    return NextResponse.json({ exercises: await listExercises() });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'Egzersizler okunamadı.' },
      { status: failure?.status ?? 502 },
    );
  }
}

export async function POST(request: Request) {
  const session = await readSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  const parsed = v.safeParse(saveSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 });
  }

  try {
    const { items, sha } = await readCustomExercises();
    // Görsel yalnız görsel ucundan yazılır; istemcinin gönderdiği yol yok sayılır, kayıtlı olan korunur.
    const { image: _ignored, ...input } = parsed.output;
    const taken = new Set([...items.map((item) => item.id), ...EXERCISE_LIBRARY.map((item) => item.id)]);

    if (input.id) {
      const index = items.findIndex((item) => item.id === input.id);
      const entry = { ...input, id: input.id, image: items[index]?.image };
      const next = index >= 0 ? items.map((item, i) => (i === index ? entry : item)) : [...items, entry];
      await writeCustomExercises(next, `Egzersiz güncellendi: ${input.title}`, sha);
      return NextResponse.json({ id: input.id });
    }

    const id = slugify(input.title, taken);
    await writeCustomExercises([...items, { ...input, id }], `Egzersiz eklendi: ${input.title}`, sha);
    return NextResponse.json({ id });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'Egzersiz kaydedilemedi.' },
      { status: failure?.status ?? 502 },
    );
  }
}

import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { addOverride } from '@/lib/constraints';
import { listExercises } from '@/lib/exercises';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { clientIdSchema } from '@/lib/schemas/client';
import { overridePostSchema } from '@/lib/schemas/constraint';

/**
 * Danışana özel izin ("Yine de ekle", "İzin ver"; tasarım `kisit-tarama.md` §3.2): o kısıtın bulguları bu harekette
 * susar. Görüşü alınmamış kırmızı bayrakta ve kauda ekinada 409. Programı kaydetmeden çıkılsa da izin kalır.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPt())) return forbidden();
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return notFound('Danışan bulunamadı.');
  const parsed = v.safeParse(overridePostSchema, await readBody(request));
  if (!parsed.success) return invalid(parsed.issues);

  const exercise = (await listExercises()).find((item) => item.id === parsed.output.exerciseId);
  if (!exercise) return notFound('Bu hareket kütüphanede yok.');
  try {
    await updateHealth(id, 'conditions', (record) => addOverride(record, parsed.output, { now: new Date().toISOString(), title: exercise.title }), 'İzin kaydedildi');
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failed(error, 'İzin kaydedilemedi.');
  }
}

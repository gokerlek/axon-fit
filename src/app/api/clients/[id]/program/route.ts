import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { readClient } from '@/lib/clients';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { GithubError } from '@/lib/github/client';
import { deleteProgram, programDiffContext, saveProgram } from '@/lib/programs';
import { clientIdSchema } from '@/lib/schemas/client';
import { programSaveSchema } from '@/lib/schemas/program';
import { readPtSession } from '@/lib/session';

function forbidden() {
  return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
}

function clientMissing() {
  return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });
}

function failed(error: unknown, fallback: string) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

/**
 * Programı oluşturur (`baseRevision: null`) ya da kaydeder. Egzersiz ve cihaz kimlikleri
 * kütüphaneye göre, kayıttaki programla birlikte denetlenir (`saveProgram`); eski biçimle açık
 * kalmış sekmenin gövdesi şemada çevrilir. Düzenleyici yüklediği revision'ı ve programın oluşturulma
 * anını gönderir: program o arada başka yerde kaydedildiyse (ya da silinip yeniden oluşturulduysa)
 * 412 döner ve kayıt yapılmaz. Değişiklik yoksa hiçbir şey yazılmaz; varsa geçmişe ve commit
 * mesajına otomatik özet girer. Cihazı o arada silinmiş satırlar egzersizin cihazına döner; sayısı
 * yanıtta (`droppedDevices`), düzenleyici PT'ye söyler. Antrenman günleri değişince danışanın kendi
 * günleri silinir (son söz PT'nin, tasarım §2.11).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await readPtSession())?.role !== 'pt') return forbidden();
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return clientMissing();

  const parsed = v.safeParse(programSaveSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 });
  }

  const { baseRevision, baseCreatedAt, phased, currentPhaseId, phases, weekdays } = parsed.output;
  try {
    if (!(await readClient(id))) return clientMissing();
    const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
    const result = await saveProgram(
      id,
      // Günleri göndermeyen eski sekme kayıttakine dokunmaz (`ptScheduleEdit`).
      { phased, currentPhaseId, phases, ...(weekdays !== undefined ? { weekdays } : {}) },
      baseRevision === null ? null : { revision: baseRevision, createdAt: baseCreatedAt },
      { exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])), deviceIds: new Set(devices.map((device) => device.id)) },
      programDiffContext(exercises, devices),
    );
    switch (result.status) {
      case 'invalid':
        return NextResponse.json({ error: 'Bilgileri kontrol et.', fields: result.errors }, { status: 400 });
      case 'created':
        return NextResponse.json({ revision: result.revision, droppedDevices: result.droppedDevices }, { status: 201 });
      case 'saved':
        return NextResponse.json({ revision: result.revision, droppedDevices: result.droppedDevices });
      case 'unchanged':
        return NextResponse.json({ revision: result.revision, unchanged: true, droppedDevices: result.droppedDevices });
      case 'missing':
        return NextResponse.json({ error: 'Program bulunamadı; silinmiş olabilir.' }, { status: 404 });
      case 'stale':
        return NextResponse.json(
          { error: 'Bu program sen düzenlerken başka bir yerde değişti. Değişikliklerin kaybolmasın diye kaydetmedim.' },
          { status: 412 },
        );
      case 'exists':
        return NextResponse.json(
          { error: 'Bu danışanın programı sen hazırlarken oluşturuldu. Değişikliklerin kaybolmasın diye kaydetmedim.' },
          { status: 412 },
        );
    }
  } catch (error) {
    return failed(error, 'Program kaydedilemedi.');
  }
}

/** Programı siler (okunamayan dosya da silinebilir). Git geçmişinde kaydı durur. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await readPtSession())?.role !== 'pt') return forbidden();
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return clientMissing();
  try {
    if (!(await deleteProgram(id))) return NextResponse.json({ error: 'Program bulunamadı.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Program silinemedi.');
  }
}

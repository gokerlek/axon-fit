import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { GithubError } from '@/lib/github/client';
import { templateSaveSchema, type Template } from '@/lib/schemas/template';
import { readSession } from '@/lib/session';
import { normalizeTemplate, randomId } from '@/lib/template-plan';
import { readTemplateFile, writeTemplate } from '@/lib/templates';

function failed(error: unknown, fallback: string) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

/**
 * Yeni şablon ya da (kimlikle) güncelleme. Egzersiz ve cihaz kimlikleri kütüphaneye göre
 * denetlenir. Düzenleyici yüklediği sürümü (`baseSha`) gönderir: dosya o arada başka
 * yerde değiştiyse 412 döner ve kayıt yapılmaz (PT'nin değişiklikleri kaybolmasın).
 */
export async function POST(request: Request) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const parsed = v.safeParse(templateSaveSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 });
  }

  const { id: requestedId, baseSha, name, description, blocks } = parsed.output;
  try {
    const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
    const normalized = normalizeTemplate(
      { blocks },
      { exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])), deviceIds: new Set(devices.map((device) => device.id)) },
    );
    if (Object.keys(normalized.errors).length > 0) {
      return NextResponse.json({ error: 'Bilgileri kontrol et.', fields: normalized.errors }, { status: 400 });
    }

    const now = new Date().toISOString();
    if (requestedId) {
      const stored = await readTemplateFile(requestedId);
      if (!stored) return NextResponse.json({ error: 'Şablon bulunamadı; silinmiş olabilir.' }, { status: 404 });
      if (baseSha && baseSha !== stored.sha) {
        return NextResponse.json(
          { error: 'Bu şablon sen düzenlerken başka bir yerde değişti. Değişikliklerin kaybolmasın diye kaydetmedim.' },
          { status: 412 },
        );
      }
      // Okunamayan dosyanın üzerine yazmak onu onarır; oluşturma tarihi yoksa bugün.
      const template: Template = {
        id: requestedId,
        name,
        description,
        blocks: normalized.blocks,
        createdAt: stored.template?.createdAt ?? now,
        updatedAt: now,
      };
      const { sha } = await writeTemplate(template, { sha: stored.sha, message: `Şablon güncellendi: ${name}` });
      return NextResponse.json({ id: requestedId, sha });
    }

    // Kimlik rastgele; çok düşük ihtimalle var olan bir dosyaya denk gelirse GitHub reddeder
    // (409), istemci bir kez yeniden dener ve yeni kimlik alır.
    const id = randomId('t', 8, new Set());
    const template: Template = { id, name, description, blocks: normalized.blocks, createdAt: now, updatedAt: now };
    const { sha } = await writeTemplate(template, { message: `Şablon eklendi: ${name}` });
    return NextResponse.json({ id, sha }, { status: 201 });
  } catch (error) {
    return failed(error, 'Şablon kaydedilemedi.');
  }
}

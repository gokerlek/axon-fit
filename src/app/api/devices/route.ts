import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { DEVICE_LIBRARY } from '@/data/device-library';
import { listDevices, readCustomDevices, writeCustomDevices } from '@/lib/devices';
import { slugify } from '@/lib/exercises';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha } from '@/lib/github/files';
import { takesAttachments } from '@/lib/device-loads';
import { deviceSaveSchema, needsBase, needsMax, needsStep, needsWeights, takesAddOns, type Device } from '@/lib/schemas/device';
import { readSession } from '@/lib/session';

function failed(error: unknown, fallback: string) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

export async function GET() {
  if (!(await readSession())) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });
  try {
    return NextResponse.json({ devices: await listDevices() });
  } catch (error) {
    return failed(error, 'Cihazlar okunamadı.');
  }
}

/** Yeni cihaz ya da (kimlikle) güncelleme. Hazır bir cihazı güncellemek PT'nin sürümünü oluşturur. */
export async function POST(request: Request) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const parsed = v.safeParse(deviceSaveSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 });
  }

  // Türün kullanmadığı ayarlar kayda girmesin (ör. dambıl setinde blok adımı).
  const { id: requestedId, ...input } = parsed.output;
  const kind = input.kind;
  const clean: Omit<Device, 'id' | 'attachments'> = {
    name: input.name,
    kind,
    ...(needsBase(kind) ? { baseKg: input.baseKg } : {}),
    ...(needsStep(kind) ? { stepKg: input.stepKg } : {}),
    ...(needsMax(kind) || kind === 'plate_loaded' ? { maxKg: input.maxKg } : {}),
    ...(takesAddOns(kind) && input.addOnsKg?.length ? { addOnsKg: [...new Set(input.addOnsKg)].sort((a, b) => a - b) } : {}),
    ...(kind === 'cable' ? { pulleyRatio: input.pulleyRatio ?? 1 } : {}),
    ...(needsWeights(kind) ? { weightsKg: [...new Set(input.weightsKg ?? [])].sort((a, b) => a - b) } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };

  // Aynı ad iki kez girilmesin (büyük/küçük harf farkı da aynı aparattır).
  const attachmentNames = takesAttachments(kind)
    ? [...new Map((input.attachments ?? []).map((item) => [item.name.toLocaleLowerCase('tr'), item.name])).values()]
    : [];
  /** Aparat fotoğrafları yalnız görsel ucundan yazılır; adı duran aparatınki korunur. */
  const withAttachments = (stored: Device | undefined): Omit<Device, 'id'> => {
    const images = new Map((stored?.attachments ?? []).flatMap((item) => (item.image ? [[item.name, item.image]] : [])));
    if (attachmentNames.length === 0) return clean;
    return {
      ...clean,
      attachments: attachmentNames.map((name) => {
        const image = images.get(name);
        return { name, ...(image ? { image } : {}) };
      }),
    };
  };

  try {
    const { items, sha } = await readCustomDevices();
    if (requestedId) {
      const index = items.findIndex((item) => item.id === requestedId);
      if (index < 0 && !DEVICE_LIBRARY.some((item) => item.id === requestedId)) {
        return NextResponse.json({ error: 'Cihaz bulunamadı.' }, { status: 404 });
      }
      // Görsel yalnız görsel ucundan yazılır; kayıtlı olan korunur.
      const stored = items[index] ?? DEVICE_LIBRARY.find((item) => item.id === requestedId);
      const entry = { ...withAttachments(stored), id: requestedId, ...(stored?.image ? { image: stored.image } : {}) };
      const next = index >= 0 ? items.map((item, i) => (i === index ? entry : item)) : [...items, entry];
      await writeCustomDevices(next, `Cihaz güncellendi: ${clean.name}`, sha);
      // Listeden çıkan aparatların fotoğrafları repo'da artıkta kalmasın.
      const kept = new Set(attachmentNames);
      const orphans = (stored?.attachments ?? []).flatMap((item) =>
        item.image && !kept.has(item.name) ? [item.image] : [],
      );
      if (orphans.length > 0) {
        const repo = appRepo();
        for (const path of orphans) {
          const fileSha = await getFileSha(repo, path).catch(() => null);
          if (fileSha) await deleteFile(repo, path, { sha: fileSha, message: 'Aparat görseli kaldırıldı' }).catch(() => undefined);
        }
      }
      return NextResponse.json({ id: requestedId });
    }
    const taken = new Set([...items.map((item) => item.id), ...DEVICE_LIBRARY.map((item) => item.id)]);
    const id = slugify(clean.name, taken);
    await writeCustomDevices([...items, { ...withAttachments(undefined), id }], `Cihaz eklendi: ${clean.name}`, sha);
    return NextResponse.json({ id });
  } catch (error) {
    return failed(error, 'Cihaz kaydedilemedi.');
  }
}

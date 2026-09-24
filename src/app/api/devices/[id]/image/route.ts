import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { DEVICE_LIBRARY } from '@/data/device-library';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha, readBinary, writeBinary } from '@/lib/github/files';
import { getDevice, readCustomDevices, writeCustomDevices } from '@/lib/devices';
import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES, IMAGE_TYPES, imageVersion, sniffImage, type ImageExtension } from '@/lib/image';
import { readAnySession, readPtSession } from '@/lib/session';

/**
 * Cihaz görseli: PT'nin uygulama repo'sunda `media/devices/` altında.
 *
 * Repo özel olduğu için tarayıcı GitHub'dan doğrudan çekemez; dosya sunucudan geçer.
 * Tür ve içerik denetimi `src/lib/image.ts`'te (aparat fotoğrafıyla ortak).
 */

type Params = { params: Promise<{ id: string }> };

function failed(error: unknown, fallback: string) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

export async function GET(request: Request, { params }: Params) {
  // Danışan da antrenmanda görecek; oturum yeterli.
  if (!(await readAnySession())) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const device = await getDevice(id);
  const extension = device?.image?.split('.').pop() as ImageExtension | undefined;
  if (!device?.image || !extension || !(extension in IMAGE_CONTENT_TYPES)) return new NextResponse(null, { status: 404 });

  const file = await readBinary(appRepo(), device.image).catch(() => null);
  if (!file) return new NextResponse(null, { status: 404 });

  // Adresteki sürüm güncelse içerik hiç değişmez: uzun süre önbellekte kalabilir.
  const current = new URL(request.url).searchParams.get('v') === imageVersion(device.image);
  return new NextResponse(Buffer.from(file.bytes) as unknown as BodyInit, {
    headers: {
      'Content-Type': IMAGE_CONTENT_TYPES[extension],
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${file.sha}"`,
      'Cache-Control': current ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Görsel seçilmedi.' }, { status: 400 });

  if (!IMAGE_TYPES[file.type]) {
    return NextResponse.json(
      { error: 'Yalnız PNG, JPG ve WebP yüklenebilir.', fields: { image: 'Desteklenmeyen dosya türü.' } },
      { status: 400 },
    );
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: 'Görsel en fazla 1 MB olabilir.', fields: { image: 'Dosya çok büyük.' } },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = sniffImage(bytes);
  if (!extension) {
    return NextResponse.json(
      { error: 'Dosya bir görsel değil ya da bozuk.', fields: { image: 'Dosya okunamadı.' } },
      { status: 400 },
    );
  }

  try {
    const { items, sha } = await readCustomDevices();
    // Hazır bir cihaza görsel eklemek, düzenlemede olduğu gibi PT'nin sürümünü oluşturur.
    const entry = items.find((item) => item.id === id) ?? DEVICE_LIBRARY.find((item) => item.id === id);
    if (!entry) return NextResponse.json({ error: 'Cihaz bulunamadı.' }, { status: 404 });

    const repo = appRepo();
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const path = `media/devices/${id}-${digest}.${extension}`;
    const existing = await getFileSha(repo, path);
    await writeBinary(repo, path, bytes, { sha: existing ?? undefined, message: `Cihaz görseli: ${entry.name}` });

    const updated = { ...entry, image: path };
    const next = items.some((item) => item.id === id)
      ? items.map((item) => (item.id === id ? updated : item))
      : [...items, updated];
    await writeCustomDevices(next, `Cihaz görseli güncellendi: ${entry.name}`, sha);

    // Eski görsel artıkta kalmasın; silinemezse kayıt yine doğru, yalnız repo'da artık kalır.
    if (entry.image && entry.image !== path) {
      const oldSha = await getFileSha(repo, entry.image).catch(() => null);
      if (oldSha) await deleteFile(repo, entry.image, { sha: oldSha, message: 'Eski cihaz görseli kaldırıldı' }).catch(() => undefined);
    }
    return NextResponse.json({ image: path });
  } catch (error) {
    return failed(error, 'Görsel yüklenemedi.');
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  try {
    const { items, sha } = await readCustomDevices();
    const entry = items.find((item) => item.id === id);
    if (!entry?.image) return NextResponse.json({ ok: true });

    const { image, ...rest } = entry;
    await writeCustomDevices(
      items.map((item) => (item.id === id ? rest : item)),
      `Cihaz görseli kaldırıldı: ${entry.name}`,
      sha,
    );
    const repo = appRepo();
    const fileSha = await getFileSha(repo, image).catch(() => null);
    if (fileSha) await deleteFile(repo, image, { sha: fileSha, message: 'Cihaz görseli silindi' }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Görsel kaldırılamadı.');
  }
}

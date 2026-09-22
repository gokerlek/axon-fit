import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { DEVICE_LIBRARY } from '@/data/device-library';
import { attachmentSlug } from '@/lib/device-loads';
import { getDevice, readCustomDevices, writeCustomDevices } from '@/lib/devices';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha, readBinary, writeBinary } from '@/lib/github/files';
import { DEVICE_IMAGE_MAX_BYTES, DEVICE_IMAGE_TYPES } from '@/lib/schemas/device';
import { readSession } from '@/lib/session';

/**
 * Aparat fotoğrafı: danışan hangi tutamacı takacağını görsün diye. Cihaz görseliyle
 * aynı kurallar; dosya adında cihaz, aparat ve içerik özeti var.
 */

const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;

function sniff(bytes: Uint8Array): keyof typeof CONTENT_TYPES | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

type Params = { params: Promise<{ id: string }> };

function failed(error: unknown, fallback: string) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

export async function GET(request: Request, { params }: Params) {
  // Danışan da antrenmanda görecek; oturum yeterli.
  if (!(await readSession())) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const name = new URL(request.url).searchParams.get('name');
  const device = await getDevice(id);
  const attachment = device?.attachments?.find((item) => item.name === name);
  const extension = attachment?.image?.split('.').pop() as keyof typeof CONTENT_TYPES | undefined;
  if (!attachment?.image || !extension || !(extension in CONTENT_TYPES)) return new NextResponse(null, { status: 404 });

  const file = await readBinary(appRepo(), attachment.image).catch(() => null);
  if (!file) return new NextResponse(null, { status: 404 });

  const current = new URL(request.url).searchParams.get('v') === attachment.image.split('/').pop()?.replace(/\.[a-z]+$/, '');
  return new NextResponse(Buffer.from(file.bytes) as unknown as BodyInit, {
    headers: {
      'Content-Type': CONTENT_TYPES[extension],
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${file.sha}"`,
      'Cache-Control': current ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  const name = form?.get('name');
  if (!(file instanceof File) || typeof name !== 'string') {
    return NextResponse.json({ error: 'Görsel ya da aparat seçilmedi.' }, { status: 400 });
  }
  if (!DEVICE_IMAGE_TYPES[file.type]) {
    return NextResponse.json({ error: 'Yalnız PNG, JPG ve WebP yüklenebilir.' }, { status: 400 });
  }
  if (file.size > DEVICE_IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: 'Görsel en fazla 1 MB olabilir.' }, { status: 413 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = sniff(bytes);
  if (!extension) return NextResponse.json({ error: 'Dosya bir görsel değil ya da bozuk.' }, { status: 400 });

  try {
    const { items, sha } = await readCustomDevices();
    // Hazır bir cihazın aparatına görsel eklemek, düzenlemede olduğu gibi PT'nin sürümünü oluşturur.
    const entry = items.find((item) => item.id === id) ?? DEVICE_LIBRARY.find((item) => item.id === id);
    const attachment = entry?.attachments?.find((item) => item.name === name);
    if (!entry || !attachment) return NextResponse.json({ error: 'Aparat bulunamadı.' }, { status: 404 });

    const repo = appRepo();
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const path = `media/devices/${id}-${attachmentSlug(name)}-${digest}.${extension}`;
    const existing = await getFileSha(repo, path);
    await writeBinary(repo, path, bytes, { sha: existing ?? undefined, message: `Aparat görseli: ${entry.name} · ${name}` });

    const updated = {
      ...entry,
      attachments: entry.attachments?.map((item) => (item.name === name ? { ...item, image: path } : item)),
    };
    const next = items.some((item) => item.id === id) ? items.map((item) => (item.id === id ? updated : item)) : [...items, updated];
    await writeCustomDevices(next, `Aparat görseli güncellendi: ${entry.name} · ${name}`, sha);

    if (attachment.image && attachment.image !== path) {
      const oldSha = await getFileSha(repo, attachment.image).catch(() => null);
      if (oldSha) await deleteFile(repo, attachment.image, { sha: oldSha, message: 'Eski aparat görseli kaldırıldı' }).catch(() => undefined);
    }
    return NextResponse.json({ image: path });
  } catch (error) {
    return failed(error, 'Aparat görseli yüklenemedi.');
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  const name = new URL(request.url).searchParams.get('name');
  try {
    const { items, sha } = await readCustomDevices();
    const entry = items.find((item) => item.id === id);
    const attachment = entry?.attachments?.find((item) => item.name === name);
    if (!entry || !attachment?.image) return NextResponse.json({ ok: true });

    const image = attachment.image;
    await writeCustomDevices(
      items.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          attachments: item.attachments?.map((current) => {
            if (current.name !== name) return current;
            const { image: _removed, ...withoutImage } = current;
            return withoutImage;
          }),
        };
      }),
      `Aparat görseli kaldırıldı: ${entry.name} · ${name}`,
      sha,
    );
    const repo = appRepo();
    const fileSha = await getFileSha(repo, image).catch(() => null);
    if (fileSha) await deleteFile(repo, image, { sha: fileSha, message: 'Aparat görseli silindi' }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Aparat görseli kaldırılamadı.');
  }
}

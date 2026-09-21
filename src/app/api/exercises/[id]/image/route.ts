import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha, readBinary, writeBinary } from '@/lib/github/files';
import { getExercise, readCustomExercises, writeCustomExercises } from '@/lib/exercises';
import { EXERCISE_IMAGE_MAX_BYTES, EXERCISE_IMAGE_TYPES } from '@/lib/schemas/exercise';
import { readSession } from '@/lib/session';

/**
 * Egzersiz görseli: PT'nin uygulama repo'sunda `media/exercises/` altında.
 *
 * Repo özel olduğu için tarayıcı GitHub'dan doğrudan çekemez; dosya sunucudan geçer.
 * SVG kabul edilmez (betik taşıyabilir). Dosyanın gerçekten görsel olduğu ilk
 * baytlarından da denetlenir; tarayıcının bildirdiği türe güvenilmez.
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
  const exercise = await getExercise(id);
  const extension = exercise?.image?.split('.').pop() as keyof typeof CONTENT_TYPES | undefined;
  if (!exercise?.image || !extension || !(extension in CONTENT_TYPES)) return new NextResponse(null, { status: 404 });

  const file = await readBinary(appRepo(), exercise.image).catch(() => null);
  if (!file) return new NextResponse(null, { status: 404 });

  // Adresteki sürüm güncelse içerik hiç değişmez: uzun süre önbellekte kalabilir.
  const current = new URL(request.url).searchParams.get('v') === exercise.image.split('/').pop()?.replace(/\.[a-z]+$/, '');
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
  if (!(file instanceof File)) return NextResponse.json({ error: 'Görsel seçilmedi.' }, { status: 400 });

  if (!EXERCISE_IMAGE_TYPES[file.type]) {
    return NextResponse.json(
      { error: 'Yalnız PNG, JPG ve WebP yüklenebilir.', fields: { image: 'Desteklenmeyen dosya türü.' } },
      { status: 400 },
    );
  }
  if (file.size > EXERCISE_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: 'Görsel en fazla 1 MB olabilir.', fields: { image: 'Dosya çok büyük.' } },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = sniff(bytes);
  if (!extension) {
    return NextResponse.json(
      { error: 'Dosya bir görsel değil ya da bozuk.', fields: { image: 'Dosya okunamadı.' } },
      { status: 400 },
    );
  }

  try {
    const { items, sha } = await readCustomExercises();
    // Hazır bir egzersize görsel eklemek, düzenlemede olduğu gibi PT'nin sürümünü oluşturur.
    const entry = items.find((item) => item.id === id) ?? EXERCISE_LIBRARY.find((item) => item.id === id);
    if (!entry) return NextResponse.json({ error: 'Egzersiz bulunamadı.' }, { status: 404 });

    const repo = appRepo();
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const path = `media/exercises/${id}-${digest}.${extension}`;
    const existing = await getFileSha(repo, path);
    await writeBinary(repo, path, bytes, { sha: existing ?? undefined, message: `Egzersiz görseli: ${entry.title}` });

    const updated = { ...entry, image: path };
    const next = items.some((item) => item.id === id)
      ? items.map((item) => (item.id === id ? updated : item))
      : [...items, updated];
    await writeCustomExercises(next, `Egzersiz görseli güncellendi: ${entry.title}`, sha);

    // Eski görsel artıkta kalmasın; silinemezse kayıt yine doğru, yalnız repo'da artık kalır.
    if (entry.image && entry.image !== path) {
      const oldSha = await getFileSha(repo, entry.image).catch(() => null);
      if (oldSha) await deleteFile(repo, entry.image, { sha: oldSha, message: 'Eski egzersiz görseli kaldırıldı' }).catch(() => undefined);
    }
    return NextResponse.json({ image: path });
  } catch (error) {
    return failed(error, 'Görsel yüklenemedi.');
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  try {
    const { items, sha } = await readCustomExercises();
    const entry = items.find((item) => item.id === id);
    if (!entry?.image) return NextResponse.json({ ok: true });

    const { image, ...rest } = entry;
    await writeCustomExercises(
      items.map((item) => (item.id === id ? rest : item)),
      `Egzersiz görseli kaldırıldı: ${entry.title}`,
      sha,
    );
    const repo = appRepo();
    const fileSha = await getFileSha(repo, image).catch(() => null);
    if (fileSha) await deleteFile(repo, image, { sha: fileSha, message: 'Egzersiz görseli silindi' }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Görsel kaldırılamadı.');
  }
}

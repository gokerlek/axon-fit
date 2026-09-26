import { NextResponse } from 'next/server';
import { readPtSession } from '@/lib/session';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha, writeBinary } from '@/lib/github/files';
import { configStore } from '@/lib/config';
import { ConfigUnavailableError, removeLogo, replaceLogo, type LogoFiles } from '@/lib/config-update';

/**
 * Logo yükleme (SPEC §10).
 *
 * SVG kabul edilmez: SVG betik taşıyabilir ve kendi alan adımızdan servis edilen
 * bir SVG, tarayıcıda çalışan koda dönüşür. PT kendi logosunu yüklüyor olsa da
 * bu kapıyı açık bırakmanın gereği yok.
 */
const ALLOWED = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const MAX_BYTES = 512 * 1024;

/**
 * Logo dosyasının GitHub işleri. Akış (önce repo denetimi, taban taze okuma, eski dosyanın ancak
 * ayar yazıldıktan sonra silinmesi) `config-update.ts`'te, orada test edilir.
 */
function logoFiles(): LogoFiles {
  const repo = appRepo();
  return {
    sha: (path) => getFileSha(repo, path),
    write: async (path, bytes, sha) => {
      await writeBinary(repo, path, bytes, { sha: sha ?? undefined, message: 'Logo güncellendi' });
    },
    remove: (path, sha, message) => deleteFile(repo, path, { sha, message }),
  };
}

export async function POST(request: Request) {
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('logo');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Dosya seçilmedi.' }, { status: 400 });
  }

  const extension = ALLOWED.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: 'Yalnız PNG, JPG ve WebP yüklenebilir.', fields: { logo: 'Desteklenmeyen dosya türü.' } },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Logo en fazla 512 KB olabilir.', fields: { logo: 'Dosya çok büyük.' } },
      { status: 400 },
    );
  }

  const path = `media/brand/logo.${extension}`;

  try {
    await replaceLogo(configStore(), logoFiles(), path, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ logo: path });
  } catch (error) {
    const failure = error instanceof GithubError || error instanceof ConfigUnavailableError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Logo yüklenemedi.' }, { status: failure?.status ?? 502 });
  }
}

export async function DELETE() {
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  try {
    await removeLogo(configStore(), logoFiles());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError || error instanceof ConfigUnavailableError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Logo kaldırılamadı.' }, { status: failure?.status ?? 502 });
  }
}

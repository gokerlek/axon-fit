import { NextResponse } from 'next/server';
import { readPtSession } from '@/lib/session';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha, writeBinary } from '@/lib/github/files';
import { readAppConfig, writeAppConfig } from '@/lib/config';

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

  const repo = appRepo();
  const path = `media/brand/logo.${extension}`;

  try {
    const existingSha = await getFileSha(repo, path);
    await writeBinary(repo, path, new Uint8Array(await file.arrayBuffer()), {
      sha: existingSha ?? undefined,
      message: 'Logo güncellendi',
    });

    const config = await readAppConfig();
    // Uzantı değiştiyse eski dosya artıkta kalmasın.
    if (config.logo && config.logo !== path) {
      const oldSha = await getFileSha(repo, config.logo);
      if (oldSha) await deleteFile(repo, config.logo, { sha: oldSha, message: 'Eski logo kaldırıldı' });
    }
    await writeAppConfig({ ...config, logo: path }, 'Logo ayarı güncellendi');

    return NextResponse.json({ logo: path });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Logo yüklenemedi.' }, { status: failure?.status ?? 502 });
  }
}

export async function DELETE() {
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  try {
    const config = await readAppConfig();
    if (config.logo) {
      const sha = await getFileSha(appRepo(), config.logo);
      if (sha) await deleteFile(appRepo(), config.logo, { sha, message: 'Logo kaldırıldı' });
      await writeAppConfig({ ...config, logo: null }, 'Logo ayarı temizlendi');
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Logo kaldırılamadı.' }, { status: failure?.status ?? 502 });
  }
}

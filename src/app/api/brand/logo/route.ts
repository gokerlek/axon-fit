import { NextResponse } from 'next/server';
import { appRepo } from '@/lib/github/client';
import { readBinary } from '@/lib/github/files';
import { readAppConfig } from '@/lib/config';

/**
 * Logoyu servis eder.
 *
 * Repo ÖZEL olduğu için tarayıcı GitHub'dan doğrudan çekemez; dosya sunucudan geçer.
 * Giriş ekranında da görünmesi gerektiği için oturum aranmaz — logo zaten herkese
 * gösterilen bir marka öğesi, gizli veri değil.
 */
const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export async function GET() {
  const config = await readAppConfig();
  if (!config.logo) return new NextResponse(null, { status: 404 });

  const extension = config.logo.split('.').pop() ?? '';
  const type = TYPES[extension];
  if (!type) return new NextResponse(null, { status: 404 });

  const file = await readBinary(appRepo(), config.logo).catch(() => null);
  if (!file) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(file.bytes) as unknown as BodyInit, {
    headers: {
      'Content-Type': type,
      // `sha` içerik değişince değişir: tarayıcı eski logoyu göstermeye devam etmez.
      ETag: `"${file.sha}"`,
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}

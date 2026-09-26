import { NextResponse } from 'next/server';
import { appRepoFiles } from '@/lib/app-repo-files';
import { saveDevice } from '@/lib/catalog-actions';
import { listDevices } from '@/lib/devices';
import { GithubError } from '@/lib/github/client';
import { readAnySession, readPtSession } from '@/lib/session';

function failed(error: unknown, fallback: string) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

export async function GET() {
  try {
    if (!(await readAnySession())) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });
    return NextResponse.json({ devices: await listDevices() });
  } catch (error) {
    return failed(error, 'Cihazlar okunamadı.');
  }
}

/**
 * Yeni cihaz ya da (kimlikle) güncelleme. Hazır bir cihazı güncellemek PT'nin sürümünü oluşturur;
 * cihazda artık olmayan aparat egzersizlerden düşer. Kurallar `saveDevice`'ta (`src/lib/catalog-actions.ts`).
 */
export async function POST(request: Request) {
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { status, body } = await saveDevice(appRepoFiles(), await request.json().catch(() => null));
  return NextResponse.json(body, { status });
}

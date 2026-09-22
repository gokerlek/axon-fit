import { NextResponse } from 'next/server';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha } from '@/lib/github/files';
import { readCustomDevices, writeCustomDevices } from '@/lib/devices';
import { readSession } from '@/lib/session';

/**
 * PT'nin cihazını siler; hazır bir cihazın PT sürümüyse varsayılana döner. Hazır
 * katalogdakiler silinemez. Bu cihaza bağlı egzersizler cihazsız kalır (kendi
 * ağırlık adımlarıyla devam eder). Cihazın görseli de silinir; aparat fotoğrafları
 * havuzda kalır (başka cihazlarda da kullanılıyor olabilir).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  try {
    const { items, sha } = await readCustomDevices();
    const target = items.find((item) => item.id === id);
    if (!target) return NextResponse.json({ error: 'Bu cihaz hazır katalogdan geliyor, silinemez.' }, { status: 404 });
    await writeCustomDevices(items.filter((item) => item.id !== id), `Cihaz silindi: ${target.name}`, sha);
    // Cihazın görseli de gitsin; silinemezse kayıt yine doğru.
    if (target.image) {
      const repo = appRepo();
      const fileSha = await getFileSha(repo, target.image).catch(() => null);
      if (fileSha) await deleteFile(repo, target.image, { sha: fileSha, message: 'Cihaz görseli silindi' }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Cihaz silinemedi.' }, { status: failure?.status ?? 502 });
  }
}

import { NextResponse } from 'next/server';
import { GithubError } from '@/lib/github/client';
import { readCustomDevices, writeCustomDevices } from '@/lib/devices';
import { readSession } from '@/lib/session';

/**
 * PT'nin cihazını siler; hazır bir cihazın PT sürümüyse varsayılana döner. Hazır
 * katalogdakiler silinemez. Bu cihaza bağlı egzersizler cihazsız kalır (kendi
 * ağırlık adımlarıyla devam eder).
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Cihaz silinemedi.' }, { status: failure?.status ?? 502 });
  }
}

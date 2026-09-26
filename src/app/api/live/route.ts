import { NextResponse } from 'next/server';
import { GithubError } from '@/lib/github/client';
import { readLiveOverview } from '@/lib/live-store';
import type { LiveOverviewResponse } from '@/lib/live-text';
import { readPtSession } from '@/lib/session';

/**
 * PT: şu an antrenmanda olan danışanlar (Genel bakış; tasarım §4.6, §8 satır 12). Sayfa görünürken 60 sn'de bir
 * sorulur (SPEC §7: genel görünüm daha seyrek). Danışan başına tek koşullu okuma (değişmediyse 304); okunamayan
 * danışan listeyi durdurmaz, sayılır. Yanıt önbelleğe alınmaz.
 */
export async function GET() {
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  try {
    const now = new Date();
    const overview = await readLiveOverview(now);
    const body: LiveOverviewResponse = { ...overview, checkedAt: now.toISOString() };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Canlı durum okunamadı.' }, { status: failure?.status ?? 502 });
  }
}

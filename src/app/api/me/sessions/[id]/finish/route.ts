import { NextResponse } from 'next/server';
import { sessionRouteDeps } from '@/lib/session-files';
import { finishRoute } from '@/lib/session-routes';
import { origin } from '@/lib/urls';

/**
 * Antrenmanı bitirir (tasarım §4.7): `{ doc, rotation?, health? }` → TEK commit (Git Data API): seans
 * `finished` + index satırı + rotasyon (`program.json`, zaman denetimiyle) + onay varsa sağlık ayrıntısı
 * (`health.json`). Zaten bitmişse 200 no-op; silinmişse 410. Yalnız bu siteden ve JSON'la.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const result = await finishRoute(await sessionRouteDeps(), request.headers, origin(request), id, body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

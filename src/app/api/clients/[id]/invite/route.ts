import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { issueInvite } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { clientIdSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';
import { origin } from '@/lib/urls';

/**
 * Yeni davet kodu. Eski kod anında geçersiz olur. Kod yalnız bu yanıtta vardır: repo'ya
 * özeti yazılır, sayfadan çıkınca bir daha gösterilemez (SPEC §5).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });

  try {
    const { code, expiresAt } = await issueInvite(id);
    const url = new URL('/join', origin(request));
    url.searchParams.set('c', id);
    url.searchParams.set('k', code);
    return NextResponse.json({ code, expiresAt, url: url.toString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Davet üretilemedi.' }, { status: failure?.status ?? 502 });
  }
}

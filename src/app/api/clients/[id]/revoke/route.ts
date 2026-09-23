import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { revokeAccess } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { clientIdSchema } from '@/lib/schemas/client';
import { readSession } from '@/lib/session';

/** Danışanın açık bütün oturumlarını düşürür ve bekleyen daveti iptal eder (ör. telefon kayboldu). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });

  try {
    await revokeAccess(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Erişim kapatılamadı.' }, { status: failure?.status ?? 502 });
  }
}

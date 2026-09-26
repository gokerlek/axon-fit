import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { GithubError } from '@/lib/github/client';
import { PROPOSAL_ID_PATTERN, proposalActionSchema } from '@/lib/proposals';
import { approveProposal, declineProposal } from '@/lib/proposals-store';
import { clientIdSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';

/**
 * PT: danışanın önerisine karar (tasarım §6.4). `{ action: 'approve' }` öneriyi programa uygular (`saveProgram`
 * yolu: fark, revision +1, log `edit`; program ve öneri tek commit'te); önerinin dayandığı hâl değiştiyse
 * program değişmez, öneri `stale` olur (409). `{ action: 'decline', note? }` yalnız öneriyi reddeder.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  const { id, pid } = await params;
  if (!v.is(clientIdSchema, id) || !PROPOSAL_ID_PATTERN.test(pid)) return NextResponse.json({ error: 'Öneri bulunamadı.' }, { status: 404 });
  const parsed = v.safeParse(proposalActionSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'İstek geçersiz.' }, { status: 400 });

  try {
    if (parsed.output.action === 'decline') {
      const result = await declineProposal(id, pid, parsed.output.note);
      switch (result.status) {
        case 'declined':
          return NextResponse.json({ status: 'declined' });
        case 'missing':
          return NextResponse.json({ error: 'Öneri bulunamadı.' }, { status: 404 });
        case 'decided':
          return NextResponse.json({ error: 'Bu öneri zaten karara bağlanmış.' }, { status: 409 });
      }
    }
    const result = await approveProposal(id, pid);
    switch (result.status) {
      case 'approved':
        return NextResponse.json({ status: 'approved', revision: result.revision });
      case 'stale':
        return NextResponse.json({ error: `Program değişti; öneri uygulanamadı. ${result.reason}`, stale: true }, { status: 409 });
      case 'missing':
        return NextResponse.json({ error: 'Öneri bulunamadı.' }, { status: 404 });
      case 'decided':
        return NextResponse.json({ error: 'Bu öneri zaten karara bağlanmış.' }, { status: 409 });
      case 'no_program':
        return NextResponse.json({ error: 'Program bulunamadı; silinmiş olabilir.' }, { status: 404 });
      case 'invalid_program':
        return NextResponse.json({ error: 'Program dosyası okunamıyor; önce programı düzelt.' }, { status: 409 });
    }
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Karar kaydedilemedi.' }, { status: failure?.status ?? 502 });
  }
}

import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { setHealthConsent } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { sessionClient } from '@/lib/guards';
import { HEALTH_FIELDS } from '@/lib/schemas/client';
import { readSession } from '@/lib/session';

/** Danışanın ekranda gördüğü parçalar ve metin sürümü de gelir: onay yalnız onları kapsar. */
const bodySchema = v.object({
  granted: v.boolean(),
  fields: v.pipe(v.array(v.picklist(HEALTH_FIELDS)), v.maxLength(HEALTH_FIELDS.length)),
  version: v.pipe(v.string(), v.maxLength(20)),
});

/**
 * Danışanın sağlık verisi onayı ya da onayı geri çekmesi (SPEC §9.4). Yalnız danışanın
 * kendisi verebilir; kimlik adresten değil oturumdan okunur.
 */
export async function POST(request: Request) {
  const session = await readSession();
  if (session?.role !== 'client') return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });

  const body = v.safeParse(bodySchema, await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'İstek geçersiz.' }, { status: 400 });

  try {
    const client = await sessionClient(session);
    if (!client) return NextResponse.json({ error: 'Oturumun kapanmış. Yeniden giriş yap.' }, { status: 401 });
    await setHealthConsent(client.id, body.output);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: failure?.message ?? 'Onay kaydedilemedi.' }, { status: failure?.status ?? 502 });
  }
}

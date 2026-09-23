import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { INVITE_CODE_LENGTH, normalizeInviteCode } from '@/lib/client-status';
import { isKnownClient, redeemInvite } from '@/lib/clients';
import { clientIdSchema } from '@/lib/schemas/client';
import { createSession } from '@/lib/session';

const bodySchema = v.object({ clientId: v.string(), code: v.string() });

const REASONS: Record<string, string> = {
  invalid: 'Kod yanlış. Antrenörünün verdiği kodu kontrol et.',
  locked: 'Çok fazla yanlış deneme oldu. Antrenöründen yeni bir kod iste.',
  used: 'Bu kod daha önce kullanılmış. Antrenöründen yeni bir kod iste.',
  expired: 'Kodun süresi dolmuş. Antrenöründen yeni bir kod iste.',
  none: 'Geçerli bir davet bulunamadı. Antrenöründen yeni bir kod iste.',
  archived: 'Bu hesap kapalı. Antrenörünle görüş.',
};

/**
 * Danışan girişi: davet kodunu kullanır ve imzalı, httpOnly oturum çerezi yazar (SPEC §5).
 * Kod GET ile değil POST ile kullanılır: mesajlaşma uygulamalarının bağlantı önizlemesi
 * kodu tüketmesin. Bilinmeyen kimlik ile davetsiz danışan aynı yanıtı alır.
 */
export async function POST(request: Request) {
  const body = v.safeParse(bodySchema, await request.json().catch(() => null));
  const code = body.success ? normalizeInviteCode(body.output.code) : '';
  if (!body.success || !v.is(clientIdSchema, body.output.clientId)) {
    return NextResponse.json({ error: REASONS.none }, { status: 400 });
  }
  if (!new RegExp(`^\\d{${INVITE_CODE_LENGTH}}$`).test(code)) {
    return NextResponse.json({ error: 'Kod 8 haneli olmalı.', fields: { code: 'Kod 8 haneli olmalı.' } }, { status: 400 });
  }

  try {
    // Listede olmayan kimlik GitHub'a hiç gitmez; davetsiz danışanla aynı yanıtı alır.
    if (!(await isKnownClient(body.output.clientId))) return NextResponse.json({ error: REASONS.none }, { status: 410 });
    const result = await redeemInvite(body.output.clientId, code);
    if (!result.ok) {
      const status = result.reason === 'invalid' ? 401 : 410;
      return NextResponse.json({ error: REASONS[result.reason] }, { status });
    }
    await createSession({ role: 'client', clientId: result.client.id, accessVersion: result.client.access.version });
    return NextResponse.json({ ok: true });
  } catch {
    // GitHub'a ulaşılamadı ya da istek sınırı doldu: "kod yanlış" denmez, deneme sayılmaz.
    return NextResponse.json({ error: 'Şu an giriş yapılamıyor. Biraz sonra tekrar dene.' }, { status: 502 });
  }
}

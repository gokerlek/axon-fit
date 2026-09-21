import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { serverEnv } from '@/lib/env';
import { generateOtp, issueOtpChallenge } from '@/lib/session';
import { sendOtpEmail } from '@/lib/mail';
import { kodIsteSchema, OTP_LENGTH } from '@/lib/schemas/auth';

/**
 * Giriş kodu gönderir. Yanıt her zaman aynıdır: adresin yönetici adresi olup olmadığı
 * dışarıdan anlaşılmaz. Eşleşmeyen adres için de çerez kurulur (içindeki kod atılır),
 * böylece Set-Cookie farkından da bilgi sızmaz.
 */
export async function POST(request: Request) {
  const parsed = v.safeParse(kodIsteSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçerli bir e-posta adresi yaz.' }, { status: 400 });
  }

  const { email } = parsed.output;
  const code = generateOtp();
  await issueOtpChallenge(email, code);

  if (email === serverEnv().ptEmail) {
    await sendOtpEmail(email, code);
  }

  return NextResponse.json({ ok: true, length: OTP_LENGTH });
}

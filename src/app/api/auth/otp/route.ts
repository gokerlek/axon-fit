import { after, NextResponse } from 'next/server';
import * as v from 'valibot';
import { emailLoginEnabled } from '@/lib/env';
import { GithubError } from '@/lib/github/client';
import { sendOtpEmail } from '@/lib/mail';
import { requestCodeSchema, OTP_LENGTH } from '@/lib/schemas/auth';
import { issueLoginCode, startOtpChallenge } from '@/lib/session';

/**
 * Giriş kodu gönderir (yedek yol; `RESEND_API_KEY` yoksa bu uç yoktur, SPEC §2). Yanıt her
 * zaman aynıdır: adresin yönetici adresi olup olmadığı, oran sınırına takılıp takılmadığı ya
 * da gönderimin tutup tutmadığı dışarıdan anlaşılmaz. Çerez her adrese kurulur, böylece
 * Set-Cookie farkından da bilgi sızmaz. GitHub ve e-posta işi yanıttan SONRA çalışır (`after`):
 * yanıtın süresi de adresi ele vermez.
 */
export async function POST(request: Request) {
  if (!emailLoginEnabled()) return new NextResponse(null, { status: 404 });

  const parsed = v.safeParse(requestCodeSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçerli bir e-posta adresi yaz.' }, { status: 400 });
  }

  const { email } = parsed.output;
  await startOtpChallenge(email);
  after(async () => {
    try {
      const code = await issueLoginCode(email);
      if (code) await sendOtpEmail(email, code);
    } catch (error) {
      // Günlüğe ne kod ne adres yazılır; yalnız sebep (ör. veri repo'su açık ya da fork).
      const reason = error instanceof GithubError ? `GitHub ${error.status} — ${error.message}` : 'e-posta gönderilemedi.';
      console.error(`[giris] giriş kodu gönderilemedi: ${reason}`);
    }
  });

  return NextResponse.json({ ok: true, length: OTP_LENGTH });
}

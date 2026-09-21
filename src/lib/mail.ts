import 'server-only';
import { serverEnv } from './env';

/**
 * Giriş kodu e-postası. Resend anahtarı yoksa (yerel geliştirme) kod sunucu
 * günlüğüne yazılır — asla HTTP yanıtına konmaz.
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const env = serverEnv();

  if (!env.resendApiKey) {
    console.info(`[giris] ${email} için giriş kodu: ${code}`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? 'PulseCoach <onboarding@resend.dev>',
      to: email,
      subject: `Giriş kodun: ${code}`,
      text: `Giriş kodun: ${code}\n\nKod 5 dakika geçerli ve tek kullanımlıktır. Bu isteği sen yapmadıysan yok sayabilirsin.`,
    }),
  });

  if (!response.ok) {
    // Kod gövdeye yazılmaz; yalnız durum kodu günlüğe düşer.
    console.error(`[giris] e-posta gönderilemedi: ${response.status}`);
    throw new Error('mail_gonderilemedi');
  }
}

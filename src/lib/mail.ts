import 'server-only';
import { serverEnv } from './env';

/**
 * Giriş kodu e-postası. Yalnız yedek e-posta yolu açıkken (`RESEND_API_KEY`) çağrılır; kod
 * hiçbir koşulda günlüğe ya da HTTP yanıtına yazılmaz (yerel geliştirmede `/api/dev/login`).
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const env = serverEnv();

  if (!env.resendApiKey) throw new Error('RESEND_API_KEY tanımlı değil: e-posta yolu kapalı.');

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

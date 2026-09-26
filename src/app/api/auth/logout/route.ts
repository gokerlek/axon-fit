import { NextResponse } from 'next/server';
import { logoutPath } from '@/app/giris/login-screen';
import { hasPassword } from '@/lib/client-status';
import { endSession, readClientSession, sessionClient } from '@/lib/session';

/**
 * Oturumu kapatır — yalnız istenen rolün: PT'nin çıkışı danışan oturumunu (aynı tarayıcıda
 * başka sekmede) kapatmaz, danışanınki de PT'ninkini. Danışan formu `rol=danisan` gönderir;
 * rol yoksa PT. POST: bir bağlantıya tıklanarak ya da önizlemeyle yanlışlıkla tetiklenmesin.
 *
 * Danışan `/giris`'e döner (SPEC §5): kimlik telefonda da saklı (`localStorage`, çıkış silmez);
 * adreste de taşınır ki depo kapalı tarayıcıda da girilebilsin. Adres şifre durumunu da taşır: açan
 * şifresi yoksa (hiç belirlememiş, kare kodla sıfırlanmış, kilitlenmiş ya da erişimi kapanmış) sayfa
 * çıkış onayıyla aynı şeyi söyler, yeni kare kod ister ve şifre kutusunu göstermez. Kayıt okunamazsa
 * bilgi taşınmaz; çıkış yine yapılır.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const role = form?.get('rol') === 'danisan' ? 'client' : 'pt';
  if (role === 'pt') {
    await endSession('pt');
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  }
  const session = await readClientSession();
  let password: boolean | null = null;
  if (session) {
    const client = await sessionClient(session).catch(() => undefined);
    if (client !== undefined) password = client ? hasPassword(client.access) : false;
  }
  await endSession('client');
  return NextResponse.redirect(new URL(logoutPath(session?.clientId ?? null, password), request.url), { status: 303 });
}

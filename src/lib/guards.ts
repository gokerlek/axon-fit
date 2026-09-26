import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginPath, PATH_HEADER } from './navigation';
import type { Client } from './schemas/client';
import { readClientSession, readPtSession, sessionClient, type ClientSession, type PtSession } from './session';

/**
 * Rol ayrımı (SPEC §5).
 *
 * PT alanı `/dashboard/**`, danışan alanı `/me/**`. İki rolün oturumu ayrı çerezdedir: aynı
 * tarayıcıda PT ve danışan oturumu yan yana açık kalabilir. Oturumu olmayan kendi giriş
 * sayfasına gider — öteki rolün oturumu olsa da (PT çıkış yapınca danışan sekmesi açık
 * kalabilir; 404 değil giriş sayfası görmeli). PT verisi zaten oturumsuz okunamaz.
 *
 * Her SAYFA kendisi çağırır, layout'taki kontrol yetmez: Next 16'da layout kardeş sayfanın
 * çalışmasını durdurmaz, sayfanın okuduğu veri RSC yanıtına girer (bkz. Next'in kimlik
 * doğrulama rehberi, "Layouts and auth checks").
 */

/** PT oturumu; yoksa girişe, istenen sayfa dönüş yolu olarak (`/login?next=…`, yalnız `/dashboard` altı). */
export async function requirePt(): Promise<PtSession> {
  const session = await readPtSession();
  if (!session) redirect(loginPath((await headers()).get(PATH_HEADER)));
  return session;
}

export async function requireClient(): Promise<ClientSession> {
  const session = await readClientSession();
  if (!session) redirect('/giris');
  return session;
}

/**
 * Kayıtla doğrulanan danışan oturumu `session.ts`'te, çünkü iki role açık okuma uçları da
 * (`readAnySession`) aynı kontrolden geçer; danışan uçları buradan da alabilir.
 */
export { sessionClient };

/** Danışan sayfalarının kapısı: geçerli kayıt yoksa girişe, nedeniyle birlikte. */
export async function currentClient(): Promise<Client> {
  const client = await sessionClient(await requireClient());
  if (!client) redirect('/join?error=erisim');
  return client;
}

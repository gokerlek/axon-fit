import 'server-only';
import { redirect } from 'next/navigation';
import { readClient } from './clients';
import type { Client } from './schemas/client';
import { readClientSession, readPtSession, type ClientSession, type PtSession } from './session';

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

export async function requirePt(): Promise<PtSession> {
  const session = await readPtSession();
  if (!session) redirect('/login');
  return session;
}

export async function requireClient(): Promise<ClientSession> {
  const session = await readClientSession();
  if (!session) redirect('/join');
  return session;
}

/**
 * Oturumun hâlâ geçerli olduğu danışan kaydı ya da null. Çerez imzalı olsa da tek başına
 * yetmez: PT erişimi kapattıysa (kuşak arttı), danışanı arşivlediyse ya da sildiyse
 * oturum düşer. GitHub'a ulaşılamazsa hata fırlar — "erişimin kapandı" denmez.
 */
export async function sessionClient(session: ClientSession): Promise<Client | null> {
  const stored = await readClient(session.clientId);
  if (!stored) return null;
  const { client } = stored;
  if (client.status === 'archived' || client.access.version !== session.accessVersion) return null;
  return client;
}

/** Danışan sayfalarının kapısı: geçerli kayıt yoksa girişe, nedeniyle birlikte. */
export async function currentClient(): Promise<Client> {
  const client = await sessionClient(await requireClient());
  if (!client) redirect('/join?error=erisim');
  return client;
}

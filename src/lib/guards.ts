import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { readClient } from './clients';
import type { Client } from './schemas/client';
import { readSession, type Session } from './session';

/**
 * Rol ayrımı (SPEC §5).
 *
 * PT alanı `/dashboard/**`, danışan alanı `/me/**`. Yanlış roldeki ziyaretçiye yönlendirme
 * DEĞİL, 404 döner: danışan PT ekranlarının varlığını bile görmez.
 *
 * Her SAYFA kendisi çağırır, layout'taki kontrol yetmez: Next 16'da layout kardeş sayfanın
 * çalışmasını durdurmaz, sayfanın okuduğu veri RSC yanıtına girer (bkz. Next'in kimlik
 * doğrulama rehberi, "Layouts and auth checks").
 */

export async function requirePt(): Promise<Extract<Session, { role: 'pt' }>> {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'pt') notFound();
  return session;
}

export async function requireClient(): Promise<Extract<Session, { role: 'client' }>> {
  const session = await readSession();
  if (!session) redirect('/join');
  if (session.role !== 'client') notFound();
  return session;
}

/**
 * Oturumun hâlâ geçerli olduğu danışan kaydı ya da null. Çerez imzalı olsa da tek başına
 * yetmez: PT erişimi kapattıysa (kuşak arttı), danışanı arşivlediyse ya da sildiyse
 * oturum düşer. GitHub'a ulaşılamazsa hata fırlar — "erişimin kapandı" denmez.
 */
export async function sessionClient(session: Extract<Session, { role: 'client' }>): Promise<Client | null> {
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

import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { readSession, type Session } from './session';

/**
 * Rol ayrımı (SPEC §5).
 *
 * PT alanı `/dashboard/**`, danışan alanı `/me/**`. Yanlış roldeki ziyaretçiye yönlendirme
 * DEĞİL, 404 döner: danışan PT ekranlarının varlığını bile görmez.
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

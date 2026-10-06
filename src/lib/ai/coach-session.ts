import 'server-only';
import { readClientSession, sessionClient } from '@/lib/session';
export async function coachClientSession() {
  const session = await readClientSession();
  return session && await sessionClient(session) ? session : null;
}

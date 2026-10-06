import 'server-only';
import { serverEnv } from '@/lib/env';
import { clientRepoName, gh, owner } from '@/lib/github/client';
import { readJson, writeJson } from '@/lib/github/files';
import { resolveKey, saveKey, type KeyStore } from './credentials';
import { geminiApiKey } from './gemini-key';

function clientKeyStore(clientId: string) {
  const env = serverEnv();
  const repo = clientRepoName(clientId);
  const path = 'secrets/coach-gemini.json';
  const store: KeyStore = {
    checkPrivate: async () => {
      const response = await gh().rest.repos.get({ owner: owner(), repo });
      if (!response.data.private || response.data.fork) throw new Error('Danışanın veri reposu özel ve bağımsız olmalı.');
    },
    read: () => readJson(repo, path),
    write: async (record, sha) => { await writeJson(repo, path, record, { sha, message: 'Danışanın AI bağlantısı güncellendi' }); },
  };
  return { store, context: { secret: env.authSecret, owner: env.owner, repo } };
}
export async function ownCoachKey(clientId: string) {
  const { store, context } = clientKeyStore(clientId);
  return (await resolveKey(store, context)).key;
}
export async function setOwnCoachKey(clientId: string, key: string | null) {
  const { store, context } = clientKeyStore(clientId);
  await saveKey(store, context, key);
}
/** PT questions never spend a client's key. Client questions prefer the client's optional key. */
export async function coachingKey(clientId: string, role: 'pt' | 'client') {
  if (role === 'client') {
    const own = await ownCoachKey(clientId);
    if (own) return { key: own, source: 'client' as const };
  }
  const key = await geminiApiKey();
  return { key, source: key ? 'pt' as const : null };
}

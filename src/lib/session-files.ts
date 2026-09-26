import 'server-only';
import { revalidateTag } from 'next/cache';
import { readAppConfig } from './config';
import { clientRepoName, sessionWriter } from './github/client';
import { commitFiles, listFolder, readBlobJson, readJson, repoHead, writeJson } from './github/files';
import { SESSIONS_DIR } from './schemas/session';
import type { SessionRepo } from './session-files-core';
import type { SessionRouteDeps } from './session-routes';
import { readClientSession, sessionClient } from './session';

/**
 * Antrenman dosyaları — GitHub'a ve Next'e bağlama. Akışlar `session-files-core.ts`'te, uçların
 * kararları `session-routes.ts`'te (orada test edilir); burası yalnız danışanın repo'sunu, seans
 * yazıcısını (`sessionWriter`: 409/429'da yeniden denemez, sınırda beklemez), saat dilimini ve önbellek
 * etiketini verir. Yalnız `client-` repolarına dokunur (`clientRepoName` + `assertRepoAllowed`).
 */

export function sessionRepo(clientId: string): SessionRepo {
  const repo = clientRepoName(clientId);
  const api = sessionWriter();
  return {
    head: () => repoHead(repo, api),
    read: (path, ref) => readJson<unknown>(repo, path, { ref, api }),
    readBlob: (sha) => readBlobJson(repo, sha, api),
    listSessions: (tree) => listFolder(repo, tree, SESSIONS_DIR, api),
    write: (path, content, options) => writeJson(repo, path, content, { ...options, api }),
    commit: (input) => commitFiles(repo, input, api),
    invalidate: (id) => revalidateTag(`session:${id}`, { expire: 0 }),
    log: (message) => console.error(message),
  };
}

/** İsteğin ortamı: oturum (çerezden), kayıtla doğrulama, depo, uygulamanın saat dilimi. */
export async function sessionRouteDeps(): Promise<SessionRouteDeps> {
  return {
    session: await readClientSession(),
    loadClient: sessionClient,
    repo: sessionRepo,
    timeZone: async () => (await readAppConfig()).timeZone,
    now: () => new Date(),
    log: (message) => console.error(message),
  };
}

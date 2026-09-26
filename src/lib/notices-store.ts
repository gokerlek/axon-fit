import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import * as v from 'valibot';
import { readClient } from './client-record';
import { canRecordHealth } from './client-status';
import { clientRepoName, GithubError } from './github/client';
import { readJson } from './github/files';
import { clientNotices, sessionHealthOf, type ClientDigest } from './notices';
import { programSchema } from './schemas/program';
import { parseSessionIndex, SESSIONS_INDEX_PATH } from './schemas/session';

/**
 * PT'nin bildirimleri — GitHub'a ve Next'e bağlama. Türetme `notices.ts`'te (saf, test edilir).
 *
 * Genel bakış her açılışta danışan başına dosya okumasın diye danışanın özeti (ad, `inbox.seenAt`,
 * bildirimler) Next'in veri önbelleğindedir (sunucu örnekleri arasında ortak): danışanın bildirim
 * doğuran her yazımında düşer (bitiş, geçmişte düzeltme ve silme: `session-files.ts`; antrenman günleri:
 * `/api/me/schedule`; PT'nin okundu yazımı ve danışan kaydı: `clients.ts`). Elle yapılan değişiklikler
 * için 5 dk üst sınır. Önbellek boşken danışan başına `client.json`, `sessions-index.json`,
 * `program.json`, `proposals.json` ve (onay varsa) `health.json` okunur.
 */

export const noticesTag = (id: string) => `notices-${id}`;

/** Danışanın özetini düşürür: bir sonraki Genel bakış taze okur. */
export function dropNotices(id: string): void {
  revalidateTag(noticesTag(id), { expire: 0 });
}

/** Dosya yoksa ya da bozuk JSON'sa null (tek bozuk dosya listeyi durdurmaz). Ağ ve yetki hataları yukarı çıkar. */
async function readTolerant(repo: string, path: string): Promise<unknown> {
  try {
    return (await readJson<unknown>(repo, path))?.content ?? null;
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) return null;
    throw error;
  }
}

async function buildDigest(id: string): Promise<ClientDigest | null> {
  const stored = await readClient(id);
  if (!stored) return null;
  const { client } = stored;
  const repo = clientRepoName(id);
  // Sağlık ayrıntısı yalnız onay sürdükçe: onay yoksa dosya hiç okunmaz.
  const consent = { pain: canRecordHealth(client, 'check_in'), readiness: canRecordHealth(client, 'readiness') };
  const [indexRaw, programRaw, proposals, healthRaw] = await Promise.all([
    readTolerant(repo, SESSIONS_INDEX_PATH),
    readTolerant(repo, 'program.json'),
    readTolerant(repo, 'proposals.json'),
    consent.pain || consent.readiness ? readTolerant(repo, 'health.json') : Promise.resolve(null),
  ]);
  const program = programRaw === null ? null : v.safeParse(programSchema, programRaw);
  const notices = clientNotices({
    index: indexRaw === null ? null : parseSessionIndex(indexRaw).index,
    log: program?.success ? program.output.log : [],
    proposals,
    health: sessionHealthOf(healthRaw, consent),
    now: new Date(),
  });
  return { id, name: client.name, ...(client.inbox?.seenAt ? { seenAt: client.inbox.seenAt } : {}), notices };
}

/** Danışanın bildirim özeti (önbellekli); kaydı yoksa null. */
export function readClientDigest(id: string): Promise<ClientDigest | null> {
  return unstable_cache(() => buildDigest(id), ['client-notices', id], { tags: [noticesTag(id)], revalidate: 300 })();
}

import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import * as v from 'valibot';
import { attentionFactsOf, constraintFactsOf, screeningFactsOf, type AttentionFacts, type ConstraintFacts } from './attention';
import { readClient } from './client-record';
import { canRecordHealth } from './client-status';
import { readAppConfig } from './config';
import { careInputOf, programConflicts } from './constraint-filter';
import { constraintLogOf } from './constraints';
import { listExercises } from './exercises';
import { todayIn } from './format';
import { clientRepoName, GithubError, sessionWriter } from './github/client';
import { listFolder, readBlobJson, readJson, repoHead } from './github/files';
import { clientNotices, sessionHealthOf, type ClientDigest } from './notices';
import { inviteSchema, type Client } from './schemas/client';
import { healthRecordSchema } from './schemas/health';
import { programSchema } from './schemas/program';
import { SESSIONS_DIR } from './schemas/session';
import { readIndex, type SessionReader } from './session-files-core';

/**
 * PT'nin Genel bakış'ı (bildirimler ve "Dikkat gerektirenler") — GitHub'a ve Next'e bağlama. Türetme
 * `notices.ts` ve `attention.ts`'te (saf, test edilir).
 *
 * Genel bakış her açılışta danışan başına dosya okumasın diye danışanın özeti (ad, `inbox.seenAt`,
 * bildirimler, dikkat özeti) Next'in veri önbelleğindedir (sunucu örnekleri arasında ortak): danışanın
 * bildirim ya da dikkat doğuran her yazımında düşer (bitiş, geçmişte düzeltme ve silme: `session-files.ts`;
 * antrenman günleri: `/api/me/schedule`; PT'nin programı: `programs.ts`; öneri kararları: `proposals-store.ts`;
 * ölçümler: `health.ts`; PT'nin okundu yazımı, danışan kaydı ve davet: `clients.ts`). Elle yapılan
 * değişiklikler için 5 dk üst sınır. Önbellek boşken danışan başına `client.json`, onarılmış index (dalın ucu,
 * `sessions/` ağacı, index'le uyuşmayan dosyalar: bitirilmemiş antrenman da gün sayılsın; set yazımları index'i
 * yazmaz), `program.json`, `proposals.json`, (onay varsa) `health.json` ve (henüz girmemişse) `invite.json` okunur.
 * Zamana bağlı kararlar (kaçan gün, evrenin bitişi) önbellekte değil, sayfa açılınca verilir.
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

/**
 * Onarılmış index için yalnız okuyan depo (`session-files.ts`'in `sessionRepo`'su gibi; o bu modülü içe aktardığı
 * için döngü olmasın diye burada). Eksik ya da bozuk index boş sayılır ve dosyalardan kurulur; ağ ve yetki hataları
 * yukarı çıkar.
 */
function sessionReader(repo: string): SessionReader {
  const api = sessionWriter();
  return {
    head: () => repoHead(repo, api),
    read: (path, ref) => readJson<unknown>(repo, path, { ref, api }),
    readBlob: (sha) => readBlobJson(repo, sha, api),
    listSessions: (tree) => listFolder(repo, tree, SESSIONS_DIR, api),
    log: (message) => console.error(message),
  };
}

/** Giriş yapmış (ve erişimi sonradan kapatılmamış) danışanın davet dosyası okunmaz. */
function joined(client: Pick<Client, 'access'>): boolean {
  const { lastJoinAt, revokedAt } = client.access;
  return Boolean(lastJoinAt && !(revokedAt && revokedAt > lastJoinAt));
}

export type ClientOverview = ClientDigest & { attention: AttentionFacts };

async function buildDigest(id: string): Promise<ClientOverview | null> {
  const stored = await readClient(id);
  if (!stored) return null;
  const { client } = stored;
  const repo = clientRepoName(id);
  // Sağlık ayrıntısı, ölçümler, kısıtlar ve tarama yalnız o parçanın onayı sürdükçe: hiçbiri yoksa dosya hiç okunmaz.
  const consent = {
    pain: canRecordHealth(client, 'check_in'),
    readiness: canRecordHealth(client, 'readiness'),
    measurements: canRecordHealth(client, 'measurements'),
    conditions: canRecordHealth(client, 'conditions'),
    screening: canRecordHealth(client, 'screening'),
  };
  const anyHealth = Object.values(consent).some(Boolean);
  const [repaired, programRaw, proposals, healthRaw, inviteRaw] = await Promise.all([
    readIndex(sessionReader(repo)),
    readTolerant(repo, 'program.json'),
    readTolerant(repo, 'proposals.json'),
    anyHealth ? readTolerant(repo, 'health.json') : Promise.resolve(null),
    joined(client) ? Promise.resolve(null) : readTolerant(repo, 'invite.json'),
  ]);
  const program = programRaw === null ? null : v.safeParse(programSchema, programRaw);
  const index = repaired.index;
  const now = new Date();
  const parsedHealth = healthRaw !== null ? v.safeParse(healthRecordSchema, healthRaw) : null;
  const record = parsedHealth?.success ? parsedHealth.output : null;
  const notices = clientNotices({
    index,
    log: program?.success ? program.output.log : [],
    proposals,
    health: sessionHealthOf(healthRaw, consent),
    constraintLog: consent.conditions && record ? constraintLogOf(record) : [],
    now,
  });
  const invite = inviteRaw === null ? null : v.safeParse(inviteSchema, inviteRaw);
  const programOk = program?.success ? program.output : null;
  let constraints: ConstraintFacts | null = null;
  if (consent.conditions && record) {
    // Çelişkiler için kütüphanenin etiketleri: yalnız etkin kısıt ve program varken okunur.
    const input = careInputOf(record, { today: todayIn((await readAppConfig()).timeZone, now), painConsent: consent.pain });
    const conflicts =
      programOk && input.active.length > 0
        ? programConflicts(programOk, new Map((await listExercises()).map((exercise) => [exercise.id, exercise])), input)
        : [];
    constraints = constraintFactsOf(record, conflicts);
  }
  const attention = attentionFactsOf({
    client,
    invite: invite?.success ? invite.output : null,
    index,
    program: programOk,
    proposals,
    // Onay yoksa ya da dosya okunamıyorsa ölçüm, kısıt ve tarama maddesi yok.
    measurements: consent.measurements && record ? record.measurements : null,
    constraints,
    screening: consent.screening && record ? screeningFactsOf(consent.conditions ? record : { ...record, constraints: [] }) : null,
    now,
  });
  return { id, name: client.name, ...(client.inbox?.seenAt ? { seenAt: client.inbox.seenAt } : {}), notices, attention };
}

/** Danışanın Genel bakış özeti (önbellekli): bildirimler ve dikkat özeti; kaydı yoksa null. */
export function readClientDigest(id: string): Promise<ClientOverview | null> {
  return unstable_cache(() => buildDigest(id), ['client-overview', id], { tags: [noticesTag(id)], revalidate: 300 })();
}

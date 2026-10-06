import 'server-only';
import { createHash } from 'node:crypto';
import { coachAccess } from './ai/coach-contract';
import { ASSISTANT_PATH } from './ai/assistant-contract';
import { assistantNotices } from './ai/assistant-notices';
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
import { clientNotices, NOTICE_WINDOW_DAYS, sessionHealthOf, type ClientDigest } from './notices';
import { readOwnProgram, readOwnState, type OwnState } from './own-program-files';
import type { OwnIndex } from './own-program-index';
import type { ProgramLogEntry } from './program-plan';
import { inviteSchema, type Client } from './schemas/client';
import { healthRecordSchema } from './schemas/health';
import { programSchema } from './schemas/program';
import { SESSIONS_DIR } from './schemas/session';
import { readIndex, type OwnReader, type RepoHead } from './session-files-core';

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
function sessionReader(repo: string): OwnReader {
  const api = sessionWriter();
  return {
    head: () => repoHead(repo, api),
    read: (path, ref) => readJson<unknown>(repo, path, { ref, api }),
    readBlob: (sha) => readBlobJson(repo, sha, api),
    listSessions: (tree) => listFolder(repo, tree, SESSIONS_DIR, api),
    listFolder: (tree, folder) => listFolder(repo, tree, folder, api),
    log: (message) => console.error(message),
  };
}

/**
 * Kendi programlar (`docs/design/kendi-program.md` §7.1): onarılmış index ve yalnız danışanın son düzenlemesi
 * pencerede olan paylaşılmış programların geçmişi (program başına okuma yok). Okunamazsa bildirimsiz sürer.
 */
async function ownFacts(reader: OwnReader, head: RepoHead, now: Date): Promise<{ index: OwnIndex | null; logs: Map<string, ProgramLogEntry[]> }> {
  const logs = new Map<string, ProgramLogEntry[]>();
  let state: OwnState;
  try {
    state = await readOwnState(reader, head);
  } catch (error) {
    if (error instanceof GithubError && error.status >= 500) return { index: null, logs };
    throw error;
  }
  const since = now.getTime() - NOTICE_WINDOW_DAYS * 86_400_000;
  const edited = state.index.items.filter((item) => item.shared && item.clientEditedAt && Date.parse(item.clientEditedAt) >= since);
  await Promise.all(
    edited.map(async (item) => {
      const known = state.programs.get(item.id);
      const read = known ? { status: 'ok' as const, program: known } : await readOwnProgram(reader, item.id, head.commit);
      if (read.status === 'ok') logs.set(item.id, read.program.log);
    }),
  );
  return { index: state.index, logs };
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
  const reader = sessionReader(repo);
  const head = await reader.head();
  const now = new Date();
  const [repaired, own, programRaw, proposals, healthRaw, inviteRaw, assistantRaw] = await Promise.all([
    readIndex(reader, head),
    ownFacts(reader, head, now),
    readTolerant(repo, 'program.json'),
    readTolerant(repo, 'proposals.json'),
    anyHealth ? readTolerant(repo, 'health.json') : Promise.resolve(null),
    joined(client) ? Promise.resolve(null) : readTolerant(repo, 'invite.json'),
    coachAccess(client) === 'ready' ? readTolerant(repo, ASSISTANT_PATH) : Promise.resolve(null),
  ]);
  const program = programRaw === null ? null : v.safeParse(programSchema, programRaw);
  const index = repaired.index;
  const parsedHealth = healthRaw !== null ? v.safeParse(healthRecordSchema, healthRaw) : null;
  const record = parsedHealth?.success ? parsedHealth.output : null;
  const notices = clientNotices({
    index,
    log: program?.success ? program.output.log : [],
    proposals,
    health: sessionHealthOf(healthRaw, consent),
    own,
    constraintLog: consent.conditions && record ? constraintLogOf(record) : [],
    now,
  });
  const permission = createHash('sha256').update(JSON.stringify({ status: client.status, modules: client.modules, consents: client.consents })).digest('hex');
  notices.push(...assistantNotices(assistantRaw, permission, own.index, now));
  notices.sort((a, b) => b.at.localeCompare(a.at));
  notices.splice(10);
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
    // Kalıcı seçim kendi programsa günler ve pencere ondan (kendi-program.md §4).
    own: own.index,
  });
  return { id, name: client.name, ...(client.inbox?.seenAt ? { seenAt: client.inbox.seenAt } : {}), notices, attention };
}

/** Danışanın Genel bakış özeti (önbellekli): bildirimler ve dikkat özeti; kaydı yoksa null. */
export function readClientDigest(id: string): Promise<ClientOverview | null> {
  return unstable_cache(() => buildDigest(id), ['client-overview', id], { tags: [noticesTag(id)], revalidate: 300 })();
}

import * as v from 'valibot';
import { postGuard } from './client-auth-routes.ts';
import { todayIn } from './format.ts';
import { GithubError } from './github/errors.ts';
import { checkInPostSchema, healthRecordSchema, type HealthRecord } from './schemas/health.ts';
import { parseStoredSession, type SessionDoc } from './schemas/session.ts';
import {
  afterCandidate,
  afterPromptOf,
  allowedCheckIn,
  asksAnything,
  checkContextOf,
  checkParts,
  withCheckIn,
  type AfterPrompt,
  type CheckContext,
} from './session-check.ts';
import { readIndex, type SessionRepo } from './session-files-core.ts';
import { run, type SessionRouteDeps, type SessionRouteResult } from './session-routes.ts';

/**
 * Yoklama uçları (tasarım §2.2, §2.9; SPEC §7.5) — ince çekirdek, `session-routes.ts`'in kapısıyla (`run`:
 * oturum, taze danışan kaydı, GitHub hataları):
 * - `GET /api/me/check-in`: antrenman başındaki sheet'in girdisi (hangi parçalar soruluyor, ağrı tavanı,
 *   son iki haftanın ağrısı, önceki antrenmanın ağrısı, ağrılı hareketler) ve Bugün'ün antrenman sonrası
 *   kartı (son 24 saatte biten, seans zorluğu henüz olmayan antrenman). `health.json` yalnız bir parça
 *   onaylıysa okunur (gösterim de işlemedir); bozuksa yoklama geçmişsiz sorulur, kayıt yazılamaz.
 * - `POST /api/me/check-in`: cevaplar `health.json`'a; onayın kapsamadığı alanlar atılır, hiçbiri kalmazsa
 *   403. Aynı `sessionId`'li kayıt varsa üstüne yazılır (yeniden gönderim çoğaltmaz); değişiklik yoksa
 *   yazılmaz; çakışmada taze okuyup bir kez daha. Bozuk dosya ezilmez. Commit mesajı genel ("Yoklama
 *   kaydedildi"): değer ve tarih taşımaz, günlüğe de yalnız kimlik yazılır.
 * Seans zorluğu (CR-10) ve süresi antrenman verisidir: `PATCH /api/me/sessions/[id]` (`effort`).
 */

export const HEALTH_PATH = 'health.json';

export type CheckInResponse = CheckContext & {
  /** Uygulamanın saat dilimi (kartın "bugün 18:57'de bitti"si). */
  timeZone: string;
  /** `health.json` okunamadı: geçmişsiz sorulur, yazım reddedilir. */
  broken: boolean;
  /** Bugün'ün antrenman sonrası kartı; yoksa null. */
  after: AfterPrompt | null;
};

const EMPTY_HEALTH: HealthRecord = { conditions: [], checkIns: [], measurements: [], movementScreens: [] };

type HealthFile = { record: HealthRecord; sha: string } | null | 'broken';

/** `health.json`: yoksa null; bozuk JSON ya da şemaya uymuyorsa 'broken' (üzerine yazılmaz). */
async function readHealthFile(repo: SessionRepo): Promise<HealthFile> {
  try {
    const file = await repo.read(HEALTH_PATH);
    if (!file) return null;
    const parsed = v.safeParse(healthRecordSchema, file.content);
    return parsed.success ? { record: parsed.output, sha: file.sha } : 'broken';
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) return 'broken';
    throw error;
  }
}

/** Antrenman sonrası kartın antrenmanı; okunamazsa null (kart çıkmaz, Bugün durmaz). */
async function readDoc(repo: SessionRepo, sha: string): Promise<SessionDoc | null> {
  try {
    const stored = parseStoredSession(await repo.readBlob(sha));
    return stored && stored.status !== 'deleted' ? stored : null;
  } catch {
    return null;
  }
}

export function checkInContextRoute(deps: SessionRouteDeps): Promise<SessionRouteResult> {
  return run(deps, null, 'check-in', async ({ client, repo }) => {
    const parts = checkParts(client);
    const [timeZone, health, repaired] = await Promise.all([
      deps.timeZone(),
      asksAnything(parts) ? readHealthFile(repo) : Promise.resolve(null),
      readIndex(repo),
    ]);
    const now = deps.now();
    if (health === 'broken') deps.log(`[yoklama] ${client.id}: ${HEALTH_PATH} okunamadı.`);
    const candidate = afterCandidate(repaired.index, now);
    const doc = candidate ? await readDoc(repo, candidate.sha) : null;
    const body: CheckInResponse = {
      ...checkContextOf({ parts, record: health && health !== 'broken' ? health.record : null, today: todayIn(timeZone, now) }),
      timeZone,
      broken: health === 'broken',
      after: doc ? afterPromptOf(doc) : null,
    };
    return { status: 200, body };
  });
}

export function checkInPostRoute(deps: SessionRouteDeps, headers: Headers, origin: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, null, 'check-in-post', async ({ client, repo }) => {
    const parsed = v.safeParse(checkInPostSchema, input);
    if (!parsed.success) return { status: 400, body: { error: 'Kayıt geçersiz.' } };
    // Onay her yazımda taze kayıttan (`loadClient`): arayüzdeki denetim tek başına güvence değil.
    const entry = allowedCheckIn(client, parsed.output);
    if (!entry) return { status: 403, body: { error: 'Sağlık kaydı için onayın yok.', reason: 'consent' } };
    const date = todayIn(await deps.timeZone(), deps.now());
    for (let attempt = 0; ; attempt += 1) {
      const file = await readHealthFile(repo);
      if (file === 'broken') {
        deps.log(`[yoklama] ${client.id}: ${HEALTH_PATH} bozuk, yazılmadı.`);
        return { status: 500, body: { error: 'Sağlık kaydın şu an açılamıyor. Antrenörüne haber ver.', reason: 'broken' } };
      }
      const record = file?.record ?? EMPTY_HEALTH;
      const next = withCheckIn(record, { date, entry });
      if (file && next === record) return { status: 200, body: { ok: true, unchanged: true } };
      try {
        await repo.write(HEALTH_PATH, next, { sha: file?.sha, message: 'Yoklama kaydedildi' });
        deps.log(`[yoklama] ${client.id} kaydedildi`);
        return { status: 200, body: { ok: true } };
      } catch (error) {
        if (attempt === 0 && error instanceof GithubError && error.status === 409) continue;
        throw error;
      }
    }
  });
}

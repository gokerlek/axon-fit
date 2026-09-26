import { buildInsights, type HealthParts, type ProgressInsights } from './progress-insights.ts';
import { buildProgressView, digestSession, PROGRESS_MAX_SESSIONS, type ProgressView, type SessionDigest } from './progress.ts';
import type { TrainingExperience } from './schemas/client.ts';
import type { HealthRecord } from './schemas/health.ts';
import { parseStoredSession, type SessionIndexRow } from './schemas/session.ts';
import { readIndex, type SessionRepo } from './session-files-core.ts';
import type { PlanExercise } from './template-plan.ts';
import { parseWaterFile, WATER_PATH } from './water.ts';

/**
 * İlerleme sekmesinin okuma akışı — GitHub ve önbellek dışarıdan verilir (`progress-data.ts` bağlar,
 * testler sahte depo verir: `testing/fake-session-repo.ts`). Hesaplar `progress.ts`'te.
 *
 * - Index her açılışta okunur ve `sessions/` ağacıyla onarılır (`readIndex`, antrenman ekranıyla aynı).
 * - Yalnız bitmiş antrenmanların dosyaları, en yeniden en çok `max` tanesi; blob kimliğiyle ve özet
 *   önbelleğiyle (`digest`). Aynı anda en çok `concurrency` okuma (GitHub'ın ikincil sınırı).
 * - Okunamayan dosya sayfayı durdurmaz: sayılır (`skipped`), grafik ve rekorlar onsuz; sayılar ve
 *   haftalar index'ten olduğu için eksilmez. Index okunamazsa (ağ, yetki) danışana dönük hata.
 * - Grafik bölümü (`progress-insights.ts`): `water.json` bir okuma; `health.json` yalnız onaylı parça
 *   (hazır oluşluk, ağrı, ölçüm) varsa okunur. İkisi de okunamazsa sayfa durmaz, o grafik "okunamadı" der.
 */

export type ProgressLoad = { status: 'ok'; view: ProgressView; insights: ProgressInsights } | { status: 'error'; message: string };

export const PROGRESS_ERROR = 'İlerlemen şu an açılamıyor. Biraz sonra yeniden dene; sürerse antrenörüne haber ver.';

export type ProgressDeps<E extends PlanExercise> = {
  repo: SessionRepo;
  /** Antrenmanın özeti, önbellekten ya da `read` ile (blob kimliği anahtar, `session:<id>` etiket). */
  digest(row: SessionIndexRow, read: () => Promise<SessionDigest | null>): Promise<SessionDigest | null>;
  /** Egzersiz kataloğu ve cihaz adları. */
  catalog(): Promise<{ exercises: readonly E[]; deviceNames: ReadonlyMap<string, string> }>;
  /** Programın haftalık sıklığı (seri hedefi); okunamazsa undefined. */
  weeklyTarget(): Promise<number | undefined>;
  /** Kas payları (`muscles.ts` → `exerciseSetWeights`). */
  setWeightsOf(exercise: E): Partial<Record<string, number>>;
  /** Haftada planlanan antrenman günü (Bugün'deki "bu hafta x/y"nin y'si); okunamazsa undefined. */
  plannedDays?(): Promise<number | undefined>;
  /** Sağlık kaydı (`health.json`); yoksa null. Yalnız onaylı parça varsa çağrılır. */
  health?(): Promise<HealthRecord | null>;
  log(message: string): void;
  max?: number;
  concurrency?: number;
};

/** Sırayı koruyarak, aynı anda en çok `limit` iş. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/** Blob'daki antrenmanın özeti; bitmemiş ya da iz dosyasıysa null. */
async function readDigest(repo: SessionRepo, row: SessionIndexRow): Promise<SessionDigest | null> {
  const stored = parseStoredSession(await repo.readBlob(row.sha));
  return stored && stored.status === 'finished' ? digestSession(stored) : null;
}

/** `water.json`'un dokunuşları; dosya yoksa boş, okunamıyorsa `unavailable`. */
async function readWater(repo: SessionRepo): Promise<ReturnType<typeof parseWaterFile>['file']['taps'] | 'unavailable'> {
  try {
    const file = await repo.read(WATER_PATH);
    return file ? parseWaterFile(file.content).file.taps : [];
  } catch {
    return 'unavailable';
  }
}

const NO_HEALTH: HealthParts = { readiness: false, pain: false, measurements: false };

export async function loadProgressWith<E extends PlanExercise>(
  deps: ProgressDeps<E>,
  client: { id: string; experience?: TrainingExperience | undefined; health?: HealthParts | undefined },
  now: Date,
  today: string,
  timeZone = 'UTC',
): Promise<ProgressLoad> {
  const max = deps.max ?? PROGRESS_MAX_SESSIONS;
  let repaired: Awaited<ReturnType<typeof readIndex>>;
  let catalog: Awaited<ReturnType<ProgressDeps<E>['catalog']>>;
  let weeklyTarget: number | undefined;
  try {
    [repaired, catalog, weeklyTarget] = await Promise.all([readIndex(deps.repo), deps.catalog(), deps.weeklyTarget().catch(() => undefined)]);
  } catch (error) {
    deps.log(`[ilerleme] ${client.id}: ${error instanceof Error ? error.message : String(error)}`);
    return { status: 'error', message: PROGRESS_ERROR };
  }

  const index = repaired.index;
  const finished = index.items
    .filter((row) => row.finishedAt)
    .sort((a, b) => Date.parse(b.startedAt ?? b.date) - Date.parse(a.startedAt ?? a.date) || (a.id < b.id ? 1 : -1));
  const rows = finished.slice(0, max);
  const consent = client.health ?? NO_HEALTH;
  // Antrenman yoksa sayfa boş durumdur: grafik bölümü için hiçbir şey okunmaz. Onaylı parça yoksa sağlık
  // kaydı hiç okunmaz (SPEC §9.4: gösterim de işlemedir).
  const idle = finished.length === 0;
  const wantsHealth = !idle && Boolean(deps.health) && (consent.readiness || consent.pain || consent.measurements);
  const [digests, water, health, plannedDays] = await Promise.all([
    mapLimit(rows, deps.concurrency ?? 6, async (row) => {
      try {
        return await deps.digest(row, () => readDigest(deps.repo, row));
      } catch {
        return null;
      }
    }),
    idle ? Promise.resolve([]) : readWater(deps.repo),
    wantsHealth
      ? deps.health!().catch((error: unknown) => {
          deps.log(`[ilerleme] ${client.id}: sağlık kaydı okunamadı (${error instanceof Error ? error.message : String(error)}).`);
          return 'unavailable' as const;
        })
      : Promise.resolve(null),
    !idle && deps.plannedDays ? deps.plannedDays().catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const read = digests.filter((digest): digest is SessionDigest => digest !== null);
  const skipped = rows.length - read.length;
  if (skipped > 0) deps.log(`[ilerleme] ${client.id}: ${skipped} antrenman dosyası okunamadı.`);

  const view = buildProgressView({
    index,
    digests: read,
    now,
    today,
    experience: client.experience,
    exercises: new Map(catalog.exercises.map((exercise) => [exercise.id, exercise])),
    deviceNames: catalog.deviceNames,
    setWeightsOf: deps.setWeightsOf,
    weeklyTarget,
    skipped,
    truncated: finished.length > rows.length,
  });
  const insights = buildInsights({
    weeks: view.weeks,
    plannedDays,
    firstDate: view.firstDate,
    digests: read,
    index,
    water,
    health,
    consent,
    today,
    timeZone,
  });
  return { status: 'ok', view, insights };
}

import 'server-only';
import { unstable_cache } from 'next/cache';
import { canRecordHealth } from './client-status';
import { listDevices } from './devices';
import { listExercises, type ExerciseWithSource } from './exercises';
import { clientRepoName } from './github/client';
import { readHealth } from './health';
import { exerciseSetWeights } from './muscles';
import { currentPhaseOf } from './program-plan';
import { readProgramFile } from './programs';
import { DIGEST_VERSION } from './progress';
import { loadProgressWith, type ProgressLoad } from './progress-load';
import type { Client } from './schemas/client';
import { sessionRepo } from './session-files';
import { effectiveSchedule, weekTarget } from './training-days';

/**
 * İlerleme sekmesinin verisi — GitHub'a ve Next önbelleğine bağlama; akış `progress-load.ts`'te (orada
 * test edilir), hesaplar `progress.ts`, `muscle-progress.ts` ve `progress-insights.ts`'te.
 *
 * Ucuz okuma (tasarım §4.1): index her açılışta (onarımıyla); antrenman dosyaları blob kimliğiyle
 * (`readBlob`, süreç belleğinde önbellekli) ve özetleri Next'in veri önbelleğinde: anahtar `depo@sha`
 * (dosya değişirse `sha` da değişir, eski özet hiç sunulmaz), etiket `session:<id>` (silme
 * `revalidateTag` ile düşürür). Her antrenman dosyası bir kez okunur; sonraki açılışlarda yalnız yeniler.
 * `water.json` ve program birer okuma; `health.json` yalnız hazır oluşluk, ağrı, ölçüm ya da tarama parçası
 * onaylıysa (onay yoksa hiç okunmaz, SPEC §9.4).
 */
export function loadProgress(
  client: Pick<Client, 'id' | 'training' | 'modules' | 'consents'>,
  now: Date,
  today: string,
  timeZone: string,
): Promise<ProgressLoad> {
  const repoName = clientRepoName(client.id);
  // Program iki şey için bir kez okunur: seri hedefi (haftalık sıklık) ve planlanan gün; okunamazsa ikisi de yok sayılır.
  let program: ReturnType<typeof readProgramFile> | null = null;
  const readProgram = () => (program ??= readProgramFile(client.id)).then((file) => file?.program ?? null);
  return loadProgressWith<ExerciseWithSource>(
    {
      repo: sessionRepo(client.id),
      digest: (row, read) =>
        unstable_cache(read, ['progress-digest', String(DIGEST_VERSION), repoName, row.sha], { tags: [`session:${row.id}`] })(),
      catalog: async () => {
        const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
        return { exercises, deviceNames: new Map(devices.map((device) => [device.id, device.name])) };
      },
      weeklyTarget: async () => {
        const current = await readProgram();
        return current ? currentPhaseOf(current)?.phase.daysPerWeek : undefined;
      },
      // Bugün'deki "bu hafta x/y" ile aynı: danışanın ya da PT'nin seçtiği günler, yoksa haftalık sıklık.
      plannedDays: async () => {
        const current = await readProgram();
        return current ? (weekTarget(effectiveSchedule(current).weekdays, currentPhaseOf(current)?.phase.daysPerWeek) ?? undefined) : undefined;
      },
      health: async () => (await readHealth(client.id))?.record ?? null,
      setWeightsOf: exerciseSetWeights,
      log: (message) => console.error(message),
    },
    {
      id: client.id,
      experience: client.training?.experience,
      health: {
        readiness: canRecordHealth(client, 'readiness'),
        pain: canRecordHealth(client, 'check_in'),
        measurements: canRecordHealth(client, 'measurements'),
        screening: canRecordHealth(client, 'screening'),
      },
    },
    now,
    today,
    timeZone,
  );
}

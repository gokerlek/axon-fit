import 'server-only';
import { unstable_cache } from 'next/cache';
import { listDevices } from './devices';
import { listExercises, type ExerciseWithSource } from './exercises';
import { clientRepoName } from './github/client';
import { exerciseSetWeights } from './muscles';
import { currentPhaseOf } from './program-plan';
import { readProgramFile } from './programs';
import { DIGEST_VERSION } from './progress';
import { loadProgressWith, type ProgressLoad } from './progress-load';
import type { Client } from './schemas/client';
import { sessionRepo } from './session-files';

/**
 * İlerleme sekmesinin verisi — GitHub'a ve Next önbelleğine bağlama; akış `progress-load.ts`'te (orada
 * test edilir), hesaplar `progress.ts`'te.
 *
 * Ucuz okuma (tasarım §4.1): index her açılışta (onarımıyla); antrenman dosyaları blob kimliğiyle
 * (`readBlob`, süreç belleğinde önbellekli) ve özetleri Next'in veri önbelleğinde: anahtar `depo@sha`
 * (dosya değişirse `sha` da değişir, eski özet hiç sunulmaz), etiket `session:<id>` (silme
 * `revalidateTag` ile düşürür). Her antrenman dosyası bir kez okunur; sonraki açılışlarda yalnız yeniler.
 */
export function loadProgress(client: Pick<Client, 'id' | 'training'>, now: Date, today: string): Promise<ProgressLoad> {
  const repoName = clientRepoName(client.id);
  return loadProgressWith<ExerciseWithSource>(
    {
      repo: sessionRepo(client.id),
      digest: (row, read) =>
        unstable_cache(read, ['progress-digest', String(DIGEST_VERSION), repoName, row.sha], { tags: [`session:${row.id}`] })(),
      catalog: async () => {
        const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
        return { exercises, deviceNames: new Map(devices.map((device) => [device.id, device.name])) };
      },
      // Program yalnız haftalık hedef için; okunamazsa hedef yok sayılır.
      weeklyTarget: async () => {
        const program = (await readProgramFile(client.id))?.program;
        return program ? currentPhaseOf(program)?.phase.daysPerWeek : undefined;
      },
      setWeightsOf: exerciseSetWeights,
      log: (message) => console.error(message),
    },
    { id: client.id, experience: client.training?.experience },
    now,
    today,
  );
}

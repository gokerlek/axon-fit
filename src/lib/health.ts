import 'server-only';
import * as v from 'valibot';
import { readClient } from './clients';
import { clientRepoName, GithubError } from './github/client';
import { readJson, writeJson } from './github/files';
import {
  addMeasurements,
  MEASUREMENT_LOCK_INFO,
  measurementLock,
  removeMeasurementDate,
  replaceMeasurements,
  type MeasurementLock,
  type MeasurementValue,
} from './measurement-log';
import type { Sex } from './measurements';
import type { Client } from './schemas/client';
import { healthRecordSchema, type HealthRecord } from './schemas/health';

/**
 * Danışanın sağlık kaydı — `client-<id>` repo'sundaki `health.json` (SPEC §3, §4).
 *
 * Sağlık verisi özel nitelikli kişisel veridir: YALNIZ danışanın kendi repo'suna yazılır,
 * uygulama repo'suna, günlüğe ya da commit mesajına hiçbir değer girmez (mesajlar genel).
 * Her yazma, danışan kaydını taze okuyup modül ve onayı yeniden denetler: arayüzdeki
 * kontrol tek başına güvence değildir. Dosya ilk yazmada boş ama geçerli bir kayıtla oluşur.
 */

export const HEALTH_PATH = 'health.json';

export function emptyHealthRecord(): HealthRecord {
  return { conditions: [], checkIns: [], measurements: [], movementScreens: [] };
}

/**
 * Kayıt ve `sha`, dosya yoksa null. Bozuk dosya 500 fırlatır: üzerine boş kayıt yazılıp
 * veri kaybolmasın, PT sorunu görsün.
 */
export async function readHealth(clientId: string): Promise<{ record: HealthRecord; sha: string } | null> {
  const stored = await readJson<unknown>(clientRepoName(clientId), HEALTH_PATH);
  if (!stored) return null;
  const parsed = v.safeParse(healthRecordSchema, stored.content);
  if (!parsed.success) throw new GithubError(`${HEALTH_PATH} beklenen biçimde değil.`, 500);
  return { record: parsed.output, sha: stored.sha };
}

export type MeasurementsView =
  | { state: 'ok'; record: HealthRecord }
  /** Modül kapalı ya da onay yok: kayıt okunmaz bile. */
  | { state: 'locked'; lock: MeasurementLock }
  /** `health.json` bozuk: ekranda sorun olarak gösterilir. */
  | { state: 'broken'; problem: string };

/**
 * PT ekranları için ölçümler. Kilitliyken dosyaya hiç gidilmez: onay yokken sağlık verisi
 * işlenmez (gösterim de işlemedir). Dosya yoksa boş kayıt.
 */
export async function loadMeasurements(client: Client): Promise<MeasurementsView> {
  const lock = measurementLock(client);
  if (lock) return { state: 'locked', lock };
  try {
    const stored = await readHealth(client.id);
    return { state: 'ok', record: stored?.record ?? emptyHealthRecord() };
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) return { state: 'broken', problem: error.message };
    throw error;
  }
}

/** Ölçümler bu danışan için yazılamıyorsa nedeniyle birlikte 403. */
function assertMeasurementsAllowed(client: Pick<Client, 'modules' | 'consents'>): void {
  const lock = measurementLock(client);
  if (lock) throw new GithubError(`Ölçüm kaydedilemez: ${MEASUREMENT_LOCK_INFO[lock].title.toLocaleLowerCase('tr')}.`, 403);
}

/**
 * Oku → değiştir → yaz, `sha` kilidiyle. Çakışmada (409) taze okuyup bir kez yeniden dener:
 * değişiklikler güne bağlı olduğu için başka bir yazmanın üzerine yeniden uygulamak güvenli.
 */
async function updateMeasurements(
  clientId: string,
  change: (record: HealthRecord) => HealthRecord,
  message: string,
): Promise<HealthRecord> {
  const stored = await readClient(clientId);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  assertMeasurementsAllowed(stored.client);

  const repo = clientRepoName(clientId);
  for (let attempt = 0; ; attempt += 1) {
    const current = await readHealth(clientId);
    const next = change(current?.record ?? emptyHealthRecord());
    try {
      await writeJson(repo, HEALTH_PATH, next, { sha: current?.sha, message });
      return next;
    } catch (error) {
      if (attempt === 0 && error instanceof GithubError && error.status === 409) continue;
      throw error;
    }
  }
}

/** Cinsiyet yalnız bilinmiyorsa yazılır; sonradan başka bir değer gelse de korunur. */
function withSex(record: HealthRecord, sex: Sex | undefined): HealthRecord {
  return sex && !record.sex ? { ...record, sex } : record;
}

/** Güne ölçüm ekler; aynı gün aynı ölçümün aynı tarafı varsa yenisi yerine geçer. */
export async function addMeasurementDay(
  clientId: string,
  input: { date: string; values: readonly MeasurementValue[]; sex?: Sex | undefined },
): Promise<void> {
  await updateMeasurements(
    clientId,
    (record) => ({ ...withSex(record, input.sex), measurements: addMeasurements(record.measurements, input.date, input.values) }),
    'Ölçüm kaydedildi',
  );
}

/** Günün değerlerini verilenlerle değiştirir. O gün kayıt yoksa 404. */
export async function replaceMeasurementDay(
  clientId: string,
  input: { date: string; values: readonly MeasurementValue[]; sex?: Sex | undefined },
): Promise<void> {
  await updateMeasurements(
    clientId,
    (record) => {
      if (!record.measurements.some((entry) => entry.date === input.date)) {
        throw new GithubError('Bu tarihte ölçüm yok; silinmiş olabilir.', 404);
      }
      return { ...withSex(record, input.sex), measurements: replaceMeasurements(record.measurements, input.date, input.values) };
    },
    'Ölçüm güncellendi',
  );
}

/** Günün bütün değerlerini siler. O gün kayıt yoksa 404. */
export async function deleteMeasurementDay(clientId: string, date: string): Promise<void> {
  await updateMeasurements(
    clientId,
    (record) => {
      if (!record.measurements.some((entry) => entry.date === date)) {
        throw new GithubError('Bu tarihte ölçüm yok; zaten silinmiş olabilir.', 404);
      }
      return { ...record, measurements: removeMeasurementDate(record.measurements, date) };
    },
    'Ölçüm silindi',
  );
}

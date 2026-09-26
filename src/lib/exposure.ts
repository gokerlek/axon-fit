import type { TrainingExperience } from './schemas/client.ts';
import type { SessionIndex, SessionIndexRow } from './schemas/session.ts';

/**
 * Hareket deneyimi (exposure) — tasarım `docs/design/antrenman-ekrani.md` §5.2, saf.
 *
 * Kaynak `sessions-index.json`: geçmiş listesi gibi tek okumayla gelir (index satırı her hareketin
 * `full`, `reason`, `stage`, `oneOff` bilgisini taşır). Hesap egzersiz kimliğiyledir: beceri harekete
 * özgüdür (Rutherford & Jones 1986), satır ya da gün değişse de sürer; ağırlık geçmişi ise cihaza göre
 * kalır (SPEC §7.3, `exerciseHistory`).
 *
 * - `sessions`: bitmiş antrenmanlarda en az bir tam yük çalışma seti olan (`full`), "bir defalık"
 *   (`oneOff`) olmayan kayıtların sayısı; aynı antrenmanda iki kez yapılan hareket bir sayılır.
 * - `deloads`: gerekçesi `deload` olan antrenmanlar. Aşama sayımı YALNIZ bununla (rev. 2): `decrease`
 *   (bir seansta bütün setler kaçtı) ve Tanışma'nın ~%5 inişi sayılmaz; Tanışma'da planlanan (`stage:
 *   "intro"`) ve ayar seansı (`calibrate`) da sayılmaz.
 * - Aşama, bu sırayla denenen ilk tutan satırdır (koşullar çakışsa da sonuç tektir):
 *   1. Tanışma: sessions ≤ 3 (Moritani & deVries 1979; Rutherford & Jones 1986; Zourdos 2016; Steele 2017).
 *   2. İleri: ≥ 52 hafta ve ≥ 40 seans (NSCA: ≥ 1 yıl; seans eşiği [sentez]).
 *   3. Orta: deloads ≥ 2 ya da ≥ 8 hafta ya da ≥ 16 seans (NSCA 2–6 ay, ESTC Tablo 17.1 [ikincil];
 *      "2 hafifletme" [sentez], açık soru 14).
 *   4. Başlangıç: geri kalan (Kraemer & Ratamess 2004; Rippetoe & Baker).
 * - Genel deneyim tabanı (açık soru 4): 6 ay+ → Tanışma tek seans (yalnız ayar: hiç kaydı yokken), sonra
 *   en az Başlangıç; 1 yıl+ → aynı, sonra en az Orta. 1 yıl+'da da ilk seans "ağırlığı bul" seansıdır:
 *   kaydı olmayan harekette motor zaten ilk kez önerir [sentez].
 * - Ara: `gapDays ≥ 28` → aşama bir iner (en az Tanışma) ve bu seans ayar seansıdır (`calibrate`:
 *   `recommend.ts` son üst ağırlığın ~%90'ıyla kurar). Detraining'in etkisi dayanaktır (Santos Junior
 *   2021); 28 gün ve %90 [sentez], açık soru 3. İnen aşama ayar seansından hemen sonraki seansın
 *   kararında da sürer (`returning`): ayar seansı zaten nötr olduğundan inişin etkisi dönüşteki ilk
 *   artış kararıdır [sentez].
 *
 * Eşikler tek yerde (`EXPOSURE_TUNING`): PT fork'unda buradan ayarlar; çağıran başka değer de verebilir.
 */

export const STAGES = ['intro', 'novice', 'intermediate', 'advanced'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  intro: 'Tanışma',
  novice: 'Başlangıç',
  intermediate: 'Orta',
  advanced: 'İleri',
};

export type ExposureTuning = {
  /** Tanışma: bitmiş seans sayısı bu sayıya eşit ya da altında. */
  introMaxSessions: number;
  advancedWeeks: number;
  advancedSessions: number;
  intermediateDeloads: number;
  intermediateWeeks: number;
  intermediateSessions: number;
  /** Bu kadar gün ara → aşama bir iner, dönüşteki ilk seans ayar seansı. */
  gapDays: number;
};

export const EXPOSURE_TUNING: Readonly<ExposureTuning> = {
  introMaxSessions: 3,
  advancedWeeks: 52,
  advancedSessions: 40,
  intermediateDeloads: 2,
  intermediateWeeks: 8,
  intermediateSessions: 16,
  gapDays: 28,
};

export type Exposure = {
  exerciseId: string;
  /** Sayılan bitmiş seans (tam yük seti olan, "bir defalık" olmayan). */
  sessions: number;
  firstAt: string | null;
  lastAt: string | null;
  /** İlk seanstan bugüne hafta (kesirli); seans yoksa 0. */
  weeks: number;
  /** Son seanstan bugüne gün (kesirli); seans yoksa null. */
  gapDays: number | null;
  deloads: number;
  lastDeloadAt: string | null;
  /** Yalnız tablodan (taban ve ara uygulanmadan). */
  base: Stage;
  /** Kullanılan aşama: deneyim tabanı, sonra ara inişi. */
  stage: Stage;
  /** Dönüşteki ilk seans: ~%90 ile ayar (kaçırması tıkanma sayılmaz). */
  calibrate: boolean;
  /** Son seans aradan dönüşün ayar seansıydı: aşamanın inişi bu kararda da sürer. */
  returning: boolean;
  /** Bu danışanda Tanışma'nın seans uzunluğu (4: sessions 0–3; deneyimlide 1). */
  introLength: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function rank(stage: Stage): number {
  return STAGES.indexOf(stage);
}

/** İki aşamadan ilerideki. */
export function maxStage(a: Stage, b: Stage): Stage {
  return rank(a) >= rank(b) ? a : b;
}

/** Bir alttaki aşama (en az Tanışma). */
export function lowerStage(stage: Stage): Stage {
  return STAGES[Math.max(0, rank(stage) - 1)] as Stage;
}

/** `stage` en az `min` mi (Orta ve üstü gibi). */
export function stageAtLeast(stage: Stage, min: Stage): boolean {
  return rank(stage) >= rank(min);
}

/** Deneyimin aşama tabanı: yeni ya da girilmemişse yok. */
export function experienceFloor(experience: TrainingExperience | undefined): Stage | null {
  if (experience === 'one_year') return 'intermediate';
  if (experience === 'six_months') return 'novice';
  return null;
}

/** Satırın zamanı: başlangıç; eski satırda yalnız gün. */
function rowTime(row: Pick<SessionIndexRow, 'startedAt' | 'date'>): number {
  const at = Date.parse(row.startedAt ?? `${row.date}T00:00:00.000Z`);
  return Number.isNaN(at) ? 0 : at;
}

/** Tablonun aşaması (§5.2, sırayla ilk tutan). */
export function stageOf(
  counts: Pick<Exposure, 'sessions' | 'weeks' | 'deloads'>,
  tuning: Readonly<ExposureTuning> = EXPOSURE_TUNING,
): Stage {
  if (counts.sessions <= tuning.introMaxSessions) return 'intro';
  if (counts.weeks >= tuning.advancedWeeks && counts.sessions >= tuning.advancedSessions) return 'advanced';
  if (
    counts.deloads >= tuning.intermediateDeloads ||
    counts.weeks >= tuning.intermediateWeeks ||
    counts.sessions >= tuning.intermediateSessions
  ) {
    return 'intermediate';
  }
  return 'novice';
}

/**
 * Hareketin deneyimi. `index` onarılmış `sessions-index.json`; etkin (bitmemiş) antrenman sayılmaz.
 * `experience` danışanın antrenman geçmişi (`client.json` → `training.experience`).
 */
export function exposureOf(
  exerciseId: string,
  index: Pick<SessionIndex, 'items'>,
  now: Date,
  options: { experience?: TrainingExperience | undefined; tuning?: Readonly<ExposureTuning> } = {},
): Exposure {
  const tuning = options.tuning ?? EXPOSURE_TUNING;
  const finished = index.items.filter((row) => row.finishedAt);
  const counted = finished
    .filter((row) => row.exercises.some((item) => item.exerciseId === exerciseId && item.full && !item.oneOff))
    .map(rowTime)
    .sort((a, b) => a - b);
  const deloadTimes = finished
    .filter((row) =>
      row.exercises.some((item) => item.exerciseId === exerciseId && !item.oneOff && item.reason === 'deload' && item.stage !== 'intro'),
    )
    .map(rowTime)
    .sort((a, b) => a - b);

  const first = counted[0];
  const last = counted.at(-1);
  const previous = counted.at(-2);
  const nowMs = now.getTime();
  const sessions = counted.length;
  const weeks = first === undefined ? 0 : Math.max(0, (nowMs - first) / (7 * DAY_MS));
  const gapDays = last === undefined ? null : Math.max(0, (nowMs - last) / DAY_MS);
  const deloads = deloadTimes.length;
  const lastDeload = deloadTimes.at(-1);

  const base = stageOf({ sessions, weeks, deloads }, tuning);
  const floor = experienceFloor(options.experience);
  // Deneyimli danışanda Tanışma yalnız hiç kaydı yokken (ayar), sonra en az taban.
  let stage: Stage = floor ? (sessions === 0 ? 'intro' : maxStage(base, floor)) : base;
  const calibrate = gapDays !== null && gapDays >= tuning.gapDays;
  const returning = !calibrate && last !== undefined && previous !== undefined && (last - previous) / DAY_MS >= tuning.gapDays;
  if (calibrate || returning) stage = lowerStage(stage);

  return {
    exerciseId,
    sessions,
    firstAt: first === undefined ? null : new Date(first).toISOString(),
    lastAt: last === undefined ? null : new Date(last).toISOString(),
    weeks,
    gapDays,
    deloads,
    lastDeloadAt: lastDeload === undefined ? null : new Date(lastDeload).toISOString(),
    base,
    stage,
    calibrate,
    returning,
    introLength: floor ? 1 : tuning.introMaxSessions + 1,
  };
}

/** Günün hareketlerinin deneyimi (kimliğe göre). */
export function exposuresOf(
  exerciseIds: Iterable<string>,
  index: Pick<SessionIndex, 'items'>,
  now: Date,
  options: { experience?: TrainingExperience | undefined; tuning?: Readonly<ExposureTuning> } = {},
): Map<string, Exposure> {
  return new Map([...new Set(exerciseIds)].map((id) => [id, exposureOf(id, index, now, options)]));
}

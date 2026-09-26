import * as v from 'valibot';
import { exposureOf } from './exposure.ts';
import type { SetSuggestion } from './program-feedback.ts';
import type { Proposal } from './proposals.ts';
import { muscleSetsSince, SET_INCREASE_TUNING, setIncreaseCandidates, STALL_REASONS, type SetIncreaseRow } from './recommend.ts';
import type { TrainingExperience } from './schemas/client.ts';
import { healthRecordSchema } from './schemas/health.ts';
import type { FinishFeedback, SessionIndex, SessionIndexRow } from './schemas/session.ts';
import { latestReadinessScore } from './session-check.ts';
import { ROW_ID_PATTERN, type PlanExercise } from './template-plan.ts';
import type { WorkoutDay } from './workout-plan.ts';

/**
 * Algoritmik set artışı önerisinin bağlantısı (tasarım §5.6, §6.1 son satır; SPEC §7.1) — saf. Kurallar
 * `recommend.ts` → `setIncreaseCandidates`'ta; burası girdilerini toplar ve sonucunu bitişe taşır:
 *
 * - **Gün kurulurken** (`GET /api/me/workout`): günün program satırları, hareketlerin deneyimi (`exposureOf`,
 *   bütün index'ten), son 7 günün kesirli setleri (`muscleSetsSince`), bu hafta kas başına verilmiş
 *   algoritmik öneriler (`proposals.json`) ve sağlık onayı varsa son hazır oluşluk (`latestReadinessScore`).
 *   Bugünün antrenmanı da hesaba girer (öneri bu antrenmanın sonunda gösterilir): planlanan setleri haftalık
 *   yüke sayılır; satırın bugünkü planı "aynı ağırlık", iniş ya da hafif günse (`STALL_REASONS`) satır
 *   ilerlemiyor sayılır. İlerleme kanıtı yalnız bitmiş antrenmanlardan: bugünün planlanan artışı sayılmaz.
 *   Aday gün planına yazılır (`WorkoutDay.setIncrease`); yoklama o satırın planını indirirse ya da hazır
 *   oluşluk düşükse telefonda düşer (`session-check.ts` → `adjustDay`).
 * - **Bitişte** telefon adayları "Programını güncelleyelim mi?" maddelerine koyar (`feedbackItems`, seçili,
 *   "Antrenörüne öner"); asla kendiliğinden uygulanmaz, `proposals.json`'a `kind: "algo_sets"` olarak gider,
 *   PT onaylar. Sunucu telefona güvenmez (`verifyAlgoSets`): satıra en çok +1 set; sağlık onayı varsa
 *   `health.json`'daki son hazır oluşluk (bugünün yoklaması dahil) yine 60 ve üstü olmalı.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Algoritmik önerilerin sayıldığı pencere (gün): "kas başına haftada en çok 2 set önerisi". */
export const PROPOSAL_WEEK_DAYS = 7;

/** Hareketin kasları: hedef kaslar (öneri sayımı) ve setin kaslara payı (kesirli set). */
export type SuggestionExercise = Pick<PlanExercise, 'primaryMuscles' | 'secondaryMuscles' | 'stabilizerMuscles'>;

/**
 * Kas başına bu hafta (son 7 gün) verilmiş algoritmik set önerileri (`algo_sets`, kararı ne olursa olsun;
 * hareketin hedef kaslarına). Aynı seansın önerileri sayılmaz: bitişin yeniden denenmesi kendini saymasın.
 */
export function algoProposalsThisWeek(
  items: readonly Pick<Proposal, 'kind' | 'at' | 'exerciseId' | 'sessionId'>[],
  now: Date,
  musclesOf: (exerciseId: string) => readonly string[] | undefined,
  sessionId?: string,
): Record<string, number> {
  const from = now.getTime() - PROPOSAL_WEEK_DAYS * DAY_MS;
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.kind !== 'algo_sets' || item.sessionId === sessionId) continue;
    const at = Date.parse(item.at);
    if (Number.isNaN(at) || at < from || at > now.getTime()) continue;
    for (const muscle of new Set(musclesOf(item.exerciseId) ?? [])) counts[muscle] = (counts[muscle] ?? 0) + 1;
  }
  return counts;
}

/** Günün program satırları (muadil ve eklenen hareketler değil): set artışı yalnız programın satırına önerilir. */
function programRows(day: Pick<WorkoutDay, 'blocks' | 'rows'>): { rowId: string; exerciseId: string; setCount: number }[] {
  return day.blocks.flatMap((block) =>
    block.rows.flatMap((row) => (ROW_ID_PATTERN.test(row.id) && day.rows[row.id] ? [{ rowId: row.id, exerciseId: row.exerciseId, setCount: row.sets.length }] : [])),
  );
}

/** Bugünün antrenmanı index satırı gibi (yalnız haftalık yük için): günün planlanan setleri, "şimdi" bitmiş. */
function todayRow(day: Pick<WorkoutDay, 'blocks' | 'rows'>, now: Date): SessionIndexRow {
  const at = now.toISOString();
  const exercises = programRows(day).flatMap(({ rowId, exerciseId }) => {
    const row = day.rows[rowId];
    return row ? [{ exerciseId, rowId, sets: row.plan.sets.length, full: true }] : [];
  });
  return {
    id: 's_00000000',
    sha: '0'.repeat(40),
    path: '',
    date: at.slice(0, 10),
    startedAt: at,
    finishedAt: at,
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: exercises.reduce((sum, item) => sum + item.sets, 0),
    water: 0,
    exercises,
    notices: [],
  };
}

/**
 * Günün set artışı adayları (§5.6): `setIncreaseCandidates`'ın girdileri toplanır, sonuç bitiş maddesine
 * (`SetSuggestion`) çevrilir. `readinessScore` yalnız sağlık onayı varken verilir (yoksa koşul atlanır).
 * `setWeightsOf`: hareketin setinin kaslara payı (`muscles.ts` → `exerciseSetWeights`; kesirli set).
 */
export function setSuggestionsFor(input: {
  day: Pick<WorkoutDay, 'blocks' | 'rows'>;
  /** Egzersiz kataloğu (kimliğe göre): bugünün ve bu haftaki önerilerin hareketleri. */
  exercises: ReadonlyMap<string, SuggestionExercise>;
  index: Pick<SessionIndex, 'items'>;
  now: Date;
  experience?: TrainingExperience | undefined;
  readinessScore?: number | undefined;
  proposals: readonly Pick<Proposal, 'kind' | 'at' | 'exerciseId' | 'sessionId'>[];
  setWeightsOf: (exercise: SuggestionExercise) => Readonly<Partial<Record<string, number>>>;
  sessionId?: string | undefined;
}): SetSuggestion[] {
  const { day, exercises, now } = input;
  const rows: SetIncreaseRow[] = programRows(day).flatMap(({ rowId, exerciseId, setCount }) => {
    const exercise = exercises.get(exerciseId);
    const row = day.rows[rowId];
    // Bugün "aynı ağırlık", iniş ya da hafif gün: satır ilerlemiyor.
    if (!exercise || !row || STALL_REASONS.has(row.plan.reason)) return [];
    return [
      {
        rowId,
        exerciseId,
        title: row.title,
        setCount,
        primaryMuscles: exercise.primaryMuscles,
        exposure: exposureOf(exerciseId, input.index, now, { experience: input.experience }),
      },
    ];
  });
  if (rows.length === 0) return [];
  // Bugünün planlanan setleri haftalık yüke girer; ilerleme ve deneyim yalnız bitmiş antrenmanlardan.
  const weightsOf = (exerciseId: string) => {
    const exercise = exercises.get(exerciseId);
    return exercise ? input.setWeightsOf(exercise) : null;
  };
  return setIncreaseCandidates({
    rows,
    index: input.index,
    now,
    readinessScore: input.readinessScore,
    muscleSets: muscleSetsSince({ items: [...input.index.items, todayRow(day, now)] }, now, weightsOf),
    proposedThisWeek: algoProposalsThisWeek(input.proposals, now, (exerciseId) => exercises.get(exerciseId)?.primaryMuscles, input.sessionId),
  }).map((candidate) => ({ rowId: candidate.rowId, from: candidate.from, to: candidate.to, why: candidate.why }));
}

/** `health.json`'daki son hazır oluşluk puanı; dosya yoksa, okunamıyorsa ya da hiç yoklama yoksa undefined. */
export function readinessFromHealth(raw: unknown): number | undefined {
  const parsed = raw === null || raw === undefined ? null : v.safeParse(healthRecordSchema, raw);
  return parsed?.success ? latestReadinessScore(parsed.output.checkIns) : undefined;
}

/**
 * Bitişte sunucunun denetimi (telefona güvenilmez): algoritmik set önerisi satıra en çok +1 set olabilir;
 * sağlık onayı varken son hazır oluşluk (`readinessScore`, bugünün yoklaması dahil) 60'ın altındaysa öneri
 * gitmez. Uymayan karar uygulanmaz (`apply: false`); başka maddelere dokunulmaz.
 */
export function verifyAlgoSets(feedback: FinishFeedback | undefined, readinessScore: number | undefined): FinishFeedback | undefined {
  if (!feedback) return feedback;
  const low = readinessScore !== undefined && readinessScore < SET_INCREASE_TUNING.readinessMin;
  let changed = false;
  const items = feedback.items.map((item) => {
    if (item.kind !== 'algo_sets' || !item.apply) return item;
    const valid = item.count !== undefined && item.count.to === item.count.from + 1 && !low;
    if (valid) return item;
    changed = true;
    return { ...item, apply: false };
  });
  return changed ? { ...feedback, items } : feedback;
}

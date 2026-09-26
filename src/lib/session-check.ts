import {
  applyTolerance,
  assessTolerance,
  PAIN_CEILING,
  type Irritability,
  type RedFlagCheck,
  type SymptomDirection,
  type ToleranceAction,
  type ToleranceMode,
  type ToleranceReason,
  type ToleranceResult,
} from './check-in.ts';
import { canRecordHealth } from './client-status.ts';
import { formatKg, formatNumber, formatSignedWithUnit } from './format.ts';
import { percentOfTop, type LoadSpec, type PlannedSet, type SessionPlan, type SetTarget, type SuggestionReason } from './progression.ts';
import { lightenPlan, type Why } from './recommend.ts';
import type { Client } from './schemas/client.ts';
import type { CheckInPost, HealthCheckIn, HealthRecord, Readiness } from './schemas/health.ts';
import type { SessionDoc, SessionIndex, SessionIndexRow } from './schemas/session.ts';
import { durationOf } from './session-index.ts';
import { canonicalJson } from './session-merge.ts';
import type { WorkoutDay, WorkoutRow } from './workout-plan.ts';

/**
 * Seans yoklaması (tasarım §2.2, §2.9, §5.5; SPEC §7.5) — saf. Sağlık modülünün isteğe bağlı parçasıdır:
 * yalnız modül açık ve danışanın güncel onayı o parçayı kapsıyorsa sorulur (`canRecordHealth`), cevaplar
 * yalnız `health.json`'a yazılır. Seans dosyasına sağlık verisi girmez: hafifletme orada nötr
 * `adjust: "lighter"` ve hareketin planındaki nötr gerekçedir.
 *
 * **Antrenman başı (tek ekran, "Bugün atla" ile geçilir):**
 * - Hazır oluşluk (`readiness`): uyku, enerji, kas ağrısı, stres; 1–5, dördünde de 5 en iyi. Puan
 *   (uyku + enerji + kas ağrısı + stres) × 5 = 20–100; v1'in (uyku + enerji + (6 − ağrı) + (6 − stres)) × 5
 *   formülüyle aynıdır (v1'de ağrı ve stresin 5'i en kötüydü). 60'ın altında "Hacmi hafifletelim mi?"
 *   (v1 PRD 4.3); Evet yalnız bugünün planını hafifletir (`recommend.ts` → `lightenPlan`).
 * - Ağrı takibi (`check_in`): son 24 saatin ağrısı (NPRS 0–10), önceki antrenmanda ağrı olduysa "ertesi
 *   sabah geçti mi", semptomun yönü, ne kadar kolay tetiklendiği ve kırmızı bayrak sorusu (her seans
 *   cevaplanır; "hiçbiri" de cevaptır). Ağrı izleme kuralı (Silbernagel 2007; `check-in.ts`) bugünün
 *   planına uygulanır (`applyTolerance`, en son):
 *   - bugünün durumu bütün hareketlere: kırmızı bayrak ya da kola/bacağa yayılan semptom → yük yok,
 *     antrenman başlamaz (`stop`); haftalık ağrı ≥ 2 puan arttı ya da kolay tetikleniyor → artış yok;
 *   - önceki antrenmanın ağrısı (ertesi sabah her zamanki düzeyine dönmedi, seans içi tepesi tavanı aştı)
 *     → son ağırlıktan %15 aşağı; önceki antrenmanda ağrı yapan hareketler adıyla bildirildiyse yalnız
 *     onlara, yoksa hepsine;
 *   - son 7 günde ağrı nedeniyle geçilen ya da ağrılı bildirilen hareket → o harekette artış yok
 *     (`painful_exercise`) [sentez: kuralın hareket başına uygulanması].
 *
 * **Seans dosyasındaki nötr gerekçe** (hareket kaydının `plan.reason`'ı): hazır oluşluk hafifletmesi
 * `lighten` (motor o antrenmanı saymaz: hafifletme o günün planıdır, `session-results.ts`), ağrının yük
 * azaltması `decrease`, artışın geri çekilmesi `hold` (ikisi motorda kalır: ağrı sürerse sonraki yoklama
 * son yapılan ağırlıktan yine azaltır, geçince oradan ilerlenir). `pain_*` kodları seans dosyasına
 * yazılmaz: onay çekilince PT'ye ağrı görünmez. Danışana ayrıntılı gerekçe kartın çipinde (`why`, yalnız
 * telefondaki plan anlık görüntüsünde).
 *
 * **Antrenman sonrası** (§2.9, açık soru 10: Bugün kartı): bitişten 10 dk sonra 24 saate kadar "Antrenman
 * ne kadar zordu?" (CR-10, Borg; Foster'ın seans RPE yöntemi, Haddad 2017) ve süre (önceden dolu). Bunlar
 * antrenman verisidir, seans dosyasına (`effort`) gider; zamanlama sabittir (Haddad 2017: RPE'nin toplama
 * anı sabit tutulur). Ağrı takibi açıksa seans içi en yüksek ağrı ve isteğe bağlı "Hangi harekette?"
 * `health.json`'a.
 */

/* --- tarih --- */

const DAY_MS = 86_400_000;

function dayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
}

/** `date`, `today`'den kaç gün önce (bugün 0). */
function ageOf(date: string, today: string): number {
  return dayIndex(today) - dayIndex(date);
}

/* --- parçalar ve onay --- */

/** Hangi sorular sorulur: hazır oluşluk (`readiness`) ve ağrı takibi (`check_in`), onay ayrı ayrı. */
export type CheckParts = { readiness: boolean; pain: boolean };

export function checkParts(client: Pick<Client, 'modules' | 'consents'>): CheckParts {
  return { readiness: canRecordHealth(client, 'readiness'), pain: canRecordHealth(client, 'check_in') };
}

export function asksAnything(parts: CheckParts): boolean {
  return parts.readiness || parts.pain;
}

/* --- hazır oluşluk --- */

export const READINESS_KEYS = ['sleep', 'energy', 'soreness', 'stress'] as const;
export type ReadinessKey = (typeof READINESS_KEYS)[number];

/** Puan bunun altındaysa "Hacmi hafifletelim mi?" (v1 PRD 4.3: < 60). */
export const LOW_READINESS = 60;

/** Sorular ve cevapların adı (1 → 5, soldan sağa; dördünde de sağdaki en iyi). */
export const READINESS_QUESTIONS: Record<ReadinessKey, { question: string; answers: readonly [string, string, string, string, string] }> = {
  sleep: { question: 'Dün gece nasıl uyudun?', answers: ['Çok kötü', 'Kötü', 'İdare eder', 'İyi', 'Harika'] },
  energy: { question: 'Enerjin nasıl?', answers: ['Bitkin', 'Düşük', 'Normal', 'Yüksek', 'Çok enerjik'] },
  soreness: { question: 'Kaslarında ağrı var mı?', answers: ['Çok yoğun', 'Belirgin', 'Orta', 'Hafif', 'Hiç yok'] },
  stress: { question: 'Stresin nasıl?', answers: ['Çok stresli', 'Yüksek', 'Orta', 'Hafif', 'Sakinim'] },
};

/** Hazır oluşluk puanı, 20–100 (dosya başı). */
export function readinessScore(readiness: Readiness): number {
  return (readiness.sleep + readiness.energy + readiness.soreness + readiness.stress) * 5;
}

export function isLowReadiness(score: number): boolean {
  return score < LOW_READINESS;
}

/** Dört cevap da verildiyse hazır oluşluk; değilse null (puan yarım cevaptan hesaplanmaz). */
export function completeReadiness(partial: Partial<Readiness> | undefined): Readiness | null {
  if (!partial) return null;
  const { sleep, energy, soreness, stress } = partial;
  return sleep && energy && soreness && stress ? { sleep, energy, soreness, stress } : null;
}

/**
 * En son hazır oluşluk puanı: set artışı önerisinin 3. koşulu (tasarım §5.6, `setIncreaseCandidates` →
 * `readinessScore`). En yeni tarihli yoklamadan (aynı günde listede sonraki); hiç yoksa undefined.
 */
export function latestReadinessScore(checkIns: readonly Pick<HealthCheckIn, 'date' | 'readiness'>[]): number | undefined {
  let best: { date: string; score: number } | null = null;
  for (const item of checkIns) {
    if (item.readiness && (!best || item.date >= best.date)) best = { date: item.date, score: readinessScore(item.readiness) };
  }
  return best?.score;
}

/* --- ağrı soruları (danışanın dilinde) --- */

/** NPRS'nin uçları (0–10). */
export const PAIN_SCALE_ENDS = { low: 'Ağrı yok', high: 'Dayanılmaz' } as const;

export const DIRECTION_CHOICES: Record<SymptomDirection, string> = {
  centralizing: 'Azalıyor, merkeze toplanıyor',
  stable: 'Değişmedi',
  peripheralizing: 'Kola ya da bacağa yayılıyor',
};

export const IRRITABILITY_CHOICES: Record<Irritability, string> = {
  low: 'Ara ara, zor tetikleniyor',
  moderate: 'Orta',
  high: 'Sürekli, kolay tetikleniyor',
};

/** Kırmızı bayrak sorusu (Finucane 2020 çerçevesinden seçilmiş dört yeni belirti; `check-in.ts`). */
export const RED_FLAG_CHOICES: Record<RedFlagCheck, string> = {
  none: 'Hayır, hiçbiri',
  new_neuro_deficit: 'Yeni uyuşma ya da güç kaybı',
  bladder_bowel_change: 'İdrar ya da dışkılamada değişiklik',
  night_pain: 'Geceleri uyandıran ağrı',
  new_trauma: 'Yeni düşme ya da darbe',
};

/* --- CR-10 --- */

/**
 * Seans zorluğu, CR-10 (0–10). Adı olan basamaklar Borg CR-10'un Foster uyarlaması (Haddad 2017): 0
 * dinlenme, 1 çok çok kolay, 2 kolay, 3 orta, 4 biraz zor, 5 zor, 7 çok zor, 10 maksimal; 6, 8 ve 9 adsız.
 */
export const CR10_LABELS: Readonly<Partial<Record<number, string>>> = {
  0: 'Dinlenme',
  1: 'Çok çok kolay',
  2: 'Kolay',
  3: 'Orta',
  4: 'Biraz zor',
  5: 'Zor',
  7: 'Çok zor',
  10: 'Maksimal',
};

/** "7 · Çok zor"; adsız basamakta komşularıyla ("6 · Zor ile çok zor arası"). */
export function cr10Text(value: number): string {
  const label = CR10_LABELS[value];
  if (label) return `${formatNumber(value)} · ${label}`;
  const below = [...Array(value).keys()].reverse().find((item) => CR10_LABELS[item]);
  const above = [...Array(11).keys()].find((item) => item > value && CR10_LABELS[item]);
  const lower = below === undefined ? '' : (CR10_LABELS[below] ?? '');
  const upper = above === undefined ? '' : (CR10_LABELS[above] ?? '');
  return `${formatNumber(value)} · ${lower} ile ${upper.toLocaleLowerCase('tr')} arası`;
}

/* --- antrenman başının girdisi (sunucudan) --- */

/** Önceki antrenmanın ağrısı: "ertesi sabah her zamanki düzeyine döndü mü" bunun için sorulur. */
export type PreviousPain = {
  date: string;
  /** Seans içi en yüksek ağrı (antrenman sonrası kart). */
  painPeak?: number;
  /** Ağrı yapan hareketlerin satırları; boşsa ağrı bütün antrenmana. */
  rows: string[];
};

export type CheckContext = {
  /** Uygulamanın saat diliminde bugün. */
  today: string;
  parts: CheckParts;
  /** Ağrı tavanı (`health.json` → `toleranceMode`; varsayılan ağrısız, 3/10). */
  mode: ToleranceMode;
  /** Son 14 günün 24 saatlik ağrıları (haftalık artış kuralı); ağrı takibi yoksa boş. */
  history: { date: string; painBaseline: number }[];
  /** Son 7 günde ağrı bildirilen antrenman; yoksa null ("ertesi sabah döndü mü" sorulmaz). */
  previous: PreviousPain | null;
  /** Son 7 günde ağrı nedeniyle geçilen ya da ağrılı bildirilen satırlar: bugün artış yok. */
  painRows: string[];
};

/** Yoklama kuralının pencereleri: haftalık artış iki hafta, önceki antrenman ve ağrılı hareket bir hafta. */
export const CHECK_WINDOWS = { historyDays: 14, previousDays: 7, painRowDays: 7 } as const;

/**
 * Antrenman başının girdisi, `health.json`'dan (sunucu yalnız onay varken okur). Ağrı takibi kapalıysa
 * ağrı geçmişi hiç çıkmaz (onaysız işlenmez).
 */
export function checkContextOf(input: { parts: CheckParts; record: Pick<HealthRecord, 'checkIns' | 'toleranceMode'> | null; today: string }): CheckContext {
  const { parts, today } = input;
  const base: CheckContext = { today, parts, mode: input.record?.toleranceMode ?? 'pain_free', history: [], previous: null, painRows: [] };
  if (!parts.pain || !input.record) return base;
  const recent = input.record.checkIns.filter((item) => {
    const age = ageOf(item.date, today);
    return age >= 0 && age < CHECK_WINDOWS.historyDays;
  });
  const history = recent.flatMap((item) => (item.painBaseline === undefined ? [] : [{ date: item.date, painBaseline: item.painBaseline }]));

  const week = recent.filter((item) => ageOf(item.date, today) < CHECK_WINDOWS.painRowDays);
  const painRows = [
    ...new Set(week.flatMap((item) => [...(item.skippedRows ?? []).filter((row) => row.reason === 'pain').map((row) => row.rowId), ...(item.painRows ?? [])])),
  ].sort();

  // Önceki antrenman: bir antrenmana bağlı en yeni yoklama (aynı günde listede sonraki).
  let latest: HealthCheckIn | null = null;
  for (const item of recent) {
    if (item.sessionId && ageOf(item.date, today) < CHECK_WINDOWS.previousDays && (!latest || item.date >= latest.date)) latest = item;
  }
  const rows = latest?.painRows ?? [];
  const hurt = latest !== null && ((latest.painPeak ?? 0) > 0 || (latest.painBaseline ?? 0) > 0 || rows.length > 0);
  const previous: PreviousPain | null =
    latest && hurt ? { date: latest.date, ...(latest.painPeak !== undefined ? { painPeak: latest.painPeak } : {}), rows: [...rows] } : null;
  return { ...base, history, previous, painRows };
}

/* --- cevaplar ve karar --- */

export type StartAnswers = {
  readiness?: Partial<Readiness>;
  painBaseline?: number;
  returnedToBaseline?: boolean;
  symptomDirection?: SymptomDirection;
  irritability?: Irritability;
  redFlag?: RedFlagCheck;
};

/**
 * "Başla" ne zaman açılır: hazır oluşluk soruluyorsa dördü de, ağrı soruluyorsa kırmızı bayrak sorusu
 * (her seans cevaplanır). Öteki ağrı soruları isteğe bağlı. "Bugün atla" hep açık.
 */
export function canBegin(parts: CheckParts, answers: StartAnswers): boolean {
  return (!parts.readiness || completeReadiness(answers.readiness) !== null) && (!parts.pain || answers.redFlag !== undefined);
}

export type StartOutcome = {
  /** Hazır oluşluk puanı (soruldu ve dördü de cevaplandıysa). */
  score: number | null;
  /** Puan 60'ın altında: "Hacmi hafifletelim mi?" sorulur. */
  low: boolean;
  /** Bugünün durumu, bütün hareketlere (yük yok, artış yok); ağrı sorulmadıysa null. */
  today: ToleranceResult | null;
  /** Önceki antrenmanın ağrısı (%15 aşağı): `previousRows` boşsa bütün hareketlere. */
  previous: ToleranceResult | null;
  previousRows: string[];
  /** Son 7 günde ağrılı hareketler: artış yok. */
  painRows: string[];
  /** Kırmızı bayrak ya da yayılan semptom: bugün yük yok, antrenman başlamaz. */
  stop: boolean;
};

/** Cevaplardan karar (onay dışı parçalar yok sayılır). */
export function evaluateStart(input: { context: CheckContext; answers: StartAnswers }): StartOutcome {
  const { context, answers } = input;
  const { parts } = context;
  const readiness = parts.readiness ? completeReadiness(answers.readiness) : null;
  const score = readiness ? readinessScore(readiness) : null;
  if (!parts.pain) return { score, low: score !== null && isLowReadiness(score), today: null, previous: null, previousRows: [], painRows: [], stop: false };

  const today = assessTolerance({
    current: {
      date: context.today,
      ...(answers.painBaseline !== undefined ? { painBaseline: answers.painBaseline } : {}),
      ...(answers.symptomDirection ? { symptomDirection: answers.symptomDirection } : {}),
      ...(answers.irritability ? { irritability: answers.irritability } : {}),
      ...(answers.redFlag ? { redFlag: answers.redFlag } : {}),
    },
    history: context.history,
    mode: context.mode,
  });
  // Önceki antrenmanın kuralları geçmişsiz değerlendirilir (haftalık artış bugünün kararında).
  const previous = context.previous
    ? assessTolerance({
        current: {
          date: context.today,
          ...(answers.returnedToBaseline !== undefined ? { returnedToBaseline: answers.returnedToBaseline } : {}),
          ...(context.previous.painPeak !== undefined ? { painPeak: context.previous.painPeak } : {}),
        },
        mode: context.mode,
      })
    : null;
  return {
    score,
    low: score !== null && isLowReadiness(score),
    today,
    previous: previous && previous.action !== 'progress' ? previous : null,
    previousRows: context.previous?.rows ?? [],
    painRows: context.painRows,
    stop: today.action === 'stop',
  };
}

/* --- bugünün planı --- */

const SEVERITY: Record<ToleranceAction, number> = { progress: 0, hold: 1, reduce: 2, stop: 3 };

/** Kararların birleşimi: en ağır karar kazanır, gerekçelerin hepsi kalır (SPEC §7.5). */
export function combineTolerance(results: readonly (ToleranceResult | null)[]): ToleranceResult {
  const reasons = results.flatMap((result) => result?.reasons ?? []);
  reasons.sort((a, b) => SEVERITY[b.action] - SEVERITY[a.action]);
  return { action: reasons[0]?.action ?? 'progress', reasons };
}

const PAINFUL_EXERCISE: ToleranceReason = {
  code: 'painful_exercise',
  action: 'hold',
  message: 'Bu hareket son günlerde ağrı yaptı: artış yok.',
};

/** Satırın kararı: bugünün durumu + (satıra düşüyorsa) önceki antrenmanın ağrısı + ağrılı hareket. */
export function rowTolerance(outcome: StartOutcome, rowId: string): ToleranceResult {
  const previousApplies = outcome.previous !== null && (outcome.previousRows.length === 0 || outcome.previousRows.includes(rowId));
  const painful = outcome.painRows.includes(rowId) ? { action: 'hold' as const, reasons: [PAINFUL_EXERCISE] } : null;
  return combineTolerance([outcome.today, previousApplies ? outcome.previous : null, painful]);
}

/** Satırın setleri (hedefler, yüzdeler, AMRAP): günün bloklarından. */
function setsOf(day: Pick<WorkoutDay, 'blocks'>, rowId: string): SetTarget[] | null {
  for (const block of day.blocks) {
    const row = block.rows.find((item) => item.id === rowId);
    if (row) return row.sets;
  }
  return null;
}

/** Son yapılan: "Önceki" setlerinin en ağırı ve tekrarları; geçmiş yoksa bugünün planı. */
function lastOf(row: Pick<WorkoutRow, 'lastTime' | 'plan' | 'trackingType'>): { weightKg: number; target: number } {
  const weights = row.lastTime.flatMap((set) => (set.kg !== undefined ? [set.kg] : []));
  const weightKg = row.trackingType === 'weight_reps' && weights.length > 0 ? Math.max(...weights) : row.plan.topWeightKg;
  const target = row.lastTime[0]?.value ?? row.plan.sets[0]?.target ?? 0;
  return { weightKg, target };
}

type ToleranceKind = 'none' | 'hold' | 'reduce' | 'unavailable';

/**
 * Planın setleri yeni üst ağırlıkla: yüzdeler, AMRAP ve set seçimi planınkiler kalır (tıkanma
 * hafifletmesinin AMRAP'sız setleri geri gelmez); `keep` verilirse yalnız o setler, `target` verilirse
 * hedefler ondan.
 */
function rescaled(
  plan: SessionPlan,
  sets: readonly SetTarget[],
  spec: LoadSpec,
  topWeightKg: number,
  options: { reason: SuggestionReason; keep?: ReadonlySet<number>; target?: (set: PlannedSet) => number },
): SessionPlan {
  const { keep, target } = options;
  const kept = keep ? plan.sets.filter((set) => keep.has(set.setIndex)) : plan.sets;
  return {
    sets: kept.map((set) => ({
      ...set,
      weightKg: percentOfTop(topWeightKg, sets[set.setIndex]?.loadPct ?? set.loadPct, spec),
      target: target ? target(set) : set.target,
    })),
    topWeightKg,
    reason: options.reason,
  };
}

/**
 * Ağrı kararının plana uygulanması (`applyTolerance`, SPEC §7.5): artışın geri çekilmesinde son ağırlık
 * ve geçen seferki tekrarlar (aralığa kırpılır), azaltmada son ağırlıktan %15 aşağı ve aralığın altı.
 * Gerekçe seans dosyasına nötr yazılır: `hold` ya da `decrease`.
 */
function tolerate(row: WorkoutRow, sets: readonly SetTarget[], tolerance: ToleranceResult): { plan: SessionPlan; kind: ToleranceKind; lastKg: number } {
  const plan = row.plan;
  const last = lastOf(row);
  if (tolerance.action === 'progress' || tolerance.action === 'stop') return { plan, kind: 'none', lastKg: last.weightKg };
  const suggestion = { weightKg: plan.topWeightKg, target: plan.sets[0]?.target ?? 0, reason: plan.reason };
  const result = applyTolerance(suggestion, tolerance, { spec: row.spec, last });
  const min = (set: PlannedSet) => sets[set.setIndex]?.min ?? set.target;
  switch (result.reason) {
    case 'pain_reduce':
      return { plan: rescaled(plan, sets, row.spec, result.weightKg, { reason: 'decrease', target: min }), kind: 'reduce', lastKg: last.weightKg };
    case 'pain_reduce_unavailable':
      return { plan: rescaled(plan, sets, row.spec, result.weightKg, { reason: 'hold', target: min }), kind: 'unavailable', lastKg: last.weightKg };
    case 'pain_hold': {
      // Geçen seferki tekrarlar aralığa kırpılır: aynı yükte kal, üstüne ekleme.
      const previous = new Map(row.lastTime.map((set) => [set.setIndex, set.value]));
      const target = (set: PlannedSet) => {
        const value = previous.get(set.setIndex);
        const range = sets[set.setIndex];
        return value === undefined || !range || set.amrap ? min(set) : Math.min(range.max, Math.max(range.min, value));
      };
      return { plan: rescaled(plan, sets, row.spec, result.weightKg, { reason: 'hold', target }), kind: 'hold', lastKg: last.weightKg };
    }
    default:
      return { plan, kind: 'none', lastKg: last.weightKg };
  }
}

/** Danışana ağrı gerekçesi (kartın çipinin ayrıntısı): kuralın cümlesi danışanın diliyle. */
function painCause(reason: ToleranceReason, outcome: StartOutcome, mode: ToleranceMode): string {
  switch (reason.code) {
    case 'not_back_to_baseline':
      return 'geçen antrenmandan sonraki ağrın ertesi sabah her zamanki düzeyine dönmedi';
    case 'peak_over_ceiling':
      return `geçen antrenmanda ağrın tavanı (${formatNumber(PAIN_CEILING[mode])}/10) aştı`;
    case 'pain_rising_weekly':
      return 'ağrın bu hafta geçen haftaya göre arttı';
    case 'high_irritability':
      return 'ağrın kolay tetikleniyor';
    case 'painful_exercise':
      return 'bu hareket son günlerde ağrı yaptı';
    default:
      return outcome.stop ? 'bugün yük verilmiyor' : reason.message;
  }
}

function sentence(text: string): string {
  return text ? `${text.charAt(0).toLocaleUpperCase('tr')}${text.slice(1)}` : text;
}

/** Hafifletilen ya da ağrıya göre ayarlanan satırın çipi ve açıklaması. */
function whyOf(input: {
  row: WorkoutRow;
  before: SessionPlan;
  after: SessionPlan;
  kind: ToleranceKind;
  lastKg: number;
  lightened: boolean;
  tolerance: ToleranceResult;
  outcome: StartOutcome;
  mode: ToleranceMode;
}): Why {
  const { row, before, after, kind, lastKg, lightened, tolerance } = input;
  const weighted = row.trackingType === 'weight_reps';
  const causes = [...new Set(tolerance.reasons.map((reason) => painCause(reason, input.outcome, input.mode)))];
  const cause = sentence(causes.join('; '));
  const fewer = after.sets.length < before.sets.length;
  const setText = fewer ? `${formatNumber(before.sets.length)} set yerine ${formatNumber(after.sets.length)}` : '';
  const tone: Why['tone'] = after.topWeightKg < before.topWeightKg || fewer ? 'down' : 'hold';

  if (kind === 'reduce') {
    const done = row.lastTime.some((set) => set.kg !== undefined);
    const delta = formatSignedWithUnit(after.topWeightKg - lastKg, 'kg');
    return {
      tone: 'down',
      chip: `Ağrı · ${delta}`,
      detail: `${cause}. Bugün ağırlık ${done ? 'son yaptığın ' : ''}${formatKg(lastKg)} yerine ${formatKg(after.topWeightKg)}${setText ? `, ${setText}` : ''}. Sonraki antrenmanda yoklamana göre yeniden bakılır.`,
    };
  }
  if (lightened) {
    const delta = after.topWeightKg - before.topWeightKg;
    const chip = weighted && delta < 0 ? `Hafif gün · ${formatSignedWithUnit(delta, 'kg')}` : fewer ? 'Hafif gün · bir set az' : 'Hafif gün';
    const parts = [
      weighted && delta < 0 ? `ağırlık ${formatKg(before.topWeightKg)} yerine ${formatKg(after.topWeightKg)}` : '',
      setText,
    ].filter(Boolean);
    const pain = kind === 'hold' || kind === 'unavailable' ? ` ${cause}: bugün artış yok.` : '';
    return {
      tone: 'down',
      chip,
      detail: `Bugün hafif bir gün seçtin${parts.length > 0 ? `: ${parts.join(', ')}` : ''}.${pain} Yalnız bugünün planı değişti; sonraki antrenman planın kendi ağırlığıyla.`,
    };
  }
  if (kind === 'unavailable') {
    return {
      tone,
      chip: row.trackingType === 'duration' ? 'Ağrı · süreyi azalt' : 'Ağrı · tekrarı azalt',
      detail: `${cause}. ${weighted ? 'Ağırlık zaten en hafif ayarda' : 'Bu harekette azaltılacak ağırlık yok'}: bugün aralığın altında kal, gerekirse bir set az yap.`,
    };
  }
  return {
    tone: 'hold',
    chip: weighted ? 'Ağrı · aynı ağırlık' : 'Ağrı · aynı hedef',
    detail: `${cause}. Bugün artış yok: ${weighted ? `${formatKg(after.topWeightKg)} ile` : 'geçen seferki hedefle'} kal.`,
  };
}

export type DayAdjustment = {
  day: WorkoutDay;
  /** Ağırlığı ya da seti azalan satır var: seansa nötr `adjust: "lighter"`. */
  lighter: boolean;
  /** Hazır oluşlukla mı, ağrıyla mı (health.json → `adjustReason`); hafifletme yoksa undefined. */
  adjustReason?: 'readiness' | 'pain';
  /** Planı değişen satırlar. */
  changed: string[];
};

/**
 * Bugünün planı yoklamaya göre (yalnız bugün; programa yazılmaz). Önce ağrı kuralı satır satır
 * (`rowTolerance` → `applyTolerance`), sonra (danışan "Evet, hafiflet" dediyse) hazır oluşluk
 * hafifletmesi (`lightenPlan`); ikisi birlikteyse daha hafif ağırlık ve hafifletmenin set sayısı. Ağrının
 * yük azaltması hafifletmeden önce gelir (gerekçe `decrease`, motorda kalır). Isınma setleri yeni en hafif
 * çalışma setinin altındakilerle sınırlanır. `stop` kararında plan değişmez (antrenman başlamaz).
 */
export function adjustDay(day: WorkoutDay, input: { outcome: StartOutcome; lighten: boolean; mode: ToleranceMode }): DayAdjustment {
  const { outcome, lighten } = input;
  if (outcome.stop) return { day, lighter: false, changed: [] };
  const rows: Record<string, WorkoutRow> = {};
  const changed: string[] = [];
  let reduced = false;
  let lightened = false;
  for (const [rowId, row] of Object.entries(day.rows)) {
    const sets = setsOf(day, rowId);
    if (!sets) {
      rows[rowId] = row;
      continue;
    }
    const tolerance = rowTolerance(outcome, rowId);
    const tolerated = tolerate(row, sets, tolerance);
    let plan = tolerated.plan;
    // Hafifletme satırda bir şey değiştirmiyorsa (iki setli ağırlıksız hareket) plan ve gerekçe olduğu gibi.
    const light = lighten ? lightenPlan(row.plan, sets, row.spec) : null;
    const rowLightened = light !== null && (light.sets.length < row.plan.sets.length || light.topWeightKg < row.plan.topWeightKg);
    if (light && rowLightened) {
      const reason: SuggestionReason = tolerated.kind === 'reduce' ? 'decrease' : light.reason;
      const keep = new Set(light.sets.map((set) => set.setIndex));
      plan = rescaled(plan, sets, row.spec, Math.min(light.topWeightKg, plan.topWeightKg), { reason, keep });
    }
    const same = plan === row.plan;
    if (same) {
      rows[rowId] = row;
      continue;
    }
    changed.push(rowId);
    if (tolerated.kind === 'reduce') reduced = true;
    if (rowLightened) lightened = true;
    const lightest = plan.sets.length > 0 ? Math.min(...plan.sets.map((set) => set.weightKg)) : 0;
    const warmups = row.warmups?.filter((warmup) => warmup.kg < lightest);
    const { warmups: _warmups, ...rest } = row;
    rows[rowId] = {
      ...rest,
      plan,
      ...(warmups && warmups.length > 0 ? { warmups } : {}),
      adjusted: tolerated.kind === 'none' ? 'readiness' : 'pain',
      why: whyOf({
        row,
        before: row.plan,
        after: plan,
        kind: tolerated.kind,
        lastKg: tolerated.lastKg,
        lightened: rowLightened && tolerated.kind !== 'reduce',
        tolerance,
        outcome,
        mode: input.mode,
      }),
    };
  }
  const lighter = reduced || lightened;
  return {
    day: changed.length > 0 ? { ...day, rows } : day,
    lighter,
    ...(reduced ? { adjustReason: 'pain' as const } : lightened ? { adjustReason: 'readiness' as const } : {}),
    changed,
  };
}

/** Seansa nötr hafifletme işareti ve PT'ye `lighter` bildirimi (nedeni yalnız `health.json`'da). */
export function withLighter(doc: SessionDoc, at: string): SessionDoc {
  const notices = doc.notices.some((notice) => notice.kind === 'lighter') ? doc.notices : [...doc.notices, { kind: 'lighter' as const, at }];
  return { ...doc, adjust: 'lighter', notices };
}

/** Antrenman başlamadan: hiç set kaydı yok ve hafifletilmemiş (yoklama yalnız başlangıçta açılır). */
export function isFreshStart(doc: Pick<SessionDoc, 'entries' | 'adjust'>): boolean {
  return doc.adjust === undefined && doc.entries.every((entry) => entry.sets.length === 0);
}

/* --- yazım --- */

/**
 * Antrenman başındaki yazımın gövdesi: onaylı parçaların cevapları (hazır oluşluk yalnız dördü de
 * cevaplandıysa). `stop`'ta antrenman başlamadığı için seansa bağlanmaz. Yazılacak bir şey yoksa null.
 */
export function startCheckInBody(input: {
  parts: CheckParts;
  answers: StartAnswers;
  sessionId?: string | undefined;
  adjustReason?: 'readiness' | 'pain' | undefined;
}): CheckInPost | null {
  const { parts, answers } = input;
  const readiness = parts.readiness ? completeReadiness(answers.readiness) : null;
  const body: CheckInPost = {
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(readiness ? { readiness } : {}),
    ...(parts.pain && answers.painBaseline !== undefined ? { painBaseline: answers.painBaseline } : {}),
    ...(parts.pain && answers.returnedToBaseline !== undefined ? { returnedToBaseline: answers.returnedToBaseline } : {}),
    ...(parts.pain && answers.symptomDirection ? { symptomDirection: answers.symptomDirection } : {}),
    ...(parts.pain && answers.irritability ? { irritability: answers.irritability } : {}),
    ...(parts.pain && answers.redFlag ? { redFlag: answers.redFlag } : {}),
    ...(input.adjustReason ? { adjustReason: input.adjustReason } : {}),
  };
  return Object.keys(body).some((key) => key !== 'sessionId') ? body : null;
}

const READINESS_FIELDS = ['readiness'] as const;
const PAIN_FIELDS = ['painBaseline', 'painPeak', 'returnedToBaseline', 'symptomDirection', 'irritability', 'redFlag', 'painFreeWalkingMin', 'painRows'] as const;

/**
 * Sunucuda: onayın kapsadığı alanlar (istemciye güvenilmez). Hazır oluşluk `readiness`, ağrı alanları
 * `check_in` parçasını ister; hafifletmenin nedeni de nedenin parçasını. Hiçbiri kalmadıysa null (403).
 */
export function allowedCheckIn(client: Pick<Client, 'modules' | 'consents'>, body: CheckInPost): CheckInPost | null {
  const parts = checkParts(client);
  const out: Record<string, unknown> = {};
  if (parts.readiness) for (const key of READINESS_FIELDS) if (body[key] !== undefined) out[key] = body[key];
  if (parts.pain) for (const key of PAIN_FIELDS) if (body[key] !== undefined) out[key] = body[key];
  if (body.adjustReason === 'readiness' ? parts.readiness : body.adjustReason === 'pain' ? parts.pain : false) out.adjustReason = body.adjustReason;
  if (Object.keys(out).length === 0) return null;
  return { ...(body.sessionId ? { sessionId: body.sessionId } : {}), ...out } as CheckInPost;
}

/**
 * Yoklamayı kayda ekler: aynı `sessionId`'li kayıt varsa alanları onun üstüne (tarihi korunur; bitişin
 * `skippedRows`'u ve antrenman sonrası kartın ağrısı aynı kayda biner), antrenmana bağlı değilse aynı
 * günün bağsız kaydına, yoksa yeni kayıt. Kayıt değişmediyse aynı nesne döner (yazma yok).
 */
export function withCheckIn(record: HealthRecord, input: { date: string; entry: CheckInPost }): HealthRecord {
  const { entry } = input;
  const index = record.checkIns.findIndex((item) => (entry.sessionId ? item.sessionId === entry.sessionId : !item.sessionId && item.date === input.date));
  const existing = index >= 0 ? record.checkIns[index] : undefined;
  const next: HealthCheckIn = { ...(existing ?? { date: input.date }), ...entry };
  if (existing && canonicalJson(existing) === canonicalJson(next)) return record;
  const checkIns = existing ? record.checkIns.map((item, position) => (position === index ? next : item)) : [...record.checkIns, next];
  return { ...record, checkIns };
}

/* --- antrenman sonrası (Bugün kartı) --- */

/** Kart bitişten bu kadar sonra açılır (SPEC §4: ~10 dk; açık soru 10)… */
export const AFTER_DELAY_MS = 10 * 60_000;
/** …ve bu kadar süre durur. */
export const AFTER_WINDOW_MS = 24 * 60 * 60_000;

export type AfterPrompt = {
  sessionId: string;
  dayName?: string;
  finishedAt: string;
  /** Önceden dolu süre (dk). */
  durationMin?: number;
  /** "Hangi harekette?" seçenekleri: programın satırları, set yapılanlar. */
  exercises: { rowId: string; title: string }[];
};

/** Kartın adayı: son 24 saatte biten en yeni antrenman (index'ten; seans zorluğunu dosyası söyler). */
export function afterCandidate(index: Pick<SessionIndex, 'items'>, now: Date): SessionIndexRow | null {
  let best: SessionIndexRow | null = null;
  for (const row of index.items) {
    const at = row.finishedAt ? Date.parse(row.finishedAt) : Number.NaN;
    if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > AFTER_WINDOW_MS) continue;
    if (!best || at > Date.parse(best.finishedAt as string)) best = row;
  }
  return best;
}

/** Kart: seans zorluğu henüz yoksa; varsa null (danışan başka cihazda cevapladı). */
export function afterPromptOf(doc: Pick<SessionDoc, 'id' | 'status' | 'startedAt' | 'finishedAt' | 'effort' | 'entries' | 'program'>): AfterPrompt | null {
  if (doc.status !== 'finished' || !doc.finishedAt || doc.effort?.sessionRpe !== undefined) return null;
  const durationMin = durationOf(doc);
  const exercises = doc.entries.flatMap((entry) =>
    entry.rowId && entry.sets.some((set) => set.type === 'working') ? [{ rowId: entry.rowId, title: entry.title }] : [],
  );
  return {
    sessionId: doc.id,
    ...(doc.program?.dayName ? { dayName: doc.program.dayName } : {}),
    finishedAt: doc.finishedAt,
    ...(durationMin !== undefined && durationMin >= 1 ? { durationMin } : {}),
    exercises: exercises.filter((item, position) => exercises.findIndex((other) => other.rowId === item.rowId) === position),
  };
}

/** Kartın durumu şimdi: erken (kalan ms), açık, süresi geçti. */
export function afterState(finishedAt: string, now: number): { state: 'early'; inMs: number } | { state: 'due' } | { state: 'expired' } {
  const at = Date.parse(finishedAt);
  if (Number.isNaN(at) || now - at > AFTER_WINDOW_MS) return { state: 'expired' };
  if (now - at < AFTER_DELAY_MS) return { state: 'early', inMs: at + AFTER_DELAY_MS - now };
  return { state: 'due' };
}

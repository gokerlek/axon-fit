import { stageAtLeast, type Exposure, type Stage } from './exposure.ts';
import { formatKg, formatNumber, formatSignedWithUnit } from './format.ts';
import {
  decreaseWeight,
  DELOAD_FACTOR,
  deloadWeight,
  DURATION_STEP_SECONDS,
  gridOf,
  isFullLoad,
  LIGHTEN_FACTOR,
  percentOfTop,
  planSession,
  plannedSets,
  REASON_LABELS,
  rescalePlan,
  sessionSeries,
  type LoadSpec,
  type ProgressionRule,
  type SeriesSession,
  type SessionPlan,
  type SessionResult,
  type SetTarget,
  type SuggestionReason,
} from './progression.ts';
import type { SessionIndex, SessionIndexRow } from './schemas/session.ts';
import { SET_LIMITS } from './set-plan.ts';

/**
 * Öneri katmanı — tasarım `docs/design/antrenman-ekrani.md` §5.3–5.7, saf.
 *
 * `planSession`'ın üstünde ince katman: motor önce PT'nin satırdaki kuralıyla (`row.rule`: çift ilerleme,
 * doğrusal, ilerlemesiz) ve set düzeniyle plan kurar; katman yalnız hareketin aşamasına (`exposure.ts`)
 * göre onay koşulunu, artış miktarını ve zorluğun etkisini değiştirir. PT'nin kuralı hep kazanır:
 * ilerlemesiz satıra ve set düzenine dokunulmaz, hafifletme ve iniş motorun kuralıyla kalır.
 *
 * | Aşama | Artış koşulu | Miktar | Kaçırma | Zorluk |
 * |---|---|---|---|---|
 * | Tanışma | motor artış der ve tam yük setleri Kolay/İyi | 1 ızgara adımı | biri alt sınırın altında → hemen ~%5 aşağı; tıkanma sayılmaz, hafifletme yok | "Kolay" iki adım vermez |
 * | Başlangıç | motor artışı (tek seans) | `inc(W)` | motor | hepsi Kolay (ya da AMRAP'ta tepe + 3) → 2 × `inc`, üst sınır %10 |
 * | Orta | motor artışı ve serideki önceki seans da aynı ağırlıkta tepede (2-for-2) | `inc(W)` | motor | — |
 * | İleri | Orta ile aynı | 1 ızgara adımı | motor | PT'ye hafifletme ipucu (`deloadHintDue`) |
 *
 * - 2-for-2: NSCA'nın "hedefin 2+ üstü, üst üste 2 seans" kuralı ve ACSM 2009'un "1–2 tekrar üstü, iki
 *   ardışık seans" kuralı; çift ilerlemede bütün setlerde tepeye ulaşmak hedefin üstü sayılır. Tutmazsa
 *   aynı ağırlık, hedef tepe: `confirm_increase`. Ağırlıksızda (vücut ağırlığı, süre) motor aynıdır (+1
 *   tekrar / +5 sn); aşama yalnız "zor varyasyon" önerisine 2-for-2 onayını ekler.
 * - `inc(W)` (§5.4) mutlak yükle: pct = alt vücut bileşiği (squat, hinge, lunge, hip_extension) %5, diğerleri
 *   %2,5 (NSCA artışları [ikincil]; ACSM 2009 %2–10); lo = ızgarada bir sonraki ayar, hi = ızgara.floor(W ×
 *   1,10); sonuç = clamp(ızgara.floor(W × (1 + pct)), lo, hi). Sonuç her zaman cihazda kurulabilen ağırlıktır
 *   (`loadSpecFor` → `gridOf`).
 * - Tek adım %10'dan büyükse (30 kg makinede 5 kg = %17) önce tekrar eklenir: aralık genişletilmeden, bütün
 *   karar setlerinde tepe + 2 tekrara ulaşınca adım atılır (`reps_first`; Plotkin 2022; kural [sentez]).
 * - Ara sonrası ayar seansı (`exposure.calibrate`): son üst ağırlığın ~%90'ı, ızgaraya aşağı (`calibrate`;
 *   açık soru 3 [sentez]). Kaçırması tıkanma sayılmaz (`stallCounts`).
 * - Hafif seans (§5.5) motordan saklanmaz: `planSession` ilk kez nötr (`lighter_retry`), üst üste ikincisini
 *   kaçırma sayar. Tıkanma hafifletmesi −%10, setler ⅔ (`DELOAD_FACTOR`, açık soru 2).
 * - Yoklamanın hafifletmesi (§2.2, `lightenPlan`) yalnız bugünün planıdır: −%15 (`LIGHTEN_FACTOR`), 3 ve üstü
 *   sette son set düşer; gerekçe `lighten`, motor o antrenmanı saymaz.
 * - Set artışı (§5.6) asla kendiliğinden değildir: `setIncreaseCandidates` PT'ye öneri adaylarını döner
 *   (`proposals.json` → `kind: "algo_sets"`).
 *
 * Sayılar tek yerde (`RECOMMEND_TUNING`, `SET_INCREASE_TUNING`): PT fork'unda buradan ayarlar.
 */

export type RecommendTuning = {
  /** Alt vücut bileşik hareketlerde artış (NSCA: alt vücut 2–4 kg, antrenmanlıda 4–7+). */
  lowerBodyPct: number;
  /** Diğer hareketlerde artış (NSCA: üst vücut 1–2 kg). */
  otherPct: number;
  /** Tek artışın üst sınırı (ACSM 2009: %2–10). */
  maxPct: number;
  /** Tek adım sınırı aşınca önce tepenin bu kadar üstüne tekrar [sentez]. */
  repsFirstExtra: number;
  /** Aradan dönüşte ayar seansının ağırlık çarpanı [sentez], açık soru 3. */
  calibrateFactor: number;
};

export const RECOMMEND_TUNING: Readonly<RecommendTuning> = {
  lowerBodyPct: 0.05,
  otherPct: 0.025,
  maxPct: 0.1,
  repsFirstExtra: 2,
  calibrateFactor: 0.9,
};

/** Artışı %5 olan alt vücut kalıpları (bileşik hareketlerde). */
export const LOWER_BODY_PATTERNS: ReadonlySet<string> = new Set(['squat', 'hinge', 'lunge', 'hip_extension']);

export type RecommendExercise = { category: string; pattern?: string | undefined };

const EPSILON = 1e-9;

function clean(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/** Artış yüzdesi (§5.4): alt vücut bileşiği %5, diğerleri %2,5. */
export function increasePct(exercise: RecommendExercise, tuning: Readonly<RecommendTuning> = RECOMMEND_TUNING): number {
  return exercise.category === 'compound' && exercise.pattern !== undefined && LOWER_BODY_PATTERNS.has(exercise.pattern)
    ? tuning.lowerBodyPct
    : tuning.otherPct;
}

export type Increase =
  | { kind: 'step'; weightKg: number }
  /** Tek adım %10'u aşıyor: önce tekrar; `nextKg` sonra atılacak adım. */
  | { kind: 'reps_first'; nextKg: number }
  | { kind: 'device_max' };

/**
 * `inc(W)` (§5.4): artış bir yüktür, fark değil. `factor` 2 ise iki kat (Başlangıç'ta hepsi Kolay): en az
 * iki adım, yine %10 sınırında. Ağırlıksız ya da adımsız alette `null`.
 */
export function increaseTo(
  weightKg: number,
  spec: LoadSpec,
  pct: number,
  options: { factor?: 1 | 2; tuning?: Readonly<RecommendTuning> } = {},
): Increase | null {
  const grid = spec.trackingType === 'weight_reps' ? gridOf(spec) : null;
  if (!grid) return null;
  const tuning = options.tuning ?? RECOMMEND_TUNING;
  const factor = options.factor ?? 1;
  const lo = grid.up(weightKg, 1);
  if (lo <= weightKg + EPSILON) return { kind: 'device_max' };
  const hi = grid.floor(clean(weightKg * (1 + tuning.maxPct)));
  if (lo > hi + EPSILON) return { kind: 'reps_first', nextKg: lo };
  const least = factor === 2 ? grid.up(weightKg, 2) : lo;
  const wanted = grid.floor(clean(weightKg * (1 + factor * pct)));
  return { kind: 'step', weightKg: Math.min(Math.max(wanted, least), hi) };
}

/** Hareket kaydının planı tıkanma sayar mı: Tanışma'da ya da ayar seansında planlanan saymaz (§5.2–5.3). */
export function stallCounts(plan: { reason?: string | undefined; stage?: string | undefined } | undefined): boolean {
  return !(plan?.stage === 'intro' || plan?.reason === 'calibrate');
}

/** Danışana gerekçe (§5.7): başlık altındaki tek satırlık çip ve dokununca açılan metin. */
export type Why = { tone: 'up' | 'down' | 'hold' | 'new'; chip: string; detail: string };

export type Recommendation = {
  plan: SessionPlan;
  stage: Stage;
  why: Why;
};

/** Gerekçe metni için kararın ayrıntısı. */
type Note = { twoForTwo?: boolean; doubled?: boolean; repsDone?: boolean; nextKg?: number; goal?: number };

type Context = {
  spec: LoadSpec;
  rule: Pick<ProgressionRule, 'scheme' | 'targetRir'>;
  sets: readonly SetTarget[];
  engine: SessionPlan;
  series: SeriesSession[];
  exposure: Exposure;
  pct: number;
  tuning: Readonly<RecommendTuning>;
};

function build(sets: readonly SetTarget[], spec: LoadSpec, topWeightKg: number, targets: readonly number[], reason: SuggestionReason): SessionPlan {
  return { sets: plannedSets(sets, spec, topWeightKg, targets), topWeightKg, reason };
}

/** Aşama kuralları (tablo, dosya başı). */
function decide(ctx: Context): { plan: SessionPlan; note: Note } {
  const { spec, rule, sets, engine, exposure, tuning } = ctx;
  const grid = spec.trackingType === 'weight_reps' ? gridOf(spec) : null;
  const mins = sets.map((set) => set.min);
  const tops = sets.map((set) => (set.amrap ? set.min : set.max));
  const at = (topWeightKg: number, targets: readonly number[], reason: SuggestionReason) => build(sets, spec, topWeightKg, targets, reason);
  const keep = (plan: SessionPlan) => ({ plan, note: {} });

  // PT'nin kuralı ilerlemesizse katman dokunmaz.
  if (rule.scheme === 'none' || engine.reason === 'no_progression') return keep(engine);

  const last = ctx.series.at(-1);
  const previous = ctx.series.at(-2);

  // Aradan dönüş: ayar seansı, son üst ağırlığın ~%90'ı (ızgaraya aşağı); hedef aralığın altı.
  if (exposure.calibrate) {
    const reference = last?.weightKg ?? engine.topWeightKg;
    const top = grid ? Math.min(engine.topWeightKg, grid.floor(clean(reference * tuning.calibrateFactor))) : engine.topWeightKg;
    const rescaled = rescalePlan(engine, sets, spec, top, 'calibrate');
    return keep({ ...rescaled, sets: rescaled.sets.map((set) => ({ ...set, target: sets[set.setIndex]?.min ?? set.target })) });
  }

  // Seri yok (ilk kez, başka aralıktan çeviri): motorun önerisi.
  if (!last) return keep(engine);
  const weight = last.weightKg;
  const kept = grid ? Math.min(weight, grid.max) : weight;
  const comfortable = last.efforts.every((effort) => effort === 'easy' || effort === 'good');
  const allEasy = last.efforts.length > 0 && last.efforts.every((effort) => effort === 'easy');

  if (exposure.stage === 'intro') {
    // Kaçırma: hemen ~%5 aşağı; tıkanma serisine girmez, hafifletme yok.
    if (grid && last.missed && (engine.reason === 'hold' || engine.reason === 'decrease' || engine.reason === 'deload')) {
      const lowered = Math.min(decreaseWeight(weight, spec), grid.max);
      return keep(at(lowered, mins, lowered < weight ? 'decrease' : 'hold'));
    }
    if (engine.reason === 'deload') return keep(at(kept, mins, 'hold'));
    if (engine.reason === 'increase' || engine.reason === 'harder_variant') {
      // Artış yalnız tam yük setleri Kolay/İyi ise; "Kolay" iki adım vermez.
      if (!comfortable) return keep(engine.reason === 'increase' ? at(kept, tops, 'confirm_increase') : { ...engine, reason: 'confirm_increase' });
      if (!grid || engine.reason === 'harder_variant') return keep(engine);
      const up = grid.up(weight, 1);
      return keep(up > weight ? at(Math.max(up, last.heavyKg), mins, 'increase') : engine);
    }
    return keep(engine);
  }

  // Başlangıç tek seansla; Orta ve İleri'de serideki önceki seans da aynı ağırlıkta tepede (2-for-2).
  const twoForTwo = stageAtLeast(exposure.stage, 'intermediate');
  const confirmed = !twoForTwo || (previous !== undefined && previous.advanced && same(previous.weightKg, weight));
  if (engine.reason === 'harder_variant') return keep(confirmed ? engine : { ...engine, reason: 'confirm_increase' });
  if (engine.reason !== 'increase' || !grid) return keep(engine);
  if (!confirmed) return keep(at(kept, tops, 'confirm_increase'));

  const doubled = exposure.stage === 'novice' && (allEasy || last.beyond);
  // İleri: bir ızgara adımı (yüzdesiz inc: yine %10 sınırı ve önce tekrar kuralı).
  const pct = exposure.stage === 'advanced' ? 0 : ctx.pct;
  const amount = increaseTo(weight, spec, pct, { factor: doubled ? 2 : 1, tuning });
  if (!amount || amount.kind === 'device_max') return keep(engine);
  if (amount.kind === 'reps_first') {
    const goal = Math.max(...last.tops) + tuning.repsFirstExtra;
    const ready = last.values.length > 0 && last.values.every((value, index) => value >= (last.tops[index] ?? value) + tuning.repsFirstExtra);
    if (ready) return { plan: at(Math.max(amount.nextKg, last.heavyKg), mins, 'increase'), note: { twoForTwo, repsDone: true } };
    const lowest = Math.min(...last.values);
    const targets = sets.map((set) =>
      set.amrap || !isFullLoad(set) ? set.min : Math.min(set.max + tuning.repsFirstExtra, Math.max(set.min, lowest + 1)),
    );
    return { plan: at(kept, targets, 'reps_first'), note: { nextKg: amount.nextKg, goal } };
  }
  return { plan: at(Math.max(amount.weightKg, last.heavyKg), mins, 'increase'), note: { twoForTwo, doubled } };
}

const UP_REASONS = new Set<SuggestionReason>(['increase', 'range_increase', 'add_rep', 'add_time', 'reps_first']);
const DOWN_REASONS = new Set<SuggestionReason>(['decrease', 'deload', 'calibrate', 'pain_reduce']);

/** Danışan dilinde gerekçe (§5.7): "+2,5 kg · hedefe ulaştın", "Bir kez daha, sonra artır", "Tanışma 2/4 · …". */
function explain(ctx: Context, plan: SessionPlan, note: Note): Why {
  const { spec, sets, exposure, tuning } = ctx;
  const reason = plan.reason;
  const last = ctx.series.at(-1);
  const weighted = spec.trackingType === 'weight_reps' && gridOf(spec) !== null;
  const duration = spec.trackingType === 'duration';
  const weight = last?.weightKg;
  const delta = weighted && weight !== undefined ? clean(plan.topWeightKg - weight) : 0;
  const signed = formatSignedWithUnit(delta, 'kg');
  const values = last ? `${last.values.map(formatNumber).join(' · ')}${duration ? ' sn' : ''}` : '';
  const fullSets = sets.filter(isFullLoad);
  const top = Math.max(...(fullSets.length > 0 ? fullSets : sets).map((set) => set.max));
  const topText = duration ? `${formatNumber(top)} sn` : `${formatNumber(top)} tekrar`;
  const linear = ctx.rule.scheme === 'linear';
  const tone: Why['tone'] =
    reason === 'first_time' ? 'new' : UP_REASONS.has(reason) || delta > 0 ? 'up' : DOWN_REASONS.has(reason) || delta < 0 ? 'down' : 'hold';

  let chip: string;
  let detail: string;
  switch (reason) {
    case 'first_time':
      chip = weighted ? 'Rahat bir ağırlıkla başla' : 'Rahat başla';
      detail =
        exposure.sessions === 0
          ? `Bu harekette geçmişin yok. ${weighted ? 'Rahat bir ağırlıkla başla' : 'Rahat bir tempoyla başla'}; setler iyi geçerse sonraki sefer artar.`
          : REASON_LABELS.first_time;
      break;
    case 'range_increase':
      chip = 'Yeni aralık · ağırlık çevrildi';
      detail = REASON_LABELS.range_increase;
      break;
    case 'increase': {
      const lead = note.twoForTwo
        ? `Son iki antrenmanda ${formatKg(weight ?? 0)} ile bütün setlerde hedefin tepesine ulaştın.`
        : linear
          ? `Geçen sefer ${formatKg(weight ?? 0)} ile bütün setleri tamamladın (${values}).`
          : `Geçen sefer ${formatKg(weight ?? 0)} ile bütün setlerde hedefin tepesine ulaştın (${values}).`;
      const extra = note.repsDone ? ' Tekrarları da ekledin; şimdi ağırlık zamanı.' : note.doubled ? ' Kolay geçtiği için artış iki kat.' : '';
      chip = `${signed} · ${note.twoForTwo ? '2 antrenmandır tepede' : note.repsDone ? 'tekrarlar tamam' : note.doubled ? 'kolay geçti' : 'hedefe ulaştın'}`;
      detail = `${lead}${extra} Ağırlık ${signed}${linear ? '.' : '; tekrar aralığın altından başlar.'}`;
      break;
    }
    case 'confirm_increase':
      chip = 'Bir kez daha, sonra artır';
      detail =
        exposure.stage === 'intro'
          ? `Tepeye ulaştın ama zorladı. Aynı ${weighted ? 'ağırlıkla' : 'hedefle'} bir kez daha yap; rahat geçince artar.`
          : `Tepeye ulaştın; bir kez daha yap, sonra ${weighted ? 'artır' : 'zor bir varyasyona geç'}. Bu aşamada ilerleme için iki antrenman üst üste tepede kalmak gerekir.`;
      break;
    case 'reps_first': {
      const step = note.nextKg !== undefined && weight !== undefined ? formatSignedWithUnit(clean(note.nextKg - weight), 'kg') : '';
      chip = `Önce tekrar · ${formatNumber(note.goal ?? top)} olunca ${step}`;
      detail = `Sonraki ağırlık (${formatKg(note.nextKg ?? 0)}) tek seferde %${formatNumber(Math.round(tuning.maxPct * 100))} sınırını aşan bir sıçrama. Önce tekrar ekle: bütün setlerde ${formatNumber(note.goal ?? top)} tekrar yapınca ağırlık artar.`;
      break;
    }
    case 'add_rep':
      chip = '+1 tekrar hedefle';
      detail = `Geçen sefer ${values}. Aynı ${weighted ? 'ağırlıkta' : 'harekette'} en düşük seti bir tekrar artır; bütün setlerde ${topText} olunca ${weighted ? 'ağırlık artar' : 'zor bir varyasyon önerilir'}.`;
      break;
    case 'add_time':
      chip = `+${DURATION_STEP_SECONDS} sn hedefle`;
      detail = `Geçen sefer ${values}. Her sette +${DURATION_STEP_SECONDS} sn; bütün setlerde ${topText} olunca zor bir varyasyon önerilir.`;
      break;
    case 'hold':
      chip = weighted ? 'Aynı ağırlık · hedefi tamamla' : 'Aynı hedef · tamamla';
      detail = `Geçen sefer ${values}: bir set hedefin altında kaldı. Aynı ${weighted ? 'ağırlıkla' : 'hedefle'} tekrar dene.`;
      break;
    case 'incomplete':
      chip = weighted ? 'Aynı ağırlık · geçen sefer yarım' : 'Aynı hedef · geçen sefer yarım';
      detail = REASON_LABELS.incomplete;
      break;
    case 'decrease':
      chip = `${signed} · geçen sefer zorladı`;
      detail =
        exposure.stage === 'intro'
          ? `Geçen sefer ${values}: hedefin altında kaldın. Tanışmada ağırlık hemen biraz iner; bu tıkanma sayılmaz.`
          : `Geçen sefer ${values}: setler hedefin altında kaldı. Ağırlık biraz iner (${signed}).`;
      break;
    case 'deload':
      chip = weighted && delta < 0 ? `Hafif antrenman · ${signed}` : 'Hafif antrenman · az set';
      detail = `Üst üste üç antrenman hedefin altında kaldı. Bugün ağırlık yaklaşık %${formatNumber(Math.round((1 - DELOAD_FACTOR) * 100))} az ve daha az set; sonra yeniden artar.`;
      break;
    case 'calibrate': {
      const days = Math.floor(exposure.gapDays ?? 0);
      chip = 'Aradan dönüş · hafif ayar';
      detail = `${formatNumber(days)} gündür bu hareketi yapmadın. Bugün ${
        weighted ? `son ağırlığının yaklaşık %${formatNumber(Math.round(tuning.calibrateFactor * 100))} kadarıyla` : 'hedefin alt sınırıyla'
      } ayar antrenmanı; zorlanırsan tıkanma sayılmaz.`;
      break;
    }
    case 'lighter_retry':
      chip = 'Planı bir kez daha dene';
      detail = 'Geçen sefer plandan hafif yaptın. Bugün planlanan ağırlıkla bir kez daha dene; üst üste ikinci kez hafif kalırsa ağırlık biraz iner.';
      break;
    case 'device_max':
      chip = 'Cihazın en ağır ayarı';
      detail = REASON_LABELS.device_max;
      break;
    case 'harder_variant':
      chip = 'Tepedesin · zor varyasyon';
      detail = REASON_LABELS.harder_variant;
      break;
    case 'no_progression':
      chip = 'Aynı hedef';
      detail = REASON_LABELS.no_progression;
      break;
    default:
      chip = REASON_LABELS[reason];
      detail = REASON_LABELS[reason];
  }

  // Tanışma: çipin başında ilerleme ("Tanışma 2/4"); aradan dönüşte inen aşama "Aradan dönüş" der; ayar
  // seansı kendi başlığıyla kalır.
  if (exposure.stage === 'intro' && reason !== 'calibrate') {
    const n = Math.min(exposure.sessions + 1, exposure.introLength);
    const returning = exposure.base !== 'intro';
    const prefix = returning ? 'Aradan dönüş' : exposure.introLength > 1 ? `Tanışma ${n}/${exposure.introLength}` : 'Tanışma';
    const tail =
      weighted && delta !== 0
        ? signed
        : reason === 'confirm_increase'
          ? 'bir kez daha'
          : reason === 'add_rep' || reason === 'add_time'
            ? chip
            : weighted
              ? 'rahat bir ağırlık bul'
              : 'rahat başla';
    chip = `${prefix} · ${tail}`;
    detail = `${returning ? 'Aradan döndün: ilk antrenmanlarda küçük adımlarla ilerlenir.' : 'Bu hareketle tanışıyorsun: doğru ağırlık küçük adımlarla bulunur.'} ${detail}`;
  }
  return { tone, chip, detail };
}

/**
 * Satırın bugünkü önerisi: motorun planı (`planSession`, PT'nin kuralıyla), üstüne aşama kuralları ve
 * danışan dilinde gerekçe. `history` motorun girdisi (`exerciseHistory`: aynı egzersiz ve cihaz);
 * `exposure` hareketin deneyimi (`exposureOf`: bütün index'ten, egzersiz kimliğiyle).
 */
export function recommend(input: {
  spec: LoadSpec;
  rule: Pick<ProgressionRule, 'scheme' | 'targetRir'>;
  sets: readonly SetTarget[];
  history: readonly SessionResult[];
  startWeightKg?: number;
  rowId?: string;
  exercise: RecommendExercise;
  exposure: Exposure;
  tuning?: Partial<RecommendTuning>;
}): Recommendation {
  const tuning = { ...RECOMMEND_TUNING, ...input.tuning };
  const { spec, rule, sets, history } = input;
  const engine = planSession({
    spec,
    rule,
    sets,
    history,
    ...(input.startWeightKg !== undefined ? { startWeightKg: input.startWeightKg } : {}),
    ...(input.rowId !== undefined ? { rowId: input.rowId } : {}),
  });
  const series = sessionSeries({ spec, rule, sets, history, ...(input.rowId !== undefined ? { rowId: input.rowId } : {}) });
  const ctx: Context = { spec, rule, sets, engine, series, exposure: input.exposure, pct: increasePct(input.exercise, tuning), tuning };
  const { plan, note } = decide(ctx);
  return { plan, stage: input.exposure.stage, why: explain(ctx, plan, note) };
}

/* --- hafifletme: yalnız bugünün planı (yoklama, tasarım §2.2) --- */

/** Bu kadar ve daha çok çalışma setli satırda hafifletme son seti düşürür (tasarım §2.2). */
export const LIGHTEN_MIN_SETS = 3;

/** Planı zaten hafif olan gerekçeler: ağırlığa ve gerekçeye dokunulmaz, yalnız set düşer. */
const ALREADY_LIGHT = new Set<SuggestionReason>(['deload', 'calibrate']);

/**
 * Hazır oluşluk düşükken "Hacmi hafifletelim mi?" → Evet (tasarım §2.2): yalnız bugünün planı değişir.
 * Ağırlık %15 az (`deloadWeight` + `LIGHTEN_FACTOR`: ızgaraya aşağı, tabanın altına inmez; ağırlıksızda
 * aynı), 3 ve üstü çalışma setli satırda son set düşer; set düzeni (yüzdeler, AMRAP, hedefler) PT'ninki
 * kalır. Gerekçe `lighten`: motor bu antrenmanı saymaz (`toSetResults`), sonraki plan bir önceki normal
 * antrenmandan kurulur; tıkanma serisi ne artar ne sıfırlanır.
 *
 * Plan zaten hafifse (tıkanma hafifletmesi `deload`, aradan dönüş `calibrate`) ağırlık ve gerekçe
 * korunur, yalnız set düşer: o antrenman motorda ve deneyimde sayılmaya devam eder (hafifletme sayımı
 * ve ayar seansı kaybolmaz) [sentez].
 */
export function lightenPlan(plan: SessionPlan, sets: readonly SetTarget[], spec: LoadSpec): SessionPlan {
  const kept = plan.sets.length >= LIGHTEN_MIN_SETS ? plan.sets.slice(0, -1) : plan.sets;
  if (ALREADY_LIGHT.has(plan.reason)) return { ...plan, sets: kept };
  const topWeightKg = spec.trackingType === 'weight_reps' ? deloadWeight(plan.topWeightKg, spec, LIGHTEN_FACTOR) : plan.topWeightKg;
  return {
    sets: kept.map((planned) => ({ ...planned, weightKg: percentOfTop(topWeightKg, sets[planned.setIndex]?.loadPct ?? planned.loadPct, spec) })),
    topWeightKg,
    reason: 'lighten',
  };
}

/* --- İleri: PT'ye hafifletme ipucu (§5.3) --- */

/**
 * İleri aşamadaki harekette son hafifletmeden (yoksa ilk seanstan) bu yana `weeks` hafta geçti mi. Motor
 * takvime göre kendiliğinden hafifletmez; PT'nin program sayfasında ipucudur (Bell 2024: ortalama
 * 5,6 ± 2,3 haftada bir). Periyodizasyon PT'nin kararıdır.
 */
export function deloadHintDue(exposure: Exposure, now: Date, weeks = 4): boolean {
  if (exposure.stage !== 'advanced') return false;
  const since = exposure.lastDeloadAt ?? exposure.firstAt;
  if (!since) return false;
  return (now.getTime() - Date.parse(since)) / (7 * 24 * 60 * 60 * 1000) >= weeks;
}

/* --- set artışı: yalnız PT'ye öneri (§5.6) --- */

export type SetIncreaseTuning = {
  /** Hareket deneyimi en az (hafta). */
  minWeeks: number;
  /** "İlerliyor" penceresi (gün). */
  windowDays: number;
  /** Sağlık onayı varsa son hazır oluşluk puanı en az. */
  readinessMin: number;
  /** Hedef kasın son 7 gündeki kesirli seti bunun altında (ACSM 2026: kas başına haftada ~10 set). */
  muscleWeeklySets: number;
  /** Kas başına haftada en çok bu kadar set önerisi (RP: iyi toparlanmada +1; temkinli uç). */
  perMuscleWeekly: number;
};

export const SET_INCREASE_TUNING: Readonly<SetIncreaseTuning> = {
  minWeeks: 4,
  windowDays: 14,
  readinessMin: 60,
  muscleWeeklySets: 10,
  perMuscleWeekly: 2,
};

/** Son iki haftada ilerleme sayılan ve saymayan gerekçeler (index satırındaki planın gerekçesi). */
const PROGRESS_REASONS = new Set(['increase', 'add_rep', 'add_time', 'reps_first']);
/** Hafifletilmiş gün (`lighten`, yoklama) de sayılır: toparlanma iyi değildi [sentez]. */
const STALL_REASONS = new Set(['hold', 'decrease', 'deload', 'lighter_retry', 'lighten']);

export type SetIncreaseRow = {
  rowId: string;
  exerciseId: string;
  title: string;
  /** Satırın planlanan çalışma seti sayısı. */
  setCount: number;
  /** Hareketin hedef kasları. */
  primaryMuscles: readonly string[];
  exposure: Exposure;
};

/** `proposals.json`'a girecek aday (faz 8 kimlik, gün ve zamanı ekler). */
export type SetIncreaseCandidate = {
  kind: 'algo_sets';
  rowId: string;
  exerciseId: string;
  from: number;
  to: number;
  /** "Bench Press 3 → 4 set" */
  text: string;
  /** PT'ye gerekçe. */
  why: string;
  /** Önerinin sayıldığı hedef kaslar (kas başına haftalık sınır). */
  muscles: string[];
};

function finishedWithin(index: Pick<SessionIndex, 'items'>, now: Date, days: number): SessionIndexRow[] {
  const from = now.getTime() - days * 24 * 60 * 60 * 1000;
  return index.items.filter((row) => {
    if (!row.finishedAt) return false;
    const at = Date.parse(row.startedAt ?? row.finishedAt);
    return !Number.isNaN(at) && at >= from && at <= now.getTime();
  });
}

/**
 * Kasların son `days` gündeki kesirli seti: bitmiş antrenmanlarda hareketin çalışma seti × kasın payı
 * (`weightsOf`: `muscles.ts` → `exerciseSetWeights`, hedef 1, yardımcı 0,5, dengeleyici 0,25).
 */
export function muscleSetsSince(
  index: Pick<SessionIndex, 'items'>,
  now: Date,
  weightsOf: (exerciseId: string) => Readonly<Partial<Record<string, number>>> | null | undefined,
  days = 7,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of finishedWithin(index, now, days)) {
    for (const item of row.exercises) {
      const weights = weightsOf(item.exerciseId);
      if (!weights) continue;
      for (const [muscle, weight] of Object.entries(weights)) {
        if (weight) totals[muscle] = clean((totals[muscle] ?? 0) + item.sets * weight);
      }
    }
  }
  return totals;
}

/**
 * Algoritmik set artışı adayları (§5.6): hepsi doğruysa "Antrenörüne öner: Bench Press 3 → 4 set". Asla
 * kendiliğinden uygulanmaz; faz 8'in bitiş sheet'i ve `proposals.json` (`kind: "algo_sets"`) bunu okur.
 * 1. Aşama ≥ Orta ve deneyim ≥ 4 hafta.
 * 2. Son 2 haftada satırda en az bir artış (`increase`, `add_rep`, `add_time`, `reps_first`); hiç `hold`,
 *    `decrease`, `deload`, hafif seans ya da hafifletilmiş gün (`lighten`) yok (ilerliyor).
 * 3. Sağlık onayı varsa son hazır oluşluk ≥ 60 (`readinessScore`: `session-check.ts` → `latestReadinessScore`;
 *    onay yoksa verilmez, koşul atlanır).
 * 4. Hedef kasların son 7 gündeki kesirli seti < 10 (ACSM 2026; hacim arttıkça kazanç azalarak artar,
 *    Pelland 2025).
 * 5. Satıra en çok +1 set; kas başına haftada en çok 2 set önerisi (`proposedThisWeek` dahil). RP: iyi
 *    toparlanmada +1, çok iyide +2–3; burada temkinli uç.
 * 6. Satır 10 seti aşmaz (`SET_LIMITS.perRow`).
 */
export function setIncreaseCandidates(input: {
  rows: readonly SetIncreaseRow[];
  index: Pick<SessionIndex, 'items'>;
  now: Date;
  readinessScore?: number | undefined;
  /** Son 7 günün kesirli setleri (`muscleSetsSince`). */
  muscleSets: Readonly<Record<string, number>>;
  /** Bu hafta kas başına verilmiş algoritmik set önerileri. */
  proposedThisWeek?: Readonly<Record<string, number>>;
  tuning?: Partial<SetIncreaseTuning>;
}): SetIncreaseCandidate[] {
  const tuning = { ...SET_INCREASE_TUNING, ...input.tuning };
  if (input.readinessScore !== undefined && input.readinessScore < tuning.readinessMin) return [];
  const recent = finishedWithin(input.index, input.now, tuning.windowDays);
  const proposed: Record<string, number> = { ...input.proposedThisWeek };
  const candidates: SetIncreaseCandidate[] = [];
  for (const row of input.rows) {
    const { exposure } = row;
    if (!stageAtLeast(exposure.stage, 'intermediate') || exposure.weeks < tuning.minWeeks) continue;
    if (row.setCount + 1 > SET_LIMITS.perRow) continue;
    const items = recent.flatMap((session) => session.exercises.filter((item) => item.rowId === row.rowId && item.exerciseId === row.exerciseId));
    const progressing = items.some((item) => item.reason !== undefined && PROGRESS_REASONS.has(item.reason));
    const stalled = items.some((item) => item.lighter || (item.reason !== undefined && STALL_REASONS.has(item.reason)));
    if (!progressing || stalled) continue;
    const muscles = [...new Set(row.primaryMuscles)];
    if (muscles.length === 0) continue;
    if (muscles.some((muscle) => (input.muscleSets[muscle] ?? 0) >= tuning.muscleWeeklySets)) continue;
    if (muscles.some((muscle) => (proposed[muscle] ?? 0) >= tuning.perMuscleWeekly)) continue;
    for (const muscle of muscles) proposed[muscle] = (proposed[muscle] ?? 0) + 1;
    const weekly = Math.max(...muscles.map((muscle) => input.muscleSets[muscle] ?? 0));
    candidates.push({
      kind: 'algo_sets',
      rowId: row.rowId,
      exerciseId: row.exerciseId,
      from: row.setCount,
      to: row.setCount + 1,
      text: `${row.title} ${row.setCount} → ${row.setCount + 1} set`,
      why: `${Math.floor(exposure.weeks)} haftadır bu harekette; son 2 haftada ilerliyor. Hedef kasın son 7 günde ${formatNumber(weekly)} seti var (önerilen ~${tuning.muscleWeeklySets}).`,
      muscles,
    });
  }
  return candidates;
}

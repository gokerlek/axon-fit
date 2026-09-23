import {
  ENDURANCE_NOISE,
  MEASUREMENT_IDS,
  realChange,
  SIT_TO_STAND_MCID,
  sideBridgeAsymmetry,
  sitToStandFlag,
  WAIST_HIP_GIRTH_NOISE_CM,
  waistHipRatio,
  type Change,
  type MeasurementId,
  type Sex,
} from './measurements.ts';
import type { MeasurementEntry } from './schemas/health.ts';

/**
 * Ölçümlerin zaman içindeki seyri — grafik serileri, son iki ölçüm arasındaki değişim ve
 * türetilmiş göstergeler (SPEC §7.5). Saf; sunucu ve tarayıcı ortak.
 *
 * Değişim yalnız ölçüm hatası kaynaklarda belgelenmiş ölçümlerde sınıflanır
 * (`docs/research/medical-fitness/findings.json`). Eşiği bilinmeyen ölçümde değişim
 * gösterilir ama "gelişme" ya da "gerileme" denmez: uydurulmuş bir eşik, PT'yi gürültüye
 * göre program değiştirmeye iter.
 */

export type LineKey = 'value' | 'left' | 'right';
export type Point = { date: string; value: number };

export type NoiseRule = {
  threshold: number;
  /** Eşik başlangıç değerine oran mı (0,25 = %25), yoksa ölçümün biriminde mi. */
  relative: boolean;
  /** İyi yön. Kaynak yön söylemiyorsa null: değişim yalnız "artış / azalma" diye raporlanır. */
  better: 'higher' | 'lower' | null;
  /** Ekranda gösterilen kısa kaynak. */
  source: string;
};

const ENDURANCE_RULE: NoiseRule = {
  threshold: ENDURANCE_NOISE,
  relative: true,
  better: 'higher',
  source: 'Gövde dayanıklılık testlerinde tipik hata %12–24',
};

/**
 * Kaynaklı ölçüm hatası eşikleri. Burada olmayan ölçümün (vücut ağırlığı, boy, kol/uyluk/baldır
 * çevresi, lunge testi, anketler) değişim eşiği araştırma dosyalarında yok; sınıflanmaz.
 * - Bel ve kalça: WHO uzman raporu, teknik ölçüm hatası ~1,2–1,6 cm → 2 cm. Bel çevresi arttıkça
 *   metabolik risk eşikleri aşıldığı için belde düşüş iyidir; kalçada yön tanımlı değil (kas da
 *   yağ da büyütür).
 * - 5 tekrar otur-kalk: MDC/MCID 2,3 sn; kısa süre iyidir.
 * - Gövde dayanıklılığı (fleksör, Biering-Sørensen, yan köprü): tipik hata %12,1–24,1 → %25.
 */
export const NOISE_RULES: Partial<Record<MeasurementId, NoiseRule>> = {
  waist_girth: {
    threshold: WAIST_HIP_GIRTH_NOISE_CM,
    relative: false,
    better: 'lower',
    source: 'WHO: bel çevresinde teknik ölçüm hatası ~1,3–1,6 cm',
  },
  hip_girth: {
    threshold: WAIST_HIP_GIRTH_NOISE_CM,
    relative: false,
    better: null,
    source: 'WHO: kalça çevresinde teknik ölçüm hatası ~1,2–1,4 cm',
  },
  sit_to_stand_5x: {
    threshold: SIT_TO_STAND_MCID,
    relative: false,
    better: 'lower',
    source: '5 tekrar otur-kalk: en küçük saptanabilir ve anlamlı fark 2,3 sn',
  },
  trunk_flexor_endurance: ENDURANCE_RULE,
  trunk_extensor_endurance: ENDURANCE_RULE,
  side_bridge_endurance: ENDURANCE_RULE,
};

/** Yönü tanımlı ölçümde gelişme/gerileme; yönsüzde artış/azalma; eşiğin altında gürültü. */
export type ChangeKind = Change | 'increased' | 'decreased';

export function classifyChange(rule: NoiseRule, before: number, after: number): ChangeKind {
  const verdict = realChange(before, after, {
    threshold: rule.threshold,
    relative: rule.relative,
    better: rule.better ?? 'higher',
  });
  if (rule.better || verdict === 'no_real_change') return verdict;
  return verdict === 'improved' ? 'increased' : 'decreased';
}

export type LineChange = {
  previous: Point;
  latest: Point;
  /** Son eksi önceki, ölçümün biriminde. */
  delta: number;
  /** Göreli değişim (0,25 = %25); önceki değer 0 ise null. */
  ratio: number | null;
  /** Eşik kaynaklarda yoksa null: değişim sınıflanmaz. */
  kind: ChangeKind | null;
};

export type MeasurementLine = {
  /** Tek değerli ölçümde `value`, iki taraflıda `left` ve `right`. */
  key: LineKey;
  /** Tarihe göre artan; aynı gün iki kayıt varsa sonuncusu. */
  points: Point[];
  /** İkinci ölçüm yoksa null. */
  change: LineChange | null;
};

export type MeasurementTrend = { id: MeasurementId; lines: MeasurementLine[]; rule: NoiseRule | null; lastDate: string };

const LINE_ORDER: readonly LineKey[] = ['value', 'left', 'right'];

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const byDate = (a: Point, b: Point) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

function lineChange(points: readonly Point[], rule: NoiseRule | null): LineChange | null {
  const latest = points.at(-1);
  const previous = points.at(-2);
  if (!latest || !previous) return null;
  const raw = latest.value - previous.value;
  return {
    previous,
    latest,
    delta: round(raw, 2),
    ratio: previous.value === 0 ? null : round(raw / previous.value, 4),
    kind: rule ? classifyChange(rule, previous.value, latest.value) : null,
  };
}

/** Ölçülmüş her ölçüm için seriler ve son değişim, katalog sırasıyla. */
export function measurementTrends(entries: readonly MeasurementEntry[]): MeasurementTrend[] {
  const trends: MeasurementTrend[] = [];
  for (const id of MEASUREMENT_IDS) {
    const own = entries.filter((entry) => entry.id === id);
    if (own.length === 0) continue;
    const rule = NOISE_RULES[id] ?? null;
    const lines = LINE_ORDER.flatMap((key): MeasurementLine[] => {
      const values = new Map<string, number>();
      for (const entry of own) if ((entry.side ?? 'value') === key) values.set(entry.date, entry.value);
      if (values.size === 0) return [];
      const points = [...values].map(([date, value]) => ({ date, value })).sort(byDate);
      return [{ key, points, change: lineChange(points, rule) }];
    });
    const lastDate = own.reduce((last, entry) => (entry.date > last ? entry.date : last), '');
    trends.push({ id, lines, rule, lastDate });
  }
  return trends;
}

/* --- türetilmiş göstergeler (en son uygun ölçüm günü) --- */

function valuesOn(entries: readonly MeasurementEntry[], id: MeasurementId, key: LineKey): Map<string, number> {
  const values = new Map<string, number>();
  for (const entry of entries) if (entry.id === id && (entry.side ?? 'value') === key) values.set(entry.date, entry.value);
  return values;
}

function latestDate(dates: Iterable<string>): string | null {
  let last: string | null = null;
  for (const date of dates) if (last === null || date > last) last = date;
  return last;
}

export type WaistHipIndicator =
  | { date: string; waist: number; hip: number; sex: Sex; ratio: number; elevatedRisk: boolean }
  /** Bel ve kalça var ama cinsiyet bilinmiyor: eşik cinsiyete göre (WHO). */
  | { date: string; waist: number; hip: number; sex: null };

/** Bel ve kalçanın aynı gün ölçüldüğü en son gün için bel-kalça oranı. */
export function latestWaistHip(entries: readonly MeasurementEntry[], sex: Sex | undefined): WaistHipIndicator | null {
  const waists = valuesOn(entries, 'waist_girth', 'value');
  const hips = valuesOn(entries, 'hip_girth', 'value');
  const date = latestDate([...waists.keys()].filter((day) => (hips.get(day) ?? 0) > 0));
  if (!date) return null;
  const waist = waists.get(date) ?? 0;
  const hip = hips.get(date) ?? 0;
  if (!sex) return { date, waist, hip, sex: null };
  return { date, waist, hip, sex, ...waistHipRatio(waist, hip, sex) };
}

export type SitToStandIndicator = { date: string; seconds: number; flag: ReturnType<typeof sitToStandFlag> };

export function latestSitToStand(entries: readonly MeasurementEntry[]): SitToStandIndicator | null {
  const values = valuesOn(entries, 'sit_to_stand_5x', 'value');
  const date = latestDate(values.keys());
  if (!date) return null;
  const seconds = values.get(date) ?? 0;
  return { date, seconds, flag: sitToStandFlag(seconds) };
}

export type SideBridgeIndicator = { date: string; left: number; right: number; differencePercent: number; flagged: boolean };

/** Sağ ve solun aynı gün ölçüldüğü en son gün için yan köprü asimetrisi. */
export function latestSideBridgeAsymmetry(entries: readonly MeasurementEntry[]): SideBridgeIndicator | null {
  const lefts = valuesOn(entries, 'side_bridge_endurance', 'left');
  const rights = valuesOn(entries, 'side_bridge_endurance', 'right');
  const date = latestDate([...lefts.keys()].filter((day) => rights.has(day)));
  if (!date) return null;
  const left = lefts.get(date) ?? 0;
  const right = rights.get(date) ?? 0;
  return { date, left, right, ...sideBridgeAsymmetry(left, right) };
}

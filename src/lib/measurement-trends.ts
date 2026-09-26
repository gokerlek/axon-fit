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
import { forecast, rangeStart, trendStatus, type Forecast, type TrendStatus } from './trend.ts';

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
  /** Tarihe göre artan; aynı gün iki kayıt varsa sonuncusu. Tarih aralığı verildiyse aralıktakiler (grafik). */
  points: Point[];
  /**
   * Aralığın sonuna (`to`) kadarki bütün noktalar, aralık başından öncekiler dahil: eğilim penceresi
   * başındaki çapayı aralık dışında da bulsun ("Son 4 hafta" ile danışan kartı aynı kararı versin).
   */
  history: Point[];
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

/**
 * Ölçülmüş her ölçüm için seriler ve son değişim, katalog sırasıyla. Tarih aralığı verilirse
 * (uçlar dahil) seriler aralıktaki ölçümlerdir; değişim yine aralığın son ölçümüyle ondan hemen
 * önceki arasındadır — önceki, aralığın başından eski olabilir. Eğilim için `history` aralığın
 * sonuna kadarki bütün noktaları taşır.
 */
export function measurementTrends(
  entries: readonly MeasurementEntry[],
  { from, to }: { from?: string | undefined; to?: string | undefined } = {},
): MeasurementTrend[] {
  const trends: MeasurementTrend[] = [];
  for (const id of MEASUREMENT_IDS) {
    const own = entries.filter((entry) => entry.id === id && (!to || entry.date <= to));
    const shown = own.filter((entry) => !from || entry.date >= from);
    if (shown.length === 0) continue;
    const rule = NOISE_RULES[id] ?? null;
    const lines = LINE_ORDER.flatMap((key): MeasurementLine[] => {
      const values = new Map<string, number>();
      for (const entry of own) if ((entry.side ?? 'value') === key) values.set(entry.date, entry.value);
      const all = [...values].map(([date, value]) => ({ date, value })).sort(byDate);
      const points = all.filter((point) => !from || point.date >= from);
      if (points.length === 0) return [];
      return [{ key, points, history: all, change: lineChange(all, rule) }];
    });
    const lastDate = shown.reduce((last, entry) => (entry.date > last ? entry.date : last), '');
    trends.push({ id, lines, rule, lastDate });
  }
  return trends;
}

/* --- eğilim ve tahmin (`trend.ts`) --- */

export type LineOutlook = {
  /**
   * Son ölçüme kadarki 4 haftanın eğilimi, çizginin değişimi ölçüm hatası payıyla karşılaştırılarak.
   * `used`: karara giren noktalar (pencere ve varsa başındaki çapa). Eşiği olmayan ölçümde null:
   * plato ya da gerileme denmez.
   */
  status: { kind: TrendStatus; change: number | null; used: Point[] } | null;
  /** Tahmin eşik gerektirmez; az veride `ok: false` ve nedeni. */
  forecast: Forecast;
};

/**
 * Tek iki ölçüm arasındaki fark gürültüde kalabilir (haftada 0,7 cm) ama birkaç haftanın
 * eğilimi gerçektir (5 haftada 4 cm): kart ikisini ayrı gösterir. `bounds`: ölçümün geçerli
 * aralığı; tahmin ve bandı ona kırpılır. Tahmin grafikteki noktalardan (`points`), eğilim
 * `history`'den: aralık başından önceki çapa da görülür (`MeasurementLine.history`).
 */
export function lineOutlook(
  points: readonly Point[],
  rule: NoiseRule | null,
  bounds: { min: number; max: number } = { min: -Infinity, max: Infinity },
  history: readonly Point[] = points,
): LineOutlook {
  const status = rule
    ? (() => {
        const result = trendStatus(history, { threshold: rule.threshold, relative: rule.relative, better: rule.better ?? 'higher' });
        return { kind: result.status, change: result.change, used: result.used };
      })()
    : null;
  return { status, forecast: forecast(points, bounds) };
}

/* --- kartın iki ayrı hükmü: son iki ölçüm ve 4 haftalık eğilim --- */

/** Son iki ölçüm arasındaki fark ve ölçüm hatasına göre hükmü. */
export type LatestChangeVerdict = LineChange & {
  /** Önceki ölçüm seçili tarih aralığının başından önce (grafikte çizilmiyor). */
  previousBeforeRange: boolean;
};

/**
 * Son ölçüme kadarki 4 haftanın eğilimi. Yönü tanımsız ölçümde (kalça) gelişme/gerileme yerine
 * artış/azalma; eşiğin altında her zaman `plateau` ("durağan"): gürültüye "gelişme" denmez.
 */
export type TrendVerdict = {
  kind: 'improving' | 'declining' | 'plateau' | 'increased' | 'decreased';
  /** Çizginin pencere boyunca değişimi, ölçümün biriminde. */
  change: number;
  /** Karara giren ilk ve son ölçüm günü. */
  from: string;
  to: string;
  /** Karara giren ölçüm sayısı. */
  points: number;
  /** Bunlardan seçili tarih aralığının başından önce kalanlar (grafikte çizilmeyenler). */
  beforeRange: number;
};

/**
 * Bir çizginin kartta yan yana duran iki hükmü, birbirinden ayrı ve adlı (SPEC §7.5): son iki ölçüm
 * arasındaki fark tek başına gürültüde kalabilir (haftada 0,7 cm), birkaç haftanın eğilimi gerçek
 * olabilir (4 haftada 2,8 cm). Eğilim `history`den hesaplanır: seçili aralığın başından önceki
 * noktaları kullanıyorsa kaç tanesinin öyle olduğu da döner, kart bunu yazar. `rangeFrom`: seçili
 * aralığın başı (yoksa "tümü").
 */
export function lineVerdicts(
  line: Pick<MeasurementLine, 'history' | 'change'>,
  rule: NoiseRule | null,
  rangeFrom?: string,
): { latest: LatestChangeVerdict | null; trend: TrendVerdict | null } {
  const before = (date: string) => Boolean(rangeFrom && date < rangeFrom);
  const latest = line.change ? { ...line.change, previousBeforeRange: before(line.change.previous.date) } : null;
  if (!rule) return { latest, trend: null };
  const result = trendStatus(line.history, { threshold: rule.threshold, relative: rule.relative, better: rule.better ?? 'higher' });
  const first = result.used[0];
  const last = result.used.at(-1);
  if (result.status === 'insufficient' || result.change === null || !first || !last) return { latest, trend: null };
  const kind =
    result.status !== 'plateau' && !rule.better ? (result.change > 0 ? 'increased' : 'decreased') : result.status;
  return {
    latest,
    trend: {
      kind,
      change: result.change,
      from: first.date,
      to: last.date,
      points: result.used.length,
      beforeRange: result.used.filter((point) => before(point.date)).length,
    },
  };
}

export type MeasurementAlert = {
  id: MeasurementId;
  key: LineKey;
  /** Gerileme en önde, sonra durağan, sonra gelişme. */
  kind: 'declining' | 'plateau' | 'improving';
  change: number;
};

const ALERT_ORDER: Record<MeasurementAlert['kind'], number> = { declining: 0, plateau: 1, improving: 2 };

/**
 * Danışan sayfası ve genel bakış için: son 4 haftada kararı verilebilen ölçümler. Yalnız
 * eşiği ve iyi yönü kaynaklı olanlar (kalçada yön tanımsız: uyarı üretmez). Eğilim son ölçüme
 * bağlıdır; son ölçümü bugünden 4 haftadan eski çizgi uyarı üretmez (Mart'ta ölçülen danışanın
 * kartında Eylül'de "son 4 hafta" diye Mart'ın eğilimi çıkmasın). `today`: uygulamanın saat
 * dilimindeki gün (`todayIn`).
 */
export function measurementAlerts(entries: readonly MeasurementEntry[], today: string): MeasurementAlert[] {
  const since = rangeStart('4h', today);
  const alerts: MeasurementAlert[] = [];
  for (const trend of measurementTrends(entries)) {
    if (!trend.rule?.better) continue;
    for (const line of trend.lines) {
      const last = line.points.at(-1);
      if (!last || (since && last.date < since)) continue;
      const status = lineOutlook(line.points, trend.rule).status;
      if (!status || status.kind === 'insufficient' || status.change === null) continue;
      alerts.push({ id: trend.id, key: line.key, kind: status.kind, change: status.change });
    }
  }
  return alerts.sort((a, b) => ALERT_ORDER[a.kind] - ALERT_ORDER[b.kind]);
}

/** Tarih aralığındaki kayıtlar (uçlar dahil); süzgeç grafiklere ve eğilime uygulanır. */
export function entriesInRange(entries: readonly MeasurementEntry[], from?: string, to?: string): MeasurementEntry[] {
  return entries.filter((entry) => (!from || entry.date >= from) && (!to || entry.date <= to));
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

/* --- tarih süzgeçli genel bakış --- */

export type MeasurementIndicators = {
  waistHip: WaistHipIndicator | null;
  sitToStand: SitToStandIndicator | null;
  sideBridge: SideBridgeIndicator | null;
};

/**
 * Genel bakışın tarih süzgeci (uçlar dahil) tek yerde: kart kendi içinde tutarlı kalsın.
 * - Seriler ve tahmin aralıktaki ölçümlerden; grafikte yalnız aralık çizilir.
 * - Eğilim aralığın sonuna kadarki bütün ölçümlerden (`history`): pencere başındaki çapa aralığın
 *   dışında kalabilir, "Son 4 hafta" görünümü danışan kartıyla aynı kararı verir.
 * - Değişim aralığın son ölçümüyle ondan önceki arasında; önceki aralıktan eski olabilir (üç ayda
 *   bir ölçülen otur-kalk "Son 3 ay"da "İlk ölçüm" görünmesin).
 * - Göstergeler de aralıktaki kayıtlardan: geçmiş bir aralıkta "Son değer 14 sn" ile Eylül'ün notu
 *   yan yana çıkmasın.
 */
export function measurementsInRange(
  entries: readonly MeasurementEntry[],
  sex: Sex | undefined,
  from?: string,
  to?: string,
): { entries: MeasurementEntry[]; trends: MeasurementTrend[]; indicators: MeasurementIndicators } {
  const inRange = entriesInRange(entries, from, to);
  return {
    entries: inRange,
    trends: measurementTrends(entries, { from, to }),
    indicators: {
      waistHip: latestWaistHip(inRange, sex),
      sitToStand: latestSitToStand(inRange),
      sideBridge: latestSideBridgeAsymmetry(inRange),
    },
  };
}

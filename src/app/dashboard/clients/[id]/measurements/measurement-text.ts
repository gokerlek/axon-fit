// Göreli ve uzantılı içe aktarma: metinler `node --test` ile de sınanır (`measurement-text.test.ts`).
import { formatDay, formatDayShort, formatNumber, formatSignedWithUnit, formatWithUnit } from '../../../../../lib/format.ts';
import type {
  ChangeKind,
  LatestChangeVerdict,
  NoiseRule,
  SideBridgeIndicator,
  SitToStandIndicator,
  TrendVerdict,
  WaistHipIndicator,
} from '@/lib/measurement-trends';
import { MEASUREMENT_SLOTS, SIDE_LABELS } from '../../../../../lib/measurement-log.ts';
import { MEASUREMENT_UNIT_LABELS, MEASUREMENTS, type MeasurementDef } from '../../../../../lib/measurements.ts';
import { forecastAsOf, type Forecast } from '../../../../../lib/trend.ts';

/** Ölçüm ekranlarının ortak metinleri (PT tarafı). */

/** Katalog birimi → ekranda görünen ("s" Türkçede "sn"); tek yer `measurements.ts`. */
export const UNIT_LABELS: Record<MeasurementDef['unit'], string> = MEASUREMENT_UNIT_LABELS;

export const GROUP_INFO: Record<MeasurementDef['group'], { title: string; description: string }> = {
  anthropometry: {
    title: 'Antropometri',
    description: 'Ağırlık, boy ve çevre ölçüleri. Takip ölçümlerini mümkünse hep aynı kişi alır.',
  },
  performance: {
    title: 'Performans',
    description: 'Otur-kalk ve gövde dayanıklılık testleri, saniye olarak.',
  },
  mobility: {
    title: 'Hareketlilik',
    description: 'Ayak bileği dorsifleksiyonu; sağ ve sol ayrı ölçülür.',
  },
  questionnaire: {
    title: 'Anketler',
    description: 'Skoru sen girersin; anketlerin metni lisanslı olabildiği için uygulamada yok.',
  },
};

/**
 * Katlanmış bölümün özeti: dolu alan sayısı ve ilk üçü, yazıldığı gibi ("Vücut ağırlığı 81,5 kg ·
 * Bel çevresi 87,9 cm ve 2 değer daha"). Boşsa `count` 0.
 */
export function groupSummary(
  group: MeasurementDef['group'],
  slots: Readonly<Record<string, string | undefined>>,
): { count: number; text: string } {
  const filled = MEASUREMENT_SLOTS.filter((slot) => MEASUREMENTS[slot.id].group === group && (slots[slot.key] ?? '').trim() !== '');
  const shown = filled.slice(0, 3).map(({ key, id, side }) => {
    const def = MEASUREMENTS[id];
    const name = side ? `${def.label}, ${SIDE_LABELS[side].toLocaleLowerCase('tr')}` : def.label;
    const text = (slots[key] ?? '').trim();
    const unit = UNIT_LABELS[def.unit];
    return `${name} ${unit === '%' ? `%${text}` : `${text} ${unit}`}`;
  });
  const rest = filled.length - shown.length;
  return { count: filled.length, text: shown.join(' · ') + (rest > 0 ? ` ve ${rest} değer daha` : '') };
}

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  improved: 'Gerçek gelişme',
  declined: 'Gerileme',
  increased: 'Gerçek artış',
  decreased: 'Gerçek azalma',
  no_real_change: 'Ölçüm hatası içinde',
};

/** Eşiğin ekrandaki açıklaması: "2 cm altındaki değişim gerçek sayılmaz (…)". */
export function describeRule(rule: NoiseRule, unit: string): string {
  const size = rule.relative ? `%${formatNumber(rule.threshold * 100)}` : formatWithUnit(rule.threshold, unit);
  const direction =
    rule.better === 'lower'
      ? ' Düşüş iyidir.'
      : rule.better === 'higher'
        ? ' Artış iyidir.'
        : ' İyi yön tanımlı değil; gerçek değişim artış ya da azalma diye gösterilir.';
  return `${size} altındaki değişim ölçüm hatası sayılır (${rule.source}).${direction}`;
}

export const NO_RULE_TEXT =
  'Bu ölçümün hata payı kaynaklarda yok: değişim gösterilir ama gelişme ya da gerileme diye yorumlanmaz.';

export function describeWaistHip(indicator: WaistHipIndicator): string {
  if (indicator.sex === null) {
    return 'Bel-kalça oranının eşiği cinsiyete göre; oranı görmek için ölçüm girerken cinsiyeti seç.';
  }
  const cutoff = indicator.sex === 'male' ? 'erkekte 0,90' : 'kadında 0,85';
  return `Bel-kalça oranı ${formatNumber(indicator.ratio)} (${formatDay(indicator.date)}): ${
    indicator.elevatedRisk ? 'artmış metabolik risk eşiğinde ya da üstünde' : 'artmış metabolik risk eşiğinin altında'
  } (${cutoff}, WHO).`;
}

export function describeSitToStand(indicator: SitToStandIndicator): string {
  const value = formatWithUnit(indicator.seconds, 'sn');
  switch (indicator.flag) {
    case 'recurrent_fall_risk':
      return `Son ölçüm ${value}: 15 sn üstü, tekrarlayan düşme riski işareti. Değerlendirme önerilir.`;
    case 'fall_risk_assessment':
      return `Son ölçüm ${value}: 12 sn üstü, düşme riski değerlendirmesi önerilir.`;
    default:
      return `Son ölçüm ${value}: 12 sn ve altı, düşme riski işareti yok.`;
  }
}

export function describeSideBridge(indicator: SideBridgeIndicator): string {
  return `Sağ-sol farkı %${formatNumber(indicator.differencePercent)} (${formatDay(indicator.date)}): ${
    indicator.flagged ? '%25 ölçüm hatası bandını aşıyor, asimetri var.' : '%25 ölçüm hatası bandında, asimetri sayılmaz.'
  }`;
}

const tenth = (value: number) => Math.round(value * 10) / 10;

/** Rozetin rengi ve ikonu: iyi yönde gerçek değişim, kötü yönde, gürültü/durağan, yönsüz artış ya da azalma. */
export type VerdictTone = 'good' | 'bad' | 'flat' | 'up' | 'down';

/**
 * Kartta tek hükmün satırı: "Son iki ölçüm: −0,7 cm · ölçüm hatası içinde" ya da "4 haftalık eğilim:
 * gerçek gelişme (−2,8 cm)". `text` tam cümle (rozetin ipucu); `detail` hangi ölçümlerden hesaplandığı
 * (kartta görünür).
 */
export type VerdictView = {
  label: string;
  /** İşaretli fark, birimiyle. */
  amount: string;
  /** Rozetteki hüküm; eşiği olmayan ölçümde null (sınıflanmaz). */
  verdict: string | null;
  tone: VerdictTone;
  text: string;
  detail: string;
};

const CHANGE_TONES: Record<ChangeKind, VerdictTone> = {
  improved: 'good',
  declined: 'bad',
  increased: 'up',
  decreased: 'down',
  no_real_change: 'flat',
};

/** Tarih aralığı kısa biçimde; yıllar farklıysa yıllı: "11 Ağu–8 Eyl". */
function dayRange(from: string, to: string): string {
  const withYear = from.slice(0, 4) !== to.slice(0, 4);
  return `${formatDayShort(from, withYear)}–${formatDayShort(to, withYear)}`;
}

/** Son iki ölçüm arasındaki fark ve (eşiği varsa) ölçüm hatasına göre hükmü. */
export function latestChangeView(change: LatestChangeVerdict, unit: string, relative: boolean): VerdictView {
  const percent =
    relative && change.ratio !== null ? ` (${change.ratio < 0 ? '−' : '+'}%${formatNumber(Math.abs(Math.round(change.ratio * 100)))})` : '';
  const amount = `${formatSignedWithUnit(change.delta, unit)}${percent}`;
  const verdict = change.kind ? CHANGE_LABELS[change.kind].toLocaleLowerCase('tr') : null;
  const withYear = change.previous.date.slice(0, 4) !== change.latest.date.slice(0, 4);
  const days = `${formatDayShort(change.previous.date, withYear)} → ${formatDayShort(change.latest.date, withYear)}`;
  return {
    label: 'Son iki ölçüm',
    amount,
    verdict,
    tone: change.kind ? CHANGE_TONES[change.kind] : 'flat',
    text: `Son iki ölçüm: ${amount}${verdict ? ` · ${verdict}` : ''}`,
    detail: change.previousBeforeRange ? `${days} · önceki ölçüm seçili aralıktan önce` : days,
  };
}

const TREND_WORDS: Record<TrendVerdict['kind'], { verdict: string; tone: VerdictTone }> = {
  improving: { verdict: 'gerçek gelişme', tone: 'good' },
  declining: { verdict: 'gerileme', tone: 'bad' },
  plateau: { verdict: 'durağan', tone: 'flat' },
  increased: { verdict: 'gerçek artış', tone: 'up' },
  decreased: { verdict: 'gerçek azalma', tone: 'down' },
};

/**
 * Son ölçüme kadarki 4 haftanın eğilimi; son iki ölçümün farkından ayrı satır. Hangi ölçümlerden
 * hesaplandığını söyler; seçili aralığın başından önceki ölçümleri de kullanıyorsa bunu yazar
 * (grafik yalnız aralığı çizer). Eşiğin altındaki eğilim "durağan"dır, "gelişme" denmez.
 */
export function trendView(trend: TrendVerdict, unit: string): VerdictView {
  const { verdict, tone } = TREND_WORDS[trend.kind];
  const amount = formatSignedWithUnit(tenth(trend.change), unit);
  const earlier = trend.beforeRange > 0 ? ` (seçili aralıktan önceki ${trend.beforeRange} ölçüm dahil)` : '';
  return {
    label: '4 haftalık eğilim',
    amount,
    verdict,
    tone,
    text: `4 haftalık eğilim: ${verdict} (${amount})`,
    detail: `${dayRange(trend.from, trend.to)} arasındaki ${trend.points} ölçümden${earlier}.`,
  };
}

/** Aralık, birimiyle ve yüzde işareti her sayının başında: "%8–%12", "82,1–86,3 cm". */
export function formatRange(low: number, high: number, unit: string): string {
  return unit === '%' ? `%${formatNumber(low)}–%${formatNumber(high)}` : `${formatNumber(low)}–${formatNumber(high)} ${unit}`;
}

/**
 * Tahminin tek satırlık özeti; veri yetmiyorsa ne kadar gerektiği. Çizgi ölçümün sınırına (ODI'de %0,
 * ankette 100) değiyorsa kaç haftada değdiği yazılır, tek noktaya çökmüş "0–0" aralığı değil; bant
 * gürültüsüz veride de çökebilir, o zaman aralık hiç yazılmaz.
 *
 * `today` verilirse tahmin bugüne göre okunur (`forecastAsOf`): son tahmin günü geçmişte kalmışsa
 * tahmin yazılmaz (geçmiş bir güne "tahmin" olmaz), son ölçümün kaç gün önce olduğu söylenir; bugün
 * ufkun içindeyse bugünün tahmini de yazılır.
 */
export function describeForecast(forecast: Forecast, unit: string, today?: string): string {
  if (!forecast.ok) {
    return forecast.reason === 'too_few_points'
      ? 'Tahmin için en az 4 ölçüm gerekir.'
      : 'Tahmin için ölçümler en az 3 haftaya yayılmalı.';
  }
  const trend = `Eğilim haftada ${formatSignedWithUnit(tenth(forecast.slopePerWeek), unit)}.`;
  const view = today ? forecastAsOf(forecast, today) : null;
  if (view?.kind === 'stale') {
    return `${trend} Son ölçüm ${view.daysSince} gün önce: tahminin son günü (${formatDay(view.endDate)}) geçti, tahmin yeni ölçümle güncellenir.`;
  }
  const end = forecast.points.at(-1)!;
  if (forecast.bound) {
    const down = forecast.slopePerWeek < 0;
    const edge = `${down ? 'alt' : 'üst'} sınıra (${formatWithUnit(forecast.bound.value, unit)})`;
    if (forecast.bound.days === 0) return `${trend} Çizgi son ölçümde ${edge} ${down ? 'indi' : 'ulaştı'}; ileriye tahmin yazılmaz.`;
    const when = forecast.bound.days < 7 ? 'bir hafta içinde' : `yaklaşık ${Math.round(forecast.bound.days / 7)} haftada`;
    return `${trend} Böyle giderse son ölçümden ${when} (${formatDay(end.date)} civarı) ${edge} ${
      down ? 'iner' : 'ulaşır'
    }. Tahmin eğilimin süreceğini varsayar.`;
  }
  const estimate = view?.kind === 'current' ? view.today : null;
  const now = estimate ? `bugün (${formatDay(estimate.date)}) ≈ ${formatWithUnit(tenth(estimate.value), unit)}, ` : '';
  const weeks = Math.round(forecast.horizonDays / 7);
  const [low, high] = [tenth(end.low), tenth(end.high)];
  const range = low === high ? '' : `; olası aralık ${formatRange(low, high, unit)}`;
  return `${trend} Böyle giderse ${now}son ölçümden ${weeks} hafta sonra (${formatDay(end.date)}) ≈ ${formatWithUnit(
    tenth(end.value),
    unit,
  )}${range}. Tahmin eğilimin süreceğini varsayar.`;
}

import { formatDay, formatNumber, formatSignedWithUnit, formatWithUnit } from '@/lib/format';
import type { ChangeKind, LineOutlook, NoiseRule, SideBridgeIndicator, SitToStandIndicator, WaistHipIndicator } from '@/lib/measurement-trends';
import type { Forecast } from '@/lib/trend';
import type { MeasurementDef } from '@/lib/measurements';

/** Ölçüm ekranlarının ortak metinleri (PT tarafı). */

/** Katalog birimi → ekranda görünen ("s" Türkçede "sn"). */
export const UNIT_LABELS: Record<MeasurementDef['unit'], string> = { kg: 'kg', cm: 'cm', s: 'sn', '%': '%', puan: 'puan' };

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
  return `Sağ-sol farkı %${indicator.differencePercent} (${formatDay(indicator.date)}): ${
    indicator.flagged ? '%25 ölçüm hatası bandını aşıyor, asimetri var.' : '%25 ölçüm hatası bandında, asimetri sayılmaz.'
  }`;
}

/**
 * Son 4 haftanın eğilimi: tek iki ölçümün farkından ayrı. Yönü tanımsız ölçümde (kalça)
 * gelişme/gerileme yerine artış/azalma. Veri yetmiyorsa null (etiket yok).
 */
export function outlookLabel(
  status: NonNullable<LineOutlook['status']>,
  rule: NoiseRule,
): { text: string; tone: 'good' | 'bad' | 'flat' | 'neutral' } | null {
  if (status.kind === 'insufficient') return null;
  if (status.kind === 'plateau') return { text: 'Son 4 hafta: durağan', tone: 'flat' };
  if (!rule.better) {
    const up = (status.change ?? 0) > 0;
    return { text: `Son 4 hafta: gerçek ${up ? 'artış' : 'azalma'}`, tone: 'neutral' };
  }
  return status.kind === 'improving'
    ? { text: 'Son 4 hafta: gerçek gelişme', tone: 'good' }
    : { text: 'Son 4 hafta: gerileme', tone: 'bad' };
}

/** Tahminin tek satırlık özeti; veri yetmiyorsa ne kadar gerektiği. */
export function describeForecast(forecast: Forecast, unit: string): string {
  if (!forecast.ok) {
    return forecast.reason === 'too_few_points'
      ? 'Tahmin için en az 4 ölçüm gerekir.'
      : 'Tahmin için ölçümler en az 3 haftaya yayılmalı.';
  }
  const end = forecast.points.at(-1)!;
  const weeks = Math.round(forecast.horizonDays / 7);
  return `Eğilim haftada ${formatSignedWithUnit(Math.round(forecast.slopePerWeek * 10) / 10, unit)}. Böyle giderse son ölçümden ${weeks} hafta sonra (${formatDay(
    end.date,
  )}) ≈ ${formatWithUnit(Math.round(end.value * 10) / 10, unit)}; olası aralık ${formatNumber(Math.round(end.low * 10) / 10)}–${formatNumber(
    Math.round(end.high * 10) / 10,
  )}. Tahmin eğilimin süreceğini varsayar.`;
}

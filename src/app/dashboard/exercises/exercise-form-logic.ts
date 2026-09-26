// Göreli ve uzantılı içe aktarma: bu yardımcılar `node --test` ile de sınanır (`exercise-form-logic.test.ts`).
import { describeDeviceLoads, loadSpecFor, type DeviceLoadSettings } from '../../../lib/device-loads.ts';
import { defaultRule, PROGRESSION_LABELS, RIR_LABELS, type ProgressionRule, type TrackingType } from '../../../lib/progression.ts';
import { CATEGORY_LABELS, type Category, type ExerciseInput } from '../../../lib/schemas/exercise.ts';
import { parseVideoUrl } from '../../../lib/video.ts';

/** Egzersiz formunun saf yardımcıları: gönderilen gövde, cihazdan gelen yük, varsayılan kural. */

export function sameRule(a: ProgressionRule | undefined, b: ProgressionRule): boolean {
  return (
    a?.scheme === b.scheme && a.targetMin === b.targetMin && a.targetMax === b.targetMax && a.targetRir === b.targetRir
  );
}

/** Türün varsayılan kuralı tek satırda: "Varsayılan: bileşik 6–10 tekrar · çift ilerleme · 2 tekrar yedekte". */
export function describeDefaultRule(category: Category, trackingType: TrackingType): string {
  const rule = defaultRule(category, trackingType);
  const unit = trackingType === 'duration' ? 'sn' : 'tekrar';
  const parts = [`${rule.targetMin}–${rule.targetMax} ${unit}`, PROGRESSION_LABELS[rule.scheme].toLocaleLowerCase('tr')];
  // Süreli harekette ve ilerlemesiz kuralda yedekte tekrar öneriyi değiştirmez.
  if (trackingType !== 'duration' && rule.scheme !== 'none') parts.push((RIR_LABELS[rule.targetRir] ?? '').toLocaleLowerCase('tr'));
  return `Varsayılan: ${CATEGORY_LABELS[category].toLocaleLowerCase('tr')} ${parts.join(' · ')}`;
}

/** Cihazın ayarından gelen yük alanları (formda salt okunur gösterilir). */
export type DeviceLoadFields = {
  /** Düzenli adım (bar, plaka yüklemeli, blok); dambıl/kettlebell setinde `null` (ağırlıklar setten). */
  stepKg: number | null;
  /** En hafif ayar: bar/kızak, ilk blok ya da setin en hafifi. */
  minKg: number;
  /** Cihazın ağırlık ayarının kısa anlatımı (ara ağırlıklar, makara, set). */
  summary: string;
};

/**
 * Cihaz seçiliyken ağırlık adımı ve taban cihazdan gelir (öneri motoru `loadSpecFor` ile aynı karar);
 * cihaz ağırlık vermiyorsa (istasyon, bant, eksik ayar) ya da cihaz yoksa `null`: egzersizin kendi
 * değerleri düzenlenir. Egzersizin değerleri formda kalır; cihaz silinirse onlarla devam edilir.
 */
export function deviceLoadFields(device: DeviceLoadSettings | undefined): DeviceLoadFields | null {
  if (!device) return null;
  // Egzersizin değerleri yerine NaN: cihaz ağırlık vermiyorsa sonuç NaN kalır.
  const spec = loadSpecFor({ trackingType: 'weight_reps', loadStepKg: Number.NaN, minLoadKg: Number.NaN }, device);
  if (Number.isNaN(spec.minLoadKg)) return null;
  const blockStep = device.kind === 'selectorized' || device.kind === 'cable' ? (device.stepKg ?? null) : null;
  return {
    stepKg: spec.loadsKg ? blockStep : spec.loadStepKg,
    minKg: spec.minLoadKg,
    summary: describeDeviceLoads(device),
  };
}

/**
 * Formun değerlerinden `/api/exercises` gövdesi: video bağlantısı sağlayıcı + kimliğe çevrilir
 * (tanınmayan bağlantı gitmez); aparat yalnız cihazın aparatlarından biriyse gider (cihaz değişince
 * gizli kalmış seçim düşer); düzenlemede mevcut kimlik eklenir, yenide sunucu başlıktan üretir.
 */
export function toExercisePayload(
  values: ExerciseInput,
  options: { editingId?: string; attachmentIds: readonly string[] },
) {
  const { videoUrl: link, attachmentId, ...rest } = values;
  const video = link ? (parseVideoUrl(link) ?? undefined) : undefined;
  const attachment = attachmentId && options.attachmentIds.includes(attachmentId) ? attachmentId : undefined;
  return { ...rest, attachmentId: attachment, video, ...(options.editingId ? { id: options.editingId } : {}) };
}

/** Kütüphane değişikliğinin şablon ve programlara yansıdığını söyleyen satır (kullanılabilirlik 16). */
export const LIBRARY_IMPACT_NOTE =
  'Bu değişiklik bu egzersizi kullanan şablon ve programlarda, satırda özel cihaz/kural yoksa geçerli olur.';

/**
 * Düzenlemede cihaz açılıştakinden farklı mı (cihazsız ile boş seçim aynı): satırında kendi cihazı
 * olmayan şablon ve program satırları egzersizinkini kullanır, değişiklik onlara da geçer. Kural için
 * `sameRule` (satırında kendi kuralı olmayanlar egzersizin kuralını kullanır).
 */
export function sameDevice(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '') === (b ?? '');
}

/**
 * Cihaz ağırlıkları — bir cihazda gerçekten ayarlanabilen ağırlıklar ve gerçek direnç.
 *
 * Öneri motoru (`progression.ts`) bu listeden seçer: blokta 5 kg adım varsa 42 kg
 * önermez; ara ağırlık (+1,25, +2,5…) varsa ara değerleri de önerir; dambıl setinde
 * 17 kg yoksa 16 ya da 18 önerir.
 *
 * Makara oranı: çift makarada (2:1) blok yarı yol gider, kolda hissedilen direnç
 * seçilen ağırlığın yarısıdır. Kayıt ve öneri cihazda seçilen (görünen) ağırlıkla
 * yapılır; gerçek direnç yalnız cihazlar arası karşılaştırma içindir.
 *
 * Saf fonksiyonlar; yol takma adıyla çalışma zamanı içe aktarması yapmaz (testler
 * Node'un kendi test aracıyla çalışır).
 */

export const DEVICE_KINDS = [
  'selectorized',
  'cable',
  'plate_loaded',
  'barbell',
  'dumbbell',
  'kettlebell',
  'bodyweight',
  'band',
  'cardio',
] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  selectorized: 'Ağırlık bloklu makine',
  cable: 'Kablo',
  plate_loaded: 'Plaka yüklemeli makine',
  barbell: 'Bar',
  dumbbell: 'Dambıl seti',
  kettlebell: 'Kettlebell seti',
  bodyweight: 'Ekipmansız istasyon',
  band: 'Direnç bandı',
  cardio: 'Kardiyo aleti',
};

/** Cihaz türünün egzersizdeki genel ekipman karşılığı. */
export const KIND_EQUIPMENT = {
  selectorized: 'machine',
  cable: 'cable',
  plate_loaded: 'machine',
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  kettlebell: 'kettlebell',
  bodyweight: 'bodyweight',
  band: 'band',
  cardio: 'cardio_machine',
} as const satisfies Record<DeviceKind, string>;

/** Aparat takılabilen cihaz türleri. */
export function takesAttachments(kind: DeviceKind): boolean {
  return kind === 'cable' || kind === 'selectorized' || kind === 'plate_loaded';
}

export const PULLEY_RATIOS = [1, 2, 3, 4] as const;
export type PulleyRatio = (typeof PULLEY_RATIOS)[number];

/** Ağırlıkla ilgili cihaz alanları (hangileri anlamlı, türe bağlı). */
export type DeviceLoadSettings = {
  kind: DeviceKind;
  /** Blok: ilk blok · plaka yüklemeli: kızak/bar · bar: barın kendisi. */
  baseKg?: number;
  /** Blok adımı · plaka yüklemelide/barda en küçük toplam artış. */
  stepKg?: number;
  /** En ağır blok (blok ve kablo); plaka yüklemelide isteğe bağlı üst sınır. */
  maxKg?: number;
  /** Ara ağırlıklar: bloğa eklenebilen küçük ağırlıklar (+1,25, +2,5…); birlikte de takılabilir. */
  addOnsKg?: readonly number[];
  /** Kablo makara oranı: 1 = tek makara, 2 = çift makara (2:1)… */
  pulleyRatio?: PulleyRatio;
  /** Dambıl/kettlebell setindeki ağırlıklar. */
  weightsKg?: readonly number[];
};

/** Plaka yüklemeli ve barda üst sınır verilmemişse listenin gideceği yer. */
const DEFAULT_PLATE_MAX_KG = 400;
/** Güvenlik: sonsuz liste üretme. */
const MAX_LOADS = 600;

function clean(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

/** Ara ağırlıkların boş olmayan bütün toplamları (birlikte takılabilirler). */
function addOnSums(addOns: readonly number[]): number[] {
  const sums = new Set<number>();
  const list = addOns.filter((kg) => kg > 0).slice(0, 4);
  for (let mask = 1; mask < 1 << list.length; mask++) {
    let sum = 0;
    list.forEach((kg, index) => {
      if (mask & (1 << index)) sum += kg;
    });
    sums.add(clean(sum));
  }
  return [...sums];
}

function series(base: number, step: number, max: number): number[] {
  if (!(step > 0) || max < base) return [clean(base)];
  const loads: number[] = [];
  for (let kg = base; kg <= max + 1e-9 && loads.length < MAX_LOADS; kg += step) loads.push(clean(kg));
  return loads;
}

/**
 * Cihazda ayarlanabilen (görünen) ağırlıklar, küçükten büyüğe. Ağırlıksız cihazda
 * (istasyon, bant, kardiyo) ya da eksik ayarda `null`.
 */
export function deviceLoads(device: DeviceLoadSettings): number[] | null {
  let loads: number[];
  switch (device.kind) {
    case 'selectorized':
    case 'cable': {
      if (device.baseKg === undefined || !device.stepKg || device.maxKg === undefined) return null;
      const stack = series(device.baseKg, device.stepKg, device.maxKg);
      const extras = addOnSums(device.addOnsKg ?? []);
      loads = [...stack, ...stack.flatMap((kg) => extras.map((extra) => clean(kg + extra)))];
      break;
    }
    case 'plate_loaded':
    case 'barbell': {
      if (device.baseKg === undefined || !device.stepKg) return null;
      loads = series(device.baseKg, device.stepKg, device.maxKg ?? DEFAULT_PLATE_MAX_KG);
      break;
    }
    case 'dumbbell':
    case 'kettlebell': {
      if (!device.weightsKg?.length) return null;
      loads = device.weightsKg.map(clean);
      break;
    }
    default:
      return null;
  }
  return [...new Set(loads)].filter((kg) => kg >= 0).sort((a, b) => a - b);
}

/** Kolda hissedilen gerçek direnç: kabloda görünen ağırlık / makara oranı. */
export function effectiveLoadKg(device: Pick<DeviceLoadSettings, 'kind' | 'pulleyRatio'>, displayedKg: number): number {
  const ratio = device.kind === 'cable' ? (device.pulleyRatio ?? 1) : 1;
  return clean(displayedKg / ratio);
}

function kg(value: number): string {
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`;
}

/** Cihazın ağırlık ayarının kısa anlatımı (liste ve detay için). */
export function describeDeviceLoads(device: DeviceLoadSettings): string {
  const addOns = device.addOnsKg?.filter((value) => value > 0) ?? [];
  const addOnText = addOns.length ? ` · ara ağırlık ${addOns.map((value) => `+${kg(value)}`).join(', ')}` : '';
  switch (device.kind) {
    case 'selectorized':
      return `Blok ${kg(device.baseKg ?? 0)}–${kg(device.maxKg ?? 0)}, ${kg(device.stepKg ?? 0)} adım${addOnText}`;
    case 'cable': {
      const ratio = device.pulleyRatio ?? 1;
      const pulley = ratio === 1 ? 'tek makara (1:1)' : `${ratio}:1 makara — kolda ${ratio === 2 ? 'yarısı' : `1/${ratio}'i`} hissedilir`;
      return `Blok ${kg(device.baseKg ?? 0)}–${kg(device.maxKg ?? 0)}, ${kg(device.stepKg ?? 0)} adım${addOnText} · ${pulley}`;
    }
    case 'plate_loaded':
      return `Kızak ${kg(device.baseKg ?? 0)}, en küçük artış ${kg(device.stepKg ?? 0)}${device.maxKg ? `, en çok ${kg(device.maxKg)}` : ''}`;
    case 'barbell':
      return `Bar ${kg(device.baseKg ?? 0)}, en küçük artış ${kg(device.stepKg ?? 0)}`;
    case 'dumbbell':
    case 'kettlebell': {
      const weights = [...(device.weightsKg ?? [])].sort((a, b) => a - b);
      if (weights.length === 0) return 'Ağırlık listesi boş';
      return `${weights.length} ağırlık: ${kg(weights[0] as number)}–${kg(weights[weights.length - 1] as number)}`;
    }
    default:
      return 'Ağırlık ayarı yok';
  }
}

/**
 * Öneri motoruna verilecek yük tanımı. Bar ve plaka yüklemelide düzenli adım (bar
 * ağırlığı + en küçük artış); blok, kablo ve setlerde ayarlanabilen ağırlıkların
 * listesi (ara ağırlıklar, üst sınır, setteki boşluklar). Cihaz yoksa egzersizin
 * kendi adımı ve taban ağırlığı.
 */
export function loadSpecFor(
  exercise: { trackingType: 'weight_reps' | 'bodyweight_reps' | 'duration'; loadStepKg: number; minLoadKg: number },
  device?: DeviceLoadSettings | null,
): { trackingType: 'weight_reps' | 'bodyweight_reps' | 'duration'; loadStepKg: number; minLoadKg: number; loadsKg?: number[] } {
  if (device && (device.kind === 'barbell' || device.kind === 'plate_loaded') && device.stepKg && device.baseKg !== undefined) {
    return { trackingType: exercise.trackingType, loadStepKg: device.stepKg, minLoadKg: device.baseKg };
  }
  const loads = device ? deviceLoads(device) : null;
  if (!loads?.length) return { trackingType: exercise.trackingType, loadStepKg: exercise.loadStepKg, minLoadKg: exercise.minLoadKg };
  return { trackingType: exercise.trackingType, loadStepKg: 0, minLoadKg: loads[0] as number, loadsKg: loads };
}

import * as v from 'valibot';
import { DEVICE_KINDS, PULLEY_RATIOS, type DeviceKind } from '../device-loads.ts';
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from '../image.ts';
import { attachmentIdSchema, attachmentRefOf, ATTACHMENTS_MAX } from './attachment.ts';

/**
 * Cihaz şeması — sunucu ve istemci ortak.
 *
 * Hazır katalog pakette (`src/data/device-library.ts`), PT'nin eklediği ya da
 * değiştirdiği cihazlar uygulama repo'sunda (`data/devices.json`); aynı kimlikte PT'ninki
 * kazanır. Egzersiz `deviceId` ile bağlanır; ağırlık önerileri cihazın ağırlıklarından
 * seçilir (`src/lib/device-loads.ts`). Yol takma adıyla çalışma zamanı içe aktarması yok
 * (testler Node'un test aracıyla çalışır).
 */

/** Ağırlık bloğu ya da kablo: ilk blok, adım, en çok (+ ara ağırlıklar). */
const STACK_KINDS: readonly DeviceKind[] = ['selectorized', 'cable'];
/** Kızak/bar ağırlığı ve en küçük artış. */
const PLATE_KINDS: readonly DeviceKind[] = ['plate_loaded', 'barbell'];
/** Ağırlık listesi. */
const SET_KINDS: readonly DeviceKind[] = ['dumbbell', 'kettlebell'];

export const needsBase = (kind: DeviceKind) => STACK_KINDS.includes(kind) || PLATE_KINDS.includes(kind);
export const needsStep = needsBase;
export const needsMax = (kind: DeviceKind) => STACK_KINDS.includes(kind);
export const takesAddOns = (kind: DeviceKind) => STACK_KINDS.includes(kind);
export const needsWeights = (kind: DeviceKind) => SET_KINDS.includes(kind);

/** Cihaz görseli için görsel kuralları (aparat fotoğrafıyla ortak). */
export const DEVICE_IMAGE_TYPES = IMAGE_TYPES;
export const DEVICE_IMAGE_MAX_BYTES = IMAGE_MAX_BYTES;

/** Ara ağırlık seçenekleri (çoğu makinede takılan küçük ek ağırlıklar). */
export const ADD_ON_OPTIONS = [0.5, 1, 1.25, 1.75, 2, 2.5, 5] as const;

const kg = (max: number) =>
  v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(max, `En fazla ${max} kg.`));

const deviceFields = {
  name: v.pipe(v.string(), v.trim(), v.minLength(2, 'Cihaz adı çok kısa.'), v.maxLength(60, 'En fazla 60 karakter.')),
  kind: v.picklist(DEVICE_KINDS, 'Cihaz türünü seç.'),
  baseKg: v.optional(kg(500)),
  stepKg: v.optional(v.pipe(v.number('Sayı gir.'), v.minValue(0.25, 'En az 0,25 kg.'), v.maxValue(50, 'En fazla 50 kg.'))),
  maxKg: v.optional(kg(1000)),
  addOnsKg: v.optional(v.pipe(v.array(v.pipe(v.number(), v.minValue(0.25), v.maxValue(20))), v.maxLength(4, 'En fazla 4 ara ağırlık.'))),
  pulleyRatio: v.optional(v.picklist(PULLEY_RATIOS, 'Makara oranını seç.')),
  /** Bu cihaza takılabilen aparatlar: havuzdaki kimlikler (`data/attachments.json`). */
  attachments: v.optional(v.pipe(v.array(attachmentIdSchema), v.maxLength(ATTACHMENTS_MAX, `En fazla ${ATTACHMENTS_MAX} aparat.`))),
  weightsKg: v.optional(v.pipe(v.array(kg(200)), v.maxLength(60, 'En fazla 60 ağırlık.'))),
  notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300, 'En fazla 300 karakter.'))),
  /** Görselin uygulama repo'sundaki yolu (`media/devices/<id>-<özet>.<uzantı>`). Yalnız görsel ucu yazar. */
  image: v.optional(v.pipe(v.string(), v.regex(/^media\/devices\/[a-z0-9-]+\.(png|jpg|webp)$/))),
};

type Fields = { kind: DeviceKind; baseKg?: number; stepKg?: number; maxKg?: number; weightsKg?: readonly number[] };

/** Türün gerektirdiği ağırlık ayarlarındaki ilk eksik (alan, mesaj); tamamsa `null`. */
export function missingLoadSetting(input: Fields): { field: 'baseKg' | 'stepKg' | 'maxKg' | 'weightsKg'; message: string } | null {
  if (needsBase(input.kind) && input.baseKg === undefined) return { field: 'baseKg', message: 'Başlangıç ağırlığını gir.' };
  if (needsStep(input.kind) && !((input.stepKg ?? 0) > 0)) return { field: 'stepKg', message: 'Adımı gir.' };
  if (needsMax(input.kind) && !(input.maxKg !== undefined && input.maxKg > (input.baseKg ?? 0))) {
    return { field: 'maxKg', message: 'En ağır blok ilk bloktan ağır olmalı.' };
  }
  if (needsWeights(input.kind) && !(input.weightsKg?.length ?? 0)) return { field: 'weightsKg', message: 'En az bir ağırlık gir.' };
  return null;
}

// Hata ilgili alanın altında görünsün diye her alan için ayrı kontrol.
const check = (field: 'baseKg' | 'stepKg' | 'maxKg' | 'weightsKg') => (input: Fields) => missingLoadSetting(input)?.field !== field;
const MESSAGES = {
  baseKg: 'Başlangıç ağırlığını gir.',
  stepKg: 'Adımı gir.',
  maxKg: 'En ağır blok ilk bloktan ağır olmalı.',
  weightsKg: 'En az bir ağırlık gir.',
} as const;

/** Cihaz kimliği (slug); yeni kayıtta addan üretilir (`src/lib/slug.ts`). */
export const deviceIdSchema = v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/, 'Kimlik yalnız küçük harf, rakam ve tire içerebilir.'));

export const deviceSchema = v.pipe(
  v.object({
    id: deviceIdSchema,
    ...deviceFields,
  }),
  v.forward(v.partialCheck([['kind'], ['baseKg']], check('baseKg'), MESSAGES.baseKg), ['baseKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg']], check('stepKg'), MESSAGES.stepKg), ['stepKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg']], check('maxKg'), MESSAGES.maxKg), ['maxKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg'], ['weightsKg']], check('weightsKg'), MESSAGES.weightsKg), ['weightsKg']),
);
export type Device = v.InferOutput<typeof deviceSchema>;

/** Formun şeması: kimlik yok (yeni kayıtta addan üretilir). */
export const deviceFormSchema = v.pipe(
  v.object(deviceFields),
  v.forward(v.partialCheck([['kind'], ['baseKg']], check('baseKg'), MESSAGES.baseKg), ['baseKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg']], check('stepKg'), MESSAGES.stepKg), ['stepKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg']], check('maxKg'), MESSAGES.maxKg), ['maxKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg'], ['weightsKg']], check('weightsKg'), MESSAGES.weightsKg), ['weightsKg']),
);
export type DeviceInput = v.InferOutput<typeof deviceFormSchema>;

/** Kayıt ucu: kimliksiz gelen istek yeni cihazdır (kimlik addan üretilir). */
export const deviceSaveSchema = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))),
    ...deviceFields,
  }),
  v.forward(v.partialCheck([['kind'], ['baseKg']], check('baseKg'), MESSAGES.baseKg), ['baseKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg']], check('stepKg'), MESSAGES.stepKg), ['stepKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg']], check('maxKg'), MESSAGES.maxKg), ['maxKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg'], ['weightsKg']], check('weightsKg'), MESSAGES.weightsKg), ['weightsKg']),
);

/** Eski kayıtlarda aparat cihazın içinde ad ya da kayıttı; havuz kimliğine çevrilir. */
function migrateStoredDevice(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const item = input as Record<string, unknown>;
  return Array.isArray(item.attachments)
    ? { ...item, attachments: [...new Set(item.attachments.map(attachmentRefOf).filter(Boolean))] }
    : item;
}

export const customDevicesSchema = v.array(v.pipe(v.unknown(), v.transform(migrateStoredDevice), deviceSchema));

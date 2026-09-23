import * as v from 'valibot';
import { isCalendarDate, MEASUREMENT_SLOTS, SIDES, valueMax } from '../measurement-log.ts';
import { MEASUREMENT_IDS, type Sex } from '../measurements.ts';

/**
 * Ölçüm girişi — PT'nin formu ve API gövdesi (SPEC §7.5). Kayıt şeması `health.ts`'te;
 * burası girdiyi tarif eder: bir gün, o günün doldurulan değerleri ve cinsiyet bilinmiyorsa o.
 */

export const SEXES = ['female', 'male'] as const satisfies readonly Sex[];

/** Base UI Select boş metni "değer yok" sayar: bilinmeyen cinsiyet için boş olmayan işaret. */
export const SEX_UNKNOWN = 'unknown';
export const SEX_CHOICES = [SEX_UNKNOWN, ...SEXES] as const;
export type SexChoice = (typeof SEX_CHOICES)[number];
export const SEX_LABELS: Record<SexChoice, string> = { unknown: 'Belirtilmedi', female: 'Kadın', male: 'Erkek' };

export const calendarDateSchema = v.pipe(v.string('Tarih seç.'), v.check(isCalendarDate, 'Geçerli bir tarih seç.'));

/** Formun değer alanları: her ölçüm (iki taraflıda her taraf) isteğe bağlı bir sayı. */
const slotEntries: Record<string, v.OptionalSchema<v.GenericSchema<number>, undefined>> = Object.fromEntries(
  MEASUREMENT_SLOTS.map((slot) => [
    slot.key,
    v.optional(
      v.pipe(
        v.number('Sayı gir.'),
        v.minValue(0, 'Negatif olamaz.'),
        v.maxValue(valueMax(slot.id), `En fazla ${valueMax(slot.id)}.`),
      ),
    ),
  ]),
);

export const measurementFormSchema = v.object({
  date: calendarDateSchema,
  sex: v.picklist(SEX_CHOICES, 'Cinsiyeti seç.'),
  values: v.object(slotEntries),
});
export type MeasurementFormInput = v.InferOutput<typeof measurementFormSchema>;

const valueSchema = v.object({
  id: v.picklist(MEASUREMENT_IDS, 'Bilinmeyen ölçüm.'),
  value: v.number('Sayı gir.'),
  side: v.optional(v.picklist(SIDES, 'Taraf sol ya da sağ olmalı.')),
});

const valuesSchema = v.pipe(
  v.array(valueSchema),
  v.minLength(1, 'En az bir ölçüm gir.'),
  v.maxLength(MEASUREMENT_SLOTS.length, 'Çok fazla değer.'),
);

/** Yeni ölçüm: güne eklenir (aynı ölçüm varsa yenisi geçer). */
export const measurementAddSchema = v.object({
  date: calendarDateSchema,
  sex: v.optional(v.picklist(SEXES, 'Cinsiyeti seç.')),
  values: valuesSchema,
});
export type MeasurementAdd = v.InferOutput<typeof measurementAddSchema>;

/** Günü düzenleme: günün bütün değerleri gönderilir; gün adresten gelir. */
export const measurementDaySchema = v.object({
  sex: v.optional(v.picklist(SEXES, 'Cinsiyeti seç.')),
  values: valuesSchema,
});
export type MeasurementDayInput = v.InferOutput<typeof measurementDaySchema>;

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { defaultRule } from '../../../lib/progression.ts';
import { exerciseFormSchema, exerciseSchema, type ExerciseInput } from '../../../lib/schemas/exercise.ts';
import { UNRECOGNIZED_VIDEO_URL } from '../../../lib/video.ts';
import {
  describeDefaultRule,
  deviceLoadFields,
  LIBRARY_IMPACT_NOTE,
  sameDevice,
  sameRule,
  toExercisePayload,
} from './exercise-form-logic.ts';

/** Formun doldurulmuş hâli (cihazsız halter hareketi). */
const values: ExerciseInput = {
  title: 'Bench Press',
  description: '',
  cues: ['Kürek kemiklerini sıkıştır'],
  category: 'compound',
  trackingType: 'weight_reps',
  equipment: 'barbell',
  pattern: 'horizontal_push',
  primaryMuscles: ['chest_upper', 'chest_lower'],
  secondaryMuscles: ['triceps_long'],
  stabilizerMuscles: [],
  loadStepKg: 2.5,
  minLoadKg: 20,
  progression: { scheme: 'linear', targetMin: 5, targetMax: 8, targetRir: 1 },
  videoUrl: '',
};

/** Sunucunun kayıt şeması (`catalog-actions.ts`: kimlik isteğe bağlı). */
const saveSchema = v.object({ ...exerciseSchema.entries, id: v.optional(exerciseSchema.entries.id) });

describe('egzersiz formunun gövdesi', () => {
  test('yük ve ilerleme alanları gövdede gider, sunucunun şeması kabul eder', () => {
    const body = toExercisePayload(values, { attachmentIds: [] });
    assert.equal(body.loadStepKg, 2.5);
    assert.equal(body.minLoadKg, 20);
    assert.deepEqual(body.progression, { scheme: 'linear', targetMin: 5, targetMax: 8, targetRir: 1 });
    assert.equal('videoUrl' in body, false);
    assert.equal('id' in body, false);
    const parsed = v.safeParse(saveSchema, JSON.parse(JSON.stringify(body)));
    assert.ok(parsed.success, JSON.stringify(parsed.issues));
  });

  test('düzenlemede kimlik eklenir; video bağlantısı sağlayıcı ve kimliğe çevrilir', () => {
    const body = toExercisePayload(
      { ...values, videoUrl: 'https://youtu.be/dQw4w9WgXcQ' },
      { editingId: 'bench-press', attachmentIds: [] },
    );
    assert.equal(body.id, 'bench-press');
    assert.deepEqual(body.video, { provider: 'youtube', id: 'dQw4w9WgXcQ' });
    assert.ok(v.safeParse(saveSchema, JSON.parse(JSON.stringify(body))).success);
  });

  test('aparat yalnız cihazın aparatlarından biriyse gider; tanınmayan video gitmez', () => {
    const withAttachment = { ...values, deviceId: 'cable-station', attachmentId: 'rope' };
    assert.equal(toExercisePayload(withAttachment, { attachmentIds: ['rope', 'v-bar'] }).attachmentId, 'rope');
    assert.equal(toExercisePayload(withAttachment, { attachmentIds: ['v-bar'] }).attachmentId, undefined);
    assert.equal(toExercisePayload({ ...values, videoUrl: 'https://example.com/v' }, { attachmentIds: [] }).video, undefined);
  });

  test('tanınmayan video uyarısı şemanın gönderim mesajıyla aynı cümle', () => {
    const parsed = v.safeParse(exerciseFormSchema, { ...values, videoUrl: 'https://example.com/video' });
    assert.equal(parsed.success, false);
    assert.deepEqual(
      parsed.issues?.map((issue) => issue.message),
      [UNRECOGNIZED_VIDEO_URL],
    );
  });

  test('boş sayı kutusu (NaN) ve ters aralık doğrulamada Türkçe mesajla düşer', () => {
    const empty = v.safeParse(exerciseFormSchema, { ...values, loadStepKg: Number.NaN });
    assert.equal(empty.success, false);
    assert.equal(empty.issues?.[0]?.message, 'Sayı gir.');
    const reversed = v.safeParse(exerciseFormSchema, {
      ...values,
      progression: { scheme: 'double', targetMin: 12, targetMax: 8, targetRir: 2 },
    });
    assert.equal(reversed.success, false);
    assert.equal(reversed.issues?.[0]?.message, 'Üst sınır alt sınırdan küçük olamaz.');
  });
});

describe('cihazdan gelen yük', () => {
  test('bar ve plaka yüklemeli: adım ve taban cihazdan', () => {
    assert.deepEqual(deviceLoadFields({ kind: 'barbell', baseKg: 20, stepKg: 2.5 }), {
      stepKg: 2.5,
      minKg: 20,
      summary: 'Bar 20 kg, en küçük artış 2,5 kg',
    });
    assert.equal(deviceLoadFields({ kind: 'plate_loaded', baseKg: 37, stepKg: 5, maxKg: 200 })?.minKg, 37);
  });

  test('blok: blok adımı ve ilk blok; dambıl setinde düzenli adım yok', () => {
    const block = deviceLoadFields({ kind: 'selectorized', baseKg: 5, stepKg: 5, maxKg: 100, addOnsKg: [2.5] });
    assert.deepEqual([block?.stepKg, block?.minKg], [5, 5]);
    const dumbbells = deviceLoadFields({ kind: 'dumbbell', weightsKg: [4, 2, 6] });
    assert.deepEqual([dumbbells?.stepKg, dumbbells?.minKg], [null, 2]);
  });

  test('ağırlık vermeyen ya da ayarı eksik cihazda ve cihazsızda egzersizin kendi değerleri', () => {
    assert.equal(deviceLoadFields(undefined), null);
    assert.equal(deviceLoadFields({ kind: 'bodyweight' }), null);
    assert.equal(deviceLoadFields({ kind: 'band' }), null);
    // Blokta en ağır blok girilmemiş: liste kurulamaz.
    assert.equal(deviceLoadFields({ kind: 'cable', baseKg: 5, stepKg: 5 }), null);
  });
});

describe('ilerleme kuralı', () => {
  test('varsayılan türe göre tek satırda yazılır', () => {
    assert.equal(describeDefaultRule('compound', 'weight_reps'), 'Varsayılan: bileşik 6–10 tekrar · çift ilerleme · 2 tekrar yedekte');
    assert.equal(describeDefaultRule('isolation', 'weight_reps'), 'Varsayılan: izolasyon 10–15 tekrar · çift ilerleme · 1 tekrar yedekte');
    // Süreli harekette yedekte tekrar yok; ilerlemesiz kuralda da.
    assert.equal(describeDefaultRule('compound', 'duration'), 'Varsayılan: bileşik 30–60 sn · çift ilerleme');
    assert.equal(describeDefaultRule('warmup', 'bodyweight_reps'), 'Varsayılan: ısınma 12–20 tekrar · ilerleme yok');
  });

  test('kural karşılaştırması dört alanın hepsine bakar', () => {
    const rule = defaultRule('compound', 'weight_reps');
    assert.equal(sameRule({ ...rule }, rule), true);
    assert.equal(sameRule(undefined, rule), false);
    assert.equal(sameRule({ ...rule, targetRir: 3 }, rule), false);
    assert.equal(sameRule({ ...rule, targetMax: Number.NaN }, rule), false);
  });

  test('kütüphane etkisi: cihaz açılıştakinden farklıysa söylenir; cihazsız ile boş seçim aynı', () => {
    assert.equal(sameDevice('barbell-olympic', 'barbell-olympic'), true);
    assert.equal(sameDevice('barbell-olympic', undefined), false);
    assert.equal(sameDevice('barbell-olympic', 'smith-machine'), false);
    assert.equal(sameDevice(undefined, ''), true);
    assert.match(LIBRARY_IMPACT_NOTE, /satırda özel cihaz\/kural yoksa/);
  });
});

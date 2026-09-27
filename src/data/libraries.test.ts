import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENT_LIBRARY } from './attachment-library.ts';
import { DEVICE_LIBRARY } from './device-library.ts';
import { EXERCISE_LIBRARY } from './exercise-library.ts';
import { parseCondition } from '../lib/conditions.ts';
import { AVOID_TAG_IDS, AVOID_TAGS } from '../lib/constraints.ts';
import { isDeepMuscle } from '../lib/deep-muscles.ts';
import { SCREENING_TESTS } from '../lib/screening.ts';

/** Hazır kataloglar birbirine kimlikle bağlı; kopuk bağ sessizce boş liste demek. */
describe('hazır kataloglardaki bağlar', () => {
  const attachmentIds = new Set(ATTACHMENT_LIBRARY.map((item) => item.id));
  const deviceById = new Map(DEVICE_LIBRARY.map((device) => [device.id, device]));

  test('cihazların aparatları havuzda var', () => {
    for (const device of DEVICE_LIBRARY) {
      for (const id of device.attachments ?? []) {
        assert.ok(attachmentIds.has(id), `${device.id} → ${id} havuzda yok`);
      }
    }
  });

  test('egzersizlerin cihazı katalogda var', () => {
    for (const exercise of EXERCISE_LIBRARY) {
      if (exercise.deviceId) assert.ok(deviceById.has(exercise.deviceId), `${exercise.id} → ${exercise.deviceId} yok`);
    }
  });

  test('egzersizin aparatı cihazına takılı olanlardan', () => {
    for (const exercise of EXERCISE_LIBRARY) {
      if (!exercise.attachmentId) continue;
      assert.ok(attachmentIds.has(exercise.attachmentId), `${exercise.id} → ${exercise.attachmentId} havuzda yok`);
      const device = exercise.deviceId ? deviceById.get(exercise.deviceId) : undefined;
      assert.ok(
        device?.attachments?.includes(exercise.attachmentId),
        `${exercise.id}: ${exercise.attachmentId} cihazında (${exercise.deviceId}) takılı değil`,
      );
    }
  });

  test('medikal etiketlerdeki kısıt kimlikleri sözlükte var', () => {
    for (const exercise of EXERCISE_LIBRARY) {
      for (const value of [...(exercise.contraindications ?? []), ...(exercise.safeFor ?? [])]) {
        assert.ok(parseCondition(value), `${exercise.id} → ${value} çözülemedi`);
      }
    }
  });

  test('aktivasyon hedefleri derin kas sözlüğünden', () => {
    for (const exercise of EXERCISE_LIBRARY) {
      for (const muscle of exercise.activationTargets ?? []) {
        assert.ok(isDeepMuscle(muscle), `${exercise.id} → ${muscle} derin kas değil`);
      }
    }
  });

  test('bir hareket hem yasak hem güvenli listesinde olamaz', () => {
    for (const exercise of EXERCISE_LIBRARY) {
      const yasak = new Set((exercise.contraindications ?? []).map((value) => value.split(':')[0]));
      for (const value of exercise.safeFor ?? []) {
        assert.ok(!yasak.has(value.split(':')[0]), `${exercise.id} → ${value} iki listede birden`);
      }
    }
  });
});

/**
 * Kaçınılacak hareketlerin kalıp aileleri (tasarım `kisit-tarama.md` §2.2, faz 3'ün ön koşulu): ailedeki her hazır
 * hareket, kaçınmanın okuduğu etiketleri taşır. Eksik etiket "Değiştir"de kaçınılan hareketi geri önerirdi.
 */
describe('kaçınma aileleri etiketli', () => {
  for (const tag of AVOID_TAG_IDS) {
    const { families, reads } = AVOID_TAGS[tag];
    if (families.length === 0) continue;
    test(`${tag}: ${families.join(', ')} → ${reads.join(', ')}`, () => {
      const members = EXERCISE_LIBRARY.filter((exercise) => exercise.pattern && families.includes(exercise.pattern));
      assert.ok(members.length > 0, `${tag}: ailede hareket yok`);
      for (const exercise of members) {
        for (const field of reads) {
          assert.ok((exercise as Record<string, unknown>)[field] !== undefined, `${exercise.id}: ${field} eksik (${tag})`);
        }
      }
    });
  }
});

/** Taramanın gerileme ve ilerleme listeleri paketteki kütüphanenin kimlikleri (§4.6). */
describe('tarama listeleri kütüphanede', () => {
  const ids = new Set(EXERCISE_LIBRARY.map((exercise) => exercise.id));
  test('her testin gerileme ve ilerleme hareketleri var', () => {
    for (const test of Object.values(SCREENING_TESTS)) {
      for (const id of [...test.regress, ...test.progress]) assert.ok(ids.has(id), `${test.id} → ${id} kütüphanede yok`);
      assert.ok(test.regress.length > 0 && test.progress.length > 0, test.id);
    }
  });
});

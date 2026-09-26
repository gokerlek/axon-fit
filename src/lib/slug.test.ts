import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { attachmentIdSchema } from './schemas/attachment.ts';
import { deviceIdSchema } from './schemas/device.ts';
import { exerciseSchema } from './schemas/exercise.ts';
import { newRecordId, slugify } from './slug.ts';

const exerciseIdSchema = exerciseSchema.entries.id;

describe('addan kimlik', () => {
  test('Türkçe harfler ve işaretler sadeleşir', () => {
    assert.equal(slugify('Ters Tutuş Lat Pulldown', new Set()), 'ters-tutus-lat-pulldown');
    assert.equal(slugify('  Çekiş (geniş)  ', new Set()), 'cekis-genis');
  });

  test('çakışınca sonuna sayı eklenir', () => {
    assert.equal(slugify('Squat', new Set(['squat'])), 'squat-2');
    assert.equal(slugify('Squat', new Set(['squat', 'squat-2'])), 'squat-3');
  });

  test('tek karakterlik ad iki karakterden kısa kimlik üretmez', () => {
    assert.equal(slugify('V.', new Set()), 'v-1');
    assert.equal(slugify('Ü.', new Set()), 'u-1');
    assert.equal(slugify('T-', new Set()), 't-1');
    assert.equal(slugify('5.', new Set()), '5-1');
    assert.equal(slugify('V.', new Set(['v-1'])), 'v-2');
  });

  test('iki karakter yeterli; boş sonuç eskisi gibi düşer', () => {
    assert.equal(slugify('Ab', new Set()), 'ab');
    assert.equal(slugify('拉力', new Set()), 'egzersiz');
  });

  test('üretilen kimlik egzersiz, cihaz ve aparat kimlik kuralını geçer', () => {
    for (const name of ['V.', 'Ü.', 'T-', '5.', 'X!', 'Ab', '拉力', 'Çok uzun bir cihaz adı '.repeat(3)]) {
      const id = slugify(name, new Set());
      assert.ok(v.is(exerciseIdSchema, id), `${name} → ${id}`);
      assert.ok(v.is(deviceIdSchema, id), `${name} → ${id}`);
      assert.ok(v.is(attachmentIdSchema, id), `${name} → ${id}`);
    }
  });
});

describe('yeni kaydın kimliği yazmadan önce doğrulanır', () => {
  test('geçerli kimlik döner', () => {
    assert.equal(newRecordId('V.', new Set(), exerciseIdSchema), 'v-1');
    assert.equal(newRecordId('Benim Kablo', new Set(), deviceIdSchema), 'benim-kablo');
  });

  test('kuralı geçmeyen kimlik yerine null: hiçbir şey yazılmaz', () => {
    // 50 karakterlik kök ve 98 çakışmadan sonra zaman damgalı kimlik 60 karakteri aşar.
    const base = 'a'.repeat(50);
    const taken = new Set([base, ...Array.from({ length: 98 }, (_, i) => `${base}-${i + 2}`)]);
    assert.equal(newRecordId('a'.repeat(60), taken, exerciseIdSchema), null);
    assert.equal(newRecordId('a'.repeat(60), taken, deviceIdSchema), null);
  });
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { ATTACHMENT_LIBRARY } from '../../data/attachment-library.ts';
import { newRecordId } from '../slug.ts';
import { attachmentIdOf, attachmentIdSchema, attachmentRefOf, LEGACY_ATTACHMENT_IDS } from './attachment.ts';
import { customDevicesSchema } from './device.ts';

describe('aparat havuzundaki kimlik', () => {
  test('ad kimliğe çevrilir (Türkçe harfler ve parantez dahil)', () => {
    assert.equal(attachmentIdOf('Halat'), 'halat');
    assert.equal(attachmentIdOf('V bar (üçgen)'), 'v-bar-ucgen');
    assert.equal(attachmentIdOf('Ayak bilekliği'), 'ayak-bilekligi');
    assert.equal(attachmentIdOf('MAG tutamağı'), 'mag-tutamagi');
  });

  test('ilk sürümdeki sabit kimlikler havuzdakine eşlenir', () => {
    assert.equal(attachmentIdOf('rope'), 'halat');
    assert.equal(attachmentIdOf('single_handle'), 'tek-el-tutamagi');
  });

  test('havuz kimliği kendisine eşittir: iki kez çevirmek bozmaz', () => {
    for (const id of ['halat', 'v-bar-ucgen', 'genis-cekis-bari']) assert.equal(attachmentIdOf(id), id);
  });

  test('eski cihaz kayıtları (ad, kayıt, sabit kimlik) kimliğe çevrilir', () => {
    assert.equal(attachmentRefOf('Düz bar'), 'duz-bar');
    assert.equal(attachmentRefOf({ name: 'Halat', image: 'media/devices/x-halat-1.png' }), 'halat');
    assert.equal(attachmentRefOf('ez_bar'), 'ez-bar-aparati');
    assert.equal(attachmentRefOf(42), null);
  });

  test('boş ada düşülürse kimlik yine geçerli kalır', () => {
    assert.equal(attachmentIdOf('!!!'), 'aparat');
  });

  test('tek harflik ad iki karakterden kısa kimlik üretmez', () => {
    assert.equal(attachmentIdOf('V.'), 'v-1');
    assert.equal(attachmentIdOf('Ü'), 'u-1');
    assert.equal(attachmentIdOf('v-1'), 'v-1');
    for (const name of ['V.', 'Ü', '5', 'T-', '!!!', 'Halat']) {
      assert.ok(v.is(attachmentIdSchema, attachmentIdOf(name)), `${name} → ${attachmentIdOf(name)}`);
    }
  });

  test('tek harflik adla kayıtlı eski cihaz okunabilir kalır', () => {
    const parsed = v.safeParse(customDevicesSchema, [{ id: 'benim-kablo', name: 'Benim kablo', kind: 'bodyweight', attachments: ['V.', 'Halat'] }]);
    assert.ok(parsed.success);
    assert.deepEqual(parsed.output[0]?.attachments, ['v-1', 'halat']);
  });
});

describe('geçerli kimlik çevrilmez (yalnız eski ad ve sabit kimlik çevrilir)', () => {
  // 40 karakterlik ad: ilk aparat kökü alır, aynı adla ikincisi "-2" ile 42 karakter olur.
  const name40 = 'Uzun Adli Kablo Tutamagi Cift Kulplu Siy';
  const first = newRecordId(name40, new Set(), attachmentIdSchema);
  const second = newRecordId(name40, new Set([first ?? '']), attachmentIdSchema);

  test('40 karakteri aşan kimlik kırpılmaz', () => {
    assert.equal(name40.length, 40);
    assert.equal(first, 'uzun-adli-kablo-tutamagi-cift-kulplu-siy');
    assert.equal(second, 'uzun-adli-kablo-tutamagi-cift-kulplu-siy-2');
    assert.equal(attachmentIdOf(second ?? ''), second);
    assert.equal(attachmentRefOf(second), second);
  });

  test('cihaz ikinci aparatı seçtiyse okununca yine ikinciye bağlı kalır', () => {
    const parsed = v.safeParse(customDevicesSchema, [
      { id: 'benim-kablo', name: 'Benim kablo', kind: 'cable', baseKg: 5, stepKg: 5, maxKg: 50, attachments: [second, first] },
    ]);
    assert.ok(parsed.success);
    assert.deepEqual(parsed.output[0]?.attachments, [second, first]);
  });

  test('eski sabit kimlik yine çevrilir; nesnenin kendi özellikleri sözlük sayılmaz', () => {
    assert.equal(attachmentIdOf('rope'), 'halat');
    assert.equal(attachmentIdOf('constructor'), 'constructor');
    assert.equal(attachmentIdOf('toString'), 'tostring');
  });

  test('eski sabit kimlikler yeni aparata verilmez', () => {
    assert.ok(LEGACY_ATTACHMENT_IDS.includes('rope'));
    assert.equal(newRecordId('Rope', new Set(LEGACY_ATTACHMENT_IDS), attachmentIdSchema), 'rope-2');
  });
});

describe('hazır havuz', () => {
  test('her aparatın kimliği adından üretilebilir (eski kayıtlar da buna düşer)', () => {
    for (const attachment of ATTACHMENT_LIBRARY) assert.equal(attachmentIdOf(attachment.name), attachment.id);
  });

  test('kimlikler eşsiz', () => {
    assert.equal(new Set(ATTACHMENT_LIBRARY.map((item) => item.id)).size, ATTACHMENT_LIBRARY.length);
  });
});

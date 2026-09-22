import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENT_LIBRARY } from '../../data/attachment-library.ts';
import { attachmentIdOf, attachmentRefOf } from './attachment.ts';

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
});

describe('hazır havuz', () => {
  test('her aparatın kimliği adından üretilebilir (eski kayıtlar da buna düşer)', () => {
    for (const attachment of ATTACHMENT_LIBRARY) assert.equal(attachmentIdOf(attachment.name), attachment.id);
  });

  test('kimlikler eşsiz', () => {
    assert.equal(new Set(ATTACHMENT_LIBRARY.map((item) => item.id)).size, ATTACHMENT_LIBRARY.length);
  });
});

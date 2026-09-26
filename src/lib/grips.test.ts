import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { describeGrip, GRIP_LABELS, GRIPS } from './grips.ts';

describe('tutuş etiketleri', () => {
  test('parantez içi avucun yönünü söyler: bağlamdan bağımsız', () => {
    assert.equal(GRIP_LABELS.pronated, 'Pronasyon (avuç aşağı)');
    assert.equal(GRIP_LABELS.supinated, 'Supinasyon (avuç yukarı)');
    for (const grip of GRIPS) {
      const label = GRIP_LABELS[grip];
      assert.match(label, /^\S+ \(.+\)$/, `${grip}: kısa açıklama parantez içinde`);
      // "Ters/düz" harekete göre değişir; etiket yanıltmasın.
      assert.doesNotMatch(label, /(^|[\s(])(ters|düz)([\s),]|$)/iu, grip);
    }
  });

  test('özet genişlikle birlikte okunur', () => {
    assert.equal(describeGrip('supinated', 'narrow'), 'Dar supinasyon (avuç yukarı)');
    assert.equal(describeGrip('pronated', 'wide'), 'Geniş pronasyon (avuç aşağı)');
    assert.equal(describeGrip('neutral'), 'Nötr (avuçlar içe)');
    assert.equal(describeGrip(undefined, 'shoulder'), 'Omuz genişliği');
    assert.equal(describeGrip(), null);
  });

  test('"Ters Tutuş" hareketleri kütüphanede supinasyon ve "avuç yukarı" okunur', () => {
    const reverse = EXERCISE_LIBRARY.filter((exercise) => exercise.title.startsWith('Ters Tutuş'));
    assert.ok(reverse.length > 0);
    for (const exercise of reverse) {
      assert.equal(exercise.grip, 'supinated', exercise.id);
      assert.match(describeGrip(exercise.grip, exercise.gripWidth) ?? '', /avuç yukarı/, exercise.id);
    }
  });
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cautionIds } from './exercise-caution.ts';

describe('kısıt rozeti', () => {
  const exercises = [
    { id: 'deadlift', contraindications: ['lumbar_disc_herniation'] },
    { id: 'plank', safeFor: ['lumbar_disc_herniation'] },
  ];

  test('elle yasaklanan hareket işaretlenir, ötekiler işaretlenmez', () => {
    assert.deepEqual([...cautionIds(exercises, ['lumbar_disc_herniation'])], ['deadlift']);
  });

  test('kısıt yoksa ya da tanınmıyorsa boş', () => {
    assert.equal(cautionIds(exercises, []).size, 0);
    assert.equal(cautionIds(exercises, ['bilinmeyen']).size, 0);
  });
});

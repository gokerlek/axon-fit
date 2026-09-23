import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { niceScale } from './chart-scale.ts';

describe('grafik ölçeği', () => {
  test('etiketler yuvarlak sayılar, veriyi kapsar', () => {
    assert.deepEqual(niceScale(68.9, 71.4), { domain: [68, 72], ticks: [68, 69, 70, 71, 72] });
    assert.deepEqual(niceScale(11.5, 14.2), { domain: [11, 15], ticks: [11, 12, 13, 14, 15] });
    assert.deepEqual(niceScale(48, 80), { domain: [40, 80], ticks: [40, 50, 60, 70, 80] });
  });

  test('en küçük aralık: hata payı içindeki oynama büyütülmez', () => {
    // Kalça 100 → 99 cm, hata payı 2 cm: eksen en az 4 cm.
    const { domain, ticks } = niceScale(99, 100, { minSpan: 4 });
    assert.ok(domain[0] <= 97.5 && domain[1] >= 101.5);
    assert.ok(ticks.every((tick) => Number.isInteger(tick)));
  });

  test('tek değer ve sıfıra yakın değer', () => {
    const single = niceScale(80, 80);
    assert.ok(single.domain[0] < 80 && single.domain[1] > 80);
    const zero = niceScale(0, 0);
    assert.deepEqual(zero.domain[0], 0);
    assert.ok(zero.ticks.every((tick) => tick >= 0));
  });

  test('negatif olmayan ölçüm eksende de sıfırın altına inmez', () => {
    const { domain, ticks } = niceScale(1, 2, { minSpan: 10 });
    assert.equal(domain[0], 0);
    assert.ok(ticks.every((tick) => tick >= 0));
  });
});

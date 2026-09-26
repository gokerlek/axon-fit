import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dateTicks, niceScale } from './chart-scale.ts';

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

  test('sıfır koruması veri minimumuyla karar verir: tahmin bandı eksiye inse de eksen inmez', () => {
    // ODI verisi 5–30, bant −5,8'e iniyor: eksen −10'dan başlamasın.
    const { domain, ticks } = niceScale(-5.8, 30, { nonNegative: true });
    assert.equal(domain[0], 0);
    assert.ok(ticks.every((tick) => tick >= 0));
    // Gerçekten negatif veri (koruma istenmemiş) kırpılmaz.
    assert.ok(niceScale(-5.8, 30).domain[0] < 0);
  });
});

describe('eksen adımları', () => {
  test('etiketler 1, 2 ve 5 adımlı: 81 / 81,5 / 82, çeyrekli etiket yok', () => {
    assert.deepEqual(niceScale(81, 82).ticks, [81, 81.5, 82]);
    assert.deepEqual(niceScale(81.1, 82.1), { domain: [81, 82.5], ticks: [81, 81.5, 82, 82.5] });
    for (const [low, high] of [
      [81, 82],
      [0.3, 1.1],
      [12, 22],
      [87.9, 91.2],
      [98.6, 101.4],
    ] as const) {
      for (const tick of niceScale(low, high).ticks) {
        const decimals = String(tick).split('.')[1]?.length ?? 0;
        assert.ok(decimals <= 1, `${low}–${high}: ${tick}`);
      }
    }
  });
});

describe('tarih etiketleri', () => {
  const gun = (i: number) => Date.UTC(2026, 7, 11 + i * 7);

  test('altı ölçüm günü ve tahmin ucu: hiçbir ölçüm günü düşmez', () => {
    const olcum = Array.from({ length: 6 }, (_, i) => gun(i));
    const ticks = dateTicks(olcum, { extra: gun(8) });
    assert.deepEqual(ticks, [...olcum, gun(8)]);
  });

  test('çok ölçümde eşit seyreltilir; ilk ve son ölçüm kalır; tekrar yok', () => {
    const olcum = Array.from({ length: 20 }, (_, i) => gun(i));
    const ticks = dateTicks(olcum, { max: 6 });
    assert.equal(ticks.length, 6);
    assert.equal(ticks[0], olcum[0]);
    assert.equal(ticks.at(-1), olcum.at(-1));
    assert.deepEqual(dateTicks([gun(0), gun(0), gun(1)]), [gun(0), gun(1)]);
    assert.deepEqual(dateTicks([gun(0), gun(1)], { extra: gun(1) }), [gun(0), gun(1)]);
  });
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  etaToGoal,
  FORECAST_MAX_DAYS,
  forecast,
  normalizePoints,
  rangeStart,
  theilSen,
  trendStatus,
  valueAt,
  withinRange,
  type Point,
} from './trend.ts';

/** `start`tan başlayıp `every` günde bir, `values` sırasıyla noktalar. */
function series(start: string, every: number, values: number[]): Point[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => ({ date: new Date(base + i * every * 86_400_000).toISOString().slice(0, 10), value }));
}

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

describe('eğilim çizgisi', () => {
  test('düz çizgide eğim ve değer tam', () => {
    const fit = theilSen(series('2026-01-05', 7, [90, 89, 88, 87]))!;
    close(fit.slopePerDay * 7, -1);
    close(valueAt(fit, '2026-01-26'), 87);
  });

  test('tek hatalı ölçüm çizgiyi sürükleyemez', () => {
    const temiz = theilSen(series('2026-01-05', 7, [90, 89, 88, 87, 86, 85]))!;
    const hatali = theilSen(series('2026-01-05', 7, [90, 89, 70, 87, 86, 85]))!;
    close(hatali.slopePerDay, temiz.slopePerDay, 0.03);
  });

  test('aynı günün ölçümleri ortalanır, sıra tarihe göre', () => {
    assert.deepEqual(
      normalizePoints([
        { date: '2026-02-02', value: 80 },
        { date: '2026-01-26', value: 81 },
        { date: '2026-02-02', value: 82 },
      ]),
      [
        { date: '2026-01-26', value: 81 },
        { date: '2026-02-02', value: 81 },
      ],
    );
  });
});

describe('tahmin', () => {
  test('az veride tahmin yok', () => {
    assert.deepEqual(forecast(series('2026-01-05', 7, [90, 89, 88])), { ok: false, reason: 'too_few_points' });
    assert.deepEqual(forecast(series('2026-01-05', 3, [90, 89, 88, 87, 86])), { ok: false, reason: 'too_short_span' });
  });

  test('ufuk gözlenen sürenin yarısını ve 8 haftayı geçmez', () => {
    // 6 hafta veri → en fazla 3 hafta ileri.
    const kisa = forecast(series('2026-01-05', 7, [90, 89, 88, 87, 86, 85, 84]));
    assert.ok(kisa.ok);
    assert.equal(kisa.horizonDays, 21);
    // 1 yıl veri → 8 haftada durur.
    const uzun = forecast(series('2025-01-06', 14, Array.from({ length: 27 }, (_, i) => 100 - i)));
    assert.ok(uzun.ok);
    assert.equal(uzun.horizonDays, FORECAST_MAX_DAYS);
  });

  test('tahmin son noktadan başlar, çizgiyi sürdürür; gürültü bandı genişletir', () => {
    const duz = forecast(series('2026-01-05', 7, [90, 89, 88, 87, 86, 85, 84]));
    assert.ok(duz.ok);
    assert.equal(duz.points[0]?.date, '2026-02-16');
    close(duz.slopePerWeek, -1);
    close(duz.points.at(-1)!.value, 81);
    // Gürültüsüz veride bant sıfır; gürültülüde açık.
    close(duz.points.at(-1)!.high - duz.points.at(-1)!.low, 0);
    const gurultulu = forecast(series('2026-01-05', 7, [90, 88.5, 88.4, 86.2, 86.3, 84.6, 84.2]));
    assert.ok(gurultulu.ok);
    assert.ok(gurultulu.points.at(-1)!.high - gurultulu.points.at(-1)!.low > 0.5);
  });

  test('hedef tarihi: doğru yöndeyse gün, ters yöndeyse ya da çok uzaksa yok', () => {
    const fit = theilSen(series('2026-01-05', 7, [90, 89, 88, 87]))!; // haftada −1
    assert.equal(etaToGoal(fit, 85, '2026-01-26'), '2026-02-09'); // 87 → 85, haftada 1
    assert.equal(etaToGoal(fit, 95, '2026-01-26'), null);
    assert.equal(etaToGoal(fit, 20, '2026-01-26'), null); // 70 hafta
  });
});

describe('plato ve gerileme', () => {
  // Otur-kalk: 2,3 sn altı ölçüm hatası; düşük süre iyi.
  const oturKalk = { threshold: 2.3, relative: false, better: 'lower' as const };
  // Kuvvet: %2,5 altı değişim gürültü; yüksek iyi.
  const kuvvet = { threshold: 0.025, relative: true, better: 'higher' as const };

  test('pencerede ölçüm hatası içinde kalan değişim platodur', () => {
    const sonuc = trendStatus(series('2026-01-05', 7, [12.4, 12.1, 12.6, 12.2, 12.3]), oturKalk);
    assert.equal(sonuc.status, 'plateau');
  });

  test('payı iyi yönde aşarsa gelişme, kötü yönde aşarsa gerileme', () => {
    assert.equal(trendStatus(series('2026-01-05', 7, [15, 14, 13, 12, 11]), oturKalk).status, 'improving');
    assert.equal(trendStatus(series('2026-01-05', 7, [11, 12, 13, 14, 15]), oturKalk).status, 'declining');
    assert.equal(trendStatus(series('2026-01-05', 7, [100, 102, 104, 106, 108]), kuvvet).status, 'improving');
    assert.equal(trendStatus(series('2026-01-05', 7, [100, 100.5, 101, 100.5, 101]), kuvvet).status, 'plateau');
  });

  test('pencere dolmadan karar yok', () => {
    assert.equal(trendStatus(series('2026-01-05', 7, [12, 12.1]), oturKalk).status, 'insufficient');
    // 3 nokta var ama yalnız son 10 günde: 4 haftalık pencereyi kapsamıyor.
    assert.equal(trendStatus(series('2026-01-20', 5, [12, 12.1, 12.2]), oturKalk).status, 'insufficient');
  });
});

describe('tarih süzgeci', () => {
  test('hazır aralıklar bugünden geriye; uçlar dahil', () => {
    assert.equal(rangeStart('4h', '2026-09-24'), '2026-08-27');
    assert.equal(rangeStart('tumu', '2026-09-24'), undefined);
    const pts = series('2026-08-20', 7, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(
      withinRange(pts, '2026-08-27', '2026-09-10').map((point) => point.date),
      ['2026-08-27', '2026-09-03', '2026-09-10'],
    );
  });
});

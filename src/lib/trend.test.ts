import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysBetween,
  etaToGoal,
  FORECAST_MAX_DAYS,
  forecast,
  forecastAsOf,
  normalizePoints,
  rangeStart,
  shiftDay,
  slopeBand,
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

  test('yalnız uzun çiftler istenirse birkaç güne sıkışmış ölçümler eğim vermez', () => {
    assert.equal(theilSen(series('2026-01-05', 2, [90, 89, 88]), { minPairDays: 14 }), null);
    // Uzun çift varsa eğim yalnız ondan: 2 günlük −1 cm'ler karışmaz.
    const fit = theilSen([{ date: '2026-01-01', value: 90 }, ...series('2026-01-29', 2, [90, 89, 88])], { minPairDays: 14 })!;
    close(fit.slopePerDay, -1 / 30);
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

  test('ufuk son tahmin noktasıdır: "N hafta sonra" ile yazılan tarih aynı günü gösterir', () => {
    const gunSonra = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    for (const span of [21, 22, 25, 28, 32, 40, 60]) {
      const pts = [0, 7, 14, span].map((days, i) => ({ date: gunSonra('2026-08-01', days), value: 80 - i }));
      const sonuc = forecast(pts);
      assert.ok(sonuc.ok, `${span} günlük veri`);
      assert.equal(sonuc.horizonDays % 7, 0, `${span} günlük veri`);
      assert.equal(sonuc.points.at(-1)!.date, gunSonra(pts.at(-1)!.date, sonuc.horizonDays), `${span} günlük veri`);
    }
    // 22 günlük veri: yarısı 11 gün, son nokta 7 gün sonra → "1 hafta" (eskiden "2 hafta" yazıyordu).
    const yirmiIki = forecast([0, 7, 14, 22].map((days, i) => ({ date: gunSonra('2026-08-01', days), value: 80 - i })));
    assert.ok(yirmiIki.ok);
    assert.equal(yirmiIki.horizonDays, 7);
  });

  test('tahmin ve bandı ölçümün geçerli aralığına kırpılır', () => {
    // ODI haftalık 30 → 20 → 12 → 5: çizgi sıfırın altına iner (≈ %−3,8).
    const odi = series('2026-09-01', 7, [30, 20, 12, 5]);
    const serbest = forecast(odi);
    assert.ok(serbest.ok && serbest.points.at(-1)!.value < 0);
    const kirpik = forecast(odi, { min: 0, max: 100 });
    assert.ok(kirpik.ok);
    for (const point of kirpik.points) assert.ok(point.low >= 0 && point.value >= 0 && point.high >= 0, JSON.stringify(point));
    // Üst sınır: VISA-P 70 → 98 (haftada ~9 puan) 100'ü geçmez.
    const visa = series('2026-09-01', 7, [70, 80, 89, 98]);
    const visaSerbest = forecast(visa);
    assert.ok(visaSerbest.ok && visaSerbest.points.at(-1)!.value > 100);
    const visaKirpik = forecast(visa, { min: 0, max: 100 });
    assert.ok(visaKirpik.ok);
    for (const point of visaKirpik.points) assert.ok(point.value <= 100 && point.high <= 100, JSON.stringify(point));
  });

  test('çizgi sınıra değiyorsa tahmin değdiği gün biter; sınırdaki bant tek noktaya çökmez', () => {
    // ODI haftalık 30 → 20 → 12 → 5: çizgi son ölçümden 4 gün sonra %0'a iner. Eskiden bir hafta
    // sonrası "≈ %0; olası aralık 0–0" yazılıyordu.
    const odi = forecast(series('2026-09-01', 7, [30, 20, 12, 5]), { min: 0, max: 100 });
    assert.ok(odi.ok);
    assert.deepEqual(odi.bound, { value: 0, days: 4 });
    assert.equal(odi.horizonDays, 4);
    assert.deepEqual(
      odi.points.map((point) => point.date),
      ['2026-09-22', '2026-09-26'],
    );
    const sinirda = odi.points.at(-1)!;
    assert.equal(sinirda.value, 0);
    assert.ok(sinirda.high > sinirda.low, JSON.stringify(sinirda));
    // Üst sınır: VISA-P 70 → 98 iki gün sonra 100'e ulaşır.
    const visa = forecast(series('2026-09-01', 7, [70, 80, 89, 98]), { min: 0, max: 100 });
    assert.ok(visa.ok);
    assert.deepEqual(visa.bound, { value: 100, days: 2 });
    // Sınırdan uzak çizgide ufuk adımın katı, sınır yok (bel: üst sınır 1000).
    const bel = forecast(series('2026-08-01', 7, [90, 89, 88.2, 87.5, 86.6]), { min: 0, max: 1000 });
    assert.ok(bel.ok);
    assert.deepEqual([bel.bound, bel.horizonDays], [null, 14]);
    // Son ölçümde sınıra değmiş çizgi: ileriye tahmin yok.
    const sifir = forecast(series('2026-08-01', 7, [30, 20, 10, 0]), { min: 0, max: 100 });
    assert.ok(sifir.ok);
    assert.deepEqual([sifir.bound?.days, sifir.points.length], [0, 1]);
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

  test('pencereden çok önceki tek ölçüm pencereyi dolu göstermez', () => {
    const bel = { threshold: 2, relative: false, better: 'lower' as const };
    const son = series('2026-09-12', 5, [84, 83.6, 83.2]); // 12, 17, 22 Eylül
    assert.equal(trendStatus(son, bel).status, 'insufficient');
    // 6 ay önceki ölçüm denetimi geçirtmez ("Son 4 hafta: durağan" değil).
    assert.equal(trendStatus([{ date: '2026-03-01', value: 95 }, ...son], bel).status, 'insufficient');
    // Haftada 0,5 cm düzenli düşüş ama pencerede yalnız son 14 gün var: karar yok.
    const duzenli = [{ date: '2026-06-01', value: 90 }, ...series('2026-09-08', 7, [82, 81.5, 81])];
    assert.equal(trendStatus(duzenli, bel).status, 'insufficient');
  });

  test('pencere başına bir haftadan yakın önceki ölçüm çizgiye katılır; değişim tam pencere boyunca', () => {
    // 10 günde bir: pencerenin ilk ölçümü başa 8 gün uzak, öncekisi başa 2 gün kala.
    const bel = { threshold: 2, relative: false, better: 'lower' as const };
    const sonuc = trendStatus(series('2026-08-13', 10, [86, 85, 84, 83]), bel);
    assert.equal(sonuc.status, 'improving');
    assert.equal(sonuc.from, '2026-08-15');
    close(sonuc.change!, -2.8); // 28 gün × −0,1 cm, 20 günlük −2 değil
  });

  test('birkaç güne sıkışmış ölçümlerin eğimi pencereye uzatılmaz: gürültü gelişme ya da gerileme olmaz', () => {
    const bel = { threshold: 2, relative: false, better: 'lower' as const };
    // Bel ayda bir, son hafta her seansta ölçülmüş. Pencere başı 28 Ağu, 27 Ağu çapa; 27 Ağu 88 → 25 Eyl
    // 87 (gerçek fark −1 cm, eşik 2). Eskiden kümenin 2 günlük eğimleri 28 güne uzatılıp "−4 cm gelişme" oluyordu.
    const kume = [
      { date: '2026-07-27', value: 88.4 },
      { date: '2026-08-27', value: 88 },
      { date: '2026-09-21', value: 88 },
      { date: '2026-09-23', value: 87.5 },
      { date: '2026-09-25', value: 87 },
    ];
    const asagi = trendStatus(kume, bel);
    assert.equal(asagi.status, 'plateau');
    close(asagi.change!, (-0.5 / 27) * 28); // uzun çiftlerin ortancası: 27 Ağu → 23 Eyl
    // Küme yukarı giderse (88 → 88,5 → 89) "gerileme +4 cm" değil.
    const yukari = kume.map((point, i) => (i >= 2 ? { ...point, value: 88 + (i - 2) * 0.5 } : point));
    assert.equal(trendStatus(yukari, bel).status, 'plateau');
    // Çapasız: pencerenin ilk ölçümü başa 2 gün, sonra aynı küme (bu zayıflık çapadan önce de vardı: −3,75).
    const basaYakin = [{ date: '2026-08-30', value: 88 }, ...kume.slice(2)];
    assert.equal(trendStatus(basaYakin, bel).status, 'plateau');
    // Çapa + bir yıl önceki eski ölçüm: eskisi hesaba girmez.
    assert.equal(trendStatus([{ date: '2025-09-01', value: 95 }, ...kume.slice(1)], bel).status, 'plateau');
    // Yalnız çok eski ölçüm + küme: pencerenin başı bilinmiyor.
    assert.equal(trendStatus([{ date: '2026-03-01', value: 88 }, ...kume.slice(2)], bel).status, 'insufficient');
    // Üç ardışık günde 90 → 89 → 88: günlük −1 cm "28 günde −15 cm" diye uzatılmaz.
    const ucGun = [{ date: '2026-08-23', value: 90 }, ...series('2026-09-19', 1, [90, 89, 88])];
    assert.equal(trendStatus(ucGun, bel).status, 'plateau');
  });

  test('küme varken de pencere boyunca gerçek değişim görünür', () => {
    const bel = { threshold: 2, relative: false, better: 'lower' as const };
    // 27 Ağu 90; 21/23/25 Eyl 87,5 / 87,2 / 87: dört haftada ~3 cm düşüş.
    const sonuc = trendStatus(
      [
        { date: '2026-08-27', value: 90 },
        { date: '2026-09-21', value: 87.5 },
        { date: '2026-09-23', value: 87.2 },
        { date: '2026-09-25', value: 87 },
      ],
      bel,
    );
    assert.equal(sonuc.status, 'improving');
    close(sonuc.change!, (-3 / 29) * 28);
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

describe('tahmin bugüne göre', () => {
  // Haftalık 90 → 87 (1–22 Ağustos): ufuk 1 hafta, son tahmin günü 29 Ağustos.
  const tahmin = forecast(series('2026-08-01', 7, [90, 89, 88, 87]));

  test('ufku geçmişte kalan tahmin gösterilmez: son ölçüm ve kaç gün önce', () => {
    assert.deepEqual(forecastAsOf(tahmin, '2026-09-26'), {
      kind: 'stale',
      lastDate: '2026-08-22',
      endDate: '2026-08-29',
      daysSince: 35,
    });
  });

  test('bugün ufkun içindeyse bugünün tahmini de döner; son ölçüm günü bugünse yok', () => {
    const view = forecastAsOf(tahmin, '2026-08-25');
    assert.equal(view.kind, 'current');
    if (view.kind !== 'current') return;
    assert.equal(view.today?.date, '2026-08-25');
    close(view.today!.value, 87 - 3 / 7, 1e-9);
    assert.equal(forecastAsOf(tahmin, '2026-08-29').kind, 'current');
    const ayniGun = forecastAsOf(tahmin, '2026-08-22');
    assert.ok(ayniGun.kind === 'current' && ayniGun.today === null);
  });

  test('veri yetmiyorsa neden olduğu gibi', () => {
    assert.deepEqual(forecastAsOf(forecast(series('2026-08-01', 7, [90, 89])), '2026-09-26'), {
      kind: 'insufficient',
      forecast: { ok: false, reason: 'too_few_points' },
    });
  });
});

describe('eğimin güven aralığı (Sen 1968)', () => {
  // Haftalık noktalar; eğimler birim/gün, beklenenler haftalık (× 7) yazılı.
  const week = (band: ReturnType<typeof slopeBand>) => band && { low: band.low * 7, high: band.high * 7, slope: band.slopePerDay * 7 };

  const cases: { name: string; values: number[]; low: number; high: number; slope: number }[] = [
    // Bütün ikili eğimler aynı: aralık tek nokta.
    { name: 'düz artış', values: [100, 102, 104, 106], low: 2, high: 2, slope: 2 },
    { name: 'düz azalış', values: [106, 104, 102, 100], low: -2, high: -2, slope: -2 },
    // Eğimler (hafta) −2, 1, 1, 2, 4, 4; N = 6, Var(S) = 4·3·13/18, C = 1,28·√Var ≈ 3,768.
    // Alt uç 1,116. sıra (−2 ile 1 arası), üst uç 5,884. sıra (4 ile 4 arası).
    { name: 'oynak dört nokta', values: [100, 104, 102, 106], low: -2 + 3 * ((6 - 1.28 * Math.sqrt(156 / 18)) / 2 - 1), high: 4, slope: 1.5 },
    // Hepsi aynı değer: bağ düzeltmesi varyansı sıfırlar, aralık sıfırda.
    { name: 'hep aynı değer', values: [80, 80, 80, 80], low: 0, high: 0, slope: 0 },
  ];
  for (const item of cases) {
    test(item.name, () => {
      const band = week(slopeBand(series('2026-06-01', 7, item.values)))!;
      close(band.low, item.low, 1e-9);
      close(band.high, item.high, 1e-9);
      close(band.slope, item.slope, 1e-9);
    });
  }

  test('orta eğim Theil–Sen eğimiyle aynı', () => {
    const points = series('2026-06-01', 3, [60, 61, 60, 63, 62.5, 64, 66, 65]);
    close(slopeBand(points)!.slopePerDay, theilSen(points)!.slopePerDay);
  });

  test('aynı oynaklıkta nokta arttıkça aralık daralır: 4 noktada sıfırı kapsar, 12 noktada kapsamaz', () => {
    const noisy = (count: number) => series('2026-06-01', 7, Array.from({ length: count }, (_, i) => 100 + i + (i % 2 ? 1.5 : -1.5)));
    assert.ok(slopeBand(noisy(4))!.low < 0);
    assert.ok(slopeBand(noisy(12))!.low > 0);
  });

  test('tek günde nokta yoksa null', () => {
    assert.equal(slopeBand([]), null);
    assert.equal(slopeBand([{ date: '2026-06-01', value: 1 }, { date: '2026-06-01', value: 3 }]), null);
  });
});

describe('gün hesabı', () => {
  for (const [date, days, expected] of [
    ['2026-09-27', -28, '2026-08-30'],
    ['2026-02-27', 2, '2026-03-01'],
    ['2026-12-31', 1, '2027-01-01'],
  ] as const) {
    test(`${date} ${days > 0 ? '+' : ''}${days} gün → ${expected}`, () => {
      assert.equal(shiftDay(date, days), expected);
      assert.equal(daysBetween(date, expected), days);
    });
  }
});

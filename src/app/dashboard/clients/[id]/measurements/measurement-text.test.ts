import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { forecast, type Point } from '../../../../../lib/trend.ts';
import { sideBridgeAsymmetry } from '../../../../../lib/measurements.ts';
import { describeForecast, describeSideBridge, formatRange, groupSummary, latestChangeView, trendView } from './measurement-text.ts';

/** `start`tan başlayıp haftada bir, `values` sırasıyla noktalar. */
function weekly(start: string, values: number[]): Point[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => ({ date: new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10), value }));
}

describe('tahmin metni', () => {
  test('çizgi sınıra değiyorsa kaç haftada değdiği yazılır; "≈ %0; olası aralık 0–0" yazılmaz', () => {
    const odi = describeForecast(forecast(weekly('2026-09-01', [30, 20, 12, 5]), { min: 0, max: 100 }), '%');
    assert.equal(
      odi,
      'Eğilim haftada −%8,2. Böyle giderse son ölçümden bir hafta içinde (26 Eylül 2026 civarı) alt sınıra (%0) iner. Tahmin eğilimin süreceğini varsayar.',
    );
    const visa = describeForecast(forecast(weekly('2026-09-01', [70, 80, 89, 98]), { min: 0, max: 100 }), 'puan');
    assert.match(visa, /bir hafta içinde \(24 Eylül 2026 civarı\) üst sınıra \(100 puan\) ulaşır\./);
    assert.doesNotMatch(visa, /olası aralık/);
    // Sınıra birkaç hafta sonra değen çizgi: haftada −%5, son ölçüm %15 → 21 gün.
    const uzun = describeForecast(forecast(weekly('2026-06-01', [60, 55, 50, 45, 40, 35, 30, 25, 20, 15]), { min: 0, max: 100 }), '%');
    assert.match(uzun, /yaklaşık 3 haftada \(24 Ağustos 2026 civarı\) alt sınıra \(%0\) iner\./);
    // Son ölçümde sınıra değmiş: ileriye tahmin yazılmaz.
    assert.equal(
      describeForecast(forecast(weekly('2026-08-01', [30, 20, 10, 0]), { min: 0, max: 100 }), '%'),
      'Eğilim haftada −%10. Çizgi son ölçümde alt sınıra (%0) indi; ileriye tahmin yazılmaz.',
    );
  });

  test('aralık birimiyle ve yüzde işareti her sayıda; tek noktaya çökmüş aralık yazılmaz', () => {
    const odi = describeForecast(forecast(weekly('2026-08-01', [40, 37, 35.5, 31, 30.5, 27]), { min: 0, max: 100 }), '%');
    assert.match(odi, /≈ %22,3; olası aralık %20,8–%23,7\./);
    const bel = describeForecast(forecast(weekly('2026-08-01', [90, 89, 88.2, 87.5, 86.6]), { min: 0, max: 1000 }), 'cm');
    assert.match(bel, /≈ 85 cm; olası aralık 84,8–85,1 cm\./);
    // Gürültüsüz veride bant sıfır genişlikte: "86–86" yazılmaz.
    assert.equal(
      describeForecast(forecast(weekly('2026-08-01', [90, 89, 88, 87]), { min: 0, max: 1000 }), 'cm'),
      'Eğilim haftada −1 cm. Böyle giderse son ölçümden 1 hafta sonra (29 Ağustos 2026) ≈ 86 cm. Tahmin eğilimin süreceğini varsayar.',
    );
    assert.equal(formatRange(8, 12.5, '%'), '%8–%12,5');
    assert.equal(formatRange(82.1, 86.3, 'cm'), '82,1–86,3 cm');
  });
});

describe('yan köprü notu', () => {
  const not = (left: number, right: number) => describeSideBridge({ date: '2026-09-01', left, right, ...sideBridgeAsymmetry(left, right) });

  test('aynı "%25" iki zıt hüküm almaz: sınıra yakın fark bir ondalıkla, Türkçe sayı biçimiyle', () => {
    assert.equal(not(100, 74.6), 'Sağ-sol farkı %25,4 (1 Eylül 2026): %25 ölçüm hatası bandını aşıyor, asimetri var.');
    assert.equal(not(100, 75), 'Sağ-sol farkı %25 (1 Eylül 2026): %25 ölçüm hatası bandında, asimetri sayılmaz.');
    assert.equal(not(99.9, 74.9), 'Sağ-sol farkı %25,03 (1 Eylül 2026): %25 ölçüm hatası bandını aşıyor, asimetri var.');
    assert.equal(not(100, 75.4), 'Sağ-sol farkı %24,6 (1 Eylül 2026): %25 ölçüm hatası bandında, asimetri sayılmaz.');
    // Bandın uzağında tam sayı.
    assert.equal(not(60, 90), 'Sağ-sol farkı %33 (1 Eylül 2026): %25 ölçüm hatası bandını aşıyor, asimetri var.');
  });
});

describe('kartın iki hükmü', () => {
  const previous = { date: '2026-09-01', value: 88.6 };
  const latest = { date: '2026-09-08', value: 87.9 };

  test('iki bilgi ayrı ve adlı: "Son iki ölçüm" ile "4 haftalık eğilim"', () => {
    const son = latestChangeView({ previous, latest, delta: -0.7, ratio: -0.0079, kind: 'no_real_change', previousBeforeRange: false }, 'cm', false);
    assert.equal(son.text, 'Son iki ölçüm: −0,7 cm · ölçüm hatası içinde');
    assert.equal(son.detail, '1 Eyl → 8 Eyl');
    assert.equal(son.tone, 'flat');
    const egilim = trendView(
      { kind: 'improving', change: -2.84, from: '2026-08-11', to: '2026-09-08', points: 5, beforeRange: 3 },
      'cm',
    );
    assert.equal(egilim.text, '4 haftalık eğilim: gerçek gelişme (−2,8 cm)');
    assert.equal(egilim.detail, '11 Ağu–8 Eyl arasındaki 5 ölçümden (seçili aralıktan önceki 3 ölçüm dahil).');
    assert.equal(egilim.tone, 'good');
    // Aralık öncesi nokta yoksa parantez yok.
    assert.equal(trendView({ kind: 'improving', change: -2.84, from: '2026-08-11', to: '2026-09-08', points: 5, beforeRange: 0 }, 'cm').detail, '11 Ağu–8 Eyl arasındaki 5 ölçümden.');
  });

  test('eşiğin altındaki değişimde "gelişme" kelimesi geçmez', () => {
    const son = latestChangeView({ previous, latest, delta: -0.7, ratio: null, kind: 'no_real_change', previousBeforeRange: true }, 'cm', false);
    const egilim = trendView({ kind: 'plateau', change: -1.04, from: '2026-08-11', to: '2026-09-08', points: 5, beforeRange: 0 }, 'cm');
    for (const view of [son, egilim]) {
      assert.doesNotMatch(`${view.text} ${view.detail} ${view.verdict}`, /gelişme/);
    }
    assert.equal(egilim.text, '4 haftalık eğilim: durağan (−1 cm)');
    assert.equal(son.detail, '1 Eyl → 8 Eyl · önceki ölçüm seçili aralıktan önce');
  });

  test('eşiği olmayan ölçümde hüküm yok, yalnız fark; göreli eşikte yüzde de yazılır', () => {
    const kilo = latestChangeView({ previous, latest, delta: -0.8, ratio: -0.0098, kind: null, previousBeforeRange: false }, 'kg', false);
    assert.equal(kilo.text, 'Son iki ölçüm: −0,8 kg');
    assert.equal(kilo.verdict, null);
    const govde = latestChangeView(
      { previous: { date: '2025-12-20', value: 100 }, latest: { date: '2026-01-10', value: 130 }, delta: 30, ratio: 0.3, kind: 'improved', previousBeforeRange: false },
      'sn',
      true,
    );
    assert.equal(govde.text, 'Son iki ölçüm: +30 sn (+%30) · gerçek gelişme');
    assert.equal(govde.detail, '20 Ara 2025 → 10 Oca 2026');
  });
});

describe('katlanmış bölümün özeti', () => {
  test('dolu alanlar yazıldığı gibi, birimiyle; üçten fazlası sayılır', () => {
    assert.deepEqual(groupSummary('anthropometry', { body_mass: '81,5', waist_girth: ' 87.9 ', hip_girth: '' }), {
      count: 2,
      text: 'Vücut ağırlığı 81,5 kg · Bel çevresi 87.9 cm',
    });
    const dolu = groupSummary('anthropometry', {
      body_mass: '81',
      stature: '180',
      waist_girth: '88',
      hip_girth: '100',
      'calf_girth:left': '38',
    });
    assert.equal(dolu.count, 5);
    assert.match(dolu.text, / ve 2 değer daha$/);
  });

  test('iki taraflı ölçümde taraf, ankette yüzde işareti başta; boş bölüm', () => {
    assert.equal(groupSummary('mobility', { 'weight_bearing_lunge:left': '9' }).text, 'Ayak bileği dorsifleksiyonu (duvar lunge testi), sol 9 cm');
    assert.equal(groupSummary('questionnaire', { odi: '24' }).text, 'Oswestry (bel) %24');
    assert.deepEqual(groupSummary('performance', {}), { count: 0, text: '' });
  });
});

describe('tahmin bugüne göre', () => {
  const bel = forecast(weekly('2026-08-01', [90, 89, 88, 87]), { min: 0, max: 1000 });

  test('son tahmin günü geçmişteyse tahmin yazılmaz; son ölçümün kaç gün önce olduğu yazılır', () => {
    const metin = describeForecast(bel, 'cm', '2026-09-26');
    assert.equal(
      metin,
      'Eğilim haftada −1 cm. Son ölçüm 35 gün önce: tahminin son günü (29 Ağustos 2026) geçti, tahmin yeni ölçümle güncellenir.',
    );
    assert.doesNotMatch(metin, /≈/);
  });

  test('bugün ufkun içindeyse bugünün tahmini de yazılır', () => {
    assert.equal(
      describeForecast(bel, 'cm', '2026-08-25'),
      'Eğilim haftada −1 cm. Böyle giderse bugün (25 Ağustos 2026) ≈ 86,6 cm, son ölçümden 1 hafta sonra (29 Ağustos 2026) ≈ 86 cm. Tahmin eğilimin süreceğini varsayar.',
    );
  });
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENDURANCE_NOISE,
  enduranceRatios,
  MEASUREMENT_IDS,
  measurementDef,
  realChange,
  SIT_TO_STAND_MCID,
  sideBridgeAsymmetry,
  sitToStandFlag,
  WAIST_HIP_GIRTH_NOISE_CM,
  waistHipRatio,
} from './measurements.ts';

describe('ölçüm kataloğu', () => {
  test('her ölçümün birimi, katmanı ve sıklığı var', () => {
    for (const id of MEASUREMENT_IDS) {
      const def = measurementDef(id);
      assert.ok(def.label && def.unit && def.tier && def.frequency, `${id} eksik`);
    }
  });
});

describe('yorumlayıcılar', () => {
  test('bel-kalça oranı cinsiyete göre eşik (erkek 0,90, kadın 0,85)', () => {
    assert.deepEqual(waistHipRatio(86, 100, 'male'), { ratio: 0.86, elevatedRisk: false });
    assert.deepEqual(waistHipRatio(86, 100, 'female'), { ratio: 0.86, elevatedRisk: true });
    assert.equal(waistHipRatio(90, 100, 'male').elevatedRisk, true);
  });

  test('otur-kalk: 12 sn üstü değerlendirme, 15 sn üstü tekrarlayan düşme riski', () => {
    assert.equal(sitToStandFlag(11.4), 'normal');
    assert.equal(sitToStandFlag(12.6), 'fall_risk_assessment');
    assert.equal(sitToStandFlag(15.2), 'recurrent_fall_risk');
  });

  test('ölçüm hatasının altındaki değişim gelişme sayılmaz', () => {
    // Otur-kalk: 2,3 sn altı gürültü; düşük süre iyidir.
    const oturKalk = { threshold: SIT_TO_STAND_MCID, relative: false, better: 'lower' as const };
    assert.equal(realChange(14, 12.5, oturKalk), 'no_real_change');
    assert.equal(realChange(14, 11.2, oturKalk), 'improved');
    assert.equal(realChange(11, 14, oturKalk), 'declined');

    // Dayanıklılık: %25 altı gürültü; yüksek süre iyidir.
    const dayaniklilik = { threshold: ENDURANCE_NOISE, relative: true, better: 'higher' as const };
    assert.equal(realChange(100, 120, dayaniklilik), 'no_real_change');
    assert.equal(realChange(100, 130, dayaniklilik), 'improved');
  });

  test('tam eşikteki fark ondalık kaymasına rağmen gerçek sayılır', () => {
    // 82,1 − 80,1 kayan noktada 1,99999… çıkar.
    const bel = { threshold: WAIST_HIP_GIRTH_NOISE_CM, relative: false, better: 'lower' as const };
    assert.equal(realChange(82.1, 80.1, bel), 'improved');
    assert.equal(realChange(12.5, 10.2, { threshold: SIT_TO_STAND_MCID, relative: false, better: 'lower' }), 'improved');
  });

  test('yan köprü asimetrisi yalnız %25 bandını aşınca işaretlenir', () => {
    assert.deepEqual(sideBridgeAsymmetry(80, 90), { differencePercent: 11, flagged: false });
    assert.deepEqual(sideBridgeAsymmetry(60, 90), { differencePercent: 33, flagged: true });
  });

  test('asimetri yuvarlanmamış oranla karşılaştırılır; yuvarlama yalnız gösterimde', () => {
    // %25,40 ve %25,33 bandı aşar; bandın yakınında bir ondalıkla yazılır ("%25" diye değil).
    assert.deepEqual(sideBridgeAsymmetry(100, 74.6), { differencePercent: 25.4, flagged: true });
    assert.deepEqual(sideBridgeAsymmetry(60, 44.8), { differencePercent: 25.3, flagged: true });
    // Bir ondalık da "25,0" gösterirse bandı aşan fark iki ondalığa yukarı yuvarlanır (%25,025).
    assert.deepEqual(sideBridgeAsymmetry(99.9, 74.9), { differencePercent: 25.03, flagged: true });
    // Bandın hemen altı da bir ondalıkla: %24,6 "%25" görünmez.
    assert.deepEqual(sideBridgeAsymmetry(100, 75.4), { differencePercent: 24.6, flagged: false });
    // Tam %25 bandı aşmaz; ondalık kayması (33,2 − 24,9) da aşmış saydırmaz.
    assert.deepEqual(sideBridgeAsymmetry(100, 75), { differencePercent: 25, flagged: false });
    assert.deepEqual(sideBridgeAsymmetry(33.2, 24.9), { differencePercent: 25, flagged: false });
    assert.deepEqual(sideBridgeAsymmetry(0, 0), { differencePercent: 0, flagged: false });
  });

  test('dayanıklılık oranları cinsiyete göre başvuru değeriyle döner', () => {
    const erkek = enduranceRatios({ flexorS: 90, extensorS: 150, sideS: 90 }, 'male');
    assert.deepEqual(erkek, { sideToExtensor: 0.6, sideToFlexor: 1, reference: { sideToExtensor: 0.65, sideToFlexor: 0.99 } });
  });
});

describe('ölçüm uyarıları', () => {
  test('yalnız eşiği ve yönü kaynaklı ölçümler; gerileme önde', async () => {
    const { measurementAlerts } = await import('./measurement-trends.ts');
    const hafta = (i: number) => new Date(Date.UTC(2026, 7, 4 + i * 7)).toISOString().slice(0, 10);
    const entries = [
      ...[92, 91.2, 90.4, 89.8, 88.6].map((value, i) => ({ date: hafta(i), id: 'waist_girth' as const, value })),
      ...[11, 12, 13, 14, 15].map((value, i) => ({ date: hafta(i), id: 'sit_to_stand_5x' as const, value })),
      ...[101, 100.6, 100.9, 100.4, 100.2].map((value, i) => ({ date: hafta(i), id: 'hip_girth' as const, value })),
      ...[84, 83, 82, 81, 80].map((value, i) => ({ date: hafta(i), id: 'body_mass' as const, value })),
    ];
    const alerts = measurementAlerts(entries, '2026-09-03');
    assert.deepEqual(
      alerts.map((alert) => [alert.id, alert.kind]),
      [
        ['sit_to_stand_5x', 'declining'],
        ['waist_girth', 'improving'],
      ],
    );
  });

  test('pencere dışındaki eski ölçüm eğilim üretmez; son ölçümü 4 haftadan eski eğilim uyarı değildir', async () => {
    const { measurementAlerts } = await import('./measurement-trends.ts');
    const bel = (date: string, value: number) => ({ date, id: 'waist_girth' as const, value });
    // 10 günlük üç ölçüm + 6 ay önceki tek ölçüm: kartta "durağan" çıkmaz.
    const son = [bel('2026-09-12', 84), bel('2026-09-17', 83.6), bel('2026-09-22', 83.2)];
    assert.deepEqual(measurementAlerts([bel('2026-03-01', 95), ...son], '2026-09-25'), []);
    // Mart'ta haftalık ölçülmüş: Mart'ta gelişme, Eylül'de "son 4 hafta" diye gösterilmez.
    const mart = [92, 91.2, 90.4, 89.8, 88.6].map((value, i) => bel(`2026-03-${String(2 + i * 7).padStart(2, '0')}`, value));
    assert.deepEqual(
      measurementAlerts(mart, '2026-04-10').map((alert) => alert.kind),
      ['improving'],
    );
    assert.deepEqual(measurementAlerts(mart, '2026-09-25'), []);
  });

  test('son ölçüm tam 28 gün önceyse eğilim gösterilir, 29 gün önceyse gösterilmez', async () => {
    const { measurementAlerts } = await import('./measurement-trends.ts');
    const gun = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    const haftalik = (son: string) =>
      [0, 7, 14, 21, 28].map((d, i) => ({ date: gun(son, d - 28), id: 'waist_girth' as const, value: 92 - i * 0.8 }));
    const bugun = '2026-09-25';
    for (const yas of [0, 27, 28]) {
      assert.deepEqual(
        measurementAlerts(haftalik(gun(bugun, -yas)), bugun).map((alert) => alert.kind),
        ['improving'],
        `${yas} gün önce`,
      );
    }
    assert.deepEqual(measurementAlerts(haftalik(gun(bugun, -29)), bugun), []);
  });

  test('kümelenmiş ölçümde kart gürültüyü "gerçek gelişme" ya da "gerileme" diye göstermez', async () => {
    const { measurementAlerts } = await import('./measurement-trends.ts');
    const bel = (date: string, value: number) => ({ date, id: 'waist_girth' as const, value });
    // Ayda bir, son hafta her seansta: 27 Ağu 88 → 25 Eyl 87 (gerçek fark −1 cm, eşik 2). Eskiden "−4 cm · gerçek gelişme".
    const asagi = [bel('2026-07-27', 88.4), bel('2026-08-27', 88), bel('2026-09-21', 88), bel('2026-09-23', 87.5), bel('2026-09-25', 87)];
    const [uyari] = measurementAlerts(asagi, '2026-09-25');
    assert.equal(uyari?.kind, 'plateau');
    assert.ok(Math.abs(uyari!.change) < 1, String(uyari!.change));
    // Küme yukarı (88 → 88,5 → 89): "gerileme +4 cm" değil.
    const yukari = [...asagi.slice(0, 2), bel('2026-09-21', 88), bel('2026-09-23', 88.5), bel('2026-09-25', 89)];
    assert.deepEqual(
      measurementAlerts(yukari, '2026-09-25').map((alert) => alert.kind),
      ['plateau'],
    );
  });
});

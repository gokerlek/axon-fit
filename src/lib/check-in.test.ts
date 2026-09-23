import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTolerance, assessTolerance, sessionLoad, weeklyLoads, type CheckIn } from './check-in.ts';
import type { LoadSpec, Suggestion } from './progression.ts';

const gun = (date: string, extra: Partial<CheckIn> = {}): CheckIn => ({ date, redFlag: 'none', ...extra });

describe('yük toleransı (ağrı izleme)', () => {
  test('her şey yolundaysa ilerle', () => {
    const sonuc = assessTolerance({ current: gun('2026-09-23', { painBaseline: 2, painPeak: 2, returnedToBaseline: true }) });
    assert.equal(sonuc.action, 'progress');
    assert.deepEqual(sonuc.reasons, []);
  });

  test('kırmızı bayrak ve aşağı yayılan semptom programı durdurur', () => {
    assert.equal(assessTolerance({ current: gun('2026-09-23', { redFlag: 'night_pain' }) }).action, 'stop');
    assert.equal(assessTolerance({ current: gun('2026-09-23', { symptomDirection: 'peripheralizing' }) }).action, 'stop');
    // Merkeze çekilen semptom iyi haberdir.
    assert.equal(assessTolerance({ current: gun('2026-09-23', { symptomDirection: 'centralizing' }) }).action, 'progress');
  });

  test('24 saatte bazale dönmeyen ağrı yükü azaltır', () => {
    const sonuc = assessTolerance({ current: gun('2026-09-23', { returnedToBaseline: false }) });
    assert.equal(sonuc.action, 'reduce');
    assert.equal(sonuc.reasons[0]?.code, 'not_back_to_baseline');
  });

  test('tavan varsayılanda 3/10, ağrı izleme modunda 5/10', () => {
    const dort = gun('2026-09-23', { painPeak: 4 });
    assert.equal(assessTolerance({ current: dort }).action, 'reduce');
    assert.equal(assessTolerance({ current: dort, mode: 'pain_monitoring' }).action, 'progress');
    assert.equal(assessTolerance({ current: gun('2026-09-23', { painPeak: 6 }), mode: 'pain_monitoring' }).action, 'reduce');
  });

  test('ağrı haftadan haftaya anlamlı artarsa (≥2 puan) artırma durur; küçük dalgalanma gürültüdür', () => {
    const gecenHafta = [gun('2026-09-14', { painBaseline: 2 }), gun('2026-09-16', { painBaseline: 2 })];
    const artti = assessTolerance({ current: gun('2026-09-23', { painBaseline: 4 }), history: [...gecenHafta, gun('2026-09-21', { painBaseline: 4 })] });
    assert.equal(artti.action, 'hold');
    assert.equal(artti.reasons[0]?.code, 'pain_rising_weekly');

    const azArtti = assessTolerance({ current: gun('2026-09-23', { painBaseline: 3 }), history: gecenHafta });
    assert.equal(azArtti.action, 'progress');
  });

  test('yüksek irritabilite artışı durdurur ama yükü düşürmez', () => {
    assert.equal(assessTolerance({ current: gun('2026-09-23', { irritability: 'high' }) }).action, 'hold');
  });

  test('en ağır karar kazanır, gerekçelerin hepsi listelenir', () => {
    const sonuc = assessTolerance({
      current: gun('2026-09-23', { redFlag: 'new_trauma', painPeak: 7, irritability: 'high' }),
    });
    assert.equal(sonuc.action, 'stop');
    assert.deepEqual(
      sonuc.reasons.map((reason) => reason.code),
      ['red_flag', 'peak_over_ceiling', 'high_irritability'],
    );
  });
});

describe('öneriye uygulama', () => {
  const spec: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 2.5, minLoadKg: 20 };
  const last = { weightKg: 60, target: 8 };
  const artis: Suggestion = { weightKg: 62.5, target: 8, reason: 'increase' };

  test('ilerle → öneri aynen kalır', () => {
    assert.deepEqual(applyTolerance(artis, { action: 'progress', reasons: [] }, { spec, last }), artis);
  });

  test('tut → artış geri çekilir, son plan tekrarlanır', () => {
    assert.deepEqual(applyTolerance(artis, { action: 'hold', reasons: [] }, { spec, last }), { ...last, reason: 'pain_hold' });
    // Zaten artış değilse dokunulmaz (ör. "decrease").
    const azalis: Suggestion = { weightKg: 57.5, target: 8, reason: 'decrease' };
    assert.deepEqual(applyTolerance(azalis, { action: 'hold', reasons: [] }, { spec, last }), azalis);
  });

  test('azalt → son ağırlıktan %15 aşağı, adıma yuvarlı (artmış öneriden değil)', () => {
    const sonuc = applyTolerance(artis, { action: 'reduce', reasons: [] }, { spec, last });
    assert.deepEqual(sonuc, { weightKg: 50, target: 8, reason: 'pain_reduce' });
  });

  test('dur → yük verilmez, son plan "duraklatıldı" olarak döner', () => {
    assert.deepEqual(applyTolerance(artis, { action: 'stop', reasons: [] }, { spec, last }), { ...last, reason: 'paused' });
  });
});

describe('iç yük (sRPE)', () => {
  test('RPE × dakika; eksik bilgide yok', () => {
    assert.equal(sessionLoad({ sessionRpe: 6, durationMin: 50 }), 300);
    assert.equal(sessionLoad({ sessionRpe: 6 }), null);
  });

  test('haftalık toplam ve önceki haftaya göre değişim; eşik üretmez', () => {
    const hafta = weeklyLoads([
      gun('2026-09-14', { sessionRpe: 5, durationMin: 40 }), // pazartesi
      gun('2026-09-17', { sessionRpe: 6, durationMin: 50 }),
      gun('2026-09-21', { sessionRpe: 7, durationMin: 60 }), // sonraki pazartesi
      gun('2026-09-23'), // RPE yok: sayılmaz
    ]);
    assert.deepEqual(hafta, [
      { week: '2026-09-14', load: 500, changePercent: null },
      { week: '2026-09-21', load: 420, changePercent: -16 },
    ]);
  });
});

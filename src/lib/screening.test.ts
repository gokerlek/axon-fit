import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { addConstraint, clearConstraint, constraintsOf } from './constraints.ts';
import {
  asymmetries,
  cellTitle,
  clientScreeningRows,
  compareCell,
  constraintSuppress,
  effectiveMissed,
  majorAsymmetry,
  normalizeSide,
  normalizeTests,
  outcomeOf,
  painCells,
  parseScreeningKey,
  presetFromConstraints,
  rankOf,
  screeningHints,
  screeningKey,
  screeningSummary,
  SCREENING_LIMIT,
  upsertScreening,
} from './screening.ts';
import { screeningSchema, type HealthRecord, type Screening } from './schemas/health.ts';

const NOW = '2026-09-27T10:00:00.000Z';
const titles = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise.title]));
const titleOf = (id: string) => titles.get(id);

function screening(tests: Screening['tests'], date = '2026-09-12', extra: Partial<Screening> = {}): Screening {
  return { date, protocol: 1, tests, ...extra };
}

describe('sonuç', () => {
  test('noktalardan: temiz, telafiyle, kolaylaştırılmış; sürüm ve ağrı', () => {
    assert.equal(outcomeOf('squat', { result: 'standard', missed: [] }), 'clean');
    assert.equal(outcomeOf('squat', { result: 'standard', missed: ['heels', 'depth'] }), 'compensated');
    assert.equal(outcomeOf('squat', { result: 'standard', missed: ['heels', 'depth', 'knees'] }), 'easier');
    assert.equal(outcomeOf('squat', { result: 'easier', missed: [] }), 'easier');
    assert.equal(outcomeOf('squat', { result: 'unable' }), 'unable');
    assert.equal(outcomeOf('squat', { result: 'not_tested', reason: 'constraint' }), 'not_tested');
    // Ağrı her şeyin önüne geçer.
    assert.equal(outcomeOf('squat', { pain: true, result: 'standard', missed: [] }), 'pain');
    assert.equal(outcomeOf('squat', {}), null);
    assert.equal(outcomeOf('squat', undefined), null);
    // Bilinmeyen nokta sayılmaz.
    assert.equal(outcomeOf('squat', { result: 'standard', missed: ['zzz'] }), 'clean');
  });

  test('iç sıra yalnız asimetri için; ağrılı ve yapılmamış sırasız', () => {
    assert.deepEqual(['clean', 'compensated', 'easier', 'unable', 'pain', 'not_tested', null].map((item) => rankOf(item as never)), [3, 2, 1, 0, null, null, null]);
  });

  test('dengede süre: 30 sn altı kendiliğinden kaçmış; elle işaret süreyi ezmez', () => {
    assert.deepEqual(effectiveMissed('single_leg_balance', { result: 'standard', missed: [], seconds: 22 }), ['time']);
    assert.deepEqual(effectiveMissed('single_leg_balance', { result: 'standard', missed: ['time', 'hip'], seconds: 30 }), ['hip']);
    assert.deepEqual(effectiveMissed('single_leg_balance', { result: 'standard', missed: ['time'] }), ['time']);
  });
});

describe('giriş temizliği', () => {
  test('ağrıda yalnız ağrı ve notu; yapılamadıda nokta yok; süre yalnız dengede', () => {
    assert.deepEqual(normalizeSide('squat', { pain: true, painNote: ' diz ', result: 'standard', missed: ['heels'] }), { pain: true, painNote: 'diz' });
    assert.deepEqual(normalizeSide('squat', { result: 'unable', missed: ['heels'] }), { result: 'unable' });
    assert.deepEqual(normalizeSide('squat', { result: 'standard', missed: ['heels', 'heels', 'zz'], seconds: 20 }), { result: 'standard', missed: ['heels'] });
    assert.deepEqual(normalizeSide('single_leg_balance', { result: 'standard', missed: [], seconds: 25.4, reachCm: 63.25 }), {
      result: 'standard',
      missed: ['time'],
      seconds: 25,
      reachCm: 63.3,
    });
    assert.equal(normalizeSide('squat', {}), undefined);
    assert.deepEqual(normalizeSide('hinge', { result: 'not_tested', reason: 'constraint', missed: ['hips'] }), { result: 'not_tested', reason: 'constraint' });
  });

  test('boş testler düşer; topuk desteği yalnız squatta; şema kabul eder', () => {
    const tests = normalizeTests({
      squat: { result: 'standard', missed: ['heels'], heelSupportHelps: true, note: '  ' },
      hinge: {},
      split_squat: { left: { result: 'standard', missed: [] }, right: {} },
    });
    assert.deepEqual(tests, { squat: { result: 'standard', missed: ['heels'], heelSupportHelps: true }, split_squat: { left: { result: 'standard', missed: [] } } });
    assert.equal(v.safeParse(screeningSchema, screening(tests)).success, true);
  });

  test('anahtarlar', () => {
    assert.equal(screeningKey('squat', 'center'), 'squat');
    assert.equal(screeningKey('split_squat', 'left'), 'split_squat.left');
    assert.deepEqual(parseScreeningKey('shoulder_flexion.right'), { testId: 'shoulder_flexion', side: 'right' });
    assert.equal(parseScreeningKey('squat.left'), null);
    assert.equal(parseScreeningKey('split_squat'), null);
    assert.equal(parseScreeningKey('bilinmeyen'), null);
    assert.equal(cellTitle('shoulder_flexion', 'right'), 'Kol kaldırma (sağ)');
  });

  test('aynı gün yerine geçer; tarih sırası; en çok 60 gün', () => {
    let list: Screening[] = [];
    for (let day = 1; day <= SCREENING_LIMIT + 2; day += 1) list = upsertScreening(list, screening({}, `2026-0${1 + Math.floor(day / 28)}-${String((day % 28) + 1).padStart(2, '0')}`));
    assert.equal(list.length, SCREENING_LIMIT);
    const replaced = upsertScreening([screening({}, '2026-09-01')], screening({ squat: { result: 'unable' } }, '2026-09-01'));
    assert.deepEqual(replaced.map((item) => item.tests), [{ squat: { result: 'unable' } }]);
  });
});

describe('asimetri ve ağrı', () => {
  const s = screening(
    {
      split_squat: { left: { result: 'standard', missed: [] }, right: { result: 'easier', missed: ['knee'] } },
      single_leg_balance: { left: { result: 'standard', missed: [], seconds: 30, reachCm: 64 }, right: { result: 'standard', missed: ['hip'], seconds: 30, reachCm: 59 } },
      anti_rotation: { left: { result: 'standard', missed: [] }, right: { result: 'standard', missed: ['trunk'] } },
      shoulder_flexion: { left: { result: 'standard', missed: [] }, right: { pain: true, painNote: 'ön omuz' } },
    },
    '2026-09-12',
    { painReviewedAt: {} },
  );

  test('sıra farkı 1 asimetri, ≥ 2 büyük; ön uzanmada ≥ 4 cm büyük; ağrılı taraf girmez', () => {
    const list = asymmetries(s);
    assert.deepEqual(
      list.map((item) => [item.testId, item.kind, item.gap, item.weaker, item.reachDiff]),
      [
        ['split_squat', 'major', 2, 'right', undefined],
        ['single_leg_balance', 'major', 1, 'right', 5],
        ['anti_rotation', 'minor', 1, 'right', undefined],
      ],
    );
    assert.equal(majorAsymmetry(s)?.testId, 'split_squat');
  });

  test('etkin kısıtlı taraf asimetriye girmez', () => {
    const health = addConstraint({ version: 2, checkIns: [], measurements: [] }, { region: 'knee', side: 'right', type: 'injury', avoid: [] }, { id: 'k_aaaaaa', now: NOW });
    const suppress = constraintSuppress(constraintsOf(health));
    assert.equal(majorAsymmetry(s, suppress), null);
    assert.deepEqual(asymmetries(s, suppress).map((item) => item.testId), ['anti_rotation']);
  });

  test('ağrılı hücreler ve gözden geçirme', () => {
    assert.deepEqual(painCells(s), [{ key: 'shoulder_flexion.right', testId: 'shoulder_flexion', side: 'right', note: 'ön omuz', reviewed: false }]);
    assert.equal(painCells({ ...s, painReviewedAt: { 'shoulder_flexion.right': NOW } })[0]?.reviewed, true);
    assert.deepEqual(screeningSummary(s), { tests: 4, pain: 1 });
  });

  test('karşılaştırma: iç sıraya göre; ağrının başlaması ve geçmesi belirgin; yapılmayan karşılaştırılmaz', () => {
    assert.deepEqual(compareCell('clean', 'compensated'), { change: 'up', significant: false });
    assert.deepEqual(compareCell('unable', 'clean'), { change: 'down', significant: true });
    assert.deepEqual(compareCell('pain', 'clean'), { change: 'pain_new', significant: true });
    assert.deepEqual(compareCell('clean', 'pain'), { change: 'pain_gone', significant: true });
    assert.deepEqual(compareCell('clean', null), { change: 'new', significant: false });
    assert.equal(compareCell('not_tested', 'clean'), null);
  });
});

describe('kısıttan ön-seçim', () => {
  test('görüşü alınmamış kırmızı bayrak bölgesine değen testler "yapılmadı"; görüş alınınca değil', () => {
    let health: HealthRecord = { version: 2, checkIns: [], measurements: [] };
    health = addConstraint(health, { region: 'knee', side: 'left', type: 'post_op', avoid: [], conditionId: 'acl_reconstruction_early', diagnosisSource: 'clinician' }, { id: 'k_aaaaaa', now: NOW });
    assert.deepEqual(Object.keys(presetFromConstraints(constraintsOf(health))), ['squat', 'split_squat.left', 'single_leg_balance.left']);
    const cleared = clearConstraint(health, 'k_aaaaaa', { now: NOW, date: '2026-09-27', basis: 'written_report' });
    assert.deepEqual(presetFromConstraints(constraintsOf(cleared)), {});
  });
});

describe('ipuçları ve danışan', () => {
  const s = screening({
    squat: { result: 'standard', missed: ['heels', 'depth'], heelSupportHelps: true },
    split_squat: { left: { result: 'standard', missed: [] }, right: { result: 'easier', missed: ['knee'] } },
    push: { result: 'standard', missed: ['elbows'] },
    pull: { result: 'standard', missed: [] },
    shoulder_flexion: { left: { result: 'standard', missed: [] }, right: { pain: true } },
  });

  test('sıra: ağrı → en düşük sonuç → asimetri → test sırası; listeler kütüphaneden', () => {
    const hints = screeningHints(s, titleOf);
    assert.deepEqual(
      hints.map((hint) => hint.key),
      ['shoulder_flexion.right', 'split_squat.right', 'squat', 'push', 'split_squat.left', 'pull', 'shoulder_flexion.left'],
    );
    assert.match(hints[0]!.text, /ağrılı; öneri yok/);
    assert.match(hints[1]!.text, /Split squat, sağ \(Kolaylaştırılmış\): kolaylaştırılmış sürümle çalış — Goblet Box Squat/);
    assert.match(hints[1]!.text, /Zayıf taraftan başla/);
    assert.match(hints[2]!.text, /Topuk desteğiyle düzeldi/);
    assert.match(hints[3]!.text, /dirsekler gövdeye 45°/);
    assert.equal(hints.some((hint) => /puan|skor|toplam/i.test(hint.text)), false);
  });

  test('danışan: sözcük, ok, odak; sayı yok', () => {
    const previous = screening({ squat: { result: 'easier', missed: [] }, split_squat: { left: { result: 'standard', missed: [] }, right: { result: 'standard', missed: [] } } }, '2026-08-01');
    const rows = clientScreeningRows(s, previous);
    const squat = rows.find((row) => row.testId === 'squat')!;
    assert.deepEqual([squat.title, squat.sides[0]?.text, squat.sides[0]?.change, squat.focus], ['Squat', 'Telafiyle', 'up', 'topukların yerde kalsın']);
    const split = rows.find((row) => row.testId === 'split_squat')!;
    assert.deepEqual(split.sides.map((side) => [side.label, side.text, side.change]), [
      ['Sol', 'Temiz', null],
      ['Sağ', 'Kolaylaştırılmış sürümle', 'down'],
    ]);
    assert.equal(split.focus, 'ön dizin ayağının yönünde');
    const shoulder = rows.find((row) => row.testId === 'shoulder_flexion')!;
    assert.equal(shoulder.sides[1]?.text, 'Ağrı not edildi. Antrenörün seninle konuşacak.');
    assert.equal(JSON.stringify(rows).match(/\d/), null);
  });
});

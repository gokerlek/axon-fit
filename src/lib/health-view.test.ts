import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { healthSlice, prepareForWrite } from './health-view.ts';
import type { HealthRecord } from './schemas/health.ts';

const AT = '2026-09-20T10:00:00.000Z';

const full: HealthRecord = {
  sex: 'female',
  toleranceMode: 'pain_free',
  checkIns: [{ date: '2026-09-20', painBaseline: 2 }],
  measurements: [{ date: '2026-09-01', id: 'waist_girth', value: 80 }],
  constraints: [{ id: 'k_aaaaaa', region: 'lower_back', type: 'condition', avoid: [], status: 'active', source: 'pt', createdAt: AT, updatedAt: AT }],
  overrides: [{ exerciseId: 'deadlift', source: 'k_aaaaaa', at: AT }],
  constraintLog: [{ at: AT, by: 'pt', id: 'k_aaaaaa', kind: 'added', text: 'Bel eklendi' }],
  screenings: [{ date: '2026-09-12', protocol: 1, tests: { squat: { result: 'unable' } } }],
};

describe('sağlık kaydının dilimi (kisit-tarama.md §5.1)', () => {
  test('yalnız verilen parçalar; ötekiler boş', () => {
    const measurements = healthSlice(full, ['measurements']);
    assert.deepEqual(measurements.measurements, full.measurements);
    assert.deepEqual([measurements.checkIns, measurements.constraints, measurements.screenings], [[], undefined, undefined]);
    const conditions = healthSlice(full, ['conditions']);
    assert.deepEqual([conditions.constraints?.length, conditions.overrides?.length, conditions.measurements, conditions.screenings], [1, 1, [], undefined]);
    const screening = healthSlice(full, ['screening']);
    assert.deepEqual([screening.screenings?.length, screening.constraints], [1, undefined]);
    assert.equal(healthSlice(full, ['check_in']).checkIns.length, 1);
  });
});

describe('yazıma hazırlık', () => {
  test('boş eski alanlar düşer, sürüm 2; başka parçanın yazımı eski kısıtları çevirmez', () => {
    const legacy: HealthRecord = { conditions: [], checkIns: [], measurements: [], movementScreens: [] };
    assert.deepEqual(prepareForWrite(legacy, 'measurements'), { version: 2, checkIns: [], measurements: [] });
    const withOld: HealthRecord = { conditions: ['hypertension:controlled'], checkIns: [], measurements: [], movementScreens: [{ eski: true }] };
    const measured = prepareForWrite(withOld, 'measurements');
    assert.deepEqual([measured.conditions, measured.constraints, measured.movementScreens], [['hypertension:controlled'], undefined, [{ eski: true }]]);
    const constrained = prepareForWrite(withOld, 'conditions');
    assert.equal('conditions' in constrained, false);
    assert.equal(constrained.constraints?.[0]?.conditionId, 'hypertension:controlled');
    assert.deepEqual(constrained.movementScreens, [{ eski: true }]);
  });
});

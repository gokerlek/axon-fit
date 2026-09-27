import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_SIDE, initialScreeningState, testsOf, toEntry } from './screening-state.ts';
import { SCREENING_TEST_IDS, screeningKey, sidesOf } from '../../../../../lib/screening.ts';

test('taslak sekiz testin bütün taraflarını kurar, boşları kayda eklemez', () => {
  const state = initialScreeningState({ date: '2026-09-27' });
  const keys = SCREENING_TEST_IDS.flatMap((id) => sidesOf(id).map((side) => screeningKey(id, side)));
  assert.deepEqual(Object.keys(state.sides), keys);
  assert.deepEqual(Object.keys(state.extras), [...SCREENING_TEST_IDS]);
  assert.deepEqual(testsOf(state), {});
});
test('taraflı kısıt ön seçimi, ağrı, not ve ölçüler taslakta korunur', () => {
  const tests = {
    squat: { pain: true as const, painNote: 'Sol diz' },
    single_leg_balance: { left: { result: 'standard' as const, missed: [], seconds: 30, reachCm: 60.5, legCm: 90 } },
  };
  const state = initialScreeningState({ date: '2026-09-27', tests, note: 'kontrol' });
  assert.deepEqual(testsOf(state), tests);
  assert.equal(state.sides['single_leg_balance.left']?.reachCm, '60,5');
  const preset = initialScreeningState({ date: '2026-09-27', preset: { 'split_squat.left': true } });
  assert.deepEqual(testsOf(preset), { split_squat: { left: { result: 'not_tested', reason: 'constraint' } } });
});
test('eski taslakta bacak boyu yoksa boş kabul edilir, ağrı işaretinde ölçüler çıkmaz', () => {
  const { legCm: _leg, ...old } = { ...EMPTY_SIDE, result: 'standard' as const };
  assert.deepEqual(toEntry(old as typeof EMPTY_SIDE), { result: 'standard', missed: [] });
  assert.deepEqual(toEntry({ ...EMPTY_SIDE, pain: true, painNote: ' diz ', reachCm: '60', legCm: '90' }), { pain: true, painNote: 'diz' });
});

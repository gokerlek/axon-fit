import { test } from 'node:test';
import assert from 'node:assert/strict';
import { painHistory, reachOf, reachPercent, normalizeSide } from './screening.ts';
import { screeningMarks } from './screening-care.ts';
import type { Screening } from './schemas/health.ts';
const scan = (date: string, tests: Screening['tests'], extra: Partial<Screening> = {}): Screening => ({ date, protocol: 1, tests, ...extra });
const first = scan('2026-09-01', { shoulder_flexion: { left: { pain: true } } });
test('yeni taramada yapılmayan taraf eski ağrıyı kapatmaz', () => {
  const latest = scan('2026-09-27', { shoulder_flexion: { left: { result: 'not_tested' }, right: { result: 'standard', missed: [] } } });
  assert.equal(painHistory([first, latest]).open[0]?.date, first.date);
});
test('aynı taraf ağrısız test edilince eski ağrı kapanır; yeni ağrı eskisinin yerine geçer', () => {
  const latest = scan('2026-09-27', { shoulder_flexion: { left: { result: 'standard', missed: [] } } });
  assert.equal(painHistory([first, latest]).rows[0]?.state, 'resolved');
  assert.equal(painHistory([first, latest]).open.length, 0);
  const repeated = { ...first, date: latest.date };
  const history = painHistory([first, repeated]);
  assert.deepEqual(history.rows.map((row) => row.state), ['open', 'superseded']);
  assert.equal(history.open.length, 1);
  assert.equal(painHistory([first, { ...repeated, painReviewedAt: { 'shoulder_flexion.left': '2026-09-27T10:00:00.000Z' } }]).open.length, 0);
});
test('ağrılı kalıp dikkati ve son tarama bilgisi yalnız ilişkili harekete gelir', () => {
  const marks = screeningMarks([first], [{ id: 'press', pattern: 'vertical_push' }, { id: 'squat', pattern: 'squat' }], { titleOf: () => undefined });
  assert.ok(marks.press?.pain[0]?.includes('Kol kaldırma'));
  assert.equal(marks.squat, undefined);
  const clean = scan('2026-09-27', { shoulder_flexion: { left: { result: 'standard', missed: [] } } });
  const next = screeningMarks([first, clean], [{ id: 'press', pattern: 'vertical_push' }], { titleOf: () => undefined });
  assert.deepEqual(next.press?.pain, []);
  assert.match(next.press?.info?.label ?? '', /Temiz/);
});
test('ön uzanma yüzdesi, tarafın ölçümü ve eski santimetre kaydı', () => {
  assert.equal(reachPercent(60, 90), 66.7);
  assert.equal(reachPercent(60, 0), undefined);
  assert.deepEqual(reachOf({ single_leg_balance: { left: { result: 'standard', reachCm: 60 } } }, 'left'), { cm: 60 });
  assert.deepEqual(normalizeSide('single_leg_balance', { result: 'standard', legCm: 90.24, reachCm: 60 }), { result: 'standard', missed: [], reachCm: 60, legCm: 90.2 });
});

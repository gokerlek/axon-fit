import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressReview } from './coach-review.ts';
import type { SessionIndexExercise, SessionIndexRow } from '../schemas/session.ts';
const titles = new Map([['bench', 'Bench press']]);
function row(date: string, kg: number, deviceId = 'bench-a', overrides: Partial<SessionIndexRow> = {}): SessionIndexRow {
  return { id: 's_12345678', sha: 'a'.repeat(40), path: 'sessions/test.json', date, finishedAt: `${date}T12:00:00.000Z`, otherDay: false, unfinished: false, volumeKg: kg * 8, sets: 2, water: 0, notices: [], exercises: [{ exerciseId: 'bench', deviceId, sets: 2, full: true, best: { sets: [{ kg, reps: 8 }] } }], ...overrides };
}
test('same exercise/device produces a performance comparison and actionable next step', () => {
  const review = progressReview([row('2026-10-04', 55), row('2026-10-01', 50)], '2026-10-06', titles);
  assert.match(review[1]!.finding, /50 kg × 8 tekrar → 55 kg × 8 tekrar/);
  assert.match(review[1]!.finding, /arttı/);
  assert.match(review[1]!.next, /tekrar aralığını ve eforu/);
  assert.equal(review[1]!.sources.length, 2);
});
test('a lower comparison prompts checking repeat performance, without invented reasons', () => {
  const review = progressReview([row('2026-10-04', 45), row('2026-10-01', 50)], '2026-10-06', titles);
  assert.match(review[1]!.finding, /azaldı/); assert.match(review[1]!.next, /yükü artırmayı ertele/);
  assert.doesNotMatch(JSON.stringify(review), /başarısız|yetersiz beslen|uykusuz|tembel/);
});
test('different devices, same-day logs, lighter and incomplete sessions are not strength comparisons', () => {
  const lighter = row('2026-10-05', 30); lighter.exercises[0]!.lighter = true;
  const review = progressReview([lighter, row('2026-10-04', 55), row('2026-10-04', 50), row('2026-10-01', 100, 'other-device'), row('2026-10-03', 100, 'bench-a', { unfinished: true })], '2026-10-06', titles);
  assert.match(review[1]!.finding, /önceki karşılaştırma yok/);
  assert.ok(!review[1]!.finding.includes('100 kg'));
});
test('future and unfinished records are excluded; empty data requests a baseline', () => {
  const result = progressReview([row('2026-10-07', 80), row('2026-10-03', 60, 'bench-a', { finishedAt: undefined })], '2026-10-06', titles);
  assert.equal(result.length, 1); assert.match(result[0]!.finding, /0 tamamlanmış/);
  assert.match(result[0]!.next, /kaydet/);
});
test('bodyweight repetitions and timed work get their own comparable metrics', () => {
  for (const [best, prior, pattern] of [
    [{ sets: [{ kg: 0, reps: 12 }] }, { sets: [{ kg: 0, reps: 10 }] }, /10 tekrar → 12 tekrar/],
    [{ seconds: 45 }, { seconds: 30 }, /30 sn → 45 sn/],
  ] as [NonNullable<SessionIndexExercise['best']>, NonNullable<SessionIndexExercise['best']>, RegExp][]) {
    const latest = row('2026-10-04', 0), old = row('2026-10-01', 0);
    latest.exercises[0]!.best = structuredClone(best); old.exercises[0]!.best = structuredClone(prior);
    assert.match(progressReview([latest, old], '2026-10-06', titles)[1]!.finding, pattern);
  }
});

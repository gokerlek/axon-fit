import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachClientOf, coachPage } from './coach-context.ts';
import { coachHighlights } from './coach-highlights.ts';
import { DEFAULT_COACH_PREFERENCES } from './coach-contract.ts';
import { answerCoach } from './coach-engine.ts';
import { EMPTY_CARE } from '../constraint-filter.ts';
test('PT context follows the actual client route; general pages never infer a client', () => {
  assert.equal(coachClientOf('/dashboard/clients/c_zmrbywaz/measurements'), 'c_zmrbywaz');
  assert.equal(coachClientOf('/dashboard/clients'), null);
  assert.equal(coachClientOf('/dashboard/clients/new'), null);
  assert.equal(coachPage('/dashboard/clients/c_zmrbywaz/measurements/camera'), 'measurements');
  assert.equal(coachPage('/me/antrenman'), 'workout');
  assert.equal(coachPage('/me/ayarlar'), 'settings');
});
test('each proactive preference controls its own recorded-event message', () => {
  const event = { id: 'test-session', date: '2026-10-05', dayName: 'Gün A', sets: 4 };
  assert.equal(coachHighlights(event, DEFAULT_COACH_PREFERENCES).length, 3);
  assert.deepEqual(coachHighlights(event, { comments: false, celebrations: false, suggestions: false }), []);
  const result = coachHighlights(event, { comments: true, celebrations: false, suggestions: false });
  assert.equal(result.length, 1); assert.match(result[0]!.text, /4 çalışma seti/);
  assert.ok(!result[0]!.text.includes('kalori'));
});
test('general coach locally focuses on the named client and never builds a collective program', () => {
  const context = { facts: [{ clientName: 'Ada', text: 'Ada: 3 antrenman', source: 'Ada kayıt' }, { clientName: 'Ece', text: 'Ece: 7 antrenman', source: 'Ece kayıt' }], exercises: [], care: EMPTY_CARE, existingExerciseIds: [], healthUnavailable: true, today: '', global: true };
  const answer = answerCoach({ intent: 'progress', exerciseIds: [] }, context, 'Ada nasıl gidiyor?');
  assert.match(answer.answer, /3 antrenman/); assert.ok(!answer.answer.includes('Ece'));
  assert.match(answerCoach({ intent: 'plan', exerciseIds: [] }, context).answer, /belirli bir danışan/);
});
test('ambiguous first names request clarification instead of attributing another client’s records', () => {
  const context = { facts: [{ clientName: 'Gizem Ada', text: '3 antrenman', source: 'Kayıt' }, { clientName: 'Gizem Ece', text: '7 antrenman', source: 'Kayıt' }], exercises: [], care: EMPTY_CARE, existingExerciseIds: [], healthUnavailable: true, today: '', global: true };
  const result = answerCoach({ intent: 'progress', exerciseIds: [] }, context, 'Gizem nasıl?');
  assert.match(result.answer, /birden fazla/); assert.ok(!result.answer.includes('3 antrenman'));
});

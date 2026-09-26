import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_LIMITS } from './schemas/session.ts';
import { parseSetTimer, startSetTimer, stopSetTimer, tickSetTimer, type SetTimer } from './workout-timer.ts';

const T0 = 2_000_000;
const s = (seconds: number) => T0 + seconds * 1000;
const plank = () => startSetTimer({ rowId: 'r_bbbbbb', setIndex: 0, target: { min: 30, max: 45 } }, T0);

/** Sayacı `times` anlarında sırayla ilerletir; olayları toplar. */
function run(timer: SetTimer, times: number[]) {
  const events: string[] = [];
  let current = timer;
  for (const now of times) {
    const tick = tickSetTimer(current, now);
    current = tick.timer;
    for (const event of tick.events) events.push(`${(now - T0) / 1000}:${event}`);
  }
  return { timer: current, events };
}

describe('süreli set sayacı', () => {
  test('zaman damgasından: geçen saniye, alt sınıra kalan, çubuk, evre', () => {
    const tick = tickSetTimer(plank(), s(12.6));
    assert.deepEqual({ seconds: tick.seconds, toMin: tick.toMin, phase: tick.phase }, { seconds: 12, toMin: 18, phase: 'below' });
    assert.ok(Math.abs(tick.fraction - 12.6 / 30) < 1e-9);
    assert.equal(tickSetTimer(plank(), s(40)).phase, 'reached');
    assert.equal(tickSetTimer(plank(), s(40)).fraction, 1);
    assert.equal(tickSetTimer(plank(), s(46)).phase, 'above');
    assert.equal(tickSetTimer(plank(), s(-5)).seconds, 0);
  });

  test('alt sınırda tek bip; geç fark edilen alt sınır sessiz', () => {
    const { timer, events } = run(plank(), [10, 29.9, 30, 31, 45, 60].map(s));
    assert.deepEqual(events, ['30:min']);
    assert.equal(timer.beeped, true);
    const late = run(plank(), [10, 50].map(s));
    assert.deepEqual(late.events, []);
    assert.equal(late.timer.beeped, true);
  });

  test('Bitir: geçen saniye, en az 1, şemanın sınırında', () => {
    assert.equal(stopSetTimer(plank(), s(41.8)), 41);
    assert.equal(stopSetTimer(plank(), s(0.2)), 1);
    assert.equal(stopSetTimer(plank(), s(SESSION_LIMITS.seconds + 100)), SESSION_LIMITS.seconds);
  });

  test('telefondaki kayıttan okunur; bozuksa null', () => {
    const timer = { ...plank(), beeped: true };
    assert.deepEqual(parseSetTimer(JSON.parse(JSON.stringify(timer))), timer);
    assert.equal(parseSetTimer(null), null);
    assert.equal(parseSetTimer({ ...timer, startedAt: 'dün' }), null);
    assert.equal(parseSetTimer({ ...timer, rowId: 3 }), null);
  });
});

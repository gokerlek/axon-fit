import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKOUT } from './motion.ts';
import { acknowledgeRest, adjustRest, alarmPending, LATE_MS, startRest, tickRest, type RestTimer } from './workout-rest.ts';

const T0 = 1_000_000;
const s = (seconds: number) => T0 + seconds * 1000;

/** Sayacı `times` anlarında sırayla ilerletir; olayları (an → olaylar) toplar. */
function run(timer: RestTimer, times: number[]) {
  const events: string[] = [];
  let current = timer;
  for (const now of times) {
    const tick = tickRest(current, now);
    current = tick.timer;
    for (const event of tick.events) events.push(`${(now - T0) / 1000}:${event}`);
  }
  return { timer: current, events };
}

describe('dinlenme sayacı', () => {
  test('zaman damgasından: kalan, halka, durum', () => {
    const timer = startRest('st_aaaaaaaa', 90, T0);
    const tick = tickRest(timer, s(30));
    assert.equal(tick.remainingMs, 60_000);
    assert.equal(tick.state, 'running');
    assert.ok(Math.abs(tick.fraction - 60 / 90) < 1e-9);
    assert.equal(tickRest(timer, s(85)).state, 'warn');
  });

  test('son 10 sn tek bip; bitişte 3 bip, 15 sn\'de bir en çok 3 kez yinelenir', () => {
    const times = [79, 80, 81, 89, 90, 91, 104, 105, 120, 135, 150, 200].map(s);
    const { timer, events } = run(startRest('st_aaaaaaaa', 90, T0), times);
    assert.deepEqual(events, ['80:warn', '90:end', '105:alarm', '120:alarm', '135:alarm']);
    assert.equal(timer.alarms, WORKOUT.alarmRepeats);
    assert.equal(alarmPending(timer), false);
  });

  test('dokununca alarm susar', () => {
    const ended = run(startRest('st_aaaaaaaa', 30, T0), [s(30)]).timer;
    assert.equal(alarmPending(ended), true);
    const { events } = run(acknowledgeRest(ended), [s(45), s(60)]);
    assert.deepEqual(events, []);
  });

  test('geç fark edilen an sessiz: sayfaya bittikten sonra dönülürse bip yok, aşım yazılır', () => {
    const late = tickRest(startRest('st_aaaaaaaa', 60, T0), s(60) + LATE_MS + 500);
    assert.deepEqual(late.events, []);
    assert.equal(late.state, 'ended');
    assert.equal(late.overrunMs, LATE_MS + 500);
    assert.deepEqual(run(late.timer, [s(90), s(120)]).events, []);
    // Son 10 sn'ye arkadayken girildiyse uyarı da sessiz.
    assert.deepEqual(tickRest(startRest('st_aaaaaaaa', 60, T0), s(55)).events, []);
  });

  test('±15: yalnız bu dinlenme; bitiş en erken 1 sn sonra; uzayınca uyarı ve bitmişse alarm yeniden', () => {
    const timer = startRest('st_aaaaaaaa', 60, T0);
    const warned = run(timer, [s(52)]).timer;
    const longer = adjustRest(warned, 15, s(52));
    assert.equal(longer.endsAt, s(75));
    assert.equal(longer.warned, false);
    assert.equal(adjustRest(timer, -15, s(50)).endsAt, s(51));
    const ended = run(timer, [s(60)]).timer;
    const again = adjustRest(ended, 15, s(62));
    assert.equal(again.endedAt, null);
    assert.equal(again.total, 60);
    assert.deepEqual(run(again, [s(74), s(75)]).events, ['75:end']);
    assert.equal(adjustRest(timer, 60, T0).total, 120);
  });
});

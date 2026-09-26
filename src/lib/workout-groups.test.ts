import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionDoc } from './schemas/session.ts';
import { at, W1 } from './testing/session-fixtures.ts';
import { dayWithBlocks } from './testing/workout-fixtures.ts';
import { groupView, memberLetter, nextMemberLetter } from './workout-groups.ts';
import { afterLog, logSet, newSessionDoc, nextSet } from './workout-session.ts';

function sequence() {
  let n = 0;
  return (size: number) => Uint8Array.from({ length: size }, () => (n++ * 11) % 252);
}

const bench = (id: string, sets: number) => ({ id, exerciseId: 'bench-press', sets: Array.from({ length: sets }, () => ({ min: 8, max: 10 })) });
const goblet = (id: string, sets: number) => ({ id, exerciseId: 'goblet-squat', sets: Array.from({ length: sets }, () => ({ min: 10, max: 12 })) });
const plank = (id: string, sets: number) => ({ id, exerciseId: 'plank', sets: Array.from({ length: sets }, () => ({ min: 30, max: 45 })) });

/** Süperset (Bench 3 set + Goblet 2 set, tur sonu 90 sn) ve ardından tek Plank. */
function supersetDay() {
  return dayWithBlocks([
    { id: 'b_ssssss', kind: 'superset', restSeconds: 90, rows: [bench('r_aaaaaa', 3), goblet('r_bbbbbb', 2)] },
    { id: 'b_pppppp', kind: 'single', restSeconds: 45, rows: [plank('r_pppppp', 1)] },
  ]);
}

/** Devre: üç istasyon, 2 tur, istasyon arası 20 sn, tur sonu 120 sn. */
function circuitDay() {
  return dayWithBlocks([
    { id: 'b_tttttt', kind: 'circuit', restSeconds: 120, transitionSeconds: 20, rows: [bench('r_aaaaaa', 2), goblet('r_bbbbbb', 2), plank('r_pppppp', 2)] },
  ]);
}

function start(day: ReturnType<typeof supersetDay>): SessionDoc {
  return newSessionDoc(day, { today: '2026-09-26', now: new Date(at(0)), writer: W1, random: sequence() });
}

/** Sıradaki seti önerilen değerlerle kaydeder; kaydın ardından ne olduğunu da döner. */
function step(day: ReturnType<typeof supersetDay>, doc: SessionDoc, minute: number, random = sequence()) {
  const next = nextSet(day, doc);
  if (!next) throw new Error('Set kalmadı.');
  const after = logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: { at: at(minute), by: W1 }, random }).doc;
  return { doc: after, next, then: afterLog(day, doc, after) };
}

describe('gruplar: tur düzeni', () => {
  test('süperset: üyeler arasında dinlenme yok, tur sonunda blok dinlenmesi; seti biten üye atlanır', () => {
    const day = supersetDay();
    let doc = start(day);
    const trail: string[] = [];
    for (let minute = 1; minute <= 6; minute++) {
      const result = step(day, doc, minute);
      doc = result.doc;
      trail.push(`${result.next.rowId}#${result.next.position}:${result.then.kind}${'restSeconds' in result.then ? result.then.restSeconds : 'transitionSeconds' in result.then ? result.then.transitionSeconds : ''}`);
    }
    assert.deepEqual(trail, [
      'r_aaaaaa#0:member0',
      'r_bbbbbb#0:same90',
      'r_aaaaaa#1:member0',
      'r_bbbbbb#1:same90',
      // Goblet'in setleri bitti: üçüncü tur yalnız Bench; ardından sıradaki hareket.
      'r_aaaaaa#2:next90',
      'r_pppppp#0:done',
    ]);
  });

  test('devre: istasyon geçişi üyeler arasında, tur sonunda dinlenme', () => {
    const day = circuitDay();
    let doc = start(day);
    const kinds: string[] = [];
    for (let minute = 1; minute <= 4; minute++) {
      const result = step(day, doc, minute);
      doc = result.doc;
      kinds.push(JSON.stringify(result.then));
    }
    assert.deepEqual(kinds, [
      '{"kind":"member","transitionSeconds":20}',
      '{"kind":"member","transitionSeconds":20}',
      '{"kind":"same","restSeconds":120}',
      '{"kind":"member","transitionSeconds":20}',
    ]);
  });
});

describe('gruplar: kart', () => {
  test('tur, üyeler, harfler; şu anki üye ve reçeteleri', () => {
    const day = supersetDay();
    const doc = start(day);
    const next = nextSet(day, doc);
    const view = groupView(day, doc, 'b_ssssss', next);
    assert.deepEqual(
      view && { kind: view.kind, label: view.label, round: view.round, rounds: view.rounds },
      { kind: 'superset', label: 'Süperset', round: 0, rounds: 3 },
    );
    assert.deepEqual(
      view?.members.map((member) => [member.letter, member.title, member.status, member.text]),
      [
        ['A', 'Bench Press', 'current', '20 × 8–10'],
        ['B', 'Goblet Squat', 'pending', '4 × 10–12'],
      ],
    );
    assert.equal(groupView(day, doc, 'b_pppppp', null), null);
  });

  test('kaydedilen üye ✓ ve değeriyle; turun sıradaki üyesi; seti biten üye "finished"', () => {
    const day = supersetDay();
    let doc = start(day);
    assert.equal(nextMemberLetter(day, doc), 'B');
    doc = step(day, doc, 1).doc;
    // Az önce kaydedilen setle aynı tur: A ✓, B şimdi.
    let view = groupView(day, doc, 'b_ssssss', nextSet(day, doc));
    assert.deepEqual(view?.members.map((member) => [member.status, member.text]), [
      ['done', '20 × 8'],
      ['current', '4 × 10–12'],
    ]);
    assert.equal(nextMemberLetter(day, doc), null);
    for (const minute of [2, 3, 4]) doc = step(day, doc, minute).doc;
    view = groupView(day, doc, 'b_ssssss', nextSet(day, doc));
    assert.equal(view?.round, 2);
    assert.deepEqual(view?.members.map((member) => member.status), ['current', 'finished']);
    assert.equal(nextMemberLetter(day, doc), null);
  });

  test('ağırlıksız üyeler: tekrar ve saniye', () => {
    const day = circuitDay();
    const view = groupView(day, start(day), 'b_tttttt', null);
    // Odak yoksa son tur gösterilir.
    assert.equal(view?.round, 1);
    assert.deepEqual(view?.members.map((member) => member.text), ['20 × 8–10', '4 × 10–12', '30–45 sn']);
    assert.equal(memberLetter(2), 'C');
    assert.equal(memberLetter(9), '10');
  });
});

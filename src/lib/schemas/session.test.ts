import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { at, sessionDoc, sessionEntry, workingSet } from '../testing/session-fixtures.ts';
import {
  finishBodySchema,
  parseSessionIndex,
  parseStoredSession,
  patchBodySchema,
  sessionDocSchema,
  sessionIdOfPath,
  sessionPath,
} from './session.ts';

describe('seans şeması', () => {
  test('etkin antrenman: hareket, ısınma, çalışma ve süreli set, su, bildirim', () => {
    const doc = sessionDoc({
      order: { value: ['e_q2m8xk'], updatedAt: at(1), by: 'w_aaaaaa' },
      rotation: { value: 'advance', updatedAt: at(2) },
      adjust: 'lighter',
      entries: [
        sessionEntry('e_q2m8xk', {
          rowId: 'r_aaaaaa',
          blockId: 'b_aaaaaa',
          deviceId: 'olympic-bar',
          plan: { topWeightKg: 62.5, reason: 'increase', stage: 'novice' },
          sets: [
            { id: 'st_warmup01', type: 'warmup', kg: 20, reps: 10, at: at(1) },
            workingSet('st_7h2k9m4q', 3, { setIndex: 0, target: { min: 8, max: 10 }, effort: 'good', plannedSetCount: 3, editedAt: at(4) }),
            workingSet('st_plank001', 6, { kg: undefined, reps: undefined, seconds: 45 }),
          ],
        }),
      ],
      waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(2) }, { id: 'wt_bbbbbbbb', d: -1, at: at(3) }],
      notices: [{ kind: 'other_day', at: at(0) }],
      effort: { sessionRpe: 6, durationMin: 55, updatedAt: at(70) },
    });
    const parsed = v.safeParse(sessionDocSchema, doc);
    assert.equal(parsed.success, true, JSON.stringify(parsed.issues?.[0]?.message));
  });

  test('bitiş anı yalnız bitmişte: bitmiş ama anı yok ya da etkin ama anı var reddedilir', () => {
    assert.equal(v.is(sessionDocSchema, sessionDoc({ status: 'finished' })), false);
    assert.equal(v.is(sessionDocSchema, sessionDoc({ finishedAt: at(60) })), false);
    assert.equal(v.is(sessionDocSchema, sessionDoc({ status: 'finished', finishedAt: at(60) })), true);
  });

  test('sette ya tekrar ya süre: ikisi birden ya da hiçbiri reddedilir', () => {
    const both = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 1, { seconds: 30 })] })] });
    const none = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 1, { reps: undefined })] })] });
    assert.equal(v.is(sessionDocSchema, both), false);
    assert.equal(v.is(sessionDocSchema, none), false);
  });

  test('aynı set ya da hareket kimliği iki kez: reddedilir', () => {
    const twice = sessionDoc({
      entries: [
        sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 1)] }),
        sessionEntry('e_bbbbbb', { sets: [workingSet('st_aaaaaaaa', 2)] }),
      ],
    });
    assert.equal(v.is(sessionDocSchema, twice), false);
  });

  test('sağlık alanı yok: ağrı nedeni ("pain") geçme nedeni olarak kabul edilmez', () => {
    const pain = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { status: 'skipped', skip: { reason: 'pain' as 'other', moved: true } })] });
    assert.equal(v.is(sessionDocSchema, pain), false);
    // Bilinmeyen alanlar (ör. hazır oluşluk puanı) atılır, dosyaya girmez.
    const parsed = v.parse(sessionDocSchema, { ...sessionDoc(), readiness: { sleep: 2 } });
    assert.equal('readiness' in parsed, false);
  });

  test('iz dosyası ve antrenman aynı ayrıştırıcıdan; uymayan null', () => {
    assert.deepEqual(parseStoredSession({ version: 1, id: 's_k2m9x4qa', status: 'deleted', deletedAt: at(9) }), {
      version: 1,
      id: 's_k2m9x4qa',
      status: 'deleted',
      deletedAt: at(9),
    });
    assert.equal(parseStoredSession(sessionDoc())?.status, 'active');
    assert.equal(parseStoredSession({ status: 'deleted' }), null);
    assert.equal(parseStoredSession('x'), null);
  });

  test('yol yalnız kimlikten; yoldan kimlik', () => {
    assert.equal(sessionPath('s_k2m9x4qa'), 'sessions/s_k2m9x4qa.json');
    assert.equal(sessionIdOfPath('sessions/s_k2m9x4qa.json'), 's_k2m9x4qa');
    assert.equal(sessionIdOfPath('sessions/2026-09-20-s_91.json'), null);
    assert.equal(sessionIdOfPath('sessions/sub/s_k2m9x4qa.json'), null);
  });

  test('index satır satır okunur: uymayan satır düşer, gerisi kalır; bozuk dosya boş index', () => {
    const good = {
      id: 's_k2m9x4qa',
      sha: 'a'.repeat(40),
      path: 'sessions/s_k2m9x4qa.json',
      date: '2026-09-26',
      otherDay: false,
      unfinished: false,
      volumeKg: 0,
      sets: 0,
      water: 0,
      exercises: [],
      notices: [],
    };
    const { index, dropped } = parseSessionIndex({ version: 1, items: [good, { id: 'bozuk' }], deleted: [{ id: 's_aaaaaaaa', at: at(1) }, 3] });
    assert.equal(index.items.length, 1);
    assert.equal(index.deleted.length, 1);
    assert.equal(dropped, 2);
    assert.deepEqual(parseSessionIndex(null).index, { version: 1, items: [], deleted: [] });
  });

  test('bitiş gövdesi: sağlık ayrıntısı ayrı ve yalnız izinli biçimde; düzeltme en az bir değişiklik ister', () => {
    assert.equal(v.is(finishBodySchema, { doc: sessionDoc(), rotation: 'keep', health: { skippedRows: [{ rowId: 'r_aaaaaa', reason: 'pain' }] } }), true);
    assert.equal(v.is(finishBodySchema, { doc: sessionDoc(), rotation: 'sonra' }), false);
    assert.equal(v.is(patchBodySchema, { writer: 'w_aaaaaa' }), false);
    assert.equal(v.is(patchBodySchema, { writer: 'w_aaaaaa', deleteSetIds: ['st_aaaaaaaa'] }), true);
  });
});

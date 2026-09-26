import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { activeSessionOf, LIVE_WINDOW_MS, liveSessionOf, sessionFileOfCommit, withinLiveWindow } from './live-session.ts';
import { agoText, liveDetailText, liveText, type LiveSession } from './live-text.ts';
import { programSchema } from './schemas/program.ts';
import { at, DAY_B, programFile, SESSION_ID, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

const program = v.parse(programSchema, programFile());
const NOW = new Date(at(20));

describe('canlı görünüm: açık antrenmanın dosyası', () => {
  test('commit\'in değiştirdiği antrenman dosyası; silinen dosya ve index sayılmaz', () => {
    assert.deepEqual(
      sessionFileOfCommit([
        { filename: 'sessions-index.json', status: 'modified', sha: 'a'.repeat(40) },
        { filename: 'sessions/s_aaaaaaaa.json', status: 'removed', sha: null },
        { filename: `sessions/${SESSION_ID}.json`, status: 'modified', sha: 'b'.repeat(40) },
      ]),
      { path: `sessions/${SESSION_ID}.json`, sha: 'b'.repeat(40) },
    );
    assert.equal(sessionFileOfCommit([{ filename: 'program.json', status: 'modified', sha: 'c'.repeat(40) }]), null);
  });

  test('yalnız etkin antrenman: bitmiş, iz dosyası ve bozuk dosya canlı değil', () => {
    assert.equal(activeSessionOf(sessionDoc())?.id, SESSION_ID);
    assert.equal(activeSessionOf(sessionDoc({ status: 'finished', finishedAt: at(50) })), null);
    assert.equal(activeSessionOf({ version: 1, id: SESSION_ID, status: 'deleted', deletedAt: at(5) }), null);
    assert.equal(activeSessionOf({ nope: true }), null);
  });

  test('pencere 3 saat: daha eski yazım "yarım"dır, canlı değil', () => {
    assert.equal(withinLiveWindow(at(0), new Date(Date.parse(at(0)) + LIVE_WINDOW_MS)), true);
    assert.equal(withinLiveWindow(at(0), new Date(Date.parse(at(0)) + LIVE_WINDOW_MS + 1)), false);
    assert.equal(withinLiveWindow(at(30), NOW), true, 'saat farkıyla gelecekteki an');
    assert.equal(withinLiveWindow('bozuk', NOW), false);
    assert.equal(liveSessionOf({ doc: sessionDoc(), program, committedAt: at(0), now: new Date(Date.parse(at(0)) + 4 * 3600_000) }), null);
  });
});

describe('canlı görünüm: özet', () => {
  test('yapılan / planlanan set bitişteki hesapla (Gün A: 3 + 2 set), son setin anı', () => {
    const doc = sessionDoc({
      entries: [
        sessionEntry('e_aaaaaa', {
          rowId: 'r_aaaaaa',
          status: 'done',
          sets: [
            workingSet('st_aaaaaaa1', 3),
            workingSet('st_aaaaaaa2', 6),
            workingSet('st_aaaaaaa3', 9),
            // Plandan fazla set sayılmaz.
            workingSet('st_aaaaaaa4', 11, { extra: true }),
          ],
        }),
        sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', exerciseId: 'leg-press', title: 'Leg Press', status: 'partial', sets: [workingSet('st_bbbbbbb1', 14)] }),
      ],
    });
    const live = liveSessionOf({ doc, program, committedAt: at(14), now: NOW });
    assert.deepEqual(live, {
      sessionId: SESSION_ID,
      dayName: 'Gün A',
      done: 4,
      planned: 5,
      startedAt: at(0),
      lastSetAt: at(14),
      updatedAt: at(14),
    });
    assert.equal(liveText(live as LiveSession, NOW), 'Şu an antrenmanda · Gün A · 4/5 set · son set 6 dk önce');
  });

  test('gün programda yoksa yalnız yapılan setler; henüz set yoksa başlangıç', () => {
    const noDay = liveSessionOf({
      doc: sessionDoc({ program: { revision: 1, dayId: 'd_zzzzzz', dayName: 'Eski gün' }, entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaa1', 2)] })] }),
      program,
      committedAt: at(2),
      now: NOW,
    });
    assert.equal(noDay?.planned, null);
    assert.equal(liveDetailText(noDay as LiveSession, NOW), 'Eski gün · 1 set · son set 18 dk önce');

    const empty = liveSessionOf({ doc: sessionDoc({ program: { revision: 1, dayId: DAY_B, dayName: 'Gün B' } }), program: null, committedAt: at(1), now: NOW });
    assert.equal(liveDetailText(empty as LiveSession, NOW), 'Gün B · 0 set · başladı 20 dk önce');
  });

  test('göreli zaman: az önce, dakika, saat', () => {
    assert.equal(agoText(at(20), NOW), 'az önce');
    assert.equal(agoText(at(21), NOW), 'az önce', 'gelecekteki an');
    assert.equal(agoText(at(18), NOW), '2 dk önce');
    assert.equal(agoText(at(-65), NOW), '1 sa 25 dk önce');
  });
});

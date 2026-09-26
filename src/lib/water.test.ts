import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { emptyWaterFile, mergeWaterTaps, parseWaterFile, WATER_LIMITS, waterMessage, waterOnDay, waterPostSchema } from './water.ts';

const TZ = 'Europe/Istanbul';
const tap = (id: string, at: string, d: 1 | -1 = 1) => ({ id, d, at });

describe('su: water.json', () => {
  test('dokunuş dokunuş okunur: uymayan ve ikinci kez gelen kimlik düşer, sıra zamana göre', () => {
    const { file, dropped } = parseWaterFile({
      taps: [tap('wt_bbbbbbbb', '2026-09-26T10:00:00.000Z'), { id: 'x', d: 1 }, tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z'), tap('wt_bbbbbbbb', '2026-09-26T11:00:00.000Z')],
    });
    assert.equal(dropped, 2);
    assert.deepEqual(file.taps.map((item) => item.id), ['wt_aaaaaaaa', 'wt_bbbbbbbb']);
    assert.deepEqual(parseWaterFile(null), { file: emptyWaterFile(), dropped: 0 });
    assert.deepEqual(parseWaterFile('bozuk'), { file: emptyWaterFile(), dropped: 0 });
  });

  test('birleştirme kimlikle: aynı dokunuşu yeniden göndermek değişiklik değildir', () => {
    const first = mergeWaterTaps(emptyWaterFile(), [tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z')]);
    assert.equal(first.changed, true);
    const again = mergeWaterTaps(first.file, [tap('wt_aaaaaaaa', '2026-09-26T09:30:00.000Z')]);
    assert.equal(again.changed, false);
    assert.equal(again.file.taps[0]?.at, '2026-09-26T09:00:00.000Z');
    const undo = mergeWaterTaps(first.file, [tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z'), tap('wt_cccccccc', '2026-09-26T09:01:00.000Z', -1)]);
    assert.deepEqual(undo.added.map((item) => item.id), ['wt_cccccccc']);
  });

  test('sınır aşılınca en eski dokunuşlar düşer', () => {
    const taps = Array.from({ length: WATER_LIMITS.taps }, (_, index) =>
      tap(`wt_${index.toString(36).padStart(8, '0')}`, new Date(Date.UTC(2025, 0, 1) + index * 60_000).toISOString()),
    );
    const merged = mergeWaterTaps({ version: 1, taps }, [tap('wt_zzzzzzzz', '2026-09-26T09:00:00.000Z')]);
    assert.equal(merged.file.taps.length, WATER_LIMITS.taps);
    assert.equal(merged.file.taps.at(-1)?.id, 'wt_zzzzzzzz');
    assert.equal(merged.file.taps[0]?.id, taps[1]?.id);
  });

  test('günün toplamı uygulamanın saat diliminde; geri al −1; en az 0', () => {
    const taps = [
      tap('wt_aaaaaaaa', '2026-09-25T21:30:00.000Z'), // İstanbul'da 26 Eylül 00:30
      tap('wt_bbbbbbbb', '2026-09-26T08:00:00.000Z'),
      tap('wt_cccccccc', '2026-09-26T08:00:05.000Z', -1),
      tap('wt_dddddddd', '2026-09-25T20:00:00.000Z'), // 25 Eylül 23:00
    ];
    assert.equal(waterOnDay(taps, '2026-09-26', TZ), 1);
    assert.equal(waterOnDay(taps, '2026-09-25', TZ), 1);
    assert.equal(waterOnDay([tap('wt_eeeeeeee', '2026-09-26T08:00:00.000Z', -1)], '2026-09-26', TZ), 0);
  });

  test('istek gövdesi: 1–50 dokunuş; commit mesajı yalnız sayı', () => {
    assert.equal(v.safeParse(waterPostSchema, { taps: [] }).success, false);
    assert.equal(v.safeParse(waterPostSchema, { taps: [{ id: 'wt_aaaaaaaa', d: 2, at: '2026-09-26T08:00:00.000Z' }] }).success, false);
    assert.equal(v.safeParse(waterPostSchema, { taps: [tap('wt_aaaaaaaa', '2026-09-26T08:00:00.000Z')] }).success, true);
    assert.equal(waterMessage([{ d: 1 }, { d: 1 }]), 'Su · +2');
    assert.equal(waterMessage([{ d: 1 }, { d: -1 }]), 'Su · +1 · −1');
  });
});

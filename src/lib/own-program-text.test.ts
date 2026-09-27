import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { lastDateByDay, lastDateByProgram, ownLogLabel, programLine, ptUpdatedSince, scheduleText } from './own-program-text.ts';
import type { SessionIndexRow } from './schemas/session.ts';

function row(id: string, date: string, extra: Partial<SessionIndexRow> = {}): SessionIndexRow {
  return {
    id,
    sha: 'a'.repeat(40),
    path: `sessions/${id}.json`,
    date,
    finishedAt: `${date}T10:00:00.000Z`,
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: 0,
    water: 0,
    exercises: [],
    notices: [],
    ...extra,
  };
}

describe('kendi program metinleri', () => {
  test('satır: gün sayısı, haftalık sayı, günler, son antrenman', () => {
    assert.equal(programLine({ days: 2, weekdays: [4, 2] }, '2026-09-22'), '2 gün · haftada 2 · Sal, Per · son: 22 Eyl');
    assert.equal(programLine({ days: 3, weekdays: [], daysPerWeek: 3 }), '3 gün · haftada 3');
    assert.equal(programLine({ days: 1, weekdays: [] }), '1 gün · gün seçilmedi');
    assert.equal(scheduleText({ weekdays: [], daysPerWeek: 2 }), 'haftada 2');
    assert.equal(scheduleText({ weekdays: [] }), 'gün seçilmedi');
  });

  test('son antrenman programa ve güne göre; bitmemiş sayılmaz', () => {
    const index = {
      items: [
        row('s_aaaaaaaa', '2026-09-20', { programId: 'op_evde0001', dayId: 'd_ownaaa' }),
        row('s_bbbbbbbb', '2026-09-22', { programId: 'op_evde0001', dayId: 'd_ownbbb' }),
        row('s_cccccccc', '2026-09-23', { dayId: 'd_aaaaaa' }),
        row('s_dddddddd', '2026-09-25', { programId: 'op_evde0001', finishedAt: undefined }),
      ],
    };
    assert.deepEqual([...lastDateByProgram(index)], [['op_evde0001', '2026-09-22'], ['pt', '2026-09-23']]);
    assert.equal(lastDateByDay(index).get('d_ownaaa'), '2026-09-20');
  });

  test('PT programı kalıcı seçimden sonra kaydedildi mi (yalnız kendi program seçiliyken)', () => {
    const program = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-25T00:00:00.000Z' };
    assert.equal(ptUpdatedSince(program, { programId: 'op_evde0001', at: '2026-09-20T00:00:00.000Z' }), true);
    assert.equal(ptUpdatedSince(program, { programId: 'op_evde0001', at: '2026-09-26T00:00:00.000Z' }), false);
    assert.equal(ptUpdatedSince(program, { programId: null, at: '2026-09-20T00:00:00.000Z' }), false);
    assert.equal(ptUpdatedSince(null, { programId: 'op_evde0001', at: '2026-09-20T00:00:00.000Z' }), false);
  });

  test('geçmiş etiketleri görene göre (§7.3)', () => {
    assert.equal(ownLogLabel({ kind: 'edit', by: 'pt' }, 'client'), 'Antrenörün düzenledi');
    assert.equal(ownLogLabel({ kind: 'edit', by: 'pt' }, 'pt'), 'Düzenledin');
    assert.equal(ownLogLabel({ kind: 'edit' }, 'client'), 'Düzenledin');
    assert.equal(ownLogLabel({ kind: 'edit' }, 'pt'), 'Danışan düzenledi');
    assert.equal(ownLogLabel({ kind: 'client' }, 'client'), 'Antrenmandan');
    assert.equal(ownLogLabel({ kind: 'create' }, 'pt'), 'Danışan oluşturdu');
    assert.equal(ownLogLabel({ kind: 'share' }, 'pt'), 'Paylaşım');
  });
});

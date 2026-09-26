import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { HEALTH_CONSENT_VERSION, type Client } from './schemas/client.ts';
import { emptySessionIndex, type SessionDoc, type SessionIndex } from './schemas/session.ts';
import { allowedHealth, applyPatch, defaultRotation, planFinish, planPut, sessionDateFor, type FinishInput } from './session-finish.ts';
import { withDeletions } from './session-merge.ts';
import { at, DAY_A, DAY_B, programFile, sessionDoc, sessionEntry, W1, W2, workingSet } from './testing/session-fixtures.ts';

const TZ = 'Europe/Istanbul';
const NOW = new Date(at(60));

let counter = 0;
const sets = (count: number, from: number) =>
  Array.from({ length: count }, (_, index) =>
    workingSet(`st_${(++counter).toString(36).padStart(8, '0')}`, from + index, { setIndex: index, target: { min: 8, max: 10 } }),
  );

/** Gün A: Bench 3 set + Leg Press 2 set; `done` kaçının yapıldığı. */
function dayA(done: { bench: number; leg: number }, overrides: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({
    entries: [
      sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: sets(done.bench, 1) }),
      sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', exerciseId: 'leg-press', title: 'Leg Press', sets: sets(done.leg, 10) }),
    ],
    ...overrides,
  });
}

const noConsent: Pick<Client, 'modules' | 'consents'> = { modules: { health: { enabled: false, fields: [] } }, consents: {} };
const consent: Pick<Client, 'modules' | 'consents'> = {
  modules: { health: { enabled: true, fields: ['check_in', 'readiness'], enabledAt: '2026-09-01T00:00:00.000Z' } },
  consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['check_in', 'readiness'], at: '2026-09-02T00:00:00.000Z' } },
};

function finishInput(incoming: SessionDoc, overrides: Partial<FinishInput> = {}): FinishInput {
  return {
    stored: null,
    incoming,
    index: emptySessionIndex(),
    program: programFile(),
    healthFile: null,
    client: noConsent,
    now: NOW,
    timeZone: TZ,
    ...overrides,
  };
}

const fileOf = (plan: { files: { path: string; content: unknown }[] }, path: string) => plan.files.find((file) => file.path === path)?.content;

describe('bitiş: tek commit', () => {
  test('tamamlanan gün: seans bitti, index satırı (sha dosyanınki), rotasyon ilerler; program ham korunur, revision artmaz', () => {
    // Sunucuda 3 set var; telefon kalan 2 seti ve bitişi gönderir.
    const full = dayA({ bench: 3, leg: 2 });
    const stored = { ...full, entries: full.entries.map((entry) => (entry.id === 'e_bbbbbb' ? { ...entry, sets: [] } : entry)) };
    const incoming = { ...full, status: 'finished' as const, finishedAt: at(55), writer: W2 };
    const raw = programFile({ lastDayId: DAY_B, lastCompletedAt: '2026-09-24T18:00:00.000Z' }, { clientTargets: { r_aaaaaa: { at: 'x' } } });
    const plan = planFinish(finishInput(incoming, { stored, program: raw }));

    assert.deepEqual(plan.files.map((file) => file.path), ['sessions/s_k2m9x4qa.json', 'sessions-index.json', 'program.json']);
    assert.equal(plan.doc.status, 'finished');
    assert.equal(plan.doc.finishedAt, at(55));
    assert.equal(plan.doc.writer, W2);
    assert.equal(plan.doc.rotation?.value, 'advance');
    assert.deepEqual(plan.rotation, { choice: 'advance', applied: true });
    assert.equal(plan.message, 'Antrenman bitti · Gün A · 5 set');
    assert.equal(plan.doc.notices.length, 0);

    const index = fileOf(plan, 'sessions-index.json') as SessionIndex;
    assert.equal(index.items[0]?.sha, gitBlobSha(jsonText(fileOf(plan, 'sessions/s_k2m9x4qa.json'))));
    assert.equal(index.items[0]?.sets, 5);

    const program = fileOf(plan, 'program.json') as ReturnType<typeof programFile>;
    assert.deepEqual(program.rotation, { lastDayId: DAY_A, lastCompletedAt: at(55) });
    assert.equal(program.revision, 7);
    assert.deepEqual((program as Record<string, unknown>).clientTargets, { r_aaaaaa: { at: 'x' } });
  });

  test('hazır seçim: yarıdan azı yapıldıysa aynı gün sırada kalır, "yarım" bildirimi', () => {
    const plan = planFinish(finishInput(dayA({ bench: 2, leg: 0 })));
    assert.deepEqual(plan.rotation, { choice: 'keep', applied: false });
    assert.equal(fileOf(plan, 'program.json'), undefined);
    assert.deepEqual(plan.doc.notices.map((notice) => notice.kind), ['unfinished']);
    assert.equal((fileOf(plan, 'sessions-index.json') as SessionIndex).items[0]?.unfinished, true);
    assert.equal(defaultRotation(3, 5), 'advance');
    assert.equal(defaultRotation(2, 5), 'keep');
  });

  test('danışanın seçimi hazır seçimi geçer', () => {
    const kept = planFinish(finishInput(dayA({ bench: 3, leg: 2 }), { rotation: 'keep' }));
    assert.deepEqual(kept.rotation, { choice: 'keep', applied: false });
    assert.equal(kept.doc.rotation?.value, 'keep');
    const advanced = planFinish(finishInput(dayA({ bench: 1, leg: 0 }), { rotation: 'advance' }));
    assert.equal(advanced.rotation.applied, true);
  });

  test('rotasyon zamanla korunur: sonraki antrenmandan sonra gelen eski bitiş sırayı geri almaz', () => {
    const late = planFinish(finishInput(dayA({ bench: 3, leg: 2 }), { program: programFile({ lastDayId: DAY_B, lastCompletedAt: at(120) }) }));
    assert.deepEqual(late.rotation, { choice: 'advance', applied: false });
    assert.equal(fileOf(late, 'program.json'), undefined);
    // Seans yine bitmiş olarak yazılır.
    assert.equal(late.doc.status, 'finished');
  });

  test('başka gün seçildi: bildirim; sıra seçilen günden sürer', () => {
    const doc = sessionDoc({
      program: { revision: 7, dayId: DAY_B, dayName: 'Gün B', plannedDayId: DAY_A },
      entries: [sessionEntry('e_cccccc', { rowId: 'r_cccccc', sets: sets(3, 1) })],
    });
    const plan = planFinish(finishInput(doc));
    assert.deepEqual(plan.doc.notices.map((notice) => notice.kind), ['other_day']);
    assert.equal((fileOf(plan, 'program.json') as ReturnType<typeof programFile>).rotation.lastDayId, DAY_B);
    assert.equal((fileOf(plan, 'sessions-index.json') as SessionIndex).items[0]?.otherDay, true);
  });

  test('okunamayan ya da olmayan program: rotasyon yok, bitiş sürer', () => {
    for (const program of [null, { bozuk: true }]) {
      const plan = planFinish(finishInput(dayA({ bench: 3, leg: 2 }), { program }));
      assert.equal(plan.rotation.applied, false);
      assert.deepEqual(plan.files.map((file) => file.path), ['sessions/s_k2m9x4qa.json', 'sessions-index.json']);
    }
  });

  test('bitiş anı: gelecekte ya da başlangıçtan önceyse sunucunun anı', () => {
    assert.equal(planFinish(finishInput({ ...dayA({ bench: 3, leg: 2 }), status: 'finished', finishedAt: at(600) })).doc.finishedAt, NOW.toISOString());
    assert.equal(planFinish(finishInput({ ...dayA({ bench: 3, leg: 2 }), status: 'finished', finishedAt: at(-5) })).doc.finishedAt, NOW.toISOString());
  });
});

describe('bitiş: sağlık ayrıntısı yalnız onayla ve yalnız health.json', () => {
  const health = { skippedRows: [{ rowId: 'r_bbbbbb', reason: 'pain' as const }], adjustReason: 'readiness' as const };
  const skippedLeg = () =>
    dayA({ bench: 3, leg: 0 }, {
      adjust: 'lighter',
      entries: [
        sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: sets(3, 1) }),
        sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', status: 'skipped', skip: { reason: 'other', moved: true } }),
      ],
    });

  test('onay var: health.json\'a seansın kimliğiyle; seans dosyası nötr', () => {
    const plan = planFinish(finishInput(skippedLeg(), { health, client: consent }));
    assert.equal(plan.health, 'written');
    const record = fileOf(plan, 'health.json') as { checkIns: unknown[] };
    assert.deepEqual(record.checkIns, [{ date: '2026-09-26', sessionId: 's_k2m9x4qa', skippedRows: health.skippedRows, adjustReason: 'readiness' }]);
    const text = JSON.stringify(fileOf(plan, 'sessions/s_k2m9x4qa.json'));
    assert.equal(text.includes('pain'), false);
    assert.equal(text.includes('readiness'), false);
  });

  test('yeniden deneme çoğaltmaz: aynı seansın kaydı güncellenir', () => {
    const existing = { conditions: [], checkIns: [{ date: '2026-09-26', sessionId: 's_k2m9x4qa', adjustReason: 'pain' }], measurements: [], movementScreens: [] };
    const plan = planFinish(finishInput(skippedLeg(), { health, client: consent, healthFile: existing }));
    assert.equal((fileOf(plan, 'health.json') as { checkIns: unknown[] }).checkIns.length, 1);
  });

  test('onay yok: hiçbir şey yazılmaz; bozuk health.json üzerine yazılmaz', () => {
    const dropped = planFinish(finishInput(skippedLeg(), { health }));
    assert.equal(dropped.health, 'dropped');
    assert.equal(fileOf(dropped, 'health.json'), undefined);
    const broken = planFinish(finishInput(skippedLeg(), { health, client: consent, healthFile: { checkIns: 'x' } }));
    assert.equal(broken.health, 'broken');
    assert.equal(fileOf(broken, 'health.json'), undefined);
  });

  test('parça parça: ağrı yalnız ağrı takibi onayıyla, hazır oluşluk yalnız kendi onayıyla', () => {
    const readinessOnly = {
      modules: { health: { enabled: true, fields: ['readiness' as const] } },
      consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['readiness' as const], at: '2026-09-02T00:00:00.000Z' } },
    };
    assert.deepEqual(allowedHealth(readinessOnly, health), { adjustReason: 'readiness' });
    assert.equal(allowedHealth(readinessOnly, { adjustReason: 'pain' }), null);
    assert.equal(allowedHealth(noConsent, health), null);
  });
});

describe('PUT ve düzeltme hesapları', () => {
  test('tarih sunucudan: gece yarısını geçen antrenman başlangıç gününde; saçma başlangıçta sunucunun günü', () => {
    const now = new Date('2026-09-26T21:10:00.000Z'); // İstanbul 00:10 (27'si)
    assert.equal(sessionDateFor('2026-09-26T20:50:00.000Z', now, TZ), '2026-09-26');
    assert.equal(sessionDateFor('2020-01-01T10:00:00.000Z', now, TZ), '2026-09-27');
  });

  test('ilk yazma: tarih sunucudan, durum etkin; sonra kayıttaki tarih kalır', () => {
    const incoming = { ...dayA({ bench: 1, leg: 0 }), date: '1999-01-01', status: 'finished' as const, finishedAt: at(9) };
    const first = planPut(null, incoming, { now: NOW, timeZone: TZ });
    assert.deepEqual([first.doc.date, first.doc.status, first.doc.finishedAt, first.changed], ['2026-09-26', 'active', undefined, true]);
    const again = planPut(first.doc, { ...incoming, writer: W2 }, { now: NOW, timeZone: TZ });
    assert.equal(again.changed, false, 'aynı belge başka cihazdan: değişiklik yok');
    assert.equal(again.doc.writer, W2);
  });

  test('düzeltme: silme kalıcı, set ekleme silineni geri getirmez, zorluk kısmen güncellenir', () => {
    const stored = { ...withDeletions(dayA({ bench: 3, leg: 2 }), { setIds: [] }), status: 'finished' as const, finishedAt: at(50), effort: { durationMin: 50, updatedAt: at(50) } };
    const benchSets = stored.entries[0]?.sets ?? [];
    const deleted = applyPatch(stored, { writer: W1, deleteSetIds: [benchSets[0]?.id as string] }, NOW);
    assert.equal(deleted.doc.entries[0]?.sets.length, 2);
    assert.equal(deleted.message, 'Kayıt silindi');

    const phone = sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: [...benchSets, workingSet('st_zzzzzzzz', 40, { extra: true })] });
    const added = applyPatch(deleted.doc, { writer: W2, addSets: [phone] }, NOW);
    assert.deepEqual(added.doc.entries[0]?.sets.map((set) => set.id).includes(benchSets[0]?.id as string), false);
    assert.equal(added.doc.entries[0]?.sets.length, 3);
    assert.equal(added.message, 'Set eklendi (+1 set)');

    const rated = applyPatch(added.doc, { writer: W2, effort: { sessionRpe: 7 } }, NOW);
    assert.deepEqual(rated.doc.effort, { sessionRpe: 7, durationMin: 50, updatedAt: NOW.toISOString(), by: W2 });
    assert.equal(applyPatch(rated.doc, { writer: W1, effort: { sessionRpe: 7, durationMin: 50 } }, new Date(at(40))).changed, false);
  });
});

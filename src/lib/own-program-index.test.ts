import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha, jsonText } from './github/blob.ts';
import {
  activeItem,
  activeProgramId,
  addOwnEvent,
  emptyOwnIndex,
  OWN_EVENTS_MAX,
  ownIndexItemOf,
  parseOwnIndex,
  ptEdits,
  removeOwnItem,
  repairOwnIndex,
  shownProgram,
  upsertOwnItem,
  withActive,
  type OwnIndex,
} from './own-program-index.ts';
import type { OwnProgram } from './own-programs.ts';
import { OWN_ID, ownProgram } from './testing/own-fixtures.ts';

const NOW = new Date('2026-09-27T10:00:00.000Z');
const sha = (program: OwnProgram) => gitBlobSha(jsonText(program));
const OTHER = 'op_tatil001';
const tatil = () => ownProgram({ id: OTHER, name: 'Tatil', createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:00:00.000Z' });

function indexOf(...programs: OwnProgram[]): OwnIndex {
  return programs.reduce((index, program) => upsertOwnItem(index, ownIndexItemOf(program, sha(program))), emptyOwnIndex());
}

describe('index satırları', () => {
  test('satır programdan: gün sayısı, günler ve anı, sıklık yalnız gün yoksa, revision, paylaşım', () => {
    const program = ownProgram({ schedule: { weekdays: [4, 2], at: '2026-09-21T00:00:00.000Z' }, shared: { at: '2026-09-22T00:00:00.000Z' }, revision: 4 });
    const item = ownIndexItemOf(program, sha(program), { ptEditedAt: '2026-09-25T00:00:00.000Z' });
    assert.deepEqual(
      { days: item.days, weekdays: item.weekdays, weekdaysAt: item.weekdaysAt, revision: item.revision, shared: item.shared, ptEditedAt: item.ptEditedAt, daysPerWeek: item.daysPerWeek },
      { days: 2, weekdays: [2, 4], weekdaysAt: '2026-09-21T00:00:00.000Z', revision: 4, shared: { at: '2026-09-22T00:00:00.000Z' }, ptEditedAt: '2026-09-25T00:00:00.000Z', daysPerWeek: undefined },
    );
    const unshared = ownIndexItemOf(ownProgram(), 'a'.repeat(40), { ptEditedAt: '2026-09-25T00:00:00.000Z' });
    assert.equal(unshared.ptEditedAt, undefined, 'paylaşım kapanınca bildirim anları düşer');
  });

  test('oluşturulma sırası (seçim listeyi zıplatmaz); hoşgörülü okuma', () => {
    const index = indexOf(ownProgram(), tatil());
    assert.deepEqual(index.items.map((item) => item.id), [OTHER, OWN_ID]);
    const raw = { ...index, items: [...index.items, { id: 'bozuk' }], active: { programId: 'x' } };
    const parsed = parseOwnIndex(raw);
    assert.equal(parsed.dropped, 1);
    assert.equal(parsed.index.items.length, 2);
    assert.equal(parsed.index.active, undefined);
    assert.deepEqual(parseOwnIndex(null).index, emptyOwnIndex());
  });
});

describe('seçim, silme, olaylar', () => {
  test('seçim: aynıysa null; listede olmayan program PT\'nin programı sayılır', () => {
    const index = indexOf(ownProgram());
    const selected = withActive(index, OWN_ID, NOW);
    assert.deepEqual(selected?.active, { programId: OWN_ID, at: NOW.toISOString() });
    assert.equal(withActive(selected!, OWN_ID, NOW), null);
    assert.equal(withActive(index, null, NOW), null, 'seçim yokken PT programı zaten geçerli');
    assert.deepEqual(withActive(selected!, null, NOW)?.active, { programId: null, at: NOW.toISOString() });
    assert.equal(activeProgramId(selected), OWN_ID);
    assert.equal(activeItem(selected)?.name, 'Evde');
    assert.equal(activeProgramId({ ...selected!, items: [] }), null);
  });

  test('Bugün\'de gösterilen: adresteki ("Yalnız bugün"), yoksa kalıcı seçim; okunamayan seçim PT\'ye düşer', () => {
    const index = withActive(indexOf(ownProgram(), tatil()), OWN_ID, NOW)!;
    assert.deepEqual(shownProgram(index, [], null), { shown: OWN_ID, oneOff: false });
    assert.deepEqual(shownProgram(index, [], 'pt'), { shown: null, oneOff: true });
    assert.deepEqual(shownProgram(index, [], OTHER), { shown: OTHER, oneOff: true });
    assert.deepEqual(shownProgram(index, [], OWN_ID), { shown: OWN_ID, oneOff: false });
    assert.deepEqual(shownProgram(index, [], 'op_yokyok01'), { shown: OWN_ID, oneOff: false }, 'listede olmayan adres kalıcı seçime düşer');
    assert.deepEqual(shownProgram(index, [], '../x'), { shown: OWN_ID, oneOff: false });
    const broken = { ...index, items: index.items.filter((item) => item.id !== OWN_ID) };
    assert.deepEqual(shownProgram(broken, [{ id: OWN_ID, name: 'Evde' }], null), { shown: null, oneOff: false, broken: { name: 'Evde' } });
    assert.deepEqual(shownProgram(emptyOwnIndex(), [], null), { shown: null, oneOff: false });
  });

  test('silme: satır düşer; seçiliyse seçim PT\'ye (an yenilenir); paylaşılmışsa deleted olayı', () => {
    const shared = ownProgram({ shared: { at: '2026-09-22T00:00:00.000Z' } });
    const index = withActive(indexOf(shared, tatil()), OWN_ID, new Date('2026-09-23T00:00:00.000Z'))!;
    const removed = removeOwnItem(index, OWN_ID, NOW);
    assert.deepEqual(removed.items.map((item) => item.id), [OTHER]);
    assert.deepEqual(removed.active, { programId: null, at: NOW.toISOString() });
    assert.deepEqual(removed.events, [{ kind: 'deleted', id: OWN_ID, name: 'Evde', at: NOW.toISOString() }]);
    const plain = removeOwnItem(indexOf(tatil()), OTHER, NOW);
    assert.deepEqual(plain.events, []);
    assert.equal(plain.active, undefined);
  });

  test('olaylar 30 günden eski düşer, en çok 20', () => {
    let index = emptyOwnIndex();
    index = addOwnEvent(index, { kind: 'unshared', id: OWN_ID, name: 'Evde', at: '2026-08-01T00:00:00.000Z' }, NOW);
    assert.equal(index.events.length, 0);
    for (let i = 0; i < 25; i += 1) index = addOwnEvent(index, { kind: 'unshared', id: OWN_ID, name: 'Evde', at: new Date(NOW.getTime() - i * 60_000).toISOString() }, NOW);
    assert.equal(index.events.length, OWN_EVENTS_MAX);
    assert.equal(index.events[0]?.at, NOW.toISOString());
  });

  test('PT\'nin düzenlemeleri: paylaşılmış ve son 14 gün', () => {
    const shared = ownProgram({ shared: { at: '2026-09-01T00:00:00.000Z' } });
    const item = { ...ownIndexItemOf(shared, sha(shared)), ptEditedAt: '2026-09-26T00:00:00.000Z' };
    const old = { ...ownIndexItemOf(tatil(), sha(tatil())), shared: { at: '2026-09-01T00:00:00.000Z' }, ptEditedAt: '2026-09-01T00:00:00.000Z' };
    assert.deepEqual(ptEdits({ version: 1, items: [item, old], events: [] }, NOW), [{ id: OWN_ID, name: 'Evde', at: '2026-09-26T00:00:00.000Z' }]);
  });
});

describe('onarım', () => {
  test('sha tutan satır okunmaz; farklı sha ve satırsız dosya okunur; dosyasız satır düşer; bozuk dosya ayrı', async () => {
    const evde = ownProgram();
    const changed = { ...evde, revision: 2, name: 'Ev' };
    const index = indexOf(evde, tatil());
    const files = [
      { path: `own-programs/${OWN_ID}.json`, sha: sha(changed) },
      { path: 'own-programs/op_yeni0001.json', sha: 'b'.repeat(40) },
      { path: 'own-programs/op_bozuk001.json', sha: 'c'.repeat(40) },
      { path: 'own-programs/notlar.txt', sha: 'd'.repeat(40) },
    ];
    const reads: string[] = [];
    const contents: Record<string, unknown> = {
      [sha(changed)]: changed,
      ['b'.repeat(40)]: ownProgram({ id: 'op_yeni0001', name: 'Yeni', createdAt: '2026-09-25T00:00:00.000Z' }),
      ['c'.repeat(40)]: { id: 'op_bozuk001', name: 'Bozuk' },
    };
    const repaired = await repairOwnIndex(index, files, async (file) => {
      reads.push(file.path);
      return contents[file.sha];
    });
    assert.deepEqual(reads.sort(), ['own-programs/op_bozuk001.json', `own-programs/${OWN_ID}.json`, 'own-programs/op_yeni0001.json']);
    assert.deepEqual(repaired.index.items.map((item) => [item.id, item.name]), [[OWN_ID, 'Ev'], ['op_yeni0001', 'Yeni']]);
    assert.deepEqual(repaired.unreadable.map((item) => [item.id, item.name]), [['op_bozuk001', 'Bozuk']]);
    assert.equal(repaired.changed, true);
    assert.equal(repaired.programs.get(OWN_ID)?.name, 'Ev');

    const same = await repairOwnIndex(repaired.index, files.slice(0, 2), async () => {
      throw new Error('okunmamalı');
    });
    assert.equal(same.changed, false);
  });
});

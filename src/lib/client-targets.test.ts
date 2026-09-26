import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeClientTarget,
  clientTargetNotes,
  clientTargetState,
  effectiveSets,
  liveClientTargets,
  ptTargetsEdit,
  setClientTarget,
  withClientTargets,
} from './client-targets.ts';
import type { ClientTargets, ProgramPhase } from './program-plan.ts';
import type { SetSpec } from './set-plan.ts';

const sets = (count: number, min: number, max: number): SetSpec[] => Array.from({ length: count }, () => ({ min, max }));
const AT = '2026-09-26T15:00:00.000Z';

function phases(pushUpSets: SetSpec[] = sets(3, 8, 12), extra: Partial<ProgramPhase['days'][number]['blocks'][number]['rows'][number]> = {}): ProgramPhase[] {
  return [
    {
      id: 'p_aaaaaa',
      name: 'Evre 1',
      days: [
        {
          id: 'd_aaaaaa',
          name: 'Gün A',
          blocks: [
            { id: 'b_aaaaaa', kind: 'single', restSeconds: 60, rows: [{ id: 'r_aaaaaa', exerciseId: 'push-up', sets: pushUpSets, ...extra }] },
            { id: 'b_bbbbbb', kind: 'single', restSeconds: 90, rows: [{ id: 'r_bbbbbb', exerciseId: 'bench-press', sets: sets(3, 8, 10) }] },
          ],
        },
      ],
    },
  ];
}

const targets = (over: Partial<ClientTargets[string]> = {}): ClientTargets => ({
  r_aaaaaa: { sets: sets(3, 10, 14), baseSets: sets(3, 8, 12), sessionId: 's_k2m9x4qa', at: AT, ...over },
});

const ctx = {
  titleOf: (id: string) => ({ 'push-up': 'Şınav', 'bench-press': 'Bench Press' })[id] ?? id,
  trackingOf: () => 'bodyweight_reps' as const,
  multiPhase: false,
};

describe('danışanın hedefi: geçerlilik', () => {
  test('satırın setleri baseSets\'e eşitken hedef geçerli; PT değiştirince yok sayılır', () => {
    const row = { id: 'r_aaaaaa', sets: sets(3, 8, 12) };
    assert.deepEqual(effectiveSets(row, targets()), sets(3, 10, 14));
    assert.equal(activeClientTarget({ ...row, sets: sets(4, 8, 12) }, targets()), null);
    assert.deepEqual(effectiveSets({ ...row, sets: sets(4, 8, 12) }, targets()), sets(4, 8, 12));
    assert.deepEqual(effectiveSets(row, undefined), sets(3, 8, 12));
  });

  test('günün blokları hedeflerle; hedef yoksa aynı dizi', () => {
    const blocks = phases()[0]?.days[0]?.blocks ?? [];
    const applied = withClientTargets(blocks, targets());
    assert.deepEqual(applied[0]?.rows[0]?.sets, sets(3, 10, 14));
    assert.equal(applied[1], blocks[1]);
    assert.equal(withClientTargets(blocks, undefined), blocks);
    assert.equal(withClientTargets(blocks, targets({ baseSets: sets(3, 6, 10) })), blocks);
  });

  test('geçerli hedefler: satırı silinen ya da dayandığı setleri değişen düşer', () => {
    assert.deepEqual(Object.keys(liveClientTargets(phases(), targets()) ?? {}), ['r_aaaaaa']);
    assert.equal(liveClientTargets(phases(sets(3, 6, 10)), targets()), undefined);
    assert.equal(liveClientTargets(phases(), { r_zzzzzz: targets().r_aaaaaa as ClientTargets[string] }), undefined);
  });

  test('rozet ve düzenleyicideki durum', () => {
    assert.deepEqual(clientTargetNotes(phases(), targets(), () => 'bodyweight_reps'), { r_aaaaaa: { text: 'hedef 10–14', sets: sets(3, 10, 14), baseSets: sets(3, 8, 12), at: AT } });
    assert.equal(clientTargetNotes(phases(), targets({ sets: sets(3, 40, 60) }), () => 'duration').r_aaaaaa?.text, 'hedef 40–60 sn');
    assert.deepEqual(clientTargetNotes(phases(sets(4, 8, 12)), targets(), () => 'bodyweight_reps'), {});
    const target = targets().r_aaaaaa as ClientTargets[string];
    assert.equal(clientTargetState(sets(3, 8, 12), target), 'active');
    assert.equal(clientTargetState(sets(3, 10, 14), target), 'adopted');
    assert.equal(clientTargetState(sets(4, 8, 12), target), 'replaced');
  });
});

describe('PT kazanır (kayıt)', () => {
  test('satırı değişmeyen hedef kalır; başka satırın değişikliği hedefi düşürmez', () => {
    const after = phases();
    const bench = after[0]?.days[0]?.blocks[1]?.rows[0];
    if (bench) bench.sets = sets(4, 8, 10);
    const result = ptTargetsEdit(phases(), after, targets(), ctx);
    assert.deepEqual(result.clientTargets, targets());
    assert.deepEqual(result.changes, []);
  });

  test('PT satırın setlerini değiştirdi: hedef silinir, kayda "kaldırıldı" yazılır', () => {
    const result = ptTargetsEdit(phases(), phases(sets(4, 8, 12)), targets(), ctx);
    assert.equal(result.clientTargets, undefined);
    assert.deepEqual(result.changes, [{ scope: 'Gün A', text: 'Şınav: danışanın hedefi (10–14) kaldırıldı' }]);
  });

  test('PT danışanın hedefini aynen aldı: "programa alındı"', () => {
    const result = ptTargetsEdit(phases(), phases(sets(3, 10, 14)), targets(), ctx);
    assert.equal(result.clientTargets, undefined);
    assert.deepEqual(result.changes, [{ scope: 'Gün A', text: 'Şınav: danışanın hedefi programa alındı' }]);
  });

  test('hareket değişti: hedef kalkar; satır silindi ya da hedef zaten geçersizse sessizce düşer', () => {
    const swapped = ptTargetsEdit(phases(), phases(sets(3, 8, 12), { exerciseId: 'dips' }), targets(), ctx);
    assert.equal(swapped.clientTargets, undefined);
    assert.equal(swapped.changes[0]?.text, 'Şınav: danışanın hedefi (10–14) kaldırıldı');

    const removed = phases();
    const day = removed[0]?.days[0];
    if (day) day.blocks = day.blocks.slice(1);
    assert.deepEqual(ptTargetsEdit(phases(), removed, targets(), ctx), { clientTargets: undefined, changes: [] });
    assert.deepEqual(ptTargetsEdit(phases(), phases(), targets({ baseSets: sets(3, 6, 10) }), ctx), { clientTargets: undefined, changes: [] });
  });
});

describe('bitişte hedef yazımı', () => {
  test('danışanın gördüğü hedef programdakiyle aynıysa yazılır; baseSets PT\'nin setleri', () => {
    const result = setClientTarget(phases(), undefined, { rowId: 'r_aaaaaa', from: sets(3, 8, 12), to: sets(3, 10, 14), sessionId: 's_k2m9x4qa', at: AT });
    assert.equal(result.status, 'set');
    if (result.status !== 'set') return;
    assert.deepEqual(result.clientTargets, targets());
    assert.equal(result.dayName, 'Gün A');
  });

  test('var olan hedefin üstüne: from danışanın hedefi, baseSets yine PT\'ninki', () => {
    const result = setClientTarget(phases(), targets(), { rowId: 'r_aaaaaa', from: sets(3, 10, 14), to: sets(3, 12, 16), sessionId: 's_bbbbbbbb', at: AT });
    assert.equal(result.status, 'set');
    if (result.status !== 'set') return;
    assert.deepEqual(result.clientTargets?.r_aaaaaa, { sets: sets(3, 12, 16), baseSets: sets(3, 8, 12), sessionId: 's_bbbbbbbb', at: AT });
  });

  test('PT\'nin hedefine dönüş katmanı siler', () => {
    const result = setClientTarget(phases(), targets(), { rowId: 'r_aaaaaa', from: sets(3, 10, 14), to: sets(3, 8, 12), sessionId: 's_bbbbbbbb', at: AT });
    assert.equal(result.status, 'cleared');
    if (result.status === 'cleared') assert.equal(result.clientTargets, undefined);
  });

  test('çakışma: PT o arada değiştirdi, satır yok, düz değil ya da set sayısı farklı', () => {
    const input = { rowId: 'r_aaaaaa', from: sets(3, 8, 12), to: sets(3, 10, 14), sessionId: 's_k2m9x4qa', at: AT };
    assert.equal(setClientTarget(phases(sets(3, 6, 10)), undefined, input).status, 'conflict');
    assert.equal(setClientTarget(phases(), undefined, { ...input, rowId: 'r_zzzzzz' }).status, 'conflict');
    const amrap = [...sets(2, 8, 12), { min: 8, max: 12, amrap: true }];
    assert.equal(setClientTarget(phases(amrap), undefined, { ...input, from: amrap }).status, 'conflict');
    assert.equal(setClientTarget(phases(), undefined, { ...input, to: sets(4, 10, 14) }).status, 'conflict');
  });
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dropAction, hitTest, resolveHit, sameDestination, type DropLayout } from './drop-target.ts';
import { uniformSets } from './set-plan.ts';
import type { BlockKind, TemplateBlock, TemplateRow } from './template-plan.ts';

function row(id: string): TemplateRow {
  return { id, exerciseId: 'squat', sets: uniformSets({ min: 8, max: 12 }, 3) };
}
function block(id: string, kind: BlockKind, rows: TemplateRow[]): TemplateBlock {
  return { id, kind, restSeconds: 90, rows, ...(kind === 'circuit' ? { transitionSeconds: 15 } : {}) };
}

/**
 * Liste (sayfa koordinatı): tek (0–100), 12 px ara, süperset (112–412: yüz 112–212, üyeler
 * 212–312 ve 312–412), 12 px ara, tek (424–524).
 */
const layout: DropLayout = {
  list: { top: 0, bottom: 524, left: 0, right: 343 },
  blocks: [
    { id: 'b_1', span: { top: 0, bottom: 100 } },
    {
      id: 'b_2',
      span: { top: 112, bottom: 412 },
      face: { top: 112, bottom: 212 },
      members: [
        { id: 'r_2', span: { top: 212, bottom: 312 } },
        { id: 'r_3', span: { top: 312, bottom: 412 } },
      ],
    },
    { id: 'b_4', span: { top: 424, bottom: 524 } },
  ],
};

const blocks = [
  block('b_1', 'single', [row('r_1')]),
  block('b_2', 'superset', [row('r_2'), row('r_3')]),
  block('b_4', 'single', [row('r_4')]),
];

const at = (y: number, x = 170) => ({ x, y });

describe('işaretçinin altındaki yer', () => {
  test('tek kart: üst %25 önüne, alt %25 arkasına, orta birleştirme (en yakın boşlukla)', () => {
    assert.deepEqual(hitTest(layout, at(10), false), { type: 'gap', destination: { at: 'top', index: 0 } });
    assert.deepEqual(hitTest(layout, at(90), false), { type: 'gap', destination: { at: 'top', index: 1 } });
    assert.deepEqual(hitTest(layout, at(40), false), { type: 'middle', targetId: 'b_1', nearest: { at: 'top', index: 0 } });
    assert.deepEqual(hitTest(layout, at(60), false), { type: 'middle', targetId: 'b_1', nearest: { at: 'top', index: 1 } });
  });

  test('kartlar arası, listenin başı ve sonu', () => {
    assert.deepEqual(hitTest(layout, at(106), false), { type: 'gap', destination: { at: 'top', index: 1 } });
    assert.deepEqual(hitTest(layout, at(-20), false), { type: 'gap', destination: { at: 'top', index: 0 } });
    assert.deepEqual(hitTest(layout, at(560), false), { type: 'gap', destination: { at: 'top', index: 3 } });
  });

  test('grup yüzü: üst bandı grubun önü, ortası gruba ekle, alt bandı ilk üyenin önü', () => {
    assert.deepEqual(hitTest(layout, at(120), false), { type: 'gap', destination: { at: 'top', index: 1 } });
    assert.deepEqual(hitTest(layout, at(150), false), { type: 'middle', targetId: 'b_2', nearest: { at: 'top', index: 1 } });
    assert.deepEqual(hitTest(layout, at(180), false), { type: 'middle', targetId: 'b_2', nearest: { at: 'group', blockId: 'b_2', index: 0 } });
    assert.deepEqual(hitTest(layout, at(205), false), { type: 'gap', destination: { at: 'group', blockId: 'b_2', index: 0 } });
  });

  test('üye: grup içi boşluklar ve üyenin ortası', () => {
    assert.deepEqual(hitTest(layout, at(220), false), { type: 'gap', destination: { at: 'group', blockId: 'b_2', index: 0 } });
    assert.deepEqual(hitTest(layout, at(305), false), { type: 'gap', destination: { at: 'group', blockId: 'b_2', index: 1 } });
    assert.deepEqual(hitTest(layout, at(270), false), { type: 'middle', targetId: 'r_2', nearest: { at: 'group', blockId: 'b_2', index: 1 } });
    assert.deepEqual(hitTest(layout, at(405), false), { type: 'gap', destination: { at: 'group', blockId: 'b_2', index: 2 } });
    assert.deepEqual(hitTest(layout, at(418), false), { type: 'gap', destination: { at: 'top', index: 2 } });
  });

  test('sürüklenen grup: yalnız üst düzey boşluklar, kartın yarısına göre', () => {
    assert.deepEqual(hitTest(layout, at(40), true), { type: 'gap', destination: { at: 'top', index: 0 } });
    assert.deepEqual(hitTest(layout, at(270), true), { type: 'gap', destination: { at: 'top', index: 2 } });
    assert.deepEqual(hitTest(layout, at(480), true), { type: 'gap', destination: { at: 'top', index: 3 } });
  });

  test('listenin dışı (payıyla): iptal', () => {
    assert.deepEqual(hitTest(layout, at(200, 400), false), { type: 'outside' });
    assert.deepEqual(hitTest(layout, at(-60), false), { type: 'outside' });
    assert.equal(hitTest(layout, at(150, 360), false).type, 'middle');
  });
});

describe('kurallar ve bırakma', () => {
  test('kendi yanındaki boşluk çizgi göstermez; birleştirme adayı yok (kendisi)', () => {
    const own = resolveHit(blocks, 'b_1', hitTest(layout, at(40), false));
    assert.deepEqual(own, { line: null, candidate: null, refusal: null });
    assert.equal(dropAction(own, 'b_1'), null);
  });

  test('tekin ortası: beklemeden taşıma, 250 ms sonra süperset', () => {
    const resolution = resolveHit(blocks, 'b_4', hitTest(layout, at(40), false));
    assert.deepEqual(resolution, { line: { at: 'top', index: 0 }, candidate: { targetId: 'b_1', outcome: 'superset' }, refusal: null });
    assert.deepEqual(dropAction(resolution, null), { type: 'move', destination: { at: 'top', index: 0 } });
    assert.deepEqual(dropAction(resolution, 'b_1'), { type: 'combine', targetId: 'b_1', outcome: 'superset' });
    // Başka hedefte beklenmiş süre sayılmaz.
    assert.deepEqual(dropAction(resolution, 'b_2'), { type: 'move', destination: { at: 'top', index: 0 } });
  });

  test('süpersete: devre olur; üyenin ortası da aynı gruba', () => {
    assert.deepEqual(resolveHit(blocks, 'b_1', hitTest(layout, at(150), false)).candidate, { targetId: 'b_2', outcome: 'becomes_circuit' });
    assert.deepEqual(resolveHit(blocks, 'b_4', hitTest(layout, at(270), false)).candidate, { targetId: 'r_2', outcome: 'becomes_circuit' });
  });

  test('dolu grup: soluk hap, birleştirme yok, grup içi çizgi yok', () => {
    const full = [block('b_1', 'single', [row('r_1')]), block('b_2', 'circuit', Array.from({ length: 8 }, (_, i) => row(`r_c${i}`))), block('b_4', 'single', [row('r_4')])];
    const face = resolveHit(full, 'b_4', hitTest(layout, at(180), false));
    assert.deepEqual(face, { line: null, candidate: { targetId: 'b_2', outcome: 'full' }, refusal: 'full' });
    assert.equal(dropAction(face, 'b_2'), null);
  });

  test('grup gruba girmez; üyenin kendi grubunda ortası birleştirmez', () => {
    assert.deepEqual(resolveHit(blocks, 'b_2', hitTest(layout, at(40), true)), { line: { at: 'top', index: 0 }, candidate: null, refusal: null });
    const own = resolveHit(blocks, 'r_2', hitTest(layout, at(370), false));
    assert.equal(own.candidate, null);
    assert.deepEqual(own.line, { at: 'group', blockId: 'b_2', index: 2 });
  });

  test('30 blokta gruptan çıkan üye yer bulamaz: nedeni duyurulur', () => {
    const thirty = [...blocks, ...Array.from({ length: 27 }, (_, i) => block(`b_x${i}`, 'single', [row(`r_x${i}`)]))];
    assert.deepEqual(resolveHit(thirty, 'r_2', hitTest(layout, at(10), false)), { line: null, candidate: null, refusal: 'limit' });
  });

  test('dışarı bırakılan iptal', () => {
    assert.equal(dropAction(resolveHit(blocks, 'b_1', { type: 'outside' }), null), null);
  });

  test('boşluk eşitliği', () => {
    assert.equal(sameDestination({ at: 'top', index: 1 }, { at: 'top', index: 1 }), true);
    assert.equal(sameDestination({ at: 'group', blockId: 'b_2', index: 1 }, { at: 'group', blockId: 'b_3', index: 1 }), false);
    assert.equal(sameDestination({ at: 'top', index: 1 }, { at: 'group', blockId: 'b_2', index: 1 }), false);
    assert.equal(sameDestination(null, null), true);
  });
});

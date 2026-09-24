import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { combineMessage, edgeMessage, moveMessage, titleOfItem } from './edit-messages.ts';
import { uniformSets } from './set-plan.ts';
import { combineInto, moveItem, type IdSource } from './template-edit.ts';
import type { BlockKind, TemplateBlock, TemplateRow } from './template-plan.ts';

const TITLES: Record<string, string> = { squat: 'Squat', bench: 'Bench Press', row: 'Cable Row', curl: 'Curl' };
const titleOf = (id: string) => TITLES[id] ?? 'Silinmiş egzersiz';
const kinds = new Map(Object.keys(TITLES).map((id) => [id, { category: 'compound' as const }]));
const ids: IdSource = (prefix) => `${prefix}_new001`;

function row(id: string, exerciseId: string): TemplateRow {
  return { id, exerciseId, sets: uniformSets({ min: 8, max: 12 }, 3) };
}
function block(id: string, kind: BlockKind, rows: TemplateRow[]): TemplateBlock {
  return { id, kind, restSeconds: 90, rows, ...(kind === 'circuit' ? { transitionSeconds: 15 } : {}) };
}

const blocks = [
  block('b_1', 'single', [row('r_1', 'squat')]),
  block('b_2', 'superset', [row('r_2', 'bench'), row('r_3', 'row')]),
  block('b_4', 'single', [row('r_4', 'curl')]),
];

describe('düzenleyici cümleleri', () => {
  test('öğenin adı: satırda hareket, grupta tür ve sıra', () => {
    assert.equal(titleOfItem(blocks, 'r_1', titleOf), 'Squat');
    assert.equal(titleOfItem(blocks, 'b_1', titleOf), 'Squat');
    assert.equal(titleOfItem(blocks, 'b_2', titleOf), 'Süperset 2');
    assert.equal(titleOfItem(blocks, 'r_3', titleOf), 'Cable Row');
  });

  test('taşıma: üst düzeyde, grup içinde, gruptan çıkma, gruba katılma', () => {
    const top = moveItem(blocks, 'r_4', { at: 'top', index: 0 }, kinds, ids);
    assert.equal(moveMessage(blocks, top, 'r_4', titleOf), 'Curl 1. sıraya taşındı');
    const inside = moveItem(blocks, 'r_3', { at: 'group', blockId: 'b_2', index: 0 }, kinds, ids);
    assert.equal(moveMessage(blocks, inside, 'r_3', titleOf), 'Cable Row grupta 1. sıraya taşındı');
    const out = moveItem(blocks, 'r_3', { at: 'top', index: 3 }, kinds, ids);
    assert.equal(moveMessage(blocks, out, 'r_3', titleOf), 'Cable Row gruptan çıktı · 4. sırada');
    const joined = moveItem(blocks, 'r_4', { at: 'group', blockId: 'b_2', index: 2 }, kinds, ids);
    assert.equal(moveMessage(blocks, joined, 'r_4', titleOf), 'Curl gruba katıldı · grup devre oldu');
    const group = moveItem(blocks, 'b_2', { at: 'top', index: 0 }, kinds, ids);
    assert.equal(moveMessage(blocks, group, 'b_2', titleOf), 'Süperset (Bench Press + Cable Row) 1. sıraya taşındı');
  });

  test('üstüne bırakma: süperset, devreye dönüşme, gruba ekleme', () => {
    assert.equal(combineMessage(blocks, 'r_4', 'r_1', 'superset', titleOf), 'Süperset yapıldı: Squat + Curl');
    assert.equal(combineMessage(blocks, 'r_4', 'b_2', 'becomes_circuit', titleOf), 'Süperset devreye dönüştü');
    const circuit = combineInto(blocks, 'r_1', 'b_2', kinds);
    assert.equal(combineMessage(circuit, 'r_4', 'b_2', 'join', titleOf), 'Curl gruba eklendi (Devre 1)');
    assert.equal(combineMessage(circuit, 'r_4', 'r_2', 'join', titleOf), 'Curl gruba eklendi (Devre 1)');
  });

  test('klavyede uç', () => {
    assert.equal(edgeMessage(blocks, 'r_1', true, titleOf), 'Squat zaten ilk sırada');
    assert.equal(edgeMessage(blocks, 'r_3', false, titleOf), 'Cable Row grupta zaten son sırada');
  });
});

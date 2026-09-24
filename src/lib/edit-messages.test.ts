import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addToGroupHint,
  addToGroupTitle,
  addedToGroupMessage,
  bulkMessage,
  combineMessage,
  dativeOf,
  edgeMessage,
  groupedMessage,
  moveMessage,
  selectedRowCount,
  selectionStatus,
  titleOfItem,
} from './edit-messages.ts';
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

  test('seçim çubuğunun durum satırı', () => {
    assert.equal(selectionStatus(0, 'too_few'), 'Seçmek için kartlara dokun');
    assert.equal(selectionStatus(0, 'too_few', 'mouse'), 'Seçmek için kartlara tıkla');
    assert.equal(selectionStatus(1, 'too_few'), '1 seçili · gruplamak için en az 2 hareket');
    assert.equal(selectionStatus(2, 'superset'), '2 seçili · süperset olur');
    assert.equal(selectionStatus(3, 'circuit'), '3 seçili · devre olur');
    assert.equal(selectionStatus(2, 'not_singles'), 'Grup seçili: yalnız tek hareketler gruplanır');
    assert.equal(selectionStatus(9, 'too_many'), '9 seçili · grup en çok 8 hareket');
  });

  test('toplu işlemler: gruplama, kopya, silme (sayı gruptaki üyeler dahil)', () => {
    assert.equal(groupedMessage(blocks, new Set(['b_4', 'b_1']), 'superset', titleOf), 'Süperset yapıldı: Squat + Curl');
    assert.equal(groupedMessage(blocks, new Set(['b_1', 'b_4', 'b_x']), 'circuit', titleOf), 'Devre yapıldı (2 hareket)');
    assert.equal(selectedRowCount(blocks, new Set(['b_1', 'b_2'])), 3);
    assert.equal(bulkMessage(3, 'copied'), '3 hareket kopyalandı');
    assert.equal(bulkMessage(1, 'removed'), '1 hareket silindi');
  });

  test('yönelme eki ve "Gruba hareket ekle" başlığı', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 20, 26, 30, 40, 50, 60, 70, 80, 90, 100].map(dativeOf),
      ["1'e", "2'ye", "3'e", "4'e", "5'e", "6'ya", "7'ye", "8'e", "9'a", "10'a", "12'ye", "16'ya", "20'ye", "26'ya", "30'a", "40'a", "50'ye", "60'a", "70'e", "80'e", "90'a", "100'e"],
    );
    assert.equal(addToGroupTitle('superset', 1), "Süperset 2'ye ekle");
    assert.equal(addToGroupTitle('circuit', 5), "Devre 6'ya ekle");
  });

  test('gruba ekleme: önce ve sonra', () => {
    assert.deepEqual(addToGroupHint('becomes_circuit'), { blocked: null, hint: 'Eklenirse devre olur' });
    assert.deepEqual(addToGroupHint('join'), { blocked: null, hint: '' });
    assert.equal(addToGroupHint('full').blocked, 'Grup dolu (8)');
    assert.equal(addToGroupHint('limit').blocked, 'Şablon dolu: en fazla 40 hareket, 30 blok');
    assert.equal(addedToGroupMessage('Cable Row', 'superset', 'circuit'), 'Cable Row eklendi · grup devre oldu');
    assert.equal(addedToGroupMessage('Cable Row', 'circuit', 'circuit'), 'Cable Row eklendi');
  });
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHEET_FULL_MESSAGE,
  addToGroupHint,
  addToGroupTitle,
  addedToGroupMessage,
  bulkMessage,
  combineMessage,
  dativeOf,
  deviceChangeMessage,
  dropTargetLabel,
  groupWorkText,
  rowWorkText,
  edgeMessage,
  groupedMessage,
  moveMessage,
  selectedRowCount,
  selectionStatus,
  sheetStatus,
  titleOfItem,
} from './edit-messages.ts';
import { pyramidPreset, toggleLastAmrap, uniformSets } from './set-plan.ts';
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
    const combined = (before: TemplateBlock[], sourceId: string, targetId: string) => combineInto(before, sourceId, targetId, kinds);
    assert.equal(combineMessage(blocks, combined(blocks, 'r_4', 'r_1'), 'r_4', 'r_1', 'superset', titleOf), 'Süperset yapıldı: Squat + Curl');
    assert.equal(combineMessage(blocks, combined(blocks, 'r_4', 'b_2'), 'r_4', 'b_2', 'becomes_circuit', titleOf), 'Süperset devreye dönüştü');
    const circuit = combined(blocks, 'r_1', 'b_2');
    assert.equal(combineMessage(circuit, combined(circuit, 'r_4', 'b_2'), 'r_4', 'b_2', 'join', titleOf), 'Curl gruba eklendi (Devre 1)');
    assert.equal(combineMessage(circuit, combined(circuit, 'r_4', 'r_2'), 'r_4', 'r_2', 'join', titleOf), 'Curl gruba eklendi (Devre 1)');
  });

  test('üstüne bırakma: grubun sırası birleşmeden sonraki listeden (üstteki tek hareket girince grup yukarı kayar)', () => {
    const list = [
      block('b_1', 'single', [row('r_1', 'squat')]),
      block('b_2', 'single', [row('r_2', 'row')]),
      block('b_3', 'circuit', [row('r_3', 'curl'), row('r_4', 'row'), row('r_5', 'squat')]),
    ];
    const onFace = combineInto(list, 'r_1', 'b_3', kinds);
    assert.equal(onFace.findIndex((item) => item.id === 'b_3'), 1);
    assert.equal(combineMessage(list, onFace, 'r_1', 'b_3', 'join', titleOf), 'Squat gruba eklendi (Devre 2)');
    const onMember = combineInto(list, 'r_1', 'r_4', kinds);
    assert.equal(combineMessage(list, onMember, 'r_1', 'r_4', 'join', titleOf), 'Squat gruba eklendi (Devre 2)');
    // Aynı iş çizgiyle yapılınca da aynı sıra söylenir.
    const byLine = moveItem(list, 'r_1', { at: 'group', blockId: 'b_3', index: 3 }, kinds, ids);
    assert.equal(moveMessage(list, byLine, 'r_1', titleOf), 'Squat gruba katıldı (Devre 2)');
  });

  test('klavyede uç', () => {
    assert.equal(edgeMessage(blocks, 'r_1', true, titleOf), 'Squat zaten ilk sırada');
    assert.equal(edgeMessage(blocks, 'r_3', false, titleOf), 'Cable Row grupta zaten son sırada');
  });

  test('cihaz değişimi: seçicinin biçimiyle (cihaz → hareket); aynı hareket, egzersizin cihazı, cihazsız', () => {
    assert.equal(
      deviceChangeMessage({ kind: 'swapped', device: 'Kablo istasyonu 2', from: 'Lat Pulldown', to: 'Seated Row' }),
      'Kablo istasyonu 2 → Seated Row (Lat Pulldown yerine)',
    );
    assert.equal(deviceChangeMessage({ kind: 'device', device: 'Smith makinesi', title: 'Bench Press' }), 'Bench Press · cihaz: Smith makinesi');
    assert.equal(
      deviceChangeMessage({ kind: 'reset', device: 'Olimpik bar', title: 'Bench Press' }),
      'Bench Press · egzersizin cihazı: Olimpik bar',
    );
    assert.equal(deviceChangeMessage({ kind: 'reset', device: null, title: 'Plank' }), 'Plank · cihazsız');
  });

  test('üstüne bırakma etiketi (sürüklenen kartın üstünde): sonuç ve hedefin adı; üyede ve yüzde grubun adı', () => {
    // blocks: Squat, Süperset 2 (Bench Press + Cable Row), Curl.
    assert.equal(dropTargetLabel(blocks, 'r_1', 'superset', titleOf), 'Süperset yap: Squat');
    assert.equal(dropTargetLabel(blocks, 'b_2', 'becomes_circuit', titleOf), 'Ekle · devre olur: Süperset 2');
    assert.equal(dropTargetLabel(blocks, 'r_3', 'becomes_circuit', titleOf), 'Ekle · devre olur: Süperset 2');
    assert.equal(dropTargetLabel(blocks, 'r_3', 'full', titleOf), 'Grup dolu (8)');
    assert.equal(dropTargetLabel(blocks, 'r_3', 'not_allowed', titleOf), null);
    assert.equal(dropTargetLabel(blocks, 'r_x', 'superset', titleOf), null);
  });

  test('kartın meta satırı tek biçim (düzenleyici, şablon detayı, programın PT görünümü): setsText + saniye', () => {
    const straight = uniformSets({ min: 8, max: 12 }, 3);
    assert.equal(rowWorkText(straight, 'weight_reps', 90), '3×8–12 · 90 sn');
    assert.equal(rowWorkText(straight, 'weight_reps'), '3×8–12');
    assert.equal(rowWorkText(toggleLastAmrap(straight), 'weight_reps', 60), '3×8–12, son set AMRAP · 60 sn');
    assert.equal(rowWorkText(pyramidPreset(straight), 'weight_reps', 120), '12/10/8 (piramit %80/%90/%100) · 120 sn');
    assert.equal(rowWorkText(uniformSets({ min: 30, max: 30 }, 2), 'duration', 0), '2×30 sn · dinlenme yok');
    assert.equal(rowWorkText(straight, 'weight_reps', Number.NaN), '3×8–12 · ? sn');
    const superset = blocks[1]!;
    assert.equal(groupWorkText(superset, 3), '2 hareket · 3 tur · 90 sn tur sonu');
    assert.equal(groupWorkText({ ...superset, kind: 'circuit', restSeconds: 0, transitionSeconds: 15 }, 2), '2 hareket · 2 tur · tur sonu dinlenme yok · istasyon 15 sn');
  });

  test('seçim çubuğunun durum satırı', () => {
    // Hiç seçim yokken seçimin ne işe yaradığı da yazar (gruplama "Seç"in arkasında kalmasın).
    assert.equal(selectionStatus(0, 'too_few'), 'Seçmek için kartlara dokun · 2 hareket seç, süperset olsun');
    assert.equal(selectionStatus(0, 'too_few', 'mouse'), 'Seçmek için kartlara tıkla · 2 hareket seç, süperset olsun');
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

  test('sheet\'in durum satırı: eklenemiyorsa yalnız gerçek neden (grup dolu, grup yok, şablon dolu), eklendiyse onayla', () => {
    const status = (outcome: Parameters<typeof addToGroupHint>[0], added = '') => {
      const { blocked, hint } = addToGroupHint(outcome);
      return sheetStatus(blocked, added, hint);
    };
    assert.equal(status('full'), 'Grup dolu (8)');
    assert.equal(status('full', 'Cable Row eklendi'), 'Cable Row eklendi · Grup dolu (8)');
    assert.equal(status('not_allowed'), 'Bu grup artık yok');
    assert.equal(status('limit'), 'Şablon dolu: en fazla 40 hareket, 30 blok');
    assert.equal(status('becomes_circuit'), 'Eklenirse devre olur');
    assert.equal(status('becomes_circuit', 'Cable Row eklendi · grup devre oldu'), 'Cable Row eklendi · grup devre oldu');
    assert.equal(status('join'), '');
    // Sona eklemede şablon dolunca.
    assert.equal(sheetStatus(SHEET_FULL_MESSAGE, '', ''), SHEET_FULL_MESSAGE);
  });

  test('ret nedeni yalnız sheet\'in durum satırında (sheetStatus): kütüphane listesi (picker) kendi "dolu" satırını yazmaz', () => {
    // Bileşen çizme altyapısı yok: kaynağa bakılır. Eskiden picker, liste pasifken nedeni ne olursa olsun
    // sabit "Şablon dolu…" satırı yazıyordu; dolu grupta durum satırındaki "Grup dolu (8)" ile çelişiyordu.
    const source = (file: string) => readFileSync(new URL(`../components/block-editor/${file}`, import.meta.url), 'utf8');
    // Yorumlar çıkarılır: yalnız çizilen kod ve metin.
    const picker = source('exercise-picker.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const reasons = [SHEET_FULL_MESSAGE, ...(['full', 'limit', 'not_allowed'] as const).map((outcome) => addToGroupHint(outcome).blocked)];
    for (const reason of reasons) {
      assert.ok(reason);
      assert.equal(picker.includes(reason), false, reason);
    }
    assert.doesNotMatch(picker, /dolu/i);
    // Sheet durum satırını tek kaynaktan yazar; sona eklemenin nedeni de buradaki sabitten.
    assert.match(source('exercise-sheet.tsx'), /role="status"[^>]*>\s*\{sheetStatus\(blocked, status, hint\)\}/);
    assert.match(source('block-editor.tsx'), /blocked: canAdd\(blocks\) \? null : SHEET_FULL_MESSAGE/);
  });
});

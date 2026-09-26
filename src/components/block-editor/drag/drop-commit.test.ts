import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { uniformSets } from '../../../lib/set-plan.ts';
import type { IdSource, PickerExercise } from '../../../lib/template-edit.ts';
import type { BlockKind, TemplateBlock, TemplateRow } from '../../../lib/template-plan.ts';
import { commitDrop, type DropEditor } from './drop-commit.ts';

const TITLES: Record<string, string> = { squat: 'Squat', bench: 'Bench Press', row: 'Cable Row', curl: 'Curl' };
const exercises = new Map(Object.entries(TITLES).map(([id, title]) => [id, { id, title, category: 'compound' } as PickerExercise]));
const ids: IdSource = (prefix) => `${prefix}_new001`;

function row(id: string, exerciseId: string): TemplateRow {
  return { id, exerciseId, sets: uniformSets({ min: 8, max: 12 }, 3) };
}
function block(id: string, kind: BlockKind, rows: TemplateRow[]): TemplateBlock {
  return { id, kind, restSeconds: 90, rows };
}

/** Squat, süperset (Bench Press + Cable Row), Curl. */
const start = () => [
  block('b_1', 'single', [row('r_1', 'squat')]),
  block('b_2', 'superset', [row('r_2', 'bench'), row('r_3', 'row')]),
  block('b_4', 'single', [row('r_4', 'curl')]),
];

/** Düzenleyici gibi yazar; hangi yolla yazıldığını (geri allı mı) ve cümlesini kaydeder. */
function editor() {
  let blocks = start();
  const calls: string[] = [];
  const ed: DropEditor = {
    current: () => blocks,
    update: (change, options) => {
      blocks = change(blocks);
      calls.push(`update: ${options?.announce ?? ''}`);
    },
    updateWithUndo: (change, message) => {
      blocks = change(blocks);
      calls.push(`Geri al: ${message}`);
    },
    exercises,
    newIds: () => ids,
    close: (itemId) => calls.push(`kapat ${itemId}`),
  };
  return { ed, calls, blocks: () => blocks };
}

const drop = (itemId: string, action: Parameters<typeof commitDrop>[2]) => {
  const { ed, calls, blocks } = editor();
  commitDrop(ed, itemId, action);
  return { calls, blocks: blocks() };
};

describe('bırakmanın yazımı (EditorDnd bunu çağırır)', () => {
  test('grup üyeliği değişince "Geri al"lı: üye dışarı, tek hareket gruba, üstüne bırakma', () => {
    assert.deepEqual(drop('r_3', { type: 'move', destination: { at: 'top', index: 3 } }).calls, [
      'Geri al: Cable Row gruptan çıktı · 4. sırada',
      'kapat r_3',
    ]);
    assert.deepEqual(drop('r_4', { type: 'move', destination: { at: 'group', blockId: 'b_2', index: 2 } }).calls, [
      'Geri al: Curl gruba katıldı · grup devre oldu',
      'kapat r_4',
    ]);
    assert.deepEqual(drop('r_4', { type: 'combine', targetId: 'r_1', outcome: 'superset' }).calls, [
      'Geri al: Süperset yapıldı: Squat + Curl',
      'kapat r_4',
    ]);
  });

  test('yalnız sıralama geri alsız: üst düzeyde tek ya da grup, grubunda üye', () => {
    assert.deepEqual(drop('r_4', { type: 'move', destination: { at: 'top', index: 0 } }).calls, ['update: Curl 1. sıraya taşındı', 'kapat r_4']);
    assert.deepEqual(drop('b_2', { type: 'move', destination: { at: 'top', index: 0 } }).calls, [
      'update: Süperset (Bench Press + Cable Row) 1. sıraya taşındı',
      'kapat b_2',
    ]);
    assert.deepEqual(drop('r_3', { type: 'move', destination: { at: 'group', blockId: 'b_2', index: 0 } }).calls, [
      'update: Cable Row grupta 1. sıraya taşındı',
      'kapat r_3',
    ]);
  });

  test('yerinde bırakma ya da olmayan birleştirme yazmaz, kart da kapanmaz', () => {
    const same = drop('r_1', { type: 'move', destination: { at: 'top', index: 1 } });
    assert.deepEqual(same.calls, []);
    assert.deepEqual(same.blocks, start());
    assert.deepEqual(drop('r_2', { type: 'combine', targetId: 'r_3', outcome: 'join' }).calls, []);
  });
});

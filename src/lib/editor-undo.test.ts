import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { createFormStore, getFieldInput, getFieldStore, setFieldInput, type FormSchema } from '@formisch/react/internals';
import { dayBlocksPath, undoAt } from './editor-undo.ts';
import { addDay, copyDay, moveDay, moveDayToPhase, programIdSource, removeDay, type ProgramPhase } from './program-plan.ts';
import { programFormSchema } from './schemas/program.ts';
import { templateFormSchema } from './schemas/template.ts';
import { uniformSets } from './set-plan.ts';
import { appendExercise, removeRow, type IdSource } from './template-edit.ts';
import type { PlanExercise, TemplateBlock } from './template-plan.ts';

const lookup = new Map([
  ['squat', { category: 'compound' as const }],
  ['curl', { category: 'isolation' as const }],
]);
const curl: PlanExercise = {
  id: 'curl',
  title: 'Curl',
  category: 'isolation',
  trackingType: 'weight_reps',
  equipment: 'dumbbell',
  primaryMuscles: ['biceps'],
  secondaryMuscles: [],
};
/** Curl'ün bloğu ve satırı bu kimliklerle eklenir (düzenleyicinin `newRow`'u: notsuz satır). */
const curlIds: IdSource = (prefix) => `${prefix}_curl01`;

function single(n: number): TemplateBlock {
  return { id: `b_squat${n}`, kind: 'single', restSeconds: 120, rows: [{ id: `r_squat${n}`, exerciseId: 'squat', sets: uniformSets({ min: 6, max: 10 }, 3) }] };
}

/** Gün A boş, Gün B'de Squat; ikinci evrede Gün C. */
const program = (): ProgramPhase[] => [
  {
    id: 'p_aaaaaa',
    name: 'Uyum',
    days: [
      { id: 'd_gunaaa', name: 'Gün A', blocks: [] },
      { id: 'd_gunbbb', name: 'Gün B', blocks: [single(1)] },
    ],
  },
  { id: 'p_bbbbbb', name: 'Güç', days: [{ id: 'd_gunccc', name: 'Gün C', blocks: [single(2)] }] },
];

/** Program formunun evre yazımı (`program-form.tsx` `toInput`): notsuz satıra boş not yazar. */
function toInput(phases: readonly ProgramPhase[]) {
  return phases.map((phase) => ({
    ...phase,
    days: phase.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => ({ ...block, rows: block.rows.map((row) => ({ ...row, note: row.note ?? '' })) })),
    })),
  }));
}

type Path = readonly (string | number)[];

/** Gerçek Formisch deposu (`useForm` gibi kurulur); React olmadan okunur ve yazılır. */
function formStore(schema: FormSchema, initialInput: Record<string, unknown>) {
  const store = createFormStore({ schema, initialInput }, (input) => v.safeParseAsync(schema, input));
  const read = (path: Path): unknown => {
    const field = getFieldStore(store, path);
    return field ? getFieldInput(field) : undefined;
  };
  const write = (path: Path, input: unknown) => setFieldInput(store, path, input);
  return { read, write };
}

/**
 * Düzenleyici (BlockEditor) bir blok dizisinin yolunda: `edit` toast'suz güncelleme (ör. sheet'ten
 * ekleme), `editWithUndo` "Geri al"lı güncelleme (`updateWithUndo`): önceki hâl okunur, yazılır,
 * sonraki hâl yazımdan sonra formdan okunur; dönen `undo`, toast'taki "Geri al" (yer geri alma
 * anında `locate` ile bulunur).
 */
function blockEditor<P extends Path>(form: ReturnType<typeof formStore>, locate: () => P | null) {
  const read = (at: P) => (form.read(at) ?? []) as TemplateBlock[];
  const write = (at: P, blocks: TemplateBlock[]) => form.write(at, blocks);
  const at = () => {
    const found = locate();
    assert.ok(found, 'düzenleyicinin yolu yok');
    return found;
  };
  return {
    read: () => read(at()),
    edit: (change: (blocks: TemplateBlock[]) => TemplateBlock[]) => write(at(), change(read(at()))),
    editWithUndo: (change: (blocks: TemplateBlock[]) => TemplateBlock[]) => {
      const path = at();
      const before = read(path);
      write(path, change(before));
      const after = read(path);
      return () => undoAt(locate, read, write, before, after);
    },
    /** Satırın Not kutusu (alanın kendi yoluna yazar). */
    writeNote: (rowId: string, note: string) => {
      const path = at();
      const blocks = read(path);
      const blockIndex = blocks.findIndex((block) => block.rows.some((row) => row.id === rowId));
      const rowIndex = blocks[blockIndex]?.rows.findIndex((row) => row.id === rowId) ?? -1;
      assert.ok(blockIndex >= 0 && rowIndex >= 0);
      form.write([...path, blockIndex, 'rows', rowIndex, 'note'], note);
    },
  };
}

/**
 * Gerçek program formu (`programFormSchema`): açılışta ve her evre işleminde (sıra, evreye taşı,
 * kopyala…) evreler `toInput`'la tek seferde yazılır (ProgramForm); Gün B'nin düzenleyicisi yolu
 * geri alma anında gün kimliğiyle bulur (`day-editor.tsx` `undoPath`).
 */
function programForm(phases: ProgramPhase[]) {
  const form = formStore(programFormSchema, { phased: true, currentPhaseId: 'p_aaaaaa', phases: toInput(phases) });
  const current = () => (form.read(['phases']) ?? []) as ProgramPhase[];
  const update = (change: (all: ProgramPhase[]) => ProgramPhase[]) => form.write(['phases'], toInput(change(current())));
  /** Gün kimliği → satırları. */
  const rows = () =>
    Object.fromEntries(current().flatMap((phase) => phase.days.map((day) => [day.id, day.blocks.flatMap((block) => block.rows.map((row) => row.id))])));
  const dayB = blockEditor(form, () => dayBlocksPath(current(), 'd_gunbbb'));
  return { current, update, rows, dayB };
}

/** Toast açıkken yapılan gün işlemleri: hepsi program yazımından (`toInput`) geçer. */
const DAY_OPERATIONS: [string, (all: ProgramPhase[]) => ProgramPhase[]][] = [
  ['Sola taşı', (all) => moveDay(all, 'p_aaaaaa', 'd_gunbbb', -1)],
  ['Evreye taşı', (all) => moveDayToPhase(all, 'd_gunbbb', 'p_bbbbbb')],
  [
    'Kopyala (Gün A)',
    (all) => {
      const [phase] = all;
      const dayA = phase?.days[0];
      return phase && dayA ? addDay(all, phase.id, copyDay(phase, dayA, programIdSource(all)), dayA.id) : all;
    },
  ],
];

describe('"Geri al" gün kimliğiyle (program günü, gerçek program formu)', () => {
  test('günün yolu: kimlikle, evre ve gün sırasıyla; olmayan günde yok', () => {
    assert.deepEqual(dayBlocksPath(program(), 'd_gunbbb'), ['phases', 0, 'days', 1, 'blocks']);
    assert.deepEqual(dayBlocksPath(program(), 'd_gunccc'), ['phases', 1, 'days', 0, 'blocks']);
    assert.equal(dayBlocksPath(program(), 'd_yokyok'), null);
  });

  test('toast açıkken gün sola taşınsa da silinen hareket kendi gününe döner (boş Gün A ile karışmaz)', () => {
    const editor = programForm(program());
    const undo = editor.dayB.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    editor.update((all) => moveDay(all, 'p_aaaaaa', 'd_gunbbb', -1));
    assert.equal(undo(), true);
    assert.deepEqual(editor.rows(), { d_gunbbb: ['r_squat1'], d_gunaaa: [], d_gunccc: ['r_squat2'] });
  });

  test('araya gün girse (kopya) ya da gün başka evreye taşınsa da kendi gününe döner', () => {
    const copied = programForm(program());
    const first = copied.dayB.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    copied.update((all) => addDay(all, 'p_aaaaaa', { id: 'd_gunkkk', name: 'Gün A 2', blocks: [] }, 'd_gunaaa'));
    assert.equal(first(), true);
    assert.deepEqual(copied.rows(), { d_gunaaa: [], d_gunkkk: [], d_gunbbb: ['r_squat1'], d_gunccc: ['r_squat2'] });

    const moved = programForm(program());
    const second = moved.dayB.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    moved.update((all) => moveDayToPhase(all, 'd_gunbbb', 'p_bbbbbb'));
    assert.deepEqual(dayBlocksPath(moved.current(), 'd_gunbbb'), ['phases', 1, 'days', 1, 'blocks']);
    assert.equal(second(), true);
    assert.deepEqual(moved.rows(), { d_gunaaa: [], d_gunccc: ['r_squat2'], d_gunbbb: ['r_squat1'] });
  });

  test('gün silindiyse ya da sonrasında değiştiyse geri alınmaz, hiçbir şey yazılmaz', () => {
    const removed = programForm(program());
    const first = removed.dayB.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    removed.update((all) => removeDay(all, 'p_aaaaaa', 'd_gunbbb'));
    const untouched = JSON.stringify(removed.current());
    assert.equal(first(), false);
    assert.equal(JSON.stringify(removed.current()), untouched);

    const edited = programForm(program());
    const second = edited.dayB.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    edited.dayB.edit(() => [single(3)]);
    const later = JSON.stringify(edited.current());
    assert.equal(second(), false);
    assert.equal(JSON.stringify(edited.current()), later);
  });

  test('günde düzenleyicinin eklediği notsuz satır (Curl) varken gün işlemi program yazımından geçse de geri alınır', () => {
    for (const [name, operation] of DAY_OPERATIONS) {
      const editor = programForm(program());
      editor.dayB.edit((blocks) => appendExercise(blocks, curl, curlIds));
      assert.equal(editor.dayB.read()[1]?.rows[0]?.note, undefined, 'düzenleyici notsuz satır üretir');
      const undo = editor.dayB.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
      editor.update(operation);
      // Program yazımı Curl'e boş not yazdı; hâl aynı, geri al çalışır.
      assert.equal(editor.dayB.read()[0]?.rows[0]?.note, '', name);
      assert.equal(undo(), true, `${name}: Geri al YAPILDI`);
      assert.deepEqual(editor.rows().d_gunbbb, ['r_squat1', 'r_curl01'], name);
    }
  });

  test('boş not yok sayılır, sonradan yazılan not sayılır: not yazıldıysa geri alınmaz', () => {
    const typed = programForm(program());
    typed.dayB.edit((blocks) => appendExercise(blocks, curl, curlIds));
    const first = typed.dayB.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    typed.update((all) => moveDay(all, 'p_aaaaaa', 'd_gunbbb', -1));
    typed.dayB.writeNote('r_curl01', 'Yavaş');
    assert.equal(first(), false);
    assert.deepEqual(typed.rows().d_gunbbb, ['r_curl01']);
    assert.equal(typed.dayB.read()[0]?.rows[0]?.note, 'Yavaş');

    // Yazılıp silinen not: satır yine notsuz, geri al çalışır.
    const cleared = programForm(program());
    cleared.dayB.edit((blocks) => appendExercise(blocks, curl, curlIds));
    const second = cleared.dayB.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    cleared.dayB.writeNote('r_curl01', 'Y');
    cleared.dayB.writeNote('r_curl01', '');
    assert.equal(second(), true);
    assert.deepEqual(cleared.rows().d_gunbbb, ['r_squat1', 'r_curl01']);
  });
});

describe('"Geri al" şablon formunda (gerçek şablon formu)', () => {
  test('açılışta notlar boş metin, eklenen satır notsuz: geri alınır; sonraki değişiklik varsa alınmaz', () => {
    const start = () => ({
      name: 'Bacak',
      description: '',
      // `template-form.tsx`: açılışta her satıra boş not.
      blocks: [single(1), single(2)].map((block) => ({ ...block, rows: block.rows.map((row) => ({ ...row, note: row.note ?? '' })) })),
    });
    const rows = (editor: ReturnType<typeof blockEditor>) => editor.read().flatMap((block) => block.rows.map((row) => row.id));

    const undone = blockEditor(formStore(templateFormSchema, start()), () => ['blocks'] as const);
    undone.edit((blocks) => appendExercise(blocks, curl, curlIds));
    const first = undone.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    assert.deepEqual(rows(undone), ['r_squat2', 'r_curl01']);
    assert.equal(first(), true);
    assert.deepEqual(rows(undone), ['r_squat1', 'r_squat2', 'r_curl01']);

    const later = blockEditor(formStore(templateFormSchema, start()), () => ['blocks'] as const);
    const second = later.editWithUndo((blocks) => removeRow(blocks, 'r_squat1', lookup));
    later.writeNote('r_squat2', 'Derin');
    assert.equal(second(), false);
    assert.deepEqual(rows(later), ['r_squat2']);
  });
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import {
  feedbackItems,
  feedbackMessage,
  feedbackSummary,
  planProgramFeedback,
  resolveFeedback,
  shiftSets,
  withFeedbackFlags,
  type FeedbackItem,
} from './program-feedback.ts';
import { programSchema } from './schemas/program.ts';
import { finishFeedbackSchema, type SessionDoc, type SessionEntry, type SessionSet } from './schemas/session.ts';
import type { SetSpec } from './set-plan.ts';
import { at, DAY_A, programFile, sessionDoc, sessionEntry, W1, workingSet } from './testing/session-fixtures.ts';
import { dayWithBlocks } from './testing/workout-fixtures.ts';
import { extraKey, type ExtraRows, type RowPrevious, type WorkoutDay, type WorkoutRow } from './workout-plan.ts';

const sets = (count: number, min: number, max: number): SetSpec[] => Array.from({ length: count }, () => ({ min, max }));

let counter = 0;
const nextSetId = () => `st_${(++counter).toString(36).padStart(8, '0')}`;

/** Çalışma setleri: [kg, tekrar] ya da [undefined, tekrar]; hedef `target`, planlanan set sayısı `planned`. */
function logged(values: readonly (readonly [number | undefined, number])[], target: SetSpec, planned = 3, over: Partial<SessionSet> = {}): SessionSet[] {
  return values.map(([kg, reps], index) =>
    workingSet(nextSetId(), index + 1, {
      setIndex: index,
      ...(kg === undefined ? { kg: undefined } : { kg }),
      reps,
      target,
      plannedSetCount: planned,
      ...(index >= planned ? { extra: true } : {}),
      ...over,
    }),
  );
}

/** Gün A: Bench (3 × 8–10) ve Şınav (3 × 8–12). */
function day(): WorkoutDay {
  return dayWithBlocks([
    { id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench-press', sets: sets(3, 8, 10) }] },
    { id: 'b_bbbbbb', kind: 'single', restSeconds: 60, rows: [{ id: 'r_bbbbbb', exerciseId: 'push-up', sets: sets(3, 8, 12) }] },
  ]);
}

/** Satırın planını ve önceki antrenmanını değiştirir. */
function tune(base: WorkoutDay, rowId: string, patch: { plan?: Partial<WorkoutRow['plan']>; previous?: RowPrevious }): WorkoutDay {
  const row = base.rows[rowId] as WorkoutRow;
  return {
    ...base,
    rows: { ...base.rows, [rowId]: { ...row, ...(patch.plan ? { plan: { ...row.plan, ...patch.plan } } : {}), ...(patch.previous ? { previous: patch.previous } : {}) } },
  };
}

const benchAt60 = (base = day()) => tune(base, 'r_aaaaaa', { plan: { topWeightKg: 60, reason: 'hold' } });

function doc(entries: SessionEntry[], over: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({ entries, ...over });
}

const bench = (values: readonly (readonly [number, number])[], over: Partial<SessionEntry> = {}) =>
  sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: logged(values, { min: 8, max: 10 }), ...over });
const pushUp = (reps: readonly number[], target: SetSpec = { min: 8, max: 12 }, planned = 3, over: Partial<SessionEntry> = {}) =>
  sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', exerciseId: 'push-up', title: 'Şınav', sets: logged(reps.map((value) => [undefined, value] as const), target, planned), ...over });

const previous = (values: readonly number[], over: Partial<RowPrevious> = {}): RowPrevious => ({
  values: values.map((value, setIndex) => ({ setIndex, value })),
  done: values.length,
  planned: 3,
  skipped: false,
  ...over,
});

const keys = (items: readonly FeedbackItem[]) => items.map((item) => `${item.kind}:${item.mode}:${item.checked ? 'on' : 'off'}`);

describe('plan ile yapılanın farkı: ağırlık', () => {
  test('en ağır tam yük seti planın bir adım üstü ve tekrar alt sınırda: "Bundan sonra W", seçili', () => {
    const items = feedbackItems({ day: benchAt60(), doc: doc([bench([[62.5, 8], [62.5, 8], [60, 10]])]), extras: {} });
    assert.deepEqual(keys(items), ['weight_up:direct:on']);
    assert.equal(items[0]?.text, 'Bench Press: bundan sonra 62,5 kg');
    assert.equal(items[0]?.hint, 'İşaretsiz: bir defalık (60 kg kalır)');
    assert.deepEqual(items[0]?.kg, { from: 60, to: 62.5 });
  });

  test('ağır sette tekrar alt sınırın altında ya da plan içinde: madde yok', () => {
    assert.deepEqual(feedbackItems({ day: benchAt60(), doc: doc([bench([[62.5, 7], [62.5, 8], [60, 9]])]), extras: {} }), []);
    assert.deepEqual(feedbackItems({ day: benchAt60(), doc: doc([bench([[60, 10], [60, 10], [60, 9]])]), extras: {} }), []);
  });

  test('onaylı aşırı yük: madde var ama seçili değil ("Bir defalık")', () => {
    const items = feedbackItems({ day: benchAt60(), doc: doc([bench([[90, 8], [90, 8], [90, 8]])]), extras: {} });
    assert.deepEqual(keys(items), ['weight_up:direct:off']);
    assert.equal(items[0]?.kg?.overload, true);
  });

  test('bütün tam yük setleri planın en az bir adım altı: "Bundan sonra W", seçili', () => {
    const items = feedbackItems({ day: benchAt60(), doc: doc([bench([[55, 10], [57.5, 10], [57.5, 9]])]), extras: {} });
    assert.deepEqual(keys(items), ['weight_down:direct:on']);
    assert.equal(items[0]?.text, 'Bench Press: bundan sonra 57,5 kg');
    assert.equal(items[0]?.hint, 'İşaretsiz: bu seferlik (60 kg kalır)');
  });

  test('hafifletme planı, hafifletilmiş antrenman ya da "bir defalık" işaretli: sorulmaz', () => {
    const heavy = [[62.5, 8], [62.5, 8], [62.5, 8]] as const;
    assert.deepEqual(feedbackItems({ day: tune(day(), 'r_aaaaaa', { plan: { topWeightKg: 60, reason: 'deload' } }), doc: doc([bench(heavy)]), extras: {} }), []);
    assert.deepEqual(feedbackItems({ day: benchAt60(), doc: doc([bench(heavy)], { adjust: 'lighter' }), extras: {} }), []);
    assert.deepEqual(feedbackItems({ day: benchAt60(), doc: doc([bench(heavy, { oneOff: true })]), extras: {} }), []);
  });
});

describe('plan ile yapılanın farkı: tekrar hedefi', () => {
  test('vücut ağırlığı: bu ve önceki antrenmanda bütün setler tepenin 2 üstü → hedef en düşük sete göre kayar, doğrudan', () => {
    const base = tune(day(), 'r_bbbbbb', { previous: previous([14, 15, 14]) });
    const items = feedbackItems({ day: base, doc: doc([pushUp([15, 14, 16])]), extras: {} });
    assert.deepEqual(keys(items), ['target:direct:on']);
    assert.deepEqual(items[0]?.target, { from: sets(3, 8, 12), to: sets(3, 10, 14) });
    assert.equal(items[0]?.text, 'Şınav: hedef 10–14 tekrar');
    assert.equal(items[0]?.hint, 'İşaretsiz: hedef aynı kalır');
  });

  test('2-for-2: önceki antrenman yoksa ya da tepenin 2 üstünde değilse hedef kaymaz', () => {
    assert.deepEqual(feedbackItems({ day: day(), doc: doc([pushUp([15, 14, 16])]), extras: {} }), []);
    const base = tune(day(), 'r_bbbbbb', { previous: previous([14, 13, 14]) });
    assert.deepEqual(feedbackItems({ day: base, doc: doc([pushUp([15, 14, 16])]), extras: {} }), []);
  });

  test('bütün setler alt sınırın altında, üst üste 2 antrenman → hedef iner (genişlik korunur)', () => {
    const base = tune(day(), 'r_bbbbbb', { previous: previous([7, 6, 6]) });
    const items = feedbackItems({ day: base, doc: doc([pushUp([6, 5, 5])]), extras: {} });
    assert.deepEqual(items[0]?.target?.to, sets(3, 6, 10));
    assert.equal(items[0]?.text, 'Şınav: hedef 6–10 tekrar');
  });

  test('bütün setler yapılmadıysa hedef değişmez', () => {
    const base = tune(day(), 'r_bbbbbb', { previous: previous([14, 15, 14]) });
    assert.deepEqual(feedbackItems({ day: base, doc: doc([pushUp([15, 14])]), extras: {} }), []);
  });

  test('AMRAP satırında hedef PT\'ye öneri; AMRAP seti karar vermez', () => {
    const amrap = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12, amrap: true }];
    const base = tune(
      dayWithBlocks([
        { id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench-press', sets: sets(3, 8, 10) }] },
        { id: 'b_bbbbbb', kind: 'single', restSeconds: 60, rows: [{ id: 'r_bbbbbb', exerciseId: 'push-up', sets: amrap }] },
      ]),
      'r_bbbbbb',
      { previous: previous([14, 14, 20]) },
    );
    const entry = sessionEntry('e_bbbbbb', {
      rowId: 'r_bbbbbb',
      exerciseId: 'push-up',
      title: 'Şınav',
      sets: [...logged([[undefined, 14], [undefined, 15]], { min: 8, max: 12 }), ...logged([[undefined, 9]], { min: 8, max: 12, amrap: true }).map((set) => ({ ...set, setIndex: 2 }))],
    });
    const items = feedbackItems({ day: base, doc: doc([entry]), extras: {} });
    assert.deepEqual(keys(items), ['target:proposal:on']);
    assert.deepEqual(items[0]?.target?.to, [{ min: 10, max: 14 }, { min: 10, max: 14 }, { min: 10, max: 14, amrap: true }]);
  });

  test('ağırlıklı harekette yalnız cihazın tavanında', () => {
    const base = tune(tune(day(), 'r_aaaaaa', { plan: { topWeightKg: 60, reason: 'device_max' }, previous: previous([12, 12, 12]) }), 'r_bbbbbb', {});
    const items = feedbackItems({ day: base, doc: doc([bench([[60, 12], [60, 12], [60, 13]])]), extras: {} });
    assert.deepEqual(keys(items), ['target:direct:on']);
    assert.deepEqual(items[0]?.target?.to, sets(3, 10, 12));
  });

  test('kaydırma sınırları: alt sınır 1, tekrar üst sınırı 100', () => {
    assert.deepEqual(shiftSets(sets(1, 2, 4), -3, 'bodyweight_reps'), sets(1, 1, 3));
    assert.deepEqual(shiftSets(sets(1, 90, 98), 5, 'bodyweight_reps'), sets(1, 92, 100));
  });
});

describe('plan ile yapılanın farkı: öneriler', () => {
  test('set sayısı: aynı yönde üst üste 2 antrenman → "3 → 4 set", seçili öneri', () => {
    const base = tune(benchAt60(), 'r_aaaaaa', { previous: previous([10, 10, 10, 9], { done: 4 }) });
    const items = feedbackItems({ day: base, doc: doc([bench([[60, 10], [60, 10], [60, 10], [60, 8]])]), extras: {} });
    assert.deepEqual(keys(items), ['sets:proposal:on']);
    assert.deepEqual(items[0]?.count, { from: 3, to: 4 });
    assert.equal(items[0]?.text, 'Bench Press: 3 → 4 set');
    assert.equal(items[0]?.why, '2 antrenmandır 4 set yapıldı');
  });

  test('set sayısı: bir kez ya da farklı yönde öneri yok', () => {
    const once = feedbackItems({ day: benchAt60(), doc: doc([bench([[60, 10], [60, 10], [60, 10], [60, 8]])]), extras: {} });
    assert.deepEqual(once, []);
    const mixed = tune(benchAt60(), 'r_aaaaaa', { previous: previous([10, 10], { done: 2 }) });
    assert.deepEqual(feedbackItems({ day: mixed, doc: doc([bench([[60, 10], [60, 10], [60, 10], [60, 8]])]), extras: {} }), []);
  });

  test('set sayısı aşağı: yalnız bilerek geçilen setler; erken bitişte kalanlar sayılmaz', () => {
    const cut = previous([10, 10], { done: 2, skipped: true });
    const skippedNow = bench([[60, 10], [60, 10]], { status: 'skipped', skip: { moved: true } });
    const items = feedbackItems({ day: tune(benchAt60(), 'r_aaaaaa', { previous: cut }), doc: doc([skippedNow]), extras: {} });
    assert.deepEqual(keys(items), ['sets:proposal:on']);
    assert.deepEqual(items[0]?.count, { from: 3, to: 2 });
    const early = bench([[60, 10], [60, 10]], { status: 'partial', skip: { reason: 'tired', moved: false } });
    assert.deepEqual(feedbackItems({ day: tune(benchAt60(), 'r_aaaaaa', { previous: cut }), doc: doc([early]), extras: {} }), []);
    assert.deepEqual(feedbackItems({ day: tune(benchAt60(), 'r_aaaaaa', { previous: { ...cut, skipped: false } }), doc: doc([skippedNow]), extras: {} }), []);
  });

  test('aynı satır aynı nedenle üst üste 2 antrenman geçildi: "çıkar ya da değiştir"', () => {
    const base = tune(day(), 'r_bbbbbb', { previous: previous([], { done: 0, planned: 0, skipped: true, reason: 'busy' }) });
    const skipped = pushUp([], undefined, 3, { status: 'skipped', skip: { reason: 'busy', moved: true } });
    const items = feedbackItems({ day: base, doc: doc([skipped]), extras: {} });
    assert.deepEqual(keys(items), ['remove:proposal:on']);
    assert.equal(items[0]?.why, '2 antrenmandır geçildi (Alet dolu)');
    const other = pushUp([], undefined, 3, { status: 'skipped', skip: { reason: 'tired', moved: true } });
    assert.deepEqual(feedbackItems({ day: base, doc: doc([other]), extras: {} }), []);
    // Erken bitişte yapılmadan kalan (nedeni bitişte) geçilmiş sayılmaz.
    const early = pushUp([], undefined, 3, { status: 'pending', skip: { reason: 'busy', moved: false } });
    assert.deepEqual(feedbackItems({ day: base, doc: doc([early]), extras: {} }), []);
  });

  test('muadil ve eklenen hareket: öneri, seçili değil; setleri planlarından', () => {
    const extras: ExtraRows = {
      [extraKey('r_aaaaaa', 'dumbbell-press')]: {
        exerciseId: 'dumbbell-press',
        row: day().rows.r_aaaaaa as WorkoutRow,
        template: { id: 'r_aaaaaa', exerciseId: 'dumbbell-press', sets: sets(3, 8, 10) },
      },
      [extraKey('e_cccccc', 'plank')]: {
        exerciseId: 'plank',
        row: { ...(day().rows.r_aaaaaa as WorkoutRow), trackingType: 'duration' },
        template: { id: 'e_cccccc', exerciseId: 'plank', sets: sets(2, 30, 45) },
        restSeconds: 45,
      },
    };
    const swapped = sessionEntry('e_aaaaaa', { swappedFrom: 'r_aaaaaa', exerciseId: 'dumbbell-press', title: 'Dumbbell Press', sets: logged([[20, 10]], { min: 8, max: 10 }) });
    const added = sessionEntry('e_cccccc', { added: true, exerciseId: 'plank', title: 'Plank', sets: [workingSet(nextSetId(), 30, { kg: undefined, reps: undefined, seconds: 40 })] });
    const items = feedbackItems({ day: day(), doc: doc([swapped, added]), extras });
    assert.deepEqual(keys(items), ['swap:proposal:off', 'add:proposal:off']);
    assert.equal(items[0]?.text, 'Bench Press yerine Dumbbell Press');
    assert.deepEqual(items[0]?.swap, { exerciseId: 'dumbbell-press', title: 'Dumbbell Press' });
    assert.deepEqual(items[1]?.add, { sets: sets(2, 30, 45), restSeconds: 45 });
    assert.equal(items[1]?.trackingType, 'duration');
  });

  test('öneri katmanının set artışı seçili gelir; önce doğrudan maddeler', () => {
    const items = feedbackItems({
      day: benchAt60(),
      doc: doc([bench([[62.5, 8], [62.5, 8], [62.5, 8]])]),
      extras: {},
      suggestions: [{ rowId: 'r_aaaaaa', from: 3, to: 4, why: 'Orta aşama; 3 haftadır ilerliyorsun' }],
    });
    assert.deepEqual(keys(items), ['weight_up:direct:on', 'algo_sets:proposal:on']);
  });
});

describe('cevap', () => {
  const items = feedbackItems({
    day: benchAt60(tune(day(), 'r_bbbbbb', { previous: previous([14, 15, 14]) })),
    doc: doc([bench([[62.5, 8], [62.5, 8], [62.5, 8]]), pushUp([15, 14, 16])]),
    extras: {},
  });

  test('Evet: hazır seçim; Hayır: hiçbiri; Tek tek seç: işaretliler; cevapsız: yalnız yukarı ağırlık', () => {
    const applied = (answer: 'yes' | 'no' | 'pick' | 'none', picked?: Set<string>) => resolveFeedback(items, answer, picked).items.map((item) => item.apply);
    assert.deepEqual(applied('yes'), [true, true]);
    assert.deepEqual(applied('no'), [false, false]);
    assert.deepEqual(applied('pick', new Set(['target:r_bbbbbb'])), [false, true]);
    assert.deepEqual(applied('none'), [true, false]);
    // Gövde şemadan geçer (uç aynı şemayla okur).
    assert.equal(v.safeParse(finishFeedbackSchema, resolveFeedback(items, 'yes')).success, true);
  });

  test('uygulanmayan yukarı ağırlık oneOff, aşağı lighter; işaretliyse dokunulmaz', () => {
    const stamp = { at: at(70), by: W1 };
    const up = resolveFeedback(items, 'no').items;
    const flagged = withFeedbackFlags(doc([bench([[62.5, 8]])]), up, stamp);
    assert.equal(flagged.entries[0]?.oneOff, true);
    assert.equal(flagged.entries[0]?.updatedAt, at(70));
    const same = doc([bench([[62.5, 8]], { oneOff: true })]);
    assert.equal(withFeedbackFlags(same, up, stamp), same);
    const down = feedbackItems({ day: benchAt60(), doc: doc([bench([[55, 10], [55, 10], [55, 10]])]), extras: {} });
    assert.equal(withFeedbackFlags(doc([bench([[55, 10]])]), resolveFeedback(down, 'none').items, stamp).entries[0]?.lighter, true);
  });

  test('özet: en çok 3 seçili satır, önce doğrudan; seçili olmayan sayısı', () => {
    const many: FeedbackItem[] = ['a', 'b', 'c', 'd'].map((key, index) => ({ ...(items[0] as FeedbackItem), key, mode: index === 0 ? 'proposal' : 'direct' }));
    const summary = feedbackSummary(many, new Set(['a', 'b', 'c', 'd']));
    assert.deepEqual(summary.lines.map((item) => item.key), ['b', 'c', 'd']);
    assert.equal(summary.more, 1);
    assert.equal(feedbackSummary(many, new Set(['a'])).unchecked, 3);
  });

  test('bitişten sonra danışana', () => {
    assert.equal(feedbackMessage({ direct: 0, proposals: 0, converted: 0 }), null);
    assert.deepEqual(feedbackMessage({ direct: 1, proposals: 1, converted: 0 }), { title: 'Programın güncellendi', description: '1 öneri antrenörünün onayında' });
    assert.equal(feedbackMessage({ direct: 0, proposals: 2, converted: 0 })?.title, 'Önerin antrenörüne gönderildi');
    assert.equal(feedbackMessage({ direct: 0, proposals: 1, converted: 1 })?.title, 'Program o arada değişti; önerin antrenörüne gönderildi.');
  });
});

describe('sunucu: kararları programa ve önerilere yazmak', () => {
  /** Gün A: Bench (r_aaaaaa) + Şınav (r_bbbbbb, 3 × 8–12). */
  function raw(extra: Record<string, unknown> = {}) {
    const file = programFile({}, { futureField: 'kalır', ...extra });
    const dayA = (file.phases as { days: { blocks: { rows: { exerciseId: string; sets: SetSpec[] }[] }[] }[] }[])[0]?.days[0];
    const row = dayA?.blocks[1]?.rows[0];
    if (row) {
      row.exerciseId = 'push-up';
      row.sets = sets(3, 8, 12);
    }
    return file as Record<string, unknown>;
  }
  const parsed = (file: Record<string, unknown>) => v.parse(programSchema, file);
  const finished = (entries: SessionEntry[]) => doc(entries, { status: 'finished', finishedAt: at(60) });
  const decisions = () => {
    const base = benchAt60(tune(day(), 'r_bbbbbb', { previous: previous([14, 15, 14]) }));
    const found = feedbackItems({ day: base, doc: doc([bench([[62.5, 8], [62.5, 8], [62.5, 8]]), pushUp([15, 14, 16])]), extras: {} });
    return resolveFeedback(found, 'yes');
  };
  const entries = () => [bench([[62.5, 8], [62.5, 8], [62.5, 8]]), pushUp([15, 14, 16])];
  const random = () => {
    let n = 0;
    return (size: number) => Uint8Array.from({ length: size }, () => (n++ * 7) % 252);
  };

  test('kilo ve hedef danışan kaydı olarak: revision aynı, sessionId\'li kayıt, clientTargets; bilinmeyen alan kalır', () => {
    const file = raw();
    const plan = planProgramFeedback({ doc: finished(entries()), feedback: decisions(), program: parsed(file), rawProgram: file, proposals: null, now: new Date(at(61)) });
    assert.deepEqual(plan.outcome, { direct: 2, proposals: 0, converted: 0 });
    assert.deepEqual(plan.notices, ['program_update']);
    assert.equal(plan.proposals, null);
    const next = plan.program as Record<string, unknown>;
    assert.equal(next.revision, 7);
    assert.equal(next.futureField, 'kalır');
    assert.deepEqual(next.clientTargets, { r_bbbbbb: { sets: sets(3, 10, 14), baseSets: sets(3, 8, 12), sessionId: 's_k2m9x4qa', at: at(60) } });
    const log = next.log as { kind: string; sessionId?: string; revision: number; changes: { scope?: string; text: string }[] }[];
    assert.equal(log[0]?.kind, 'client');
    assert.equal(log[0]?.sessionId, 's_k2m9x4qa');
    assert.deepEqual(log[0]?.changes, [
      { scope: 'Gün A', text: 'Bench Press: çalışma ağırlığı 60 → 62,5 kg' },
      { scope: 'Gün A', text: 'Şınav 3×8–12 → 3×10–14' },
    ]);
    // Yazılan dosya şemadan geçer ve hedef geçerlidir.
    assert.deepEqual(parsed(next).clientTargets?.r_bbbbbb?.sets, sets(3, 10, 14));
  });

  test('aynı seansın kaydı varsa program yeniden yazılmaz (yeniden deneme)', () => {
    const file = raw({ log: [{ at: at(60), revision: 7, kind: 'client', sessionId: 's_k2m9x4qa', changes: [{ text: 'x' }] }] });
    const plan = planProgramFeedback({ doc: finished(entries()), feedback: decisions(), program: parsed(file), rawProgram: file, proposals: null, now: new Date(at(61)) });
    assert.equal(plan.program, null);
  });

  test('PT o arada satırı değiştirdi: hedef doğrudan yazılmaz, öneriye döner', () => {
    const file = raw();
    const row = (file.phases as { days: { blocks: { rows: { sets: SetSpec[] }[] }[] }[] }[])[0]?.days[0]?.blocks[1]?.rows[0];
    if (row) row.sets = sets(4, 8, 12);
    const plan = planProgramFeedback({ doc: finished(entries()), feedback: decisions(), program: parsed(file), rawProgram: file, proposals: null, now: new Date(at(61)), random: random() });
    assert.deepEqual(plan.outcome, { direct: 1, proposals: 1, converted: 1 });
    assert.equal((plan.program as Record<string, unknown>).clientTargets, undefined);
    const items = (plan.proposals?.items ?? []) as { kind: string; text: string; why: string; target: unknown; status: string }[];
    assert.equal(items[0]?.kind, 'target');
    assert.equal(items[0]?.status, 'pending');
    assert.equal(items[0]?.text, 'Şınav 3×8–12 → 3×10–14');
    assert.equal(items[0]?.why, 'Program o arada değişti; danışanın hedef önerisi');
  });

  test('öneriler proposals.json\'a; aynı bitiş ikinci kez gelirse değişiklik yok', () => {
    const base = tune(benchAt60(), 'r_aaaaaa', { previous: previous([10, 10, 10, 9], { done: 4 }) });
    const done = [bench([[60, 10], [60, 10], [60, 10], [60, 8]])];
    const feedback = resolveFeedback(feedbackItems({ day: base, doc: doc(done), extras: {} }), 'yes');
    const file = raw();
    const first = planProgramFeedback({ doc: finished(done), feedback, program: parsed(file), rawProgram: file, proposals: null, now: new Date(at(61)), random: random() });
    assert.deepEqual(first.outcome, { direct: 0, proposals: 1, converted: 0 });
    assert.equal(first.program, null);
    assert.deepEqual(first.notices, ['proposal']);
    const item = first.proposals?.items[0] as Record<string, unknown>;
    assert.equal(item.kind, 'sets');
    assert.equal(item.text, 'Bench Press 3 → 4 set');
    assert.equal(item.why, '2 antrenmandır 4 set yapıldı');
    assert.deepEqual([item.from, item.to, item.rowId, item.dayId, item.sessionId], [3, 4, 'r_aaaaaa', DAY_A, 's_k2m9x4qa']);
    const again = planProgramFeedback({ doc: finished(done), feedback, program: parsed(file), rawProgram: file, proposals: first.proposals, now: new Date(at(70)), random: random() });
    assert.equal(again.proposals, null);
  });

  test('seans belgesiyle tutmayan karar yok sayılır; uygulanmayan karar programa gitmez', () => {
    const file = raw();
    const feedback = decisions();
    const tampered = { ...feedback, items: feedback.items.map((item) => (item.kind === 'weight_up' ? { ...item, kg: { from: 60, to: 100 } } : { ...item, apply: false })) };
    const plan = planProgramFeedback({ doc: finished(entries()), feedback: tampered, program: parsed(file), rawProgram: file, proposals: null, now: new Date(at(61)) });
    assert.deepEqual(plan.outcome, { direct: 0, proposals: 0, converted: 0 });
    assert.equal(plan.program, null);
  });
});

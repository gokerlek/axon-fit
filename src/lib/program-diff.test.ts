import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProgramEdit,
  commitMessage,
  diffDay,
  diffProgram,
  formatChangeSummary,
  prescriptionText,
  type DiffContext,
} from './program-diff.ts';
import { dissolveGroup, joinBlocks, ungroupRow, type IdSource } from './template-edit.ts';
import type { ProgramBody, ProgramChange, ProgramDay, ProgramPhase, ProgramState } from './program-plan.ts';
import type { TemplateBlock, TemplateRow } from './template-plan.ts';

const ctx: DiffContext = {
  exercises: new Map([
    ['goblet-squat', { title: 'Goblet Squat', trackingType: 'weight_reps' as const }],
    ['leg-press', { title: 'Leg Press', trackingType: 'weight_reps' as const }],
    ['hip-thrust', { title: 'Kalça Köprüsü', trackingType: 'weight_reps' as const }],
    ['leg-curl', { title: 'Leg Curl', trackingType: 'weight_reps' as const }],
    ['plank', { title: 'Plank', trackingType: 'duration' as const }],
    ['hack-squat', { title: 'Hack Squat', trackingType: 'weight_reps' as const }],
  ]),
  devices: new Map([['smith', { name: 'Smith Makinesi' }]]),
};

/** Egzersiz türleri (grup dağıtırken dinlenme için). */
const kinds = new Map([...ctx.exercises.keys()].map((id) => [id, { category: 'compound' as const }]));

function row(id: string, exerciseId: string, min: number, max: number, fields: Partial<TemplateRow> = {}): TemplateRow {
  return { id, exerciseId, target: { min, max }, ...fields };
}

function single(id: string, r: TemplateRow, sets = 3, restSeconds = 120): TemplateBlock {
  return { id, kind: 'single', sets, restSeconds, rows: [r] };
}

function group(id: string, kind: TemplateBlock['kind'], rows: TemplateRow[], sets = 3, restSeconds = 90, transitionSeconds?: number): TemplateBlock {
  return { id, kind, sets, restSeconds, ...(transitionSeconds !== undefined ? { transitionSeconds } : {}), rows };
}

const goblet = row('r_goblet', 'goblet-squat', 8, 12);
const press = row('r_press1', 'leg-press', 10, 15);
const curl = row('r_curl01', 'leg-curl', 10, 15);
const hip = row('r_hip001', 'hip-thrust', 8, 12);

function gun(id: string, name: string, blocks: TemplateBlock[], fields: Partial<ProgramDay> = {}): ProgramDay {
  return { id, name, blocks, ...fields };
}

const beforeA = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_press1', press)]);
const afterA = gun('d_aaaaaa', 'Gün A', [single('b_goblet', { ...goblet, target: { min: 6, max: 10 } }, 4), single('b_hip001', hip)]);

function body(phases: ProgramPhase[], currentPhaseId = phases[0]?.id ?? ''): ProgramBody {
  return { currentPhaseId, phases };
}

const evre1 = (days: ProgramDay[], fields: Partial<ProgramPhase> = {}): ProgramPhase => ({ id: 'p_evre01', name: 'Evre 1', days, ...fields });

const texts = (changes: readonly ProgramChange[]) => changes.map((change) => change.text);

describe('gün farkı', () => {
  test('değişiklik yoksa boş', () => {
    assert.deepEqual(diffDay(beforeA, beforeA, ctx), []);
    assert.deepEqual(diffProgram(body([evre1([beforeA])]), body([evre1([beforeA])]), ctx), []);
  });

  test('gereksinimdeki örnek: reçete, çıkarılan, eklenen', () => {
    assert.deepEqual(diffDay(beforeA, afterA, ctx), ['Goblet Squat 3×8–12 → 4×6–10', 'Leg Press çıkarıldı', 'Kalça Köprüsü eklendi']);
    const changes = diffProgram(body([evre1([beforeA])]), body([evre1([afterA])]), ctx);
    assert.equal(formatChangeSummary(changes), 'Gün A: Goblet Squat 3×8–12 → 4×6–10 · Leg Press çıkarıldı · Kalça Köprüsü eklendi');
  });

  test('evre eklenince kapsam "Evre · Gün", evre en sonda', () => {
    const guc: ProgramPhase = { id: 'p_guc001', name: 'Güç', weeks: 6, days: [gun('d_bbbbbb', 'Gün A', [single('b_other1', row('r_other1', 'plank', 30, 60))])] };
    const changes = diffProgram(body([evre1([beforeA])]), body([evre1([afterA]), guc]), ctx);
    assert.equal(changes[0]?.scope, 'Evre 1 · Gün A');
    assert.deepEqual(changes.at(-1), { text: "Evre 'Güç' eklendi (6 hafta)" });
    assert.equal(changes.length, 4);
  });

  test('hareket değişimi', () => {
    const after = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_press1', { ...press, exerciseId: 'goblet-squat' })]);
    assert.deepEqual(diffDay(beforeA, after, ctx), ['Leg Press → Goblet Squat']);
  });

  test('süreli hedef', () => {
    const plank = row('r_plank1', 'plank', 30, 60);
    const before = gun('d_aaaaaa', 'Gün A', [single('b_plank1', plank)]);
    const after = gun('d_aaaaaa', 'Gün A', [single('b_plank1', { ...plank, target: { min: 45, max: 45 } })]);
    assert.deepEqual(diffDay(before, after, ctx), ['Plank 3×30–60 sn → 3×45 sn']);
    assert.equal(prescriptionText(5, { min: 5, max: 5 }, 'weight_reps'), '5×5');
  });

  test('tek harekette dinlenme', () => {
    const after = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet, 3, 90), single('b_press1', press)]);
    assert.deepEqual(diffDay(beforeA, after, ctx), ['Goblet Squat dinlenme 2 dk → 1 dk 30 sn']);
    const none = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet, 3, 0), single('b_press1', press)]);
    const one = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet, 3, 60), single('b_press1', press)]);
    assert.deepEqual(diffDay(none, one, ctx), ['Goblet Squat dinlenme yok → 1 dk']);
  });

  const singles = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet, 4), single('b_curl01', curl, 3)]);
  const superset = gun('d_aaaaaa', 'Gün A', [group('b_goblet', 'superset', [goblet, curl], 3)]);

  test('iki tek hareket süperset olur', () => {
    const joined = gun('d_aaaaaa', 'Gün A', joinBlocks(singles.blocks, 'b_goblet', 'next'));
    assert.equal(joined.blocks[0]?.sets, 4);
    assert.deepEqual(diffDay(singles, joined, ctx), ['Leg Curl 3×10–15 → 4×10–15', 'Yeni süperset: Goblet Squat + Leg Curl']);
  });

  test('süperset turu yalnız grupta yazılır', () => {
    const more = gun('d_aaaaaa', 'Gün A', [group('b_goblet', 'superset', [goblet, curl], 4)]);
    assert.deepEqual(diffDay(superset, more, ctx), ['Süperset (Goblet Squat + Leg Curl): 3 → 4 tur']);
  });

  test('grup dağıtılır', () => {
    let n = 0;
    const dissolved = gun('d_aaaaaa', 'Gün A', dissolveGroup(superset.blocks, 'b_goblet', kinds, () => `b_new00${++n}`));
    assert.deepEqual(diffDay(superset, dissolved, ctx), ['Süperset dağıtıldı: Goblet Squat + Leg Curl']);
  });

  test('grup türü değişir', () => {
    const complex = gun('d_aaaaaa', 'Gün A', [group('b_goblet', 'complex', [goblet, curl], 3)]);
    assert.deepEqual(diffDay(superset, complex, ctx), ['Süperset → kompleks: Goblet Squat + Leg Curl']);
  });

  test('devreye hareket katılır; istasyon arası değişir', () => {
    const circuit = group('b_circ01', 'circuit', [goblet, press, curl], 3, 120, 15);
    const before = gun('d_aaaaaa', 'Gün A', [circuit, single('b_hip001', hip, 3)]);
    const after = gun('d_aaaaaa', 'Gün A', joinBlocks(before.blocks, 'b_hip001', 'previous'));
    assert.deepEqual(diffDay(before, after, ctx), ['Devre güncellendi: Goblet Squat + Leg Press + Leg Curl + Kalça Köprüsü']);
    const slower = gun('d_aaaaaa', 'Gün A', [{ ...circuit, transitionSeconds: 20 }]);
    assert.deepEqual(diffDay(gun('d_aaaaaa', 'Gün A', [circuit]), slower, ctx), [
      'Devre (Goblet Squat + Leg Press + Leg Curl): istasyon arası 15 sn → 20 sn',
    ]);
  });

  describe('gruptan çıkarma (grup aynı türde sürer)', () => {
    const ids: IdSource = () => 'b_new001';
    const complex = gun('d_aaaaaa', 'Gün A', [group('b_cmplx1', 'complex', [goblet, press, curl], 4)]);
    const circuit = gun('d_aaaaaa', 'Gün A', [group('b_circ01', 'circuit', [goblet, press, curl, hip], 3, 120, 15)]);
    const ungroup = (day: ProgramDay, rowId: string) => gun(day.id, day.name, ungroupRow(day.blocks, rowId, kinds, ids));

    test('kompleksin ilk ve son hareketi', () => {
      const first = ungroup(complex, goblet.id);
      assert.equal(first.blocks[1]?.kind, 'complex');
      assert.deepEqual(diffDay(complex, first, ctx), ['Goblet Squat gruptan çıkarıldı (dinlenme 2 dk)']);
      const last = ungroup(complex, curl.id);
      assert.deepEqual(diffDay(complex, last, ctx), ['Leg Curl gruptan çıkarıldı (dinlenme 2 dk)']);

      // Aynı kayıtta yeni tek hareketin dinlenmesi de değişirse cümlede görünür.
      const rested = gun('d_aaaaaa', 'Gün A', last.blocks.map((block) => (block.id === 'b_new001' ? { ...block, restSeconds: 60 } : block)));
      assert.deepEqual(diffDay(complex, rested, ctx), ['Leg Curl gruptan çıkarıldı (dinlenme 1 dk)']);

      const at = '2026-09-01T00:00:00.000Z';
      const stored: ProgramState = {
        version: 1,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        phases: [evre1([complex])],
        current: { phaseId: 'p_evre01', startedAt: at },
        rotation: {},
        log: [],
      };
      const result = applyProgramEdit(stored, body([evre1([last])]), ctx, new Date('2026-09-24T09:00:00.000Z'));
      assert.ok(result);
      assert.deepEqual(result.changes, [{ scope: 'Gün A', text: 'Leg Curl gruptan çıkarıldı (dinlenme 2 dk)' }]);
    });

    test('dört hareketli devrenin ilk ve son hareketi', () => {
      const first = ungroup(circuit, goblet.id);
      assert.equal(first.blocks[1]?.kind, 'circuit');
      assert.deepEqual(diffDay(circuit, first, ctx), ['Goblet Squat gruptan çıkarıldı (dinlenme 2 dk)']);
      const last = ungroup(circuit, hip.id);
      assert.deepEqual(diffDay(circuit, last, ctx), ['Kalça Köprüsü gruptan çıkarıldı (dinlenme 2 dk)']);
    });
  });

  test('kural ve cihaz', () => {
    const withRule = gun('d_aaaaaa', 'Gün A', [single('b_goblet', { ...goblet, rule: { scheme: 'linear', targetRir: 1 } }), single('b_press1', press)]);
    assert.deepEqual(diffDay(beforeA, withRule, ctx), ['Goblet Squat kuralı: Doğrusal · 1 tekrar yedekte']);
    assert.deepEqual(diffDay(withRule, beforeA, ctx), ['Goblet Squat egzersizin kuralına döndü']);

    const withDevice = gun('d_aaaaaa', 'Gün A', [single('b_goblet', { ...goblet, deviceId: 'smith' }), single('b_press1', press)]);
    assert.deepEqual(diffDay(beforeA, withDevice, ctx), ['Goblet Squat cihazı: Smith Makinesi']);
    assert.deepEqual(diffDay(withDevice, beforeA, ctx), ['Goblet Squat egzersizin cihazına döndü']);
    const gone = gun('d_aaaaaa', 'Gün A', [single('b_goblet', { ...goblet, deviceId: 'eski-cihaz' }), single('b_press1', press)]);
    assert.deepEqual(diffDay(beforeA, gone, ctx), ['Goblet Squat cihazı: silinmiş cihaz']);
  });

  test('not eklenir, silinir; uzun not 60 karakterde kesilir', () => {
    const noted = gun('d_aaaaaa', 'Gün A', [single('b_goblet', { ...goblet, note: 'Derinliği azalt' }), single('b_press1', press)]);
    assert.deepEqual(diffDay(beforeA, noted, ctx), ['Goblet Squat notu: “Derinliği azalt”']);
    assert.deepEqual(diffDay(noted, beforeA, ctx), ['Goblet Squat notu silindi']);
    const long = 'x'.repeat(100);
    const longNote = gun('d_aaaaaa', 'Gün A', [single('b_goblet', { ...goblet, note: long }), single('b_press1', press)]);
    assert.deepEqual(diffDay(beforeA, longNote, ctx), [`Goblet Squat notu: “${'x'.repeat(59)}…”`]);
  });

  test('sıra değişir', () => {
    const swapped = gun('d_aaaaaa', 'Gün A', [single('b_press1', press), single('b_goblet', goblet)]);
    assert.deepEqual(diffDay(beforeA, swapped, ctx), ['Hareket sırası değişti']);
  });

  test('silinmiş egzersiz kimliğiyle yazılır', () => {
    const before = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_old001', row('r_old001', 'eski-hareket', 8, 12))]);
    const after = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet)]);
    assert.deepEqual(diffDay(before, after, ctx), ['eski-hareket çıkarıldı']);
  });
});

describe('program farkı', () => {
  const B = gun('d_bbbbbb', 'Gün B', [single('b_bbbbbb', row('r_bbbbbb', 'leg-curl', 10, 15))]);
  const C = gun('d_cccccc', 'Gün C', [single('b_cccccc', row('r_cccccc', 'plank', 30, 60))]);

  test('gün adı, şablondan gün, silinen gün, gün sırası', () => {
    const before = body([evre1([beforeA, B])]);
    const renamed = diffProgram(before, body([evre1([{ ...beforeA, name: 'Bacak' }, B])]), ctx);
    assert.deepEqual(renamed, [{ text: "Gün adı: 'Gün A' → 'Bacak'" }]);

    const source = { templateId: 't_k2m9x4qa', templateName: 'Alt vücut A', at: '2026-09-24T09:00:00.000Z' };
    const added = diffProgram(before, body([evre1([beforeA, B, { ...C, source }])]), ctx);
    assert.deepEqual(texts(added), ["Gün C eklendi ('Alt vücut A' şablonundan)"]);
    assert.deepEqual(texts(diffProgram(before, body([evre1([beforeA, B, C])]), ctx)), ['Gün C eklendi']);

    assert.deepEqual(texts(diffProgram(before, body([evre1([beforeA])]), ctx)), ['Gün B silindi']);

    const three = body([evre1([beforeA, B, C])]);
    assert.deepEqual(texts(diffProgram(three, body([evre1([B, beforeA, C])]), ctx)), ['Gün sırası: Gün B, Gün A, Gün C']);
  });

  test('evre adı, süre, ekleme, silme, sıra ve şu anki evre', () => {
    const uyum = evre1([beforeA], { weeks: 2 });
    const guc: ProgramPhase = { id: 'p_guc001', name: 'Güç', days: [B] };
    const before = body([uyum, guc]);

    assert.deepEqual(texts(diffProgram(before, body([{ ...uyum, name: 'Uyum' }, guc]), ctx)), ["Evre adı: 'Evre 1' → 'Uyum'"]);
    assert.deepEqual(texts(diffProgram(before, body([{ ...uyum, weeks: 3 }, guc]), ctx)), ["'Evre 1' süresi: 2 hafta → 3 hafta"]);
    assert.deepEqual(texts(diffProgram(before, body([uyum, { ...guc, weeks: 4 }]), ctx)), ["'Güç' süresi: süresiz → 4 hafta"]);
    assert.deepEqual(texts(diffProgram(before, body([uyum]), ctx)), ["Evre 'Güç' silindi"]);
    const kuvvet: ProgramPhase = { id: 'p_kuvvet', name: 'Kuvvet', days: [C] };
    assert.deepEqual(texts(diffProgram(before, body([uyum, guc, kuvvet]), ctx)), ["Evre 'Kuvvet' eklendi"]);
    assert.deepEqual(texts(diffProgram(before, body([guc, uyum], uyum.id), ctx)), ['Evre sırası: Güç, Evre 1']);
    assert.deepEqual(diffProgram(before, body([uyum, guc], 'p_guc001'), ctx), [{ text: "Şu anki evre: 'Evre 1' → 'Güç'" }]);
  });

  test('uzun cümle 300 karakterde kesilir', () => {
    const wide: DiffContext = { ...ctx, exercises: new Map([...ctx.exercises, ['uzun', { title: 'U'.repeat(400), trackingType: 'weight_reps' as const }]]) };
    const after = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_press1', { ...press, exerciseId: 'uzun' })]);
    const [change] = diffProgram(body([evre1([beforeA])]), body([evre1([after])]), wide);
    assert.equal(change?.text.length, 300);
    assert.ok(change?.text.endsWith('…'));
  });

  test('özet: aynı kapsam ardışık değilse yeniden yazılır', () => {
    assert.equal(
      formatChangeSummary([
        { scope: 'Gün A', text: 'x' },
        { scope: 'Gün B', text: 'y' },
        { scope: 'Gün A', text: 'z' },
        { text: "Evre 'Güç' eklendi" },
      ]),
      "Gün A: x · Gün B: y · Gün A: z · Evre 'Güç' eklendi",
    );
  });

  test('commit mesajı: tek kısa değişiklik yalnız konu; çoksa konu 72 karakter ve gövdede hepsi', () => {
    assert.equal(commitMessage('edit', [{ scope: 'Gün A', text: 'Leg Press çıkarıldı' }]), 'Program: Gün A: Leg Press çıkarıldı');
    assert.equal(commitMessage('create', [{ text: 'Program oluşturuldu' }]), 'Program oluşturuldu');
    const many: ProgramChange[] = [
      { scope: 'Gün A', text: 'Goblet Squat 3×8–12 → 4×6–10' },
      { scope: 'Gün A', text: 'Leg Press çıkarıldı' },
      { scope: 'Gün A', text: 'Kalça Köprüsü eklendi' },
      { text: "Evre 'Güç' eklendi (6 hafta)" },
    ];
    const message = commitMessage('edit', many);
    const [subject, blank, ...lines] = message.split('\n');
    assert.equal(subject?.length, 72);
    assert.ok(subject?.startsWith('Program: Gün A: Goblet Squat'));
    assert.ok(subject?.endsWith('…'));
    assert.equal(blank, '');
    assert.deepEqual(lines, [
      '- Gün A: Goblet Squat 3×8–12 → 4×6–10',
      '- Gün A: Leg Press çıkarıldı',
      '- Gün A: Kalça Köprüsü eklendi',
      "- Evre 'Güç' eklendi (6 hafta)",
    ]);
  });
});

describe('kaydın uygulanması', () => {
  const at = '2026-09-01T00:00:00.000Z';
  const simdi = new Date('2026-09-24T09:00:00.000Z');
  const B = gun('d_bbbbbb', 'Gün B', [single('b_bbbbbb', row('r_bbbbbb', 'leg-curl', 10, 15))]);
  const C = gun('d_cccccc', 'Gün C', [single('b_cccccc', row('r_cccccc', 'plank', 30, 60))]);
  const source = { templateId: 't_k2m9x4qa', templateName: 'Alt vücut A', at };
  const uyum = evre1([{ ...beforeA, source }, B, C], { name: 'Uyum', weeks: 2 });
  const guc: ProgramPhase = { id: 'p_guc001', name: 'Güç', days: [gun('d_dddddd', 'Gün A', [single('b_dddddd', row('r_dddddd', 'hip-thrust', 8, 12))])] };
  const stored: ProgramState = {
    version: 1,
    revision: 5,
    createdAt: at,
    updatedAt: at,
    phases: [uyum, guc],
    current: { phaseId: uyum.id, startedAt: at },
    rotation: { lastDayId: 'd_bbbbbb', lastCompletedAt: '2026-09-20T10:00:00.000Z' },
    log: [{ at, revision: 5, kind: 'edit', changes: [{ text: 'önceki' }] }],
  };

  test('değişiklik yoksa null', () => {
    assert.equal(applyProgramEdit(stored, { currentPhaseId: uyum.id, phases: stored.phases }, ctx, simdi), null);
  });

  test('revision artar, kayıt en üste "Düzenlendi" olarak girer', () => {
    const phases = [{ ...uyum, days: [{ ...afterA, source }, B, C] }, guc];
    const result = applyProgramEdit(stored, { currentPhaseId: uyum.id, phases }, ctx, simdi);
    assert.ok(result);
    assert.equal(result.program.revision, 6);
    assert.equal(result.program.updatedAt, simdi.toISOString());
    assert.equal(result.program.log.length, 2);
    assert.deepEqual(result.program.log[0], {
      at: simdi.toISOString(),
      revision: 6,
      kind: 'edit',
      changes: [
        { scope: 'Uyum · Gün A', text: 'Goblet Squat 3×8–12 → 4×6–10' },
        { scope: 'Uyum · Gün A', text: 'Leg Press çıkarıldı' },
        { scope: 'Uyum · Gün A', text: 'Kalça Köprüsü eklendi' },
      ],
    });
    assert.equal(result.program.current, stored.current);
    assert.equal(result.program.rotation, stored.rotation);
  });

  test('yalnız şu anki evre değiştiyse "Evre geçişi": yeni başlangıç, son gün düşer', () => {
    const result = applyProgramEdit(stored, { currentPhaseId: guc.id, phases: stored.phases }, ctx, simdi);
    assert.ok(result);
    assert.equal(result.program.log[0]?.kind, 'phase');
    assert.deepEqual(result.program.current, { phaseId: guc.id, startedAt: simdi.toISOString() });
    assert.deepEqual(result.program.rotation, { lastCompletedAt: '2026-09-20T10:00:00.000Z' });
  });

  test('son gün silinince rotasyon uzlaşır', () => {
    const phases = [{ ...uyum, days: uyum.days.filter((day) => day.id !== 'd_bbbbbb') }, guc];
    const result = applyProgramEdit(stored, { currentPhaseId: uyum.id, phases }, ctx, simdi);
    assert.deepEqual(result?.program.rotation, { lastDayId: 'd_aaaaaa', lastCompletedAt: '2026-09-20T10:00:00.000Z' });
  });

  test('düzenleyici göndermediyse kayıttaki kaynak korunur', () => {
    const { source: _source, ...withoutSource } = uyum.days[0] as ProgramDay;
    const phases = [{ ...uyum, name: 'Uyum 2', days: [withoutSource, B, C] }, guc];
    const result = applyProgramEdit(stored, { currentPhaseId: uyum.id, phases }, ctx, simdi);
    assert.deepEqual(result?.program.phases[0]?.days[0]?.source, source);
    assert.deepEqual(result?.changes, [{ text: "Evre adı: 'Uyum' → 'Uyum 2'" }]);
  });

  test('65 değişiklik: geçmişte 60 (sonuncusu "… ve 6 değişiklik daha"), dönen listede 65', () => {
    const rows = Array.from({ length: 33 }, (_, index) => row(`r_x${String(index).padStart(5, '0')}`, 'leg-press', 10, 15));
    const many = gun('d_eeeeee', 'Gün D', rows.map((item, index) => single(`b_x${String(index).padStart(5, '0')}`, item)));
    const base: ProgramState = { ...stored, phases: [{ ...uyum, days: [...uyum.days, many] }, guc] };
    // 33 satırın her birinde reçete değişir, 32'sinin notu eklenir: 65 değişiklik.
    const changed = {
      ...many,
      blocks: many.blocks.map((block, index) => ({
        ...block,
        sets: 4,
        rows: block.rows.map((item) => (index < 32 ? { ...item, note: 'yavaş' } : item)),
      })),
    };
    const result = applyProgramEdit(base, { currentPhaseId: uyum.id, phases: [{ ...uyum, days: [...uyum.days, changed] }, guc] }, ctx, simdi);
    assert.ok(result);
    assert.equal(result.changes.length, 65);
    const entry = result.program.log[0];
    assert.equal(entry?.changes.length, 60);
    assert.deepEqual(entry?.changes.at(-1), { text: '… ve 6 değişiklik daha' });
  });
});

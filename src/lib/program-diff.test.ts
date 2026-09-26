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
import { applySetPreset, combineInto, dissolveGroup, setRounds, setRowSetCount, ungroupRow, type IdSource } from './template-edit.ts';
import {
  addPhase,
  blankPhase,
  derivePhased,
  mergePhases,
  moveDayToPhase,
  nextDayId,
  normalizeProgram,
  programIdSource,
  removePhase,
  type ProgramBody,
  type ProgramChange,
  type ProgramDay,
  type ProgramPhase,
  type ProgramState,
} from './program-plan.ts';
import { resizeSets, uniformSets } from './set-plan.ts';
import { roundsOf, type PlanExercise, type TemplateBlock, type TemplateRow } from './template-plan.ts';

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

/** Satır: 3 düz set, `min`–`max`. */
function row(id: string, exerciseId: string, min: number, max: number, fields: Partial<TemplateRow> = {}): TemplateRow {
  return { id, exerciseId, sets: uniformSets({ min, max }, 3), ...fields };
}

/** Tek hareket: satırın set sayısı `sets`'e çekilir. */
function single(id: string, r: TemplateRow, sets = 3, restSeconds = 120): TemplateBlock {
  return { id, kind: 'single', restSeconds, rows: [{ ...r, sets: resizeSets(r.sets, sets) }] };
}

/** Grup: her hareketin set sayısı `sets`'e (tura) çekilir. */
function group(id: string, kind: TemplateBlock['kind'], rows: TemplateRow[], sets = 3, restSeconds = 90, transitionSeconds?: number): TemplateBlock {
  return {
    id,
    kind,
    restSeconds,
    ...(transitionSeconds !== undefined ? { transitionSeconds } : {}),
    rows: rows.map((item) => ({ ...item, sets: resizeSets(item.sets, sets) })),
  };
}

const goblet = row('r_goblet', 'goblet-squat', 8, 12);
const press = row('r_press1', 'leg-press', 10, 15);
const curl = row('r_curl01', 'leg-curl', 10, 15);
const hip = row('r_hip001', 'hip-thrust', 8, 12);

function gun(id: string, name: string, blocks: TemplateBlock[], fields: Partial<ProgramDay> = {}): ProgramDay {
  return { id, name, blocks, ...fields };
}

const beforeA = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_press1', press)]);
const afterA = gun('d_aaaaaa', 'Gün A', [single('b_goblet', { ...goblet, sets: uniformSets({ min: 6, max: 10 }, 3) }, 4), single('b_hip001', hip)]);

/** Gövde: evre seçimi verilmezse eski dosyalardaki gibi evrelerden çıkarılır. */
function body(phases: ProgramPhase[], currentPhaseId = phases[0]?.id ?? '', phased = derivePhased(phases)): ProgramBody {
  return { phased, currentPhaseId, phases };
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
    const changes = diffProgram(body([evre1([beforeA])], 'p_evre01', true), body([evre1([afterA]), guc], 'p_evre01', true), ctx);
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
    const after = gun('d_aaaaaa', 'Gün A', [single('b_plank1', { ...plank, sets: uniformSets({ min: 45, max: 45 }, 3) })]);
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

  test('iki tek hareket süperset olur: setler hareketlerde kalır', () => {
    const joined = gun('d_aaaaaa', 'Gün A', combineInto(singles.blocks, 'b_curl01', 'b_goblet', kinds));
    assert.equal(roundsOf(joined.blocks[0] as TemplateBlock), 4);
    assert.deepEqual(diffDay(singles, joined, ctx), ['Yeni süperset: Goblet Squat + Leg Curl']);
  });

  test('tur değişimi (bütün hareketler aynı sayıda): yalnız grup cümlesi', () => {
    const more = gun('d_aaaaaa', 'Gün A', setRounds(superset.blocks, 'b_goblet', 4));
    assert.deepEqual(diffDay(superset, more, ctx), ['Süperset (Goblet Squat + Leg Curl): 3 → 4 tur']);
  });

  test('gruptaki bir hareketin seti azalır: yalnız o hareketin cümlesi', () => {
    const fewer = gun('d_aaaaaa', 'Gün A', setRowSetCount(superset.blocks, curl.id, 2));
    assert.deepEqual(diffDay(superset, fewer, ctx), ['Leg Curl 3×10–15 → 2×10–15']);
    const back = gun('d_aaaaaa', 'Gün A', setRounds(fewer.blocks, 'b_goblet', 4));
    assert.deepEqual(diffDay(fewer, back, ctx), ['Goblet Squat 3×8–12 → 4×8–12']);
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
    const after = gun('d_aaaaaa', 'Gün A', combineInto(before.blocks, 'b_hip001', 'b_circ01', kinds));
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
        version: 2,
        phased: false,
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

  test('fark cümleleri kırpılmaz (dosyanın sınırı yalnız appendLog\'da)', () => {
    const wide: DiffContext = { ...ctx, exercises: new Map([...ctx.exercises, ['uzun', { title: 'U'.repeat(400), trackingType: 'weight_reps' as const }]]) };
    const after = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_press1', { ...press, exerciseId: 'uzun' })]);
    const [change] = diffProgram(body([evre1([beforeA])]), body([evre1([after])]), wide);
    assert.deepEqual(change, { scope: 'Gün A', text: `Leg Press → ${'U'.repeat(400)}` });
  });

  test('uzun cümle commit gövdesinde tam; dosyadaki geçmişte 300 karakterde kesilir', () => {
    // Uzun adlı yedi gün, uzun adlı dört evreye bölünür: "Evrelere bölündü: …" 300 karakteri aşar.
    const at = '2026-09-01T00:00:00.000Z';
    const days = Array.from({ length: 7 }, (_, k) =>
      gun(`d_uzun0${k}`, `Gün ${'ABCDEFG'[k]} — alt vücut ağır`, [single(`b_uzun0${k}`, row(`r_uzun0${k}`, 'goblet-squat', 8, 12))]),
    );
    const stored: ProgramState = {
      version: 2,
      phased: false,
      revision: 3,
      createdAt: at,
      updatedAt: at,
      phases: [evre1(days)],
      current: { phaseId: 'p_evre01', startedAt: at },
      rotation: {},
      log: [],
    };
    const phases = [0, 1, 2, 3].map(
      (p): ProgramPhase => ({
        id: p === 0 ? 'p_evre01' : `p_evre0${p + 1}`,
        name: `Hipertrofi bloğu ${p + 1} (yüksek hacim)`,
        weeks: 6,
        daysPerWeek: 5,
        days: p === 0 ? days.slice(0, 4) : days.slice(3 + p, 4 + p),
      }),
    );
    const result = applyProgramEdit(stored, { phased: true, currentPhaseId: 'p_evre01', phases }, ctx, new Date('2026-09-25T09:00:00.000Z'));
    assert.ok(result);
    const split = result.changes.find((change) => change.text.startsWith('Evrelere bölündü: '));
    assert.ok(split && split.text.length > 300, String(split?.text.length));
    assert.ok(split.text.endsWith(`'Hipertrofi bloğu 4 (yüksek hacim)' (6 hafta · haftada 5 gün · Gün G — alt vücut ağır)`));
    const logged = result.program.log[0]?.changes.find((change) => change.text.startsWith('Evrelere bölündü: '));
    assert.equal(logged?.text, `${split.text.slice(0, 299)}…`);
    assert.ok(commitMessage('edit', result.changes).split('\n').includes(`- ${split.text}`));
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
    version: 2,
    phased: true,
    revision: 5,
    createdAt: at,
    updatedAt: at,
    phases: [uyum, guc],
    current: { phaseId: uyum.id, startedAt: at },
    rotation: { lastDayId: 'd_bbbbbb', lastCompletedAt: '2026-09-20T10:00:00.000Z' },
    log: [{ at, revision: 5, kind: 'edit', changes: [{ text: 'önceki' }] }],
  };

  test('değişiklik yoksa null', () => {
    assert.equal(applyProgramEdit(stored, { phased: true, currentPhaseId: uyum.id, phases: stored.phases }, ctx, simdi), null);
  });

  test('revision artar, kayıt en üste "Düzenlendi" olarak girer', () => {
    const phases = [{ ...uyum, days: [{ ...afterA, source }, B, C] }, guc];
    const result = applyProgramEdit(stored, { phased: true, currentPhaseId: uyum.id, phases }, ctx, simdi);
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
    const result = applyProgramEdit(stored, { phased: true, currentPhaseId: guc.id, phases: stored.phases }, ctx, simdi);
    assert.ok(result);
    assert.equal(result.program.log[0]?.kind, 'phase');
    assert.deepEqual(result.program.current, { phaseId: guc.id, startedAt: simdi.toISOString() });
    assert.deepEqual(result.program.rotation, { lastCompletedAt: '2026-09-20T10:00:00.000Z' });
  });

  test('son gün silinince rotasyon uzlaşır', () => {
    const phases = [{ ...uyum, days: uyum.days.filter((day) => day.id !== 'd_bbbbbb') }, guc];
    const result = applyProgramEdit(stored, { phased: true, currentPhaseId: uyum.id, phases }, ctx, simdi);
    assert.deepEqual(result?.program.rotation, { lastDayId: 'd_aaaaaa', lastCompletedAt: '2026-09-20T10:00:00.000Z' });
  });

  test('antrenman günleri: PT değiştirince yazılır, danışanın günleri silinir; göndermeyen eski sekme dokunmaz', () => {
    const clientSchedule = { weekdays: [2, 4, 6], at: '2026-09-23T10:00:00.000Z' };
    const withDays: ProgramState = { ...stored, schedule: { weekdays: [1, 3, 5] }, clientSchedule };
    const same = { phased: true, currentPhaseId: uyum.id, phases: stored.phases };
    // Eski sekme (günler yok) ve aynı günler: değişiklik yok, danışanın günleri kalır.
    assert.equal(applyProgramEdit(withDays, same, ctx, simdi), null);
    assert.equal(applyProgramEdit(withDays, { ...same, weekdays: [5, 1, 3] }, ctx, simdi), null);
    const changed = applyProgramEdit(withDays, { ...same, weekdays: [1, 4] }, ctx, simdi);
    assert.ok(changed);
    assert.deepEqual(changed.program.schedule, { weekdays: [1, 4], at: simdi.toISOString() });
    assert.equal('clientSchedule' in changed.program, false);
    assert.equal(changed.program.revision, 6);
    assert.deepEqual(texts(changed.changes), ['Antrenman günleri: Pzt, Çar, Cum → Pzt, Per', 'Danışanın günleri kaldırıldı (Sal, Per, Cmt)']);
    // Başka bir değişiklikle kaydedilen program danışanın günlerini korur.
    const renamed = applyProgramEdit(withDays, { ...same, phases: [{ ...uyum, name: 'Uyum 2' }, guc] }, ctx, simdi);
    assert.deepEqual(renamed?.program.clientSchedule, clientSchedule);
    assert.deepEqual(renamed?.program.schedule, { weekdays: [1, 3, 5] });
    // Günler kaldırılabilir.
    const cleared = applyProgramEdit(withDays, { ...same, weekdays: [] }, ctx, simdi);
    assert.equal(cleared && 'schedule' in cleared.program, false);
  });

  test('düzenleyici göndermediyse kayıttaki kaynak korunur', () => {
    const { source: _source, ...withoutSource } = uyum.days[0] as ProgramDay;
    const phases = [{ ...uyum, name: 'Uyum 2', days: [withoutSource, B, C] }, guc];
    const result = applyProgramEdit(stored, { phased: true, currentPhaseId: uyum.id, phases }, ctx, simdi);
    assert.deepEqual(result?.program.phases[0]?.days[0]?.source, source);
    assert.deepEqual(result?.changes, [{ text: "Evre adı: 'Uyum' → 'Uyum 2'" }]);
  });

  test('65 değişiklik: geçmişte 60 (sonuncusu "… ve 6 değişiklik daha"), dönen listede 65', () => {
    const rows = Array.from({ length: 33 }, (_, index) => row(`r_x${String(index).padStart(5, '0')}`, 'leg-press', 10, 15));
    const many = gun('d_eeeeee', 'Gün D', rows.map((item, index) => single(`b_x${String(index).padStart(5, '0')}`, item)));
    const base: ProgramState = { ...stored, phases: [{ ...uyum, days: [...uyum.days, many] }, guc] };
    // 33 satırın her birinde set sayısı değişir, 32'sinin notu eklenir: 65 değişiklik.
    const counted = many.blocks.reduce((blocks, block) => setRowSetCount(blocks, block.rows[0]?.id ?? '', 4), many.blocks);
    const changed = {
      ...many,
      blocks: counted.map((block, index) => ({
        ...block,
        rows: block.rows.map((item) => (index < 32 ? { ...item, note: 'yavaş' } : item)),
      })),
    };
    const result = applyProgramEdit(
      base,
      { phased: true, currentPhaseId: uyum.id, phases: [{ ...uyum, days: [...uyum.days, changed] }, guc] },
      ctx,
      simdi,
    );
    assert.ok(result);
    assert.equal(result.changes.length, 65);
    const entry = result.program.log[0];
    assert.equal(entry?.changes.length, 60);
    assert.deepEqual(entry?.changes.at(-1), { text: '… ve 6 değişiklik daha' });
  });
});

describe('set başına hedef', () => {
  const day = (blocks: TemplateBlock[]) => gun('d_aaaaaa', 'Gün A', blocks);
  const before = day([single('b_goblet', goblet), single('b_press1', press)]);

  test('piramit', () => {
    const after = day(applySetPreset(before.blocks, goblet.id, 'pyramid'));
    assert.deepEqual(diffDay(before, after, ctx), ['Goblet Squat 3×8–12 → 12/10/8 (piramit %80/%90/%100)']);
  });

  test('piramitte yalnız yüzdeler değişince kayıt düşmez', () => {
    const pyramid = (low: number, mid: number) =>
      day([
        single('b_goblet', {
          ...goblet,
          sets: [
            { min: 12, max: 12, loadPct: low },
            { min: 10, max: 10, loadPct: mid },
            { min: 8, max: 8 },
          ],
        }),
        single('b_press1', press),
      ]);
    const old = pyramid(80, 90);
    const next = pyramid(70, 85);
    assert.deepEqual(diffDay(old, next, ctx), ['Goblet Squat 12/10/8 (piramit %80/%90/%100) → 12/10/8 (piramit %70/%85/%100)']);

    const at = '2026-09-01T00:00:00.000Z';
    const stored: ProgramState = {
      version: 2,
      phased: false,
      revision: 1,
      createdAt: at,
      updatedAt: at,
      phases: [evre1([old])],
      current: { phaseId: 'p_evre01', startedAt: at },
      rotation: {},
      log: [],
    };
    assert.notEqual(applyProgramEdit(stored, body([evre1([next])]), ctx, new Date('2026-09-24T09:00:00.000Z')), null);
  });

  test('son set AMRAP açılır ve kapanır', () => {
    const after = day(applySetPreset(before.blocks, press.id, 'lastAmrap'));
    assert.deepEqual(diffDay(before, after, ctx), ['Leg Press: son set AMRAP']);
    assert.deepEqual(diffDay(after, before, ctx), ['Leg Press: son set AMRAP kaldırıldı']);
  });

  test('AMRAP başka setlerde ya da hepsinde', () => {
    const all = day([single('b_goblet', goblet), single('b_press1', { ...press, sets: press.sets.map((set) => ({ ...set, amrap: true })) })]);
    assert.deepEqual(diffDay(before, all, ctx), ['Leg Press: bütün setler AMRAP']);
    assert.deepEqual(diffDay(all, before, ctx), ['Leg Press: AMRAP kaldırıldı']);
    const some = day([
      single('b_goblet', goblet),
      single('b_press1', { ...press, sets: press.sets.map((set, index) => (index > 0 ? { ...set, amrap: true } : set)) }),
    ]);
    assert.deepEqual(diffDay(before, some, ctx), ['Leg Press: AMRAP 2., 3. set']);
  });

  test('back-off yüzdesi değişir', () => {
    const backoff = (pct: number) =>
      day([single('b_goblet', { ...goblet, sets: [{ min: 8, max: 12 }, { min: 8, max: 12, loadPct: pct }] }, 2), single('b_press1', press)]);
    assert.deepEqual(diffDay(backoff(85), backoff(80), ctx), ['Goblet Squat 8–12/8–12 (back-off %85) → 8–12/8–12 (back-off %80)']);
  });
});

describe('sıklık ve evreler', () => {
  const B = gun('d_bbbbbb', 'Gün B', [single('b_bbbbbb', row('r_bbbbbb', 'leg-curl', 10, 15))]);
  const C = gun('d_cccccc', 'Gün C', [single('b_cccccc', row('r_cccccc', 'plank', 30, 60))]);
  const D = gun('d_dddddd', 'Gün A', [single('b_dddddd', row('r_dddddd', 'hip-thrust', 8, 12))]);
  const liste = (fields: Partial<ProgramPhase> = {}) => evre1([beforeA, B, C], fields);

  test('evresiz programın sıklığı', () => {
    const at = (daysPerWeek?: number) => body([liste(daysPerWeek === undefined ? {} : { daysPerWeek })]);
    assert.deepEqual(texts(diffProgram(at(2), at(3), ctx)), ['Haftada 2 → 3 gün']);
    assert.deepEqual(texts(diffProgram(at(), at(3), ctx)), ['Sıklık: haftada 3 gün']);
    assert.deepEqual(texts(diffProgram(at(3), at(), ctx)), ['Sıklık kaldırıldı (önce haftada 3 gün)']);
  });

  test('evrenin sıklığı', () => {
    const guc: ProgramPhase = { id: 'p_guc001', name: 'Güç', daysPerWeek: 2, days: [D] };
    const before = body([liste({ weeks: 2 }), guc]);
    assert.deepEqual(texts(diffProgram(before, body([liste({ weeks: 2 }), { ...guc, daysPerWeek: 3 }]), ctx)), ["'Güç': haftada 2 → 3 gün"]);
    assert.deepEqual(texts(diffProgram(before, body([liste({ weeks: 2 }), { ...guc, daysPerWeek: undefined }]), ctx)), [
      "'Güç' sıklığı kaldırıldı (önce haftada 2 gün)",
    ]);
    const kuvvet: ProgramPhase = { id: 'p_kuvvet', name: 'Kuvvet', weeks: 6, daysPerWeek: 3, days: [gun('d_eeeeee', 'Gün A', [single('b_eeeeee', row('r_eeeeee', 'plank', 30, 60))])] };
    assert.deepEqual(texts(diffProgram(before, body([liste({ weeks: 2 }), guc, kuvvet]), ctx)), [
      "Evre 'Kuvvet' eklendi (6 hafta · haftada 3 gün)",
    ]);
  });

  const unphased = body([liste({ daysPerWeek: 3 })]);
  const split = (currentPhaseId = 'p_evre01') =>
    body(
      [
        { id: 'p_evre01', name: 'Uyum', weeks: 2, daysPerWeek: 3, days: [beforeA, B] },
        { id: 'p_guc001', name: 'Güç', weeks: 6, daysPerWeek: 3, days: [C] },
      ],
      currentPhaseId,
      true,
    );

  test('evrelere bölme tek cümle', () => {
    assert.deepEqual(texts(diffProgram(unphased, split(), ctx)), [
      "Evrelere bölündü: 'Uyum' (2 hafta · haftada 3 gün · Gün A, Gün B), 'Güç' (6 hafta · haftada 3 gün · Gün C)",
    ]);
  });

  test('bölerken şu anki evre değişirse söylenir', () => {
    assert.deepEqual(texts(diffProgram(unphased, split('p_guc001'), ctx)).at(-1), "Şu anki evre: 'Güç'");
  });

  test('tek süresiz evreyle bölmek de yazılır', () => {
    assert.deepEqual(texts(diffProgram(body([liste()], 'p_evre01', false), body([liste()], 'p_evre01', true), ctx)), [
      "Evrelere bölündü: 'Evre 1' (Gün A, Gün B, Gün C)",
    ]);
  });

  const uyum: ProgramPhase = { id: 'p_uyum01', name: 'Uyum', weeks: 2, daysPerWeek: 2, days: [beforeA, B] };
  const guc: ProgramPhase = { id: 'p_guc001', name: 'Güç', weeks: 6, daysPerWeek: 3, days: [D, C] };

  test('evreleri kaldırma: yeniden adlanan gün ve tek cümle', () => {
    const merged = mergePhases([uyum, guc], guc.id).phases;
    assert.deepEqual(texts(diffProgram(body([uyum, guc], guc.id), body(merged, guc.id, false), ctx)), [
      "Gün adı: 'Gün A' → 'Gün A 2'",
      'Evreler kaldırıldı; günler tek listede: Gün A, Gün B, Gün A 2, Gün C',
    ]);
  });

  test('gün başka evreye taşınır', () => {
    const moved = moveDayToPhase([uyum, { ...guc, days: [D] }], B.id, guc.id);
    assert.deepEqual(texts(diffProgram(body([uyum, { ...guc, days: [D] }]), body(moved), ctx)), ["Gün B → 'Güç' evresine taşındı"]);
  });

  test('yalnız evreleri kaldıran kayıt "Düzenlendi"; rotasyon sürer', () => {
    const at = '2026-09-01T00:00:00.000Z';
    const stored: ProgramState = {
      version: 2,
      phased: true,
      revision: 4,
      createdAt: at,
      updatedAt: at,
      phases: [uyum, guc],
      current: { phaseId: guc.id, startedAt: at },
      rotation: { lastDayId: D.id, lastCompletedAt: at },
      log: [],
    };
    const merged = mergePhases(stored.phases, guc.id).phases;
    const result = applyProgramEdit(stored, { phased: false, currentPhaseId: guc.id, phases: merged }, ctx, new Date('2026-09-24T09:00:00.000Z'));
    assert.ok(result);
    assert.equal(result.program.phased, false);
    assert.equal(result.program.log[0]?.kind, 'edit');
    assert.deepEqual(result.program.rotation, stored.rotation);
    assert.equal(result.program.current, stored.current);
  });
});

describe('evresiz program: gizli evre', () => {
  const at = '2026-09-01T00:00:00.000Z';
  const simdi = new Date('2026-09-25T09:00:00.000Z');
  const B = gun('d_bbbbbb', 'Gün B', [single('b_bbbbbb', row('r_bbbbbb', 'leg-curl', 10, 15))]);
  const C = gun('d_cccccc', 'Gün C', [single('b_cccccc', row('r_cccccc', 'plank', 30, 60))]);
  const kayitli = (name = 'Evre 1'): ProgramState => ({
    version: 2,
    phased: false,
    revision: 3,
    createdAt: at,
    updatedAt: at,
    phases: [evre1([beforeA, B, C], { name, daysPerWeek: 3 })],
    current: { phaseId: 'p_evre01', startedAt: at },
    rotation: { lastDayId: 'd_aaaaaa', lastCompletedAt: '2026-09-20T10:00:00.000Z' },
    log: [],
  });

  test('böl → evre ekle → şu anki yap → kaldır: fark gün düzeyinde, evreden söz etmez; rotasyon sürer', () => {
    // Tek oturumda: A ve B yeni evreye taşınır, yeni evre şu anki olur, eski evre (C ile) silinir,
    // evreler kaldırılır. Kayıt da gövde de evresiz; yalnız gizli evrenin kimliği değişti.
    const stored = kayitli();
    let phases = stored.phases;
    const created = blankPhase(phases, programIdSource(phases));
    phases = addPhase(phases, created);
    for (const id of ['d_aaaaaa', 'd_bbbbbb']) phases = moveDayToPhase(phases, id, created.id);
    phases = removePhase(phases, 'p_evre01', created.id);
    const merged = mergePhases(phases, created.id).phases;
    assert.notEqual(merged[0]?.id, 'p_evre01');

    const result = applyProgramEdit(stored, { phased: false, currentPhaseId: created.id, phases: merged }, ctx, simdi);
    assert.ok(result);
    assert.deepEqual(result.changes, [{ text: 'Gün C silindi' }]);
    assert.equal(result.program.log[0]?.kind, 'edit');
    assert.deepEqual(
      result.program.phases.map((phase) => [phase.id, phase.name, phase.days.map((day) => day.id)]),
      [['p_evre01', 'Evre 1', ['d_aaaaaa', 'd_bbbbbb']]],
    );
    // Şu anki evre ve rotasyon aynı: sıradaki gün B kalır (A'ya dönmez).
    assert.equal(result.program.current, stored.current);
    assert.deepEqual(result.program.rotation, stored.rotation);
    assert.equal(nextDayId(result.program), 'd_bbbbbb');
  });

  test('gizli evrenin adı (eski dosyada "Uyum") böl → kaldır ile değişse de geçmişe evre cümlesi düşmez', () => {
    const stored = kayitli('Uyum');
    const merged = mergePhases(stored.phases, 'p_evre01').phases;
    assert.equal(merged[0]?.name, 'Evre 1');
    assert.equal(applyProgramEdit(stored, { phased: false, currentPhaseId: 'p_evre01', phases: merged }, ctx, simdi), null);
  });
});

describe('egzersizin varsayılanına eşit kural ve cihaz', () => {
  // Satırda danışana özel kural (Doğrusal · 1) ve cihaz (Smith) var; PT sonra kütüphanede
  // egzersizin kendisini Doğrusal · 1 ve Smith yaptı. Program danışana özeldir: seçim kalır.
  // Yeni gelen eşit değer ise (seçicide gösterilen varsayılanı yeniden seçmek) PT'nin kararı sayılmaz.
  const at = '2026-09-01T00:00:00.000Z';
  const simdi = new Date('2026-09-25T09:00:00.000Z');
  const ozel: TemplateRow = { ...goblet, rule: { scheme: 'linear', targetRir: 1 }, deviceId: 'smith' };
  const stored: ProgramState = {
    version: 2,
    phased: false,
    revision: 4,
    createdAt: at,
    updatedAt: at,
    phases: [evre1([gun('d_aaaaaa', 'Gün A', [single('b_goblet', ozel), single('b_press1', press)])])],
    current: { phaseId: 'p_evre01', startedAt: at },
    rotation: {},
    log: [],
  };
  const library = {
    exercises: new Map<string, PlanExercise>([
      [
        'goblet-squat',
        {
          id: 'goblet-squat',
          title: 'Goblet Squat',
          category: 'compound',
          trackingType: 'weight_reps',
          equipment: 'dumbbell',
          deviceId: 'smith',
          progression: { scheme: 'linear', targetRir: 1, targetMin: 8, targetMax: 12 },
          primaryMuscles: ['quadriceps'],
          secondaryMuscles: [],
        },
      ],
      ['leg-press', { id: 'leg-press', title: 'Leg Press', category: 'compound', trackingType: 'weight_reps', equipment: 'machine', primaryMuscles: ['quadriceps'], secondaryMuscles: [] }],
    ]),
    deviceIds: new Set(['smith']),
  };
  /** Sunucunun kaydı (`saveProgram`): gövde kayıttaki programa göre normalleştirilir, sonra farkı yazılır. */
  const save = (phases: ProgramPhase[], from: ProgramState = stored) => {
    const normalized = normalizeProgram({ phased: false, phases }, library, from);
    assert.deepEqual(normalized.errors, {});
    return applyProgramEdit(from, { phased: false, currentPhaseId: 'p_evre01', phases: normalized.phases }, ctx, simdi);
  };
  const gunA = (...rows: TemplateRow[]) => [evre1([gun('d_aaaaaa', 'Gün A', [single('b_goblet', rows[0] ?? goblet), single('b_press1', rows[1] ?? press)])])];

  test('dokunulmamış gövde: değişiklik yok, geçmişe kayıt yok, revision artmaz', () => {
    assert.equal(save(stored.phases), null);
  });

  test('ilgisiz değişiklikte danışana özel kural ve cihaz korunur; "…döndü" yazılmaz', () => {
    const noted = [evre1([gun('d_aaaaaa', 'Gün A', [single('b_goblet', ozel), single('b_press1', { ...press, note: 'yavaş' })])])];
    const result = save(noted);
    assert.ok(result);
    assert.deepEqual(result.changes, [{ scope: 'Gün A', text: 'Leg Press notu: “yavaş”' }]);
    assert.equal(result.program.revision, 5);
    const row = result.program.phases[0]?.days[0]?.blocks[0]?.rows[0];
    assert.deepEqual(row?.rule, { scheme: 'linear', targetRir: 1 });
    assert.equal(row?.deviceId, 'smith');
  });

  test('seçicide gösterilen varsayılanı yeniden seçmek (kayıtta kural yok) değişiklik değildir; kayıttaki eşit seçim yine korunur', () => {
    // Leg Press satırında kural yok (egzersizinki Çift ilerleme · 2). Seçici etkin kuralı gösterir; gösterileni yeniden
    // seçmek satıra egzersizinkine eşit kural yazar (Base UI `Select` aynı değerde de `onValueChange` çağırır).
    const reselected = gunA(ozel, { ...press, rule: { scheme: 'double', targetRir: 2 } });
    const normalized = normalizeProgram({ phased: false, phases: reselected }, library, stored);
    const [kept, fresh] = normalized.phases[0]?.days[0]?.blocks.flatMap((block) => block.rows) ?? [];
    assert.equal('rule' in (fresh ?? {}), false);
    assert.deepEqual(kept?.rule, { scheme: 'linear', targetRir: 1 });
    assert.equal(kept?.deviceId, 'smith');
    // Değişiklik yok: kayıt yazılmaz, revision aynı kalır (4), geçmişe bir şey girmez.
    assert.equal(save(reselected), null);
  });

  test('kuralsız ve cihazsız satırda egzersizinkine eşit kural ve cihaz yeni gelirse yazılmaz', () => {
    const plain: ProgramState = { ...stored, phases: gunA(goblet) };
    const reselected = gunA({ ...goblet, rule: { scheme: 'linear', targetRir: 1 }, deviceId: 'smith' });
    const row = normalizeProgram({ phased: false, phases: reselected }, library, plain).phases[0]?.days[0]?.blocks[0]?.rows[0];
    assert.equal('rule' in (row ?? {}), false);
    assert.equal('deviceId' in (row ?? {}), false);
    assert.equal(save(reselected, plain), null);
  });

  test('özel kuraldan seçicilerle varsayılana dönmek "egzersizin kuralına döndü" yazar; satır sabitlenmez', () => {
    const custom: ProgramState = { ...stored, phases: gunA({ ...goblet, rule: { scheme: 'double', targetRir: 2 } }) };
    const result = save(gunA({ ...goblet, rule: { scheme: 'linear', targetRir: 1 } }), custom);
    assert.ok(result);
    assert.deepEqual(result.changes, [{ scope: 'Gün A', text: 'Goblet Squat egzersizin kuralına döndü' }]);
    assert.equal('rule' in (result.program.phases[0]?.days[0]?.blocks[0]?.rows[0] ?? {}), false);
  });
});

describe('danışanın hedefleri: PT kazanır', () => {
  const at = '2026-09-01T00:00:00.000Z';
  const simdi = new Date('2026-09-26T09:00:00.000Z');
  const day = gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_press1', press)]);
  const target = { sets: uniformSets({ min: 10, max: 14 }, 3), baseSets: uniformSets({ min: 8, max: 12 }, 3), sessionId: 's_k2m9x4qa', at };
  const stored: ProgramState = {
    version: 2,
    phased: false,
    revision: 3,
    createdAt: at,
    updatedAt: at,
    phases: [evre1([day])],
    current: { phaseId: 'p_evre01', startedAt: at },
    rotation: {},
    clientTargets: { r_goblet: target },
    log: [],
  };

  test('başka bir şey değişince hedef korunur (sessizce silinmez)', () => {
    const phases = [evre1([gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_press1', press, 4)])])];
    const result = applyProgramEdit(stored, body(phases, 'p_evre01', false), ctx, simdi);
    assert.ok(result);
    assert.deepEqual(result.program.clientTargets, { r_goblet: target });
    assert.deepEqual(texts(result.changes), ['Leg Press 3×10–15 → 4×10–15']);
  });

  test('PT satırın setlerini değiştirdi: hedef silinir, kayda yazılır', () => {
    const phases = [evre1([gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet, 4), single('b_press1', press)])])];
    const result = applyProgramEdit(stored, body(phases, 'p_evre01', false), ctx, simdi);
    assert.ok(result);
    assert.equal(result.program.clientTargets, undefined);
    assert.deepEqual(result.program.log[0]?.changes, [
      { scope: 'Gün A', text: 'Goblet Squat 3×8–12 → 4×8–12' },
      { scope: 'Gün A', text: 'Goblet Squat: danışanın hedefi (10–14) kaldırıldı' },
    ]);
  });

  test('PT danışanın hedefini aldı: "programa alındı"; değişiklik yoksa hiçbir şey yazılmaz', () => {
    const adopted = [evre1([gun('d_aaaaaa', 'Gün A', [single('b_goblet', { ...goblet, sets: uniformSets({ min: 10, max: 14 }, 3) }), single('b_press1', press)])])];
    const result = applyProgramEdit(stored, body(adopted, 'p_evre01', false), ctx, simdi);
    assert.ok(result);
    assert.equal(result.program.clientTargets, undefined);
    assert.deepEqual(texts(result.changes), ['Goblet Squat 3×8–12 → 3×10–14', 'Goblet Squat: danışanın hedefi programa alındı']);
    assert.equal(applyProgramEdit(stored, body(stored.phases, 'p_evre01', false), ctx, simdi), null);
  });

  test('onaylanan önerinin notu kaydın sonuna', () => {
    const phases = [evre1([gun('d_aaaaaa', 'Gün A', [single('b_goblet', goblet), single('b_press1', press, 4)])])];
    const result = applyProgramEdit(stored, body(phases, 'p_evre01', false), ctx, simdi, [{ text: 'Danışanın önerisi: Leg Press 3 → 4 set' }]);
    assert.deepEqual(texts(result?.program.log[0]?.changes ?? []), ['Leg Press 3×10–15 → 4×10–15', 'Danışanın önerisi: Leg Press 3 → 4 set']);
  });
});

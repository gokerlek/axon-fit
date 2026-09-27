import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import {
  careCounts,
  careGroup,
  careInputOf,
  careMap,
  careRank,
  careStampOf,
  careSummary,
  editorCareOf,
  contextFor,
  evaluateCare,
  optionCareText,
  orderByCare,
  programConflicts,
  rowCareOf,
  rowCareText,
  type CareInput,
} from './constraint-filter.ts';
import { addConstraint, addOverride, clearConstraint, constraintsOf, reportConstraint, type ConstraintInput } from './constraints.ts';
import type { HealthRecord } from './schemas/health.ts';
import type { Program } from './schemas/program.ts';

const NOW = '2026-09-27T10:00:00.000Z';
const TODAY = '2026-09-27';
const byId = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));
const ex = (id: string) => {
  const exercise = byId.get(id);
  if (!exercise) throw new Error(id);
  return exercise;
};

function record(inputs: (Partial<ConstraintInput> & Pick<ConstraintInput, 'region' | 'avoid'>)[]): HealthRecord {
  let result: HealthRecord = { version: 2, checkIns: [], measurements: [] };
  inputs.forEach((input, index) => {
    result = addConstraint(result, { type: 'injury', ...input }, { id: `k_${String(index).padStart(6, '0')}`, now: NOW });
  });
  return result;
}

const input = (health: HealthRecord, painConsent = false): CareInput => careInputOf(health, { today: TODAY, painConsent });

describe('kaçınmalar', () => {
  const kneeDeep = input(record([{ region: 'knee', side: 'left', avoid: ['deep_knee_flexion'] }]));

  test('etiketli harekette yaptırma; pencereyi geçmeyen uygun', () => {
    assert.equal(evaluateCare(ex('hack-squat'), kneeDeep).decision, 'block');
    assert.equal(evaluateCare(ex('hack-squat'), kneeDeep).reasons[0]?.message, 'Sol diz: derin diz bükme (90° üstü)');
    assert.equal(careGroup(evaluateCare(ex('goblet-box-squat'), kneeDeep)), 'clear');
  });

  test('etiket eksikse ailedeyse dikkat (kalıp yedeği), değilse eksik bilgi; hiçbir zaman uygun değil', () => {
    const untaggedSquat = { id: 'pt-squat', pattern: 'squat' as const, primaryMuscles: ['quadriceps'], secondaryMuscles: [] };
    const result = evaluateCare(untaggedSquat, kneeDeep);
    assert.equal(result.decision, 'warn');
    assert.equal(result.reasons[0]?.kind, 'fallback');
    assert.match(result.reasons[0]?.message ?? '', /etiket eksik; derin diz bükme/);
    // Ailesi dışında, pencere etiketi yok ama ön bacak çalışıyor: bilinmiyor.
    const deadlift = evaluateCare(ex('deadlift'), kneeDeep);
    assert.deepEqual([deadlift.decision, careGroup(deadlift)], [null, 'unassessed']);
  });

  test('omuz "kol baş üstünde": Barfiks ve omuz pressleri yasak, landmine uygun', () => {
    const shoulder = input(record([{ region: 'shoulder', side: 'right', avoid: ['overhead'] }]));
    for (const id of ['barfiks', 'oturarak-dambil-omuz-press', 'makine-omuz-press', 'ayakta-halter-omuz-press']) {
      assert.equal(evaluateCare(ex(id), shoulder).decision, 'block', id);
    }
    assert.equal(careGroup(evaluateCare(ex('landmine-press'), shoulder)), 'clear');
  });

  test('öne eğilme menteşeye dikkattir, yasak değil', () => {
    const back = input(record([{ region: 'lower_back', avoid: ['forward_bend'] }]));
    assert.equal(evaluateCare(ex('deadlift'), back).decision, 'warn');
    assert.equal(evaluateCare(ex('goblet-squat'), back).decision, null);
  });
});

describe('kırmızı bayrak, bekleyen bildirim, izin', () => {
  test('görüşü alınmamış kırmızı bayrak: bölgeyi çalıştıran harekete en az dikkat', () => {
    const acl = record([{ region: 'knee', side: 'left', avoid: [], conditionId: 'meniscus_repair_postop', diagnosisSource: 'clinician' }]);
    const care = input(acl);
    const squat = evaluateCare(ex('goblet-squat'), care);
    assert.equal(squat.decision, 'warn');
    assert.equal(squat.reasons.some((reason) => reason.kind === 'referral'), true);
    assert.equal(evaluateCare(ex('halter-biceps-curl'), care).decision, null);
    // Görüş alınınca dikkat kalkar.
    const cleared = clearConstraint(acl, 'k_000000', { now: NOW, date: TODAY, basis: 'written_report' });
    assert.equal(evaluateCare(ex('goblet-squat'), input(cleared)).decision, null);
  });

  test('bel ve boyunda eksenel yükle; öteki bölgelerde dikkat yok', () => {
    const back = input(record([{ region: 'lower_back', avoid: [], conditionId: 'lumbar_disc_herniation_with_radiculopathy', diagnosisSource: 'clinician' }]));
    assert.equal(evaluateCare(ex('halter-back-squat'), back).reasons.some((reason) => reason.kind === 'referral'), true);
    assert.equal(evaluateCare(ex('halter-hip-thrust'), back).reasons.some((reason) => reason.kind === 'referral'), false);
  });

  test('bekleyen bildirim: yalnız zorlayanlar, yalnız dikkat; zorlayan yoksa hiçbir şey', () => {
    let health: HealthRecord = { version: 2, checkIns: [], measurements: [] };
    health = reportConstraint(health, { region: 'knee', side: 'left', type: 'injury', severity: 'severe', triggers: ['squat'] }, { id: 'k_rrrrrr', now: NOW, today: TODAY });
    const care = input(health);
    const hack = evaluateCare(ex('hack-squat'), care);
    assert.deepEqual([hack.decision, hack.reasons[0]?.kind], ['warn', 'report']);
    assert.equal(evaluateCare(ex('leg-extension'), care).decision, null);
    const silent = reportConstraint({ version: 2, checkIns: [], measurements: [] }, { region: 'knee', side: 'left', type: 'injury', severity: 'severe', triggers: [] }, { id: 'k_ssssss', now: NOW, today: TODAY });
    assert.equal(evaluateCare(ex('hack-squat'), input(silent)).decision, null);
  });

  test('izin o kısıtın bulgularını susturur; kırmızı bayrakta görüş yoksa susturmaz', () => {
    let health = record([{ region: 'knee', side: 'left', avoid: ['deep_knee_flexion'] }]);
    health = addOverride(health, { exerciseId: 'hack-squat', source: 'k_000000' }, { now: NOW, title: 'Hack Squat' });
    const result = evaluateCare(ex('hack-squat'), input(health));
    assert.deepEqual([result.decision, result.silenced.length, result.blockedBy], [null, 1, []]);
    // Görüşü alınmamış kırmızı bayrağın izni kayıtta olsa da işlemez (el ile yazılmış dosya).
    const flagged = record([{ region: 'knee', side: 'left', avoid: ['deep_knee_flexion'], conditionId: 'acl_reconstruction_early', diagnosisSource: 'clinician' }]);
    const forced: HealthRecord = { ...flagged, overrides: [{ exerciseId: 'hack-squat', source: 'k_000000', at: NOW }] };
    const blocked = evaluateCare(ex('hack-squat'), input(forced));
    assert.deepEqual([blocked.decision, blocked.blockedBy, blocked.overridableBy], ['block', ['k_000000'], []]);
  });

  test('kısıt başına bağlam: ameliyat haftası kısıtın kendi tarihinden', () => {
    const health = record([{ region: 'knee', side: 'left', avoid: [], conditionId: 'acl_reconstruction_early', diagnosisSource: 'clinician', details: { surgeryDate: '2026-09-06' } }]);
    const constraint = constraintsOf(health)[0]!;
    assert.equal(contextFor(constraint, { today: TODAY }).weeksPostOp, 3);
    // 4. haftadan önce açık zincir diz açma yasak.
    assert.equal(evaluateCare(ex('leg-extension'), input(health)).decision, 'block');
  });

  test('semptom yönü yalnız ağrı takibi onaylıysa', () => {
    const health: HealthRecord = {
      ...record([{ region: 'lower_back', avoid: [] }]),
      checkIns: [
        { date: '2026-09-20', symptomDirection: 'stable' },
        { date: '2026-09-25', symptomDirection: 'peripheralizing' },
      ],
    };
    assert.equal(input(health, true).symptomDirection, 'peripheralizing');
    assert.equal(input(health, false).symptomDirection, undefined);
  });
});

describe('sıra ve danışanın notu', () => {
  test('Değiştir sırası: uygun → ipucu → dikkat → eksik bilgi → kontrol edilmedi; yasak çıkar', () => {
    const results = {
      clear: { decision: null, untagged: false, unassessed: 0 },
      cue: { decision: 'cue' as const, untagged: false, unassessed: 0 },
      warn: { decision: 'warn' as const, untagged: false, unassessed: 0 },
      unknown: { decision: null, untagged: false, unassessed: 2 },
      untagged: { decision: null, untagged: true, unassessed: 0 },
      block: { decision: 'block' as const, untagged: false, unassessed: 0 },
    };
    assert.deepEqual(Object.values(results).map(careRank), [0, 1, 2, 3, 4, 5]);
    const full = (key: keyof typeof results) => ({ ...results[key], reasons: [], silenced: [], blockedBy: [], overridableBy: [] });
    const ordered = orderByCare(['untagged', 'block', 'warn', 'clear', 'unknown', 'cue'] as const, (key) => full(key));
    assert.deepEqual(ordered.items, ['clear', 'cue', 'warn', 'unknown', 'untagged']);
    assert.deepEqual([ordered.changed, ordered.anyClear], [true, true]);
    const same = orderByCare(['clear', 'warn'] as const, (key) => full(key));
    assert.equal(same.changed, false);
    assert.equal(orderByCare(['warn'] as const, (key) => full(key)).anyClear, false);
  });

  test('kart notu: izinsiz yasak "Değiştir"i söyler; dikkat PT\'nin notuyla; bildirim ve görüş kendi metniyle', () => {
    const health = record([{ region: 'knee', side: 'left', avoid: ['deep_knee_flexion'], clientNote: 'Derine inme.' }]);
    const care = input(health);
    const blocked = rowCareOf(evaluateCare(ex('hack-squat'), care), care)!;
    assert.deepEqual([blocked.kind, blocked.label], ['avoid', 'Sol diz']);
    assert.equal(rowCareText(blocked).text, "Antrenörün bu hareketi sol dizin için değiştirecek. Bugün 'Değiştir'den bir muadil seç.");
    const permitted = addOverride(health, { exerciseId: 'hack-squat', source: 'k_000000' }, { now: NOW, title: 'Hack Squat' });
    const note = rowCareOf(evaluateCare(ex('hack-squat'), input(permitted)), input(permitted))!;
    assert.deepEqual([note.kind, rowCareText(note).text], ['note', 'Derine inme.']);
    assert.equal(rowCareOf(evaluateCare(ex('halter-biceps-curl'), care), care), null);
    assert.equal(
      rowCareText({ kind: 'note', label: 'Sağ omuz', region: 'shoulder', side: 'right' }).text,
      "Antrenörün bu hareketi sağ omzunu düşünerek planladı. Ağrısız aralıkta kal; ağrı artarsa hareketi geç ya da Değiştir'e dokun.",
    );
    assert.equal(rowCareText({ kind: 'report', label: 'Sol diz', region: 'knee', side: 'left' }).text, 'Bildirdiğin sol diz için zorlayabilir; ağrı yaparsa geç.');
  });

  test('muadilin kısa satırı', () => {
    const care = input(record([{ region: 'lower_back', avoid: ['forward_bend'] }]));
    assert.equal(optionCareText(evaluateCare(ex('romanian-deadlift'), care)), 'Bel için dikkatli');
  });
});

describe('PT: sheet ve çelişkiler', () => {
  test('sheet haritası yalnız uygun olmayanları taşır; izin verilemeyen yasak kilitli', () => {
    const health = record([
      { region: 'knee', side: 'left', avoid: ['deep_knee_flexion'] },
      { region: 'lower_back', avoid: ['high_axial_load'], conditionId: 'lumbar_disc_herniation_with_radiculopathy', diagnosisSource: 'clinician' },
    ]);
    const map = careMap(EXERCISE_LIBRARY, input(health));
    assert.equal(map['hack-squat']?.group, 'blocked');
    assert.deepEqual(map['hack-squat']?.overridable, [{ id: 'k_000000', label: 'Sol diz' }]);
    assert.equal(map['halter-back-squat']?.locked, true);
    // Uygun hareket haritada yok; etiketsiz hareket "kontrol edilmedi" rozetiyle var.
    assert.equal(map.plank, undefined);
    assert.equal(map['halter-biceps-curl']?.group, 'untagged');
  });

  test('düzenleyicinin kısıt bilgisi ve listenin özeti aynı kümeler; damga kısıt değişince değişir', () => {
    const health = record([{ region: 'knee', side: 'left', avoid: ['deep_knee_flexion'] }]);
    const editor = editorCareOf('c_testolcm', EXERCISE_LIBRARY, input(health));
    assert.deepEqual([editor.summary, editor.pending], [['Sol diz'], []]);
    const summary = careSummary(EXERCISE_LIBRARY, editor.map);
    const direct = careCounts(EXERCISE_LIBRARY, input(health));
    assert.deepEqual(summary.counts, direct);
    assert.equal(summary.groups.get('hack-squat'), 'blocked');
    assert.equal(summary.cards.get('hack-squat')?.message, 'Sol diz: derin diz bükme (90° üstü)');
    const stamp = careStampOf(health);
    assert.match(stamp, /^\|k1\./);
    assert.equal(careStampOf(null), '');
    const edited = addOverride(health, { exerciseId: 'hack-squat', source: 'k_000000' }, { now: NOW, title: 'Hack Squat' });
    assert.notEqual(careStampOf(edited), stamp);
  });

  test('programdaki çelişkiler: şu anki evre, sıradaki gün işaretli', () => {
    const program = {
      phases: [
        {
          id: 'p_aaaaaa',
          name: 'Uyum',
          days: [
            { id: 'd_aaaaaa', name: 'Gün A', blocks: [{ id: 'b_aaaaaa', kind: 'single', rows: [{ id: 'r_aaaaaa', exerciseId: 'hack-squat', sets: [] }] }] },
            { id: 'd_bbbbbb', name: 'Gün B', blocks: [{ id: 'b_bbbbbb', kind: 'single', rows: [{ id: 'r_bbbbbb', exerciseId: 'halter-biceps-curl', sets: [] }] }] },
          ],
        },
      ],
      current: { phaseId: 'p_aaaaaa', startedAt: NOW },
      rotation: { lastDayId: 'd_bbbbbb' },
    } as unknown as Program;
    const exercises = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));
    const conflicts = programConflicts(program, exercises, input(record([{ region: 'knee', side: 'left', avoid: ['deep_knee_flexion'] }])));
    assert.deepEqual(
      conflicts.map((item) => [item.dayName, item.title, item.message, item.next]),
      [['Gün A', 'Hack Squat', 'Sol diz: derin diz bükme (90° üstü)', true]],
    );
  });
});

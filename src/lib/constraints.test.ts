import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import {
  ackClientChange,
  addConstraint,
  addOverride,
  afterReportText,
  avoidFromTriggers,
  avoidMatch,
  awaitsOpinion,
  clearConstraint,
  clientConstraintView,
  clientDiagnosis,
  confirmAsIs,
  ConstraintError,
  constraintCounts,
  constraintsOf,
  conditionsForRegion,
  declineReport,
  editConstraint,
  editReport,
  isActive,
  isPendingReport,
  onsetFromChoice,
  overridable,
  redFlagStep,
  referConstraint,
  regionText,
  regionWorked,
  severeUnreviewed,
  removeConstraint,
  removeOverride,
  reportBetter,
  reportConstraint,
  reportWorse,
  resolveConstraint,
  reopenConstraint,
  withConstraintsMigrated,
  withdrawReport,
  yourRegion,
  type ConstraintInput,
  type ReportInput,
} from './constraints.ts';
import { healthRecordSchema, type HealthRecord } from './schemas/health.ts';

const NOW = '2026-09-27T10:00:00.000Z';
const LATER = '2026-09-28T10:00:00.000Z';
const TODAY = '2026-09-27';

function empty(extra: Partial<HealthRecord> = {}): HealthRecord {
  return { version: 2, checkIns: [], measurements: [], ...extra };
}

const knee: ConstraintInput = { region: 'knee', side: 'left', type: 'injury', severity: 'moderate', avoid: ['deep_knee_flexion'] };

function added(input: Partial<ConstraintInput> = {}, id = 'k_aaaaaa'): HealthRecord {
  return addConstraint(empty(), { ...knee, ...input }, { id, now: NOW });
}

function throwsStatus(fn: () => unknown, status: number) {
  assert.throws(fn, (error) => error instanceof ConstraintError && error.status === status);
}

const report: ReportInput = { region: 'knee', side: 'left', type: 'injury', severity: 'moderate', since: 'month', triggers: ['squat', 'jump'], note: 'Merdiven inerken ağrıyor.' };

describe('adlar', () => {
  test('bölge ve taraf: PT ve danışan dili', () => {
    assert.equal(regionText({ region: 'knee', side: 'left' }), 'Sol diz');
    assert.equal(regionText({ region: 'shoulder', side: 'both' }), 'İki omuz');
    assert.equal(regionText({ region: 'lower_back' }), 'Bel');
    // Tek bölgede taraf yazılmaz.
    assert.equal(regionText({ region: 'neck', side: 'left' }), 'Boyun');
    assert.equal(yourRegion({ region: 'knee', side: 'left' }, 'gen'), 'sol dizin');
    assert.equal(yourRegion({ region: 'shoulder', side: 'right' }, 'acc'), 'sağ omzunu');
    assert.equal(yourRegion({ region: 'lower_back' }, 'dat'), 'beline');
  });

  test('zorlayanlar önerilen kaçınmalara; öne eğilme dikkattir', () => {
    assert.deepEqual(avoidFromTriggers(['jump', 'squat', 'bend']), ['deep_knee_flexion', 'ballistic', 'forward_bend']);
    assert.deepEqual(avoidFromTriggers(undefined), []);
  });

  test('tanı seçicisi: bölgeye ve türe göre; emekli kimlik hiç çıkmaz; kauda ekina belde', () => {
    const kneeDiagnoses = conditionsForRegion('knee', 'diagnosis');
    assert.ok(kneeDiagnoses.includes('patellofemoral_pain'));
    assert.ok(!kneeDiagnoses.includes('dynamic_knee_valgus'));
    assert.ok(conditionsForRegion('knee', 'finding').includes('dynamic_knee_valgus'));
    assert.ok(!conditionsForRegion(null, 'finding').includes('movement_screen_pain_flag'));
    assert.ok(conditionsForRegion('lower_back', 'diagnosis').includes('cauda_equina_or_progressive_neuro_deficit'));
    assert.ok(!conditionsForRegion('knee', 'diagnosis').includes('cauda_equina_or_progressive_neuro_deficit'));
    assert.ok(conditionsForRegion('other', 'diagnosis').includes('hypertension'));
  });
});

describe('bölge kapısı ve kaçınmalar', () => {
  const byId = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));
  const tags = (id: string) => byId.get(id)!;

  test('sol diz · sıçrama Kettlebell Swing\'i yasaklamaz (arka bacak dizi yüklemiş sayılmaz)', () => {
    assert.equal(avoidMatch('ballistic', tags('kettlebell-swing'), 'knee'), false);
    // Bel kısıtında aynı kaçınma işler.
    assert.equal(avoidMatch('ballistic', tags('kettlebell-swing'), 'lower_back'), true);
  });

  test('omuz kaçınması omuzu çalıştırmayan harekete işlemez', () => {
    assert.equal(avoidMatch('overhead', tags('barfiks'), 'shoulder'), true);
    assert.equal(avoidMatch('overhead', tags('halter-back-squat'), 'shoulder'), false);
  });

  test('derin diz bükme: pencere okunur', () => {
    assert.equal(avoidMatch('deep_knee_flexion', tags('hack-squat'), 'knee'), true);
    assert.equal(avoidMatch('deep_knee_flexion', tags('goblet-box-squat'), 'knee'), false);
  });

  test('iç rotasyon: etiketli harekette yoksa hayır, etiketsizde bilinmiyor', () => {
    assert.equal(avoidMatch('ir_under_load', tags('dar-tutus-upright-row'), 'shoulder'), true);
    assert.equal(avoidMatch('ir_under_load', tags('lat-pulldown'), 'shoulder'), false);
    assert.equal(avoidMatch('ir_under_load', { primaryMuscles: ['delt_side'], secondaryMuscles: [] }, 'shoulder'), null);
  });
});

describe('eski biçim', () => {
  test('conditions kısıta çevrilir; tek ameliyatlı tanıya ameliyat tarihi taşınır; bulgu gözlem olur', () => {
    const record = empty({ version: undefined, conditions: ['acl_reconstruction_early', 'dynamic_knee_valgus', 'lumbar_disc_herniation:stable'], surgeryDate: '2026-08-01' });
    const list = constraintsOf(record);
    assert.equal(list.length, 3);
    assert.deepEqual(
      list.map((item) => [item.id, item.region, item.side, item.conditionId, item.findingId, item.diagnosisSource, item.details?.surgeryDate]),
      [
        ['k_old000', 'knee', 'both', 'acl_reconstruction_early', undefined, 'client', '2026-08-01'],
        ['k_old001', 'knee', 'both', undefined, 'dynamic_knee_valgus', undefined, undefined],
        ['k_old002', 'lower_back', undefined, 'lumbar_disc_herniation:stable', undefined, 'client', undefined],
      ],
    );
    assert.ok(list.every(isActive));
    const migrated = withConstraintsMigrated(record);
    assert.equal('conditions' in migrated, false);
    assert.equal('surgeryDate' in migrated, false);
    assert.equal(migrated.version, 2);
    assert.equal(v.safeParse(healthRecordSchema, migrated).success, true);
  });

  test('yeni biçimde constraints okunur, conditions yok sayılır', () => {
    const record = added();
    assert.equal(constraintsOf({ ...record, conditions: ['hypertension'] }).length, 1);
  });

  test('eski tarama kaydı hoşgörüyle okunur', () => {
    const parsed = v.safeParse(healthRecordSchema, { conditions: [], checkIns: [], measurements: [], movementScreens: [{ date: '2026-09-01', entries: { deep_squat: { score: 2 } } }] });
    assert.equal(parsed.success, true);
  });
});

describe('PT eylemleri', () => {
  test('ekleme: onaylı, kayıt satırı, şemaya uyar', () => {
    const record = added();
    const [constraint] = constraintsOf(record);
    assert.equal(constraint?.source, 'pt');
    assert.equal(constraint?.confirmedAt, NOW);
    assert.deepEqual(record.constraintLog?.[0], { at: NOW, by: 'pt', id: 'k_aaaaaa', kind: 'added', text: 'Sol diz eklendi · kaçın: derin diz bükme (90° üstü)' });
    assert.equal(v.safeParse(healthRecordSchema, record).success, true);
  });

  test('çift bölgede taraf, tanıda kaynak zorunlu; tür yanlışsa reddedilir', () => {
    throwsStatus(() => added({ side: undefined }), 400);
    throwsStatus(() => added({ conditionId: 'patellofemoral_pain' }), 400);
    throwsStatus(() => added({ conditionId: 'dynamic_knee_valgus', diagnosisSource: 'clinician' }), 400);
    throwsStatus(() => added({ findingId: 'patellofemoral_pain' }), 400);
    const ok = added({ conditionId: 'patellofemoral_pain:severe', diagnosisSource: 'clinician', findingId: 'dynamic_knee_valgus' });
    assert.equal(constraintsOf(ok)[0]?.findingId, 'dynamic_knee_valgus');
  });

  test('ayrıntılar yalnız ilgili tanıda; tek bölgede taraf düşer', () => {
    const acl = added({ conditionId: 'acl_reconstruction_early', diagnosisSource: 'clinician', details: { surgeryDate: '2026-08-01', graft: 'hamstring', stage: 2 } });
    assert.deepEqual(constraintsOf(acl)[0]?.details, { surgeryDate: '2026-08-01', graft: 'hamstring' });
    const back = added({ region: 'lower_back', side: 'left', details: { surgeryDate: '2026-08-01' } });
    assert.equal(constraintsOf(back)[0]?.side, undefined);
    assert.equal(constraintsOf(back)[0]?.details, undefined);
  });

  test('düzenleme: değişen alanlar kayda; değişiklik yoksa kayıt aynı; eski taban 412', () => {
    const record = added();
    const same = editConstraint(record, 'k_aaaaaa', knee, { now: LATER });
    assert.equal(same, record);
    const edited = editConstraint(record, 'k_aaaaaa', { ...knee, severity: 'severe', avoid: ['deep_knee_flexion', 'ballistic'] }, { now: LATER, baseUpdatedAt: NOW });
    assert.equal(edited.constraintLog?.[0]?.text, 'Sol diz: orta → şiddetli, kaçın: derin diz bükme (90° üstü), sıçrama / balistik');
    throwsStatus(() => editConstraint(edited, 'k_aaaaaa', knee, { now: LATER, baseUpdatedAt: NOW }), 412);
    throwsStatus(() => editConstraint(edited, 'k_zzzzzz', knee, { now: LATER }), 404);
  });

  test('sınırlar: en çok 12 etkin', () => {
    let record = empty();
    for (let index = 0; index < 12; index += 1) record = addConstraint(record, knee, { id: `k_${String(index).padStart(6, '0')}`, now: NOW });
    throwsStatus(() => addConstraint(record, knee, { id: 'k_extra1', now: NOW }), 409);
  });

  test('kapat, yeniden aç, sil (izinleriyle)', () => {
    let record = added();
    record = addOverride(record, { exerciseId: 'goblet-squat', source: 'k_aaaaaa' }, { now: NOW, title: 'Goblet Squat' });
    assert.equal(record.overrides?.length, 1);
    const resolved = resolveConstraint(record, 'k_aaaaaa', { now: LATER });
    assert.equal(constraintsOf(resolved)[0]?.status, 'resolved');
    assert.equal(isActive(constraintsOf(resolved)[0]!), false);
    const reopened = reopenConstraint(resolved, 'k_aaaaaa', { now: LATER });
    assert.equal(constraintsOf(reopened)[0]?.status, 'active');
    const removed = removeConstraint(reopened, 'k_aaaaaa', { now: LATER });
    assert.deepEqual([constraintsOf(removed).length, removed.overrides?.length], [0, 0]);
    assert.equal(removed.constraintLog?.[0]?.kind, 'removed');
  });

  test('izin: etkin kısıta; kaldırma; yoksa 404', () => {
    const record = addOverride(added(), { exerciseId: 'goblet-squat', source: 'k_aaaaaa', note: ' Kutuya ' }, { now: NOW, title: 'Goblet Squat' });
    assert.deepEqual(record.overrides, [{ exerciseId: 'goblet-squat', source: 'k_aaaaaa', at: NOW, note: 'Kutuya' }]);
    assert.equal(record.constraintLog?.[0]?.text, 'Sol diz: izin verildi · Goblet Squat');
    const removed = removeOverride(record, { exerciseId: 'goblet-squat', source: 'k_aaaaaa' }, { now: LATER, title: 'Goblet Squat' });
    assert.deepEqual(removed.overrides, []);
    throwsStatus(() => removeOverride(removed, { exerciseId: 'goblet-squat', source: 'k_aaaaaa' }, { now: LATER, title: 'x' }), 404);
  });
});

describe('kırmızı bayrak: yönlendirme ve görüş', () => {
  const acl = () => added({ conditionId: 'acl_reconstruction_early', diagnosisSource: 'clinician' });

  test('görüş alınana kadar izin verilemez; adımlar sırayla', () => {
    let record = acl();
    const constraint = () => constraintsOf(record)[0]!;
    assert.equal(redFlagStep(constraint()), 'refer');
    assert.equal(awaitsOpinion(constraint()), true);
    assert.equal(overridable(constraint()), false);
    throwsStatus(() => addOverride(record, { exerciseId: 'leg-extension', source: 'k_aaaaaa' }, { now: NOW, title: 'Leg Extension' }), 409);
    record = referConstraint(record, 'k_aaaaaa', { now: NOW, date: '2026-09-27' });
    assert.equal(redFlagStep(constraint()), 'opinion');
    assert.equal(awaitsOpinion(constraint()), true);
    record = clearConstraint(record, 'k_aaaaaa', { now: LATER, date: '2026-10-02', basis: 'written_report', scope: ' Tam yük ' });
    assert.deepEqual(constraint().clearance, { at: '2026-10-02', basis: 'written_report', scope: 'Tam yük' });
    assert.equal(redFlagStep(constraint()), 'cleared');
    assert.equal(overridable(constraint()), true);
    assert.equal(record.constraintLog?.[0]?.text, 'Sol diz: görüş alındı (yazılı rapor)');
  });

  test('bayraksız kısıtta yönlendirme yok; kauda ekinada izin hiç yok', () => {
    throwsStatus(() => referConstraint(added(), 'k_aaaaaa', { now: NOW, date: TODAY }), 409);
    let cauda = added({ region: 'lower_back', side: undefined, conditionId: 'cauda_equina_or_progressive_neuro_deficit', diagnosisSource: 'client' });
    cauda = clearConstraint(cauda, 'k_aaaaaa', { now: NOW, date: TODAY, basis: 'client_report' });
    assert.equal(overridable(constraintsOf(cauda)[0]!), false);
  });
});

describe('danışanın bildirimi', () => {
  const reported = () => reportConstraint(empty(), report, { id: 'k_rrrrrr', now: NOW, today: TODAY });

  test('bekleyen bildirim: danışanın, onaysız; başlangıç yaklaşık; kayıt satırı', () => {
    const record = reported();
    const [constraint] = constraintsOf(record);
    assert.equal(isPendingReport(constraint!), true);
    assert.equal(isActive(constraint!), false);
    assert.deepEqual([constraint?.onset, constraint?.onsetApprox, constraint?.triggers], ['2026-09', true, ['squat', 'jump']]);
    assert.deepEqual(record.constraintLog?.[0], { at: NOW, by: 'client', id: 'k_rrrrrr', kind: 'reported', text: 'Sol diz bildirildi (orta)' });
    assert.equal(v.safeParse(healthRecordSchema, record).success, true);
    assert.equal(clientConstraintView(constraint!).state, 'pending');
    assert.deepEqual(constraintCounts(record), { active: 0, pending: 1, changes: 0, awaiting: 0, severe: 0 });
  });

  test('başlangıç seçenekleri', () => {
    assert.deepEqual(onsetFromChoice('week', TODAY), { onset: TODAY, onsetApprox: true });
    assert.deepEqual(onsetFromChoice('months', '2026-02-10'), { onset: '2025-11', onsetApprox: true });
    assert.deepEqual(onsetFromChoice('longer', TODAY), { onset: '2025', onsetApprox: true });
    assert.deepEqual(onsetFromChoice(undefined, TODAY), {});
  });

  test('düzeltme ve geri çekme yalnız bekleyen bildirimde', () => {
    const record = reported();
    const edited = editReport(record, 'k_rrrrrr', { ...report, severity: 'severe', triggers: [] }, { now: LATER, today: TODAY });
    assert.deepEqual([constraintsOf(edited)[0]?.severity, constraintsOf(edited)[0]?.triggers], ['severe', undefined]);
    const withdrawn = withdrawReport(edited, 'k_rrrrrr', { now: LATER });
    assert.equal(constraintsOf(withdrawn).length, 0);
    assert.equal(withdrawn.constraintLog?.[0]?.text, 'Bildirim geri çekildi: Sol diz');
    const confirmed = confirmAsIs(record, 'k_rrrrrr', { now: LATER });
    throwsStatus(() => withdrawReport(confirmed, 'k_rrrrrr', { now: LATER }), 409);
  });

  test('"Olduğu gibi onayla" zorlayanları kaçınmaya çevirir; zorlayan yoksa süzgeçsiz ve danışan "gördü" okur', () => {
    const confirmed = confirmAsIs(reported(), 'k_rrrrrr', { now: LATER });
    const [constraint] = constraintsOf(confirmed);
    assert.deepEqual(constraint?.avoid, ['deep_knee_flexion', 'ballistic']);
    assert.equal(clientConstraintView(constraint!).state, 'confirmed');
    assert.equal(confirmed.constraintLog?.[0]?.text, 'Sol diz onaylandı · kaçın: derin diz bükme (90° üstü), sıçrama / balistik');
    const plain = reportConstraint(empty(), { ...report, triggers: [] }, { id: 'k_pppppp', now: NOW, today: TODAY });
    const seen = confirmAsIs(plain, 'k_pppppp', { now: LATER });
    assert.equal(clientConstraintView(constraintsOf(seen)[0]!).state, 'seen');
    assert.equal(seen.constraintLog?.[0]?.text, 'Sol diz görüldü (süzgeçsiz)');
    throwsStatus(() => confirmAsIs(seen, 'k_pppppp', { now: LATER }), 409);
  });

  test('"Onayla ve düzenle": bekleyen bildirimi düzenlemek onaylar', () => {
    const record = editConstraint(reported(), 'k_rrrrrr', { ...knee, avoid: ['deep_knee_flexion'] }, { now: LATER });
    assert.equal(constraintsOf(record)[0]?.confirmedAt, LATER);
    assert.equal(record.constraintLog?.[0]?.kind, 'confirmed');
  });

  test('"Kaydetmeden kapat": reddedilir, danışan notu görür', () => {
    const record = declineReport(reported(), 'k_rrrrrr', { now: LATER, note: 'Kas ağrısı; yoklamada söylemen yeter.' });
    const view = clientConstraintView(constraintsOf(record)[0]!);
    assert.deepEqual([view.state, view.declinedNote], ['declined', 'Kas ağrısı; yoklamada söylemen yeter.']);
    assert.equal(isActive(constraintsOf(record)[0]!), false);
  });

  test('kötüleşti hemen yazılır (yalnız artar); düzeldi kapatmaz; PT görünce kapatabilir', () => {
    const record = added();
    const worse = reportWorse(record, 'k_aaaaaa', 'severe', { now: LATER });
    const constraint = constraintsOf(worse)[0]!;
    assert.deepEqual([constraint.severity, constraint.clientChange], ['severe', { at: LATER, severity: 'severe', previousSeverity: 'moderate' }]);
    assert.equal(worse.constraintLog?.[0]?.text, 'Sol diz: orta → şiddetli (danışan)');
    throwsStatus(() => reportWorse(worse, 'k_aaaaaa', 'mild', { now: LATER }), 400);
    const better = reportBetter(record, 'k_aaaaaa', { now: LATER });
    assert.equal(constraintsOf(better)[0]?.status, 'active');
    assert.equal(clientConstraintView(constraintsOf(better)[0]!).change, 'better');
    const closed = ackClientChange(better, 'k_aaaaaa', { now: LATER, close: true });
    assert.equal(constraintsOf(closed)[0]?.status, 'resolved');
    const kept = ackClientChange(better, 'k_aaaaaa', { now: LATER });
    assert.equal(constraintsOf(kept)[0]?.clientChange, undefined);
  });

  test('en çok 5 bekleyen bildirim', () => {
    let record = empty();
    for (let index = 0; index < 5; index += 1) record = reportConstraint(record, report, { id: `k_r0000${index}`, now: NOW, today: TODAY });
    throwsStatus(() => reportConstraint(record, report, { id: 'k_r00009', now: NOW, today: TODAY }), 409);
  });

  test('bildirimden sonraki metin şiddete göre', () => {
    assert.match(afterReportText({ severity: 'severe', type: 'condition' }), /zorlayan hareketleri yapma/);
    assert.match(afterReportText({ severity: 'mild', type: 'injury', since: 'week' }), /zorlayan hareketleri yapma/);
    assert.match(afterReportText({ severity: 'moderate', type: 'injury', since: 'month' }), /dikkatli ol/);
  });
});

describe('danışanın göreceği tanı adı', () => {
  test('yalnız hekim kaynaklı, tanı türünde, niteleyicisiz; kuşku ve akut adlar hiç', () => {
    assert.equal(clientDiagnosis({ conditionId: 'lumbar_disc_herniation:stable', diagnosisSource: 'clinician' }), 'Lomber disk hernisi');
    assert.equal(clientDiagnosis({ conditionId: 'lumbar_disc_herniation:stable', diagnosisSource: 'client' }), null);
    assert.equal(clientDiagnosis({ conditionId: 'acute_meniscus_tear', diagnosisSource: 'clinician' }), null);
    assert.equal(clientDiagnosis({ conditionId: 'cauda_equina_or_progressive_neuro_deficit', diagnosisSource: 'clinician' }), null);
    assert.equal(clientDiagnosis({ conditionId: undefined, diagnosisSource: undefined }), null);
  });

  test('danışan görünümünde PT notu ve gözlem yok', () => {
    const record = added({ conditionId: 'patellofemoral_pain', diagnosisSource: 'clinician', findingId: 'dynamic_knee_valgus', note: 'Gizli not', clientNote: 'Derine inme.' });
    const view = clientConstraintView(constraintsOf(record)[0]!);
    assert.equal(JSON.stringify(view).includes('Gizli not'), false);
    assert.equal(JSON.stringify(view).includes('valgus'), false);
    assert.deepEqual([view.title, view.diagnosis, view.clientNote, view.state], ['Sol diz', 'Patellofemoral ağrı (ön diz ağrısı)', 'Derine inme.', 'confirmed']);
  });
});

describe('kayıt', () => {
  test('en çok 200 satır, metin 300 karakter', () => {
    let record = added();
    for (let index = 0; index < 205; index += 1) {
      record = editConstraint(record, 'k_aaaaaa', { ...knee, clientNote: `not ${index} ${'x'.repeat(index % 2 ? 0 : 1)}` }, { now: NOW });
    }
    assert.equal(record.constraintLog?.length, 200);
    const long = removeConstraint(added({}, 'k_bbbbbb'), 'k_bbbbbb', { now: NOW });
    assert.ok((long.constraintLog?.[0]?.text.length ?? 0) <= 300);
  });
});


describe('yeni bölgeler ve bakılmamış şiddetli değişiklik', () => {
  test('dirsek, el bileği, kalça ve ayak bileği: ilişkili hareket ve bilinmeyen bilgi', () => {
    for (const region of ['elbow', 'wrist_hand', 'hip', 'ankle_foot'] as const) assert.equal(regionWorked({}, region), null);
    assert.equal(regionWorked({ primaryMuscles: ['biceps'] }, 'elbow'), true);
    assert.equal(regionWorked({ pattern: 'horizontal_push', kineticChain: 'closed' }, 'wrist_hand'), true);
    assert.equal(regionWorked({ pattern: 'hinge' }, 'hip'), true);
    assert.equal(regionWorked({ pattern: 'calf_raise' }, 'ankle_foot'), true);
    assert.equal(regionWorked({ pattern: 'elbow_flexion' }, 'hip'), false);
  });
  test('şiddetli kötüleşme Düzeldi ile kalkmaz, PT Gördüm ile kalkar', () => {
    let record = reportWorse(added(), 'k_aaaaaa', 'severe', { now: LATER });
    assert.equal(severeUnreviewed(constraintsOf(record)[0]!), true);
    record = reportBetter(record, 'k_aaaaaa', { now: LATER });
    assert.equal(severeUnreviewed(constraintsOf(record)[0]!), true);
    record = ackClientChange(record, 'k_aaaaaa', { now: LATER });
    assert.equal(severeUnreviewed(constraintsOf(record)[0]!), false);
  });
});

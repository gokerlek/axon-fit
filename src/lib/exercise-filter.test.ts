import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CONDITIONS, parseCondition, redFlags, type ClientCondition } from './conditions.ts';
import { evaluateExercise, requiresClearance, RULES, type ExerciseTags } from './exercise-filter.ts';

const of = (value: string): ClientCondition => {
  const parsed = parseCondition(value);
  assert.ok(parsed, `bilinmeyen kısıt: ${value}`);
  return parsed;
};

/** Yüklü fleksiyon + rotasyon (ağırlıklı Russian twist). */
const russianTwist: ExerciseTags = {
  kineticChain: 'open',
  axialLoading: 'low',
  shearForce: 'high',
  spinalAlignment: 'flexion_with_rotation',
  contractionType: 'isotonic_balanced',
};

/** Nötr omurga, eksenel yük yok (hip thrust). */
const hipThrust: ExerciseTags = {
  kineticChain: 'closed',
  axialLoading: 'none',
  shearForce: 'low',
  spinalAlignment: 'neutral',
  loadVector: 'horizontal',
};

/** Açık zincir, sabit direnç, terminal ekstansiyon (leg extension). */
const legExtension: ExerciseTags = {
  kineticChain: 'open',
  axialLoading: 'none',
  shearForce: 'high',
  spinalAlignment: 'neutral',
  resistanceProfile: 'constant_resistance',
  jointWindows: ['knee_terminal_extension_0_30', 'knee_flexion_45_90'],
};

/** Ense arkası lat pulldown. */
const behindNeckPulldown: ExerciseTags = {
  kineticChain: 'open',
  axialLoading: 'none',
  spinalAlignment: 'flexion',
  jointWindows: ['shoulder_abduction_90_end_range_er', 'shoulder_elevation_over_90'],
};

describe('kısıt sözlüğü', () => {
  test('kimlik + nitelik ayrıştırılır, bilinmeyen kimlik null', () => {
    assert.deepEqual(parseCondition('lumbar_disc_herniation:acute'), { id: 'lumbar_disc_herniation', qualifier: 'acute' });
    assert.deepEqual(parseCondition('patellofemoral_pain'), { id: 'patellofemoral_pain' });
    assert.equal(parseCondition('uydurma_patoloji'), null);
    // Bilinmeyen nitelik kimliği düşürmez, yalnız nitelik atılır.
    assert.deepEqual(parseCondition('knee_osteoarthritis:cok_kotu'), { id: 'knee_osteoarthritis' });
  });

  test('kırmızı bayraklar tıbbi izin ister', () => {
    const list = [of('patellofemoral_pain'), of('acl_reconstruction_early'), of('cauda_equina_or_progressive_neuro_deficit')];
    assert.deepEqual(redFlags(list).map((item) => item.id), ['acl_reconstruction_early', 'cauda_equina_or_progressive_neuro_deficit']);
    assert.equal(requiresClearance(list).length, 2);
  });

  test('her kuralın kısıtı sözlükte var', () => {
    for (const rule of RULES) assert.ok(rule.condition in CONDITIONS, `${rule.id} → ${rule.condition}`);
  });
});

describe('egzersiz süzgeci', () => {
  test('disk hernisinde yüklü fleksiyon+rotasyon yasak, nötr hareket serbest', () => {
    const disk = [of('lumbar_disc_herniation')];
    assert.equal(evaluateExercise(russianTwist, disk).decision, 'block');
    assert.equal(evaluateExercise(hipThrust, disk).decision, null);
  });

  test('kısıtı olmayan danışanda hiçbir kural işlemez', () => {
    assert.equal(evaluateExercise(russianTwist, []).decision, null);
  });

  test('patellofemoral ağrıda açık zincir sabit direnç yasak; kapalı zincire düşünce serbest', () => {
    const pfp = [of('patellofemoral_pain')];
    const sonuc = evaluateExercise(legExtension, pfp);
    assert.equal(sonuc.decision, 'block');
    assert.ok(sonuc.findings.some((f) => f.rule === 'pfp-open-chain-constant'));
    // Aynı kas, kapalı zincir: yalnız derinlik uyarısı.
    const legPress: ExerciseTags = { kineticChain: 'closed', axialLoading: 'none', jointWindows: ['knee_flexion_over_90'] };
    assert.equal(evaluateExercise(legPress, pfp).decision, 'warn');
  });

  test('ACL erken dönem: hafta bilinmeden kural atlanır, bilinince yasaklar', () => {
    const acl = [of('acl_reconstruction_early')];
    const bilgisiz = evaluateExercise(legExtension, acl);
    assert.equal(bilgisiz.decision, null);
    assert.ok(bilgisiz.skipped > 0, 'eksik bilgi sayılmalı');

    assert.equal(evaluateExercise(legExtension, acl, { weeksPostOp: 2 }).decision, 'block');
    // 6. haftada terminal ekstansiyon hâlâ kapalı.
    assert.equal(evaluateExercise(legExtension, acl, { weeksPostOp: 6 }).decision, 'block');
    // Penceresi korunan varyant (90–45) serbest.
    const korunmus: ExerciseTags = { ...legExtension, jointWindows: ['knee_flexion_45_90'] };
    assert.equal(evaluateExercise(korunmus, acl, { weeksPostOp: 6 }).decision, null);
  });

  test('omuz: ense arkası hem sıkışmada hem instabilitede yasak', () => {
    assert.equal(evaluateExercise(behindNeckPulldown, [of('subacromial_pain_syndrome')]).decision, 'block');
    assert.equal(evaluateExercise(behindNeckPulldown, [of('anterior_shoulder_instability')]).decision, 'block');
  });

  test('tansiyon: kontrolsüzde ağır eksenel yük yasak, kontrollüde ipucu', () => {
    const backSquat: ExerciseTags = { axialLoading: 'high', spinalAlignment: 'neutral', kineticChain: 'closed' };
    assert.equal(evaluateExercise(backSquat, [of('hypertension:uncontrolled')]).decision, 'block');
    assert.equal(evaluateExercise(backSquat, [of('hypertension:controlled')]).decision, 'cue');
    // Niteleyici yazılmamışsa iki kural da çalışmaz (hangi hal olduğu bilinmiyor).
    assert.equal(evaluateExercise(backSquat, [of('hypertension')]).decision, null);
  });

  test('PT elle yasaklarsa kural aranmaz; "sorun yok" dediğinde uyarı susar ama yasak susmaz', () => {
    const elle: ExerciseTags = { ...hipThrust, contraindications: ['si_joint_pain'] };
    assert.equal(evaluateExercise(elle, [of('si_joint_pain')]).findings[0]?.rule, 'manual');

    const pfp = [of('patellofemoral_pain')];
    const uyariSus: ExerciseTags = { kineticChain: 'closed', jointWindows: ['knee_flexion_over_90'], safeFor: ['patellofemoral_pain'] };
    assert.equal(evaluateExercise(uyariSus, pfp).decision, null, 'uyarı susmalı');

    const yasakSusmaz: ExerciseTags = { ...legExtension, safeFor: ['patellofemoral_pain'] };
    assert.equal(evaluateExercise(yasakSusmaz, pfp).decision, 'block', 'yasak susmamalı');
  });

  test('etiketlenmemiş egzersizde süzgeç sessiz kalır ama bunu söyler', () => {
    const sonuc = evaluateExercise({}, [of('lumbar_disc_herniation')]);
    assert.equal(sonuc.decision, null);
    assert.equal(sonuc.untagged, true);
    assert.equal(evaluateExercise(hipThrust, []).untagged, false);
  });

  test('en ağır karar öne gelir', () => {
    const cok = [of('subacromial_pain_syndrome'), of('upper_crossed_pattern')];
    const sonuc = evaluateExercise(behindNeckPulldown, cok);
    assert.equal(sonuc.decision, 'block');
    assert.deepEqual([...new Set(sonuc.findings.map((f) => f.decision))], ['block', 'warn']);
  });
});

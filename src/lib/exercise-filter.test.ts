import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CONDITIONS, parseCondition, redFlags, type ClientCondition } from './conditions.ts';
import {
  evaluateExercise,
  FILTER_GROUPS,
  filterGroup,
  inFilterView,
  requiresClearance,
  RULES,
  summarizeFilter,
  type ExerciseTags,
  type FilterGroup,
} from './exercise-filter.ts';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';

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
    // Kartta tek kural: greft tipi (ameliyatın sabit bilgisi) bilinmeden hamstring greft kuralı. Hafta
    // zamanla değişen bağlam: haftaya bağlı iki kural kart başına değil, özet satırında bir kez söylenir.
    assert.equal(bilgisiz.skipped, 1, 'eksik bilgi sayılmalı');
    assert.deepEqual(
      bilgisiz.pending.map((item) => [item.rule, item.needs]),
      [
        ['acl-open-chain-early', 'weeksPostOp'],
        ['acl-open-chain-rom', 'weeksPostOp'],
      ],
    );

    assert.equal(evaluateExercise(legExtension, acl, { weeksPostOp: 2 }).decision, 'block');
    // 6. haftada terminal ekstansiyon hâlâ kapalı.
    assert.equal(evaluateExercise(legExtension, acl, { weeksPostOp: 6 }).decision, 'block');
    // Penceresi korunan varyant (90–45) serbest.
    const korunmus: ExerciseTags = { ...legExtension, jointWindows: ['knee_flexion_45_90'] };
    assert.equal(evaluateExercise(korunmus, acl, { weeksPostOp: 6 }).decision, null);
  });

  test('ACL: korunan ROM penceresi 8. haftada tam ROM olur (8–11. haftada terminal ekstansiyon serbest)', () => {
    const acl = [of('acl_reconstruction_early')];
    // Greft kuralı karışmasın: patellar tendon grefti.
    const hafta = (weeksPostOp: number) => ({ weeksPostOp, graftType: 'patellar_tendon' as const });
    assert.equal(evaluateExercise(legExtension, acl, hafta(4)).decision, 'block');
    assert.equal(evaluateExercise(legExtension, acl, hafta(7.9)).decision, 'block');
    assert.equal(evaluateExercise(legExtension, acl, hafta(8)).decision, null);
    assert.equal(evaluateExercise(legExtension, acl, hafta(11.9)).decision, null);
  });

  test('ACL hamstring grefti: 12. haftaya kadar yalnız dış yüklü açık zincir yasak', () => {
    const acl = [of('acl_reconstruction_early')];
    const hamstring = (weeksPostOp: number) => ({ weeksPostOp, graftType: 'hamstring' as const });
    const yuksuzBukme: ExerciseTags = {
      kineticChain: 'open',
      axialLoading: 'none',
      resistanceProfile: 'bodyweight',
      primaryMuscles: ['hamstrings_medial', 'hamstrings_lateral'],
    };
    const yukluBukme: ExerciseTags = { ...yuksuzBukme, resistanceProfile: 'machine_guided' };
    assert.equal(evaluateExercise(yuksuzBukme, acl, hamstring(6)).decision, null);
    assert.equal(evaluateExercise(yukluBukme, acl, hamstring(6)).decision, 'block');
    assert.equal(evaluateExercise(yukluBukme, acl, hamstring(11.9)).decision, 'block');
    assert.equal(evaluateExercise(yukluBukme, acl, hamstring(12)).decision, null);
    // Direnç profili girilmemişse dış yük bilinmez: yasak varsayılmaz, atlandı sayılır.
    const profilsiz: ExerciseTags = { kineticChain: 'open', axialLoading: 'none', primaryMuscles: ['hamstrings_medial'] };
    const bilinmiyor = evaluateExercise(profilsiz, acl, hamstring(6));
    assert.equal(bilinmiyor.decision, null);
    assert.ok(bilinmiyor.findings.every((finding) => finding.rule !== 'acl-hamstring-graft-load'));
    assert.ok(bilinmiyor.skipped > 0);
  });

  test('omuz: ense arkası hem sıkışmada hem instabilitede yasak', () => {
    assert.equal(evaluateExercise(behindNeckPulldown, [of('subacromial_pain_syndrome')]).decision, 'block');
    assert.equal(evaluateExercise(behindNeckPulldown, [of('anterior_shoulder_instability')]).decision, 'block');
  });

  test('tansiyon: kontrolsüzde ağır eksenel yük yasak, kontrollüde ipucu', () => {
    const backSquat: ExerciseTags = { axialLoading: 'high', spinalAlignment: 'neutral', kineticChain: 'closed' };
    assert.equal(evaluateExercise(backSquat, [of('hypertension:uncontrolled')]).decision, 'block');
    assert.equal(evaluateExercise(backSquat, [of('hypertension:controlled')]).decision, 'cue');
    // Niteleyici yazılmamışsa hangi hal olduğu bilinmiyor: iki kural da karar vermez ama sayılır; ikisi
    // birbirini dışlayan hallere bağlı (danışan hem kontrollü hem kontrolsüz olamaz): tek "atlandı".
    const bilinmiyor = evaluateExercise(backSquat, [of('hypertension')]);
    assert.equal(bilinmiyor.decision, null);
    assert.equal(bilinmiyor.skipped, 1);
    // Bilinmeyen niteleyici düşer (`?limit=hypertension:yazimhatasi`): sessiz kalmaz, aynı sayım.
    assert.deepEqual(evaluateExercise(backSquat, [of('hypertension:yazimhatasi')]), bilinmiyor);
    // Etiketler kuralı zaten düşürüyorsa (eksenel yük yok) niteleyici önemsiz: atlanan yok.
    const yuksuz = evaluateExercise(hipThrust, [of('hypertension')]);
    assert.deepEqual([yuksuz.decision, yuksuz.skipped], [null, 0]);
  });

  test('niteleyicili elle yasak niteleyicisiz danışanda karar veremez: uygulanmaz ama sayılır', () => {
    const elle: ExerciseTags = { ...hipThrust, contraindications: ['lumbar_disc_herniation:acute'] };
    const bilinmiyor = evaluateExercise(elle, [of('lumbar_disc_herniation')]);
    assert.deepEqual([bilinmiyor.decision, bilinmiyor.skipped], [null, 1]);
    assert.equal(evaluateExercise(elle, [of('lumbar_disc_herniation:acute')]).findings[0]?.rule, 'manual');
    // Danışanın hali başka: yasak işlemez, bilinmeyen de yok.
    const sakin = evaluateExercise(elle, [of('lumbar_disc_herniation:stable')]);
    assert.deepEqual([sakin.decision, sakin.skipped], [null, 0]);
    // Niteleyicili "sorun yok" hali bilinmeden uyarıyı susturmaz.
    const nitelikliSorunYok: ExerciseTags = {
      kineticChain: 'closed',
      jointWindows: ['knee_flexion_over_90'],
      safeFor: ['patellofemoral_pain:severe'],
    };
    assert.equal(evaluateExercise(nitelikliSorunYok, [of('patellofemoral_pain')]).decision, 'warn');
  });

  test('üç değerli mantık: bilinen bir yanlış kuralı düşürür, "atlandı" sayılmaz', () => {
    // Face pull dizi çalıştırmıyor: ameliyat haftası bilinmese de ACL kuralları işlemez.
    const facePull: ExerciseTags = {
      kineticChain: 'open',
      axialLoading: 'none',
      jointWindows: ['shoulder_elevation_60_90'],
      primaryMuscles: ['delt_rear', 'traps_mid'],
    };
    const acl = [of('acl_reconstruction_early')];
    assert.deepEqual([evaluateExercise(facePull, acl).decision, evaluateExercise(facePull, acl).skipped], [null, 0]);
    // Diz çalıştıran açık zincirde hafta bilinmiyorsa atlanır.
    assert.ok(evaluateExercise(legExtension, acl).skipped > 0);
    // Nötr omurgada eksenel yük bilinmese de "yüklü ekstansiyon" yanlıştır.
    const yukBilinmiyor: ExerciseTags = { kineticChain: 'closed', shearForce: 'low', spinalAlignment: 'neutral' };
    assert.equal(evaluateExercise(yukBilinmiyor, [of('lumbar_spondylolisthesis')]).skipped, 0);
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

  test('diz kuralı diz dışı hareketi yasaklamaz (face pull, PFP kısıtında serbest)', () => {
    const facePull: ExerciseTags = {
      kineticChain: 'open',
      axialLoading: 'none',
      shearForce: 'low',
      spinalAlignment: 'neutral',
      resistanceProfile: 'constant_resistance',
      jointWindows: ['shoulder_elevation_60_90'],
      primaryMuscles: ['delt_rear', 'traps_mid'],
    };
    assert.equal(evaluateExercise(facePull, [of('patellofemoral_pain')]).decision, null);
    // Aynı etiketler dizi çalıştıran bir harekette yasak üretir.
    const legExt: ExerciseTags = { ...facePull, jointWindows: ['knee_terminal_extension_0_30'], primaryMuscles: ['quadriceps'] };
    assert.equal(evaluateExercise(legExt, [of('patellofemoral_pain')]).decision, 'block');
  });

  test('ACL erken dönem üst vücut hareketini yasaklamaz', () => {
    const bench: ExerciseTags = { kineticChain: 'open', primaryMuscles: ['chest_lower'], axialLoading: 'none' };
    assert.equal(evaluateExercise(bench, [of('acl_reconstruction_early')], { weeksPostOp: 2 }).decision, null);
  });

  test('balistik kural yalnız dizi ilgilendiren harekette ve erken evrede çalışır; evre bilinmezse atlanır', () => {
    const swing: ExerciseTags = { contractionType: 'energy_storage_ballistic', primaryMuscles: ['glutes', 'hamstrings_lateral'] };
    const slam: ExerciseTags = { contractionType: 'energy_storage_ballistic', primaryMuscles: ['delt_front', 'abs_upper'] };
    const tendinopati = [of('patellar_tendinopathy')];
    assert.equal(evaluateExercise(swing, tendinopati, { tendinopathyStage: 1 }).decision, 'block');
    assert.equal(evaluateExercise(swing, tendinopati, { tendinopathyStage: 2 }).decision, 'block');
    // 3–4. evrede protokol tam da enerji depolayan yüklemeyi önerir.
    assert.equal(evaluateExercise(swing, tendinopati, { tendinopathyStage: 3 }).decision, null);
    // Evre bilinmiyorsa erken evre varsayılmaz (liste önizlemesi): karar yok, atlandı sayılır. Evre
    // zamanla değişen bağlam: kartta değil, özet satırında.
    const bilgisiz = evaluateExercise(swing, tendinopati);
    assert.deepEqual([bilgisiz.decision, bilgisiz.skipped], [null, 0]);
    assert.deepEqual(bilgisiz.pending, [{ rule: 'tendinopathy-ballistic', needs: 'tendinopathyStage' }]);
    const kolYok = evaluateExercise(slam, tendinopati);
    assert.deepEqual([kolYok.decision, kolYok.skipped, kolYok.pending], [null, 0, []]);
  });

  test('dorsifleksiyon kısıtı: topuk bilgisi yoksa uyarı varsayılmaz, atlanır', () => {
    const derinSquat: ExerciseTags = {
      kineticChain: 'closed',
      axialLoading: 'high',
      jointWindows: ['knee_flexion_over_90'],
      primaryMuscles: ['quadriceps'],
    };
    const kisit = [of('ankle_dorsiflexion_restriction')];
    const bilgisiz = evaluateExercise(derinSquat, kisit);
    assert.deepEqual([bilgisiz.decision, bilgisiz.skipped], [null, 1]);
    assert.equal(evaluateExercise(derinSquat, kisit, { heelElevated: false }).decision, 'warn');
    assert.equal(evaluateExercise(derinSquat, kisit, { heelElevated: true }).decision, null);
  });

  test('kas ve pencere bilgisi yoksa eklem kuralı karar vermez, atlar', () => {
    const etiketsizAma: ExerciseTags = { kineticChain: 'open', resistanceProfile: 'constant_resistance' };
    const sonuc = evaluateExercise(etiketsizAma, [of('patellofemoral_pain')]);
    assert.equal(sonuc.decision, null);
    assert.ok(sonuc.skipped > 0);
  });

  test('reaktif patellar tendinopati erken evredir: balistik harekete yasak; niteleyicisiz atlanır ve sayılır; evre 3 serbest', () => {
    // Kütüphanedeki Kettlebell Swing ve bir box jump (`?limit=patellar_tendinopathy:reactive`).
    const swing: ExerciseTags = {
      kineticChain: 'semi_closed',
      axialLoading: 'low',
      spinalAlignment: 'neutral',
      contractionType: 'energy_storage_ballistic',
      resistanceProfile: 'free_weight',
      primaryMuscles: ['glutes'],
      secondaryMuscles: ['hamstrings_medial', 'hamstrings_lateral', 'erectors'],
    };
    const boxJump: ExerciseTags = {
      kineticChain: 'closed',
      axialLoading: 'low',
      contractionType: 'energy_storage_ballistic',
      primaryMuscles: ['quadriceps', 'glutes'],
    };
    const reaktif = [of('patellar_tendinopathy:reactive')];
    for (const tags of [swing, boxJump]) {
      const sonuc = evaluateExercise(tags, reaktif);
      assert.equal(sonuc.decision, 'block');
      assert.equal(sonuc.findings[0]?.rule, 'tendinopathy-ballistic');
    }
    // Niteleyici de evre de yoksa karar yok: evre zamanla değişen bağlam, özet satırında sayılır.
    const bilgisiz = evaluateExercise(boxJump, [of('patellar_tendinopathy')]);
    assert.deepEqual([bilgisiz.decision, bilgisiz.skipped], [null, 0]);
    assert.deepEqual(bilgisiz.pending, [{ rule: 'tendinopathy-ballistic', needs: 'tendinopathyStage' }]);
    // 3. evrede protokol enerji depolayan yüklemeyi önerir: serbest. Bağlamdaki evre niteleyiciden önce gelir.
    assert.equal(evaluateExercise(boxJump, [of('patellar_tendinopathy')], { tendinopathyStage: 3 }).decision, null);
    assert.equal(evaluateExercise(boxJump, reaktif, { tendinopathyStage: 3 }).decision, null);
  });
});

describe('değerlendirilemeyen kurallar', () => {
  /** Kütüphanedeki Dead Bug (etiketleri aynen). */
  const deadBug: ExerciseTags = {
    kineticChain: 'open',
    axialLoading: 'none',
    shearForce: 'low',
    spinalAlignment: 'neutral',
    contractionType: 'isometric',
    resistanceProfile: 'bodyweight',
    primaryMuscles: ['abs_upper', 'abs_lower'],
    secondaryMuscles: ['obliques', 'hip_flexors'],
    safeFor: ['lumbar_disc_herniation', 'lumbar_stenosis', 'subacromial_pain_syndrome'],
  };
  /** Kütüphanedeki Deadlift, elle yasakları olmadan. */
  const deadlift: ExerciseTags = {
    kineticChain: 'semi_closed',
    axialLoading: 'high',
    shearForce: 'high',
    spinalAlignment: 'neutral',
    loadVector: 'anterior_posterior_shear',
    resistanceProfile: 'free_weight',
    primaryMuscles: ['erectors', 'glutes', 'hamstrings_medial', 'hamstrings_lateral'],
    secondaryMuscles: ['quadratus', 'quadriceps', 'adductors'],
  };
  const OMUZ = ['subacromial_pain_syndrome', 'anterior_shoulder_instability', 'multidirectional_shoulder_instability', 'ac_joint_injury', 'upper_crossed_pattern', 'thoracic_extension_deficit'] as const;
  const DIZ = ['patellofemoral_pain', 'acl_reconstruction_early', 'patellar_tendinopathy', 'ankle_dorsiflexion_restriction', 'acute_knee_effusion'] as const;

  test('omzu çalıştırmayan harekette pencere etiketi boş diye omuz kuralı "atlandı" sayılmaz', () => {
    const saps = [of('subacromial_pain_syndrome')];
    // Dead Bug: "sorun yok" etiketi olmasa da kas listesi omzu çalıştırmadığını söylüyor.
    for (const tags of [deadBug, { ...deadBug, safeFor: undefined }]) {
      const sonuc = evaluateExercise(tags, saps);
      assert.deepEqual([sonuc.decision, sonuc.skipped, sonuc.pending], [null, 0, []]);
    }
    for (const id of OMUZ) {
      const sonuc = evaluateExercise(deadlift, [of(id)]);
      assert.deepEqual([sonuc.decision, sonuc.skipped], [null, 0], id);
    }
    // Face pull omzu çalıştırıyor: kurallar değerlendirilir (skapular düzlem ipucu), atlanan yok.
    const facePull: ExerciseTags = {
      kineticChain: 'open',
      axialLoading: 'none',
      jointWindows: ['shoulder_elevation_60_90'],
      loadVector: 'horizontal',
      primaryMuscles: ['delt_rear'],
      secondaryMuscles: ['traps_mid', 'traps_lower'],
    };
    const face = evaluateExercise(facePull, saps);
    assert.deepEqual([face.decision, face.skipped], ['cue', 0]);
    // Omzu çalıştıran ama penceresi girilmemiş harekette bilgi gerçekten eksik: kartta sayılır.
    const row: ExerciseTags = { kineticChain: 'open', axialLoading: 'high', primaryMuscles: ['traps_mid'], secondaryMuscles: ['lats_mid', 'delt_rear'] };
    assert.ok(evaluateExercise(row, saps).skipped > 0);
  });

  test('dizi çalıştırmayan harekette diz kuralı ne kartta ne özette sayılır', () => {
    const pallof: ExerciseTags = {
      kineticChain: 'open',
      axialLoading: 'none',
      spinalAlignment: 'neutral',
      contractionType: 'isometric',
      resistanceProfile: 'constant_resistance',
      primaryMuscles: ['obliques'],
      secondaryMuscles: ['abs_upper', 'serratus'],
    };
    for (const id of DIZ) {
      const sonuc = evaluateExercise(pallof, [of(id)]);
      assert.deepEqual([sonuc.decision, sonuc.skipped, sonuc.pending], [null, 0, []], id);
    }
  });

  test('kütüphanede o eklemi çalıştırmayan harekette eklem kuralı "değerlendirilemedi" üretmez', () => {
    const KAS = {
      knee: ['quadriceps', 'hamstrings_medial', 'hamstrings_lateral', 'gastroc_medial', 'gastroc_lateral'],
      shoulder: ['delt_front', 'delt_side', 'delt_rear', 'chest_upper', 'chest_lower', 'lats_upper', 'lats_mid', 'lats_lower', 'traps_upper', 'traps_mid', 'traps_lower', 'serratus'],
    };
    const calistirir = (item: ExerciseTags, joint: 'knee' | 'shoulder') =>
      (item.jointWindows ?? []).some((window) => window.startsWith(joint) || (joint === 'shoulder' && window.startsWith('glenohumeral'))) ||
      [...(item.primaryMuscles ?? []), ...(item.secondaryMuscles ?? [])].some((muscle) => KAS[joint].includes(muscle));
    let denenen = 0;
    for (const item of EXERCISE_LIBRARY) {
      // Elle yazılmış kısıtlar eklem kuralı değil (PT'nin kararı): yalnız kurallar denenir.
      const tags: ExerciseTags = { ...item, contraindications: undefined, safeFor: undefined };
      for (const [joint, ids] of [['shoulder', OMUZ], ['knee', DIZ]] as const) {
        if (calistirir(tags, joint)) continue;
        for (const id of ids) {
          const sonuc = evaluateExercise(tags, [of(id)]);
          assert.deepEqual([sonuc.skipped, sonuc.pending], [0, []], `${item.title} · ${id}`);
          denenen += 1;
        }
      }
    }
    assert.ok(denenen > 100, `${denenen} deneme`);
  });

  test('yalnız danışan bağlamına bağlı bilinmeyen kart başına sayılmaz, özet için bir kez döner', () => {
    const radikulopati = [of('lumbar_disc_herniation_with_radiculopathy')];
    for (const tags of [hipThrust, legExtension, behindNeckPulldown]) {
      const sonuc = evaluateExercise(tags, radikulopati);
      assert.deepEqual([sonuc.decision, sonuc.skipped], [null, 0]);
      assert.deepEqual(sonuc.pending, [{ rule: 'radiculopathy-peripheralizing', needs: 'symptomDirection' }]);
    }
    // Bağlam gelince karar verir, bekleyen kalmaz.
    assert.equal(evaluateExercise(hipThrust, radikulopati, { symptomDirection: 'peripheralizing' }).decision, 'block');
    assert.deepEqual(evaluateExercise(hipThrust, radikulopati, { symptomDirection: 'stable' }).pending, []);
    // Yüklü fleksiyon hareketinde tekrar ve uyanma saati de bağlamdır.
    const kivrik: ExerciseTags = { kineticChain: 'closed', axialLoading: 'none', spinalAlignment: 'flexion' };
    assert.deepEqual(
      evaluateExercise(kivrik, [of('lumbar_disc_herniation')]).pending.map((item) => item.needs),
      ['plannedReps', 'hoursSinceWaking'],
    );
  });

  test('aynı kısıtın birbirini dışlayan hallerine bağlı kurallar tek "atlandı" sayılır', () => {
    // Kütüphanedeki back squat: ağır eksenel yük + PT'nin elle yazdığı "hypertension:uncontrolled".
    const backSquat: ExerciseTags = {
      kineticChain: 'closed',
      axialLoading: 'high',
      spinalAlignment: 'neutral',
      jointWindows: ['knee_flexion_over_90', 'hip_flexion_over_90'],
      primaryMuscles: ['quadriceps', 'glutes'],
      contraindications: ['hypertension:uncontrolled'],
    };
    // Kontrolsüz kuralı, kontrollü kuralı ve elle yasak aynı soruya bağlı (hangi hal?): 3 değil 1.
    const bilinmiyor = evaluateExercise(backSquat, [of('hypertension')]);
    assert.deepEqual([bilinmiyor.decision, bilinmiyor.skipped], [null, 1]);
    // Hal ayrıca seçildiyse niteleyicisiz yazım "değerlendirilemedi" üretmez.
    const kontrollu = evaluateExercise(backSquat, [of('hypertension'), of('hypertension:controlled')]);
    assert.deepEqual([kontrollu.decision, kontrollu.skipped], ['cue', 0]);
    const kontrolsuz = evaluateExercise(backSquat, [of('hypertension'), of('hypertension:uncontrolled')]);
    assert.deepEqual([kontrolsuz.decision, kontrolsuz.skipped], ['block', 0]);
    // PT "sorun yok" dediyse o kısıt için hiç sayılmaz; yasak yine susmaz.
    const sorunYok: ExerciseTags = { ...backSquat, contraindications: [], safeFor: ['hypertension'] };
    assert.equal(evaluateExercise(sorunYok, [of('hypertension')]).skipped, 0);
    assert.equal(evaluateExercise(sorunYok, [of('hypertension:uncontrolled')]).decision, 'block');
  });

  test('liste özeti: her hareket tek kümeye girer; yaptırılmayan kartta "değerlendirilemedi" söylenmez', () => {
    const pfp = [of('patellofemoral_pain')];
    const items = [
      // Yasak (açık zincir sabit direnç) + PT'nin elle yazdığı "şiddetliyse" yasağı: şiddet bilinmiyor.
      { id: 'yasak', ...legExtension, contraindications: ['patellofemoral_pain:severe'] },
      // Uyarı (derin kapalı zincir) + aynı bilinmeyen: daha ağır karar çıkabilir, rozet kartta kalır.
      { id: 'uyari', kineticChain: 'closed', jointWindows: ['knee_flexion_over_90'], primaryMuscles: ['quadriceps'], contraindications: ['patellofemoral_pain:severe'] },
      // Kararsız, direnç profili ve pencere girilmemiş.
      { id: 'eksik', kineticChain: 'open', primaryMuscles: ['quadriceps'] },
      // Hiç etiketi yok: "kontrol edilmedi", "değerlendirilemedi" değil.
      { id: 'etiketsiz', primaryMuscles: ['quadriceps'] },
      // Dizi çalıştırmıyor: etiketli ve hiçbir kural işlemiyor, "uygun".
      { id: 'omuz', kineticChain: 'open', jointWindows: ['shoulder_elevation_60_90'], primaryMuscles: ['delt_rear'] },
    ] satisfies (ExerciseTags & { id: string })[];
    const ozet = summarizeFilter(items, pfp);
    assert.deepEqual(ozet.counts, { blocked: 1, warned: 1, clear: 1, untagged: 1, unassessed: 1 });
    assert.equal(ozet.warnedUnassessed, 1);
    assert.deepEqual(Object.fromEntries(ozet.groups), {
      yasak: 'blocked',
      uyari: 'warned',
      eksik: 'unassessed',
      etiketsiz: 'untagged',
      omuz: 'clear',
    });
    assert.deepEqual(
      [...ozet.cards].map(([id, card]) => [id, card.decision, card.unassessed]),
      [
        ['yasak', 'block', 0],
        ['uyari', 'warn', 1],
        ['eksik', null, 2],
      ],
    );
    assert.deepEqual(ozet.pending, { rules: 0, needs: [] });
  });

  test('liste özeti: danışan bağlamına bağlı kural her kartta değil, bir kez sayılır', () => {
    const items = [
      { id: 'kalca', ...hipThrust },
      { id: 'diz', ...legExtension },
      { id: 'omuz', ...behindNeckPulldown },
    ];
    const radikulopati = summarizeFilter(items, [of('lumbar_disc_herniation_with_radiculopathy')]);
    assert.deepEqual([radikulopati.counts.unassessed, radikulopati.cards.size], [0, 0]);
    assert.deepEqual(radikulopati.pending, { rules: 1, needs: ['symptomDirection'] });
    // ACL: haftaya bağlı iki kural özette; greft tipi bilinmeyen hamstring kuralı leg extension kartında.
    const acl = summarizeFilter(items, [of('acl_reconstruction_early')]);
    assert.deepEqual(acl.pending, { rules: 2, needs: ['weeksPostOp'] });
    assert.deepEqual([...acl.cards].map(([id, card]) => [id, card.decision, card.unassessed]), [['diz', null, 1]]);
    // Kütüphanede radikülopati: 30 kartın hepsi değil, özette tek kural.
    const kutuphane = summarizeFilter(EXERCISE_LIBRARY, [of('lumbar_disc_herniation_with_radiculopathy')]);
    assert.deepEqual([kutuphane.counts.unassessed, kutuphane.pending.rules], [0, 1]);
  });

  test('küme: karar bilinmeyenden önce gelir; etiketsiz hareket "uygun" sayılmaz', () => {
    const cases: [Parameters<typeof filterGroup>[0], FilterGroup][] = [
      [{ decision: 'block', skipped: 2, untagged: false }, 'blocked'],
      // Etiketsiz harekete de hareketten bağımsız kural (kırmızı bayrak) işleyebilir.
      [{ decision: 'block', skipped: 0, untagged: true }, 'blocked'],
      [{ decision: 'warn', skipped: 1, untagged: false }, 'warned'],
      [{ decision: 'cue', skipped: 0, untagged: false }, 'warned'],
      [{ decision: null, skipped: 0, untagged: true }, 'untagged'],
      [{ decision: null, skipped: 1, untagged: true }, 'untagged'],
      [{ decision: null, skipped: 1, untagged: false }, 'unassessed'],
      [{ decision: null, skipped: 0, untagged: false }, 'clear'],
    ];
    for (const [result, group] of cases) assert.equal(filterGroup(result), group, JSON.stringify(result));
    // Cauda equina her hareketi yasaklar: etiketsiz hareket de "kontrol edilmedi" değil, yasak.
    const kauda = summarizeFilter([{ id: 'etiketsiz', primaryMuscles: ['quadriceps'] }], [of('cauda_equina_or_progressive_neuro_deficit')]);
    assert.deepEqual(Object.fromEntries(kauda.groups), { etiketsiz: 'blocked' });
  });

  test('küme sayıları: bütün kütüphanede her hareket tam bir kümede', () => {
    const kisitlar = ['lumbar_disc_herniation', 'subacromial_pain_syndrome', 'patellofemoral_pain', 'anterior_shoulder_instability'].map(of);
    const ozet = summarizeFilter(EXERCISE_LIBRARY, kisitlar);
    assert.equal(ozet.groups.size, EXERCISE_LIBRARY.length);
    const toplam = FILTER_GROUPS.reduce((sum, group) => sum + ozet.counts[group], 0);
    assert.equal(toplam, EXERCISE_LIBRARY.length);
    for (const group of FILTER_GROUPS) {
      assert.equal([...ozet.groups.values()].filter((item) => item === group).length, ozet.counts[group], group);
    }
    // Etiketsiz kütüphane hareketleri "uygun"a karışmaz.
    for (const item of EXERCISE_LIBRARY) {
      if (evaluateExercise(item, kisitlar).untagged && ozet.groups.get(item.id) === 'clear') assert.fail(`${item.id} etiketsiz ama uygun`);
    }
  });

  test('görünüm: "Yasakları gizle" yasak dışını, çip ve "Yalnız uygunları göster" tek kümeyi gösterir', () => {
    assert.equal(inFilterView('blocked', 'all'), true);
    assert.equal(inFilterView(undefined, 'all'), true);
    assert.equal(inFilterView('blocked', 'notBlocked'), false);
    assert.equal(inFilterView('untagged', 'notBlocked'), true);
    assert.equal(inFilterView('clear', 'clear'), true);
    // "Yalnız uygunları göster" kontrol edilmeyeni ve eksik bilgiliyi göstermez.
    assert.equal(inFilterView('untagged', 'clear'), false);
    assert.equal(inFilterView('unassessed', 'clear'), false);
    assert.equal(inFilterView('warned', 'warned'), true);
    // Süzgeç çalışmadıysa (kısıt yok) yalnız "hepsi".
    assert.equal(inFilterView(undefined, 'clear'), false);
  });

  test('üç değerli VEYA: yanlış ∨ bilinmeyen bilinmeyendir, doğru ∨ bilinmeyen doğrudur', () => {
    const spondilolistezis = [of('lumbar_spondylolisthesis')];
    // Kesme düşük (yanlış), yüklü ekstansiyon bilinmiyor (eksenel yük girilmemiş): kural atlanır, sayılır.
    const bilinmiyor = evaluateExercise({ kineticChain: 'closed', shearForce: 'low', spinalAlignment: 'extension' }, spondilolistezis);
    assert.deepEqual([bilinmiyor.decision, bilinmiyor.skipped], [null, 1]);
    // Kesme yüksek: öbür dal bilinmese de yasak.
    assert.equal(evaluateExercise({ kineticChain: 'closed', shearForce: 'high' }, spondilolistezis).decision, 'block');
    // İki dal da yanlış: karar yok, atlanan yok.
    const temiz = evaluateExercise({ kineticChain: 'closed', shearForce: 'low', spinalAlignment: 'neutral' }, spondilolistezis);
    assert.deepEqual([temiz.decision, temiz.skipped], [null, 0]);
  });
});

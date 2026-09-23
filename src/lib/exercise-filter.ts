import {
  conditionInfo,
  type ClientCondition,
  type ConditionId,
  type ConditionQualifier,
  conditionLabel,
  parseCondition,
} from './conditions.ts';

/**
 * Sakatlık süzgeci: egzersizin biyomekanik etiketleri + danışanın kısıtları → karar.
 *
 * Kurallar `docs/research/medical-fitness/contraindication-model.json` içindeki 54
 * kuraldan, etiketlerimizle değerlendirilebilenlerdir; her kuralın `source` alanı
 * araştırmadaki karşılığını gösterir.
 *
 * Üç karar: `block` (yaptırma), `warn` (yaptır ama bil), `cue` (yaptır, şu ipucuyla).
 * Kanıtı zayıf olan hiçbir şey `block` değildir — gereksiz yasak PT'yi bunaltır.
 *
 * Bilgi eksikse kural sessizce atlanır (ör. ameliyat haftası girilmemişse ACL kuralı
 * çalışmaz); atlananlar `skipped` içinde sayılır ki ekran "değerlendirilemedi" diyebilsin.
 */

export const KINETIC_CHAINS = ['open', 'closed', 'semi_closed'] as const;
export type KineticChain = (typeof KINETIC_CHAINS)[number];

/** Omurgaya binen dikey yük: yok / düşük (vücut ağırlığı) / orta / yüksek (bar sırtta). */
export const AXIAL_LOADS = ['none', 'low', 'moderate', 'high'] as const;
export type AxialLoad = (typeof AXIAL_LOADS)[number];

export const SHEAR_LEVELS = ['low', 'moderate', 'high'] as const;
export type ShearLevel = (typeof SHEAR_LEVELS)[number];

export const SPINAL_ALIGNMENTS = [
  'neutral',
  'flexion',
  'extension',
  'flexion_with_rotation',
  'extension_with_rotation',
  'lateral_flexion',
  'unloaded',
] as const;
export type SpinalAlignment = (typeof SPINAL_ALIGNMENTS)[number];

/** Hareketin geçtiği kritik açı pencereleri; kuralların çoğu tek başına eklemi değil pencereyi sorar. */
export const JOINT_WINDOWS = [
  'knee_flexion_0_45',
  'knee_flexion_45_90',
  'knee_flexion_over_90',
  'knee_terminal_extension_0_30',
  'shoulder_elevation_60_90',
  'shoulder_elevation_over_90',
  'shoulder_abduction_90_end_range_er',
  'glenohumeral_extension_beyond_neutral',
  'spine_end_range',
  'hip_flexion_over_90',
] as const;
export type JointWindow = (typeof JOINT_WINDOWS)[number];

export const LOAD_VECTORS = [
  'vertical_axial',
  'anterior_posterior_shear',
  'frontal_lateral',
  'diagonal_scapular_plane',
  'horizontal',
  'horizontal_adduction',
] as const;
export type LoadVector = (typeof LOAD_VECTORS)[number];

export const CONTRACTION_TYPES = [
  'isometric',
  'concentric_emphasis',
  'eccentric_emphasis',
  'isotonic_balanced',
  'energy_storage_ballistic',
] as const;
export type ContractionType = (typeof CONTRACTION_TYPES)[number];

export const RESISTANCE_PROFILES = [
  'bodyweight',
  'constant_resistance',
  'variable_resistance_cam',
  'elastic',
  'free_weight',
  'machine_guided',
] as const;
export type ResistanceProfile = (typeof RESISTANCE_PROFILES)[number];

/** Egzersizin medikal etiketleri; hepsi isteğe bağlıdır (etiketlenmemiş hareket süzülmez). */
export type ExerciseTags = {
  kineticChain?: KineticChain;
  axialLoading?: AxialLoad;
  shearForce?: ShearLevel;
  spinalAlignment?: SpinalAlignment;
  jointWindows?: readonly JointWindow[];
  loadVector?: LoadVector;
  contractionType?: ContractionType;
  resistanceProfile?: ResistanceProfile;
  /** Yük altında omuz iç rotasyonda mı (upright row, empty can). */
  internalRotationUnderLoad?: boolean;
  /** Hareketin çalıştırdığı kaslar: kuralın ilgili eklemi tutup tutmadığını anlamak için. */
  primaryMuscles?: readonly string[];
  secondaryMuscles?: readonly string[];
  /** PT'nin elle işaretlediği kısıtlar ("lumbar_disc_herniation:acute"). */
  contraindications?: readonly string[];
  /** PT'nin "bunda sorun yok" dediği kısıtlar; uyarıyı susturur, yasağı susturmaz. */
  safeFor?: readonly string[];
};

/** Kuralların ihtiyaç duyduğu, egzersizde değil ortamda olan bilgiler. */
export type FilterContext = {
  /** ACL rekonstrüksiyonundan bu yana geçen hafta. */
  weeksPostOp?: number;
  graftType?: 'hamstring' | 'patellar_tendon' | 'other';
  /** Son seansta semptom yönü: aşağı yayılıyorsa program durur. */
  symptomDirection?: 'centralizing' | 'stable' | 'peripheralizing';
  /** Uyanmadan bu yana geçen saat (sabah fleksiyon kuralı). */
  hoursSinceWaking?: number;
  plannedReps?: number;
  /** Tendinopati evresi: 1 izometrik, 2 izotonik, 3 enerji depolama, 4 spora dönüş. */
  tendinopathyStage?: 1 | 2 | 3 | 4;
  /** Derin squat'ta topuk yükseltildi mi. */
  heelElevated?: boolean;
};

export const DECISIONS = ['block', 'warn', 'cue'] as const;
export type Decision = (typeof DECISIONS)[number];

export type Finding = {
  decision: Decision;
  condition: ClientCondition;
  /** PT'ye gösterilecek cümle. */
  message: string;
  rule: string;
};

type Rule = {
  id: string;
  /** Hangi kısıt için; 'any' her kısıtta çalışır. */
  condition: ConditionId;
  decision: Decision;
  message: string;
  /** Yalnız bu niteleyicilerde geçerli (boşsa hepsinde). */
  qualifiers?: readonly ConditionQualifier[];
  /** `true` → kural işler, `false` → işlemez, `null` → bilgi eksik, kural atlanır. */
  match: (tags: ExerciseTags, context: FilterContext) => boolean | null;
};

const has = (windows: readonly JointWindow[] | undefined, window: JointWindow) =>
  windows === undefined ? null : windows.includes(window);

const loaded = (tags: ExerciseTags) =>
  tags.axialLoading === undefined ? null : tags.axialLoading === 'moderate' || tags.axialLoading === 'high';

const KNEE_MUSCLES = ['quadriceps', 'hamstrings_medial', 'hamstrings_lateral', 'gastroc_medial', 'gastroc_lateral'];
const SHOULDER_MUSCLES = ['delt_front', 'delt_side', 'delt_rear', 'chest_upper', 'chest_lower', 'lats_upper', 'lats_mid', 'lats_lower', 'traps_upper', 'traps_mid', 'traps_lower', 'serratus'];

/**
 * Kural ilgili eklemi tutuyor mu? Diz kuralı face pull'u, omuz kuralı squat'ı
 * yasaklamasın diye. Bilgi yoksa `null` → kural atlanır (sessiz yanlış karar yok).
 */
function touches(tags: ExerciseTags, joint: 'knee' | 'shoulder'): boolean | null {
  const windows = tags.jointWindows;
  const muscles = [...(tags.primaryMuscles ?? []), ...(tags.secondaryMuscles ?? [])];
  const onar = joint === 'knee' ? KNEE_MUSCLES : SHOULDER_MUSCLES;
  const pencere = joint === 'knee' ? 'knee' : 'shoulder';
  if (windows?.some((item) => item.startsWith(pencere) || (joint === 'shoulder' && item.startsWith('glenohumeral')))) return true;
  if (muscles.some((muscle) => onar.includes(muscle))) return true;
  return windows === undefined && muscles.length === 0 ? null : false;
}

/** İki bilinmeyene dayanan kurallarda: biri bilinmiyorsa kural atlanır. */
const and = (...values: (boolean | null)[]): boolean | null =>
  values.some((value) => value === null) ? null : values.every(Boolean);

export const RULES: readonly Rule[] = [
  // --- Omurga ---
  {
    id: 'disc-flexion-rotation',
    condition: 'lumbar_disc_herniation',
    decision: 'block',
    message: 'Yüklü fleksiyon + rotasyon birleşimi diskte en riskli yüklemedir; anti-rotasyon hareketiyle değiştir.',
    match: (tags) => (tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'flexion_with_rotation'),
  },
  {
    id: 'disc-loaded-flexion',
    condition: 'lumbar_disc_herniation',
    decision: 'block',
    message: 'Omurga fleksiyondayken orta/yüksek eksenel yük var; nötr omurgalı bir varyanta geç.',
    match: (tags) => and(tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'flexion', loaded(tags)),
  },
  {
    id: 'disc-flexion-high-reps',
    condition: 'lumbar_disc_herniation',
    decision: 'warn',
    message: 'Disk hasarı tek ağır tekrardan değil, tekrarlı fleksiyon siklüslerinden birikir: tekrar sayısını düşür.',
    match: (tags, context) =>
      and(
        tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'flexion',
        context.plannedReps === undefined ? null : context.plannedReps > 15,
      ),
  },
  {
    id: 'disc-morning-flexion',
    condition: 'lumbar_disc_herniation',
    decision: 'warn',
    message: 'Uyanmadan sonraki ilk saatlerde diskteki bükülme stresi katlanır; fleksiyonlu işi güne yay.',
    match: (tags, context) =>
      and(
        tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'flexion',
        context.hoursSinceWaking === undefined ? null : context.hoursSinceWaking < 2,
      ),
  },
  {
    id: 'flexion-intolerant-end-range',
    condition: 'flexion_intolerant_back',
    decision: 'block',
    message: 'Son aralık omurga fleksiyonu bu profilde semptomu tetikler; hareketi nötr aralıkta bitir.',
    match: (tags) => and(tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'flexion', has(tags.jointWindows, 'spine_end_range')),
  },
  {
    id: 'spondylolisthesis-shear',
    condition: 'lumbar_spondylolisthesis',
    decision: 'block',
    message: 'Yüksek kesme kuvveti ya da yüklü ekstansiyon kaymayı artırır; desteklenmiş bir varyant seç.',
    match: (tags) => {
      const shear = tags.shearForce === undefined ? null : tags.shearForce === 'high';
      const extension = and(tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'extension', loaded(tags));
      if (shear === true || extension === true) return true;
      return shear === null || extension === null ? null : false;
    },
  },
  {
    id: 'stenosis-loaded-extension',
    condition: 'lumbar_stenosis',
    decision: 'warn',
    message: 'Stenozda ekstansiyon intoleransı tipiktir; yüklü ekstansiyonda semptomu sor.',
    match: (tags) => and(tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'extension', loaded(tags)),
  },
  {
    id: 'radiculopathy-peripheralizing',
    condition: 'lumbar_disc_herniation_with_radiculopathy',
    decision: 'block',
    message: 'Son seansta semptom aşağı yayılmış: yükleme durur, önce merkezileşme sağlanır.',
    match: (_tags, context) =>
      context.symptomDirection === undefined ? null : context.symptomDirection === 'peripheralizing',
  },
  {
    id: 'cauda-equina',
    condition: 'cauda_equina_or_progressive_neuro_deficit',
    decision: 'block',
    message: 'Egzersiz yazılmaz: acil tıbbi değerlendirme gerekir.',
    match: () => true,
  },

  // --- Diz ---
  {
    id: 'pfp-open-chain-constant',
    condition: 'patellofemoral_pain',
    decision: 'block',
    message: 'Açık zincir sabit dirençte patellofemoral basınç tepe yapar; kapalı zincir bir varyanta geç.',
    match: (tags) =>
      and(
        touches(tags, 'knee'),
        tags.kineticChain === undefined ? null : tags.kineticChain === 'open',
        tags.resistanceProfile === undefined ? null : tags.resistanceProfile === 'constant_resistance',
      ),
  },
  {
    id: 'pfp-deep-closed-chain',
    condition: 'patellofemoral_pain',
    decision: 'warn',
    message: '90° üstü diz fleksiyonunda kapalı zincirde basınç artar; derinliği ağrısız aralıkta tut.',
    match: (tags) => and(tags.kineticChain === undefined ? null : tags.kineticChain === 'closed', has(tags.jointWindows, 'knee_flexion_over_90')),
  },
  {
    id: 'pfp-terminal-extension',
    condition: 'patellofemoral_pain',
    decision: 'warn',
    message: 'Açık zincirde 0–30° terminal aralık en yüksek stres bölgesidir; ROM’u 90–45° arasına al.',
    match: (tags) => and(tags.kineticChain === undefined ? null : tags.kineticChain === 'open', has(tags.jointWindows, 'knee_terminal_extension_0_30')),
  },
  {
    id: 'acl-open-chain-early',
    condition: 'acl_reconstruction_early',
    decision: 'block',
    message: 'İlk 4 haftada açık zincir diz ekstansiyonu greft üzerinde anterior kayma üretir.',
    match: (tags, context) =>
      and(
        touches(tags, 'knee'),
        tags.kineticChain === undefined ? null : tags.kineticChain === 'open',
        context.weeksPostOp === undefined ? null : context.weeksPostOp < 4,
      ),
  },
  {
    id: 'acl-open-chain-rom',
    condition: 'acl_reconstruction_early',
    decision: 'block',
    message: 'Bu dönemde açık zincir yalnız korunan ROM penceresinde yapılır; terminal ekstansiyona girme.',
    match: (tags, context) =>
      and(
        tags.kineticChain === undefined ? null : tags.kineticChain === 'open',
        context.weeksPostOp === undefined ? null : context.weeksPostOp >= 4 && context.weeksPostOp < 12,
        has(tags.jointWindows, 'knee_terminal_extension_0_30'),
      ),
  },
  {
    id: 'acl-hamstring-graft-load',
    condition: 'acl_reconstruction_early',
    decision: 'block',
    message: 'Hamstring grefti ilk 12 haftada yüklü açık zincir diz fleksiyonunu kaldırmaz.',
    match: (tags, context) =>
      and(
        touches(tags, 'knee'),
        tags.kineticChain === undefined ? null : tags.kineticChain === 'open',
        context.graftType === undefined ? null : context.graftType === 'hamstring',
        context.weeksPostOp === undefined ? null : context.weeksPostOp < 12,
      ),
  },
  {
    id: 'tendinopathy-ballistic',
    condition: 'patellar_tendinopathy',
    decision: 'block',
    message: 'Enerji depolayan (balistik) yükleme erken evrede ağrıyı azdırır; izometrik/izotonik evreyi tamamla.',
    match: (tags, context) =>
      and(
        touches(tags, 'knee'),
        tags.contractionType === undefined ? null : tags.contractionType === 'energy_storage_ballistic',
        context.tendinopathyStage === undefined ? true : context.tendinopathyStage <= 2,
      ),
  },
  {
    id: 'ankle-df-deep-squat',
    condition: 'ankle_dorsiflexion_restriction',
    decision: 'warn',
    message: 'Dorsifleksiyon yetmezken derin squat açığı belden kapatır; topuk yükselt ya da derinliği kıs.',
    match: (tags, context) =>
      and(
        has(tags.jointWindows, 'knee_flexion_over_90'),
        loaded(tags),
        context.heelElevated === undefined ? true : !context.heelElevated,
      ),
  },
  {
    id: 'knee-effusion-load',
    condition: 'acute_knee_effusion',
    decision: 'warn',
    message: 'Efüzyon kuadrisepsi inhibe eder; yükü artırma, şişlik geçene kadar hacmi koru.',
    match: (tags) => and(touches(tags, 'knee'), tags.axialLoading === undefined ? null : tags.axialLoading !== 'none'),
  },

  // --- Omuz ---
  {
    id: 'saps-behind-neck',
    condition: 'subacromial_pain_syndrome',
    decision: 'block',
    message: '90° abduksiyon + son aralık dış rotasyon (ense arkası) subakromiyal aralığı daraltır.',
    match: (tags) => has(tags.jointWindows, 'shoulder_abduction_90_end_range_er'),
  },
  {
    id: 'saps-internal-rotation-overhead',
    condition: 'subacromial_pain_syndrome',
    decision: 'block',
    message: 'Yük altında iç rotasyonda kol kaldırmak (upright row, empty can) tendonu sıkıştırır.',
    match: (tags) =>
      and(
        tags.internalRotationUnderLoad === undefined ? null : tags.internalRotationUnderLoad,
        has(tags.jointWindows, 'shoulder_elevation_over_90'),
      ),
  },
  {
    id: 'saps-overhead-repetitive',
    condition: 'subacromial_pain_syndrome',
    decision: 'warn',
    message: '90° üstü tekrarlı yükleme semptomu azdırabilir; skapular düzlemde ve ağrısız aralıkta çalış.',
    match: (tags) => has(tags.jointWindows, 'shoulder_elevation_over_90'),
  },
  {
    id: 'saps-scapular-plane-cue',
    condition: 'subacromial_pain_syndrome',
    decision: 'cue',
    message: 'Kolu gövdeden 30–45° önde (skapular düzlemde) çalıştır, tam yan düzlemde değil.',
    match: (tags) =>
      and(
        has(tags.jointWindows, 'shoulder_elevation_60_90'),
        tags.loadVector === undefined ? null : tags.loadVector !== 'diagonal_scapular_plane',
      ),
  },
  {
    id: 'instability-apprehension',
    condition: 'anterior_shoulder_instability',
    decision: 'block',
    message: '90° abduksiyon + son aralık dış rotasyon apprehension pozisyonudur; anterior kapsülü zorlar.',
    match: (tags) => has(tags.jointWindows, 'shoulder_abduction_90_end_range_er'),
  },
  {
    id: 'instability-gh-extension',
    condition: 'anterior_shoulder_instability',
    decision: 'block',
    message: 'Dirseğin gövde hizasının arkasına yüklü inmesi anterior kapsülü gerer; ROM’u sınırla (floor press).',
    match: (tags) => and(has(tags.jointWindows, 'glenohumeral_extension_beyond_neutral'), loaded(tags)),
  },
  {
    id: 'mdi-end-range',
    condition: 'multidirectional_shoulder_instability',
    decision: 'block',
    message: 'Son aralık omuz yüklemesi ve pasif kapsül germesi gevşekliği artırır.',
    match: (tags) => {
      const abd = has(tags.jointWindows, 'shoulder_abduction_90_end_range_er');
      const ext = has(tags.jointWindows, 'glenohumeral_extension_beyond_neutral');
      if (abd === true || ext === true) return true;
      return abd === null || ext === null ? null : false;
    },
  },
  {
    id: 'ac-horizontal-adduction',
    condition: 'ac_joint_injury',
    decision: 'block',
    message: 'Yüklü horizontal adduksiyon AC eklemini sıkıştırır; ROM’u kıs ya da nötr tutuşa geç.',
    match: (tags) => and(tags.loadVector === undefined ? null : tags.loadVector === 'horizontal_adduction', loaded(tags)),
  },
  {
    id: 'upper-crossed-overhead',
    condition: 'upper_crossed_pattern',
    decision: 'warn',
    message: 'Skapular kontrol kurulmadan baş üstü itiş paterni pekiştirir; önce alt trapez/serratus çalış.',
    match: (tags) => has(tags.jointWindows, 'shoulder_elevation_over_90'),
  },
  {
    id: 'thoracic-deficit-overhead',
    condition: 'thoracic_extension_deficit',
    decision: 'warn',
    message: 'Torasik ekstansiyon yetmezken baş üstü açığı bel hiperekstansiyonuyla kapanır; landmine varyantına geç.',
    match: (tags) => has(tags.jointWindows, 'shoulder_elevation_over_90'),
  },

  // --- Sistemik ---
  {
    id: 'hypertension-valsalva',
    condition: 'hypertension',
    decision: 'block',
    qualifiers: ['uncontrolled'],
    message: 'Kontrolsüz tansiyonda ağır eksenel yük + nefes tutma kan basıncını ani yükseltir.',
    match: (tags) => (tags.axialLoading === undefined ? null : tags.axialLoading === 'high'),
  },
  {
    id: 'hypertension-valsalva-controlled',
    condition: 'hypertension',
    decision: 'cue',
    qualifiers: ['controlled'],
    message: 'Ağır sette nefesi tutma; kalkışta ver. Maksimal denemelerden kaçın.',
    match: (tags) => (tags.axialLoading === undefined ? null : tags.axialLoading === 'high'),
  },
  {
    id: 'pregnancy-axial-load',
    condition: 'pregnancy_second_third_trimester',
    decision: 'warn',
    message: 'Ağır eksenel yük ve sırtüstü uzun kalma bu dönemde uygun değil; yük vektörünü değiştir.',
    match: (tags) => (tags.axialLoading === undefined ? null : tags.axialLoading === 'high'),
  },
];

export type FilterResult = {
  /** En ağır karar; hiçbir kural işlemediyse `null`. */
  decision: Decision | null;
  findings: Finding[];
  /** Bilgi eksikliğinden değerlendirilemeyen kural sayısı. */
  skipped: number;
  /** Egzersizde hiç etiket yoksa süzgeç çalışmaz; ekran bunu söylemeli. */
  untagged: boolean;
};

const ORDER: Record<Decision, number> = { block: 3, warn: 2, cue: 1 };

/** PT'nin egzersize elle yazdığı kısıtlar ("id" ya da "id:nitelik"). */
function manualMatch(list: readonly string[] | undefined, condition: ClientCondition): boolean {
  if (!list) return false;
  return list.some((entry) => {
    const parsed = parseCondition(entry);
    if (!parsed || parsed.id !== condition.id) return false;
    // Niteleyicisiz yazılmışsa her şiddeti kapsar; yazılmışsa birebir eşleşmeli.
    return parsed.qualifier === undefined || parsed.qualifier === condition.qualifier;
  });
}

const isTagged = (tags: ExerciseTags) =>
  Boolean(
    tags.kineticChain ||
      tags.axialLoading ||
      tags.shearForce ||
      tags.spinalAlignment ||
      tags.jointWindows?.length ||
      tags.loadVector ||
      tags.contractionType ||
      tags.resistanceProfile ||
      tags.contraindications?.length,
  );

/**
 * Egzersizi danışanın kısıtlarına göre değerlendirir. Aynı kısıt için birden çok
 * bulgu çıkabilir; ekran en ağırını gösterip gerisini altında sıralar.
 */
export function evaluateExercise(
  tags: ExerciseTags,
  conditions: readonly ClientCondition[],
  context: FilterContext = {},
): FilterResult {
  const findings: Finding[] = [];
  let skipped = 0;

  for (const condition of conditions) {
    // PT elle yasakladıysa kural aramaya gerek yok.
    if (manualMatch(tags.contraindications, condition)) {
      findings.push({
        decision: 'block',
        condition,
        message: `${conditionLabel(condition)} için işaretlenmiş: bu harekette yaptırma.`,
        rule: 'manual',
      });
      continue;
    }
    const cleared = manualMatch(tags.safeFor, condition);

    for (const rule of RULES) {
      if (rule.condition !== condition.id) continue;
      if (rule.qualifiers && !(condition.qualifier && rule.qualifiers.includes(condition.qualifier))) continue;
      // PT "bunda sorun yok" dediyse uyarı susar; yasak susmaz (kırmızı bayrak da susmaz).
      if (cleared && rule.decision !== 'block') continue;

      const hit = rule.match(tags, context);
      if (hit === null) {
        skipped += 1;
        continue;
      }
      if (hit) findings.push({ decision: rule.decision, condition, message: rule.message, rule: rule.id });
    }
  }

  findings.sort((a, b) => ORDER[b.decision] - ORDER[a.decision]);
  return {
    decision: findings[0]?.decision ?? null,
    findings,
    skipped,
    untagged: !isTagged(tags),
  };
}

/** Kısıt listesindeki tıbbi izin gerektirenler (egzersizden bağımsız). */
export function requiresClearance(conditions: readonly ClientCondition[]): ClientCondition[] {
  return conditions.filter((condition) => conditionInfo(condition.id).redFlag);
}

/* --- Ekranda görünen adlar --- */

export const KINETIC_CHAIN_LABELS: Record<KineticChain, string> = {
  open: 'Açık zincir (uç serbest)',
  closed: 'Kapalı zincir (ayak/el sabit)',
  semi_closed: 'Yarı kapalı',
};

export const AXIAL_LOAD_LABELS: Record<AxialLoad, string> = {
  none: 'Yok (omurgaya binmiyor)',
  low: 'Düşük',
  moderate: 'Orta',
  high: 'Yüksek (bar omurga üstünde)',
};

export const SHEAR_LEVEL_LABELS: Record<ShearLevel, string> = {
  low: 'Düşük',
  moderate: 'Orta',
  high: 'Yüksek',
};

export const SPINAL_ALIGNMENT_LABELS: Record<SpinalAlignment, string> = {
  neutral: 'Nötr',
  flexion: 'Fleksiyon (öne bükülme)',
  extension: 'Ekstansiyon (geriye)',
  flexion_with_rotation: 'Fleksiyon + rotasyon',
  extension_with_rotation: 'Ekstansiyon + rotasyon',
  lateral_flexion: 'Yana eğilme',
  unloaded: 'Yüksüz (omurga çalışmıyor)',
};

export const JOINT_WINDOW_LABELS: Record<JointWindow, string> = {
  knee_flexion_0_45: 'Diz 0–45°',
  knee_flexion_45_90: 'Diz 45–90°',
  knee_flexion_over_90: 'Diz 90° üstü',
  knee_terminal_extension_0_30: 'Diz terminal ekstansiyon (0–30°)',
  shoulder_elevation_60_90: 'Omuz 60–90°',
  shoulder_elevation_over_90: 'Omuz 90° üstü',
  shoulder_abduction_90_end_range_er: 'Omuz 90° abduksiyon + son aralık dış rotasyon',
  glenohumeral_extension_beyond_neutral: 'Dirsek gövde hizasının arkasında',
  spine_end_range: 'Omurga son aralık',
  hip_flexion_over_90: 'Kalça 90° üstü',
};

export const LOAD_VECTOR_LABELS: Record<LoadVector, string> = {
  vertical_axial: 'Dikey (eksenel)',
  anterior_posterior_shear: 'Ön-arka kesme',
  frontal_lateral: 'Yana',
  diagonal_scapular_plane: 'Skapular düzlem (çapraz)',
  horizontal: 'Yatay',
  horizontal_adduction: 'Yatay adduksiyon (göğüste kapanma)',
};

export const CONTRACTION_TYPE_LABELS: Record<ContractionType, string> = {
  isometric: 'İzometrik (tutuş)',
  concentric_emphasis: 'Konsantrik ağırlıklı',
  eccentric_emphasis: 'Eksantrik ağırlıklı',
  isotonic_balanced: 'Dengeli izotonik',
  energy_storage_ballistic: 'Balistik (enerji depolayan)',
};

export const RESISTANCE_PROFILE_LABELS: Record<ResistanceProfile, string> = {
  bodyweight: 'Vücut ağırlığı',
  constant_resistance: 'Sabit direnç',
  variable_resistance_cam: 'Kam (değişken direnç)',
  elastic: 'Elastik bant',
  free_weight: 'Serbest ağırlık',
  machine_guided: 'Makine (yönlendirilmiş)',
};

export const DECISION_LABELS: Record<Decision, string> = {
  block: 'Yaptırma',
  warn: 'Dikkat',
  cue: 'İpucu ver',
};

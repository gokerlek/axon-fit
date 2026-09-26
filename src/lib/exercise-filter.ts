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
 * Bilgi eksikse kural sessizce atlanır ve sayılır ki ekran "değerlendirilemedi" diyebilsin. Hareketin
 * etiketi, kısıtın hali (niteleyici) ya da sabit bir bilgi (greft tipi, topuk) eksikse kartta sayılır
 * (`skipped`); yalnız zamanla değişen danışan bağlamı (ameliyat haftası, semptom yönü…) eksikse kart
 * başına değil, özet satırında bir kez söylenir (`pending`): liste önizlemesinde bağlam hiç yoktur.
 *
 * Eklem kuralları yalnız o eklemi çalıştıran harekete işler (`touches`): kas listesi hareketin omzu
 * çalıştırmadığını gösteriyorsa omuz kuralı pencere etiketi boş diye "atlandı" sayılmaz.
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

/**
 * Zamanla ya da seansla değişen danışan bağlamı. Liste önizlemesinde hiç yoktur, danışanın programında
 * ve seansında dolar; yalnız bunlar eksik kaldığı için karar veremeyen kural her kartta değil, özet
 * satırında bir kez söylenir. Greft tipi ve topuk sabit bilgidir (ameliyatın ve hareketin yapılışının),
 * eksikse kural kartta sayılır.
 */
export const CONTEXT_LABELS = {
  weeksPostOp: 'ameliyat haftası',
  symptomDirection: 'semptom yönü',
  tendinopathyStage: 'tendinopati evresi',
  plannedReps: 'planlanan tekrar',
  hoursSinceWaking: 'uyanmadan geçen süre',
} as const satisfies Partial<Record<keyof FilterContext, string>>;
export type TimedContext = keyof typeof CONTEXT_LABELS;

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
  /**
   * Hareketin tarafı — etiketler ve sabit bilgiler (greft tipi, topuğun yükseltilmesi): `true` → kural
   * işler, `false` → işlemez, `null` → bilgi eksik, kural atlanır ve kartta sayılır.
   */
  match: (tags: ExerciseTags, context: FilterContext) => boolean | null;
  /**
   * Zamanla değişen danışan bağlamına bağlı kısım; `needs` hangi bilgi olduğunu söyler. `null` → bağlam
   * yok: kural atlanır, kart başına değil özet satırında bir kez sayılır (`FilterResult.pending`).
   */
  when?: { needs: TimedContext; test: (context: FilterContext, condition: ClientCondition) => boolean | null };
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

/**
 * Üç değerli (Kleene) VE: biri yanlışsa kural işlemez, öbürü bilinmese de (diz çalıştırmayan
 * face pull ACL kuralında "atlandı" sayılmaz); yanlış yoksa ve biri bilinmiyorsa kural atlanır.
 */
const and = (...values: (boolean | null)[]): boolean | null =>
  values.includes(false) ? false : values.includes(null) ? null : true;

/** Üç değerli VEYA: biri doğruysa doğru; doğru yoksa biri bilinmiyorsa bilinmiyor (yanlış ∨ bilinmeyen = bilinmeyen). */
const or = (...values: (boolean | null)[]): boolean | null =>
  values.includes(true) ? true : values.includes(null) ? null : false;

/**
 * Tendinopati erken evrede mi (1 izometrik, 2 izotonik)? Evre bağlamdan gelir; yoksa `:reactive`
 * niteleyicisi erken evre sayılır: reaktif tendon izometrik ve izotonik yüklemeyle başlar (Malliaras
 * 2015, `stage in (stage_1, stage_2) → block`). Evrenin kayıtta alanı yok (Faz 5b): o gelene kadar
 * balistik kuralı yalnız bu niteleyiciyle ya da bağlamla karar verir; ikisi de yoksa atlanır.
 */
function earlyTendinopathy(context: FilterContext, condition: ClientCondition): boolean | null {
  if (context.tendinopathyStage !== undefined) return context.tendinopathyStage <= 2;
  return condition.qualifier === 'reactive' ? true : null;
}

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
    match: (tags) => (tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'flexion'),
    when: { needs: 'plannedReps', test: (context) => (context.plannedReps === undefined ? null : context.plannedReps > 15) },
  },
  {
    id: 'disc-morning-flexion',
    condition: 'lumbar_disc_herniation',
    decision: 'warn',
    message: 'Uyanmadan sonraki ilk saatlerde diskteki bükülme stresi katlanır; fleksiyonlu işi güne yay.',
    match: (tags) => (tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'flexion'),
    when: {
      needs: 'hoursSinceWaking',
      test: (context) => (context.hoursSinceWaking === undefined ? null : context.hoursSinceWaking < 2),
    },
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
    match: (tags) =>
      or(
        tags.shearForce === undefined ? null : tags.shearForce === 'high',
        and(tags.spinalAlignment === undefined ? null : tags.spinalAlignment === 'extension', loaded(tags)),
      ),
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
    // Hareketten bağımsız: semptom aşağı yayılıyorsa bütün yükleme durur. Bilinmiyorsa her kartta
    // değil, özet satırında bir kez söylenir.
    match: () => true,
    when: {
      needs: 'symptomDirection',
      test: (context) => (context.symptomDirection === undefined ? null : context.symptomDirection === 'peripheralizing'),
    },
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
    match: (tags) =>
      and(
        touches(tags, 'knee'),
        tags.kineticChain === undefined ? null : tags.kineticChain === 'closed',
        has(tags.jointWindows, 'knee_flexion_over_90'),
      ),
  },
  {
    id: 'pfp-terminal-extension',
    condition: 'patellofemoral_pain',
    decision: 'warn',
    message: 'Açık zincirde 0–30° terminal aralık en yüksek stres bölgesidir; ROM’u 90–45° arasına al.',
    match: (tags) =>
      and(
        touches(tags, 'knee'),
        tags.kineticChain === undefined ? null : tags.kineticChain === 'open',
        has(tags.jointWindows, 'knee_terminal_extension_0_30'),
      ),
  },
  {
    id: 'acl-open-chain-early',
    condition: 'acl_reconstruction_early',
    decision: 'block',
    message: 'İlk 4 haftada açık zincir diz ekstansiyonu greft üzerinde anterior kayma üretir.',
    match: (tags) => and(touches(tags, 'knee'), tags.kineticChain === undefined ? null : tags.kineticChain === 'open'),
    when: { needs: 'weeksPostOp', test: (context) => (context.weeksPostOp === undefined ? null : context.weeksPostOp < 4) },
  },
  {
    id: 'acl-open-chain-rom',
    condition: 'acl_reconstruction_early',
    decision: 'block',
    message: 'Bu dönemde açık zincir yalnız korunan ROM penceresinde yapılır; terminal ekstansiyona girme.',
    // Pencere haftayla açılır (4. hafta 90–45°, … 7. hafta 90–10°), 8. haftada tam ROM.
    match: (tags) =>
      and(
        touches(tags, 'knee'),
        tags.kineticChain === undefined ? null : tags.kineticChain === 'open',
        has(tags.jointWindows, 'knee_terminal_extension_0_30'),
      ),
    when: {
      needs: 'weeksPostOp',
      test: (context) => (context.weeksPostOp === undefined ? null : context.weeksPostOp >= 4 && context.weeksPostOp < 8),
    },
  },
  {
    id: 'acl-hamstring-graft-load',
    condition: 'acl_reconstruction_early',
    decision: 'block',
    message: 'Hamstring grefti ilk 12 haftada yüklü açık zincir diz fleksiyonunu kaldırmaz.',
    // Kaynakta `external_load_kg > 0`: vücut ağırlığı dışındaki her direnç (bant dahil) dış yüktür.
    // Greft tipi ameliyatın sabit bilgisidir: bilinmezse kural kartta sayılır.
    match: (tags, context) =>
      and(
        touches(tags, 'knee'),
        tags.kineticChain === undefined ? null : tags.kineticChain === 'open',
        tags.resistanceProfile === undefined ? null : tags.resistanceProfile !== 'bodyweight',
        context.graftType === undefined ? null : context.graftType === 'hamstring',
      ),
    when: { needs: 'weeksPostOp', test: (context) => (context.weeksPostOp === undefined ? null : context.weeksPostOp < 12) },
  },
  {
    id: 'tendinopathy-ballistic',
    condition: 'patellar_tendinopathy',
    decision: 'block',
    message: 'Enerji depolayan (balistik) yükleme erken evrede ağrıyı azdırır; izometrik/izotonik evreyi tamamla.',
    match: (tags) =>
      and(touches(tags, 'knee'), tags.contractionType === undefined ? null : tags.contractionType === 'energy_storage_ballistic'),
    when: { needs: 'tendinopathyStage', test: earlyTendinopathy },
  },
  {
    id: 'ankle-df-deep-squat',
    condition: 'ankle_dorsiflexion_restriction',
    decision: 'warn',
    message: 'Dorsifleksiyon yetmezken derin squat açığı belden kapatır; topuk yükselt ya da derinliği kıs.',
    // Topuğun yükseltilmesi hareketin yapılışıdır (sabit bilgi): bilinmezse kural kartta sayılır.
    // Kayıtta alanı yok (Faz 5b); o gelene kadar kural yalnız bağlamdaki `heelElevated` ile karar verir.
    match: (tags, context) =>
      and(
        touches(tags, 'knee'),
        has(tags.jointWindows, 'knee_flexion_over_90'),
        loaded(tags),
        context.heelElevated === undefined ? null : !context.heelElevated,
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
    match: (tags) => and(touches(tags, 'shoulder'), has(tags.jointWindows, 'shoulder_abduction_90_end_range_er')),
  },
  {
    id: 'saps-internal-rotation-overhead',
    condition: 'subacromial_pain_syndrome',
    decision: 'block',
    message: 'Yük altında iç rotasyonda kol kaldırmak (upright row, empty can) tendonu sıkıştırır.',
    match: (tags) =>
      and(
        touches(tags, 'shoulder'),
        tags.internalRotationUnderLoad === undefined ? null : tags.internalRotationUnderLoad,
        has(tags.jointWindows, 'shoulder_elevation_over_90'),
      ),
  },
  {
    id: 'saps-overhead-repetitive',
    condition: 'subacromial_pain_syndrome',
    decision: 'warn',
    message: '90° üstü tekrarlı yükleme semptomu azdırabilir; skapular düzlemde ve ağrısız aralıkta çalış.',
    match: (tags) => and(touches(tags, 'shoulder'), has(tags.jointWindows, 'shoulder_elevation_over_90')),
  },
  {
    id: 'saps-scapular-plane-cue',
    condition: 'subacromial_pain_syndrome',
    decision: 'cue',
    message: 'Kolu gövdeden 30–45° önde (skapular düzlemde) çalıştır, tam yan düzlemde değil.',
    match: (tags) =>
      and(
        touches(tags, 'shoulder'),
        has(tags.jointWindows, 'shoulder_elevation_60_90'),
        tags.loadVector === undefined ? null : tags.loadVector !== 'diagonal_scapular_plane',
      ),
  },
  {
    id: 'instability-apprehension',
    condition: 'anterior_shoulder_instability',
    decision: 'block',
    message: '90° abduksiyon + son aralık dış rotasyon apprehension pozisyonudur; anterior kapsülü zorlar.',
    match: (tags) => and(touches(tags, 'shoulder'), has(tags.jointWindows, 'shoulder_abduction_90_end_range_er')),
  },
  {
    id: 'instability-gh-extension',
    condition: 'anterior_shoulder_instability',
    decision: 'block',
    message: 'Dirseğin gövde hizasının arkasına yüklü inmesi anterior kapsülü gerer; ROM’u sınırla (floor press).',
    match: (tags) => and(touches(tags, 'shoulder'), has(tags.jointWindows, 'glenohumeral_extension_beyond_neutral'), loaded(tags)),
  },
  {
    id: 'mdi-end-range',
    condition: 'multidirectional_shoulder_instability',
    decision: 'block',
    message: 'Son aralık omuz yüklemesi ve pasif kapsül germesi gevşekliği artırır.',
    match: (tags) =>
      and(
        touches(tags, 'shoulder'),
        or(has(tags.jointWindows, 'shoulder_abduction_90_end_range_er'), has(tags.jointWindows, 'glenohumeral_extension_beyond_neutral')),
      ),
  },
  {
    id: 'ac-horizontal-adduction',
    condition: 'ac_joint_injury',
    decision: 'block',
    message: 'Yüklü horizontal adduksiyon AC eklemini sıkıştırır; ROM’u kıs ya da nötr tutuşa geç.',
    match: (tags) =>
      and(touches(tags, 'shoulder'), tags.loadVector === undefined ? null : tags.loadVector === 'horizontal_adduction', loaded(tags)),
  },
  {
    id: 'upper-crossed-overhead',
    condition: 'upper_crossed_pattern',
    decision: 'warn',
    message: 'Skapular kontrol kurulmadan baş üstü itiş paterni pekiştirir; önce alt trapez/serratus çalış.',
    match: (tags) => and(touches(tags, 'shoulder'), has(tags.jointWindows, 'shoulder_elevation_over_90')),
  },
  {
    id: 'thoracic-deficit-overhead',
    condition: 'thoracic_extension_deficit',
    decision: 'warn',
    message: 'Torasik ekstansiyon yetmezken baş üstü açığı bel hiperekstansiyonuyla kapanır; landmine varyantına geç.',
    match: (tags) => and(touches(tags, 'shoulder'), has(tags.jointWindows, 'shoulder_elevation_over_90')),
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
  /**
   * Kartta sayılan, bilgi eksikliğinden değerlendirilemeyen kural sayısı: hareketin etiketi ya da
   * sabit bir bilgi (greft tipi, topuk) eksik kalanlar; danışanın hali (niteleyici) yazılmamışsa o
   * hale bağlı kurallar ve niteleyicili elle yasak, birbirini dışlayan hallere bağlı oldukları için
   * kısıt başına tek. PT'nin "sorun yok" dediği kısıt için hiç sayılmaz.
   */
  skipped: number;
  /**
   * Yalnız zamanla değişen danışan bağlamı (`CONTEXT_LABELS`) eksik kaldığı için karar veremeyen
   * kurallar; ekran bunları kart başına değil, özet satırında bir kez söyler.
   */
  pending: { rule: string; needs: TimedContext }[];
  /** Egzersizde hiç etiket yoksa süzgeç çalışmaz; ekran bunu söylemeli. */
  untagged: boolean;
};

const ORDER: Record<Decision, number> = { block: 3, warn: 2, cue: 1 };

/**
 * PT'nin egzersize elle yazdığı kısıtlar ("id" ya da "id:nitelik"). Niteleyicisiz yazılmışsa her
 * şiddeti kapsar; yazılmışsa birebir eşleşmeli. Danışanın niteleyicisi yoksa niteleyicili yazım
 * karar veremez: `null` (bilinmiyor).
 */
function manualMatch(list: readonly string[] | undefined, condition: ClientCondition): boolean | null {
  if (!list) return false;
  let unknown = false;
  for (const entry of list) {
    const parsed = parseCondition(entry);
    if (!parsed || parsed.id !== condition.id) continue;
    if (parsed.qualifier === undefined || parsed.qualifier === condition.qualifier) return true;
    if (condition.qualifier === undefined) unknown = true;
  }
  return unknown ? null : false;
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
  const pending: FilterResult['pending'] = [];
  let skipped = 0;
  // Aynı kısıt niteleyicisiyle de seçildiyse danışanın hali bilinir: niteleyicisiz yazım ayrıca
  // değerlendirilmez (yoksa kural hem "yaptırma" hem "değerlendirilemedi" sayılırdı).
  const qualifiedIds = new Set(conditions.filter((condition) => condition.qualifier).map((condition) => condition.id));

  for (const condition of conditions) {
    if (!condition.qualifier && qualifiedIds.has(condition.id)) continue;
    // PT elle yasakladıysa kural aramaya gerek yok.
    const manual = manualMatch(tags.contraindications, condition);
    if (manual) {
      findings.push({
        decision: 'block',
        condition,
        message: `${conditionLabel(condition)} için işaretlenmiş: bu harekette yaptırma.`,
        rule: 'manual',
      });
      continue;
    }
    // "Sorun yok" niteleyicisi bilinmeden susturmaz. Susturulan kısıtta atlanan kural sayılmaz.
    const cleared = manualMatch(tags.safeFor, condition) === true;
    // Danışanın hali yazılmamışsa o hale bağlı kurallar ve niteleyicili elle yasak ("…:acute") karar
    // veremez. Hepsinin cevabı tek soruda (hangi hal?): kısıt başına tek "atlandı" sayılır.
    let unknownQualifier = manual === null;
    let unknownFacts = 0;
    const waiting: FilterResult['pending'] = [];

    for (const rule of RULES) {
      if (rule.condition !== condition.id) continue;
      // PT "bunda sorun yok" dediyse uyarı susar; yasak susmaz (kırmızı bayrak da susmaz).
      if (cleared && rule.decision !== 'block') continue;
      // Niteleyiciye bağlı kural: danışanın niteleyicisi başkaysa işlemez; yazılmamışsa hangi hal
      // olduğu bilinmez → etiketler kuralı zaten düşürmüyorsa atlanır ve sayılır.
      const qualified = !rule.qualifiers || (condition.qualifier ? rule.qualifiers.includes(condition.qualifier) : null);
      if (qualified === false) continue;

      const fixed = and(qualified, rule.match(tags, context));
      const hit = and(fixed, rule.when ? rule.when.test(context, condition) : true);
      if (hit) {
        findings.push({ decision: rule.decision, condition, message: rule.message, rule: rule.id });
        continue;
      }
      if (hit === false) continue;
      if (qualified === null) unknownQualifier = true;
      else if (fixed === null) unknownFacts += 1;
      else if (rule.when) waiting.push({ rule: rule.id, needs: rule.when.needs });
    }
    if (cleared) continue;
    skipped += unknownFacts + (unknownQualifier ? 1 : 0);
    pending.push(...waiting);
  }

  findings.sort((a, b) => ORDER[b.decision] - ORDER[a.decision]);
  return {
    decision: findings[0]?.decision ?? null,
    findings,
    skipped,
    pending,
    untagged: !isTagged(tags),
  };
}

/**
 * Kısıt seçiliyken her hareketin girdiği tek küme; özet çipleri bu sırayla yazılır ve dokununca liste o
 * kümeye süzülür. `clear` (uygun): etiketli, hiçbir kural işlemedi ve kartta sayılan bilinmeyeni yok.
 * `untagged` (kontrol edilmedi): hiç etiketi yok, süzgeç çalışmadı; "uygun" sayılmaz (SPEC §6).
 */
export const FILTER_GROUPS = ['blocked', 'warned', 'clear', 'untagged', 'unassessed'] as const;
export type FilterGroup = (typeof FILTER_GROUPS)[number];

export const FILTER_GROUP_LABELS: Record<FilterGroup, string> = {
  blocked: 'yasak',
  warned: 'uyarı',
  clear: 'uygun',
  untagged: 'kontrol edilmedi',
  unassessed: 'eksik bilgi',
};

/**
 * Hareketin kümesi. Karar bilinmeyenden önce gelir: yaptırma kararı eksik bilgiyle değişmez, uyarılı
 * hareket uyarıda kalır (eksik bilgisi kartta ayrıca söylenir). Etiketsiz harekete yine de kural
 * işleyebilir (hareketten bağımsız kırmızı bayrak): o zaman kararın kümesine girer.
 */
export function filterGroup(result: Pick<FilterResult, 'decision' | 'skipped' | 'untagged'>): FilterGroup {
  if (result.decision === 'block') return 'blocked';
  if (result.decision) return 'warned';
  if (result.untagged) return 'untagged';
  return result.skipped > 0 ? 'unassessed' : 'clear';
}

/** Listenin görünümü: hepsi, "Yasakları gizle" ya da tek küme (çip, "Yalnız uygunları göster"). */
export type FilterView = 'all' | 'notBlocked' | FilterGroup;

/** Hareket görünümde mi; kümesi bilinmeyen (süzgeç çalışmadı) yalnız "hepsi"nde görünür. */
export function inFilterView(group: FilterGroup | undefined, view: FilterView): boolean {
  if (view === 'all') return true;
  if (group === undefined) return false;
  return view === 'notBlocked' ? group !== 'blocked' : group === view;
}

/** Kısıt seçiliyken listenin kart rozetleri ve özet çipleri; her hareket tek kümeye girer. */
export type FilterSummary = {
  /**
   * Kararı ya da kartta sayılan bilinmeyeni olan hareketler. `unassessed`: kartta söylenecek
   * değerlendirilemeyen kural sayısı; yaptırma kararında 0 (daha ağır karar yok, sonucu değiştirmez).
   */
  cards: Map<string, { decision: Decision | null; message: string | null; unassessed: number }>;
  /** Her hareketin kümesi (kimliğe göre). */
  groups: Map<string, FilterGroup>;
  /** Küme başına hareket sayısı; toplamı hareket sayısıdır. */
  counts: Record<FilterGroup, number>;
  /** Uyarılı ama bazı kuralları değerlendirilemeyen (daha ağır bir kural işleyebilir; rozet kartta kalır). */
  warnedUnassessed: number;
  /** Yalnız danışan bağlamı eksik kaldığı için karar veremeyen kurallar (tekrarsız) ve eksik bilgiler. */
  pending: { rules: number; needs: TimedContext[] };
};

export function summarizeFilter(
  items: readonly (ExerciseTags & { id: string })[],
  conditions: readonly ClientCondition[],
  context: FilterContext = {},
): FilterSummary {
  const summary: FilterSummary = {
    cards: new Map(),
    groups: new Map(),
    counts: { blocked: 0, warned: 0, clear: 0, untagged: 0, unassessed: 0 },
    warnedUnassessed: 0,
    pending: { rules: 0, needs: [] },
  };
  const rules = new Set<string>();
  const needs = new Set<TimedContext>();
  for (const item of items) {
    const result = evaluateExercise(item, conditions, context);
    for (const entry of result.pending) {
      rules.add(entry.rule);
      needs.add(entry.needs);
    }
    // Etiketsiz hareket "kontrol edilmedi" kümesindedir; yaptırma kararı bilinmeyenden etkilenmez.
    const unassessed = result.untagged || result.decision === 'block' ? 0 : result.skipped;
    const group = filterGroup(result);
    summary.groups.set(item.id, group);
    summary.counts[group] += 1;
    if (group === 'warned' && unassessed > 0) summary.warnedUnassessed += 1;
    if (result.decision || unassessed > 0) {
      summary.cards.set(item.id, { decision: result.decision, message: result.findings[0]?.message ?? null, unassessed });
    }
  }
  summary.pending = { rules: rules.size, needs: [...needs] };
  return summary;
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

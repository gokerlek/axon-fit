/**
 * Sakatlık ve kısıt sözlüğü — danışanın kaydı ile egzersiz etiketleri bu kimlikler
 * üzerinden eşleşir (`src/lib/exercise-filter.ts`).
 *
 * Kaynak: `docs/research/medical-fitness/` (164 kaynaklı tarama). Şiddet ve faz
 * kimliğe gömülmez; ayrı `qualifier` alanında tutulur — yoksa 30 kimlik 80 olur.
 *
 * Kırmızı bayrak, egzersiz süzgeci değil akış kesicidir: uygulama tıbbi izin ister.
 */

export const CONDITION_REGIONS = ['spine', 'neck', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'systemic'] as const;
export type ConditionRegion = (typeof CONDITION_REGIONS)[number];

/** Şiddet/faz niteleyicisi: aynı patolojinin akut ve sakin hali aynı kural setine girmez. */
export const CONDITION_QUALIFIERS = ['acute', 'reactive', 'severe', 'stable', 'controlled', 'uncontrolled', 'postop'] as const;
export type ConditionQualifier = (typeof CONDITION_QUALIFIERS)[number];

export type ConditionInfo = {
  label: string;
  region: ConditionRegion;
  /** Tıbbi izin olmadan program yazılmaz; uygulama uyarıyı gizleyemez. */
  redFlag?: boolean;
  /** Kayıtta anlamlı olan niteleyiciler (boşsa niteleyici sorulmaz). */
  qualifiers?: readonly ConditionQualifier[];
  /** Kısa gerekçe — PT'ye uyarının yanında gösterilir. */
  note?: string;
};

export const CONDITIONS = {
  // --- Omurga ---
  lumbar_disc_herniation: {
    label: 'Lomber disk hernisi',
    region: 'spine',
    qualifiers: ['acute', 'stable'],
    note: 'Yüklü fleksiyon ve fleksiyon+rotasyon birleşimi disk hasarını ilerletir.',
  },
  lumbar_disc_herniation_with_radiculopathy: {
    label: 'Radikülopatili disk hernisi (bacağa yayılan ağrı)',
    region: 'spine',
    redFlag: true,
    note: 'Semptom periferikleşiyorsa (aşağı yayılıyorsa) program durur.',
  },
  flexion_intolerant_back: {
    label: 'Fleksiyon intoleranslı bel',
    region: 'spine',
    note: 'Provokasyon testiyle doğrulanmış olmalı; genel fleksiyon yasağı herkese uygulanmaz.',
  },
  lumbar_spondylolisthesis: {
    label: 'Spondilolistezis / kesme kuvvetine duyarlı omurga',
    region: 'spine',
    note: 'Yüksek shear ve yüklü ekstansiyon kaçınılır.',
  },
  lumbar_stenosis: {
    label: 'Lomber stenoz',
    region: 'spine',
    note: 'Ekstansiyon intoleransı tipiktir; fleksiyon genelde rahatlatır.',
  },
  chronic_nonspecific_low_back_pain: {
    label: 'Kronik non-spesifik bel ağrısı',
    region: 'spine',
    note: 'Yürüyüş bileşeni nüksü azaltır (WalkBack RKÇ).',
  },
  si_joint_pain: { label: 'Sakroiliak eklem ağrısı', region: 'hip' },
  cauda_equina_or_progressive_neuro_deficit: {
    label: 'Kauda ekina şüphesi / ilerleyici nörolojik defisit',
    region: 'systemic',
    redFlag: true,
    note: 'Egzersiz yok; acil tıbbi değerlendirme.',
  },

  // --- Boyun / üst sırt ---
  cervical_pain: { label: 'Boyun ağrısı', region: 'neck' },
  cervical_radiculopathy: { label: 'Servikal radikülopati', region: 'neck', redFlag: true, qualifiers: ['acute', 'stable'] },
  upper_crossed_pattern: {
    label: 'Üst çapraz patern (öne baş, yuvarlak omuz)',
    region: 'neck',
    note: 'Bulgu; yasak değil. Skapular kontrol kurulana kadar baş üstü itişte uyarı.',
  },
  thoracic_extension_deficit: {
    label: 'Torasik ekstansiyon kısıtı',
    region: 'spine',
    note: 'Baş üstü hareketlerde açığı bel hiperekstansiyonu kapatır.',
  },

  // --- Omuz ---
  subacromial_pain_syndrome: {
    label: 'Subakromiyal ağrı sendromu (sıkışma)',
    region: 'shoulder',
    qualifiers: ['acute', 'severe'],
    note: 'Ense arkası hareketler ve dar tutuş upright row kategorik olarak dışarıda.',
  },
  rotator_cuff_tendinopathy: { label: 'Rotator manşet tendinopatisi', region: 'shoulder', qualifiers: ['reactive'] },
  anterior_shoulder_instability: {
    label: 'Anterior omuz instabilitesi',
    region: 'shoulder',
    redFlag: true,
    qualifiers: ['severe', 'postop'],
    note: '90° abduksiyon + son aralık dış rotasyon (apprehension) pozisyonu yasak.',
  },
  multidirectional_shoulder_instability: { label: 'Multidireksiyonel omuz instabilitesi', region: 'shoulder' },
  ac_joint_injury: { label: 'AC eklem sorunu', region: 'shoulder', qualifiers: ['severe'] },
  scapular_dyskinesis: { label: 'Skapular diskinezi', region: 'shoulder', note: 'Tek başına bulgu; ağrısızsa yasak gerekçesi değildir.' },

  // --- Dirsek / el bileği ---
  lateral_epicondylitis: { label: 'Lateral epikondilit (tenisçi dirseği)', region: 'elbow', qualifiers: ['acute'] },
  wrist_pain: { label: 'El bileği ağrısı', region: 'wrist', qualifiers: ['severe'] },

  // --- Kalça ---
  lower_crossed_pattern: {
    label: 'Alt çapraz patern (anterior pelvik tilt)',
    region: 'hip',
    note: 'Bulgu; tek postür fotoğrafına dayanıyorsa karar verdirmez.',
  },
  hip_impingement_fai: { label: 'Kalça sıkışması (FAI)', region: 'hip', note: 'Derin kalça fleksiyonunda semptom verir.' },

  // --- Diz ---
  patellofemoral_pain: { label: 'Patellofemoral ağrı (ön diz ağrısı)', region: 'knee', qualifiers: ['severe'] },
  patellar_tendinopathy: { label: 'Patellar tendinopati', region: 'knee', qualifiers: ['reactive'] },
  acl_reconstruction_early: {
    label: 'ACL rekonstrüksiyonu erken dönem (0–12 hafta)',
    region: 'knee',
    redFlag: true,
    note: 'Açık zincir diz ekstansiyonu haftaya ve ROM penceresine bağlı.',
  },
  knee_osteoarthritis: { label: 'Diz osteoartriti', region: 'knee', qualifiers: ['severe'] },
  degenerative_meniscal_tear: { label: 'Dejeneratif menisküs yırtığı (kilitlenme yok)', region: 'knee' },
  acute_meniscus_tear: { label: 'Akut menisküs yırtığı', region: 'knee', redFlag: true, note: 'Kilitlenme/blokaj varsa egzersiz yok.' },
  meniscus_repair_postop: { label: 'Menisküs onarımı sonrası', region: 'knee', redFlag: true },
  acute_knee_effusion: { label: 'Dizde akut şişlik (efüzyon)', region: 'knee', note: 'Efüzyon kuadriseps inhibisyonu yapar; yük artırılmaz.' },
  dynamic_knee_valgus: { label: 'Dinamik diz valgusu', region: 'knee', note: 'Bulgu; nöromüsküler çalışmayla düzeltilir.' },

  // --- Ayak bileği ---
  ankle_dorsiflexion_restriction: {
    label: 'Ayak bileği dorsifleksiyon kısıtı',
    region: 'ankle',
    note: 'Derin squat’ta topuk yükseltilmezse açık belden kapanır.',
  },

  // --- Sistemik ---
  hypertension: {
    label: 'Hipertansiyon',
    region: 'systemic',
    qualifiers: ['controlled', 'uncontrolled'],
    note: 'Valsalva ile ağır eksenel yük kan basıncını ani yükseltir.',
  },
  pregnancy_second_third_trimester: { label: 'Gebelik (2. ve 3. trimester)', region: 'systemic' },
  movement_screen_pain_flag: {
    label: 'Hareket taramasında ağrı',
    region: 'systemic',
    redFlag: true,
    note: 'FMS final skoru 0 ya da clearing testi pozitif: önce değerlendirme.',
  },
} as const satisfies Record<string, ConditionInfo>;

export type ConditionId = keyof typeof CONDITIONS;
export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];

/** Sözlük kaydı; `satisfies` metinleri daralttığı için erişim buradan yapılır. */
export function conditionInfo(id: ConditionId): ConditionInfo {
  return CONDITIONS[id];
}

export function isConditionId(value: string): value is ConditionId {
  return value in CONDITIONS;
}

/** Danışanın kaydındaki bir kısıt: kimlik + (varsa) şiddet/faz. */
export type ClientCondition = { id: ConditionId; qualifier?: ConditionQualifier };

/** "lumbar_disc_herniation:acute" → { id, qualifier }; bilinmeyen kimlikte `null`. */
export function parseCondition(value: string): ClientCondition | null {
  const [id, qualifier] = value.split(':');
  if (!id || !isConditionId(id)) return null;
  if (!qualifier) return { id };
  return CONDITION_QUALIFIERS.includes(qualifier as ConditionQualifier)
    ? { id, qualifier: qualifier as ConditionQualifier }
    : { id };
}

/** Kayıt biçimine geri çevirir ("knee_osteoarthritis:severe"). */
export function formatCondition({ id, qualifier }: ClientCondition): string {
  return qualifier ? `${id}:${qualifier}` : id;
}

export function conditionLabel({ id, qualifier }: ClientCondition): string {
  const base = conditionInfo(id).label;
  const ek: Partial<Record<ConditionQualifier, string>> = {
    acute: 'akut',
    reactive: 'reaktif',
    severe: 'şiddetli',
    stable: 'sakin dönem',
    controlled: 'kontrollü',
    uncontrolled: 'kontrolsüz',
    postop: 'ameliyat sonrası',
  };
  return qualifier && ek[qualifier] ? `${base} (${ek[qualifier]})` : base;
}

/** Tıbbi izin isteyen kısıtlar. */
export function redFlags(conditions: readonly ClientCondition[]): ClientCondition[] {
  return conditions.filter((condition) => conditionInfo(condition.id).redFlag);
}

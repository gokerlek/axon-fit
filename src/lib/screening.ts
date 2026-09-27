import type { MovementPattern } from './alternatives.ts';
import { awaitsOpinion, ConstraintError, isActive, isPaired, type AvoidTagId, type ConstraintRegion } from './constraints.ts';
import type { Constraint, HealthRecord, Screening, ScreeningSide, ScreeningTests } from './schemas/health.ts';

/**
 * Hareket taraması, protokol 1 (tasarım `docs/design/kisit-tarama.md` §4) — saf.
 *
 * Sekiz temel hareket; PT her testte (iki taraflıda her tarafta) önce ağrıyı, sonra yapılan sürümü, sonra kaçan
 * noktaları işaretler. Sonuç **sözcüktür** ve noktalardan hesaplanır (Temiz · Telafiyle · Kolaylaştırılmış ·
 * Yapılamadı · Ağrılı · Bu taramada yapılmadı); ağrı testi durdurur ve sonuç üretmez; puan sayısı, toplam ve risk
 * yüzdesi yok. İç sıra (3 → 0) yalnız asimetri ve karşılaştırma için, ekrana çıkmaz.
 *
 * Neye benzediği: puan yapısı Cook 2006'nın sıralı ölçeğine benzer; testler, noktalar ve kurallar bizim; bu
 * protokolün güvenilirlik ya da geçerlik verisi yok **[sentez]**. Tescilli bir testin adı, yönergesi, puanlama
 * tablosu ya da düzeltici hiyerarşisi yoktur.
 */

export const SCREENING_PROTOCOL = 1;

export const SCREENING_TEST_IDS = [
  'squat',
  'hinge',
  'split_squat',
  'single_leg_balance',
  'push',
  'pull',
  'anti_rotation',
  'shoulder_flexion',
] as const;
export type ScreeningTestId = (typeof SCREENING_TEST_IDS)[number];

export type ScreeningPoint = {
  id: string;
  /** Giriş ekranındaki düğme: gözlenen kaçış ("Topuk kalktı"). */
  label: string;
  /** PT'nin ipucu ("Telafiyle" sonucunda). */
  hint: string;
  /** Danışanın "odak" satırı ("topukların yerde kalsın"). */
  focus: string;
};

export type ScreeningTest = {
  id: ScreeningTestId;
  /** PT'ye tam ad. */
  title: string;
  /** Şeritte ve danışana kısa ad. */
  short: string;
  sided: boolean;
  /** İki taraflıda hangi tarafın test edildiği. */
  sideNote?: string;
  setup: string;
  points: readonly ScreeningPoint[];
  easier: string;
  patterns: readonly MovementPattern[];
  /** Etkin kısıt bu bölgelerdeyse: görüşü alınmamış kırmızı bayrakta "Yapılmadı (kısıt)" hazır gelir, asimetri bastırılır. */
  regions: readonly ConstraintRegion[];
  /** "Kısıt olarak ekle": önerilen bölge ve kaçınma. */
  constraintRegion: ConstraintRegion;
  avoid?: AvoidTagId;
  /** Paketteki kütüphanenin kimlikleri (`libraries.test.ts` varlıklarını denetler). */
  regress: readonly string[];
  progress: readonly string[];
  source: string;
};

export const SCREENING_TESTS: Record<ScreeningTestId, ScreeningTest> = {
  squat: {
    id: 'squat',
    title: 'Squat, kollar önde',
    short: 'Squat',
    sided: false,
    setup: 'Ayaklar kalça-omuz genişliğinde, kollar öne uzanık; 3 tekrar.',
    points: [
      { id: 'heels', label: 'Topuk kalktı', hint: 'topuklar yerde; düzelmiyorsa topuk desteği', focus: 'topukların yerde kalsın' },
      { id: 'knees', label: 'Diz içe kaçtı', hint: 'dizler ayak yönünde', focus: 'dizlerin ayak uçlarının yönünde' },
      { id: 'depth', label: 'Derinlik yetmedi', hint: 'derinliği kutuyla ayarla', focus: 'rahat indiğin derinlikte kal' },
      { id: 'torso', label: 'Gövde öne düştü', hint: 'göğüs yukarı, ağırlık önde (goblet)', focus: 'göğsün yukarıda kalsın' },
      { id: 'spine', label: 'Altta bel yuvarlandı', hint: 'derinliği belin nötr kaldığı yerde kes', focus: 'belinin düz kaldığı yere kadar in' },
    ],
    easier: 'Diz hizasındaki kutuya otur-kalk, kollar önde.',
    patterns: ['squat'],
    regions: ['knee', 'hip', 'ankle_foot'],
    constraintRegion: 'knee',
    avoid: 'deep_knee_flexion',
    regress: ['destekli-sandalye-squat', 'goblet-box-squat'],
    progress: ['goblet-squat', 'halter-back-squat'],
    source: 'Kritz 2009 (vücut ağırlığıyla squat taraması)',
  },
  hinge: {
    id: 'hinge',
    title: 'Kalça menteşesi, çubukla',
    short: 'Menteşe',
    sided: false,
    setup: 'Çubuk sırtta baş, sırt ve sağrıya değer; dizler hafif bükük; kalçadan öne eğil; 3 tekrar.',
    points: [
      { id: 'contact', label: 'Çubuk ayrıldı', hint: 'sırt nötr, çubuk üç noktada', focus: 'sırtın düz kalsın' },
      { id: 'hips', label: 'Kalçadan başlamadı', hint: 'önce kalça geri', focus: 'hareketi kalçanı geri iterek başlat' },
      { id: 'range', label: 'Aralık yetmedi', hint: 'kısa aralıkla başla, arka bacak esnekliği', focus: 'rahat eğildiğin kadar in' },
      { id: 'return', label: 'Dönüşte bel açıldı', hint: 'tepede kalçayı sık, bel geri açılmasın', focus: 'yukarıda kalçanı sık, belini geriye bükme' },
    ],
    easier: 'Kalçayla arkadaki duvara dokunma (duvar 15–20 cm geride).',
    patterns: ['hinge', 'hip_extension'],
    regions: ['lower_back'],
    constraintRegion: 'lower_back',
    avoid: 'forward_bend',
    regress: ['glute-bridge', 'halter-hip-thrust'],
    progress: ['romanian-deadlift', 'deadlift'],
    source: 'sentez; noktalar "hareket kalçadan gelsin" diye yazıldı (Saraceni 2020)',
  },
  split_squat: {
    id: 'split_squat',
    title: 'Split squat',
    short: 'Split squat',
    sided: true,
    sideNote: 'Öndeki bacak test edilen taraftır.',
    setup: 'Bir adım boyu açıklık, arka topuk kalkık, eller belde; arka diz yere yaklaşana dek in; 3 tekrar.',
    points: [
      { id: 'knee', label: 'Ön diz içe kaçtı', hint: 'ön diz ayak yönünde', focus: 'ön dizin ayağının yönünde' },
      { id: 'pelvis', label: 'Kalça düştü ya da döndü', hint: 'kalça yatay; yan kalça çalış', focus: 'kalçan düz kalsın' },
      { id: 'torso', label: 'Gövde öne düştü', hint: 'gövde dik', focus: 'gövden dik kalsın' },
      { id: 'depth', label: 'Kontrollü inemedi', hint: 'aralığı kısalt, yavaş in', focus: 'yavaş ve kontrollü in' },
      { id: 'balance', label: 'Denge kaybı', hint: 'destekle başla', focus: 'gerekirse bir yere tutun' },
    ],
    easier: 'Bir elle duvara ya da çubuğa tutunarak.',
    patterns: ['lunge'],
    regions: ['knee', 'hip', 'ankle_foot'],
    constraintRegion: 'knee',
    avoid: 'deep_knee_flexion',
    regress: ['goblet-box-squat', 'glute-bridge'],
    progress: ['dambil-lunge', 'bulgarian-split-squat'],
    source: 'sentez; squat noktalarının tek bacağa uyarlanması (Kritz 2009)',
  },
  single_leg_balance: {
    id: 'single_leg_balance',
    title: 'Tek ayak denge',
    short: 'Denge',
    sided: true,
    sideNote: 'Duran bacak test edilen taraftır.',
    setup: 'Göz açık, eller belde, öbür ayak yerden ~5 cm; en çok 30 sn; süre 3 denemenin en iyisi.',
    points: [
      { id: 'time', label: '30 sn dolmadı', hint: 'kısa sürelerle sık tekrar', focus: 'biraz daha uzun durmayı dene' },
      { id: 'hip', label: 'Kalça düştü ya da kaydı', hint: 'yan kalça (kalça açma) çalış', focus: 'kalçan düz kalsın' },
      { id: 'foot', label: 'Destek ayağı kaydı', hint: 'ayak tabanı yere tam bassın', focus: 'ayağın yere sağlam bassın' },
      { id: 'arms', label: 'Eller belden ayrıldı', hint: 'gerekirse parmak ucuyla destek', focus: 'ellerin belinde kalsın' },
    ],
    easier: 'Parmak ucuyla duvara hafifçe dokunarak.',
    patterns: ['lunge'],
    regions: ['knee', 'hip', 'ankle_foot'],
    constraintRegion: 'knee',
    regress: ['makine-kalca-acma', 'glute-bridge'],
    progress: ['dambil-lunge', 'bulgarian-split-squat'],
    source: 'Springer 2007 (tek ayak duruş süresi); 30 sn sentez',
  },
  push: {
    id: 'push',
    title: 'Şınav, 5 tekrar',
    short: 'Şınav',
    sided: false,
    setup: 'Eller omuz genişliğinde, vücut düz; göğüs yere bir avuç kalana dek.',
    points: [
      { id: 'plank', label: 'Gövde bozuldu', hint: 'gövdeyi sık; gerekirse eğimli', focus: 'vücudun tek parça kalsın' },
      { id: 'scapula', label: 'Kürek kanatlandı', hint: 'tepede kürekleri ayır (serratus)', focus: 'kürek kemiklerin sırtına yapışık kalsın' },
      { id: 'elbows', label: 'Dirsekler açıldı', hint: 'dirsekler gövdeye 45°', focus: 'dirseklerin gövdene yakın' },
      { id: 'depth', label: 'Aralık eksik', hint: 'eğimle tam aralık', focus: 'göğsünü yere yaklaştır' },
    ],
    easier: 'Eller sehpada (kalça hizasında).',
    patterns: ['horizontal_push'],
    regions: ['shoulder'],
    constraintRegion: 'shoulder',
    avoid: 'behind_body',
    regress: ['notr-tutus-floor-press', 'makine-chest-press'],
    progress: ['sinav', 'halter-bench-press'],
    source: 'sentez',
  },
  pull: {
    id: 'pull',
    title: 'Ters kürek, 5 tekrar',
    short: 'Kürek',
    sided: false,
    setup: 'Halka ya da askı bandı; gövde yere ~45°, topuklar yerde, kollar düz.',
    points: [
      { id: 'plank', label: 'Gövde bozuldu', hint: 'gövde tek parça', focus: 'vücudun tek parça kalsın' },
      { id: 'shoulders', label: 'Omuz kulağa kalktı', hint: 'omuzlar aşağıda', focus: 'omuzların kulaklarından uzak' },
      { id: 'range', label: 'Dirsek gövdeyi geçmedi', hint: 'daha dik açıyla tam aralık', focus: 'dirseklerini gövdenin arkasına kadar çek' },
      { id: 'control', label: 'İniş kontrolsüz', hint: 'inişi 2–3 sn', focus: 'yavaş in' },
    ],
    easier: 'Daha dik açı (gövde ~70°).',
    patterns: ['horizontal_pull', 'vertical_pull'],
    regions: ['shoulder'],
    constraintRegion: 'shoulder',
    regress: ['gogus-destekli-row', 'oturarak-kablo-row'],
    progress: ['tek-kol-dambil-row', 'barfiks'],
    source: 'sentez',
  },
  anti_rotation: {
    id: 'anti_rotation',
    title: 'Dönmeye direnç, tutuş',
    short: 'Dönme',
    sided: true,
    sideNote: 'Taraf: direncin geldiği yan.',
    setup: 'Yarım diz çökme, bant ya da kablo yandan, kollar göğüsten ileri uzanık; 10 sn.',
    points: [
      { id: 'trunk', label: 'Gövde döndü', hint: 'direnci azalt, gövdeyi sabitle', focus: 'gövden dönmesin' },
      { id: 'pelvis', label: 'Kalça kaydı', hint: 'kalçayı sık', focus: 'kalçan sabit kalsın' },
      { id: 'arms', label: 'Kollar kaydı', hint: 'kollar orta hatta', focus: 'kolların göğsünün ortasında kalsın' },
      { id: 'breath', label: 'Nefes tuttu', hint: 'nefes vererek tut', focus: 'nefesini tutma' },
    ],
    easier: 'Ayakta geniş duruş, daha hafif direnç.',
    patterns: ['anti_rotation', 'core_stability'],
    regions: [],
    constraintRegion: 'lower_back',
    regress: ['dead-bug', 'bird-dog'],
    progress: ['pallof-press', 'tek-el-tasima'],
    source: 'sentez',
  },
  shoulder_flexion: {
    id: 'shoulder_flexion',
    title: 'Kol kaldırma, sırt duvarda',
    short: 'Kol kaldırma',
    sided: true,
    sideNote: 'Kaldırılan kol test edilen taraftır.',
    setup: 'Topuk, kalça, sırt ve baş duvarda, dizler hafif bükük; dirsek düz, başparmak yukarı, kolu önden yukarı kaldır.',
    points: [
      { id: 'wall', label: 'Duvara ulaşmadı', hint: 'açılı itişle başla (landmine)', focus: 'kolunu rahat kaldırabildiğin kadar kaldır' },
      { id: 'ribs', label: 'Bel duvardan ayrıldı', hint: 'kaburgayı aşağıda tut', focus: 'belin duvara yakın kalsın' },
      { id: 'elbow', label: 'Dirsek büküldü', hint: 'dirsek düz', focus: 'dirseğin düz kalsın' },
      { id: 'shrug', label: 'Omuz kulağa kalktı', hint: 'omuz aşağıda', focus: 'omzun kulağından uzak' },
    ],
    easier: 'Sırtüstü yatarak (bel yerde).',
    patterns: ['vertical_push'],
    regions: ['shoulder'],
    constraintRegion: 'shoulder',
    avoid: 'overhead',
    regress: ['landmine-press', 'band-pull-apart'],
    progress: ['oturarak-dambil-omuz-press', 'lat-pulldown'],
    source: 'sentez',
  },
};

/** Tek ayak dengede `time` noktası süreden hesaplanır (< 30 sn → kaçtı) **[sentez]**. */
export const BALANCE_SECONDS = 30;
/** Ön uzanmada bu kadar fark "büyük asimetri" (Plisky 2006). */
export const REACH_ASYMMETRY_CM = 4;
/** Asimetri Dikkat maddesi son tarama bu kadar günden eskiyse düşer. */
export const SCREENING_ALERT_DAYS = 28;
/** Kayıtta en çok tarama günü (en eskisi yalnız git'te kalır). */
export const SCREENING_LIMIT = 60;

/* --- sonuç --- */

export type Outcome = 'clean' | 'compensated' | 'easier' | 'unable' | 'pain' | 'not_tested';

export const OUTCOME_LABELS: Record<Outcome, string> = {
  clean: 'Temiz',
  compensated: 'Telafiyle',
  easier: 'Kolaylaştırılmış',
  unable: 'Yapılamadı',
  pain: 'Ağrılı',
  not_tested: 'Bu taramada yapılmadı',
};

export const OUTCOME_CLIENT_LABELS: Record<Outcome, string> = {
  clean: 'Temiz',
  compensated: 'Telafiyle',
  easier: 'Kolaylaştırılmış sürümle',
  unable: 'Henüz yapılamıyor',
  pain: 'Ağrı not edildi. Antrenörün seninle konuşacak.',
  not_tested: 'Bu taramada yapılmadı',
};

export const RESULT_CHOICES = ['standard', 'easier', 'unable', 'not_tested'] as const;
export type ResultChoice = (typeof RESULT_CHOICES)[number];
export const RESULT_CHOICE_LABELS: Record<ResultChoice, string> = {
  standard: 'Standart',
  easier: 'Kolaylaştırılmış',
  unable: 'Yapılamadı',
  not_tested: 'Yapılmadı',
};

export const NOT_TESTED_REASONS = ['constraint', 'other'] as const;
export type NotTestedReason = (typeof NOT_TESTED_REASONS)[number];
export const NOT_TESTED_REASON_LABELS: Record<NotTestedReason, string> = { constraint: 'kısıt', other: 'başka neden' };

const RANK: Partial<Record<Outcome, number>> = { clean: 3, compensated: 2, easier: 1, unable: 0 };

/** İç sıra (yalnız asimetri ve karşılaştırma): ağrılı ve yapılmamış sırasızdır. */
export function rankOf(outcome: Outcome | null): number | null {
  return outcome === null ? null : (RANK[outcome] ?? null);
}

/** Kaçan noktalar; dengede süre girildiyse `time` süreden hesaplanır. */
export function effectiveMissed(testId: ScreeningTestId, entry: ScreeningSide): string[] {
  const known = new Set(SCREENING_TESTS[testId].points.map((point) => point.id));
  const missed = (entry.missed ?? []).filter((id) => known.has(id));
  if (testId !== 'single_leg_balance' || entry.seconds === undefined) return missed;
  const rest = missed.filter((id) => id !== 'time');
  return entry.seconds < BALANCE_SECONDS ? ['time', ...rest] : rest;
}

/**
 * Sonuç (§4.2): ağrı → Ağrılı; yapılmadı; yapılamadı; kolaylaştırılmış; standartta kaçan nokta 0 → Temiz,
 * 1–2 → Telafiyle, 3+ → Kolaylaştırılmış. Sürüm seçilmemişse sonuç yok.
 */
export function outcomeOf(testId: ScreeningTestId, entry: ScreeningSide | undefined): Outcome | null {
  if (!entry) return null;
  if (entry.pain) return 'pain';
  switch (entry.result) {
    case 'not_tested':
      return 'not_tested';
    case 'unable':
      return 'unable';
    case 'easier':
      return 'easier';
    case 'standard': {
      const count = effectiveMissed(testId, entry).length;
      return count === 0 ? 'clean' : count <= 2 ? 'compensated' : 'easier';
    }
    default:
      return null;
  }
}

/* --- kayıt anahtarları --- */

export type SideKey = 'center' | 'left' | 'right';
export const SIDE_KEY_LABELS: Record<SideKey, string> = { center: '', left: 'Sol', right: 'Sağ' };

export function sidesOf(testId: ScreeningTestId): SideKey[] {
  return SCREENING_TESTS[testId].sided ? ['left', 'right'] : ['center'];
}

/** "squat", "split_squat.left" (ağrının gözden geçirilmesi bununla). */
export function screeningKey(testId: ScreeningTestId, side: SideKey): string {
  return side === 'center' ? testId : `${testId}.${side}`;
}

export function parseScreeningKey(key: string): { testId: ScreeningTestId; side: SideKey } | null {
  const [test, side] = key.split('.');
  if (!test || !(SCREENING_TEST_IDS as readonly string[]).includes(test)) return null;
  const testId = test as ScreeningTestId;
  if (SCREENING_TESTS[testId].sided) return side === 'left' || side === 'right' ? { testId, side } : null;
  return side === undefined ? { testId, side: 'center' } : null;
}

/** Testin bir tarafı (tek taraflıda kaydın kendisi). */
export function sideEntry(tests: ScreeningTests, testId: ScreeningTestId, side: SideKey): ScreeningSide | undefined {
  const test = tests[testId] as (ScreeningSide & { left?: ScreeningSide; right?: ScreeningSide }) | undefined;
  if (!test) return undefined;
  if (side === 'center') return SCREENING_TESTS[testId].sided ? undefined : test;
  return test[side];
}

export type ScreeningCell = { testId: ScreeningTestId; side: SideKey; key: string; entry: ScreeningSide; outcome: Outcome };

/** Taramanın doldurulmuş hücreleri, test sırasıyla. */
export function cellsOf(screening: Pick<Screening, 'tests'>): ScreeningCell[] {
  return SCREENING_TEST_IDS.flatMap((testId) =>
    sidesOf(testId).flatMap((side) => {
      const entry = sideEntry(screening.tests, testId, side);
      const outcome = outcomeOf(testId, entry);
      return entry && outcome ? [{ testId, side, key: screeningKey(testId, side), entry, outcome }] : [];
    }),
  );
}

/** "8 test · 1 ağrı": yapılan test sayısı (yapılmayan hariç) ve ağrılı hücreler. */
export function screeningSummary(screening: Pick<Screening, 'tests'>): { tests: number; pain: number } {
  const cells = cellsOf(screening);
  const tested = new Set(cells.filter((cell) => cell.outcome !== 'not_tested').map((cell) => cell.testId));
  return { tests: tested.size, pain: cells.filter((cell) => cell.outcome === 'pain').length };
}

/* --- girişin temizlenmesi --- */

function cleanText(value: string | undefined, max: number): string | undefined {
  const text = value?.trim();
  return text ? text.slice(0, max) : undefined;
}

/**
 * Formdan gelen tarafı kayda çevirir: ağrıda yalnız ağrı ve notu (sürüm, noktalar, süre düşer); yapılmadıda
 * neden; yapılamadıda noktasız; bilinmeyen noktalar düşer; dengede süre ve uzanma yalnız o testte. Boşsa undefined.
 */
export function normalizeSide(testId: ScreeningTestId, entry: ScreeningSide | undefined): ScreeningSide | undefined {
  if (!entry) return undefined;
  if (entry.pain) {
    const note = cleanText(entry.painNote, 140);
    return { pain: true, ...(note ? { painNote: note } : {}) };
  }
  if (!entry.result) return undefined;
  if (entry.result === 'not_tested') return { result: 'not_tested', ...(entry.reason ? { reason: entry.reason } : {}) };
  if (entry.result === 'unable') return { result: 'unable' };
  const balance = testId === 'single_leg_balance';
  const seconds = balance && entry.seconds !== undefined ? Math.min(Math.max(Math.round(entry.seconds), 0), 300) : undefined;
  const reachCm = balance && entry.reachCm !== undefined ? Math.min(Math.max(Math.round(entry.reachCm * 10) / 10, 0), 250) : undefined;
  const base: ScreeningSide = { result: entry.result, ...(seconds !== undefined ? { seconds } : {}), ...(reachCm !== undefined ? { reachCm } : {}) };
  const missed = [...new Set(effectiveMissed(testId, { ...entry, ...base }))];
  return { result: base.result, missed, ...(seconds !== undefined ? { seconds } : {}), ...(reachCm !== undefined ? { reachCm } : {}) };
}

/** Bütün testleri temizler; boş testler kayda girmez. */
export function normalizeTests(tests: ScreeningTests): ScreeningTests {
  const out: Record<string, unknown> = {};
  for (const testId of SCREENING_TEST_IDS) {
    const raw = tests[testId] as (ScreeningSide & { left?: ScreeningSide; right?: ScreeningSide; note?: string; heelSupportHelps?: boolean }) | undefined;
    if (!raw) continue;
    const note = cleanText(raw.note, 140);
    if (SCREENING_TESTS[testId].sided) {
      const left = normalizeSide(testId, raw.left);
      const right = normalizeSide(testId, raw.right);
      if (!left && !right) continue;
      out[testId] = { ...(left ? { left } : {}), ...(right ? { right } : {}), ...(note ? { note } : {}) };
    } else {
      const side = normalizeSide(testId, raw);
      if (!side) continue;
      const heel = testId === 'squat' && raw.heelSupportHelps !== undefined && !side.pain ? { heelSupportHelps: raw.heelSupportHelps } : {};
      out[testId] = { ...side, ...heel, ...(note ? { note } : {}) };
    }
  }
  return out as ScreeningTests;
}

/** Aynı gün varsa yerine geçer; tarih sırası, en çok 60 gün (en eskisi düşer). */
export function upsertScreening(list: readonly Screening[], screening: Screening): Screening[] {
  const next = [...list.filter((item) => item.date !== screening.date), screening].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return next.slice(Math.max(0, next.length - SCREENING_LIMIT));
}

/** En yeni tarama önce. */
export function newestFirst(list: readonly Screening[]): Screening[] {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* --- kayıt eylemleri --- */

/**
 * Günü yazar (aynı gün varsa yerine geçer). Hâlâ ağrılı olan hücrelerin gözden geçirme anı korunur; ağrısı
 * geçen hücrenin anı düşer. `replace`: yalnız var olan gün (düzenleme; yoksa 404). Boş tarama 400.
 */
export function withScreening(
  record: HealthRecord,
  input: { date: string; tests: ScreeningTests; note?: string | undefined },
  options: { replace?: boolean } = {},
): HealthRecord {
  const list = record.screenings ?? [];
  const existing = list.find((item) => item.date === input.date);
  if (options.replace && !existing) throw new ConstraintError('Bu tarihte tarama yok; silinmiş olabilir.', 404);
  const tests = normalizeTests(input.tests);
  if (Object.keys(tests).length === 0) throw new ConstraintError('En az bir test gir; boş testler kaydedilmez.', 400);
  const next: Screening = { date: input.date, protocol: SCREENING_PROTOCOL, tests };
  const painful = new Set(painCells(next).map((cell) => cell.key));
  const reviewed = Object.entries(existing?.painReviewedAt ?? {}).filter(([key]) => painful.has(key));
  if (reviewed.length > 0) next.painReviewedAt = Object.fromEntries(reviewed);
  const note = input.note?.trim();
  if (note) next.note = note.slice(0, 500);
  return { ...record, screenings: upsertScreening(list, next) };
}

export function withoutScreening(record: HealthRecord, date: string): HealthRecord {
  const list = record.screenings ?? [];
  if (!list.some((item) => item.date === date)) throw new ConstraintError('Bu tarihte tarama yok; zaten silinmiş olabilir.', 404);
  return { ...record, screenings: list.filter((item) => item.date !== date) };
}

/** Ağrının gözden geçirildiği an ("Gördüm", "Kısıt olarak ekle"); ağrılı olmayan hücre 409. */
export function withPainReviewed(record: HealthRecord, date: string, key: string, now: string): HealthRecord {
  const list = record.screenings ?? [];
  const day = list.find((item) => item.date === date);
  if (!day) throw new ConstraintError('Bu tarihte tarama yok; silinmiş olabilir.', 404);
  if (!painCells(day).some((cell) => cell.key === key)) throw new ConstraintError('Bu testte ağrı kaydı yok.', 409);
  if (day.painReviewedAt?.[key]) return record;
  const next: Screening = { ...day, painReviewedAt: { ...day.painReviewedAt, [key]: now } };
  return { ...record, screenings: list.map((item) => (item.date === date ? next : item)) };
}

/* --- kısıtlar --- */

type SideSuppress = (testId: ScreeningTestId, side: SideKey) => boolean;

function constraintTouches(constraint: Constraint, testId: ScreeningTestId, side: SideKey): boolean {
  const test = SCREENING_TESTS[testId];
  if (!test.regions.includes(constraint.region)) return false;
  if (side === 'center' || !isPaired(constraint.region) || !constraint.side || constraint.side === 'both') return true;
  return constraint.side === side;
}

/**
 * Girişin ön-seçimi (§4.5): görüşü alınmamış kırmızı bayrak bölgesine değen testler "Yapılmadı (kısıt)" hazır
 * gelir; PT değiştirebilir. Anahtar → true.
 */
export function presetFromConstraints(constraints: readonly Constraint[]): Record<string, true> {
  const preset: Record<string, true> = {};
  const waiting = constraints.filter(awaitsOpinion);
  for (const testId of SCREENING_TEST_IDS) {
    for (const side of sidesOf(testId)) {
      if (waiting.some((constraint) => constraintTouches(constraint, testId, side))) preset[screeningKey(testId, side)] = true;
    }
  }
  return preset;
}

/** Etkin kısıtlı taraf asimetriye girmez (§4.4). */
export function constraintSuppress(constraints: readonly Constraint[]): SideSuppress {
  const active = constraints.filter(isActive);
  return (testId, side) => active.some((constraint) => constraintTouches(constraint, testId, side));
}

/* --- asimetri, ağrı, karşılaştırma --- */

export type Asymmetry = {
  testId: ScreeningTestId;
  kind: 'minor' | 'major';
  /** İç sıra farkı (sonuçla); yoksa 0. */
  gap: number;
  left: Outcome;
  right: Outcome;
  /** Ön uzanma farkı (cm), yalnız dengede ve ikisi de girildiyse. */
  reachDiff?: number;
  /** Zayıf taraf (sıraya, eşitse uzanmaya göre). */
  weaker: 'left' | 'right';
};

/**
 * İki taraflı testlerde asimetri (§4.4): iç sıra farkı 1 → asimetri, ≥ 2 → büyük asimetri **[sentez]**; ön uzanma
 * farkı ≥ 4 cm → büyük (Plisky 2006). Ağrılı, yapılmamış ya da bastırılan taraf girmez.
 */
export function asymmetries(screening: Pick<Screening, 'tests'>, suppress: SideSuppress = () => false): Asymmetry[] {
  const list: Asymmetry[] = [];
  for (const testId of SCREENING_TEST_IDS) {
    if (!SCREENING_TESTS[testId].sided) continue;
    const left = sideEntry(screening.tests, testId, 'left');
    const right = sideEntry(screening.tests, testId, 'right');
    const lo = outcomeOf(testId, left);
    const ro = outcomeOf(testId, right);
    const lr = rankOf(lo);
    const rr = rankOf(ro);
    if (lr === null || rr === null || !lo || !ro || suppress(testId, 'left') || suppress(testId, 'right')) continue;
    const gap = Math.abs(lr - rr);
    const reachDiff = left?.reachCm !== undefined && right?.reachCm !== undefined ? Math.round(Math.abs(left.reachCm - right.reachCm) * 10) / 10 : undefined;
    const major = gap >= 2 || (reachDiff !== undefined && reachDiff >= REACH_ASYMMETRY_CM);
    if (gap === 0 && !major) continue;
    const weaker = lr !== rr ? (lr < rr ? 'left' : 'right') : (left?.reachCm ?? 0) < (right?.reachCm ?? 0) ? 'left' : 'right';
    list.push({ testId, kind: major ? 'major' : 'minor', gap, left: lo, right: ro, ...(reachDiff !== undefined ? { reachDiff } : {}), weaker });
  }
  return list;
}

/** Tarama başına tek büyük asimetri (Dikkat maddesi): en büyük fark. */
export function majorAsymmetry(screening: Pick<Screening, 'tests'>, suppress?: SideSuppress): Asymmetry | null {
  const majors = asymmetries(screening, suppress).filter((item) => item.kind === 'major');
  majors.sort((a, b) => b.gap - a.gap || (b.reachDiff ?? 0) - (a.reachDiff ?? 0));
  return majors[0] ?? null;
}

export type PainCell = { key: string; testId: ScreeningTestId; side: SideKey; note?: string; reviewed: boolean };

export function painCells(screening: Pick<Screening, 'tests' | 'painReviewedAt'>): PainCell[] {
  return cellsOf(screening)
    .filter((cell) => cell.outcome === 'pain')
    .map((cell) => ({
      key: cell.key,
      testId: cell.testId,
      side: cell.side,
      ...(cell.entry.painNote ? { note: cell.entry.painNote } : {}),
      reviewed: Boolean(screening.painReviewedAt?.[cell.key]),
    }));
}

/** Testin yalın adı ("Kalça menteşesi"; kurulum ekinin öncesi). */
export function testName(testId: ScreeningTestId): string {
  return SCREENING_TESTS[testId].title.split(',')[0] ?? SCREENING_TESTS[testId].title;
}

/** "Kol kaldırma (sağ)". */
export function cellTitle(testId: ScreeningTestId, side: SideKey, short = false): string {
  const name = short ? SCREENING_TESTS[testId].short : testName(testId);
  return side === 'center' ? name : `${name} (${SIDE_KEY_LABELS[side].toLocaleLowerCase('tr')})`;
}

export type Change = 'up' | 'down' | 'same' | 'new' | 'pain_new' | 'pain_gone';

/**
 * Önceki taramaya göre (§4.5): aynı protokolde, iç sıraya göre ↑ ↓ =; ağrının başlaması ve geçmesi ayrı; önceki
 * yoksa ya da yapılmadıysa "yeni". Yapılmayan karşılaştırılmaz. Belirgin: ≥ 2 basamak ya da ağrı değişimi **[sentez]**.
 */
export function compareCell(current: Outcome | null, previous: Outcome | null): { change: Change; significant: boolean } | null {
  if (current === null || current === 'not_tested') return null;
  if (current === 'pain') return previous === 'pain' ? { change: 'same', significant: false } : { change: 'pain_new', significant: true };
  if (previous === 'pain') return { change: 'pain_gone', significant: true };
  const now = rankOf(current);
  const before = rankOf(previous);
  if (now === null) return null;
  if (before === null) return { change: 'new', significant: false };
  if (now === before) return { change: 'same', significant: false };
  return { change: now > before ? 'up' : 'down', significant: Math.abs(now - before) >= 2 };
}

/** Önceki taramanın hücresi (aynı protokolde). */
export function previousOutcome(previous: Screening | null | undefined, testId: ScreeningTestId, side: SideKey): Outcome | null {
  if (!previous || previous.protocol !== SCREENING_PROTOCOL) return null;
  return outcomeOf(testId, sideEntry(previous.tests, testId, side));
}

/* --- ipuçları (yalnız PT) --- */

export type Hint = { key: string; testId: ScreeningTestId; text: string; outcome: Outcome; ids: string[] };

function listTitles(ids: readonly string[], titleOf: (id: string) => string | undefined): { text: string; ids: string[] } {
  const found = ids.flatMap((id) => {
    const title = titleOf(id);
    return title ? [{ id, title }] : [];
  });
  return { text: found.map((item) => item.title).join(', '), ids: found.map((item) => item.id) };
}

/**
 * Programa ipuçları (§4.6, **[sentez]**): ağrılı → öneri yok; Yapılamadı → destekli ve kısa aralık; Kolaylaştırılmış
 * → testin gerileme listesi; Telafiyle → kaçan noktanın ipucu; Temiz → ilerleme listesi; büyük asimetride zayıf
 * taraftan başla. Sıra: ağrı → en düşük sonuç → asimetri; eşitlikte test sırası. Hedefi PT bilir.
 */
export function screeningHints(
  screening: Pick<Screening, 'tests'>,
  titleOf: (id: string) => string | undefined,
  suppress?: SideSuppress,
): Hint[] {
  const major = new Map(asymmetries(screening, suppress).filter((item) => item.kind === 'major').map((item) => [item.testId, item]));
  type Draft = Hint & { order: [number, number, number, number] };
  const drafts: Draft[] = [];
  for (const testId of SCREENING_TEST_IDS) {
    const test = SCREENING_TESTS[testId];
    const cells = cellsOf(screening).filter((cell) => cell.testId === testId && cell.outcome !== 'not_tested');
    // İki taraf aynı sonuç ve aynı noktalarla: tek satır.
    const same =
      cells.length === 2 &&
      cells[0]!.outcome === cells[1]!.outcome &&
      effectiveMissed(testId, cells[0]!.entry).join() === effectiveMissed(testId, cells[1]!.entry).join();
    const groups = same ? [{ cells, label: test.sided ? ' (iki taraf)' : '' }] : cells.map((cell) => ({ cells: [cell], label: cell.side === 'center' ? '' : `, ${SIDE_KEY_LABELS[cell.side].toLocaleLowerCase('tr')}` }));
    for (const group of groups) {
      const cell = group.cells[0]!;
      const name = `${testName(testId)}${group.label}`;
      const asym = major.get(testId);
      const weakSide = asym && group.cells.some((item) => item.side === asym.weaker);
      const missed = effectiveMissed(testId, cell.entry);
      const missedText = missed.map((id) => test.points.find((point) => point.id === id)?.label.toLocaleLowerCase('tr') ?? id).join(', ');
      let text: string;
      let ids: string[] = [];
      switch (cell.outcome) {
        case 'pain':
          text = `${name}: ağrılı; öneri yok. Değerlendirmeden sonra yeniden tara.`;
          break;
        case 'unable': {
          const list = listTitles(test.regress, titleOf);
          ids = list.ids;
          text = `${name} (Yapılamadı): kalıbı yükleme; destekli ve kısa aralıkla başla${list.text ? ` — ${list.text}` : ''}.`;
          break;
        }
        case 'easier': {
          const list = listTitles(test.regress, titleOf);
          ids = list.ids;
          text = `${name} (Kolaylaştırılmış): kolaylaştırılmış sürümle çalış${list.text ? ` — ${list.text}` : ''}.`;
          break;
        }
        case 'compensated': {
          const first = test.points.find((point) => point.id === missed[0]);
          text = `${name} (Telafiyle · ${missedText}): yüklenebilir; ipucu: ${first?.hint ?? 'kaçan noktaya dikkat'}.`;
          break;
        }
        default: {
          const list = listTitles(test.progress, titleOf);
          ids = list.ids;
          text = `${name} (Temiz): ilerlet${list.text ? ` — ${list.text}` : ''}.`;
        }
      }
      if (testId === 'squat' && (screening.tests.squat as { heelSupportHelps?: boolean } | undefined)?.heelSupportHelps && cell.outcome !== 'pain') {
        text += " Topuk desteğiyle düzeldi → ayak bileği: Ölçümler'de duvar lunge testini gir.";
      }
      if (weakSide && cell.outcome !== 'pain') text += ' Zayıf taraftan başla, iki tarafa eşit iş.';
      const rank = rankOf(cell.outcome) ?? 4;
      drafts.push({
        key: group.cells.map((item) => item.key).join('+'),
        testId,
        text,
        outcome: cell.outcome,
        ids,
        order: [cell.outcome === 'pain' ? 0 : 1, rank, weakSide ? 0 : 1, SCREENING_TEST_IDS.indexOf(testId)],
      });
    }
  }
  drafts.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2] || a.order[3] - b.order[3]);
  return drafts.map(({ order: _order, ...hint }) => hint);
}

/* --- danışanın görünümü --- */

export type ClientScreeningRow = {
  testId: ScreeningTestId;
  title: string;
  sides: { side: SideKey; label: string; text: string; outcome: Outcome; change: 'up' | 'down' | null }[];
  focus?: string;
};

/**
 * Danışanın Sağlık sayfasındaki tarama (§5.2): sözcük, taraf, önceki taramaya göre ok ve en çok bir odak (kaçan
 * ilk noktanın danışan dilindeki karşılığı). Sayı ve toplam yok.
 */
export function clientScreeningRows(screening: Pick<Screening, 'tests'>, previous: Screening | null): ClientScreeningRow[] {
  const rows: ClientScreeningRow[] = [];
  for (const testId of SCREENING_TEST_IDS) {
    const test = SCREENING_TESTS[testId];
    const cells = cellsOf(screening).filter((cell) => cell.testId === testId);
    if (cells.length === 0) continue;
    const sides = cells.map((cell) => {
      const compared = compareCell(cell.outcome, previousOutcome(previous, testId, cell.side));
      const change: 'up' | 'down' | null =
        compared?.change === 'up' || compared?.change === 'pain_gone' ? 'up' : compared?.change === 'down' ? 'down' : null;
      return { side: cell.side, label: SIDE_KEY_LABELS[cell.side], text: OUTCOME_CLIENT_LABELS[cell.outcome], outcome: cell.outcome, change };
    });
    const focusCell = cells.find((cell) => cell.outcome === 'compensated' || cell.outcome === 'easier');
    const focusId = focusCell ? effectiveMissed(testId, focusCell.entry)[0] : undefined;
    const focus = focusId ? test.points.find((point) => point.id === focusId)?.focus : undefined;
    rows.push({ testId, title: testName(testId), sides, ...(focus ? { focus } : {}) });
  }
  return rows;
}

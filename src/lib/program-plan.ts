import { todayIn } from './format.ts';
import type { SetSpec } from './set-plan.ts';
import { prepareForEditing, type IdSource } from './template-edit.ts';
import {
  normalizeTemplate,
  randomId,
  scaleLoad,
  templateMuscleLoad,
  upgradeLegacyBlocks,
  type PlanExercise,
  type TemplateBlock,
  type TemplateRow,
} from './template-plan.ts';

/**
 * Danışana özel program — yapı, rotasyon ve evreler (SPEC §7.4).
 *
 * Şablon yalnız başlangıç noktasıdır: program danışanın kendi repo'sunda `program.json`
 * olarak durur, şablondan ya da boş oluşturulur ve yalnız o danışan için düzenlenir.
 * Program günlerden oluşur, gün şablonla aynı bloklardan. Günler sırayla döner (A → B → C).
 * Evreler isteğe bağlıdır (`phased`): evresiz program tek, süresiz, gizli bir evrede
 * durur (kimlikler, şu anki evre ve rotasyon aynı kalsın diye); PT "Evrelere böl" derse
 * günler evrelere dağılır, şu anki evrenin günleri döner, evre geçişini PT onaylar.
 * Haftada kaç gün (`daysPerWeek`) evrededir; evresizde programın sıklığıdır.
 *
 * Kimlikler (evre, gün, blok, satır) bütün programda benzersizdir: antrenman kayıtları
 * satıra kimlikle bağlanır. Şablondan gelen bloklar yeni kimlik alır.
 *
 * Saf fonksiyonlar; yol takma adıyla çalışma zamanı içe aktarması yapmaz (testler
 * Node'un kendi test aracıyla çalışır). Düzenleyici işlemleri değiştirmez: yeni dizi
 * döner, değişiklik yoksa aynı dizi.
 */

export const PHASE_ID_PATTERN = /^p_[a-z0-9]{6}$/;
export const DAY_ID_PATTERN = /^d_[a-z0-9]{6}$/;

export const PROGRAM_LIMITS = {
  phases: 12,
  daysPerPhase: 7,
  days: 28,
  phaseName: 40,
  dayName: 40,
  weeks: 52,
  daysPerWeek: 7,
  log: 200,
  changesPerEntry: 60,
  changeScope: 90,
  changeText: 300,
} as const;

/** `client`: danışanın kendi değişikliği (antrenman günleri, bitişte kilo ve tekrar hedefi); revision artmaz. */
export const LOG_KINDS = ['create', 'edit', 'phase', 'client'] as const;
export type LogKind = (typeof LOG_KINDS)[number];
export const LOG_KIND_LABELS: Record<LogKind, string> = {
  create: 'Oluşturuldu',
  edit: 'Düzenlendi',
  phase: 'Evre geçişi',
  client: 'Danışan güncelledi',
};

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Evresiz programın gizli evresinin (ve evreler kaldırılınca tek evrenin) adı. */
export const DEFAULT_PHASE_NAME = 'Evre 1';

// Yapısal tipler: Valibot şemasının çıktısı (`schemas/program.ts`) bunlara atanabilir.
/** Günün geldiği şablon: o anki adıyla; şablon sonra değişse ya da silinse de program değişmez. */
export type DaySource = { templateId: string; templateName: string; at: string };
export type ProgramDay = { id: string; name: string; blocks: TemplateBlock[]; source?: DaySource };
export type ProgramPhase = {
  id: string;
  name: string;
  /** Süre (hafta); yoksa süresiz. Evresiz programda yok. */
  weeks?: number;
  /** Haftada kaç gün (1–7); evresiz programda programın sıklığı. */
  daysPerWeek?: number;
  days: ProgramDay[];
};
/** Düzenleyicinin gönderdiği gövde: evrelere bölündü mü, evreler, şu anki evre ve antrenman günleri. */
export type ProgramBody = {
  /** false: tek, süresiz gün listesi (gizli tek evre); ekranlar evreden söz etmez. */
  phased: boolean;
  currentPhaseId: string;
  phases: ProgramPhase[];
  /**
   * PT'nin seçtiği antrenman günleri (ISO hafta günü, 1 = Pazartesi; boş = seçilmedi). Göndermeyen
   * (eski sekme, eski taslak) kayıttakini değiştirmez (`training-days.ts`).
   */
  weekdays?: number[];
};
export type ProgramRotation = { lastDayId?: string; lastCompletedAt?: string };
export type ProgramChange = { scope?: string; text: string };
/**
 * Geçmiş kaydı. `sessionId`: antrenman bitişinde yazılan danışan kaydının seansı (tasarım §6.3); aynı
 * seansın kaydı ikinci kez eklenmez (bitişin yeniden denenmesi çoğaltmaz).
 */
export type ProgramLogEntry = { at: string; revision: number; kind: LogKind; sessionId?: string; changes: ProgramChange[] };
/**
 * PT'nin antrenman günleri (tasarım §2.11). `at`: geçerli günlerin son değiştiği an (PT'nin değişikliği, "PT'nin
 * günlerine dön", danışanın PT'nin günlerine dönmesi); kaçan gün penceresi bundan önce sayılmaz (`attention.ts`).
 */
export type ProgramSchedule = { weekdays: number[]; at?: string };
/** Danışanın kendi günleri: PT'nin düzenleyicisi 412 almasın diye ayrı katman; revision artmaz, PT'nin değişikliği temizler. */
export type ClientSchedule = { weekdays: number[]; at: string };
/**
 * Danışanın tekrar/süre hedefi (tasarım §6.2, `client-targets.ts`): satırın setleri hâlâ `baseSets`'e
 * (PT'nin o anki setleri) eşitse `sets` geçerlidir; PT satırı değiştirince düşer. Revision artmaz.
 */
export type ClientTarget = { sets: SetSpec[]; baseSets: SetSpec[]; sessionId?: string; at: string };
export type ClientTargets = Record<string, ClientTarget>;
export type ProgramState = {
  version: 2;
  /** Evrelere bölündü mü (açık karar: tek süresiz evreli ama bölünmüş program da olur). */
  phased: boolean;
  /** PT'nin her kaydında +1; rotasyon yazımı artırmaz. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  phases: ProgramPhase[];
  current: { phaseId: string; startedAt: string };
  rotation: ProgramRotation;
  /** PT'nin seçtiği antrenman günleri; yoksa seçilmemiş. */
  schedule?: ProgramSchedule;
  /** Danışanın değiştirdiği günler; varsa geçerli olan bu (`effectiveSchedule`). */
  clientSchedule?: ClientSchedule;
  /** Danışanın satır başına tekrar/süre hedefi (satır kimliğiyle); PT'nin setleri değişince geçersiz. */
  clientTargets?: ClientTargets;
  /** En yenisi üstte. */
  log: ProgramLogEntry[];
};
/** Gün eklerken ve program oluştururken seçilen şablon (yalnız gereken alanlar). */
export type TemplateOption = { id: string; name: string; blocks: readonly TemplateBlock[] };
/** Programın kimlik üreticisi; şablon düzenleyicinin `IdSource`'una atanabilir. */
export type ProgramIdSource = (prefix: 'p' | 'd' | 'b' | 'r') => string;

type Phases = readonly ProgramPhase[];

/* --- kimlikler ve adlar --- */

function allIds(phases: Phases): string[] {
  return phases.flatMap((phase) => [
    phase.id,
    ...phase.days.flatMap((day) => [day.id, ...day.blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)])]),
  ]);
}

/** Kimlik üretici: programdaki bütün kimlikleri bilir, ürettiklerini de hatırlar; hiçbiri tekrar etmez. */
export function programIdSource(phases: Phases, random?: (n: number) => Uint8Array): ProgramIdSource {
  const taken = new Set(allIds(phases));
  return (prefix) => {
    const id = randomId(prefix, 6, taken, random);
    taken.add(id);
    return id;
  };
}

/** Birden çok kez geçen evre, gün, blok ve satır kimlikleri (temiz programda boş). */
export function duplicateProgramIds(phases: Phases): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of allIds(phases)) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

export function countDays(phases: Phases): number {
  return phases.reduce((sum, phase) => sum + phase.days.length, 0);
}

/** Ad karşılaştırması: baştaki/sondaki boşluk ve Türkçe büyük/küçük harf fark etmez. */
function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('tr');
}

/** Tekrar eden adlar (ikinci ve sonraki geçişleri). */
export function duplicateNames(items: readonly { name: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    const key = nameKey(item.name);
    if (seen.has(key)) duplicates.push(item.name);
    seen.add(key);
  }
  return duplicates;
}

/** Blokların derin kopyası: her blok ve satır yeni kimlik alır; başka hiçbir şey değişmez. */
export function reIdBlocks(blocks: readonly TemplateBlock[], ids: IdSource): TemplateBlock[] {
  return blocks.map((block) => ({
    ...block,
    id: ids('b'),
    rows: block.rows.map(
      (row): TemplateRow => ({
        ...row,
        id: ids('r'),
        sets: row.sets.map((set) => ({ ...set })),
        ...(row.rule ? { rule: { ...row.rule } } : {}),
      }),
    ),
  }));
}

const DAY_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Sıradaki gün adı: "Gün A"…"Gün Z" içinde kullanılmayan ilk harf (özel adlar sayılmaz). */
export function nextDayName(days: readonly { name: string }[]): string {
  const taken = new Set(days.map((day) => nameKey(day.name)));
  for (const letter of DAY_LETTERS) {
    const name = `Gün ${letter}`;
    if (!taken.has(nameKey(name))) return name;
  }
  return `Gün ${days.length + 1}`;
}

/** Sıradaki evre adı: "Evre n", n evre sayısının bir fazlasından başlayıp boş olana kadar. */
export function nextPhaseName(phases: readonly { name: string }[]): string {
  const taken = new Set(phases.map((phase) => nameKey(phase.name)));
  let n = phases.length + 1;
  while (taken.has(nameKey(`Evre ${n}`))) n += 1;
  return `Evre ${n}`;
}

/** Kullanılmayan ad: önce kendisi, sonra "ad 2", "ad 3"…; en fazla 40 karakter. */
export function uniqueName(base: string, taken: readonly string[]): string {
  const keys = new Set(taken.map(nameKey));
  const max = PROGRAM_LIMITS.phaseName;
  const first = base.slice(0, max).trimEnd();
  if (!keys.has(nameKey(first))) return first;
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, max - suffix.length).trimEnd()}${suffix}`;
    if (!keys.has(nameKey(candidate))) return candidate;
  }
}

/* --- oluşturma --- */

/** Düzenleyicinin boş iskeleti: evresiz, tek gün, hareketsiz (hareket eklenmeden kaydedilmez). */
export function blankProgramBody(ids: ProgramIdSource): ProgramBody {
  const phaseId = ids('p');
  return {
    phased: false,
    currentPhaseId: phaseId,
    phases: [{ id: phaseId, name: DEFAULT_PHASE_NAME, days: [{ id: ids('d'), name: 'Gün A', blocks: [] }] }],
  };
}

/** Yeni evre: sıradaki adla, süresiz, tek boş günle; sıklık son evreninki. */
export function blankPhase(phases: Phases, ids: ProgramIdSource): ProgramPhase {
  const daysPerWeek = phases.at(-1)?.daysPerWeek;
  return {
    id: ids('p'),
    name: nextPhaseName(phases),
    ...(daysPerWeek !== undefined ? { daysPerWeek } : {}),
    days: [{ id: ids('d'), name: 'Gün A', blocks: [] }],
  };
}

/** Evreye boş gün. */
export function blankDay(phase: Pick<ProgramPhase, 'days'>, ids: ProgramIdSource): ProgramDay {
  return { id: ids('d'), name: nextDayName(phase.days), blocks: [] };
}

/** Şablondan gün: bloklar yeni kimlikle kopyalanır (notlar kalır; şablon notları geneldir). */
export function dayFromTemplate(
  phase: Pick<ProgramPhase, 'days'>,
  template: TemplateOption,
  ids: ProgramIdSource,
  now: Date,
): ProgramDay {
  return {
    id: ids('d'),
    name: nextDayName(phase.days),
    blocks: reIdBlocks(template.blocks, ids),
    source: { templateId: template.id, templateName: template.name, at: now.toISOString() },
  };
}

/**
 * Şablondan gün, düzenleyiciye hazır: bloklar yeni kimlikle kopyalanır (`dayFromTemplate`), silinmiş
 * cihaza yazılmış satırlar açılıştaki gibi egzersizin kendi cihazına döner (SPEC §7.4; cihaz silinince
 * şablon dosyası değişmez). Başlangıç şablonu ve "Gün ekle → Şablondan" bunu kullanır; düşen satırlar
 * düzenleyicinin uyarısında sayılır (`droppedDeviceNotice`).
 */
export function dayFromTemplateForEditing(
  phase: Pick<ProgramPhase, 'days'>,
  template: TemplateOption,
  ids: ProgramIdSource,
  now: Date,
  deviceIds: ReadonlySet<string>,
): { day: ProgramDay; droppedDeviceRowIds: string[] } {
  const day = dayFromTemplate(phase, template, ids, now);
  const prepared = prepareForEditing(day, deviceIds);
  return { day: { ...day, blocks: prepared.blocks }, droppedDeviceRowIds: prepared.droppedDeviceRowIds };
}

/** Günün kopyası aynı evreye: yeni kimlikler, sıradaki ad, kaynak aynı. */
export function copyDay(phase: Pick<ProgramPhase, 'days'>, day: ProgramDay, ids: ProgramIdSource): ProgramDay {
  return {
    id: ids('d'),
    name: nextDayName(phase.days),
    blocks: reIdBlocks(day.blocks, ids),
    ...(day.source ? { source: { ...day.source } } : {}),
  };
}

/** Evrenin kopyası: "… kopyası" adıyla, aynı süre ve sıklık; günler yeni kimlikle, adları ve kaynakları aynı. */
export function copyPhase(phases: Phases, phase: ProgramPhase, ids: ProgramIdSource): ProgramPhase {
  return {
    id: ids('p'),
    name: uniqueName(`${phase.name} kopyası`, phases.map((item) => item.name)),
    ...(phase.weeks !== undefined ? { weeks: phase.weeks } : {}),
    ...(phase.daysPerWeek !== undefined ? { daysPerWeek: phase.daysPerWeek } : {}),
    days: phase.days.map((day) => ({
      id: ids('d'),
      name: day.name,
      blocks: reIdBlocks(day.blocks, ids),
      ...(day.source ? { source: { ...day.source } } : {}),
    })),
  };
}

/** Günlerin geldiği şablonların adları, gün sırasıyla ve bir kez. */
export function sourceNames(phases: Phases): string[] {
  const names: string[] = [];
  for (const day of phases.flatMap((phase) => phase.days)) {
    if (day.source && !names.includes(day.source.templateName)) names.push(day.source.templateName);
  }
  return names;
}

/**
 * Oluşturma kaydının cümlesi: hangi şablonlardan (gün sırasıyla). Geçmişin sınırına (300
 * karakter) sığmayan adlar "… ve n şablon daha" olur; hepsi günlerin kaynağında durur.
 */
export function creationChange(body: Pick<ProgramBody, 'phases'>): ProgramChange {
  const names = sourceNames(body.phases);
  if (names.length === 0) return { text: 'Program oluşturuldu' };
  const text = (shown: number) => {
    const quoted = names
      .slice(0, shown)
      .map((name) => `'${name}'`)
      .join(', ');
    const rest = names.length - shown;
    return `Program oluşturuldu: ${quoted} ${shown === 1 ? 'şablonundan' : 'şablonlarından'}${rest > 0 ? ` … ve ${rest} şablon daha` : ''}`;
  };
  let shown = names.length;
  while (shown > 1 && text(shown).length > PROGRAM_LIMITS.changeText) shown -= 1;
  return { text: text(shown) };
}

/** Yeni program kaydı: sürüm 2, şu anki evre şimdi başlar, geçmişte tek "oluşturuldu"; seçildiyse antrenman günleri. */
export function createProgramRecord(body: ProgramBody, now: Date): ProgramState {
  const at = now.toISOString();
  return {
    version: 2,
    phased: body.phased,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    phases: body.phases,
    current: { phaseId: body.currentPhaseId, startedAt: at },
    rotation: {},
    ...(body.weekdays?.length ? { schedule: { weekdays: [...new Set(body.weekdays)].sort((a, b) => a - b) } } : {}),
    log: appendLog([], { at, revision: 1, kind: 'create', changes: [creationChange(body)] }),
  };
}

/**
 * Düzenleyicinin yüklediği program sürümü: `revision` ve oluşturulma anı (`createdAt`). Program silinip
 * yeniden oluşturulunca revision yine 1'den başlar; oluşturulma anı farklı olduğu için çakışma (412)
 * atlanmaz. Oluşturulma anı olmayan taraf (eski sekme, eski taslak) yalnız revision'la karşılaştırılır.
 */
export type ProgramBase = { revision: number; createdAt?: string };

/** Aynı program sürümü mü: kayıtta (sunucu, 412) ve taslakta (`draftConflict`) aynı karşılaştırma. */
export function sameProgramBase(a: ProgramBase, b: ProgramBase): boolean {
  return a.revision === b.revision && (a.createdAt === undefined || b.createdAt === undefined || a.createdAt === b.createdAt);
}

/** Şablondan program: evresiz, şablonla dolu tek gün ("Gün A"). */
export function createProgramFromTemplate(template: TemplateOption, ids: ProgramIdSource, now: Date): ProgramState {
  const phaseId = ids('p');
  const day = dayFromTemplate({ days: [] }, template, ids, now);
  return createProgramRecord(
    { phased: false, currentPhaseId: phaseId, phases: [{ id: phaseId, name: DEFAULT_PHASE_NAME, days: [day] }] },
    now,
  );
}

/**
 * Günü şablona çevirir: satır notları atılır (şablonda kişisel veri olmamalı). Blok ve
 * satır kimlikleri kalır (gün içinde benzersiz, şablon için yeterli). Girdi değişmez.
 */
export function dayToTemplate(
  day: Pick<ProgramDay, 'blocks'>,
  name: string,
): { template: { name: string; description: ''; blocks: TemplateBlock[] }; droppedNotes: number } {
  let droppedNotes = 0;
  const blocks = day.blocks.map((block) => ({
    ...block,
    rows: block.rows.map((row) => {
      const { note, ...rest } = row;
      if (note?.trim()) droppedNotes += 1;
      return { ...rest, sets: rest.sets.map((set) => ({ ...set })), ...(rest.rule ? { rule: { ...rest.rule } } : {}) };
    }),
  }));
  return { template: { name, description: '', blocks }, droppedNotes };
}

/**
 * "Şablon olarak kaydet"in yerel kopyası ("Şablondan…" hemen kullanabilsin): sunucunun yazdığı gibi
 * şablon kurallarıyla sadeleşir (`normalizeTemplate`: egzersizinkine eşit kural ve cihaz düşer).
 * Programda kalan danışana özel eşit seçim şablona geçmez; sayfa yenilenince gelen şablonla aynıdır.
 */
export function savedTemplateOption(
  template: TemplateOption,
  ctx: { exercises: ReadonlyMap<string, PlanExercise>; deviceIds: ReadonlySet<string> },
): TemplateOption {
  return { ...template, blocks: normalizeTemplate(template, ctx).blocks };
}

/* --- düzenleyici işlemleri --- */

export function locateDay(phases: Phases, dayId: string): { phaseIndex: number; dayIndex: number } | null {
  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
    const dayIndex = phases[phaseIndex]?.days.findIndex((day) => day.id === dayId) ?? -1;
    if (dayIndex >= 0) return { phaseIndex, dayIndex };
  }
  return null;
}

/** Yeni evre eklenebilir mi (12 evre, toplam 28 gün). */
export function canAddPhase(phases: Phases, extraDays = 1): boolean {
  return phases.length < PROGRAM_LIMITS.phases && countDays(phases) + extraDays <= PROGRAM_LIMITS.days;
}

/** Evreye gün eklenebilir mi (evrede 7, toplam 28 gün). */
export function canAddDay(phases: Phases, phaseId: string): boolean {
  const phase = phases.find((item) => item.id === phaseId);
  return Boolean(phase) && (phase?.days.length ?? 0) < PROGRAM_LIMITS.daysPerPhase && countDays(phases) < PROGRAM_LIMITS.days;
}

function shift<T>(items: readonly T[], index: number, delta: -1 | 1): T[] | null {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return null;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

function insertAfter<T extends { id: string }>(items: readonly T[], item: T, afterId?: string): T[] {
  const index = afterId === undefined ? -1 : items.findIndex((entry) => entry.id === afterId);
  const next = [...items];
  next.splice(index < 0 ? items.length : index + 1, 0, item);
  return next;
}

function updatePhase(phases: Phases, phaseId: string, update: (phase: ProgramPhase) => ProgramPhase): ProgramPhase[] {
  let changed = false;
  const next = phases.map((phase) => {
    if (phase.id !== phaseId) return phase;
    const updated = update(phase);
    if (updated !== phase) changed = true;
    return updated;
  });
  return changed ? next : (phases as ProgramPhase[]);
}

/** Evre ekler: verilen evrenin arkasına, yoksa sona. Sınırdaysa değişmez. */
export function addPhase(phases: Phases, phase: ProgramPhase, afterPhaseId?: string): ProgramPhase[] {
  if (!canAddPhase(phases, phase.days.length)) return phases as ProgramPhase[];
  return insertAfter(phases, phase, afterPhaseId);
}

/** Evreyi siler; şu anki evre ve tek evre silinmez. */
export function removePhase(phases: Phases, phaseId: string, currentPhaseId: string): ProgramPhase[] {
  if (phaseId === currentPhaseId || phases.length <= 1 || !phases.some((phase) => phase.id === phaseId)) {
    return phases as ProgramPhase[];
  }
  return phases.filter((phase) => phase.id !== phaseId);
}

/** Evreyi bir öne ya da arkaya taşır; uçlarda değişmez. */
export function movePhase(phases: Phases, phaseId: string, delta: -1 | 1): ProgramPhase[] {
  return shift(phases, phases.findIndex((phase) => phase.id === phaseId), delta) ?? (phases as ProgramPhase[]);
}

/** Evreye gün ekler: verilen günün arkasına, yoksa sona. Sınırdaysa değişmez. */
export function addDay(phases: Phases, phaseId: string, day: ProgramDay, afterDayId?: string): ProgramPhase[] {
  if (!canAddDay(phases, phaseId)) return phases as ProgramPhase[];
  return updatePhase(phases, phaseId, (phase) => ({ ...phase, days: insertAfter(phase.days, day, afterDayId) }));
}

/** Günü siler; evrenin tek günü silinmez. */
export function removeDay(phases: Phases, phaseId: string, dayId: string): ProgramPhase[] {
  return updatePhase(phases, phaseId, (phase) =>
    phase.days.length <= 1 || !phase.days.some((day) => day.id === dayId)
      ? phase
      : { ...phase, days: phase.days.filter((day) => day.id !== dayId) },
  );
}

/** Evreler kaldırılabilir mi: birleşen gün sayısı tek listenin sınırını (7) aşmamalı. */
export function mergePhasesCheck(phases: Phases): { ok: boolean; days: number } {
  const days = countDays(phases);
  return { ok: days <= PROGRAM_LIMITS.daysPerPhase, days };
}

/**
 * Evreleri kaldırır: bütün günler program sırasıyla şu anki evrenin kimliğinde birleşir
 * (rotasyon ve şu anki evre değişmez); aynı adlı gün "Gün A 2" olur. Süre düşer, ad
 * 'Evre 1', sıklık şu anki evreninki. Kimlikler ve günlerin içi aynen kalır.
 */
export function mergePhases(
  phases: Phases,
  currentPhaseId: string,
): { phases: ProgramPhase[]; renamed: { dayId: string; from: string; to: string }[] } {
  const current = phases.find((phase) => phase.id === currentPhaseId) ?? phases[0];
  if (!current) return { phases: [], renamed: [] };
  const renamed: { dayId: string; from: string; to: string }[] = [];
  const days: ProgramDay[] = [];
  for (const day of phases.flatMap((phase) => phase.days)) {
    const name = uniqueName(day.name, days.map((item) => item.name));
    if (name !== day.name) renamed.push({ dayId: day.id, from: day.name, to: name });
    days.push(name === day.name ? day : { ...day, name });
  }
  return {
    phases: [
      {
        id: current.id,
        name: DEFAULT_PHASE_NAME,
        ...(current.daysPerWeek !== undefined ? { daysPerWeek: current.daysPerWeek } : {}),
        days,
      },
    ],
    renamed,
  };
}

/**
 * Evresiz program evresiz kaydedilirken gizli evre aynı gün listesidir: düzenleyicide evreler
 * açılıp kapansa da (böl → evre ekle → şu anki yap → kaldır) kimliği ve adı kayıttakinden gelir.
 * Böylece fark gün düzeyinde çıkar, evreden söz etmez; şu anki evre ve rotasyon değişmez.
 * Taraflardan biri evreliyse gövde aynen döner.
 */
export function keepHiddenPhase(stored: Pick<ProgramBody, 'phased' | 'phases'>, body: ProgramBody): ProgramBody {
  const hidden = stored.phased ? undefined : stored.phases[0];
  const [only, ...others] = body.phases;
  if (body.phased || !hidden || !only || others.length > 0 || (only.id === hidden.id && only.name === hidden.name)) return body;
  return { ...body, currentPhaseId: hidden.id, phases: [{ ...only, id: hidden.id, name: hidden.name }] };
}

/** Gün başka evreye taşınabilir mi: başka evre, kaynakta tek gün değil, hedef dolu (7) değil. */
export function canMoveDay(phases: Phases, dayId: string, targetPhaseId: string): boolean {
  const source = phases.find((phase) => phase.days.some((day) => day.id === dayId));
  const target = phases.find((phase) => phase.id === targetPhaseId);
  if (!source || !target || source.id === target.id || source.days.length <= 1) return false;
  return target.days.length < PROGRAM_LIMITS.daysPerPhase;
}

/** Evrenin yerine geçilebilecek tek günü: hareketsiz ve kaynaksız (yeni evrenin boş "Gün A"sı). */
function blankReplaceable(phase: ProgramPhase): ProgramDay | null {
  const [only] = phase.days;
  return phase.days.length === 1 && only && only.blocks.length === 0 && !only.source ? only : null;
}

/**
 * Günü başka evreye taşır (sona); adı hedefte varsa "… 2" olur. Hedefte yalnız tek,
 * hareketsiz, kaynaksız bir gün varsa (yeni evrenin boş günü) onun yerine geçer.
 * Taşınamıyorsa (`canMoveDay`) aynı dizi döner.
 */
export function moveDayToPhase(phases: Phases, dayId: string, targetPhaseId: string): ProgramPhase[] {
  if (!canMoveDay(phases, dayId, targetPhaseId)) return phases as ProgramPhase[];
  const day = phases.flatMap((phase) => phase.days).find((item) => item.id === dayId) as ProgramDay;
  const target = phases.find((phase) => phase.id === targetPhaseId) as ProgramPhase;
  const blank = blankReplaceable(target);
  const kept = blank ? [] : target.days;
  const name = uniqueName(day.name, kept.map((item) => item.name));
  const moved = name === day.name ? day : { ...day, name };
  return phases.map((phase) => {
    if (phase.id === targetPhaseId) return { ...phase, days: [...kept, moved] };
    if (phase.days.some((item) => item.id === dayId)) return { ...phase, days: phase.days.filter((item) => item.id !== dayId) };
    return phase;
  });
}

/** Günü evrenin içinde bir öne ya da arkaya taşır; uçlarda değişmez. */
export function moveDay(phases: Phases, phaseId: string, dayId: string, delta: -1 | 1): ProgramPhase[] {
  return updatePhase(phases, phaseId, (phase) => {
    const days = shift(phase.days, phase.days.findIndex((day) => day.id === dayId), delta);
    return days ? { ...phase, days } : phase;
  });
}

/**
 * Günün bloklarını değiştirir (oluştururken başlangıç şablonu). `source`: verilirse yazılır,
 * `null` kaldırır, verilmezse olduğu gibi kalır.
 */
export function replaceDayBlocks(
  phases: Phases,
  dayId: string,
  blocks: TemplateBlock[],
  source?: DaySource | null,
): ProgramPhase[] {
  const found = locateDay(phases, dayId);
  const phase = found ? phases[found.phaseIndex] : undefined;
  if (!found || !phase) return phases as ProgramPhase[];
  return updatePhase(phases, phase.id, (item) => ({
    ...item,
    days: item.days.map((day) => {
      if (day.id !== dayId) return day;
      const { source: previous, ...rest } = day;
      const nextSource = source === undefined ? previous : source;
      return { ...rest, blocks, ...(nextSource ? { source: nextSource } : {}) };
    }),
  }));
}

/** Düzenlemeye açarken: artık olmayan cihaza yazılmış satırlar egzersizin cihazına döner (bütün günlerde). */
export function prepareProgramForEditing(
  phases: Phases,
  deviceIds: ReadonlySet<string>,
): { phases: ProgramPhase[]; droppedDeviceRowIds: string[] } {
  const droppedDeviceRowIds: string[] = [];
  const next = phases.map((phase) => ({
    ...phase,
    days: phase.days.map((day) => {
      const prepared = prepareForEditing(day, deviceIds);
      droppedDeviceRowIds.push(...prepared.droppedDeviceRowIds);
      return { ...day, blocks: prepared.blocks };
    }),
  }));
  return { phases: next, droppedDeviceRowIds };
}

/**
 * Düzenleyicinin uyarısı: cihazı silindiği için egzersizin kendi cihazına dönen satırlar (açılışta,
 * şablondan gelen günde, geri yüklenen taslakta not edilir), bugünkü hâliyle sayılır: satır formda
 * duruyor ve PT ona başka cihaz seçmedi. "Kaydedince kalıcı olur" yalnız kaydedilecek iş varken
 * (`unsaved`: Kaydet görünür). Sayılacak satır yoksa `null`.
 */
export function droppedDeviceNotice(phases: Phases, noted: ReadonlySet<string>, unsaved: boolean): string | null {
  const count = phases
    .flatMap((phase) => phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows)))
    .filter((row) => noted.has(row.id) && row.deviceId === undefined).length;
  if (count === 0) return null;
  return `${count} satırın cihazı silinmiş; egzersizin kendi cihazına döndü.${unsaved ? ' Kaydedince kalıcı olur.' : ''}`;
}

/** Kütüphanede olmayan egzersize bağlı satırlar, gün gün. */
export function missingExerciseDays(
  phases: Phases,
  exerciseIds: ReadonlySet<string>,
): { phaseId: string; dayId: string; rowIds: string[] }[] {
  return phases.flatMap((phase) =>
    phase.days.flatMap((day) => {
      const rowIds = day.blocks.flatMap((block) => block.rows.filter((row) => !exerciseIds.has(row.exerciseId)).map((row) => row.id));
      return rowIds.length > 0 ? [{ phaseId: phase.id, dayId: day.id, rowIds }] : [];
    }),
  );
}

/**
 * Kayıttan önce sunucuda: her gün `normalizeTemplate`'ten geçer (kütüphane denetimi,
 * sadeleştirme). Hata anahtarları Formisch yollarıdır (`phases.1.days.0.blocks.0.rows.0.exerciseId`).
 * Adlar kırpılır; sıklık ve kaynak aynen kalır, süre yalnız evreli programda. Silinen cihaza
 * yazılmış satır, düzenleyicinin açılışındaki gibi egzersizin cihazına döner (SPEC §7.4): şablondan
 * eklenen gün, geri yüklenen taslak ya da eski sekme yüzünden kayıt reddedilmez; düşen satırlar
 * (`droppedDeviceRowIds`) PT'ye bildirilir, sessiz kalmaz. Egzersizinkine eşit
 * kural ya da cihaz yalnız kayıttaki (`stored`; oluştururken yok) aynı satırda aynen duruyorsa kalır:
 * danışana özel seçim egzersiz sonradan ona eşitlense de kaybolmaz; yeni gelen eşit değer şablondaki
 * gibi düşer (seçicide gösterilen varsayılanı yeniden seçmek değişiklik üretmez).
 */
export function normalizeProgram(
  body: Pick<ProgramBody, 'phased' | 'phases'>,
  ctx: { exercises: ReadonlyMap<string, PlanExercise>; deviceIds: ReadonlySet<string> },
  stored: Pick<ProgramBody, 'phases'> | null,
): { phases: ProgramPhase[]; errors: Record<string, string>; droppedDeviceRowIds: string[] } {
  const errors: Record<string, string> = {};
  const droppedDeviceRowIds: string[] = [];
  const storedRows = new Map(
    (stored?.phases ?? []).flatMap((phase) =>
      phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => [row.id, row] as const))),
    ),
  );
  const phases = body.phases.map((phase, i): ProgramPhase => ({
    id: phase.id,
    name: phase.name.trim(),
    ...(body.phased && phase.weeks !== undefined ? { weeks: phase.weeks } : {}),
    ...(phase.daysPerWeek !== undefined ? { daysPerWeek: phase.daysPerWeek } : {}),
    days: phase.days.map((day, j): ProgramDay => {
      const prepared = prepareForEditing(day, ctx.deviceIds);
      droppedDeviceRowIds.push(...prepared.droppedDeviceRowIds);
      const normalized = normalizeTemplate(prepared, ctx, { storedRows });
      for (const [key, message] of Object.entries(normalized.errors)) errors[`phases.${i}.days.${j}.${key}`] = message;
      return {
        id: day.id,
        name: day.name.trim(),
        blocks: normalized.blocks,
        ...(day.source ? { source: day.source } : {}),
      };
    }),
  }));
  return { phases, errors, droppedDeviceRowIds };
}

/* --- rotasyon ve evreler --- */

/** Şu anki evre; kimliği programda yoksa ilk evre. */
export function currentPhaseOf(
  program: Pick<ProgramState, 'phases' | 'current'>,
): { phase: ProgramPhase; index: number } | null {
  const index = program.phases.findIndex((phase) => phase.id === program.current.phaseId);
  const at = index >= 0 ? index : 0;
  const phase = program.phases[at];
  return phase ? { phase, index: at } : null;
}

/**
 * Sıradaki gün: şu anki evrede son tamamlanan günün arkasındaki gün (sonda başa döner).
 * Hiç antrenman yoksa ya da son gün bu evrede değilse ilk gün.
 */
export function nextDayId(program: Pick<ProgramState, 'phases' | 'current' | 'rotation'>): string | null {
  const days = currentPhaseOf(program)?.phase.days ?? [];
  if (days.length === 0) return null;
  const index = days.findIndex((day) => day.id === program.rotation.lastDayId);
  return (index < 0 ? days[0] : days[(index + 1) % days.length])?.id ?? null;
}

/**
 * Antrenman bitti (antrenman ekranı çağırır): rotasyon bu günden devam eder. Revision
 * ve geçmiş değişmez. Danışan başka bir gün seçtiyse de rotasyon o günden sürer; PT'ye
 * bildirim seans dosyasındadır. Gün şu anki evrede değilse program aynen döner.
 */
export function completeDay<P extends Pick<ProgramState, 'phases' | 'current' | 'rotation'>>(program: P, dayId: string, at: Date): P {
  const days = currentPhaseOf(program)?.phase.days ?? [];
  if (!days.some((day) => day.id === dayId)) return program;
  return { ...program, rotation: { lastDayId: dayId, lastCompletedAt: at.toISOString() } };
}

/**
 * Son tamamlanan gün silindiyse ya da başka evreye taşındıysa: eski sırada ondan önceki
 * (döngüsel) ve hâlâ aynı evrede kalan ilk gün yeni dayanak olur, böylece sıradaki gün
 * değişmez. Hiçbiri kalmadıysa ya da evrenin kendisi silindiyse dayanak düşer.
 */
export function reconcileRotation(beforePhases: Phases, afterPhases: Phases, rotation: ProgramRotation): ProgramRotation {
  const lastDayId = rotation.lastDayId;
  if (lastDayId === undefined) return rotation;
  const { lastDayId: _dropped, ...rest } = rotation;
  const before = beforePhases.find((phase) => phase.days.some((day) => day.id === lastDayId));
  if (!before) return afterPhases.some((phase) => phase.days.some((day) => day.id === lastDayId)) ? rotation : rest;
  const after = afterPhases.find((phase) => phase.id === before.id);
  if (!after) return rest;
  const surviving = new Set(after.days.map((day) => day.id));
  if (surviving.has(lastDayId)) return rotation;
  const days = before.days;
  const index = days.findIndex((day) => day.id === lastDayId);
  for (let step = 1; step < days.length; step++) {
    const candidate = days[(index - step + days.length) % days.length];
    if (candidate && surviving.has(candidate.id)) return { ...rest, lastDayId: candidate.id };
  }
  return rest;
}

export type PhaseStatus =
  /** Süresiz evre: geçiş önerilmez. */
  | { kind: 'open'; week: number }
  | { kind: 'running'; week: number; weeks: number; endsAt: string }
  /** Süre doldu, sonraki evre var: geçiş önerilir. */
  | { kind: 'due'; week: number; weeks: number; endsAt: string; nextPhaseId: string }
  /** Süre doldu, sonrası yok. */
  | { kind: 'ended'; week: number; weeks: number; endsAt: string };

/** Şu anki evrenin durumu: kaçıncı hafta, süre doldu mu (tam `hafta × 7 gün`). */
export function phaseStatus(program: Pick<ProgramState, 'phases' | 'current'>, now: Date): PhaseStatus {
  const startedAt = new Date(program.current.startedAt).getTime();
  const elapsed = Math.max(0, now.getTime() - startedAt);
  const week = Math.floor(elapsed / WEEK_MS) + 1;
  const found = currentPhaseOf(program);
  const weeks = found?.phase.weeks;
  if (!found || weeks === undefined) return { kind: 'open', week };
  const endsAt = new Date(startedAt + weeks * WEEK_MS).toISOString();
  if (now.getTime() < startedAt + weeks * WEEK_MS) return { kind: 'running', week, weeks, endsAt };
  const next = program.phases[found.index + 1];
  return next ? { kind: 'due', week, weeks, endsAt, nextPhaseId: next.id } : { kind: 'ended', week, weeks, endsAt };
}

/** "3. hafta · süresiz", "3. hafta / 6", "Süresi doldu (6 hafta)". */
export function phaseStatusLabel(status: PhaseStatus): string {
  switch (status.kind) {
    case 'open':
      return `${status.week}. hafta · süresiz`;
    case 'running':
      return `${status.week}. hafta / ${status.weeks}`;
    case 'due':
    case 'ended':
      return `Süresi doldu (${status.weeks} hafta)`;
  }
}

/** Evre çubuğu: geçen süre ÷ evrenin süresi, 0–1 (başlangıçtan önce 0, süre dolunca 1); süresiz evrede `null`. */
export function phaseProgress(program: Pick<ProgramState, 'phases' | 'current'>, now: Date): number | null {
  const weeks = currentPhaseOf(program)?.phase.weeks;
  if (weeks === undefined) return null;
  const elapsed = now.getTime() - new Date(program.current.startedAt).getTime();
  return Math.min(1, Math.max(0, elapsed / (weeks * WEEK_MS)));
}

/* --- sıklık ve haftalık yük --- */

/** "Haftada 3 gün"; sıklık yoksa `null`. */
export function frequencyLabel(daysPerWeek?: number): string | null {
  return daysPerWeek === undefined ? null : `Haftada ${daysPerWeek} gün`;
}

/** Bir turdaki her günün haftada kaç kez yapıldığı: sıklık ÷ gün sayısı; sıklık yoksa `null`. */
export function cycleFactor(phase: Pick<ProgramPhase, 'daysPerWeek' | 'days'>): number | null {
  if (phase.daysPerWeek === undefined || phase.days.length === 0) return null;
  return phase.daysPerWeek / phase.days.length;
}

/**
 * Evrenin planlanan kas yükü: bir tur (bütün günler birer kez) ve sıklık varsa haftalık
 * (bir tur × sıklık ÷ gün sayısı). Programdan hesaplanır, set kayıtlarından değil.
 */
export function phaseMuscleLoad<E extends PlanExercise>(
  phase: Pick<ProgramPhase, 'daysPerWeek' | 'days'>,
  exercises: ReadonlyMap<string, E>,
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>,
): { cycle: Record<string, number>; weekly: Record<string, number> | null; factor: number | null } {
  const cycle = templateMuscleLoad({ blocks: phase.days.flatMap((day) => day.blocks) }, exercises, setWeightsOf).load;
  const factor = cycleFactor(phase);
  return { cycle, weekly: factor === null ? null : scaleLoad(cycle, factor), factor };
}

const DAY_MS = 86_400_000;

/** Pazartesi başlayan haftanın ilk günü ("2026-09-21"); `check-in.ts` ile aynı takvim hesabı. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const index = Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
  // 1970-01-01 perşembe; pazartesiye göre kaydır.
  return new Date((index - ((index + 3) % 7)) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * "Bu hafta 2/3": pazartesi başlayan hafta, uygulamanın saat diliminde; aynı günün
 * antrenmanları bir gün sayılır; gelecek ve bozuk tarihler sayılmaz. Antrenman ekranı
 * tamamlanan antrenmanların bitiş anlarını verir. `days`: antrenman yapılan günler (sıralı;
 * Bugün'ün gün şeridi).
 */
export function weekProgress(input: {
  completedAt: readonly string[];
  daysPerWeek?: number;
  now: Date;
  timeZone: string;
}): { done: number; target: number | null; weekStart: string; days: string[] } {
  const today = todayIn(input.timeZone, input.now);
  const weekStart = mondayOf(today);
  const days = new Set<string>();
  for (const iso of input.completedAt) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime()) || at.getTime() > input.now.getTime()) continue;
    const day = todayIn(input.timeZone, at);
    if (day >= weekStart && day <= today) days.add(day);
  }
  return { done: days.size, target: input.daysPerWeek ?? null, weekStart, days: [...days].sort() };
}

/* --- eski dosyalar --- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Eski programlar: tek, süresiz evre = evresiz program. */
export function derivePhased(phases: readonly unknown[]): boolean {
  const [first] = phases;
  return !(phases.length === 1 && isRecord(first) && first.weeks === undefined);
}

/** Evrelerin günlerindeki bloklar yeni biçime (satır başına setler); dizi değilse dokunmaz. */
function upgradePhases(phases: unknown): unknown {
  if (!Array.isArray(phases)) return phases;
  return phases.map((phase: unknown) => {
    if (!isRecord(phase) || !Array.isArray(phase.days)) return phase;
    return {
      ...phase,
      days: phase.days.map((day: unknown) => (isRecord(day) ? { ...day, blocks: upgradeLegacyBlocks(day.blocks) } : day)),
    };
  });
}

/**
 * Dosya: sürüm 1 → 2 (`phased` evrelerden çıkarılır), bloklar yeni biçime. Sürüm 2'de
 * `phased` olduğu gibi kalır (yoksa ya da bozuksa şema düşürür). Yalnız yapıyı çevirir.
 */
export function upgradeProgram(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.phases)) return raw;
  const phases = upgradePhases(raw.phases) as unknown[];
  if (raw.version !== 1) return { ...raw, phases };
  return { ...raw, version: 2, phased: typeof raw.phased === 'boolean' ? raw.phased : derivePhased(phases), phases };
}

/** Kayıt gövdesi: `phased` yoksa (eski sekme) evrelerden çıkarılır; bloklar yeni biçime. */
export function upgradeProgramBody(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.phases)) return raw;
  const phases = upgradePhases(raw.phases) as unknown[];
  return { ...raw, phased: raw.phased === undefined ? derivePhased(phases) : raw.phased, phases };
}

/** Evre geçişinin cümlesi (hem fark hem geçiş kaydı). */
export function currentPhaseChange(fromName: string, toName: string): ProgramChange {
  return { text: `Şu anki evre: '${fromName}' → '${toName}'` };
}

/**
 * Geçmişe ekler: en yenisi üstte, en fazla 200 kayıt. Geçmişe giden her cümle (oluşturma,
 * düzenleme, evre geçişi) buradan geçer ve dosyanın sınırında kesilir: kapsam 90, metin 300 karakter.
 */
export function appendLog(log: readonly ProgramLogEntry[], entry: ProgramLogEntry): ProgramLogEntry[] {
  const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);
  const changes = entry.changes.map(
    ({ scope, text }): ProgramChange => ({
      ...(scope !== undefined ? { scope: clip(scope, PROGRAM_LIMITS.changeScope) } : {}),
      text: clip(text, PROGRAM_LIMITS.changeText),
    }),
  );
  return [{ ...entry, changes }, ...log].slice(0, PROGRAM_LIMITS.log);
}

/** Tek kayıtta en fazla 60 değişiklik; fazlası "… ve n değişiklik daha" olur (tamamı commit'te). */
export function capChanges(changes: readonly ProgramChange[], max: number = PROGRAM_LIMITS.changesPerEntry): ProgramChange[] {
  if (changes.length <= max) return [...changes];
  return [...changes.slice(0, max - 1), { text: `… ve ${changes.length - (max - 1)} değişiklik daha` }];
}

/**
 * PT onaylı evre geçişi: yeni evre şimdi başlar, rotasyon onun ilk gününden başlar (son
 * gün düşer, son antrenman tarihi kalır), geçmişe "Evre geçişi" yazılır. Evre yoksa ya da
 * zaten şu anki evreyse `null`.
 */
export function startPhase(program: ProgramState, phaseId: string, now: Date): ProgramState | null {
  const target = program.phases.find((phase) => phase.id === phaseId);
  if (!target || phaseId === program.current.phaseId) return null;
  const at = now.toISOString();
  const revision = program.revision + 1;
  const from = currentPhaseOf(program)?.phase.name ?? '';
  const { lastDayId: _dropped, ...rotation } = program.rotation;
  return {
    ...program,
    revision,
    updatedAt: at,
    current: { phaseId, startedAt: at },
    rotation,
    log: appendLog(program.log, { at, revision, kind: 'phase', changes: [currentPhaseChange(from, target.name)] }),
  };
}

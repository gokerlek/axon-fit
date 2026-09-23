import { prepareForEditing, type IdSource } from './template-edit.ts';
import { normalizeTemplate, randomId, type PlanExercise, type TemplateBlock, type TemplateRow } from './template-plan.ts';

/**
 * Danışana özel program — yapı, rotasyon ve evreler (SPEC §7.4).
 *
 * Şablon yalnız başlangıç noktasıdır: program danışanın kendi repo'sunda `program.json`
 * olarak durur, şablondan ya da boş oluşturulur ve yalnız o danışan için düzenlenir.
 * Program sıralı evrelerden, evre günlerden, gün şablonla aynı bloklardan oluşur.
 * Şu anki evrenin günleri sırayla döner (A → B → C); evre geçişini PT onaylar.
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
  log: 200,
  changesPerEntry: 60,
  changeScope: 90,
  changeText: 300,
} as const;

export const LOG_KINDS = ['create', 'edit', 'phase'] as const;
export type LogKind = (typeof LOG_KINDS)[number];
export const LOG_KIND_LABELS: Record<LogKind, string> = { create: 'Oluşturuldu', edit: 'Düzenlendi', phase: 'Evre geçişi' };

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Yapısal tipler: Valibot şemasının çıktısı (`schemas/program.ts`) bunlara atanabilir.
/** Günün geldiği şablon: o anki adıyla; şablon sonra değişse ya da silinse de program değişmez. */
export type DaySource = { templateId: string; templateName: string; at: string };
export type ProgramDay = { id: string; name: string; blocks: TemplateBlock[]; source?: DaySource };
export type ProgramPhase = { id: string; name: string; weeks?: number; days: ProgramDay[] };
/** Düzenleyicinin gönderdiği gövde: evreler ve şu anki evre. */
export type ProgramBody = { currentPhaseId: string; phases: ProgramPhase[] };
export type ProgramRotation = { lastDayId?: string; lastCompletedAt?: string };
export type ProgramChange = { scope?: string; text: string };
export type ProgramLogEntry = { at: string; revision: number; kind: LogKind; changes: ProgramChange[] };
export type ProgramState = {
  version: 1;
  /** PT'nin her kaydında +1; rotasyon yazımı artırmaz. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  phases: ProgramPhase[];
  current: { phaseId: string; startedAt: string };
  rotation: ProgramRotation;
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
        target: { ...row.target },
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

/** Düzenleyicinin boş iskeleti: tek evre, tek gün, hareketsiz (hareket eklenmeden kaydedilmez). */
export function blankProgramBody(ids: ProgramIdSource): ProgramBody {
  const phaseId = ids('p');
  return { currentPhaseId: phaseId, phases: [{ id: phaseId, name: 'Evre 1', days: [{ id: ids('d'), name: 'Gün A', blocks: [] }] }] };
}

/** Yeni evre: sıradaki adla, süresiz, tek boş günle. */
export function blankPhase(phases: Phases, ids: ProgramIdSource): ProgramPhase {
  return { id: ids('p'), name: nextPhaseName(phases), days: [{ id: ids('d'), name: 'Gün A', blocks: [] }] };
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

/** Günün kopyası aynı evreye: yeni kimlikler, sıradaki ad, kaynak aynı. */
export function copyDay(phase: Pick<ProgramPhase, 'days'>, day: ProgramDay, ids: ProgramIdSource): ProgramDay {
  return {
    id: ids('d'),
    name: nextDayName(phase.days),
    blocks: reIdBlocks(day.blocks, ids),
    ...(day.source ? { source: { ...day.source } } : {}),
  };
}

/** Evrenin kopyası: "… kopyası" adıyla, aynı süre; günler yeni kimlikle, adları ve kaynakları aynı. */
export function copyPhase(phases: Phases, phase: ProgramPhase, ids: ProgramIdSource): ProgramPhase {
  return {
    id: ids('p'),
    name: uniqueName(`${phase.name} kopyası`, phases.map((item) => item.name)),
    ...(phase.weeks !== undefined ? { weeks: phase.weeks } : {}),
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

/** Oluşturma kaydının cümlesi: hangi şablonlardan. */
export function creationChange(body: Pick<ProgramBody, 'phases'>): ProgramChange {
  const names = sourceNames(body.phases);
  if (names.length === 0) return { text: 'Program oluşturuldu' };
  const quoted = names.map((name) => `'${name}'`).join(', ');
  return { text: `Program oluşturuldu: ${quoted} ${names.length === 1 ? 'şablonundan' : 'şablonlarından'}` };
}

/** Yeni program kaydı: sürüm 1, şu anki evre şimdi başlar, geçmişte tek "oluşturuldu". */
export function createProgramRecord(body: ProgramBody, now: Date): ProgramState {
  const at = now.toISOString();
  return {
    version: 1,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    phases: body.phases,
    current: { phaseId: body.currentPhaseId, startedAt: at },
    rotation: {},
    log: [{ at, revision: 1, kind: 'create', changes: [creationChange(body)] }],
  };
}

/** Şablondan program: "Evre 1" (süresiz) içinde şablonla dolu "Gün A". */
export function createProgramFromTemplate(template: TemplateOption, ids: ProgramIdSource, now: Date): ProgramState {
  const phaseId = ids('p');
  const day = dayFromTemplate({ days: [] }, template, ids, now);
  return createProgramRecord({ currentPhaseId: phaseId, phases: [{ id: phaseId, name: 'Evre 1', days: [day] }] }, now);
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
      return { ...rest, target: { ...rest.target }, ...(rest.rule ? { rule: { ...rest.rule } } : {}) };
    }),
  }));
  return { template: { name, description: '', blocks }, droppedNotes };
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
 * Adlar kırpılır; süre ve kaynak aynen kalır.
 */
export function normalizeProgram(
  body: Pick<ProgramBody, 'phases'>,
  ctx: { exercises: ReadonlyMap<string, PlanExercise>; deviceIds: ReadonlySet<string> },
): { phases: ProgramPhase[]; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const phases = body.phases.map((phase, i): ProgramPhase => ({
    id: phase.id,
    name: phase.name.trim(),
    ...(phase.weeks !== undefined ? { weeks: phase.weeks } : {}),
    days: phase.days.map((day, j): ProgramDay => {
      const normalized = normalizeTemplate({ blocks: day.blocks }, ctx);
      for (const [key, message] of Object.entries(normalized.errors)) errors[`phases.${i}.days.${j}.${key}`] = message;
      return {
        id: day.id,
        name: day.name.trim(),
        blocks: normalized.blocks,
        ...(day.source ? { source: day.source } : {}),
      };
    }),
  }));
  return { phases, errors };
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
 * Son tamamlanan gün silindiyse: eski sırada ondan önceki (döngüsel) ilk kalan gün yeni
 * dayanak olur, böylece sıradaki gün değişmez. Hiçbiri kalmadıysa dayanak düşer.
 */
export function reconcileRotation(beforePhases: Phases, afterPhases: Phases, rotation: ProgramRotation): ProgramRotation {
  const lastDayId = rotation.lastDayId;
  const surviving = new Set(afterPhases.flatMap((phase) => phase.days.map((day) => day.id)));
  if (lastDayId === undefined || surviving.has(lastDayId)) return rotation;
  const { lastDayId: _dropped, ...rest } = rotation;
  const days = beforePhases.find((phase) => phase.days.some((day) => day.id === lastDayId))?.days ?? [];
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

/** Evre geçişinin cümlesi (hem fark hem geçiş kaydı). */
export function currentPhaseChange(fromName: string, toName: string): ProgramChange {
  return { text: `Şu anki evre: '${fromName}' → '${toName}'` };
}

/** Geçmişe ekler: en yenisi üstte, en fazla 200 kayıt. */
export function appendLog(log: readonly ProgramLogEntry[], entry: ProgramLogEntry): ProgramLogEntry[] {
  return [entry, ...log].slice(0, PROGRAM_LIMITS.log);
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

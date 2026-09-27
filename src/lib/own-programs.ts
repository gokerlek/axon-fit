import { withClientTargets } from './client-targets.ts';
import { applyProgramEdit, type DiffContext } from './program-diff.ts';
import {
  DEFAULT_PHASE_NAME,
  OWN_PROGRAM_ID_PATTERN,
  OWN_PROGRAM_NAME_MAX,
  PROGRAM_LIMITS,
  appendLog,
  dayFromTemplate,
  sourceNames,
  uniqueName,
  type ClientTargets,
  type ProgramChange,
  type ProgramDay,
  type ProgramIdSource,
  type ProgramLogEntry,
  type ProgramPhase,
  type ProgramRotation,
  type ProgramSchedule,
  type ProgramState,
  type TemplateOption,
} from './program-plan.ts';
import { randomId } from './template-plan.ts';
import { normalizeWeekdays, sameWeekdays, weekdaysChangeText } from './training-days.ts';

/**
 * Danışanın kendi programları (`docs/design/kendi-program.md`) — saf. Program danışanın repo'sunda
 * `own-programs/<id>.json`: `program.json` ile aynı gövde (tek, gizli, süresiz evre; bloklar şablonla aynı),
 * üstüne kimlik, ad, paylaşım ve günün kopyalandığı PT günü. Ortak saf işlevler (`nextDayId`, `completeDay`,
 * `applyProgramEdit`, `normalizeProgram`, `applyProposal`) olduğu gibi çalışır.
 *
 * - **Sınırlar** (§3.1): en çok 5 program, ad 1–40 ve danışanın programları arasında benzersiz ("Antrenörünün
 *   programı" ayrılmış), 1–7 gün. Kimlik `op_` + 8; dosya yolu yalnız kalıba uyan kimlikten (`ownProgramPath`).
 * - **Oluşturma** (§2.4): boş, PT'nin günlerinden (danışanın geçerli hedefleriyle, yeni kimliklerle, `copiedFrom`)
 *   ya da danışanlara açık şablondan (`source`). Kimlikler danışanın bütün programlarında benzersiz: sunucu
 *   çakışanı yeniden üretir (`reIdCollisions`), kayıttaki kimliklere dokunmaz (seanslar onlara bağlı).
 * - **Kayıt** (§3.5, §3.6): PT programının yolu (`applyProgramEdit`: fark, revision +1, rotasyon uzlaştırması);
 *   günler açılıştakiyle aynıysa kayıttakine dokunulmaz, gün seçilince sıklık kaydedilmez. PT'nin kaydında ad,
 *   paylaşım, kimlik ve geçmiş kayıttan; kayıt `by: 'pt'`.
 * - **Paylaşım ve günler** revision artırmaz; geçmişe `share` ve `client` kaydı.
 *
 * Node'un test aracı doğrudan çalıştırdığı için içe aktarmalar göreli ve `.ts` uzantılıdır.
 */

export const OWN_PROGRAMS_DIR = 'own-programs';
export const OWN_INDEX_PATH = 'own-programs-index.json';
export const OWN_PROGRAM_LIMITS = { programs: 5, name: OWN_PROGRAM_NAME_MAX, days: PROGRAM_LIMITS.daysPerPhase } as const;
/** PT'nin programının danışandaki adı: kendi programa verilemez. */
export const PT_PROGRAM_NAME = 'Antrenörünün programı';
export const DEFAULT_OWN_NAME = 'Programım';
/** Silmenin commit mesajı: ad yok (seans silmeyle aynı ilke, §3.7). */
export const OWN_DELETE_MESSAGE = 'Kendi programı silindi';

/** Günün kopyalandığı PT günü (anlık görüntü). */
export type DayCopy = { dayId: string; dayName: string; at: string };
export type OwnProgramDay = ProgramDay & { copiedFrom?: DayCopy };
export type OwnProgramPhase = { id: string; name: string; daysPerWeek?: number; days: OwnProgramDay[] };
export type OwnProgram = {
  version: 2;
  id: string;
  name: string;
  phased: false;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Antrenörle paylaşıldıysa; PT'nin yazma izni yalnız buradan (§3.5). */
  shared?: { at: string };
  phases: OwnProgramPhase[];
  current: { phaseId: string; startedAt: string };
  rotation: ProgramRotation;
  schedule?: ProgramSchedule;
  log: ProgramLogEntry[];
};

/** Kayıt gövdesi: tek evre, şu anki evre, günler (verilirse); danışanın kaydında ad ve açılıştaki günler. */
export type OwnProgramBody = {
  name?: string | undefined;
  currentPhaseId: string;
  phases: OwnProgramPhase[];
  weekdays?: readonly number[] | undefined;
  baseWeekdays?: readonly number[] | undefined;
};

export function isOwnProgramId(value: unknown): value is string {
  return typeof value === 'string' && OWN_PROGRAM_ID_PATTERN.test(value);
}

/** Dosya yolu yalnız kalıba uyan kimlikten (`../` yol kurulamaz); uymayan kimlikte hata. */
export function ownProgramPath(id: string): string {
  if (!isOwnProgramId(id)) throw new Error(`Geçersiz program kimliği: ${id}`);
  return `${OWN_PROGRAMS_DIR}/${id}.json`;
}

/** `own-programs/op_xxxxxxxx.json` → kimlik; başka bir dosyaysa null. */
export function ownProgramIdOfPath(path: string): string | null {
  const match = path.match(/^own-programs\/(op_[a-z0-9]{8})\.json$/);
  return match?.[1] ?? null;
}

/** Yeni kimlik (telefonda; oluşturma idempotent). */
export function newOwnProgramId(taken: ReadonlySet<string>, random?: (n: number) => Uint8Array): string {
  return randomId('op', 8, taken, random);
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('tr');
}

/** Adın sorunu (formda ve sunucuda aynı): boş, uzun, ayrılmış ya da başka programda var; yoksa null. */
export function ownNameProblem(name: string, others: readonly string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Ad gir.';
  if (trimmed.length > OWN_PROGRAM_NAME_MAX) return `En fazla ${OWN_PROGRAM_NAME_MAX} karakter.`;
  if (nameKey(trimmed) === nameKey(PT_PROGRAM_NAME)) return `"${PT_PROGRAM_NAME}" ad olarak kullanılamaz.`;
  if (others.some((other) => nameKey(other) === nameKey(trimmed))) return 'Bu adda bir programın var.';
  return null;
}

/** Varsayılan ad: "Programım", sonra "Programım 2"… */
export function defaultOwnName(taken: readonly string[]): string {
  return uniqueName(DEFAULT_OWN_NAME, taken);
}

/* --- oluşturma --- */

/** Programın başlangıcı (§2.4): boş, PT'nin seçili günleri ya da danışanlara açık bir şablon. */
export type OwnStart =
  | { kind: 'blank' }
  | { kind: 'pt'; program: { phases: readonly ProgramPhase[]; clientTargets?: ClientTargets | undefined }; dayIds: readonly string[] }
  | { kind: 'template'; template: TemplateOption };

/**
 * PT'nin günlerinin kopyası (program sırasıyla, seçilenler): hareketler danışanın geçerli hedefleriyle
 * (`withClientTargets`), blok ve satırlar yeni kimlikle; ad hedefte varsa "Gün A 2". Gün `copiedFrom` taşır.
 * Hedefteki günlerle birlikte 7'yi aşmaz.
 */
export function copyPtDays(
  program: { phases: readonly ProgramPhase[]; clientTargets?: ClientTargets | undefined },
  dayIds: readonly string[],
  existing: readonly { name: string }[],
  ids: ProgramIdSource,
  now: Date,
): OwnProgramDay[] {
  const wanted = new Set(dayIds);
  const at = now.toISOString();
  const room = Math.max(0, OWN_PROGRAM_LIMITS.days - existing.length);
  const source = program.phases.flatMap((phase) => phase.days.filter((day) => wanted.has(day.id))).slice(0, room);
  const days: OwnProgramDay[] = [];
  for (const day of source) {
    const name = uniqueName(day.name, [...existing.map((item) => item.name), ...days.map((item) => item.name)]);
    days.push({
      id: ids('d'),
      name,
      blocks: reId(withClientTargets(day.blocks, program.clientTargets), ids),
      copiedFrom: { dayId: day.id, dayName: day.name, at },
    });
  }
  return days;
}

/** Blokların kopyası yeni kimlikle (satır kuralı, notu ve cihazı kalır). */
function reId(blocks: ProgramDay['blocks'], ids: ProgramIdSource): ProgramDay['blocks'] {
  return blocks.map((block) => ({
    ...block,
    id: ids('b'),
    rows: block.rows.map((row) => ({ ...row, id: ids('r'), sets: row.sets.map((set) => ({ ...set })), ...(row.rule ? { rule: { ...row.rule } } : {}) })),
  }));
}

/** Düzenleyicinin başlangıç gövdesi: tek gizli evre; PT günlerinden hiçbiri seçilmediyse boş gün. */
export function ownStartBody(start: OwnStart, ids: ProgramIdSource, now: Date): { currentPhaseId: string; phases: OwnProgramPhase[] } {
  const phaseId = ids('p');
  const blank = (): OwnProgramDay[] => [{ id: ids('d'), name: 'Gün A', blocks: [] }];
  let days: OwnProgramDay[];
  switch (start.kind) {
    case 'blank':
      days = blank();
      break;
    case 'pt': {
      const copied = copyPtDays(start.program, start.dayIds, [], ids, now);
      days = copied.length > 0 ? copied : blank();
      break;
    }
    case 'template':
      days = [dayFromTemplate({ days: [] }, start.template, ids, now)];
      break;
  }
  return { currentPhaseId: phaseId, phases: [{ id: phaseId, name: DEFAULT_PHASE_NAME, days }] };
}

/** Programın evre, gün, blok ve satır kimlikleri. */
export function programIds(phases: readonly { id: string; days: readonly { id: string; blocks: readonly { id: string; rows: readonly { id: string }[] }[] }[] }[]): Set<string> {
  return new Set(
    phases.flatMap((phase) => [phase.id, ...phase.days.flatMap((day) => [day.id, ...day.blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)])])]),
  );
}

/**
 * Başka programlarla (`taken`: PT'nin programı ve öteki kendi programlar) çakışan kimlikler yeniden üretilir
 * (§3.1); `keep`'tekilere (kayıttaki programın kimlikleri) dokunulmaz: seanslar onlara bağlı. Değişiklik yoksa
 * aynı gövde.
 */
export function reIdCollisions<B extends { currentPhaseId: string; phases: OwnProgramPhase[] }>(
  body: B,
  taken: ReadonlySet<string>,
  keep: ReadonlySet<string> = new Set(),
  random?: (n: number) => Uint8Array,
): B {
  const used = new Set([...taken, ...programIds(body.phases)]);
  let changed = false;
  const fresh = (id: string): string => {
    if (!taken.has(id) || keep.has(id)) return id;
    const prefix = id.slice(0, id.indexOf('_')) as 'p' | 'd' | 'b' | 'r';
    const next = randomId(prefix, 6, used, random);
    used.add(next);
    changed = true;
    return next;
  };
  let currentPhaseId = body.currentPhaseId;
  const phases = body.phases.map((phase) => {
    const id = fresh(phase.id);
    if (phase.id === body.currentPhaseId) currentPhaseId = id;
    return {
      ...phase,
      id,
      days: phase.days.map((day) => ({
        ...day,
        id: fresh(day.id),
        blocks: day.blocks.map((block) => ({ ...block, id: fresh(block.id), rows: block.rows.map((row) => ({ ...row, id: fresh(row.id) })) })),
      })),
    };
  });
  return changed ? { ...body, currentPhaseId, phases } : body;
}

/** Gün seçildiyse sıklık kaydedilmez (y = seçili gün sayısı, `weekTarget`; §2.5). */
export function settleFrequency(phases: readonly OwnProgramPhase[], weekdays: readonly number[]): OwnProgramPhase[] {
  if (normalizeWeekdays(weekdays).length === 0) return phases as OwnProgramPhase[];
  return phases.map((phase) => {
    if (phase.daysPerWeek === undefined) return phase;
    const { daysPerWeek: _dropped, ...rest } = phase;
    return rest;
  });
}

/** Oluşturma kaydının cümlesi: PT'nin programından kaç gün, hangi şablonlardan. */
export function ownCreationChange(phases: readonly OwnProgramPhase[]): ProgramChange {
  const copied = phases.flatMap((phase) => phase.days).filter((day) => day.copiedFrom).length;
  const templates = sourceNames(phases as ProgramPhase[]);
  const parts = [
    ...(copied > 0 ? [`antrenörünün programından ${copied} gün`] : []),
    ...(templates.length > 0 ? [`${templates.map((name) => `'${name}'`).join(', ')} ${templates.length === 1 ? 'şablonundan' : 'şablonlarından'}`] : []),
  ];
  return { text: parts.length > 0 ? `Program oluşturuldu: ${parts.join(', ')}` : 'Program oluşturuldu' };
}

/** Yeni program kaydı: revision 1, şu anki evre şimdi başlar, seçildiyse günler, geçmişte tek "oluşturuldu". */
export function createOwnProgram(input: {
  id: string;
  name: string;
  currentPhaseId: string;
  phases: OwnProgramPhase[];
  weekdays?: readonly number[] | undefined;
  now: Date;
}): OwnProgram {
  const at = input.now.toISOString();
  const weekdays = normalizeWeekdays(input.weekdays ?? []);
  const phases = settleFrequency(input.phases, weekdays);
  return {
    version: 2,
    id: input.id,
    name: input.name.trim(),
    phased: false,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    phases,
    current: { phaseId: input.currentPhaseId, startedAt: at },
    rotation: {},
    ...(weekdays.length > 0 ? { schedule: { weekdays, at } } : {}),
    log: appendLog([], { at, revision: 1, kind: 'create', changes: [ownCreationChange(phases)] }),
  };
}

/** Aynı gövde mi (oluşturmanın yeniden denenmesi `unchanged`, §3.6): ad, günler ve seçili günler. */
export function sameOwnBody(program: OwnProgram, body: Pick<OwnProgramBody, 'name' | 'phases' | 'weekdays'>): boolean {
  const strip = (phases: readonly OwnProgramPhase[]) =>
    JSON.stringify(phases.map((phase) => ({ ...phase, days: phase.days.map(({ copiedFrom: _copied, ...day }) => day) })));
  return (
    (body.name === undefined || body.name.trim() === program.name) &&
    strip(settleFrequency(body.phases, body.weekdays ?? [])) === strip(program.phases) &&
    sameWeekdays(body.weekdays ?? [], program.schedule?.weekdays ?? [])
  );
}

/* --- kayıt --- */

/**
 * Düzenleyicinin kaydı (danışan `by: 'client'` ya da PT `by: 'pt'`): fark, revision +1, rotasyon uzlaştırması
 * (`applyProgramEdit`). Günler gövdede yoksa ya da açılıştaki günlerle (`baseWeekdays`) aynıysa kayıttakine
 * dokunulmaz; gün seçiliyse sıklık düşer. `copiedFrom` kayıttaki günden (yeni günde gövdeden). Ad yalnız
 * danışanın kaydında değişir. Değişiklik yoksa null.
 */
export function applyOwnEdit(
  stored: OwnProgram,
  body: OwnProgramBody,
  ctx: DiffContext,
  now: Date,
  by: 'client' | 'pt',
): { program: OwnProgram; changes: ProgramChange[] } | null {
  const sent = body.weekdays === undefined ? undefined : normalizeWeekdays(body.weekdays);
  const weekdays = sent === undefined || (body.baseWeekdays !== undefined && sameWeekdays(sent, body.baseWeekdays)) ? undefined : sent;
  const effective = weekdays ?? normalizeWeekdays(stored.schedule?.weekdays ?? []);
  const storedDays = new Map(stored.phases.flatMap((phase) => phase.days.map((day) => [day.id, day] as const)));
  const phases = settleFrequency(
    body.phases.map((phase) => ({
      ...phase,
      days: phase.days.map((day) => {
        const { copiedFrom: sentCopy, ...rest } = day;
        const copied = storedDays.has(day.id) ? storedDays.get(day.id)?.copiedFrom : sentCopy;
        return copied ? { ...rest, copiedFrom: copied } : rest;
      }),
    })),
    effective,
  );
  const result = applyProgramEdit(
    stored as unknown as ProgramState,
    { phased: false, currentPhaseId: body.currentPhaseId, phases: phases as ProgramPhase[], ...(weekdays !== undefined ? { weekdays } : {}) },
    ctx,
    now,
  );
  const name = by === 'pt' || body.name === undefined ? stored.name : body.name.trim();
  const rename: ProgramChange[] = name === stored.name ? [] : [{ text: `Ad: '${stored.name}' → '${name}'` }];
  const mark = (entry: ProgramLogEntry): ProgramLogEntry => (by === 'pt' ? { ...entry, by: 'pt' } : entry);

  if (result) {
    const program = result.program as unknown as OwnProgram;
    const [latest, ...older] = program.log;
    const log = latest ? [mark({ ...latest, changes: [...rename, ...latest.changes] }), ...older] : program.log;
    return { program: { ...program, name, phased: false, log }, changes: [...rename, ...result.changes] };
  }
  if (rename.length === 0) return null;
  const at = now.toISOString();
  const revision = stored.revision + 1;
  return {
    program: { ...stored, name, revision, updatedAt: at, log: appendLog(stored.log, mark({ at, revision, kind: 'edit', changes: rename })) },
    changes: rename,
  };
}

/* --- paylaşım ve günler --- */

/** Paylaşma ya da kapatma (§3.5): revision artmaz, geçmişe `share`. Zaten öyleyse null. */
export function setOwnShared(program: OwnProgram, shared: boolean, now: Date): OwnProgram | null {
  if (Boolean(program.shared) === shared) return null;
  const at = now.toISOString();
  const { shared: _previous, ...rest } = program;
  return {
    ...rest,
    ...(shared ? { shared: { at } } : {}),
    log: appendLog(program.log, { at, revision: program.revision, kind: 'share', changes: [{ text: shared ? 'Antrenörle paylaşıldı' : 'Paylaşım kapatıldı' }] }),
  };
}

/**
 * Kendi programda "Günlerini değiştir" (§3.2): `schedule` doğrudan (katman yok), revision artmaz, geçmişe
 * `client` kaydı (bildirim üretmez: `sessionId`'siz). Geçerli günlerle aynıysa ya da boşsa null.
 */
export function applyOwnSchedule(program: OwnProgram, weekdays: readonly number[], now: Date): { program: OwnProgram; text: string } | null {
  const next = normalizeWeekdays(weekdays);
  const current = normalizeWeekdays(program.schedule?.weekdays ?? []);
  if (next.length === 0 || sameWeekdays(next, current)) return null;
  const at = now.toISOString();
  const text = weekdaysChangeText(current, next);
  return {
    program: { ...program, schedule: { weekdays: next, at }, log: appendLog(program.log, { at, revision: program.revision, kind: 'client', changes: [{ text }] }) },
    text,
  };
}

/** Programın özeti (liste satırı, PT kartı): gün sayısı, seçili günler, sıklık. */
export function ownSummaryOf(program: Pick<OwnProgram, 'phases' | 'schedule'>): { days: number; weekdays: number[]; daysPerWeek?: number } {
  const phase = program.phases[0];
  const weekdays = normalizeWeekdays(program.schedule?.weekdays ?? []);
  return {
    days: phase?.days.length ?? 0,
    weekdays,
    ...(weekdays.length === 0 && phase?.daysPerWeek !== undefined ? { daysPerWeek: phase.daysPerWeek } : {}),
  };
}

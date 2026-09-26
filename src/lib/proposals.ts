import * as v from 'valibot';
import { effectiveSets, sameSets } from './client-targets.ts';
import { applyProgramEdit, type DiffContext } from './program-diff.ts';
import type { ClientTargets, ProgramChange, ProgramIdSource, ProgramPhase, ProgramState } from './program-plan.ts';
import { DAY_ID_PATTERN, normalizeProgram, programIdSource } from './program-plan.ts';
import { SESSION_ID_PATTERN } from './schemas/session.ts';
import { canonicalJson } from './session-merge.ts';
import { rowSetsSchema } from './schemas/template.ts';
import { resizeSets, SET_LIMITS } from './set-plan.ts';
import { countRows, randomId, ROW_ID_PATTERN, settleKind, TEMPLATE_LIMITS, type PlanExercise, type TemplateBlock } from './template-plan.ts';

/**
 * Danışandan PT'ye program önerileri (tasarım §6.4) — saf. Danışanın repo'sunda `proposals.json`:
 * set sayısı ve yapı değişiklikleri (hareket değişimi, çıkarma, ekleme), düz olmayan satırda hedef ve
 * algoritmanın set artışı (`algo_sets`, öneri katmanı) PT'nin onayına gider; kilo ve düz setlerde tekrar
 * hedefi doğrudan uygulanır (`client-targets.ts`), buraya girmez.
 *
 * - **Upsert:** öneriler `sessionId` + satır + tür ile eşlenir: bitişin yeniden denenmesi çoğaltmaz. Aynı
 *   satıra aynı türde bekleyen öneri varsa yenisi onu günceller (kimliği aynı kalır); set sayısının iki
 *   türü (danışanın `sets`'i, motorun `algo_sets`'i) burada tek tür sayılır.
 * - **Karar:** PT onaylar (`approved`, program `saveProgram` yolundan geçer: fark yazılır, revision +1,
 *   log türü `edit`) ya da reddeder (`declined`, isteğe bağlı notla). Satır o arada silindiyse ya da
 *   önerinin dayandığı hâl değiştiyse uygulanmaz: `stale` ("Program değişti; öneri uygulanamadı").
 * - **Silinmez:** bekleyen öneri 30 gün sonra listede soluklaşır; karar verilenler danışanın Bugün'ünde
 *   bir süre görünür, sonra yalnız dosyada durur. Dosya sınırı aşılınca önce en eski kararlar düşer.
 * - Dosya hoşgörüyle okunur: tanınmayan kayıt (ileride yeni tür, elle düzenleme) atılmaz, aynen yazılır.
 */

export const PROPOSALS_PATH = 'proposals.json';

export const PROPOSAL_KINDS = ['sets', 'target', 'swap', 'remove', 'add', 'algo_sets'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = ['pending', 'approved', 'declined', 'stale'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_LIMITS = { items: 300, text: 300, why: 300, note: 300, title: 120 } as const;
/** Bekleyen öneri bu kadar gün sonra listede soluklaşır (silinmez). */
export const PROPOSAL_FADE_DAYS = 30;
/** Danışanın Bugün'ünde karar bu kadar gün görünür. */
export const PROPOSAL_OUTCOME_DAYS = 14;

export const PROPOSAL_ID_PATTERN = /^pr_[a-z0-9]{6}$/;

/**
 * PT'nin kararı (program sayfasındaki kart): uygula ya da isteğe bağlı notla reddet. `sessionId` önerinin
 * sürümüdür: aynı seansta içerik değişmez, bekleyen öneriyi güncelleyen hep başka bir seanstır; PT'nin
 * gördüğü sürüm değiştiyse karar uygulanmaz.
 */
export const proposalActionSchema = v.variant('action', [
  v.object({ action: v.literal('approve'), sessionId: v.pipe(v.string(), v.regex(SESSION_ID_PATTERN)) }),
  v.object({
    action: v.literal('decline'),
    sessionId: v.pipe(v.string(), v.regex(SESSION_ID_PATTERN)),
    note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300, 'Not en fazla 300 karakter.'))),
  }),
]);

export const PROPOSAL_KIND_LABELS: Record<ProposalKind, string> = {
  sets: 'Set sayısı',
  target: 'Hedef',
  swap: 'Hareket değişimi',
  remove: 'Çıkarma',
  add: 'Ekleme',
  /** Öneri katmanının adayı (§5.6): danışanın bitişinde "Antrenörüne öner" ile gelir, gerekçesi `why`'da. */
  algo_sets: 'Set artışı · öneri motoru',
};

const DAY_MS = 86_400_000;
const timestamp = v.pipe(v.string(), v.isoTimestamp());
const slug = v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/));
const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
const count = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(SET_LIMITS.perRow));

export const proposalSchema = v.object({
  id: v.pipe(v.string(), v.regex(PROPOSAL_ID_PATTERN)),
  at: timestamp,
  sessionId: v.pipe(v.string(), v.regex(SESSION_ID_PATTERN)),
  dayId: v.pipe(v.string(), v.regex(DAY_ID_PATTERN)),
  /** Programın satırı; eklenen harekette yok. */
  rowId: v.optional(v.pipe(v.string(), v.regex(ROW_ID_PATTERN))),
  exerciseId: slug,
  /** Satırın hareketinin o günkü adı (öneri metni ve kart). */
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(PROPOSAL_LIMITS.title)),
  kind: v.picklist(PROPOSAL_KINDS),
  /** `sets`, `algo_sets`: set sayısı. */
  from: v.optional(count),
  to: v.optional(count),
  /** `target`: danışanın gördüğü setler ve önerdiği. */
  target: v.optional(v.object({ from: rowSetsSchema, to: rowSetsSchema })),
  /** `swap`: yeni hareket; kayıt türü farklıysa (tekrar ↔ süre) setleri de. */
  swap: v.optional(v.object({ exerciseId: slug, title: v.pipe(v.string(), v.minLength(1), v.maxLength(PROPOSAL_LIMITS.title)), sets: v.optional(rowSetsSchema) })),
  /** `add`: eklenen hareketin setleri ve dinlenmesi. */
  add: v.optional(v.object({ sets: rowSetsSchema, restSeconds: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(TEMPLATE_LIMITS.restSeconds)) })),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(PROPOSAL_LIMITS.text)),
  why: v.optional(text(PROPOSAL_LIMITS.why)),
  status: v.picklist(PROPOSAL_STATUSES),
  decidedAt: v.optional(v.nullable(timestamp)),
  ptNote: v.optional(v.nullable(text(PROPOSAL_LIMITS.note))),
  /** Onayda yazılan programın sürümü. */
  revision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});
export type Proposal = v.InferOutput<typeof proposalSchema>;

/** Yeni öneri (bitişte): kimlik, durum ve karar alanları dosyada verilir. */
export type ProposalInput = Omit<Proposal, 'id' | 'status' | 'decidedAt' | 'ptNote' | 'revision'>;

export type ProposalsFile = {
  version: 1;
  items: Proposal[];
  /** Tanınmayan kayıtlar: aynen yazılır. */
  unknown: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function time(iso: string | null | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

/** Dosya (yoksa null): tanınan öneriler ve tanınmayan kayıtlar. */
export function parseProposals(raw: unknown): ProposalsFile {
  const rows = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  const items: Proposal[] = [];
  const unknown: unknown[] = [];
  for (const row of rows) {
    const parsed = v.safeParse(proposalSchema, row);
    if (parsed.success) items.push(parsed.output);
    else unknown.push(row);
  }
  return { version: 1, items, unknown };
}

/** Yazılacak içerik: tanınanlar ve tanınmayanlar aynen. */
export function serializeProposals(file: ProposalsFile): { version: 1; items: unknown[] } {
  return { version: 1, items: [...file.items, ...file.unknown] };
}

/** Önerinin satır anahtarı: satır; eklenen harekette gün ve hareket. */
function rowKey(item: Pick<Proposal, 'kind' | 'rowId' | 'dayId' | 'exerciseId'>): string {
  return `${item.kind}:${item.rowId ?? `${item.dayId}/${item.exerciseId}`}`;
}

function contentOf(input: ProposalInput): ProposalInput {
  return { ...input };
}

/** Dosya sınırı: önce en eski kararlar (bekleyenler hiç) düşer. */
function capItems(items: Proposal[]): Proposal[] {
  if (items.length <= PROPOSAL_LIMITS.items) return items;
  const decided = items
    .filter((item) => item.status !== 'pending')
    .sort((a, b) => time(a.decidedAt ?? a.at) - time(b.decidedAt ?? b.at))
    .slice(0, items.length - PROPOSAL_LIMITS.items);
  const drop = new Set(decided);
  return items.filter((item) => !drop.has(item));
}

/**
 * Bitişin önerileri dosyaya: aynı seans + satır + tür güncellenir (karar verilmişse dokunulmaz); aynı satıra
 * aynı türde bekleyen öneri varsa yenisi onu günceller; yoksa yeni kimlikle eklenir. `ids`: yeni ya da
 * güncellenen önerilerin kimlikleri. Değişiklik yoksa `changed` false.
 *
 * Bekleyen set sayısı önerisi `sets` ile `algo_sets` arasında ayrılmaz: pazartesinin "4/3 set"i bekliyorken
 * perşembenin algoritmik artışı (ya da tersi) ikinci kart açmaz, ötekini günceller. İkisi aynı satıra aynı
 * artışı ister; PT biri onaylayınca öteki "Program değişti" olurdu.
 */
export function upsertProposals(
  file: ProposalsFile,
  inputs: readonly ProposalInput[],
  random?: (n: number) => Uint8Array,
): { file: ProposalsFile; ids: string[]; changed: boolean } {
  let items = [...file.items];
  const ids: string[] = [];
  let changed = false;
  const taken = new Set(items.map((item) => item.id));
  const countKey = (item: Pick<Proposal, 'kind' | 'rowId' | 'dayId' | 'exerciseId'>) => rowKey({ ...item, kind: item.kind === 'algo_sets' ? 'sets' : item.kind });
  for (const input of inputs) {
    const key = rowKey(input);
    const same = items.find((item) => item.sessionId === input.sessionId && rowKey(item) === key);
    const pending = same ?? items.find((item) => item.status === 'pending' && countKey(item) === countKey(input));
    if (pending && pending.status !== 'pending') continue;
    if (pending) {
      const next: Proposal = { ...contentOf(input), id: pending.id, status: 'pending' };
      if (canonicalJson(next) !== canonicalJson(pending)) {
        items = items.map((item) => (item === pending ? next : item));
        changed = true;
      }
      ids.push(pending.id);
      continue;
    }
    const id = randomId('pr', 6, taken, random);
    taken.add(id);
    items.push({ ...contentOf(input), id, status: 'pending' });
    ids.push(id);
    changed = true;
  }
  return { file: { ...file, items: capItems(items) }, ids, changed };
}

/** PT'nin kararı (ya da uygulanamadı: `stale`). Öneri yoksa ya da zaten karara bağlandıysa null. */
export function decideProposal(
  file: ProposalsFile,
  id: string,
  decision: { status: Exclude<ProposalStatus, 'pending'>; at: Date; note?: string | undefined; revision?: number | undefined },
): ProposalsFile | null {
  const item = file.items.find((entry) => entry.id === id);
  if (!item || item.status !== 'pending') return null;
  const note = decision.note?.trim().slice(0, PROPOSAL_LIMITS.note);
  const next: Proposal = {
    ...item,
    status: decision.status,
    decidedAt: decision.at.toISOString(),
    ...(note ? { ptNote: note } : {}),
    ...(decision.revision !== undefined ? { revision: decision.revision } : {}),
  };
  return { ...file, items: file.items.map((entry) => (entry === item ? next : entry)) };
}

/** Bekleyen öneriler, en yeniden eskiye. */
export function pendingProposals(file: ProposalsFile): Proposal[] {
  return file.items.filter((item) => item.status === 'pending').sort((a, b) => time(b.at) - time(a.at));
}

/** Bekleyen öneri 30 günden eski mi (listede soluk). */
export function isFaded(proposal: Pick<Proposal, 'at'>, now: Date): boolean {
  return now.getTime() - time(proposal.at) > PROPOSAL_FADE_DAYS * DAY_MS;
}

/**
 * Danışanın Bugün'ü: son `days` günde karara bağlananlar (en yeniden eskiye) ve bekleyenler. Metinler
 * danışanın dilinde ("Antrenörün önerini onayladı").
 */
export function clientOutcomes(file: ProposalsFile, now: Date, days: number = PROPOSAL_OUTCOME_DAYS): { decided: Proposal[]; pending: Proposal[] } {
  const since = now.getTime() - days * DAY_MS;
  const decided = file.items
    .filter((item) => item.status !== 'pending' && time(item.decidedAt) >= since)
    .sort((a, b) => time(b.decidedAt) - time(a.decidedAt));
  return { decided, pending: pendingProposals(file) };
}

export const OUTCOME_LABELS: Record<Exclude<ProposalStatus, 'pending'>, string> = {
  approved: 'Antrenörün önerini onayladı',
  declined: 'Antrenörün önerini reddetti',
  stale: 'Program değiştiği için önerin uygulanamadı',
};

/* --- onay: programa uygulama --- */

type Program = { phases: readonly ProgramPhase[]; clientTargets?: ClientTargets | undefined };

export type ApplyProposalResult = { status: 'applied'; phases: ProgramPhase[] } | { status: 'stale'; reason: string };

const STALE = {
  row: 'Bu hareket programda artık yok.',
  changed: 'Satır o arada değişti.',
  day: 'Bu gün programda artık yok.',
  full: 'Gün dolu; önce bir hareket çıkar.',
  last: 'Günün tek hareketi; çıkarılamaz.',
} as const;

function mapRow(phases: readonly ProgramPhase[], rowId: string, change: (row: TemplateBlock['rows'][number]) => TemplateBlock['rows'][number]): ProgramPhase[] {
  return phases.map((phase) => ({
    ...phase,
    days: phase.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => (block.rows.some((row) => row.id === rowId) ? { ...block, rows: block.rows.map((row) => (row.id === rowId ? change(row) : row)) } : block)),
    })),
  }));
}

function findRow(phases: readonly ProgramPhase[], rowId: string) {
  for (const phase of phases) {
    for (const day of phase.days) {
      for (const block of day.blocks) {
        const row = block.rows.find((item) => item.id === rowId);
        if (row) return { phase, day, block, row };
      }
    }
  }
  return null;
}

/** Satır bloğundan çıkar: blok boşalırsa düşer, grupta tür hareket sayısına göre yerleşir (ikiliden tek harekete). */
function removeRow(phases: readonly ProgramPhase[], rowId: string): ProgramPhase[] {
  return phases.map((phase) => ({
    ...phase,
    days: phase.days.map((day) => ({
      ...day,
      blocks: day.blocks.flatMap((block): TemplateBlock[] => {
        if (!block.rows.some((row) => row.id === rowId)) return [block];
        const rows = block.rows.filter((row) => row.id !== rowId);
        if (rows.length === 0) return [];
        const kind = settleKind(block.kind, rows.length);
        const { transitionSeconds, ...rest } = block;
        return [{ ...rest, kind, rows, ...(kind === 'circuit' && transitionSeconds !== undefined ? { transitionSeconds } : {}) }];
      }),
    })),
  }));
}

/**
 * Onaylanan öneriyi programın evrelerine uygular (sonra `saveProgram` yolu: kütüphane denetimi, fark,
 * revision +1). Önerinin dayandığı hâl değiştiyse uygulanmaz (`stale`):
 * - `sets` / `algo_sets`: satırın set sayısı hâlâ `from` olmalı; geçerli setler (danışanın hedefi dahil)
 *   `resizeSets` ile büyür/küçülür (son set kopyalanır): danışanın hedefi yeni set sayısıyla programa alınır.
 * - `target`: satırın geçerli setleri (danışanın hedefi dahil) hâlâ `target.from` olmalı; satırın setleri
 *   `target.to` olur (danışanın hedefi PT'nin kaydında düşer ya da "programa alındı").
 * - `swap`: satır hâlâ eski harekette olmalı; hareket değişir, cihaz egzersizinkine döner, kural ve not kalır.
 * - `remove`: satır çıkar; günün tek hareketi çıkarılamaz.
 * - `add`: günün sonuna tek hareketlik blok (yeni kimliklerle); gün doluysa uygulanmaz.
 */
export function applyProposal(program: Program, proposal: Proposal, ids: ProgramIdSource): ApplyProposalResult {
  const phases = program.phases;
  if (proposal.kind === 'add') {
    const day = phases.flatMap((phase) => phase.days).find((item) => item.id === proposal.dayId);
    if (!day) return { status: 'stale', reason: STALE.day };
    if (!proposal.add) return { status: 'stale', reason: STALE.changed };
    if (day.blocks.length >= TEMPLATE_LIMITS.blocks || countRows(day.blocks) >= TEMPLATE_LIMITS.rows) return { status: 'stale', reason: STALE.full };
    const block: TemplateBlock = {
      id: ids('b'),
      kind: 'single',
      restSeconds: proposal.add.restSeconds,
      rows: [{ id: ids('r'), exerciseId: proposal.exerciseId, sets: proposal.add.sets.map((set) => ({ ...set })) }],
    };
    return {
      status: 'applied',
      phases: phases.map((phase) => ({ ...phase, days: phase.days.map((item) => (item.id === day.id ? { ...item, blocks: [...item.blocks, block] } : item)) })),
    };
  }

  const found = proposal.rowId ? findRow(phases, proposal.rowId) : null;
  if (!found || !proposal.rowId) return { status: 'stale', reason: STALE.row };
  const { row, day } = found;
  const rowId = proposal.rowId;

  switch (proposal.kind) {
    case 'sets':
    case 'algo_sets': {
      if (proposal.from === undefined || proposal.to === undefined || row.sets.length !== proposal.from) return { status: 'stale', reason: STALE.changed };
      const current = effectiveSets(row, program.clientTargets);
      return { status: 'applied', phases: mapRow(phases, rowId, (item) => ({ ...item, sets: resizeSets(current, proposal.to as number) })) };
    }
    case 'target': {
      if (!proposal.target || !sameSets(effectiveSets(row, program.clientTargets), proposal.target.from) || row.sets.length !== proposal.target.to.length) {
        return { status: 'stale', reason: STALE.changed };
      }
      const to = proposal.target.to;
      return { status: 'applied', phases: mapRow(phases, rowId, (item) => ({ ...item, sets: to.map((set) => ({ ...set })) })) };
    }
    case 'swap': {
      if (!proposal.swap || row.exerciseId !== proposal.exerciseId) return { status: 'stale', reason: STALE.changed };
      const swap = proposal.swap;
      return {
        status: 'applied',
        phases: mapRow(phases, rowId, (item) => {
          const { deviceId: _deviceId, ...rest } = item;
          return { ...rest, exerciseId: swap.exerciseId, ...(swap.sets ? { sets: swap.sets.map((set) => ({ ...set })) } : {}) };
        }),
      };
    }
    case 'remove': {
      if (row.exerciseId !== proposal.exerciseId) return { status: 'stale', reason: STALE.changed };
      if (countRows(day.blocks) <= 1) return { status: 'stale', reason: STALE.last };
      return { status: 'applied', phases: removeRow(phases, rowId) };
    }
  }
}

/** Onaylanan önerinin program geçmişindeki notu (farkın yanında): "Danışanın önerisi: Leg Press 3 → 4 set". */
export function approvalNote(proposal: Pick<Proposal, 'text'>): string {
  return `Danışanın önerisi: ${proposal.text}`;
}

export type ApprovalPlan =
  /** Program: fark yazılır, revision +1 (değişiklik çıkmadıysa null: öneri yine onaylanır). */
  | { status: 'approved'; program: ProgramState | null; proposals: ProposalsFile; changes: ProgramChange[]; revision: number }
  /** Uygulanamadı: öneri `stale` işaretlenir. */
  | { status: 'stale'; proposals: ProposalsFile; reason: string }
  | { status: 'missing' | 'decided' };

/**
 * "Uygula" (PT): öneri programa uygulanır ve PT'nin kaydıyla aynı yoldan geçer (`normalizeProgram`: kütüphane
 * denetimi; `applyProgramEdit`: fark, revision +1, log türü `edit`, danışanın hedefleri PT kazanır kuralıyla),
 * kayda "Danışanın önerisi: …" notu eklenir; öneri `approved` ve yazılan revision'la işaretlenir. Önerinin
 * dayandığı hâl değiştiyse ya da hareket kütüphanede yoksa program değişmez, öneri `stale` olur.
 */
export function planApproval(input: {
  program: ProgramState;
  file: ProposalsFile;
  id: string;
  library: { exercises: ReadonlyMap<string, PlanExercise>; deviceIds: ReadonlySet<string> };
  ctx: DiffContext;
  now: Date;
  random?: (n: number) => Uint8Array;
}): ApprovalPlan {
  const { program, file, id, now } = input;
  const proposal = file.items.find((item) => item.id === id);
  if (!proposal) return { status: 'missing' };
  if (proposal.status !== 'pending') return { status: 'decided' };
  const stale = (reason: string): ApprovalPlan => ({ status: 'stale', proposals: decideProposal(file, id, { status: 'stale', at: now }) ?? file, reason });

  const applied = applyProposal(program, proposal, programIdSource(program.phases, input.random));
  if (applied.status === 'stale') return stale(applied.reason);
  const normalized = normalizeProgram({ phased: program.phased, phases: applied.phases }, input.library, program);
  if (Object.keys(normalized.errors).length > 0) return stale('Hareket kütüphanede yok.');
  const result = applyProgramEdit(
    program,
    { phased: program.phased, currentPhaseId: program.current.phaseId, phases: normalized.phases },
    input.ctx,
    now,
    [{ text: approvalNote(proposal) }],
  );
  const revision = result?.program.revision ?? program.revision;
  const proposals = decideProposal(file, id, { status: 'approved', at: now, revision }) ?? file;
  return { status: 'approved', program: result?.program ?? null, proposals, changes: result?.changes ?? [], revision };
}

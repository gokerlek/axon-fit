import type { EntryStatus, SessionDoc, SessionEntry, SessionSet } from './schemas/session.ts';
import { DEFAULT_TRANSITION_SECONDS, type BlockKind, type TemplateBody } from './template-plan.ts';

/**
 * Antrenman imleci (tasarım §2.4, §2.6, §4.4) — saf: sıradaki set hangisi, kaç set kaldı, "sona al",
 * "şimdi yap", "bugün yapma", önceden dolu değerler.
 *
 * Girdi günün planı (başlangıçtaki anlık görüntü: bloklar ve satırlar) ve seans belgesidir. Plan
 * satırı hareket kaydına (entry) `rowId` ile, muadille değiştirilmişse `swappedFrom` ile bağlanır;
 * plan dışı eklenen hareket kendi başına bir birimdir (`plannedSets`). Birim, yerinden oynatılan
 * şeydir: tek hareket ya da grubun tamamı (süperset, devre, kompleks); akıştaki "Geç" ve "Şimdi yap"
 * birimi taşır. Sıra `order` kaydındadır (hareket kimlikleri); kayıtta olmayan birim sona düşer.
 *
 * Gruplarda set sırası `setSlots` gibidir: her turda üyeler sırayla, setleri biten üye sonraki turlarda
 * atlanır; süperset ve komplekste üyeler arasında dinlenme yok, devrede istasyon geçişi, tur sonunda
 * blok dinlenmesi. Geçilen üye grubu bozmaz: kalan üyeler tur düzeniyle sürer. İmleç, bu sırada ilk
 * yapılmamış ve geçilmemiş settir. Son setten sonra dinlenme yok.
 */

export type CursorMember = {
  /** Plan satırı; plan dışı eklenen harekette null. */
  rowId: string | null;
  /** Hareket kaydı; satırın kaydı henüz yoksa null. */
  entryId: string | null;
  /** Bugün planlanan çalışma seti. */
  planned: number;
  /** Yapılan çalışma seti (fazladan setler hariç). */
  done: number;
  /** "+ Set ekle" ile fazladan yapılan. */
  extra: number;
  /** Geçilenler'de (`status: skipped`). */
  skipped: boolean;
  /** Sona alındı (hâlâ yapılacak). */
  moved: boolean;
};

export type CursorSlot = { member: number; round: number; restAfterSeconds: number };

export type CursorUnit = {
  /** Blok kimliği ya da (plan dışı harekette) hareket kaydının kimliği. */
  key: string;
  blockId: string | null;
  kind: BlockKind;
  members: CursorMember[];
  /** Geçilmemiş üyelerin set sırası (tur tur). */
  slots: CursorSlot[];
};

export type CursorPosition = {
  unit: number;
  member: number;
  rowId: string | null;
  entryId: string | null;
  blockId: string | null;
  /** Satırın kaçıncı seti (0'dan): `setIndex`. */
  round: number;
  /** Bu setten sonra dinlenme; antrenmanın son setinde 0. */
  restAfterSeconds: number;
};

export type WorkoutCursor = {
  /** Yapılış sırasında bütün birimler (geçilenler dahil). */
  units: CursorUnit[];
  next: CursorPosition | null;
  /** Geçilmemiş her set yapıldı: "Antrenman tamamlandı, bitirelim mi?" */
  allDone: boolean;
  progress: {
    /** "7/17 set": yapılan ve (geçilmemiş birimlerde) planlanan çalışma setleri. */
    doneSets: number;
    plannedSets: number;
    /** "Hareket 2/5": şu anki birimin sırası ve geçilmemiş birim sayısı. */
    currentUnit: number;
    totalUnits: number;
  };
};

type PlanOverrides = {
  /** Bugünkü planın satır başına çalışma seti (`planSession`: hafifletmede daha az); yoksa satırın setleri. */
  plannedSets?: ReadonlyMap<string, number>;
};

function workingSets(entry: Pick<SessionEntry, 'sets'> | undefined): SessionSet[] {
  return entry ? entry.sets.filter((set) => set.type === 'working') : [];
}

/**
 * Üyenin sayıları. Planlanan set: bugünkü planın verdiği (`plannedSets`) → setlere yazılmış o günkü plan
 * (`plannedSetCount`) → satırın set sayısı.
 */
function memberOf(entry: SessionEntry | undefined, rowId: string | null, planned: { count: number; explicit: boolean }): CursorMember {
  const working = workingSets(entry);
  const recorded = working.reduce((max, set) => Math.max(max, set.plannedSetCount ?? 0), 0);
  return {
    rowId,
    entryId: entry?.id ?? null,
    planned: !planned.explicit && recorded > 0 ? recorded : planned.count,
    done: working.filter((set) => !set.extra).length,
    extra: working.filter((set) => set.extra).length,
    skipped: entry?.status === 'skipped',
    moved: entry?.skip?.moved ?? false,
  };
}

/** Birimin set sırası: `setSlots` kuralı, geçilen üyeler olmadan. */
function slotsOf(kind: BlockKind, members: readonly CursorMember[], restSeconds: number, transitionSeconds: number | undefined): CursorSlot[] {
  const between = kind === 'circuit' ? (transitionSeconds ?? DEFAULT_TRANSITION_SECONDS) : 0;
  const rounds = Math.max(0, ...members.map((member) => member.planned));
  const slots: CursorSlot[] = [];
  for (let round = 0; round < rounds; round++) {
    const active = members.flatMap((member, index) => (!member.skipped && member.planned > round ? [index] : []));
    active.forEach((member, position) => {
      slots.push({ member, round, restAfterSeconds: position === active.length - 1 ? restSeconds : between });
    });
  }
  return slots;
}

function remaining(unit: CursorUnit): boolean {
  return unit.slots.some((slot) => (unit.members[slot.member]?.done ?? 0) <= slot.round);
}

function unitSkipped(unit: CursorUnit): boolean {
  return unit.members.length > 0 && unit.members.every((member) => member.skipped);
}

/** Plan satırının kaydı: muadille değiştirildiyse yenisi, yoksa satırın kendi kaydı. */
export function entryForRow(entries: readonly SessionEntry[], rowId: string): SessionEntry | undefined {
  return entries.find((entry) => entry.swappedFrom === rowId) ?? entries.find((entry) => entry.rowId === rowId && !entry.added);
}

/** Planın ve seansın birimleri, yapılış sırasında. */
export function workoutUnits(plan: TemplateBody, session: Pick<SessionDoc, 'entries' | 'order'>, overrides: PlanOverrides = {}): CursorUnit[] {
  const used = new Set<string>();
  const units: CursorUnit[] = [];
  for (const block of plan.blocks) {
    const members = block.rows.map((row) => {
      const entry = entryForRow(session.entries, row.id);
      if (entry) used.add(entry.id);
      const explicit = overrides.plannedSets?.get(row.id);
      return memberOf(entry, row.id, { count: explicit ?? row.sets.length, explicit: explicit !== undefined });
    });
    units.push({
      key: block.id,
      blockId: block.id,
      kind: block.kind,
      members,
      slots: slotsOf(block.kind, members, block.restSeconds, block.transitionSeconds),
    });
  }
  // Plan dışı: eklenen hareketler ve (o arada programdan kalkmış) satırların kayıtları.
  for (const entry of session.entries) {
    if (used.has(entry.id)) continue;
    const done = workingSets(entry).filter((set) => !set.extra).length;
    const member = memberOf(entry, null, { count: entry.plannedSets ?? Math.max(1, done), explicit: entry.plannedSets !== undefined });
    units.push({ key: entry.id, blockId: null, kind: 'single', members: [member], slots: slotsOf('single', [member], 0, undefined) });
  }

  const order = session.order?.value ?? [];
  const position = new Map(order.map((id, index) => [id, index]));
  const rank = (unit: CursorUnit) =>
    Math.min(...unit.members.map((member) => (member.entryId ? (position.get(member.entryId) ?? Infinity) : Infinity)));
  return units
    .map((unit, index) => ({ unit, index, rank: rank(unit) }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map((item) => item.unit);
}

/** Sıradaki set, ilerleme ve bitiş durumu. */
export function workoutCursor(plan: TemplateBody, session: Pick<SessionDoc, 'entries' | 'order'>, overrides: PlanOverrides = {}): WorkoutCursor {
  const units = workoutUnits(plan, session, overrides);
  const open = units.filter((unit) => !unitSkipped(unit));

  let next: CursorPosition | null = null;
  let pendingAfter = false;
  for (const [unitIndex, unit] of units.entries()) {
    if (unitSkipped(unit)) continue;
    for (const slot of unit.slots) {
      const member = unit.members[slot.member];
      if (!member || member.done > slot.round) continue;
      if (next) {
        pendingAfter = true;
        break;
      }
      next = {
        unit: unitIndex,
        member: slot.member,
        rowId: member.rowId,
        entryId: member.entryId,
        blockId: unit.blockId,
        round: slot.round,
        restAfterSeconds: slot.restAfterSeconds,
      };
    }
    if (pendingAfter) break;
  }
  if (next && !pendingAfter) next = { ...next, restAfterSeconds: 0 };

  const members = units.flatMap((unit) => unit.members);
  const doneSets = members.reduce((sum, member) => sum + Math.min(member.done, member.planned), 0);
  const plannedSets = members.reduce((sum, member) => sum + (member.skipped ? Math.min(member.done, member.planned) : member.planned), 0);
  const current = next ? open.indexOf(units[next.unit] as CursorUnit) + 1 : open.length;
  return { units, next, allDone: next === null, progress: { doneSets, plannedSets, currentUnit: current, totalUnits: open.length } };
}

/* --- geç, sona al, şimdi yap --- */

export type Stamp = { at: string; by: string };

function unitOfEntry(units: readonly CursorUnit[], entryId: string): CursorUnit | undefined {
  return units.find((unit) => unit.members.some((member) => member.entryId === entryId));
}

function entryIdsOf(unit: CursorUnit): string[] {
  return unit.members.flatMap((member) => (member.entryId ? [member.entryId] : []));
}

function withOrder(doc: SessionDoc, units: readonly CursorUnit[], stamp: Stamp): SessionDoc {
  return { ...doc, order: { value: units.flatMap(entryIdsOf), updatedAt: stamp.at, by: stamp.by } };
}

function updateEntries(doc: SessionDoc, ids: ReadonlySet<string>, change: (entry: SessionEntry) => SessionEntry, stamp: Stamp): SessionDoc {
  return {
    ...doc,
    entries: doc.entries.map((entry) => (ids.has(entry.id) ? { ...change(entry), updatedAt: stamp.at, by: stamp.by } : entry)),
  };
}

/** Hareketin (üye değil, bütün birimin) yapılış durumu: sayılardan. */
export function entryStatusOf(member: Pick<CursorMember, 'planned' | 'done' | 'skipped'>): EntryStatus {
  if (member.skipped) return 'skipped';
  if (member.done >= member.planned) return 'done';
  return member.done > 0 ? 'partial' : 'pending';
}

/**
 * "Hareketi geç ›" (tek dokunuş): birim sona alınır (`skip.moved`). Zaten sona alınmışsa ya da
 * geriye başka yapılacak birim kalmadıysa Geçilenler'e gider (`status: skipped`). Neden sorulmaz.
 */
export function skipUnit(plan: TemplateBody, doc: SessionDoc, entryId: string, stamp: Stamp, overrides: PlanOverrides = {}): SessionDoc {
  const units = workoutUnits(plan, doc, overrides);
  const unit = unitOfEntry(units, entryId);
  if (!unit) return doc;
  const others = units.filter((item) => item !== unit && !unitSkipped(item) && remaining(item));
  const alreadyMoved = unit.members.some((member) => member.moved);
  if (alreadyMoved || others.length === 0) return dropUnit(plan, doc, entryId, stamp, overrides);
  const ids = new Set(entryIdsOf(unit));
  const moved = updateEntries(doc, ids, (entry) => ({ ...entry, skip: { ...entry.skip, moved: true } }), stamp);
  return withOrder(moved, [...units.filter((item) => item !== unit), unit], stamp);
}

/** "Bugün yapma": birim Geçilenler'e (`status: skipped`), sona alınır. */
export function dropUnit(plan: TemplateBody, doc: SessionDoc, entryId: string, stamp: Stamp, overrides: PlanOverrides = {}): SessionDoc {
  const units = workoutUnits(plan, doc, overrides);
  const unit = unitOfEntry(units, entryId);
  if (!unit) return doc;
  const ids = new Set(entryIdsOf(unit));
  const dropped = updateEntries(doc, ids, (entry) => ({ ...entry, status: 'skipped', skip: { ...entry.skip, moved: true } }), stamp);
  return withOrder(dropped, [...units.filter((item) => item !== unit), unit], stamp);
}

/** "Geri al" (Geçilenler'den): durum sayılardan yeniden, geçme işareti kalkar; sıra aynı kalır. */
export function restoreUnit(plan: TemplateBody, doc: SessionDoc, entryId: string, stamp: Stamp, overrides: PlanOverrides = {}): SessionDoc {
  const units = workoutUnits(plan, doc, overrides);
  const unit = unitOfEntry(units, entryId);
  if (!unit) return doc;
  const status = new Map(unit.members.flatMap((member) => (member.entryId ? [[member.entryId, entryStatusOf({ ...member, skipped: false })] as const] : [])));
  return updateEntries(
    doc,
    new Set(status.keys()),
    (entry) => {
      const { skip: _skip, ...rest } = entry;
      return { ...rest, status: status.get(entry.id) ?? 'pending' };
    },
    stamp,
  );
}

/** "Şimdi yap": birim, kalanların başına alınır (geçilmişse geri gelir); sıra oradan sürer. */
export function doNow(plan: TemplateBody, doc: SessionDoc, entryId: string, stamp: Stamp, overrides: PlanOverrides = {}): SessionDoc {
  const restored = restoreUnit(plan, doc, entryId, stamp, overrides);
  const units = workoutUnits(plan, restored, overrides);
  const unit = unitOfEntry(units, entryId);
  if (!unit) return doc;
  const rest = units.filter((item) => item !== unit);
  const firstOpen = rest.findIndex((item) => !unitSkipped(item) && remaining(item));
  const at = firstOpen < 0 ? rest.length : firstOpen;
  return withOrder(restored, [...rest.slice(0, at), unit, ...rest.slice(at)], stamp);
}

/* --- önceden dolu değerler (§2.4) --- */

export type PreviousSet = { setIndex: number; kg?: number | undefined; value: number };

/**
 * Setin önceden dolu değerleri. Ağırlık: kaydedilmemiş taslak → bu seansın önceki seti → plan (v1
 * sırası). Tekrar/süre: geçen seferki aynı sıradaki setin, aynı ağırlıktaki değeri; yoksa aralığın
 * altı. Tepe hiçbir zaman önceden dolmaz (dokunup geçmek "geçen seferle aynı" demektir, motor artış
 * vermez); bu seansın önceki setinin tekrarı da kopyalanmaz.
 */
export function prefillSet(input: {
  target: { min: number; max: number };
  setIndex: number;
  plannedKg?: number | undefined;
  previousKgInSession?: number | undefined;
  draftKg?: number | undefined;
  lastTime: readonly PreviousSet[];
}): { kg: number | undefined; value: number } {
  const kg = input.draftKg ?? input.previousKgInSession ?? input.plannedKg;
  const same = input.lastTime.find(
    (set) => set.setIndex === input.setIndex && Math.abs((set.kg ?? 0) - (kg ?? 0)) < 0.001,
  );
  const ceiling = input.target.max > input.target.min ? input.target.max - 1 : input.target.min;
  const value = same ? Math.max(0, Math.min(same.value, ceiling)) : input.target.min;
  return { kg, value };
}

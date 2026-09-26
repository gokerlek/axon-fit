import { formatKg, formatNumber } from './format.ts';
import type { EntryStatus, SessionDoc, SessionEntry, SkipReason } from './schemas/session.ts';
import { normalizeSession, withDeletions } from './session-merge.ts';
import { isStraight } from './set-plan.ts';
import { BLOCK_KIND_LABELS, FALLBACK_REST_SECONDS, ROW_ID_PATTERN, type BlockKind, type TemplateBlock } from './template-plan.ts';
import { doNow, dropUnit, entryForRow, entryStatusOf, restoreUnit, skipUnit, type CursorUnit, type Stamp } from './workout-cursor.ts';
import { dayBody, extraKey, type ExtraRow, type ExtraRows, type WorkoutDay, type WorkoutRow } from './workout-plan.ts';
import { cursorOf, ensureEntries, newEntryId, plannedSetCounts } from './workout-session.ts';

/**
 * Antrenman akışı ve geçme (tasarım §2.6) — saf: ☰ akış sheet'inin listesi, "Hareketi geç ›" (sona al,
 * gerekirse Geçilenler), "Bugün yapma", toast'taki "Geri al", Geçilenler'den geri alma, "Şimdi yap",
 * "Değiştir" (muadil), "Hareket ekle" ve bitişteki isteğe bağlı neden. Sıra değişiklikleri imlecin
 * işleridir (`workout-cursor.ts`: birim tek hareket ya da grubun tamamı); burası onları günün etkin
 * planıyla çağırır.
 *
 * - Günün etkin planı (`effectiveDay`): başlangıçtaki gün + belgedeki muadiller (satır yerinde yeni
 *   hareketle) + eklenen hareketler (sonda, kendi kaydının kimliğiyle tek hareketlik blok). Planları
 *   sunucudan gelir (`ExtraRows`, kendi geçmişiyle); gelmediyse muadil asıl satırın düzeniyle sürer.
 * - Sıra (`order`) hareket kimlikleriyle yazılır: sırayı değiştiren her iş önce günün her satırına kayıt
 *   açar (`ensureEntries`); kaydı olmayan hareket sırada yer tutamazdı.
 * - "Değiştir" hareketin kaydını yerinde çevirir (kimlik aynı, sıra bozulmaz): `swappedFrom` yerini
 *   aldığı satır, başlık ve cihaz muadilinki; asıl harekete dönmek de aynı iştir. Çalışma seti
 *   kaydedilmiş harekette açılmaz ("Geç" var); eski hareketin ısınma setleri silinir.
 * - Neden antrenman ortasında sorulmaz; bitişte, yapılmayan her harekete bir kez. "Ağrı" yalnız sağlık
 *   onayı varken çıkar: seansa `other`, ayrıntı (`skippedRows`) `health.json`'a (SPEC §4).
 */

type Random = (n: number) => Uint8Array;

/* --- günün etkin planı --- */

/** Muadilin planı gelmediyse: asıl satırın düzeni ve ağırlıkları, muadilin adı ve cihazıyla ("Önceki" yok). */
function fallbackSwapRow(original: WorkoutRow, entry: SessionEntry): WorkoutRow {
  const { warmups: _warmups, setupNote: _setupNote, note: _note, deviceId: _deviceId, ...rest } = original;
  return { ...rest, exerciseId: entry.exerciseId, title: entry.title, ...(entry.deviceId ? { deviceId: entry.deviceId } : {}), lastTime: [] };
}

/**
 * Günün etkin planı: muadiller satırın yerinde (plan `extras`'tan), eklenen hareketler sonda. Değişen bir
 * şey yoksa aynı gün (imleç ve ekran aynı nesneyle çalışır).
 */
export function effectiveDay(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, extras: ExtraRows): WorkoutDay {
  const rows: Record<string, WorkoutRow> = { ...day.rows };
  let changed = false;
  const blocks = day.blocks.map((block): TemplateBlock => {
    let touched = false;
    const kept = block.rows.map((row) => {
      const entry = entryForRow(doc.entries, row.id);
      const original = day.rows[row.id];
      if (!entry || !original || entry.swappedFrom !== row.id || entry.exerciseId === row.exerciseId) return row;
      touched = true;
      const extra = extras[extraKey(row.id, entry.exerciseId)];
      if (extra) {
        rows[row.id] = { ...extra.row, rowId: row.id, blockId: block.id };
        return { ...extra.template, id: row.id };
      }
      rows[row.id] = fallbackSwapRow(original, entry);
      return { ...row, exerciseId: entry.exerciseId };
    });
    if (!touched) return block;
    changed = true;
    return { ...block, rows: kept };
  });
  const added: TemplateBlock[] = [];
  for (const entry of doc.entries) {
    if (!entry.added || entry.rowId || entry.swappedFrom) continue;
    const extra = extras[extraKey(entry.id, entry.exerciseId)];
    if (!extra) continue;
    rows[entry.id] = { ...extra.row, rowId: entry.id, blockId: entry.id };
    added.push({ id: entry.id, kind: 'single', restSeconds: extra.restSeconds ?? FALLBACK_REST_SECONDS, rows: [{ ...extra.template, id: entry.id }] });
  }
  if (!changed && added.length === 0) return day;
  return { ...day, blocks: [...blocks, ...added], rows };
}

/* --- akış sheet'i --- */

export type FlowState =
  /** Bütün setleri yapıldı. */
  | 'done'
  /** Sıradaki set bu birimde. */
  | 'current'
  /** Sona alındı (hâlâ yapılacak). */
  | 'moved'
  | 'pending'
  /** Geçilenler'de. */
  | 'skipped';

export type FlowItem = {
  /** Birimin anahtarı (blok ya da eklenen hareketin kaydı). */
  key: string;
  state: FlowState;
  kind: BlockKind;
  /** Grupta "Süperset", "Devre", "Kompleks". */
  kindLabel: string | null;
  /** Planın sırasıyla numara ("3", grupta "3a", "3b") ve ad. */
  members: { rowId: string; number: string; title: string }[];
  /** Yapılan ve planlanan çalışma setleri ("2/3"). */
  done: number;
  planned: number;
  added: boolean;
};

export type FlowView = { active: FlowItem[]; skipped: FlowItem[]; doneSets: number; plannedSets: number };

function isSkipped(unit: CursorUnit): boolean {
  return unit.members.length > 0 && unit.members.every((member) => member.skipped);
}

function isFinished(unit: CursorUnit): boolean {
  return unit.slots.every((slot) => (unit.members[slot.member]?.done ?? 0) > slot.round);
}

function entryIdsOf(unit: CursorUnit): string[] {
  return unit.members.flatMap((member) => (member.entryId ? [member.entryId] : []));
}

/** Birimin adı: tek harekette başlık, grupta "A + B". */
export function unitTitle(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, unit: CursorUnit): string {
  return unit.members
    .map((member) => (member.rowId ? day.rows[member.rowId]?.title : undefined) ?? doc.entries.find((entry) => entry.id === member.entryId)?.title ?? '')
    .filter(Boolean)
    .join(' + ');
}

/** Akış sheet'i: yapılış sırasında birimler (Geçilenler ayrı), durumları ve set sayıları. */
export function flowView(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>): FlowView {
  const cursor = cursorOf(day, doc);
  const numbers = new Map(day.blocks.map((block, index) => [block.id, index + 1]));
  const current = cursor.next ? cursor.units[cursor.next.unit] : undefined;
  const items = cursor.units.map((unit): FlowItem => {
    const number = numbers.get(unit.key) ?? numbers.size + 1;
    const group = unit.kind !== 'single' && unit.members.length > 1;
    const members = unit.members.map((member, index) => ({
      rowId: member.rowId ?? member.entryId ?? unit.key,
      number: group ? `${number}${String.fromCharCode(97 + index)}` : String(number),
      title: (member.rowId ? day.rows[member.rowId]?.title : undefined) ?? doc.entries.find((entry) => entry.id === member.entryId)?.title ?? '',
    }));
    const state: FlowState = isSkipped(unit)
      ? 'skipped'
      : isFinished(unit)
        ? 'done'
        : unit === current
          ? 'current'
          : unit.members.some((member) => member.moved)
            ? 'moved'
            : 'pending';
    return {
      key: unit.key,
      state,
      kind: unit.kind,
      kindLabel: unit.kind === 'single' ? null : BLOCK_KIND_LABELS[unit.kind],
      members,
      done: unit.members.reduce((sum, member) => sum + Math.min(member.done, member.planned), 0),
      planned: unit.members.reduce((sum, member) => sum + member.planned, 0),
      added: unit.members.some((member) => doc.entries.some((entry) => entry.id === member.entryId && entry.added)),
    };
  });
  return {
    active: items.filter((item) => item.state !== 'skipped'),
    skipped: items.filter((item) => item.state === 'skipped'),
    doneSets: cursor.progress.doneSets,
    plannedSets: cursor.progress.plannedSets,
  };
}

/* --- geç, bugün yapma, geri al, şimdi yap --- */

function overrides(day: WorkoutDay) {
  return { plannedSets: plannedSetCounts(day) };
}

/** Birimin kaydı açılmış belge ve birimin bir kaydı (imlecin işleri kayıt kimliğiyle çalışır). */
function prepared(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random) {
  const ready = ensureEntries(day, doc, stamp, random);
  const units = cursorOf(day, ready).units;
  const unit = units.find((item) => item.key === key);
  const entryId = unit ? (entryIdsOf(unit)[0] ?? null) : null;
  return { ready, units, unit, entryId };
}

/** "Geri al" için geçmeden önceki hâl: sıra ve birimin kayıtlarının durumu. */
export type SkipUndo = { key: string; order: string[]; entries: { id: string; status: EntryStatus; skip?: SessionEntry['skip'] }[] };

export type SkipResult = {
  doc: SessionDoc;
  /** `moved`: sona alındı; `dropped`: Geçilenler'e gitti (zaten sona alınmıştı ya da başka yapılacak kalmadı). */
  outcome: 'moved' | 'dropped';
  undo: SkipUndo;
};

/** "Hareketi geç ›" ya da akıştaki [Geç]: tek dokunuş, neden sorulmaz. Birim yoksa null. */
export function skipAt(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random): SkipResult | null {
  const { ready, units, unit, entryId } = prepared(day, doc, key, stamp, random);
  if (!unit || !entryId) return null;
  const ids = new Set(entryIdsOf(unit));
  const undo: SkipUndo = {
    key,
    order: units.flatMap(entryIdsOf),
    entries: ready.entries.filter((entry) => ids.has(entry.id)).map((entry) => ({ id: entry.id, status: entry.status, ...(entry.skip ? { skip: entry.skip } : {}) })),
  };
  const next = normalizeSession(skipUnit(dayBody(day), ready, entryId, stamp, overrides(day)));
  const dropped = next.entries.some((entry) => ids.has(entry.id) && entry.status === 'skipped');
  return { doc: next, outcome: dropped ? 'dropped' : 'moved', undo };
}

/** Toast'taki "Geri al": sıra ve birimin durumu geçmeden önceki hâline (arada yapılan setler kalır). */
export function undoSkip(day: WorkoutDay, doc: SessionDoc, undo: SkipUndo, stamp: Stamp): SessionDoc {
  const saved = new Map(undo.entries.map((entry) => [entry.id, entry]));
  const members = new Map(cursorOf(day, doc).units.flatMap((unit) => unit.members.flatMap((member) => (member.entryId ? [[member.entryId, member] as const] : []))));
  const entries = doc.entries.map((entry) => {
    const before = saved.get(entry.id);
    if (!before) return entry;
    const member = members.get(entry.id);
    const { skip: _skip, ...rest } = entry;
    const status = before.status === 'skipped' || !member ? before.status : entryStatusOf({ ...member, skipped: false });
    return { ...rest, status, ...(before.skip ? { skip: before.skip } : {}), updatedAt: stamp.at, by: stamp.by };
  });
  const present = new Set(doc.entries.map((entry) => entry.id));
  const order = undo.order.filter((id) => present.has(id));
  const known = new Set(order);
  for (const entry of doc.entries) if (!known.has(entry.id)) order.push(entry.id);
  return normalizeSession({ ...doc, entries, order: { value: order, updatedAt: stamp.at, by: stamp.by } });
}

/** "Bugün yapma" (toast'ta): birim Geçilenler'e. */
export function dropAt(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random): SessionDoc {
  const { ready, entryId } = prepared(day, doc, key, stamp, random);
  return entryId ? normalizeSession(dropUnit(dayBody(day), ready, entryId, stamp, overrides(day))) : doc;
}

/** Geçilenler'de "Geri al": birim yeniden yapılacak, sonda kalır ("sona alındı"; yeniden geçilirse Geçilenler'e). */
export function restoreAt(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random): SessionDoc {
  const { ready, unit, entryId } = prepared(day, doc, key, stamp, random);
  if (!unit || !entryId) return doc;
  const ids = new Set(entryIdsOf(unit));
  const restored = restoreUnit(dayBody(day), ready, entryId, stamp, overrides(day));
  return normalizeSession({ ...restored, entries: restored.entries.map((entry) => (ids.has(entry.id) ? { ...entry, skip: { moved: true } } : entry)) });
}

/** "Şimdi yap" (akışta satıra dokunmak, bitişte "Geçileni yap"): birim kalanların başına; sıra oradan sürer. */
export function doNowAt(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random): SessionDoc {
  const { ready, entryId } = prepared(day, doc, key, stamp, random);
  return entryId ? normalizeSession(doNow(dayBody(day), ready, entryId, stamp, overrides(day))) : doc;
}

/** Geçilenler'deki ilk birim ("Geçileni yap"); yoksa null. */
export function firstSkippedKey(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>): string | null {
  return cursorOf(day, doc).units.find(isSkipped)?.key ?? null;
}

/** Toast: "Calf Raise sona alındı", "2/3 set yapıldı; kalanı sona alındı", "Plank geçildi" (+ açıklama). */
export function skipMessage(outcome: SkipResult['outcome'], title: string, done: number, planned: number): { title: string; description?: string } {
  if (outcome === 'moved') return { title: done > 0 ? `${done}/${planned} set yapıldı; kalanı sona alındı` : `${title} sona alındı` };
  return { title: `${title} geçildi`, description: done > 0 ? `${done}/${planned} set yapıldı` : 'Geçilenler listesinde' };
}

/* --- değiştir (muadil) --- */

/** "Değiştir" açık mı: programın satırı, çalışma seti kaydedilmemiş (kaydedildiyse "Geç" var). */
export function canSwap(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, rowId: string): boolean {
  if (!ROW_ID_PATTERN.test(rowId) || !day.rows[rowId]) return false;
  return !entryForRow(doc.entries, rowId)?.sets.some((set) => set.type === 'working');
}

/**
 * "Değiştir": satırın hareketi muadiliyle (`extra`) ya da asıl hareketle (`null`) değişir. `day`
 * başlangıçtaki gün (asıl satır ondan). Kayıt varsa yerinde çevrilir (kimlik ve sıra aynı; eski
 * hareketin ısınmaları silinir), yoksa muadilin kaydı açılır. Olmazsa (set kaydedilmiş, aynı hareket)
 * aynı belge.
 */
export function swapRow(day: WorkoutDay, doc: SessionDoc, input: { rowId: string; extra: ExtraRow | null; stamp: Stamp; random?: Random }): SessionDoc {
  const original = day.rows[input.rowId];
  if (!original || !canSwap(day, doc, input.rowId)) return doc;
  const row = input.extra ? input.extra.row : original;
  const exerciseId = input.extra ? input.extra.exerciseId : original.exerciseId;
  const current = entryForRow(doc.entries, input.rowId);
  if ((current?.exerciseId ?? original.exerciseId) === exerciseId) return doc;
  const { stamp } = input;
  const entry: SessionEntry = {
    id: current?.id ?? newEntryId(doc, input.random),
    ...(input.extra ? { swappedFrom: input.rowId } : { rowId: input.rowId }),
    blockId: original.blockId,
    exerciseId,
    title: row.title,
    ...(row.deviceId ? { deviceId: row.deviceId } : {}),
    status: current?.status === 'skipped' ? 'skipped' : 'pending',
    ...(current?.skip ? { skip: current.skip } : {}),
    plan: { topWeightKg: row.plan.topWeightKg, reason: row.plan.reason },
    ...(row.setupNote ? { setupNote: row.setupNote } : {}),
    updatedAt: stamp.at,
    by: stamp.by,
    sets: [],
  };
  if (!current) return normalizeSession({ ...doc, entries: [...doc.entries, entry] });
  const replaced = { ...doc, entries: doc.entries.map((item) => (item.id === current.id ? entry : item)) };
  const warmups = current.sets.filter((set) => set.type === 'warmup').map((set) => set.id);
  return warmups.length > 0 ? withDeletions(replaced, { setIds: warmups }) : normalizeSession(replaced);
}

/**
 * Muadil listesindeki satırın alt metni: "8–12 tekrar · 30 kg ile başla", "3 set · öneri 62,5 kg",
 * "30–60 sn". İlk kezse "ile başla", geçmişi varsa "öneri".
 */
export function optionText(extra: ExtraRow): string {
  const { row, template } = extra;
  const first = template.sets[0];
  const unit = row.trackingType === 'duration' ? 'sn' : 'tekrar';
  const target =
    first && isStraight(template.sets)
      ? `${first.min === first.max ? formatNumber(first.min) : `${formatNumber(first.min)}–${formatNumber(first.max)}`} ${unit}`
      : `${template.sets.length} set`;
  if (row.trackingType !== 'weight_reps' || row.plan.topWeightKg <= 0) return target;
  const kg = formatKg(row.plan.topWeightKg);
  return `${target} · ${row.plan.reason === 'first_time' ? `${kg} ile başla` : `öneri ${kg}`}`;
}

/* --- hareket ekle --- */

/**
 * "Hareket ekle": yalnız bu antrenmana; kaydı hemen açılır (`added`, planlanan set sayısıyla) ve
 * yapılacakların sonuna (Geçilenler'in önüne) girer. `extra` bu kaydın kimliğiyle anahtarlanmış satır
 * (`rekeyExtra`); `day` günün etkin planı.
 */
export function addExercise(day: WorkoutDay, doc: SessionDoc, input: { entryId: string; extra: ExtraRow; stamp: Stamp; random?: Random }): SessionDoc {
  const { stamp, extra } = input;
  const ready = ensureEntries(day, doc, stamp, input.random);
  const entry: SessionEntry = {
    id: input.entryId,
    exerciseId: extra.exerciseId,
    title: extra.row.title,
    ...(extra.row.deviceId ? { deviceId: extra.row.deviceId } : {}),
    status: 'pending',
    added: true,
    plannedSets: Math.max(1, extra.template.sets.length),
    plan: { topWeightKg: extra.row.plan.topWeightKg, reason: extra.row.plan.reason },
    ...(extra.row.setupNote ? { setupNote: extra.row.setupNote } : {}),
    updatedAt: stamp.at,
    by: stamp.by,
    sets: [],
  };
  const units = cursorOf(day, ready).units;
  const order = [...units.filter((unit) => !isSkipped(unit)).flatMap(entryIdsOf), entry.id, ...units.filter(isSkipped).flatMap(entryIdsOf)];
  return normalizeSession({ ...ready, entries: [...ready.entries, entry], order: { value: order, updatedAt: stamp.at, by: stamp.by } });
}

/* --- bitişte neden --- */

/** Bitişteki "Neden?" çipleri (isteğe bağlı, tek seçim); "Ağrı" yalnız sağlık onayı varken. */
export const FINISH_REASONS = ['no_time', 'tired', 'busy', 'no_equipment', 'other', 'pain'] as const;
export type FinishReason = (typeof FINISH_REASONS)[number];

export const FINISH_REASON_LABELS: Record<FinishReason, string> = {
  no_time: 'Zamanım yok',
  tired: 'Yoruldum',
  busy: 'Alet dolu',
  no_equipment: 'Ekipman yok',
  other: 'Diğer',
  pain: 'Ağrı',
};

/**
 * Bitişte seçilen neden yapılmayan (geçilen ya da eksik kalan) her harekete yazılır (`skip.reason`).
 * Ağrı seansa `other` olarak girer; ayrıntı yalnız programın satırları için `health.json`'a gider
 * (`skippedRows`; sunucu onayı yeniden denetler).
 */
export function withFinishReason(
  day: WorkoutDay,
  doc: SessionDoc,
  reason: FinishReason,
  stamp: Stamp,
  random?: Random,
): { doc: SessionDoc; skippedRows: { rowId: string; reason: 'pain' }[] } {
  const ready = ensureEntries(day, doc, stamp, random);
  const undone = cursorOf(day, ready).units.flatMap((unit) => unit.members.filter((member) => member.entryId && member.done < member.planned));
  const ids = new Set(undone.map((member) => member.entryId));
  const value: SkipReason = reason === 'pain' ? 'other' : reason;
  const entries = ready.entries.map((entry) =>
    ids.has(entry.id) ? { ...entry, skip: { reason: value, moved: entry.skip?.moved ?? false }, updatedAt: stamp.at, by: stamp.by } : entry,
  );
  const skippedRows =
    reason === 'pain' ? undone.flatMap((member) => (member.rowId && ROW_ID_PATTERN.test(member.rowId) ? [{ rowId: member.rowId, reason: 'pain' as const }] : [])) : [];
  return { doc: normalizeSession({ ...ready, entries }), skippedRows };
}

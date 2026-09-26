import { formatKg, formatNumber } from './format.ts';
import { nextSetInPlan, type SetTarget, type TrackingType } from './progression.ts';
import { SESSION_ID_LENGTHS, type SessionDoc, type SessionEntry, type SessionSet } from './schemas/session.ts';
import { volumeOf, waterOf, workingSetCount } from './session-index.ts';
import { normalizeSession, withDeletions } from './session-merge.ts';
import { toSetResults } from './session-results.ts';
import { randomId, type TemplateRow } from './template-plan.ts';
import { entryForRow, entryStatusOf, prefillSet, workoutCursor, type PreviousSet, type Stamp, type WorkoutCursor } from './workout-cursor.ts';
import { dayBody, type WorkoutDay, type WorkoutRow } from './workout-plan.ts';

/**
 * Antrenman ekranının telefondaki işleri (tasarım §2.4, §2.5, §4.2) — saf: yeni belge, sıradaki set ve
 * önceden dolu değerleri, "Set bitti", setin düzeltilmesi ve silinmesi, su, bitiş özeti, ekran metinleri.
 * Belge değişiklikleri `session-merge.ts`'in kanonik biçimine döner; imleç `workout-cursor.ts`'ten.
 *
 * - Hareket kaydı (entry) ilk setle oluşur; set o günkü hedefi (`target`), planın üst ağırlığını ve set
 *   sayısını taşır: motor kaydı o günkü plana göre değerlendirir.
 * - Setin satırdaki yeri (`setIndex`) planın setlerinden gelir; ortadaki bir set silinse de sıradaki
 *   set, planda henüz yapılmamış ilk settir (aynı `setIndex` iki kez yazılmaz).
 * - Önceden dolu ağırlık: kaydedilmemiş taslak → bu seansın önceki setlerinden öneri
 *   (`nextSetInPlan`: aynı yüzdede önceki setin ağırlığı, basamakta son tam yük setinden; danışan
 *   önceki basamağı plandan farklı yaptıysa onun ağırlığı) → plan.
 *   Tekrar/süre: taslak → geçen seferki aynı sıradaki setin aynı ağırlıktaki değeri → aralığın altı
 *   (`prefillSet`; tepe hiçbir zaman önceden dolmaz).
 */

type Random = (n: number) => Uint8Array;

/** Belgede kullanılmış bütün kimlikler (silinenler dahil): yeni kimlik bunlarla çakışmaz. */
function takenIds(doc: SessionDoc): Set<string> {
  const ids = new Set<string>([...doc.deletedSetIds, ...doc.deletedEntryIds, ...doc.waterTaps.map((tap) => tap.id)]);
  for (const entry of doc.entries) {
    ids.add(entry.id);
    for (const set of entry.sets) ids.add(set.id);
  }
  return ids;
}

/** Yeni antrenman (telefonda; dosya ilk setle oluşur, tasarım §4.3). `today`: uygulamanın saat dilimindeki gün. */
export function newSessionDoc(day: WorkoutDay, input: { today: string; now: Date; writer: string; random?: Random }): SessionDoc {
  return {
    version: 1,
    id: randomId('s', SESSION_ID_LENGTHS.s, new Set(), input.random),
    status: 'active',
    date: input.today,
    startedAt: input.now.toISOString(),
    program: {
      revision: day.revision,
      phaseId: day.phaseId,
      dayId: day.dayId,
      dayName: day.dayName,
      ...(day.plannedDayId ? { plannedDayId: day.plannedDayId } : {}),
    },
    writer: input.writer,
    entries: [],
    deletedSetIds: [],
    deletedEntryIds: [],
    waterTaps: [],
    notices: [],
  };
}

/** Bugünkü planın satır başına çalışma seti (hafifletmede daha az): imlecin planı. */
export function plannedSetCounts(day: WorkoutDay): Map<string, number> {
  return new Map(Object.values(day.rows).map((row) => [row.rowId, row.plan.sets.length]));
}

export function cursorOf(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>): WorkoutCursor {
  return workoutCursor(dayBody(day), doc, { plannedSets: plannedSetCounts(day) });
}

export function templateRowOf(day: WorkoutDay, rowId: string): TemplateRow | undefined {
  for (const block of day.blocks) {
    const row = block.rows.find((item) => item.id === rowId);
    if (row) return row;
  }
  return undefined;
}

function workingOf(entry: SessionEntry | undefined): SessionSet[] {
  return entry ? entry.sets.filter((set) => set.type === 'working' && !set.extra) : [];
}

/** Tablonun bir satırı: planın bir seti ve (yapıldıysa) kaydı. */
export type SetView = {
  /** Planın setleri içindeki sıra (0'dan): "Set 2/3". */
  position: number;
  /** Satırdaki yeri (`row.sets`). */
  setIndex: number;
  target: SetTarget;
  plannedKg: number;
  previous: PreviousSet | undefined;
  logged: SessionSet | undefined;
};

/** Satırın setleri, planın sırasıyla. */
export function setViews(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, rowId: string): SetView[] {
  const row = day.rows[rowId];
  const template = templateRowOf(day, rowId);
  if (!row || !template) return [];
  const logged = new Map(workingOf(entryForRow(doc.entries, rowId)).map((set, position) => [set.setIndex ?? position, set]));
  return row.plan.sets.map((planned, position) => ({
    position,
    setIndex: planned.setIndex,
    target: template.sets[planned.setIndex] ?? { min: planned.target, max: planned.target },
    plannedKg: planned.weightKg,
    previous: row.lastTime.find((item) => item.setIndex === planned.setIndex),
    logged: logged.get(planned.setIndex),
  }));
}

/** Kaydedilmemiş taslak: danışanın stepper'la değiştirdiği değerler (yalnız o set için). */
export type SetDraft = { rowId: string; setIndex: number; kg?: number | undefined; value?: number | undefined };

export type NextSet = {
  /** İmlecin birimi (blok): hareket kartının kimliği. */
  unitKey: string;
  rowId: string;
  position: number;
  /** Planın set sayısı: "Set 2/3". */
  total: number;
  setIndex: number;
  target: SetTarget;
  plannedKg: number;
  /** Bu setten sonra dinlenme; antrenmanın son setinde 0. */
  restAfterSeconds: number;
  /** Önceden dolu ağırlık (ağırlıksız harekette yok) ve tekrar/süre. */
  kg: number | undefined;
  value: number;
};

/** Sıradaki set ve önceden dolu değerleri; hepsi yapıldıysa null. */
export function nextSet(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, draft?: SetDraft | null): NextSet | null {
  const cursor = cursorOf(day, doc);
  const position = cursor.next;
  if (!position?.rowId) return null;
  const row = day.rows[position.rowId];
  const template = templateRowOf(day, position.rowId);
  const unit = cursor.units[position.unit];
  const views = setViews(day, doc, position.rowId);
  const view = views.find((item) => !item.logged);
  if (!row || !template || !unit || !view) return null;

  const entry = entryForRow(doc.entries, position.rowId);
  const before = views.slice(0, view.position).flatMap((item) => (item.logged ? [item.logged] : []));
  const done = entry ? toSetResults({ ...entry, sets: before }) : [];
  const suggestion = nextSetInPlan({ spec: row.spec, rule: row.rule, sets: template.sets, plan: row.plan, done });
  // Basamak değişirken (piramit, back-off) motor planın üst ağırlığından hesaplar; danışan önceki seti
  // plandan farklı yaptıysa onun ağırlığı kalır (aynı yüzdede motor zaten önceki setin ağırlığını verir).
  const previous = views[view.position - 1];
  const changed =
    previous?.logged?.kg !== undefined && Math.abs(previous.logged.kg - previous.plannedKg) > 0.001 && (previous.target.loadPct ?? 100) !== (view.target.loadPct ?? 100);
  const own = draft && draft.rowId === position.rowId && draft.setIndex === view.setIndex ? draft : null;
  const kg = row.trackingType === 'weight_reps' ? (own?.kg ?? (changed ? previous?.logged?.kg : undefined) ?? suggestion.weightKg) : undefined;
  const value = own?.value ?? prefillSet({ target: view.target, setIndex: view.setIndex, plannedKg: kg, lastTime: row.lastTime }).value;
  return {
    unitKey: unit.key,
    rowId: position.rowId,
    position: view.position,
    total: views.length,
    setIndex: view.setIndex,
    target: view.target,
    plannedKg: view.plannedKg,
    restAfterSeconds: position.restAfterSeconds,
    kg,
    value,
  };
}

/* --- belge değişiklikleri --- */

function withStatus(entry: SessionEntry, planned: number, stamp: Stamp): SessionEntry {
  const status = entryStatusOf({ planned, done: workingOf(entry).length, skipped: entry.status === 'skipped' });
  return status === entry.status ? entry : { ...entry, status, updatedAt: stamp.at, by: stamp.by };
}

/**
 * "Set bitti": hareketin kaydı yoksa oluşur; set o günkü hedefi ve planı taşır. Ağırlık yalnız
 * ağırlıklı harekette; süreli harekette değer saniyedir.
 */
export function logSet(
  day: WorkoutDay,
  doc: SessionDoc,
  input: { rowId: string; setIndex: number; kg?: number | undefined; value: number; stamp: Stamp; random?: Random },
): { doc: SessionDoc; setId: string } {
  const row = day.rows[input.rowId];
  const template = templateRowOf(day, input.rowId);
  if (!row || !template) throw new Error('Satır bu günün planında yok.');
  const taken = takenIds(doc);
  const existing = entryForRow(doc.entries, input.rowId);
  const entry: SessionEntry = existing ?? {
    id: randomId('e', SESSION_ID_LENGTHS.e, taken, input.random),
    rowId: row.rowId,
    blockId: row.blockId,
    exerciseId: row.exerciseId,
    title: row.title,
    ...(row.deviceId ? { deviceId: row.deviceId } : {}),
    status: 'pending',
    plan: { topWeightKg: row.plan.topWeightKg, reason: row.plan.reason },
    updatedAt: input.stamp.at,
    by: input.stamp.by,
    sets: [],
  };
  const planned = row.plan.sets.find((item) => item.setIndex === input.setIndex);
  const weighted = row.trackingType === 'weight_reps';
  const setId = randomId('st', SESSION_ID_LENGTHS.st, taken, input.random);
  const target = template.sets[input.setIndex];
  const set: SessionSet = {
    id: setId,
    type: 'working',
    setIndex: input.setIndex,
    ...(weighted && input.kg !== undefined ? { kg: input.kg } : {}),
    ...(row.trackingType === 'duration' ? { seconds: input.value } : { reps: input.value }),
    ...(target ? { target } : {}),
    ...(weighted ? { topWeightKg: row.plan.topWeightKg } : {}),
    plannedSetCount: row.plan.sets.length,
    ...(weighted && planned ? { plannedKg: planned.weightKg } : {}),
    at: input.stamp.at,
    by: input.stamp.by,
  };
  const updated = withStatus({ ...entry, sets: [...entry.sets, set] }, row.plan.sets.length, input.stamp);
  const entries = existing ? doc.entries.map((item) => (item.id === existing.id ? updated : item)) : [...doc.entries, updated];
  return { doc: normalizeSession({ ...doc, entries }), setId };
}

export function findSet(doc: Pick<SessionDoc, 'entries'>, setId: string): { entry: SessionEntry; set: SessionSet } | null {
  for (const entry of doc.entries) {
    const set = entry.sets.find((item) => item.id === setId);
    if (set) return { entry, set };
  }
  return null;
}

/** "Seti düzelt": değerler değişir, yapıldığı an (`at`) değişmez; birleştirme `editedAt`'le. */
export function editSet(doc: SessionDoc, setId: string, values: { kg?: number | undefined; value: number }, stamp: Stamp): SessionDoc {
  const found = findSet(doc, setId);
  if (!found) return doc;
  const { set } = found;
  const next: SessionSet = {
    ...set,
    ...(set.kg !== undefined || values.kg !== undefined ? { kg: values.kg ?? set.kg } : {}),
    ...(set.seconds !== undefined ? { seconds: values.value } : { reps: values.value }),
    editedAt: stamp.at,
    by: stamp.by,
  };
  const entries = doc.entries.map((entry) => (entry === found.entry ? { ...entry, sets: entry.sets.map((item) => (item.id === setId ? next : item)) } : entry));
  return normalizeSession({ ...doc, entries });
}

/** "Seti sil" (etkin antrenmanda): kimlik kalıcı iz listesine girer, hareketin durumu yeniden hesaplanır. */
export function deleteSet(day: WorkoutDay, doc: SessionDoc, setId: string, stamp: Stamp): SessionDoc {
  const found = findSet(doc, setId);
  if (!found) return doc;
  const removed = withDeletions(doc, { setIds: [setId] });
  const planned = found.entry.rowId ? (day.rows[found.entry.rowId]?.plan.sets.length ?? 0) : (found.entry.plannedSets ?? 0);
  return normalizeSession({
    ...removed,
    entries: removed.entries.map((entry) => (entry.id === found.entry.id ? withStatus(entry, planned, stamp) : entry)),
  });
}

/** "Su içtim" (+1) ya da "Geri al" (−1 dokunuşu, kalıcı). */
export function addWaterTap(doc: SessionDoc, d: 1 | -1, stamp: Stamp, random?: Random): { doc: SessionDoc; tapId: string } {
  const tapId = randomId('wt', SESSION_ID_LENGTHS.wt, takenIds(doc), random);
  return { doc: normalizeSession({ ...doc, waterTaps: [...doc.waterTaps, { id: tapId, d, at: stamp.at }] }), tapId };
}

/* --- "Set bitti"den sonra ne olur --- */

export type AfterLog =
  /** Aynı harekette sıradaki set: dinlenme (0 ise doğrudan giriş paneli). */
  | { kind: 'same'; restSeconds: number }
  /** Hareket bitti: sıradaki hareket gelir, dinlenme onun üstünde açılır. */
  | { kind: 'next'; restSeconds: number }
  /** Son hareketin son seti: dinlenme yok, bitirme sorusu. */
  | { kind: 'done' };

/** `before`: set kaydedilmeden önceki belge; dinlenme o setin ardındaki (`restAfterSeconds`). */
export function afterLog(day: WorkoutDay, before: Pick<SessionDoc, 'entries' | 'order'>, after: Pick<SessionDoc, 'entries' | 'order'>): AfterLog {
  const was = cursorOf(day, before);
  const now = cursorOf(day, after);
  if (!now.next) return { kind: 'done' };
  const restSeconds = was.next?.restAfterSeconds ?? 0;
  const oldUnit = was.next ? was.units[was.next.unit]?.key : undefined;
  const newUnit = now.units[now.next.unit]?.key;
  return { kind: oldUnit === newUnit ? 'same' : 'next', restSeconds };
}

/* --- bitiş özeti --- */

export type WorkoutSummary = {
  /** En az bir çalışma seti olan hareket. */
  exercises: number;
  sets: number;
  volumeKg: number;
  minutes: number;
  water: number;
  doneSets: number;
  plannedSets: number;
  /** Yapılmayanlar: planlanan seti tamamlanmamış hareketler. */
  remaining: { rowId: string; title: string; done: number; planned: number }[];
};

export function workoutSummary(day: WorkoutDay, doc: SessionDoc, now: Date): WorkoutSummary {
  const cursor = cursorOf(day, doc);
  const remaining = cursor.units.flatMap((unit) =>
    unit.members.flatMap((member) =>
      member.rowId && member.done < member.planned
        ? [{ rowId: member.rowId, title: day.rows[member.rowId]?.title ?? '', done: member.done, planned: member.planned }]
        : [],
    ),
  );
  return {
    exercises: doc.entries.filter((entry) => entry.sets.some((set) => set.type === 'working')).length,
    sets: workingSetCount(doc),
    volumeKg: volumeOf(doc),
    minutes: Math.max(1, Math.round((now.getTime() - Date.parse(doc.startedAt)) / 60_000)),
    water: waterOf(doc),
    doneSets: cursor.progress.doneSets,
    plannedSets: cursor.progress.plannedSets,
    remaining,
  };
}

/* --- ekran metinleri --- */

const unitOf = (trackingType: TrackingType) => (trackingType === 'duration' ? 'sn' : 'tekrar');

function range(target: Pick<SetTarget, 'min' | 'max'>): string {
  return target.min === target.max ? formatNumber(target.min) : `${formatNumber(target.min)}–${formatNumber(target.max)}`;
}

/** Tablodaki "Hedef" sütunu: "12", "10–12", AMRAP'ta "8+", süreli harekette "30 sn". */
export function targetCell(target: SetTarget, trackingType: TrackingType): string {
  const text = target.amrap ? `${formatNumber(target.min)}+` : range(target);
  return trackingType === 'duration' ? `${text} sn` : text;
}

/** Paneldeki hedef: "Hedef 8–10", AMRAP'ta "En az 8, yapabildiğin kadar", süreli "Hedef 30–45 sn". */
export function targetText(target: SetTarget, trackingType: TrackingType): string {
  if (target.amrap) return `En az ${formatNumber(target.min)}${trackingType === 'duration' ? ' sn' : ''}, yapabildiğin kadar`;
  return `Hedef ${range(target)}${trackingType === 'duration' ? ' sn' : ''}`;
}

/** Kaydın metni: "62,5 kg × 10", "10 tekrar", "45 sn". */
export function setValueText(set: Pick<SessionSet, 'kg' | 'reps' | 'seconds'>): string {
  const load = set.kg !== undefined && set.kg > 0 ? formatKg(set.kg) : null;
  if (set.seconds !== undefined) return load ? `${load} × ${set.seconds} sn` : `${set.seconds} sn`;
  return load ? `${load} × ${set.reps ?? 0}` : `${set.reps ?? 0} tekrar`;
}

/** "Önceki" sütunu: "60 × 10", ağırlıksızda "10", süreli "45 sn"; yoksa "—". */
export function previousText(previous: PreviousSet | undefined, trackingType: TrackingType): string {
  if (!previous) return '—';
  if (trackingType === 'duration') return `${formatNumber(previous.value)} sn`;
  return previous.kg !== undefined && previous.kg > 0 && trackingType === 'weight_reps'
    ? `${formatNumber(previous.kg)} × ${formatNumber(previous.value)}`
    : formatNumber(previous.value);
}

/** Dinlenmedeki "Sıradaki": "Set 3 · 62,5 kg × 8–10"; başka harekette adıyla. */
export function nextText(next: NextSet, row: Pick<WorkoutRow, 'title' | 'trackingType'>, withName: boolean): string {
  const target = next.target.amrap ? `${formatNumber(next.target.min)}+` : range(next.target);
  const body =
    next.kg !== undefined ? `${formatKg(next.kg)} × ${target}` : `${target} ${unitOf(row.trackingType)}`;
  return `${withName ? `${row.title} · ` : ''}Set ${next.position + 1} · ${body}`;
}

/** Sayaç: 72 → "1:12", 5 → "0:05". */
export function clockText(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Üst çubuktaki süre: "24:18", bir saati geçince "1:04:18". */
export function elapsedText(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const rest = clockText(seconds % 3600);
  return hours > 0 ? `${hours}:${rest.padStart(5, '0')}` : rest;
}

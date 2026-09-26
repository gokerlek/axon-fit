import { formatKg, formatNumber } from './format.ts';
import { isFullLoad, isOverload, nextSetInPlan, type Effort, type SetTarget, type TrackingType } from './progression.ts';
import { SESSION_ID_LENGTHS, SESSION_LIMITS, type SessionDoc, type SessionEntry, type SessionSet } from './schemas/session.ts';
import { volumeOf, waterOf, workingSetCount } from './session-index.ts';
import { normalizeSession, withDeletions } from './session-merge.ts';
import { toSetResults } from './session-results.ts';
import { randomId, ROW_ID_PATTERN, type TemplateRow } from './template-plan.ts';
import { entryForRow, entryStatusOf, prefillSet, workoutCursor, type PreviousSet, type Stamp, type WorkoutCursor } from './workout-cursor.ts';
import { dayBody, entryPlanOf, type WorkoutDay, type WorkoutRow } from './workout-plan.ts';

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
 * - Set türleri (§2.4): ısınma setleri satırdaki ✓ ile yazılır (`type: warmup`, `setIndex` ısınmanın
 *   sırası), imleci ve hacmi etkilemez; aşırı yük (`isOverload`) hareket başına bir kez onaylanır, sonra
 *   setler `overload` işaretiyle yazılır ve PT'ye bildirim gider.
 * - Zorluk hareket başına bir kez (§2.5): hareketin (grupta bütün üyelerin) son setinden sonra;
 *   cevap AMRAP olmayan bütün çalışma setlerine yazılır. AMRAP'ta sorulmaz: tam yükte AMRAP olmayan
 *   set yoksa soru da yok. Ara setlerde "Kolaydı · sonraki set X kg" kısayolu yalnız o sete `easy`
 *   yazar; artışı `nextSetInPlan`'in "kolay ve tepede" kuralı verir.
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

/** Yeni hareket kaydı kimliği (belgedeki ve silinmiş kimliklerle çakışmaz): "Hareket ekle". */
export function newEntryId(doc: SessionDoc, random?: Random): string {
  return randomId('e', SESSION_ID_LENGTHS.e, takenIds(doc), random);
}

/**
 * Plan satırının kaydının kimliği: iki cihaz aynı satıra aynı kimliği verir (birleşimde tek kayıt,
 * setler birleşir). Kimlik alınmışsa (silinmiş kayıt) rastgele.
 */
export function rowEntryId(rowId: string, taken: Set<string>, random?: Random): string {
  const id = `e_${rowId.slice(2)}`;
  return ROW_ID_PATTERN.test(rowId) && !taken.has(id) ? id : randomId('e', SESSION_ID_LENGTHS.e, taken, random);
}

/** Plan satırının yeni kaydının kimliği (`rowEntryId`, belgedeki kimliklerle): "Değiştir". */
export function newRowEntryId(doc: SessionDoc, rowId: string, random?: Random): string {
  return rowEntryId(rowId, takenIds(doc), random);
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
      ...(day.plannedDayId && day.plannedDayId !== day.dayId && day.plannedDayName ? { plannedDayName: day.plannedDayName } : {}),
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
  // Bugünün setleri hafifletilen günde de sayılır: planın gerekçesi (`lighten`) yalnız sonraki antrenmanın
  // süzgecidir (`toSetResults`); burada kalsa önceki setin ağırlığı ve inişi sıradaki sete geçmezdi.
  const done = entry ? toSetResults({ ...entry, plan: undefined, sets: before }) : [];
  const suggestion = nextSetInPlan({ spec: row.spec, rule: row.rule, sets: template.sets, plan: row.plan, done, raise: !row.adjusted });
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
 * Satırın hareket kaydı; yoksa yenisi (henüz belgede değil). Kayıt ilk setle, ilk ısınmayla ya da ayar
 * notuyla açılır; geçen seferki ayar notu kayda taşınır (dokunulmayan not sonraki seferde de sürer).
 */
function entryFor(day: WorkoutDay, doc: SessionDoc, rowId: string, stamp: Stamp, taken: Set<string>, random?: Random): SessionEntry {
  const row = day.rows[rowId];
  if (!row) throw new Error('Satır bu günün planında yok.');
  const existing = entryForRow(doc.entries, rowId);
  if (existing) return existing;
  // Eklenen hareketin kaydı eklenirken açılır; satırı kayıtsız kalamaz (plan satırı değildir).
  if (!ROW_ID_PATTERN.test(rowId)) throw new Error('Eklenen hareketin kaydı yok.');
  const id = rowEntryId(rowId, taken, random);
  taken.add(id);
  return {
    id,
    rowId: row.rowId,
    blockId: row.blockId,
    exerciseId: row.exerciseId,
    title: row.title,
    ...(row.deviceId ? { deviceId: row.deviceId } : {}),
    status: 'pending',
    plan: entryPlanOf(row),
    ...(row.setupNote ? { setupNote: row.setupNote } : {}),
    updatedAt: stamp.at,
    by: stamp.by,
    sets: [],
  };
}

/**
 * Günün her satırının kaydı (henüz yoksa boş, `pending`; geçen seferki ayar notu taşınır). Yapılış sırası
 * (`order`) hareket kimlikleriyle yazıldığı için "geç", "şimdi yap" ve "hareket ekle" önce bunu ister:
 * kaydı olmayan hareket sırada yer tutamaz. Hepsi varsa aynı belge.
 */
export function ensureEntries(day: WorkoutDay, doc: SessionDoc, stamp: Stamp, random?: Random): SessionDoc {
  const taken = takenIds(doc);
  const created: SessionEntry[] = [];
  const known = { ...doc, entries: doc.entries };
  for (const block of day.blocks) {
    for (const row of block.rows) {
      if (!day.rows[row.id] || entryForRow(known.entries, row.id)) continue;
      const entry = entryFor(day, known, row.id, stamp, taken, random);
      created.push(entry);
      known.entries = [...known.entries, entry];
    }
  }
  return created.length === 0 ? doc : normalizeSession(known);
}

/** Kaydı belgeye yazar (yeniyse ekler) ve belgeyi kanonik biçime döndürür. */
function putEntry(doc: SessionDoc, entry: SessionEntry, extra: Partial<Pick<SessionDoc, 'notices'>> = {}): SessionDoc {
  const known = doc.entries.some((item) => item.id === entry.id);
  const entries = known ? doc.entries.map((item) => (item.id === entry.id ? entry : item)) : [...doc.entries, entry];
  return normalizeSession({ ...doc, ...extra, entries });
}

/**
 * "Set bitti": hareketin kaydı yoksa oluşur; set o günkü hedefi ve planı taşır. Ağırlık yalnız
 * ağırlıklı harekette; süreli harekette değer saniyedir. `overload`: aşırı yük onaylandı (ya da bu
 * harekette zaten onaylanmıştı); hareketin ilk aşırı yük setinde PT'ye bildirim (`notices`).
 */
export function logSet(
  day: WorkoutDay,
  doc: SessionDoc,
  input: { rowId: string; setIndex: number; kg?: number | undefined; value: number; overload?: boolean; stamp: Stamp; random?: Random },
): { doc: SessionDoc; setId: string } {
  const row = day.rows[input.rowId];
  const template = templateRowOf(day, input.rowId);
  if (!row || !template) throw new Error('Satır bu günün planında yok.');
  const taken = takenIds(doc);
  const entry = entryFor(day, doc, input.rowId, input.stamp, taken, input.random);
  const planned = row.plan.sets.find((item) => item.setIndex === input.setIndex);
  const weighted = row.trackingType === 'weight_reps';
  const setId = randomId('st', SESSION_ID_LENGTHS.st, taken, input.random);
  const target = template.sets[input.setIndex];
  const overload = Boolean(input.overload && weighted);
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
    ...(overload ? { overload: true } : {}),
    at: input.stamp.at,
    by: input.stamp.by,
  };
  const first = overload && !entry.sets.some((item) => item.type === 'working' && item.overload);
  const updated = withStatus({ ...entry, sets: [...entry.sets, set] }, row.plan.sets.length, input.stamp);
  const notices = first ? { notices: [...doc.notices, { kind: 'overload' as const, at: input.stamp.at }] } : {};
  return { doc: putEntry(doc, updated, notices), setId };
}

/**
 * Aşırı yük (tasarım §2.4, v1 K14): girilen ağırlık planın çok üstünde mi (`isOverload`). Hareket
 * başına bir kez sorulur (`ask`: "Hedefin çok üzerindesin"); onaylandıktan sonra (`confirmed`) sorulmaz,
 * setler yine işaretlenir ve satırda görünür. Ağırlıksız harekette ya da sınırın altında `none`.
 */
export type OverloadState = 'none' | 'ask' | 'confirmed';

export function overloadState(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, next: Pick<NextSet, 'rowId' | 'plannedKg'>, kg: number | undefined): OverloadState {
  const row = day.rows[next.rowId];
  if (!row || row.trackingType !== 'weight_reps' || kg === undefined || !isOverload(next.plannedKg, kg)) return 'none';
  const entry = entryForRow(doc.entries, next.rowId);
  return entry?.sets.some((set) => set.type === 'working' && set.overload) ? 'confirmed' : 'ask';
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

/** Setin zorluğu ("Seti düzelt", "Kolaydı" kısayolu); `undefined` zorluğu kaldırır (motor `good` sayar). */
export function setSetEffort(doc: SessionDoc, setId: string, effort: Effort | undefined, stamp: Stamp): SessionDoc {
  const found = findSet(doc, setId);
  if (!found || found.set.type !== 'working' || found.set.effort === effort) return doc;
  const { effort: _old, ...rest } = found.set;
  const next: SessionSet = { ...rest, ...(effort ? { effort } : {}), editedAt: stamp.at, by: stamp.by };
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
  /** Grupta aynı turun sıradaki üyesi: dinlenme yok; devrede istasyon geçişi sayar. */
  | { kind: 'member'; transitionSeconds: number }
  /** Hareket bitti: sıradaki hareket gelir, dinlenme onun üstünde açılır. */
  | { kind: 'next'; restSeconds: number }
  /** Son hareketin son seti: dinlenme yok, bitirme sorusu. */
  | { kind: 'done' };

/**
 * `before`: set kaydedilmeden önceki belge; dinlenme o setin ardındaki (`restAfterSeconds`). Grupta
 * tur sürerken (aynı birim, aynı tur, başka üye) dinlenme yok: süperset ve komplekste 0, devrede
 * istasyon geçişi; tur sonunda blok dinlenmesi.
 */
export function afterLog(day: WorkoutDay, before: Pick<SessionDoc, 'entries' | 'order'>, after: Pick<SessionDoc, 'entries' | 'order'>): AfterLog {
  const was = cursorOf(day, before);
  const now = cursorOf(day, after);
  if (!now.next) return { kind: 'done' };
  const restSeconds = was.next?.restAfterSeconds ?? 0;
  const oldUnit = was.next ? was.units[was.next.unit]?.key : undefined;
  const newUnit = now.units[now.next.unit]?.key;
  if (oldUnit !== newUnit) return { kind: 'next', restSeconds };
  if (was.next && now.next.round === was.next.round && now.next.member !== was.next.member) return { kind: 'member', transitionSeconds: restSeconds };
  return { kind: 'same', restSeconds };
}

/* --- ısınma --- */

export type WarmupView = { index: number; kg: number; reps: number; logged: SessionSet | undefined };

/** Satırın ısınma setleri ve (yapıldıysa) kayıtları; `setIndex` ısınmanın sırası. */
export function warmupViews(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, rowId: string): WarmupView[] {
  const warmups = day.rows[rowId]?.warmups ?? [];
  if (warmups.length === 0) return [];
  const sets = (entryForRow(doc.entries, rowId)?.sets ?? []).filter((set) => set.type === 'warmup');
  const logged = new Map(sets.map((set, position) => [set.setIndex ?? position, set]));
  return warmups.map((warmup, index) => ({ index, kg: warmup.kg, reps: warmup.reps, logged: logged.get(index) }));
}

/** Isınma seti yapıldı (satırdaki ✓): hacme ve rekora girmez, imleci ilerletmez. Zaten yapıldıysa aynı belge. */
export function logWarmup(day: WorkoutDay, doc: SessionDoc, input: { rowId: string; index: number; stamp: Stamp; random?: Random }): SessionDoc {
  const view = warmupViews(day, doc, input.rowId)[input.index];
  if (!view || view.logged) return doc;
  const taken = takenIds(doc);
  const entry = entryFor(day, doc, input.rowId, input.stamp, taken, input.random);
  const set: SessionSet = {
    id: randomId('st', SESSION_ID_LENGTHS.st, taken, input.random),
    type: 'warmup',
    setIndex: input.index,
    kg: view.kg,
    reps: view.reps,
    at: input.stamp.at,
    by: input.stamp.by,
  };
  return putEntry(doc, { ...entry, sets: [...entry.sets, set] });
}

/** Isınma ✓'u geri alındı: set silinir (kimliği iz listesine girer). */
export function unlogWarmup(day: WorkoutDay, doc: SessionDoc, input: { rowId: string; index: number; stamp: Stamp }): SessionDoc {
  const logged = warmupViews(day, doc, input.rowId)[input.index]?.logged;
  return logged ? deleteSet(day, doc, logged.id, input.stamp) : doc;
}

/* --- ayar notu --- */

/** Hareketin ayar notu: bu antrenmandaki kayıt (danışan değiştirdiyse ya da sildiyse) → geçen seferki. */
export function setupNoteOf(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, rowId: string): string | undefined {
  const entry = entryForRow(doc.entries, rowId);
  return entry ? entry.setupNote : day.rows[rowId]?.setupNote;
}

/** Ayar notunu yazar (boş metin siler); kayıt yoksa açılır. Kendi başına gönderilmez, sonraki sete biner. */
export function setSetupNote(day: WorkoutDay, doc: SessionDoc, input: { rowId: string; note: string; stamp: Stamp; random?: Random }): SessionDoc {
  const text = input.note.trim().replace(/\s+/g, ' ').slice(0, SESSION_LIMITS.setupNote);
  if (!day.rows[input.rowId] || (setupNoteOf(day, doc, input.rowId) ?? '') === text) return doc;
  const entry = entryFor(day, doc, input.rowId, input.stamp, takenIds(doc), input.random);
  const { setupNote: _old, ...rest } = entry;
  return putEntry(doc, { ...rest, ...(text ? { setupNote: text } : {}), updatedAt: input.stamp.at, by: input.stamp.by });
}

/* --- zorluk (hareket başına bir kez) ve "Kolaydı" --- */

/** Zorluk seçenekleri (danışana): "Başaramadım" yok; tekrar alt sınırın altındaysa bu zaten kaçırmadır. */
export const EFFORT_CHOICES = ['easy', 'good', 'hard'] as const satisfies readonly Effort[];
export type EffortChoice = (typeof EFFORT_CHOICES)[number];

/** Zorluğu sorulan setler: AMRAP olmayan, plandaki çalışma setleri. */
function rated(entry: SessionEntry): SessionSet[] {
  return entry.sets.filter((set) => set.type === 'working' && !set.extra && !set.target?.amrap);
}

/** Soru sorulur mu: tam yükte AMRAP olmayan bir set var (motorun zorluğa baktığı setler). */
function asksEffort(entry: SessionEntry): boolean {
  return rated(entry).some((set) => isFullLoad(set.target ?? {}));
}

/** Cevap: tam yükteki son setin zorluğu ("Kolaydı" kısayolu son sete yazılmaz). */
function answerOf(entry: SessionEntry): Effort | undefined {
  const last = rated(entry)
    .filter((set) => isFullLoad(set.target ?? {}))
    .reduce<SessionSet | undefined>((best, set) => (!best || (set.setIndex ?? 0) >= (best.setIndex ?? 0) ? set : best), undefined);
  return last?.effort;
}

export type EffortQuestion = { entryId: string; rowId: string; title: string; answer: Effort | undefined };

/**
 * "<Hareket> nasıldı?" (§2.5): set, birimin (tek hareket ya da grubun) son setiyse birimin zorluğu
 * sorulan hareketleri; birim bitmediyse boş. Grupta üyeler sırayla sorulur.
 */
export function effortQuestions(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, setId: string): EffortQuestion[] {
  const found = findSet(doc, setId);
  if (!found || found.set.type !== 'working') return [];
  const unit = cursorOf(day, doc).units.find((item) => item.members.some((member) => member.entryId === found.entry.id));
  if (!unit || unit.slots.some((slot) => (unit.members[slot.member]?.done ?? 0) <= slot.round)) return [];
  return unit.members.flatMap((member) => {
    const entry = doc.entries.find((item) => item.id === member.entryId);
    if (!entry || !member.rowId || !asksEffort(entry)) return [];
    return [{ entryId: entry.id, rowId: member.rowId, title: entry.title, answer: answerOf(entry) }];
  });
}

/** Cevap hareketin AMRAP olmayan bütün çalışma setlerine yazılır (set başına ayrım "Seti düzelt"te). */
export function setEntryEffort(doc: SessionDoc, entryId: string, effort: Effort, stamp: Stamp): SessionDoc {
  const entry = doc.entries.find((item) => item.id === entryId);
  if (!entry) return doc;
  const sets = entry.sets.map((set) =>
    set.type === 'working' && !set.target?.amrap && set.effort !== effort ? { ...set, effort, editedAt: stamp.at, by: stamp.by } : set,
  );
  return normalizeSession({ ...doc, entries: doc.entries.map((item) => (item.id === entryId ? { ...item, sets } : item)) });
}

/**
 * "Kolaydı · sonraki set X kg" (§2.5): az önce kaydedilen set aralığın tepesindeyse ve sıradaki set
 * aynı hareketin aynı yükteki setiyse, o sete `easy` yazmak sonraki seti bir adım artırır
 * (`nextSetInPlan`). Artmıyorsa (cihazın en ağır ayarı, başka yüzde, AMRAP) null. `taken`: dokunuldu.
 */
export function easyShortcut(day: WorkoutDay, doc: SessionDoc, setId: string): { kg: number; taken: boolean } | null {
  const found = findSet(doc, setId);
  const set = found?.set;
  if (!found || !set || set.type !== 'working' || set.extra || !set.target || set.target.amrap || (set.reps ?? 0) < set.target.max) return null;
  const next = nextSet(day, doc);
  if (!next || next.kg === undefined || next.rowId !== found.entry.rowId) return null;
  if (set.effort === 'easy') return next.kg > (set.kg ?? 0) ? { kg: next.kg, taken: true } : null;
  const raised = nextSet(day, setSetEffort(doc, setId, 'easy', { at: set.editedAt ?? set.at, by: set.by ?? doc.writer }));
  return raised?.kg !== undefined && raised.kg > next.kg ? { kg: raised.kg, taken: false } : null;
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
  /** Geçilmemiş her hareketin planlı setleri yapıldı ("Antrenman tamamlandı, bitirelim mi?"). */
  allDone: boolean;
  /** Yapılmayanlar: planlanan seti tamamlanmamış hareketler; geçilenler (Geçilenler'deki) işaretli. */
  remaining: { rowId: string; title: string; done: number; planned: number; skipped: boolean }[];
};

export function workoutSummary(day: WorkoutDay, doc: SessionDoc, now: Date): WorkoutSummary {
  const cursor = cursorOf(day, doc);
  const remaining = cursor.units.flatMap((unit) =>
    unit.members.flatMap((member) =>
      member.rowId && member.done < member.planned
        ? [{ rowId: member.rowId, title: day.rows[member.rowId]?.title ?? '', done: member.done, planned: member.planned, skipped: member.skipped }]
        : [],
    ),
  );
  return {
    allDone: cursor.allDone,
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

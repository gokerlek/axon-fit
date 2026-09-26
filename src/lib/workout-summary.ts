import { formatKg, formatNumber } from './format.ts';
import { mondayOf, type ProgramLogEntry } from './program-plan.ts';
import type { Category } from './schemas/exercise.ts';
import type { SessionDoc, SessionEntry, SessionIndex } from './schemas/session.ts';
import { indexRowOf, upsertIndexRow, volumeOf, waterOf, workingSetCount } from './session-index.ts';
import { compareWithLast, recordKey, sessionRecords, type RecordHit, type RepPoint, type TopSet, type Trend } from './session-records.ts';
import { countsForLoad } from './template-plan.ts';
import { addDays } from './training-days.ts';
import type { WorkoutDay } from './workout-plan.ts';

/**
 * Antrenman özeti (tasarım §2.8, 4 kartlık karusel) — saf. Bitişten hemen sonra ve geçmişten ("Özeti aç")
 * aynı hesap; sayfa danışan repo'sundan okur (`history-store.ts`), burada yalnız sayılar ve danışanın
 * dilindeki metinler kurulur.
 *
 * 1. **Antrenman tamamlandı:** PT'nin istediği dört sayı birlikte: süre, toplam ağırlık, set, çalışan kas;
 *    rekor sayısı, aynı günün önceki antrenmanına göre toplam ağırlık farkı, "Bu hafta 2/3 · 2 bardak su".
 * 2. **Rekorlar ve gelişim:** hareket başına bir rekor (`session-records.ts`), geçen sefere göre ↑ ↓ =,
 *    "Gelecek sefer" (öneri motorunun bu antrenman dahil planı; yalnız en yeni antrenmanda).
 * 3. **Çalışan kaslar:** set başına hedef 1, yardımcı 0,5, dengeleyici 0,25 (`ROLE_SET_WEIGHT`). Çalışan kas tek
 *    tanımla (`workedList`): hedef ya da yardımcı olduğu bir hareketin çalışma seti var; yalnız dengeleyici olan
 *    kas sayılmaz, aileler tek ad. Sayı, liste ve harita aynı kaslar ("14 kas" yazıp listede 25 kas olmaz).
 * 4. **Hareketler:** hareket başına set, tekrar ve üst ağırlık; geçilen ve yarım hareketler; bu antrenmanın
 *    program değişiklikleri (programa yazılan ve antrenörün onayındakiler).
 *
 * Tonaj (ACSM 2009): ısınma hariç Σ kg × tekrar (`volumeOf`); süreli set tonaja girmez, kaçırılan setin
 * yapılan tekrarı sayılır (açık soru 5).
 */

/** Kas yükünün girdisi: egzersizin türü ve kasları (kütüphaneden). */
export type MuscleSource = { category: Category; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[]; stabilizerMuscles?: readonly string[] };

function working(entry: SessionEntry) {
  return entry.sets.filter((set) => set.type === 'working');
}

function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Antrenmanın kas yükü: kas başına kesirli set (yapılan çalışma setleri × rol payı). Kütüphanede olmayan,
 * ısınma ve soğuma türündeki hareketler sayılmaz. `cardio` anahtarı korunur (harita çizmez).
 */
export function sessionMuscleLoad<E extends MuscleSource>(
  entries: readonly SessionEntry[],
  exercises: ReadonlyMap<string, E>,
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>,
): Record<string, number> {
  const load: Record<string, number> = {};
  for (const entry of entries) {
    const count = working(entry).length;
    const exercise = exercises.get(entry.exerciseId);
    if (count === 0 || !exercise || !countsForLoad(exercise.category)) continue;
    for (const [muscle, weight] of Object.entries(setWeightsOf(exercise))) {
      if (weight) load[muscle] = clean((load[muscle] ?? 0) + count * weight);
    }
  }
  return load;
}

/** Çalışan kaslar (hedef ya da yardımcı; yalnız dengeleyici olan kas ve kardiyo sayılmaz), yükü en çok olan önce. */
export function workedMuscles<E extends MuscleSource>(
  entries: readonly SessionEntry[],
  exercises: ReadonlyMap<string, E>,
  load: Readonly<Record<string, number>>,
): string[] {
  const worked = new Set<string>();
  for (const entry of entries) {
    const exercise = exercises.get(entry.exerciseId);
    if (working(entry).length === 0 || !exercise || !countsForLoad(exercise.category)) continue;
    for (const muscle of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) if (muscle !== 'cardio') worked.add(muscle);
  }
  return [...worked].sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0));
}

/** Özetin çalışan kası: ad (aile tamamsa tek ad), altındaki kaslar ve kesirli seti. */
export type WorkedMuscle = { label: string; muscles: string[]; sets: number };

/**
 * Çalışan kasların listesi (3. kartın sayısı, listesi ve haritası; tasarım §2.8): `workedMuscles`, aileler tek ad
 * (`group`: `muscles.ts` → `groupMuscles`). Ailenin seti en çok çalışan parçasınınki: aynı set her parçaya ayrı
 * sayıldığı için toplam şişer. Seti çok olan önce; eşitse ilk görünüş sırası.
 */
export function workedList(
  worked: readonly string[],
  load: Readonly<Record<string, number>>,
  group: (muscles: readonly string[]) => { label: string; muscles: readonly string[] }[],
): WorkedMuscle[] {
  return group(worked)
    .map((item) => ({ label: item.label, muscles: [...item.muscles], sets: Math.max(0, ...item.muscles.map((muscle) => load[muscle] ?? 0)) }))
    .sort((a, b) => b.sets - a.sets);
}

/* --- metinler --- */

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** Saat: "18:05" (uygulamanın saat diliminde). */
export function clockOf(iso: string, timeZone: string): string {
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
    clockFormats.set(timeZone, format);
  }
  return format.format(new Date(iso));
}

const dayWithWeekday = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' });

/** Takvim günü, haftanın günüyle: "26 Eyl Cmt" (gün bir an değil, tarihtir: UTC'de biçimlenir). */
export function shortDayText(day: string): string {
  return dayWithWeekday.format(new Date(`${day}T00:00:00Z`));
}

/** "62,5 kg × 10"; ağırlıksızda "15 tekrar". */
export function pointText(point: RepPoint): string {
  return point.kg > 0 ? `${formatKg(point.kg)} × ${formatNumber(point.reps)}` : `${formatNumber(point.reps)} tekrar`;
}

/** Kısa en iyi set ("Geçen sefere göre" satırı): "62,5 × 10", "15 tekrar", "45 sn". */
export function topText(top: TopSet): string {
  if (top.kind === 'kg') return `${formatNumber(top.kg)} × ${formatNumber(top.reps)}`;
  return top.kind === 'reps' ? `${formatNumber(top.reps)} tekrar` : `${formatNumber(top.seconds)} sn`;
}

/** Süre: "45 dk", "1 sa 5 dk", "2 sa". */
export function minutesText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${formatNumber(rest)} dk`;
  return rest === 0 ? `${formatNumber(hours)} sa` : `${formatNumber(hours)} sa ${formatNumber(rest)} dk`;
}

/** Özetin rekor kartı: hareketin adı, yeni değer ve öncekiyle karşılaştırma. */
export type RecordLine = { title: string; value: string; detail: string };

export function recordLine(title: string, hit: RecordHit): RecordLine {
  switch (hit.kind) {
    case 'heaviest':
      return { title, value: pointText(hit.now), detail: `Önceki en ağır: ${pointText(hit.before)}` };
    case 'e1rm':
      return {
        title,
        value: pointText(hit.now),
        detail: `Önceki en iyi: ${pointText(hit.before)}${hit.gainPct > 0 ? ` · tahmini 1RM +%${formatNumber(hit.gainPct)}` : ''}`,
      };
    case 'reps':
      return hit.now.kg > 0
        ? { title, value: pointText(hit.now), detail: `Bu ağırlıkta önceki en çok: ${formatNumber(hit.before.reps)} tekrar` }
        : { title, value: pointText(hit.now), detail: `Önceki en çok: ${formatNumber(hit.before.reps)} tekrar` };
    case 'seconds':
      return { title, value: `${formatNumber(hit.now)} sn`, detail: `Önceki en uzun: ${formatNumber(hit.before)} sn` };
  }
}

export type CompareLine = { title: string; trend: Trend; text: string };
export type NextLine = { title: string; text: string };
export type ExerciseLine = { title: string; text: string; state: 'done' | 'partial' | 'skipped' | 'missed' };

/** Bu antrenmanın program değişiklikleri: programa yazılan (doğrudan) ve antrenörün kararındaki öneriler. */
export type ChangeState = 'applied' | 'pending' | 'approved' | 'declined' | 'stale';
export type ChangeLine = { text: string; state: ChangeState; note?: string };

export const CHANGE_LABELS: Record<ChangeState, string> = {
  applied: 'programa yazıldı',
  pending: 'antrenörünün onayında',
  approved: 'antrenörün onayladı',
  declined: 'antrenörün reddetti',
  stale: 'uygulanamadı',
};

type ProposalLike = { sessionId: string; text: string; status: Exclude<ChangeState, 'applied'>; ptNote?: string | null | undefined };

/**
 * Antrenmanın program değişiklikleri: program geçmişindeki danışan kaydı (`client`, aynı `sessionId`) ve
 * `proposals.json`'daki öneriler (durumu ve varsa antrenörün notu).
 */
export function sessionChanges(input: {
  sessionId: string;
  log: readonly Pick<ProgramLogEntry, 'kind' | 'sessionId' | 'changes'>[];
  proposals: readonly ProposalLike[];
}): ChangeLine[] {
  const direct = input.log
    .filter((entry) => entry.kind === 'client' && entry.sessionId === input.sessionId)
    .flatMap((entry) => entry.changes.map((change): ChangeLine => ({ text: change.text, state: 'applied' })));
  const proposed = input.proposals
    .filter((item) => item.sessionId === input.sessionId)
    .map((item): ChangeLine => ({ text: item.text, state: item.status, ...(item.ptNote ? { note: item.ptNote } : {}) }));
  return [...direct, ...proposed];
}

/**
 * "Gelecek sefer" (özetin 2. kartı): öneri motorunun bu antrenman dahil kurduğu günün planı (`buildWorkoutDay`).
 * Programın satırlarındaki (muadil ve eklenen hareket hariç) yapılmış hareketler: "65 kg × 8", "12 tekrar",
 * "45 sn".
 */
export function nextTimeLines(day: Pick<WorkoutDay, 'rows'>, doc: Pick<SessionDoc, 'entries'>): NextLine[] {
  const lines: NextLine[] = [];
  const seen = new Set<string>();
  for (const entry of doc.entries) {
    if (!entry.rowId || entry.swappedFrom || entry.added || seen.has(entry.rowId) || working(entry).length === 0) continue;
    const row = day.rows[entry.rowId];
    if (!row || row.exerciseId !== entry.exerciseId) continue;
    seen.add(entry.rowId);
    const top = row.plan.sets.find((set) => set.weightKg === row.plan.topWeightKg) ?? row.plan.sets[0];
    if (!top) continue;
    const text =
      row.trackingType === 'duration'
        ? `${formatNumber(top.target)} sn`
        : row.trackingType === 'weight_reps' && row.plan.topWeightKg > 0
          ? `${formatKg(row.plan.topWeightKg)} × ${formatNumber(top.target)}`
          : `${formatNumber(top.target)} tekrar`;
    lines.push({ title: row.title, text });
  }
  return lines;
}

/** Hareketin satırı (4. kart ve geçmiş): "3 set · 27 tekrar · 62,5 kg üst", yarımda "2/3 set · …". */
export function exerciseLine(entry: SessionEntry): ExerciseLine {
  const sets = working(entry);
  if (sets.length === 0) return { title: entry.title, text: entry.status === 'skipped' ? 'geçildi' : 'yapılmadı', state: entry.status === 'skipped' ? 'skipped' : 'missed' };
  const planned = Math.max(0, ...sets.map((set) => set.plannedSetCount ?? 0), entry.plannedSets ?? 0);
  const reps = sets.reduce((sum, set) => sum + (set.reps ?? 0), 0);
  const seconds = sets.reduce((sum, set) => sum + (set.seconds ?? 0), 0);
  const kgs = sets.flatMap((set) => (set.kg !== undefined && set.kg > 0 ? [set.kg] : []));
  const partial = planned > 0 && sets.length < planned;
  const parts = [
    `${formatNumber(sets.length)}${partial ? `/${formatNumber(planned)}` : ''} set`,
    ...(reps > 0 ? [`${formatNumber(reps)} tekrar`] : []),
    ...(seconds > 0 ? [`${formatNumber(seconds)} sn`] : []),
    ...(kgs.length > 0 ? [`${formatKg(Math.max(...kgs))} üst`] : []),
    ...(entry.oneOff ? ['bir defalık'] : []),
  ];
  return { title: entry.title, text: parts.join(' · '), state: partial ? 'partial' : 'done' };
}

/** Hareketler yapılış sırasıyla (`order`; sırada olmayanlar arkada). */
export function entriesInOrder(doc: Pick<SessionDoc, 'entries' | 'order'>): SessionEntry[] {
  const order = doc.order?.value ?? [];
  const position = new Map(order.map((id, index) => [id, index]));
  return [...doc.entries].sort((a, b) => (position.get(a.id) ?? order.length) - (position.get(b.id) ?? order.length));
}

/** Özetin haftası: bu hafta hedefiyle ("Bu hafta 2/3"), geçmiş hafta yalnız sayı ("O hafta 3 antrenman"). */
export type SummaryWeek = { done: number; target: number | null; current: boolean };

/**
 * Antrenmanın haftası: bu haftaysa Bugün'ün sayısı ve hedefi (`weekOf`: seçili gün sayısı ya da sıklık);
 * geçmiş haftaysa o haftada (pazartesi başlar) antrenman yapılan gün sayısı, hedefsiz (program o arada
 * değişmiş olabilir).
 */
export function summaryWeek(index: SessionIndex, date: string, current: { done: number; target: number | null; start: string }): SummaryWeek {
  const start = mondayOf(date);
  if (start === current.start) return { done: current.done, target: current.target, current: true };
  const end = addDays(start, 6);
  const days = new Set(index.items.filter((row) => row.finishedAt && row.date >= start && row.date <= end).map((row) => row.date));
  return { done: days.size, target: null, current: false };
}

export function weekText(week: SummaryWeek): string {
  if (!week.current) return `O hafta ${formatNumber(week.done)} antrenman`;
  return week.target ? `Bu hafta ${formatNumber(week.done)}/${formatNumber(week.target)}` : `Bu hafta ${formatNumber(week.done)}`;
}

/**
 * Aynı günün önceki (yarım bırakılmamış) antrenmanına göre toplam ağırlık farkı. Önceki yoksa ya da iki
 * taraftan biri 0 kg ise (yalnız süreli ya da ağırlıksız hareketler) null: "−%100" bir şey anlatmaz.
 */
export function versusLastText(index: SessionIndex, doc: Pick<SessionDoc, 'id' | 'startedAt' | 'program'>, volumeKg: number): string | null {
  const dayId = doc.program?.dayId;
  if (!dayId || volumeKg <= 0) return null;
  const start = Date.parse(doc.startedAt);
  const previous = index.items
    .filter((row) => row.id !== doc.id && row.dayId === dayId && row.finishedAt && !row.unfinished && Date.parse(row.startedAt ?? row.date) < start)
    .sort((a, b) => Date.parse(b.startedAt ?? b.date) - Date.parse(a.startedAt ?? a.date))[0];
  if (!previous || previous.volumeKg <= 0) return null;
  const pct = Math.round(((volumeKg - previous.volumeKg) / previous.volumeKg) * 100);
  const name = doc.program?.dayName ?? '';
  if (pct === 0) return `Önceki ${name} antrenmanıyla aynı toplam ağırlık`;
  return `Önceki ${name} antrenmanına göre ${pct > 0 ? '+' : '−'}%${formatNumber(Math.abs(pct))}`;
}

export type SessionSummary = {
  id: string;
  /** Yarım bırakıldı: ilk kart "Antrenman kaydedildi" der. */
  unfinished: boolean;
  dayName: string;
  /** "26 Eyl Cmt · 18:05–18:57". */
  when: string;
  minutes: number;
  volumeKg: number;
  sets: number;
  /** Çalışan kas sayısı (`worked`'ün uzunluğu: aileler tek ad, yalnız dengeleyici olan kas yok). */
  muscles: number;
  prs: number;
  versusLast: string | null;
  /** "Bu hafta 2/3 · 2 bardak su". */
  footer: string;
  records: RecordLine[];
  compare: CompareLine[];
  /** Yalnız en yeni antrenmanda (öneri motorunun planı); yoksa null. */
  next: NextLine[] | null;
  /** Haritanın yükü: yalnız çalışan kaslar (listeyle aynı kaslar), kesirli set. */
  load: Record<string, number>;
  /** Çalışan kasların listesi, seti çok olan önce (`workedList`). */
  worked: WorkedMuscle[];
  /** Kas sayısı başlığının altındaki "En çok: göğüs". */
  topMuscle: string | null;
  /** "17 set · 142 tekrar". */
  totals: string;
  exercises: ExerciseLine[];
  changes: ChangeLine[];
};

/**
 * Özetin bütün kartları. `index` onarılmış index'tir; antrenmanın satırı yoksa (okunamadıysa) belgesinden
 * eklenir. Kas grupları ve rol payları kütüphanenin yardımcılarından (`muscles.ts`) verilir: aileler tek ad.
 */
export function sessionSummary<E extends MuscleSource>(input: {
  doc: SessionDoc;
  index: SessionIndex;
  timeZone: string;
  exercises: ReadonlyMap<string, E>;
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>;
  muscleGroups: (muscles: readonly string[]) => { label: string; muscles: readonly string[] }[];
  week: SummaryWeek | null;
  changes: readonly ChangeLine[];
  next: NextLine[] | null;
}): SessionSummary {
  const { doc } = input;
  const index = input.index.items.some((row) => row.id === doc.id) ? input.index : upsertIndexRow(input.index, indexRowOf(doc, '0'.repeat(40)));
  const end = doc.finishedAt ?? doc.startedAt;
  const minutes = Math.max(1, Math.round((Date.parse(end) - Date.parse(doc.startedAt)) / 60_000));
  const volumeKg = volumeOf(doc);
  const sets = workingSetCount(doc);

  const total = sessionMuscleLoad(doc.entries, input.exercises, input.setWeightsOf);
  const worked = workedList(workedMuscles(doc.entries, input.exercises, total), total, input.muscleGroups);
  const load = Object.fromEntries(worked.flatMap((item) => item.muscles.map((muscle) => [muscle, total[muscle] ?? 0] as const)));

  // Hareketin adı antrenmandaki hâliyle (egzersiz ve cihaz anahtarıyla).
  const titles = new Map<string, string>();
  for (const entry of doc.entries) if (!titles.has(recordKey(entry))) titles.set(recordKey(entry), entry.title);
  const titleOf = (key: string, exerciseId: string) => titles.get(key) ?? exerciseId;

  const records = sessionRecords(index, doc.id).flatMap((record) => {
    const [first] = record.hits;
    return first ? [recordLine(titleOf(record.key, record.exerciseId), first)] : [];
  });
  const compare = compareWithLast(index, doc.id).map(
    (item): CompareLine => ({
      title: titleOf(item.key, item.exerciseId),
      trend: item.trend,
      text: item.trend === 'first' || !item.before ? 'ilk kez' : `${topText(item.before)} → ${topText(item.now)}`,
    }),
  );

  const ordered = entriesInOrder(doc);
  const exercises = ordered.filter((entry) => working(entry).length > 0 || entry.status === 'skipped' || entry.skip).map(exerciseLine);
  const reps = doc.entries.reduce((sum, entry) => sum + working(entry).reduce((total, set) => total + (set.reps ?? 0), 0), 0);
  const seconds = doc.entries.reduce((sum, entry) => sum + working(entry).reduce((total, set) => total + (set.seconds ?? 0), 0), 0);
  const water = waterOf(doc);
  const unfinished = doc.notices.some((notice) => notice.kind === 'unfinished');

  return {
    id: doc.id,
    unfinished,
    dayName: doc.program?.dayName ?? 'Antrenman',
    when: `${shortDayText(doc.date)} · ${clockOf(doc.startedAt, input.timeZone)}–${clockOf(end, input.timeZone)}`,
    minutes,
    volumeKg,
    sets,
    muscles: worked.length,
    prs: records.length,
    versusLast: versusLastText(index, doc, volumeKg),
    footer: [input.week ? weekText(input.week) : null, `${formatNumber(water)} bardak su`, unfinished ? 'yarım bırakıldı' : null]
      .filter((part): part is string => part !== null)
      .join(' · '),
    records,
    compare,
    next: input.next && input.next.length > 0 ? input.next : null,
    load,
    worked,
    topMuscle: worked[0]?.label ?? null,
    totals: [`${formatNumber(sets)} set`, ...(reps > 0 ? [`${formatNumber(reps)} tekrar`] : []), ...(seconds > 0 ? [`${formatNumber(seconds)} sn`] : [])].join(' · '),
    exercises,
    changes: [...input.changes],
  };
}

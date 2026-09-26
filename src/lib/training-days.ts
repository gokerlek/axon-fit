import { appendLog, mondayOf, type ClientSchedule, type ProgramLogEntry, type ProgramSchedule } from './program-plan.ts';

/**
 * Antrenman günleri (tasarım §2.11, PT kararı 12) — saf. Haftanın günleri, takvim değil.
 *
 * - PT programda günleri işaretler (`schedule.weekdays`, ISO: 1 = Pazartesi … 7 = Pazar). Danışan kendi
 *   günlerini değiştirebilir: değişikliği ayrı bir katmanda durur (`clientSchedule`), revision artmaz,
 *   PT'nin açık düzenleyicisi 412 almaz. **Geçerli günler = danışanınki ?? PT'ninki.** PT günleri
 *   değiştirince danışanın katmanı silinir (son söz PT'nin); "PT'nin günlerine dön" de siler.
 * - Günler yalnız "ne zaman" sorusunu cevaplar: sıradaki antrenmanın içeriği yine rotasyondan
 *   (`nextDayId`, A → B → C). Kaçan gün içeriği atlatmaz; dinlenme gününde de başlatılabilir.
 * - "Bu hafta x/y": y seçili gün sayısı (yoksa haftalık sıklık); hafta pazartesi başlar, uygulamanın
 *   saat diliminde (`weekOf`).
 * - Danışanın değişikliği program geçmişine `client` türünde yazılır ("Antrenman günleri: Pzt, Çar,
 *   Cum → Sal, Per, Cmt"); PT'nin bildirimleri bu kayıttan türetilir (`notices.ts`).
 *
 * Tarihler takvim günüdür ("2026-09-26"): UTC'de hesaplanır, saat dilimine çevrilmez.
 */

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_SHORT: Record<Weekday, string> = { 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 7: 'Paz' };
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
  6: 'Cumartesi',
  7: 'Pazar',
};

const DAY_MS = 86_400_000;

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** Geçerli günler, her biri bir kez, pazartesiden pazara. */
export function normalizeWeekdays(list: readonly unknown[]): Weekday[] {
  return [...new Set(list.filter(isWeekday))].sort((a, b) => a - b);
}

export function sameWeekdays(a: readonly number[], b: readonly number[]): boolean {
  const left = normalizeWeekdays(a);
  const right = normalizeWeekdays(b);
  return left.length === right.length && left.every((day, index) => day === right[index]);
}

/** "Pzt, Çar, Cum"; boşsa boş metin. */
export function weekdaysText(list: readonly number[]): string {
  return normalizeWeekdays(list)
    .map((day) => WEEKDAY_SHORT[day])
    .join(', ');
}

type Scheduled = { schedule?: ProgramSchedule | undefined; clientSchedule?: ClientSchedule | undefined };

export type EffectiveSchedule = {
  /** Geçerli günler (danışanınki ?? PT'ninki); boşsa seçilmemiş. */
  weekdays: Weekday[];
  /** PT'nin seçtiği günler. */
  pt: Weekday[];
  /** Danışanın katmanı; yoksa null. */
  client: { weekdays: Weekday[]; at: string } | null;
  /** Geçerli günlerin kaynağı; hiç seçilmemişse null. */
  source: 'client' | 'pt' | null;
};

export function effectiveSchedule(program: Scheduled): EffectiveSchedule {
  const pt = normalizeWeekdays(program.schedule?.weekdays ?? []);
  const own = program.clientSchedule ? normalizeWeekdays(program.clientSchedule.weekdays) : [];
  const client = program.clientSchedule && own.length > 0 ? { weekdays: own, at: program.clientSchedule.at } : null;
  const weekdays = client ? client.weekdays : pt;
  return { weekdays, pt, client, source: client ? 'client' : pt.length > 0 ? 'pt' : null };
}

/** "Bu hafta x/y"nin y'si: seçili gün sayısı, yoksa haftalık sıklık, o da yoksa null. */
export function weekTarget(weekdays: readonly number[], daysPerWeek?: number): number | null {
  const count = normalizeWeekdays(weekdays).length;
  return count > 0 ? count : (daysPerWeek ?? null);
}

/** Seçilen gün sayısı haftalık sıklıktan farklı mı (iki tarafta küçük uyarı; engel değil). */
export function frequencyMismatch(weekdays: readonly number[], daysPerWeek?: number): boolean {
  const count = normalizeWeekdays(weekdays).length;
  return count > 0 && daysPerWeek !== undefined && count !== daysPerWeek;
}

/* --- takvim --- */

function dayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
}

/** Takvim gününe gün ekler: ("2026-09-26", 2) → "2026-09-28". */
export function addDays(day: string, days: number): string {
  return new Date((dayIndex(day) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Takvim gününün ISO hafta günü (1 = Pazartesi). */
export function isoWeekdayOf(day: string): Weekday {
  // 1970-01-01 perşembe (4).
  return (((((dayIndex(day) + 3) % 7) + 7) % 7) + 1) as Weekday;
}

/** Günün haftası: pazartesiden pazara yedi takvim günü. */
export function weekDates(day: string): string[] {
  const monday = mondayOf(day);
  return WEEKDAYS.map((_, index) => addDays(monday, index));
}

export type StripDay = {
  date: string;
  weekday: Weekday;
  /** Antrenman günü (geçerli günlerden). */
  selected: boolean;
  /** O gün antrenman yapıldı (seçili olmasa da). */
  done: boolean;
  /** Seçili gün geçti ve o gün antrenman yok. */
  missed: boolean;
  today: boolean;
};

/**
 * Bugün kartının 7 günlük şeridi (pazartesi başlar): seçili günler halkalı, yapılanlar dolu, kaçanlar
 * soluk. `doneDays`: bu hafta antrenman yapılan günler (`weekOf().days`).
 */
export function weekStrip(input: { today: string; weekdays: readonly number[]; doneDays: Iterable<string> }): StripDay[] {
  const selected = new Set(normalizeWeekdays(input.weekdays));
  const done = new Set(input.doneDays);
  return weekDates(input.today).map((date) => {
    const weekday = isoWeekdayOf(date);
    const isSelected = selected.has(weekday);
    const isDone = done.has(date);
    return { date, weekday, selected: isSelected, done: isDone, missed: isSelected && !isDone && date < input.today, today: date === input.today };
  });
}

/** Sıradaki antrenman günü: bugünden sonraki (ya da `includeToday` ise bugünden başlayan) ilk seçili gün. */
export function nextTrainingDate(today: string, weekdays: readonly number[], options: { includeToday?: boolean } = {}): string | null {
  const selected = new Set(normalizeWeekdays(weekdays));
  if (selected.size === 0) return null;
  for (let offset = options.includeToday ? 0 : 1; offset <= 7; offset += 1) {
    const date = addDays(today, offset);
    if (selected.has(isoWeekdayOf(date))) return date;
  }
  return null;
}

export type TodayState =
  /** Gün seçilmemiş: yalnız "Sıradaki antrenman". */
  | { kind: 'none' }
  /** Bugün seçili gün, henüz antrenman yok. */
  | { kind: 'training' }
  /** Bugün antrenman yapıldı. */
  | { kind: 'done'; next: string | null }
  /** Dinlenme günü; sıradaki seçili gün. */
  | { kind: 'rest'; next: string };

export function todayState(input: { today: string; weekdays: readonly number[]; doneToday: boolean }): TodayState {
  const next = nextTrainingDate(input.today, input.weekdays);
  if (normalizeWeekdays(input.weekdays).length === 0 || next === null) return { kind: 'none' };
  if (input.doneToday) return { kind: 'done', next };
  if (normalizeWeekdays(input.weekdays).includes(isoWeekdayOf(input.today))) return { kind: 'training' };
  return { kind: 'rest', next };
}

/** "yarın", "Çarşamba", bir hafta sonrası "gelecek Salı". */
export function relativeDayText(date: string, today: string): string {
  const offset = dayIndex(date) - dayIndex(today);
  if (offset === 1) return 'yarın';
  const name = WEEKDAY_NAMES[isoWeekdayOf(date)];
  return offset >= 7 ? `gelecek ${name}` : name;
}

/**
 * Bugün kartının üst satırı: "Bugün antrenman günün · Gün B", "Dinlenme günü · sıradaki antrenman
 * Çarşamba (Gün B)", "Bugünkü antrenmanını yaptın · sıradaki yarın (Gün C)"; gün seçilmemişse
 * "Sıradaki antrenman".
 */
export function todayStatusText(state: TodayState, today: string, dayName: string): string {
  switch (state.kind) {
    case 'none':
      return 'Sıradaki antrenman';
    case 'training':
      return `Bugün antrenman günün · ${dayName}`;
    case 'rest':
      return `Dinlenme günü · sıradaki antrenman ${relativeDayText(state.next, today)} (${dayName})`;
    case 'done':
      return state.next ? `Bugünkü antrenmanını yaptın · sıradaki ${relativeDayText(state.next, today)} (${dayName})` : 'Bugünkü antrenmanını yaptın';
  }
}

/* --- değişiklikler --- */

/** Program geçmişinin cümlesi: "Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt". */
export function weekdaysChangeText(before: readonly number[], after: readonly number[]): string {
  const from = weekdaysText(before);
  const to = weekdaysText(after);
  if (!from) return `Antrenman günleri: ${to}`;
  if (!to) return `Antrenman günleri kaldırıldı (önce ${from})`;
  return `Antrenman günleri: ${from} → ${to}`;
}

type SchedulableProgram = Scheduled & { revision: number; log: ProgramLogEntry[] };

function withoutClientSchedule<P extends Scheduled>(program: P): P {
  const { clientSchedule: _dropped, ...rest } = program;
  return rest as P;
}

/**
 * Danışanın "Günlerini değiştir"i: doğrudan uygulanır, program geçmişine `client` türünde yazılır,
 * revision artmaz. PT'nin günleriyle aynıysa danışanın katmanı kalkar (geçerli günler yine PT'ninki).
 * Geçerli günlerle aynıysa değişiklik yok (null); boş seçim de yok sayılır.
 */
export function applyClientSchedule<P extends SchedulableProgram>(program: P, weekdays: readonly number[], now: Date): { program: P; text: string } | null {
  const next = normalizeWeekdays(weekdays);
  const current = effectiveSchedule(program);
  if (next.length === 0 || sameWeekdays(next, current.weekdays)) return null;
  const at = now.toISOString();
  const text = weekdaysChangeText(current.weekdays, next);
  const base = withoutClientSchedule(program);
  return {
    program: {
      ...base,
      ...(sameWeekdays(next, current.pt) ? {} : { clientSchedule: { weekdays: next, at } }),
      log: appendLog(program.log, { at, revision: program.revision, kind: 'client', changes: [{ text }] }),
    },
    text,
  };
}

/**
 * PT: "PT'nin günlerine dön": danışanın katmanı silinir, geçmişe PT'nin kaydı olarak yazılır; revision
 * artmaz (açık düzenleyici 412 almaz). Danışanın katmanı yoksa null.
 */
export function resetClientSchedule<P extends SchedulableProgram>(program: P, now: Date): { program: P; text: string } | null {
  const current = effectiveSchedule(program);
  if (!current.client) return null;
  const at = now.toISOString();
  const text = current.pt.length > 0
    ? `Danışanın günleri kaldırıldı (${weekdaysText(current.client.weekdays)}); geçerli günler: ${weekdaysText(current.pt)}`
    : `Danışanın günleri kaldırıldı (${weekdaysText(current.client.weekdays)})`;
  return {
    program: { ...withoutClientSchedule(program), log: appendLog(program.log, { at, revision: program.revision, kind: 'edit', changes: [{ text }] }) },
    text,
  };
}

/**
 * PT'nin kaydında günler (`applyProgramEdit`): gövde günleri göndermediyse (eski sekme) kayıttaki kalır.
 * Değiştiyse PT'nin günleri yazılır, danışanın katmanı silinir (son söz PT'nin); cümleler geçmişe.
 */
export function ptScheduleEdit(
  stored: Scheduled,
  weekdays: readonly number[] | undefined,
): { schedule: ProgramSchedule | undefined; clientSchedule: ClientSchedule | undefined; changes: string[] } {
  const before = normalizeWeekdays(stored.schedule?.weekdays ?? []);
  const keep = { schedule: stored.schedule, clientSchedule: stored.clientSchedule, changes: [] };
  if (weekdays === undefined) return keep;
  const after = normalizeWeekdays(weekdays);
  if (sameWeekdays(before, after)) return keep;
  const client = effectiveSchedule(stored).client;
  return {
    schedule: after.length > 0 ? { weekdays: after } : undefined,
    clientSchedule: undefined,
    changes: [weekdaysChangeText(before, after), ...(client ? [`Danışanın günleri kaldırıldı (${weekdaysText(client.weekdays)})`] : [])],
  };
}

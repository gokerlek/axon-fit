import { formatDay, formatKg, formatNumber, todayIn } from './format.ts';
import { EFFORT_LABELS } from './progression.ts';
import type { SessionDoc, SessionIndex, SessionIndexRow, SkipReason } from './schemas/session.ts';
import { volumeOf, waterOf, workingSetCount } from './session-index.ts';
import { addDays } from './training-days.ts';
import { FINISH_REASON_LABELS } from './workout-flow.ts';
import { setValueText } from './workout-session.ts';
import { clockOf, entriesInOrder, minutesText } from './workout-summary.ts';

/**
 * Danışanın Geçmiş'i (tasarım §2.10, §4.5) — saf. Liste index'ten (tek okuma), detay antrenmanın dosyasından.
 *
 * - **Liste:** bitmiş antrenmanlar en yeniden eskiye, aylara bölünmüş ("EYLÜL 2026"); satırda gün, haftanın
 *   günü, gün adı ve süre, set · toplam ağırlık; rekor, "başka gün" ve "yarım" rozetleri. Üstte son 30 gün.
 * - **Detay:** hareketler yapılış sırasıyla, setler zorluklarıyla; ısınma ayrı satır; geçilen hareketin nedeni,
 *   danışanın ayar notu. Düzenle kipinde set, hareket ve antrenmanın tamamı onaylı silinir; su ±1 (açık soru 6:
 *   geçmişte set düzeltme yok, yalnız silme ve su).
 * - **Silme metni dürüsttür** (§4.5): uygulamadan kalkar ama antrenörün veri deposunun geçmişinde kalır
 *   ("kalabilir" değil, kalır); "Ayrıntı" neyin silinmediğini söyler.
 */

/** Listenin ilk sayfası; "Daha fazla göster (n)" sonrakileri açar. */
export const HISTORY_PAGE = 20;
/** Liste başındaki özetin penceresi. */
export const HISTORY_RECENT_DAYS = 30;

export type HistoryRow = {
  id: string;
  /** Takvim günü: "26" ve "Cmt". */
  dayOfMonth: string;
  weekday: string;
  /** "Gün A · 52 dk". */
  title: string;
  /** "17 set · 4.215 kg" (rekor sayısı rozette). */
  meta: string;
  otherDay: boolean;
  unfinished: boolean;
  prs: number;
  /** Kendi programdan antrenman: programın o günkü adı (`docs/design/kendi-program.md` §3.7, §4); PT'ninkinde yok. */
  program?: string;
};
export type HistoryMonth = { key: string; label: string; rows: HistoryRow[] };
export type HistoryList = { recent: string | null; months: HistoryMonth[]; count: number };

const weekdayFormat = new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function time(iso: string | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

function rowOf(row: SessionIndexRow): HistoryRow {
  const date = new Date(`${row.date}T00:00:00Z`);
  const prs = row.prs ?? 0;
  // Kendi programdan antrenman programın adıyla ("Evde · Gün A"): program silinse de anlık görüntü kalır.
  const day = row.programName ? `${row.programName} · ${row.dayName || 'Antrenman'}` : row.dayName || 'Antrenman';
  const title = [day, ...(row.durationMin !== undefined ? [minutesText(row.durationMin)] : [])].join(' · ');
  const meta = `${formatNumber(row.sets)} set · ${formatKg(row.volumeKg)}`;
  return {
    id: row.id,
    dayOfMonth: String(date.getUTCDate()),
    weekday: weekdayFormat.format(date),
    title,
    meta,
    otherDay: row.otherDay,
    unfinished: row.unfinished,
    prs,
    ...(row.programId ? { program: row.programName ?? 'Kendi programı' } : {}),
  };
}

/** Geçmiş listesi: yalnız bitmiş antrenmanlar (yarım kalan etkin antrenman Bugün'dedir). */
export function historyList(index: SessionIndex, now: Date, timeZone: string): HistoryList {
  const rows = index.items.filter((row) => row.finishedAt).sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date));
  const months: HistoryMonth[] = [];
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    let month = months.at(-1);
    if (!month || month.key !== key) {
      month = { key, label: monthFormat.format(new Date(`${key}-01T00:00:00Z`)).toLocaleUpperCase('tr-TR'), rows: [] };
      months.push(month);
    }
    month.rows.push(rowOf(row));
  }
  const since = addDays(todayIn(timeZone, now), -(HISTORY_RECENT_DAYS - 1));
  const recent = rows.filter((row) => row.date >= since);
  const minutes = recent.reduce((sum, row) => sum + (row.durationMin ?? 0), 0);
  const prs = recent.reduce((sum, row) => sum + (row.prs ?? 0), 0);
  const summary =
    recent.length > 0
      ? [`Son ${HISTORY_RECENT_DAYS} gün`, `${formatNumber(recent.length)} antrenman`, minutesText(minutes), ...(prs > 0 ? [`${formatNumber(prs)} rekor`] : [])].join(' · ')
      : null;
  return { recent: summary, months, count: rows.length };
}

/**
 * "Daha fazla göster": ayların satırları ilk `count` satıra kadar (boş kalan ay düşer). Danışanın Geçmiş'i ve
 * PT'nin Antrenmanlar sekmesi ortak.
 */
export function firstHistoryRows(months: readonly HistoryMonth[], count: number): HistoryMonth[] {
  const shown: HistoryMonth[] = [];
  let left = count;
  for (const month of months) {
    if (left <= 0) break;
    shown.push({ ...month, rows: month.rows.slice(0, left) });
    left -= month.rows.length;
  }
  return shown;
}

/* --- detay --- */

export type DetailSet = {
  id: string;
  /** "1", "2"; ısınmada "Isınma". */
  label: string;
  /** "62,5 kg × 10", "10 tekrar", "45 sn". */
  text: string;
  effort: string | null;
  warmup: boolean;
  /** Plandan fazla ("+ Set ekle"). */
  extra: boolean;
};
export type DetailExercise = {
  entryId: string;
  title: string;
  /** "3 set", "2/3 set · bir defalık", "geçildi · Alet dolu". */
  note: string;
  setupNote?: string;
  sets: DetailSet[];
};
export type SessionDetail = {
  id: string;
  /** "Gün A · 26 Eylül 2026". */
  title: string;
  /** "18:05–18:57 · 17 set · 4.215 kg". */
  meta: string;
  water: number;
  /** Seans zorluğu (bitişten sonra sorulan CR-10): "Zorluk 6/10". */
  effort: string | null;
  otherDay: boolean;
  unfinished: boolean;
  exercises: DetailExercise[];
  /** Silme onayındaki antrenman satırı: "Gün A · 26 Eylül 2026 · 17 set ve özeti". */
  subject: string;
};

function skipText(reason: SkipReason | undefined): string {
  return reason ? `geçildi · ${FINISH_REASON_LABELS[reason]}` : 'geçildi';
}

/** Antrenmanın detayı: setleri olan ya da geçilen hareketler, yapılış sırasıyla. */
export function sessionDetail(doc: SessionDoc, timeZone: string): SessionDetail {
  const exercises: DetailExercise[] = [];
  for (const entry of entriesInOrder(doc)) {
    const working = entry.sets.filter((set) => set.type === 'working');
    const warmups = entry.sets.filter((set) => set.type === 'warmup');
    if (entry.sets.length === 0 && entry.status !== 'skipped') continue;
    const planned = Math.max(0, ...working.map((set) => set.plannedSetCount ?? 0), entry.plannedSets ?? 0);
    const count =
      working.length === 0
        ? skipText(entry.skip?.reason)
        : `${formatNumber(working.length)}${planned > working.length ? `/${formatNumber(planned)}` : ''} set`;
    const note = [count, ...(entry.oneOff ? ['bir defalık'] : []), ...(entry.lighter ? ['hafif'] : [])].join(' · ');
    const sets: DetailSet[] = [
      ...warmups.map((set) => ({ id: set.id, label: 'Isınma', text: setValueText(set), effort: null, warmup: true, extra: false })),
      ...working.map((set, position) => ({
        id: set.id,
        label: formatNumber(position + 1),
        text: setValueText(set),
        effort: set.effort ? EFFORT_LABELS[set.effort] : null,
        warmup: false,
        extra: Boolean(set.extra),
      })),
    ];
    exercises.push({ entryId: entry.id, title: entry.title, note, ...(entry.setupNote ? { setupNote: entry.setupNote } : {}), sets });
  }
  const sets = workingSetCount(doc);
  const end = doc.finishedAt ?? doc.startedAt;
  const dayName = doc.program?.programName ? `${doc.program.programName} · ${doc.program.dayName}` : (doc.program?.dayName ?? 'Antrenman');
  const title = `${dayName} · ${formatDay(doc.date)}`;
  return {
    id: doc.id,
    title,
    meta: [`${clockOf(doc.startedAt, timeZone)}–${clockOf(end, timeZone)}`, `${formatNumber(sets)} set`, formatKg(volumeOf(doc))].join(' · '),
    water: waterOf(doc),
    effort: doc.effort?.sessionRpe !== undefined ? `Zorluk ${formatNumber(doc.effort.sessionRpe)}/10` : null,
    otherDay: !doc.program?.programId && Boolean(doc.program?.plannedDayId && doc.program.plannedDayId !== doc.program.dayId),
    unfinished: doc.notices.some((notice) => notice.kind === 'unfinished'),
    exercises,
    subject: `${title} · ${formatNumber(sets)} set ve özeti`,
  };
}

/* --- silme --- */

/** Onay metni (§2.10): aynı iki cümle; veri depoda gerçekten kalır, bu yüzden "kalır". */
export const DELETE_BODY = 'Uygulamadan kalkar, geri getirilemez. Antrenörünün veri deposunun geçmişinde kalır.';
/** "Ayrıntı" açılınca: neyin silinmediği ve tam temizlik için kime yazılacağı. */
export const DELETE_DETAIL =
  'Deponun eski sürümlerinde ve kayıt notlarında kalır. Programındaki değişiklik kaydı (ör. "Bench Press 60 → 65 kg") silinmez. Rekorların ve önerilerin kalan kayıtlara göre yeniden hesaplanır. Tamamen silinmesi için antrenörüne yaz.';

export type DeleteTarget =
  | { kind: 'set'; entryId: string; setId: string }
  | { kind: 'entry'; entryId: string }
  | { kind: 'session' };

/** Onayın başlığı ve konusu ("Bench Press · Set 2 · 60 kg × 9"); hedef belgede yoksa null. */
export function deleteCopy(detail: SessionDetail, target: DeleteTarget): { title: string; subject: string } | null {
  if (target.kind === 'session') return { title: 'Bu antrenman silinsin mi?', subject: detail.subject };
  const exercise = detail.exercises.find((item) => item.entryId === target.entryId);
  if (!exercise) return null;
  if (target.kind === 'entry') {
    const count = exercise.sets.filter((set) => !set.warmup).length;
    return { title: 'Bu hareket silinsin mi?', subject: `${exercise.title} · ${count > 0 ? `${formatNumber(count)} set` : exercise.note}` };
  }
  const set = exercise.sets.find((item) => item.id === target.setId);
  if (!set) return null;
  return { title: 'Bu set silinsin mi?', subject: `${exercise.title} · ${set.warmup ? 'Isınma' : `Set ${set.label}`} · ${set.text}` };
}

/**
 * Silmenin isteği (`PATCH /api/me/sessions/[id]`): set ya da hareketin kimliği. Hareketin son seti
 * silinirse hareket de gider (boş kalan hareket geçmişte satır olarak durmasın).
 */
export function deletePatch(doc: Pick<SessionDoc, 'entries'>, target: Exclude<DeleteTarget, { kind: 'session' }>): { deleteSetIds?: string[]; deleteEntryIds?: string[] } {
  if (target.kind === 'entry') return { deleteEntryIds: [target.entryId] };
  const entry = doc.entries.find((item) => item.id === target.entryId);
  const last = entry !== undefined && entry.sets.length === 1 && entry.sets[0]?.id === target.setId && entry.status !== 'skipped';
  return last ? { deleteEntryIds: [target.entryId] } : { deleteSetIds: [target.setId] };
}

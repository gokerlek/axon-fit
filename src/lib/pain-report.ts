import type { MovementPattern } from './alternatives.ts';
import { CONSTRAINT_LIMITS, type CareTags, type ConstraintRegion, type Trigger } from './constraints.ts';
import type { Constraint, HealthCheckIn } from './schemas/health.ts';
import type { SessionEntry } from './schemas/session.ts';
import { addDays } from './training-days.ts';
import { entryForRow } from './workout-cursor.ts';

/**
 * Antrenman bitişinde "Antrenörüne kısıt olarak bildir" kısayolu (tasarım `kisit-tarama.md` §3.7, faz 6) — saf.
 *
 * - **Ağrıyla geçme** bitişteki "Neden?" çipinin "Ağrı"sıdır: seans dosyasına `other` yazılır, satırları yalnız ağrı
 *   takibi (`check_in`) onaylıyken `health.json`'da, seansın yoklamasında (`skippedRows`, `reason: 'pain'`) durur.
 * - **İki antrenman [sentez]:** bu antrenmanda ağrıyla geçilen bir hareket son 42 günde en az bir antrenmanda daha
 *   ağrıyla geçildiyse. Satır kimliği seansın kaydıyla harekete çevrilir (muadilse muadil): aynı hareket başka programın
 *   satırında da sayılır.
 * - **Bölge [sentez]** hareketin kalıbından önerilir (squat → diz, menteşe → bel, itiş/çekiş → omuz …); taraf
 *   yazılmaz (egzersiz etiketleri taraf ayırmaz), danışan seçer. Kalıptan belli olan zorlayan da önerilir.
 * - O bölgede etkin kısıt ya da bekleyen bildirim varsa kısayol yok: antrenörü zaten biliyor (Sağlık sayfasında
 *   "Kötüleşti" var). Bölge çıkarılamıyorsa kısayol kalır, danışan bölgeyi seçer.
 */

/** Ağrıyla geçme en az bu kadar antrenmanda (bu antrenman dahil). */
export const PAIN_REPORT_SESSIONS = 2;
/** Önceki antrenmanlar bu kadar gün geriye bakılır. */
export const PAIN_REPORT_WINDOW_DAYS = 42;
/** En çok bu kadar önceki antrenman okunur (her biri bir dosya okuması). */
export const PAIN_REPORT_MAX_EARLIER = 6;
/** Tek ekranda en çok bu kadar kısayol (bölge başına bir). */
export const PAIN_REPORT_MAX_OFFERS = 2;

type PainCheckIn = Pick<HealthCheckIn, 'date' | 'sessionId' | 'skippedRows'>;

function painRows(checkIn: PainCheckIn): string[] {
  return (checkIn.skippedRows ?? []).filter((row) => row.reason === 'pain').map((row) => row.rowId);
}

/**
 * Bu antrenmanın yoklamasındaki ağrıyla geçilen satırlar ve yoklamanın günü (bitiş yoklamayı seansın günüyle yazar);
 * ağrıyla geçme yoksa null.
 */
export function currentPain(checkIns: readonly PainCheckIn[], sessionId: string): { date: string; rowIds: string[] } | null {
  const own = checkIns.filter((item) => item.sessionId === sessionId);
  const rowIds = [...new Set(own.flatMap(painRows))];
  return own[0] && rowIds.length > 0 ? { date: own[0].date, rowIds } : null;
}

/**
 * Okunacak önceki antrenmanlar: bu antrenmanın dışında, penceredeki (`date` dahil geriye 42 gün) ağrıyla geçme kaydı
 * olan yoklamalar, en yeni önce, en çok 6.
 */
export function earlierPainSessions(checkIns: readonly PainCheckIn[], current: { sessionId: string; date: string }): { sessionId: string; rowIds: string[] }[] {
  const from = addDays(current.date, -PAIN_REPORT_WINDOW_DAYS);
  const bySession = new Map<string, { date: string; rowIds: Set<string> }>();
  for (const item of checkIns) {
    if (!item.sessionId || item.sessionId === current.sessionId || item.date < from || item.date > current.date) continue;
    const rows = painRows(item);
    if (rows.length === 0) continue;
    const entry = bySession.get(item.sessionId) ?? { date: item.date, rowIds: new Set<string>() };
    for (const row of rows) entry.rowIds.add(row);
    bySession.set(item.sessionId, entry);
  }
  return [...bySession.entries()]
    .sort((a, b) => (a[1].date < b[1].date ? 1 : a[1].date > b[1].date ? -1 : a[0] < b[0] ? 1 : -1))
    .slice(0, PAIN_REPORT_MAX_EARLIER)
    .map(([sessionId, entry]) => ({ sessionId, rowIds: [...entry.rowIds] }));
}

/** Satırlar → o antrenmandaki hareket (muadille değiştirildiyse muadil); kaydı olmayan satır düşer. */
export function painSkippedExercises(entries: readonly SessionEntry[], rowIds: readonly string[]): { exerciseId: string; title: string }[] {
  const found = new Map<string, string>();
  for (const rowId of rowIds) {
    const entry = entryForRow(entries, rowId);
    if (entry && !found.has(entry.exerciseId)) found.set(entry.exerciseId, entry.title);
  }
  return [...found.entries()].map(([exerciseId, title]) => ({ exerciseId, title }));
}

export type RepeatedPain = { exerciseId: string; title: string; sessions: number };

/** Bu antrenmanda ağrıyla geçilen ve öncekilerin en az birinde de ağrıyla geçilen hareketler (antrenman sayısıyla). */
export function repeatedPainSkips(current: readonly { exerciseId: string; title: string }[], earlier: readonly (readonly string[])[]): RepeatedPain[] {
  return current.flatMap((item) => {
    const sessions = 1 + earlier.filter((exercises) => exercises.includes(item.exerciseId)).length;
    return sessions >= PAIN_REPORT_SESSIONS ? [{ ...item, sessions }] : [];
  });
}

const PATTERN_REGION: Partial<Record<MovementPattern, ConstraintRegion>> = {
  horizontal_push: 'shoulder',
  vertical_push: 'shoulder',
  chest_fly: 'shoulder',
  horizontal_pull: 'shoulder',
  vertical_pull: 'shoulder',
  lateral_raise: 'shoulder',
  rear_delt: 'shoulder',
  shrug: 'neck',
  squat: 'knee',
  lunge: 'knee',
  knee_extension: 'knee',
  knee_flexion: 'knee',
  hinge: 'lower_back',
  core_flexion: 'lower_back',
  core_rotation: 'lower_back',
  core_stability: 'lower_back',
  anti_extension: 'lower_back',
  anti_rotation: 'lower_back',
  anti_lateral_flexion: 'lower_back',
  hip_extension: 'hip',
  hip_abduction: 'hip',
  hip_adduction: 'hip',
  calf_raise: 'ankle_foot',
  elbow_flexion: 'elbow',
  elbow_extension: 'elbow',
};

/** Hareketin kalıbından bölge ve zorlayan önerisi [sentez]; taşıma, kardiyo, mobilite ve bilinmeyende bölge yok. */
export function painRegionOf(tags: Pick<CareTags, 'pattern' | 'contractionType'> | undefined): { region: ConstraintRegion | null; trigger: Trigger | null } {
  const pattern = tags?.pattern;
  const region = (pattern && PATTERN_REGION[pattern]) || null;
  const trigger: Trigger | null =
    tags?.contractionType === 'energy_storage_ballistic'
      ? 'jump'
      : pattern === 'squat'
        ? 'squat'
        : pattern === 'vertical_push'
          ? 'overhead'
          : pattern === 'hinge'
            ? 'bend'
            : null;
  return { region, trigger };
}

export type PainReportOffer = {
  /** Önerilen bölge; çıkarılamadıysa null (danışan seçer). */
  region: ConstraintRegion | null;
  triggers: Trigger[];
  /** "Squat (2 antrenmanda)". */
  exercises: string[];
  /** Bildirimin notuna hazır metin (danışan değiştirebilir). */
  note: string;
};

function listText(items: readonly RepeatedPain[]): string[] {
  return items.map((item) => `${item.title} (${item.sessions} antrenmanda)`);
}

/** Bildirimin hazır notu: hareket adları ekle çekimlenmez (kesme işareti ve ünlü uyumu yok). */
export function painReportNote(items: readonly RepeatedPain[]): string {
  const text = `Ağrı yüzünden geçtiğim: ${listText(items).join(', ')}.`;
  return text.length > CONSTRAINT_LIMITS.reportNote ? `${text.slice(0, CONSTRAINT_LIMITS.reportNote - 1)}…` : text;
}

/**
 * Kısayolun teklifleri: bölgeye göre toplanır (en çok iki); o bölgede etkin kısıt ya da bekleyen bildirim varsa
 * (`open`: `activeConstraints` + `pendingReports`; kapanan ve reddedilen sayılmaz) o bölge için teklif yok.
 */
export function painReportOffers(
  repeated: readonly RepeatedPain[],
  tagsOf: (exerciseId: string) => Pick<CareTags, 'pattern' | 'contractionType'> | undefined,
  open: readonly Pick<Constraint, 'region'>[],
): PainReportOffer[] {
  const known = new Set(open.map((item) => item.region));
  const groups = new Map<ConstraintRegion | null, { items: RepeatedPain[]; triggers: Set<Trigger> }>();
  for (const item of repeated) {
    const { region, trigger } = painRegionOf(tagsOf(item.exerciseId));
    if (region && known.has(region)) continue;
    const group = groups.get(region) ?? { items: [], triggers: new Set<Trigger>() };
    group.items.push(item);
    if (trigger) group.triggers.add(trigger);
    groups.set(region, group);
  }
  return [...groups.entries()].slice(0, PAIN_REPORT_MAX_OFFERS).map(([region, group]) => ({
    region,
    triggers: [...group.triggers],
    exercises: listText(group.items),
    note: painReportNote(group.items),
  }));
}

import { formatDayShort, formatNumber } from './format.ts';
import type { LogKind } from './program-plan.ts';
import type { SessionIndex } from './schemas/session.ts';
import { normalizeWeekdays, weekdaysText } from './training-days.ts';

/**
 * Kendi programların ekran metinleri (`docs/design/kendi-program.md` §2, §4, §7.3) — saf. Liste kartları ve PT'nin
 * kartı index satırından (program başına okuma yok), geçmiş etiketleri görene göre.
 */

/** "Sal, Per", yoksa "haftada 2", o da yoksa "gün seçilmedi". */
export function scheduleText(input: { weekdays: readonly number[]; daysPerWeek?: number | undefined }): string {
  const days = weekdaysText(input.weekdays);
  if (days) return days;
  return input.daysPerWeek !== undefined ? `haftada ${formatNumber(input.daysPerWeek)}` : 'gün seçilmedi';
}

/**
 * Programın satırı: "2 gün · haftada 2 · Sal, Per · son: 22 Eyl"; gün seçilmemişse sıklık ("haftada 3"), o da
 * yoksa "gün seçilmedi". Haftalık sayı seçili gün sayısıdır, yoksa sıklık (`weekTarget` gibi).
 */
export function programLine(input: { days: number; weekdays: readonly number[]; daysPerWeek?: number | undefined }, lastDate?: string | undefined): string {
  const weekdays = weekdaysText(input.weekdays);
  const perWeek = weekdays ? normalizeWeekdays(input.weekdays).length : input.daysPerWeek;
  return [
    `${formatNumber(input.days)} gün`,
    ...(perWeek !== undefined ? [`haftada ${formatNumber(perWeek)}`] : []),
    ...(weekdays ? [weekdays] : perWeek === undefined ? ['gün seçilmedi'] : []),
    ...(lastDate ? [`son: ${formatDayShort(lastDate)}`] : []),
  ].join(' · ');
}

/** Bitmiş antrenmanların programa göre son günü: kendi programın kimliği, PT'nin programı `pt`. */
export function lastDateByProgram(index: Pick<SessionIndex, 'items'>): Map<string, string> {
  const last = new Map<string, string>();
  for (const row of index.items) {
    if (!row.finishedAt) continue;
    const key = row.programId ?? 'pt';
    const known = last.get(key);
    if (!known || row.date > known) last.set(key, row.date);
  }
  return last;
}

/** Günlerin son yapıldığı gün (gün kimlikleri bütün programlarda benzersiz). */
export function lastDateByDay(index: Pick<SessionIndex, 'items'>): Map<string, string> {
  const last = new Map<string, string>();
  for (const row of index.items) {
    if (!row.finishedAt || !row.dayId) continue;
    const known = last.get(row.dayId);
    if (!known || row.date > known) last.set(row.dayId, row.date);
  }
  return last;
}

/**
 * PT'nin programı kalıcı seçimden sonra oluşturuldu ya da kaydedildi mi (Bugün'deki "Antrenörün yeni bir program
 * hazırladı" satırı, Programlar'daki "Güncellendi" rozeti, §2.6): yalnız kalıcı seçim kendi programken.
 */
export function ptUpdatedSince(program: { createdAt: string; updatedAt: string } | null | undefined, active: { programId: string | null; at: string } | null | undefined): boolean {
  if (!program || !active?.programId) return false;
  const at = Date.parse(active.at);
  return Date.parse(program.createdAt) > at || Date.parse(program.updatedAt) > at;
}

/** Geçmiş kaydının etiketi, görene göre (§7.3). */
export function ownLogLabel(entry: { kind: LogKind; by?: 'pt' | undefined }, viewer: 'client' | 'pt'): string {
  switch (entry.kind) {
    case 'create':
      return viewer === 'client' ? 'Oluşturuldu' : 'Danışan oluşturdu';
    case 'edit':
      if (entry.by === 'pt') return viewer === 'client' ? 'Antrenörün düzenledi' : 'Düzenledin';
      return viewer === 'client' ? 'Düzenledin' : 'Danışan düzenledi';
    case 'client':
      return viewer === 'client' ? 'Antrenmandan' : 'Danışan güncelledi';
    case 'share':
      return 'Paylaşım';
    case 'phase':
      return 'Evre geçişi';
  }
}

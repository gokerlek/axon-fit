import { formatKg } from './format.ts';
import type { SessionDoc, SessionEntry, SessionSet } from './schemas/session.ts';
import { workingSetCount } from './session-index.ts';
import { canonicalJson } from './session-merge.ts';

/**
 * Antrenman commit mesajları (SPEC §7, tasarım §4.3, §4.5, §4.7) — saf. Danışan repo'sunun commit
 * geçmişi antrenman günlüğüdür: `Set 3/3 · Bench Press · 62,5 kg × 10`. Sağlık bilgisi (ağrı nedeni,
 * hazır oluşluk) hiçbir mesaja girmez. Silme mesajı geneldir ("Kayıt silindi"): hareket adı, tarih ve
 * değer yok (silinenin eski sürümleri git geçmişinde kalır; metin bunu dürüstçe söyler).
 */

export const DELETE_MESSAGE = 'Kayıt silindi';

function valueText(set: Pick<SessionSet, 'kg' | 'reps' | 'seconds'>): string {
  const load = set.kg !== undefined && set.kg > 0 ? formatKg(set.kg) : null;
  if (set.seconds !== undefined) return load ? `${load} × ${set.seconds} sn` : `${set.seconds} sn`;
  return load ? `${load} × ${set.reps ?? 0}` : `${set.reps ?? 0} tekrar`;
}

/** "Set 3/3 · Bench Press · 62,5 kg × 10"; ısınmada "Isınma · …", fazladan sette "Set 4 (fazladan) · …". */
export function setText(entry: Pick<SessionEntry, 'title' | 'sets' | 'plannedSets'>, set: SessionSet): string {
  if (set.type === 'warmup') return `Isınma · ${entry.title} · ${valueText(set)}`;
  const position = entry.sets.filter((item) => item.type === 'working').findIndex((item) => item.id === set.id);
  const number = (set.setIndex ?? Math.max(0, position)) + 1;
  const total = set.plannedSetCount ?? entry.plannedSets;
  const label = set.extra ? `Set ${number} (fazladan)` : total ? `Set ${number}/${total}` : `Set ${number}`;
  return `${label} · ${entry.title} · ${valueText(set)}`;
}

type Located = { entry: SessionEntry; set: SessionSet };

function setsOf(doc: SessionDoc | null): Map<string, Located> {
  const map = new Map<string, Located>();
  for (const entry of doc?.entries ?? []) for (const set of entry.sets) map.set(set.id, { entry, set });
  return map;
}

function latestOf(items: readonly Located[]): Located | undefined {
  return items.reduce<Located | undefined>((best, item) => (!best || Date.parse(item.set.at) >= Date.parse(best.set.at) ? item : best), undefined);
}

/**
 * Etkin antrenmanın yazımı. Yeni set varsa en sonuncusu (birden çoksa `(+n set)`: süperset turu ya da
 * çevrimdışı birikim tek yazmada birleşti); yalnız düzeltme varsa "… düzeltildi"; silme varsa değer
 * vermeden "kayıt silindi"; başka bir şey değiştiyse genel mesaj.
 */
export function putMessage(before: SessionDoc | null, after: SessionDoc): string {
  const old = setsOf(before);
  const now = setsOf(after);
  const added = [...now.values()].filter((item) => !old.has(item.set.id));
  const edited = [...now.values()].filter((item) => {
    const previous = old.get(item.set.id);
    return previous !== undefined && canonicalJson(previous.set) !== canonicalJson(item.set);
  });
  const deletions =
    after.deletedSetIds.length + after.deletedEntryIds.length > (before?.deletedSetIds.length ?? 0) + (before?.deletedEntryIds.length ?? 0);

  let text: string | null = null;
  const newest = latestOf(added);
  const changed = latestOf(edited);
  if (newest) text = `${setText(newest.entry, newest.set)}${added.length > 1 ? ` (+${added.length - 1} set)` : ''}`;
  else if (changed) text = `${setText(changed.entry, changed.set)} düzeltildi`;
  if (text) return deletions ? `${text} · kayıt silindi` : text;
  if (deletions) return DELETE_MESSAGE;
  if (!before) return after.program ? `Antrenman başladı · ${after.program.dayName}` : 'Antrenman başladı';
  return 'Antrenman güncellendi';
}

/** Bitiş: "Antrenman bitti · Gün A · 17 set". */
export function finishMessage(doc: SessionDoc): string {
  const day = doc.program ? ` · ${doc.program.dayName}` : '';
  return `Antrenman bitti${day} · ${workingSetCount(doc)} set`;
}

/** Bitmiş antrenmanın düzeltmesi: silme genel mesajla; set ekleme, zorluk, su kendi adıyla. */
export function patchMessage(before: SessionDoc, after: SessionDoc): string {
  const deletions =
    after.deletedSetIds.length + after.deletedEntryIds.length > before.deletedSetIds.length + before.deletedEntryIds.length;
  if (deletions) return DELETE_MESSAGE;
  const added = workingSetCount(after) - workingSetCount(before);
  if (added > 0) return `Set eklendi (+${added} set)`;
  if (canonicalJson(before.effort ?? null) !== canonicalJson(after.effort ?? null)) return 'Antrenman zorluğu kaydedildi';
  if (canonicalJson(before.waterTaps) !== canonicalJson(after.waterTaps)) return 'Su güncellendi';
  return 'Antrenman güncellendi';
}

import { canRecordHealth, healthConsentState } from './client-status.ts';
import { MEASUREMENTS, MEASUREMENT_IDS, type MeasurementId } from './measurements.ts';
import type { Client } from './schemas/client.ts';
import type { MeasurementEntry } from './schemas/health.ts';

/**
 * Periyodik ölçüm kaydının düzenlenmesi — `health.json`'daki `measurements` dizisi üzerinde
 * saf işlemler (sunucu ve tarayıcı ortak, SPEC §7.5).
 *
 * Kayıt düz bir listedir: her satır bir gün, bir ölçüm ve gerekiyorsa bir taraf. Bir günde
 * aynı ölçümün aynı tarafı bir kez bulunur; yeni değer eskisinin yerine geçer. Liste tarih,
 * katalog ve taraf sırasıyla tutulur ki git farkları okunaklı kalsın.
 */

export const SIDES = ['left', 'right'] as const;
export type Side = (typeof SIDES)[number];
export const SIDE_LABELS: Record<Side, string> = { left: 'Sol', right: 'Sağ' };

/** Bir günün tek değeri; tarih ayrı taşınır. */
export type MeasurementValue = { id: MeasurementId; value: number; side?: Side | undefined };

/* --- form alanları --- */

/** Formdaki alanın anahtarı: "waist_girth" ya da "calf_girth:left" (nokta içermez: hata yolu noktayla bölünür). */
export function slotKey(id: MeasurementId, side?: Side): string {
  return side ? `${id}:${side}` : id;
}

export function isSided(id: MeasurementId): boolean {
  const def = MEASUREMENTS[id];
  return 'sided' in def && def.sided === true;
}

export type MeasurementSlot = { key: string; id: MeasurementId; side?: Side };

/** Katalog sırasıyla bütün giriş alanları; iki taraflı ölçümde sol ve sağ ayrı alan. */
export const MEASUREMENT_SLOTS: readonly MeasurementSlot[] = MEASUREMENT_IDS.flatMap((id): MeasurementSlot[] =>
  isSided(id) ? SIDES.map((side) => ({ key: slotKey(id, side), id, side })) : [{ key: id, id }],
);

/** Anketler yüzde ya da 0–100 puan; diğerleri şemanın genel üst sınırı. */
export function valueMax(id: MeasurementId): number {
  return MEASUREMENTS[id].group === 'questionnaire' ? 100 : 1000;
}

/** Formdaki alanlardan yalnız doldurulanlar (boş alan kayda girmez). */
export function valuesFromSlots(slots: Readonly<Record<string, number | null | undefined>>): MeasurementValue[] {
  return MEASUREMENT_SLOTS.flatMap(({ key, id, side }) => {
    const value = slots[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    return [side ? { id, value, side } : { id, value }];
  });
}

/** Kayıttaki değerlerden form alanları (düzenleme sayfası). */
export function slotsFromValues(values: readonly Pick<MeasurementEntry, 'id' | 'value' | 'side'>[]): Record<string, number> {
  const slots: Record<string, number> = {};
  for (const { id, value, side } of values) slots[slotKey(id, side)] = value;
  return slots;
}

/**
 * Sunucu denetimi: taraf kuralı, aralık ve tekrar. Hatalar formdaki alan anahtarıyla döner
 * (sunucu `values.<anahtar>` olarak iletir, alanın altında görünür).
 */
export function checkValues(values: readonly MeasurementValue[]): { values: MeasurementValue[]; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  const clean: MeasurementValue[] = [];
  for (const { id, value, side } of values) {
    const key = slotKey(id, side);
    if (isSided(id) && !side) {
      errors[slotKey(id, 'left')] ??= 'Sol ya da sağ taraf belirtilmeli.';
      continue;
    }
    if (!isSided(id) && side) {
      errors[slotKey(id)] ??= 'Bu ölçüm tek değerdir; taraf yok.';
      continue;
    }
    if (seen.has(key)) {
      errors[key] ??= 'Aynı ölçüm iki kez girilmiş.';
      continue;
    }
    seen.add(key);
    if (!Number.isFinite(value) || value < 0) {
      errors[key] = 'Negatif olamaz.';
      continue;
    }
    if (value > valueMax(id)) {
      errors[key] = `En fazla ${valueMax(id)}.`;
      continue;
    }
    clean.push(side ? { id, value, side } : { id, value });
  }
  return { values: sortValues(clean), errors };
}

/* --- kayıt listesi --- */

function sideRank(side: Side | undefined): number {
  return side === 'left' ? 1 : side === 'right' ? 2 : 0;
}

function compareValues(a: MeasurementValue, b: MeasurementValue): number {
  return MEASUREMENT_IDS.indexOf(a.id) - MEASUREMENT_IDS.indexOf(b.id) || sideRank(a.side) - sideRank(b.side);
}

function sortValues<T extends MeasurementValue>(values: readonly T[]): T[] {
  return [...values].sort(compareValues);
}

/** Tarih, katalog ve taraf sırası. */
export function sortMeasurements(list: readonly MeasurementEntry[]): MeasurementEntry[] {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : compareValues(a, b)));
}

function toEntry(date: string, { id, value, side }: MeasurementValue): MeasurementEntry {
  return side ? { date, id, value, side } : { date, id, value };
}

const sameSlot = (a: MeasurementValue, b: MeasurementValue) => a.id === b.id && (a.side ?? null) === (b.side ?? null);

/** Güne ekler: aynı gün aynı ölçümün aynı tarafı varsa yenisi yerine geçer, diğerleri kalır. */
export function addMeasurements(list: readonly MeasurementEntry[], date: string, values: readonly MeasurementValue[]): MeasurementEntry[] {
  const kept = list.filter((entry) => entry.date !== date || !values.some((value) => sameSlot(entry, value)));
  return sortMeasurements([...kept, ...values.map((value) => toEntry(date, value))]);
}

/** Günün bütün değerlerini verilenlerle değiştirir (düzenlemede boşaltılan alan kayıttan çıkar). */
export function replaceMeasurements(list: readonly MeasurementEntry[], date: string, values: readonly MeasurementValue[]): MeasurementEntry[] {
  return sortMeasurements([...list.filter((entry) => entry.date !== date), ...values.map((value) => toEntry(date, value))]);
}

export function removeMeasurementDate(list: readonly MeasurementEntry[], date: string): MeasurementEntry[] {
  return list.filter((entry) => entry.date !== date);
}

export function measurementsOn(list: readonly MeasurementEntry[], date: string): MeasurementEntry[] {
  return sortMeasurements(list.filter((entry) => entry.date === date));
}

export type MeasurementDay = { date: string; ids: MeasurementId[]; count: number };

/** Ölçüm günleri, en yenisi önce; her günde hangi ölçümler var (katalog sırasıyla). */
export function measurementDays(list: readonly MeasurementEntry[]): MeasurementDay[] {
  const days = new Map<string, MeasurementEntry[]>();
  for (const entry of list) days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, entries]) => ({
      date,
      ids: MEASUREMENT_IDS.filter((id) => entries.some((entry) => entry.id === id)),
      count: entries.length,
    }));
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-09-01" gerçek bir takvim günü mü (30 Şubat değil). */
export function isCalendarDate(value: string): boolean {
  const match = value.match(CALENDAR_DATE);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/* --- kayıt izni --- */

/** Ölçüm neden yazılamıyor; yazılabiliyorsa null. */
export type MeasurementLock = 'off' | 'not_selected' | 'pending' | 'declined' | 'outdated';

/**
 * Ölçüm yalnız sağlık modülü açık, "Ölçümler" parçası seçili ve danışanın güncel onayı onu
 * kapsıyorsa yazılır (`canRecordHealth`, SPEC §4). Sunucu her yazmada bunu yeniden denetler.
 */
export function measurementLock(client: Pick<Client, 'modules' | 'consents'>): MeasurementLock | null {
  if (canRecordHealth(client, 'measurements')) return null;
  const state = healthConsentState(client);
  if (state === 'off') return 'off';
  if (!client.modules.health.fields.includes('measurements')) return 'not_selected';
  // `granted` burada olamaz (parça seçili ve onaylıysa yazılabilirdi); yine de kilitli say.
  return state === 'granted' ? 'outdated' : state;
}

export const MEASUREMENT_LOCK_INFO: Record<MeasurementLock, { title: string; description: string }> = {
  off: {
    title: 'Sağlık modülü kapalı',
    description:
      'Ölçümler sağlık verisidir; modül kapalıyken kayıt tutulmaz. Danışanın düzenleme sayfasında sağlık modülünü açıp “Ölçümler”i seç; danışan bir sonraki girişinde onaylayınca ölçüm girebilirsin.',
  },
  not_selected: {
    title: 'Ölçümler seçili değil',
    description:
      'Sağlık modülü açık ama “Ölçümler” parçası seçili değil. Danışanın düzenleme sayfasında seç; danışan bir sonraki girişinde yeni kapsamı onaylayınca ölçüm girebilirsin.',
  },
  pending: {
    title: 'Danışanın onayı bekleniyor',
    description:
      'Danışan ilk girişinde neyin tutulacağını görüp onaylayacak. Onaylayana kadar ölçüm kaydedilmez ve eski kayıtlar gösterilmez.',
  },
  declined: {
    title: 'Danışan onay vermedi',
    description:
      'Danışan sağlık verisi tutulmasına onay vermedi; ölçüm kaydedilmez ve eski kayıtlar gösterilmez. Fikrini değiştirirse kendi ekranından onay verebilir.',
  },
  outdated: {
    title: 'Onay yenilenecek',
    description:
      'Danışanın onayı güncel parçaları ya da metni kapsamıyor; bir sonraki girişinde yeniden sorulacak. O zamana kadar ölçüm kaydedilmez ve eski kayıtlar gösterilmez.',
  },
};

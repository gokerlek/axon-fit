import * as v from 'valibot';

/**
 * PT'nin kayıt dosyaları (`data/exercises.json`, `data/devices.json`,
 * `data/attachments.json`) öğe öğe okunur.
 *
 * Şemaya uymayan tek kayıt bütün dosyayı düşürmez: geçerli öğeler kullanılır,
 * okunamayanlar ham hâliyle saklanır ve her yazmada olduğu gibi listenin sonuna geri
 * yazılır. Düzeltilene kadar listede görünmez ama hiçbir kayıtta kaybolmaz.
 *
 * Aynı kimlik dosyada birden çok kez geçerse (elle çoğaltılmış ya da eski bir hatanın
 * bıraktığı kayıt) ilk geçerli öğe kullanılır; sonrakiler okunamayan sayılır ve ham
 * hâliyle korunur. Aynı kimlikte okunamayan bir öğe varken o kimliğe yazılmaz
 * (`hasUnreadable`): yazılsaydı, dosya düzeltilince aynı kimlikte iki kayıt olurdu.
 *
 * Saf; yol takma adıyla çalışma zamanı içe aktarması yok (testler Node'un test aracıyla çalışır).
 */

export type StoredList<T> = {
  /** Şemadan geçen öğeler: dosyadaki sırayla, okurken yapılan çevirilerle; kimlikler tekil. */
  items: T[];
  /** Okunamayan öğeler (ve aynı kimliğin ikinci kayıtları), dosyadaki ham hâliyle. */
  unreadable: unknown[];
};

function idOf(entry: unknown): string | undefined {
  const id = entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined;
  return typeof id === 'string' ? id : undefined;
}

/** Dosya içeriğini öğe öğe doğrular. İçerik bir liste değilse `null`: dosya bozuk, üzerine yazılmamalı. */
export function parseStoredList<TItem extends v.GenericSchema>(
  schema: v.ArraySchema<TItem, v.ErrorMessage<v.ArrayIssue> | undefined>,
  content: unknown,
): StoredList<v.InferOutput<TItem>> | null {
  if (!Array.isArray(content)) return null;
  const items: v.InferOutput<TItem>[] = [];
  const unreadable: unknown[] = [];
  const seen = new Set<string>();
  for (const entry of content) {
    const parsed = v.safeParse(schema.item, entry);
    const id = parsed.success ? idOf(parsed.output) : undefined;
    if (parsed.success && (id === undefined || !seen.has(id))) {
      if (id !== undefined) seen.add(id);
      items.push(parsed.output);
    } else {
      unreadable.push(entry);
    }
  }
  return { items, unreadable };
}

/** Yazılacak içerik: kayıtlar, ardından okunamayan öğeler olduğu gibi. */
export function storedListContent<T>(items: readonly T[], unreadable: readonly unknown[]): unknown[] {
  return [...items, ...unreadable];
}

/** Dosyadaki kimlikler, okunamayan öğelerinki de: yeni kayıt bunlardan birini almasın. */
export function storedIds(list: StoredList<{ id: string }>): string[] {
  return [...list.items.map((item) => item.id), ...list.unreadable.flatMap((entry) => idOf(entry) ?? [])];
}

/** Bu kimliği taşıyan okunamayan öğe var mı (şemaya uymayan kayıt ya da aynı kimliğin ikinci kaydı). */
export function hasUnreadable(list: Pick<StoredList<unknown>, 'unreadable'>, id: string): boolean {
  return list.unreadable.some((entry) => idOf(entry) === id);
}

/** Okunamayan kaydın kimliğine yazma durur (409); PT dosyayı düzeltir. */
export function brokenRecordMessage(path: string): string {
  return `Bu kayıt dosyada bozuk; önce ${path} içinde düzelt.`;
}

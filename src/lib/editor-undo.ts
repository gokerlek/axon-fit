import { locateDay, type ProgramPhase } from './program-plan.ts';

/**
 * Hareket düzenleyicinin "Geri al"ı (8 sn toast). Geri alma işlemden sonra gelir: o arada
 * program gününün yeri değişmiş olabilir (gün sola/sağa ya da başka evreye taşındı, araya gün
 * girdi), bu yüzden yazılacak yer işlem anında değil geri alma anında bulunur. Saf; yol takma
 * adıyla çalışma zamanı içe aktarması yapmaz (testler Node'un kendi test aracıyla çalışır).
 */

/** Program gününün bloklarının formdaki yolu, gün kimliğiyle; gün yoksa `null`. */
export function dayBlocksPath(phases: readonly ProgramPhase[], dayId: string): readonly ['phases', number, 'days', number, 'blocks'] | null {
  const found = locateDay(phases, dayId);
  return found ? ['phases', found.phaseIndex, 'days', found.dayIndex, 'blocks'] : null;
}

/**
 * Geri almanın karşılaştırma biçimi: JSON, boş metin alanları yok sayılarak. İsteğe bağlı metin
 * alanında boş metin ile alanın olmaması aynı hâldir: program formu her yazımda notsuz satıra
 * `note: ''` yazar (`toInput`; şablon formu da açılışta), düzenleyici ise notsuz satır üretir.
 * `undefined` alanları JSON zaten yazmaz; Formisch nesneleri şema sırasıyla kurduğu için anahtar
 * sırası da aynıdır.
 */
function snapshot(value: unknown): string {
  return JSON.stringify(value, function (this: unknown, _key: string, field: unknown) {
    return field === '' && !Array.isArray(this) ? undefined : field;
  });
}

/**
 * Geri alır: yer (`locate`, geri alma anında) bulunur ve işlemden hemen sonraki hâl (`after`,
 * yazımdan sonra formdan okunan) orada duruyorsa önceki hâl (`before`) yazılır. Karşılaştırma boş
 * metin alanlarını yok sayar (`snapshot`). Yer yoksa ya da sonrasında değiştiyse hiçbir şey
 * yazılmaz (`false`): sonraki düzenlemeler silinmesin, başka güne yazılmasın.
 */
export function undoAt<P, T>(
  locate: () => P | null,
  read: (at: P) => T,
  write: (at: P, value: T) => void,
  before: T,
  after: T,
): boolean {
  const at = locate();
  if (at === null || snapshot(read(at)) !== snapshot(after)) return false;
  write(at, before);
  return true;
}

import type { JoiningOutcome } from './drop-target.ts';
import type { AddToGroupOutcome, CombineOutcome, GroupCheck } from './template-edit.ts';
import { setsText, type SetSpec } from './set-plan.ts';
import { BLOCK_KIND_LABELS, type TemplateBlock } from './template-plan.ts';
import type { TrackingType } from './progression.ts';

/**
 * Düzenleyicinin duyuru ve toast cümleleri (canlı bölge, "Geri al" bildirimleri): taşıma,
 * üstüne bırakıp gruplama, klavyeyle taşımada uç, seçim modunun durum satırı ve toplu
 * işlemleri, cihaz değişimi, "Gruba hareket ekle" sheet'i; kartların meta satırları (şablon
 * detayı ve programın PT görünümüyle ortak). Saf; yol takma adıyla çalışma zamanı içe
 * aktarması yapmaz (testler Node'un kendi test aracıyla çalışır).
 */

/** Satırın adı (egzersizin adı ya da "Silinmiş egzersiz"). */
export type TitleOf = (exerciseId: string) => string;

/** Öğenin yeri: üst düzeyde sırası, ya da grubun içinde sırası. */
type Place = { level: 'top'; index: number } | { level: 'group'; block: TemplateBlock; blockIndex: number; index: number };

function placeOf(blocks: readonly TemplateBlock[], itemId: string): Place | null {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.id === itemId) return { level: 'top', index: blockIndex };
    const index = block.rows.findIndex((row) => row.id === itemId);
    if (index === -1) continue;
    return block.kind === 'single' ? { level: 'top', index: blockIndex } : { level: 'group', block, blockIndex, index };
  }
  return null;
}

/** Grubun adı: türü ve sırası ("Süperset 2"). */
function groupName(block: TemplateBlock, blockIndex: number): string {
  return `${BLOCK_KIND_LABELS[block.kind]} ${blockIndex + 1}`;
}

/** Taşınan grubun anlatımı: "Süperset (Bench Press + Cable Row)", uzun grupta ilk ikisi ve "…". */
function groupDescription(block: TemplateBlock, titleOf: TitleOf): string {
  const titles = block.rows.map((row) => titleOf(row.exerciseId));
  return `${BLOCK_KIND_LABELS[block.kind]} (${titles.slice(0, 2).join(' + ')}${titles.length > 2 ? ' + …' : ''})`;
}

/** Öğenin adı: satırda hareketin, grupta grubun adı. */
export function titleOfItem(blocks: readonly TemplateBlock[], itemId: string, titleOf: TitleOf): string {
  for (const [blockIndex, block] of blocks.entries()) {
    const only = block.rows[0];
    if (block.id === itemId) return block.kind === 'single' && only ? titleOf(only.exerciseId) : groupName(block, blockIndex);
    const row = block.rows.find((item) => item.id === itemId);
    if (row) return titleOf(row.exerciseId);
  }
  return '';
}

/**
 * Taşımanın cümlesi (`before` → `after`): "Bench Press 3. sıraya taşındı", "Cable Row grupta
 * 1. sıraya taşındı", "Cable Row gruptan çıktı · 4. sırada", "Squat gruba katıldı (Devre 2)",
 * tür değiştiyse "Squat gruba katıldı · grup devre oldu".
 */
export function moveMessage(before: readonly TemplateBlock[], after: readonly TemplateBlock[], itemId: string, titleOf: TitleOf): string {
  const group = after.find((block) => block.id === itemId && block.kind !== 'single');
  const title = group ? groupDescription(group, titleOf) : titleOfItem(after, itemId, titleOf);
  const from = placeOf(before, itemId);
  const to = placeOf(after, itemId);
  if (!to) return '';
  if (to.level === 'top') {
    return from?.level === 'group' ? `${title} gruptan çıktı · ${to.index + 1}. sırada` : `${title} ${to.index + 1}. sıraya taşındı`;
  }
  if (from?.level === 'group' && from.block.id === to.block.id) return `${title} grupta ${to.index + 1}. sıraya taşındı`;
  const previousKind = before.find((block) => block.id === to.block.id)?.kind;
  if (previousKind && previousKind !== to.block.kind) {
    return `${title} gruba katıldı · grup ${BLOCK_KIND_LABELS[to.block.kind].toLocaleLowerCase('tr-TR')} oldu`;
  }
  return `${title} gruba katıldı (${groupName(to.block, to.blockIndex)})`;
}

/**
 * Üstüne bırakıp gruplamanın cümlesi (toast ve duyuru; `before` → `after`): "Süperset yapıldı:
 * Squat + Bench Press", "Süperset devreye dönüştü", "Cable Row gruba eklendi (Devre 2)". Grubun
 * sırası birleşmeden sonraki listeden: üstündeki tek hareket gruba girince grup bir sıra yukarı kayar.
 */
export function combineMessage(
  before: readonly TemplateBlock[],
  after: readonly TemplateBlock[],
  sourceId: string,
  targetId: string,
  outcome: JoiningOutcome,
  titleOf: TitleOf,
): string {
  const source = titleOfItem(before, sourceId, titleOf);
  if (outcome === 'superset') return `Süperset yapıldı: ${titleOfItem(before, targetId, titleOf)} + ${source}`;
  const holdsTarget = (block: TemplateBlock) => block.id === targetId || block.rows.some((row) => row.id === targetId);
  const group = before.find(holdsTarget);
  if (!group) return '';
  if (outcome === 'becomes_circuit') return `${BLOCK_KIND_LABELS[group.kind]} devreye dönüştü`;
  const blockIndex = after.findIndex(holdsTarget);
  const joined = after[blockIndex];
  return joined ? `${source} gruba eklendi (${groupName(joined, blockIndex)})` : '';
}

/** Klavyeyle taşımada öğe zaten uçta: "Squat zaten ilk sırada", üyede "grupta zaten son sırada". */
export function edgeMessage(blocks: readonly TemplateBlock[], itemId: string, towardsStart: boolean, titleOf: TitleOf): string {
  const title = titleOfItem(blocks, itemId, titleOf);
  const where = placeOf(blocks, itemId)?.level === 'group' ? 'grupta zaten' : 'zaten';
  return `${title} ${where} ${towardsStart ? 'ilk' : 'son'} sırada`;
}

/** Seçili blokların hareket sayısı (gruplardaki üyeler dahil; toast'lardaki sayı). */
export function selectedRowCount(blocks: readonly TemplateBlock[], blockIds: ReadonlySet<string>): number {
  return blocks.reduce((sum, block) => sum + (blockIds.has(block.id) ? block.rows.length : 0), 0);
}

/**
 * Seçim çubuğunun durum satırı: kaç kart seçili ve "Grupla" ne yapar ya da neden pasif;
 * kopya sığmıyorsa sonuna eklenir ("Kopyala" pasif). Pasif düğmenin nedeni burada yazar. Hiç
 * seçim yokken seçimin ne işe yaradığını da söyler ("2 hareket seç, süperset olsun").
 */
export function selectionStatus(count: number, check: GroupCheck, pointer: 'touch' | 'mouse' = 'touch'): string {
  if (count === 0) return `Seçmek için kartlara ${pointer === 'touch' ? 'dokun' : 'tıkla'} · 2 hareket seç, süperset olsun`;
  return check === 'superset'
    ? `${count} seçili · süperset olur`
    : check === 'circuit'
      ? `${count} seçili · devre olur`
      : check === 'not_singles'
        ? 'Grup seçili: yalnız tek hareketler gruplanır'
        : check === 'too_many'
          ? `${count} seçili · grup en çok 8 hareket`
          : `${count} seçili · gruplamak için en az 2 hareket`;
}

/** "Grupla" sonrası (toast ve duyuru): "Süperset yapıldı: Squat + Bench Press", "Devre yapıldı (4 hareket)". */
export function groupedMessage(
  blocks: readonly TemplateBlock[],
  blockIds: ReadonlySet<string>,
  kind: 'superset' | 'circuit',
  titleOf: TitleOf,
): string {
  const titles = blocks.filter((block) => blockIds.has(block.id)).flatMap((block) => block.rows.map((row) => titleOf(row.exerciseId)));
  return kind === 'superset' ? `Süperset yapıldı: ${titles.join(' + ')}` : `Devre yapıldı (${titles.length} hareket)`;
}

/** Toplu kopya ve silmenin cümlesi: "3 hareket kopyalandı", "1 hareket silindi". */
export function bulkMessage(rows: number, action: 'copied' | 'removed'): string {
  return `${rows} hareket ${action === 'copied' ? 'kopyalandı' : 'silindi'}`;
}

/** Sayıya gelen yönelme eki ("2'ye", "6'ya", "3'e", "10'a"): son okunan sözcüğün ünlüsüne göre. */
export function dativeOf(value: number): string {
  const n = Math.abs(Math.trunc(value));
  const units = ["'a", "'e", "'ye", "'e", "'e", "'e", "'ya", "'ye", "'e", "'a"];
  const tens = ["'a", "'a", "'ye", "'a", "'a", "'ye", "'a", "'e", "'e", "'a"];
  if (n === 0) return `${n}'a`;
  if (n % 100 === 0) return `${n}'e`;
  const unit = n % 10;
  return `${n}${unit === 0 ? tens[Math.floor(n / 10) % 10] : units[unit]}`;
}

/** "Gruba hareket ekle" sheet'inin başlığı: "Süperset 2'ye ekle". */
export function addToGroupTitle(kind: TemplateBlock['kind'], blockIndex: number): string {
  return `${BLOCK_KIND_LABELS[kind]} ${dativeOf(blockIndex + 1)} ekle`;
}

/**
 * Cihaz değişiminin cümlesi (toast ve duyuru; "Geri al"lı). Biçim cihaz seçicisinin seçenekleriyle
 * aynı ("Kablo istasyonu 2 → Seated Row"):
 * - hareket de değişti: "Kablo istasyonu 2 → Seated Row (Lat Pulldown yerine)"
 * - aynı hareket başka cihazda: "Bench Press · cihaz: Smith makinesi"
 * - egzersizin cihazına dönüldü: "Bench Press · egzersizin cihazı: Olimpik bar", cihazı yoksa "Bench Press · cihazsız"
 */
export type DeviceChange =
  | { kind: 'swapped'; device: string; from: string; to: string }
  | { kind: 'device'; device: string; title: string }
  | { kind: 'reset'; device: string | null; title: string };

export function deviceChangeMessage(change: DeviceChange): string {
  switch (change.kind) {
    case 'swapped':
      return `${change.device} → ${change.to} (${change.from} yerine)`;
    case 'device':
      return `${change.title} · cihaz: ${change.device}`;
    case 'reset':
      return change.device ? `${change.title} · egzersizin cihazı: ${change.device}` : `${change.title} · cihazsız`;
  }
}

/** "Üstüne bırak"ın sonuç hapı (hedefte ve sürüklenen kartın üstünde). */
export const DROP_OUTCOME_LABELS: Record<Exclude<CombineOutcome, 'not_allowed'>, string> = {
  superset: 'Süperset yap',
  becomes_circuit: 'Ekle · devre olur',
  join: 'Gruba ekle',
  full: 'Grup dolu (8)',
};

/**
 * "Üstüne bırak" devredeyken sürüklenen kartın üstündeki etiket: sonuç ve hedef ("Süperset yap:
 * Squat", "Ekle · devre olur: Süperset 2", "Gruba ekle: Devre 3"). Hedef bir grubun üyesi ya da yüzüyse
 * grubun adı yazılır (bırakılan gruba katılır). Dolu grupta yalnız "Grup dolu (8)"; olmayan birleştirmede
 * ve bilinmeyen hedefte `null`.
 */
export function dropTargetLabel(blocks: readonly TemplateBlock[], targetId: string, outcome: CombineOutcome, titleOf: TitleOf): string | null {
  if (outcome === 'not_allowed') return null;
  if (outcome === 'full') return DROP_OUTCOME_LABELS.full;
  for (const [blockIndex, block] of blocks.entries()) {
    const only = block.rows[0];
    if (block.kind === 'single' && only?.id === targetId) return `${DROP_OUTCOME_LABELS[outcome]}: ${titleOf(only.exerciseId)}`;
    if (block.kind !== 'single' && (block.id === targetId || block.rows.some((row) => row.id === targetId))) {
      return `${DROP_OUTCOME_LABELS[outcome]}: ${groupName(block, blockIndex)}`;
    }
  }
  return null;
}

/** Dinlenme: saniyeyle (stepper'daki gibi), yoksa "dinlenme yok"; bozuk girdide "? sn". */
function restText(seconds: number): string {
  if (!Number.isFinite(seconds)) return '? sn';
  return seconds > 0 ? `${seconds} sn` : 'dinlenme yok';
}

/**
 * Hareketin setleri ve dinlenmesi, tek biçim (düzenleyicinin meta satırı, şablon detayı, programın PT
 * görünümü): `setsText` + dinlenme. "3×8–12 · 90 sn", "12/10/8+ (piramit %80/%90/%100) · 90 sn",
 * "3×30 sn · dinlenme yok"; grup üyesinde dinlenme grupta, yalnız setler (`restSeconds` verilmez).
 */
export function rowWorkText(sets: readonly SetSpec[], trackingType: TrackingType, restSeconds?: number): string {
  const line = setsText(sets, trackingType);
  return restSeconds === undefined ? line : `${line} · ${restText(restSeconds)}`;
}

/**
 * Grubun özeti, tek biçim (düzenleyicide grubun yüzü, şablon detayı, programın PT görünümü):
 * "2 hareket · 3 tur · 90 sn tur sonu", devrede " · istasyon 15 sn".
 */
export function groupWorkText(block: Pick<TemplateBlock, 'kind' | 'restSeconds' | 'transitionSeconds'> & { rows: readonly unknown[] }, rounds: number): string {
  const rest = Number.isFinite(block.restSeconds) && block.restSeconds <= 0 ? 'tur sonu dinlenme yok' : `${restText(block.restSeconds)} tur sonu`;
  const station =
    block.kind === 'circuit' && block.transitionSeconds !== undefined
      ? ` · istasyon ${Number.isFinite(block.transitionSeconds) ? `${block.transitionSeconds} sn` : '? sn'}`
      : '';
  return `${block.rows.length} hareket · ${rounds} tur · ${rest}${station}`;
}

/** Kütüphane sheet'i sona eklerken şablon dolu: liste pasif, neden durum satırında (`sheetStatus`). */
export const SHEET_FULL_MESSAGE = 'Şablon dolu: en fazla 40 hareket ve 30 blok olur.';

/**
 * "Gruba hareket ekle" sheet'inin durum satırı, eklemeden önce: dolu grupta ve dolu
 * şablonda liste pasif, süpersette ya da 6'lı komplekste "Eklenirse devre olur".
 */
export function addToGroupHint(outcome: AddToGroupOutcome): { blocked: string | null; hint: string } {
  if (outcome === 'full') return { blocked: 'Grup dolu (8)', hint: '' };
  if (outcome === 'limit') return { blocked: 'Şablon dolu: en fazla 40 hareket, 30 blok', hint: '' };
  if (outcome === 'not_allowed') return { blocked: 'Bu grup artık yok', hint: '' };
  return { blocked: null, hint: outcome === 'becomes_circuit' ? 'Eklenirse devre olur' : '' };
}

/** Gruba eklendikten sonra: "Cable Row eklendi", tür değiştiyse "Cable Row eklendi · grup devre oldu". */
export function addedToGroupMessage(title: string, before: TemplateBlock['kind'], after: TemplateBlock['kind']): string {
  return before === after ? `${title} eklendi` : `${title} eklendi · grup ${BLOCK_KIND_LABELS[after].toLocaleLowerCase('tr-TR')} oldu`;
}

/**
 * Kütüphane sheet'inin durum satırı: eklenemiyorsa nedeni (liste pasif; neden yalnız burada
 * yazar, az önceki onayın arkasında), yoksa son onay ya da eklemeden önceki ipucu.
 */
export function sheetStatus(blocked: string | null, status: string, hint: string): string {
  if (blocked) return status ? `${status} · ${blocked}` : blocked;
  return status || hint;
}

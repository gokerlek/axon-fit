import type { JoiningOutcome } from './drop-target.ts';
import type { AddToGroupOutcome, GroupCheck } from './template-edit.ts';
import { BLOCK_KIND_LABELS, type TemplateBlock } from './template-plan.ts';

/**
 * Düzenleyicinin duyuru ve toast cümleleri (canlı bölge, "Geri al" bildirimleri): taşıma,
 * üstüne bırakıp gruplama, klavyeyle taşımada uç, seçim modunun durum satırı ve toplu
 * işlemleri, "Gruba hareket ekle" sheet'i. Saf; yol takma adıyla çalışma zamanı içe
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
 * Üstüne bırakıp gruplamanın cümlesi (toast ve duyuru; önce hesaplanır): "Süperset yapıldı:
 * Squat + Bench Press", "Süperset devreye dönüştü", "Cable Row gruba eklendi (Devre 2)".
 */
export function combineMessage(
  before: readonly TemplateBlock[],
  sourceId: string,
  targetId: string,
  outcome: JoiningOutcome,
  titleOf: TitleOf,
): string {
  const source = titleOfItem(before, sourceId, titleOf);
  if (outcome === 'superset') return `Süperset yapıldı: ${titleOfItem(before, targetId, titleOf)} + ${source}`;
  const blockIndex = before.findIndex((block) => block.id === targetId || block.rows.some((row) => row.id === targetId));
  const group = before[blockIndex];
  if (!group) return '';
  if (outcome === 'becomes_circuit') return `${BLOCK_KIND_LABELS[group.kind]} devreye dönüştü`;
  return `${source} gruba eklendi (${groupName(group, blockIndex)})`;
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
 * kopya sığmıyorsa sonuna eklenir ("Kopyala" pasif). Pasif düğmenin nedeni burada yazar.
 */
export function selectionStatus(count: number, check: GroupCheck, copyFits: boolean, pointer: 'touch' | 'mouse' = 'touch'): string {
  if (count === 0) return `Seçmek için kartlara ${pointer === 'touch' ? 'dokun' : 'tıkla'}`;
  const group =
    check === 'superset'
      ? `${count} seçili · süperset olur`
      : check === 'circuit'
        ? `${count} seçili · devre olur`
        : check === 'not_singles'
          ? 'Grup seçili: yalnız tek hareketler gruplanır'
          : check === 'too_many'
            ? `${count} seçili · grup en çok 8 hareket`
            : `${count} seçili · gruplamak için en az 2 hareket`;
  return copyFits ? group : `${group} · Şablon dolu: kopya sığmaz`;
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

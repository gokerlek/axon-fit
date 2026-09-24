import type { JoiningOutcome } from './drop-target.ts';
import { BLOCK_KIND_LABELS, type TemplateBlock } from './template-plan.ts';

/**
 * Düzenleyicinin duyuru ve toast cümleleri (canlı bölge, "Geri al" bildirimleri): taşıma,
 * üstüne bırakıp gruplama, klavyeyle taşımada uç. Saf; yol takma adıyla çalışma zamanı içe
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

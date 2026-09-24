import { combineOutcome, moveCheck, type CombineOutcome, type MoveDestination } from './template-edit.ts';
import type { TemplateBlock } from './template-plan.ts';

/**
 * Sürükle-bırakta işaretçinin altındaki yer (düzenleyicinin dnd-kit çarpışma algılaması).
 *
 * Sürüklerken kartlar yerinde durur: liste sürükleme başında bir kez ölçülür (sayfa
 * koordinatında; otomatik kaydırma yalnız işaretçinin sayfadaki yerini değiştirir). Her kart
 * (üstteki çizgi şeridi dahil) üç banda ayrılır: üst %25 önüne, alt %25 arkasına, orta %50
 * "üstüne bırak" (gruplama). Ortadaki hedef ancak işaretçi orada 250 ms bekleyince
 * birleştirir; o zamana kadar en yakın boşluk gösterilir, hızlı geçişte grup oluşmaz.
 *
 * Saf; yol takma adıyla çalışma zamanı içe aktarması yapmaz (testler Node'un kendi test
 * aracıyla çalışır).
 */

/** Dikey aralık (sayfa koordinatı, px). */
export type Span = { top: number; bottom: number };

/** Listenin bir bloğu: tek hareket ya da grup (grubun yüzü ve üyeleri ayrı ölçülür). */
export type DropBlock = {
  id: string;
  span: Span;
  /** Yalnız grupta: grubun çizgisi + yüzü (açıksa ayarlarıyla). */
  face?: Span;
  /** Yalnız grupta: üyeler sırayla (her biri kendi çizgisiyle). */
  members?: readonly { id: string; span: Span }[];
};

export type DropLayout = {
  /** Listenin kutusu: dışına (payıyla) bırakılan sürükleme iptal olur. */
  list: { top: number; bottom: number; left: number; right: number };
  blocks: readonly DropBlock[];
};

export type Point = { x: number; y: number };

/**
 * İşaretçinin altındaki yer (kurallar uygulanmadan):
 * - `outside`: listenin dışında (bırakırsa iptal).
 * - `gap`: iki kart arası, ya da kartın üst/alt bandı.
 * - `middle`: bir kartın orta bandı; `nearest` beklerken gösterilen boşluk.
 */
export type DropHit =
  | { type: 'outside' }
  | { type: 'gap'; destination: MoveDestination }
  | { type: 'middle'; targetId: string; nearest: MoveDestination };

/** Kartın üst ve alt bandı (yüksekliğin oranı); ortası birleştirme. */
export const EDGE_BAND = 0.25;
/** Listenin dışı sayılmadan önceki pay (px): kenardan biraz taşan parmak iptal etmesin. */
export const OUTSIDE_MARGIN = { x: 32, y: 48 } as const;

const top = (index: number): MoveDestination => ({ at: 'top', index });
const inGroup = (blockId: string, index: number): MoveDestination => ({ at: 'group', blockId, index });

/** Bandı: -1 üst, 0 orta, 1 alt. Yüksekliği olmayan aralıkta orta sayılmaz. */
function band(span: Span, y: number): -1 | 0 | 1 {
  const height = span.bottom - span.top;
  if (height <= 0) return y < span.top ? -1 : 1;
  const ratio = (y - span.top) / height;
  if (ratio < EDGE_BAND) return -1;
  if (ratio > 1 - EDGE_BAND) return 1;
  return 0;
}

function upperHalf(span: Span, y: number): boolean {
  return y < (span.top + span.bottom) / 2;
}

/**
 * İşaretçinin altındaki yer. `wholeGroup`: sürüklenen bir grup; yalnız üst düzey
 * boşluklar olur (grup gruba girmez, birleştirme bandı yok).
 */
export function hitTest(layout: DropLayout, point: Point, wholeGroup: boolean): DropHit {
  const { list, blocks } = layout;
  if (
    point.x < list.left - OUTSIDE_MARGIN.x ||
    point.x > list.right + OUTSIDE_MARGIN.x ||
    point.y < list.top - OUTSIDE_MARGIN.y ||
    point.y > list.bottom + OUTSIDE_MARGIN.y
  ) {
    return { type: 'outside' };
  }
  const y = point.y;
  const index = blocks.findIndex((block) => y <= block.span.bottom);
  const block = blocks[index];
  // Son kartın altı ya da iki kart arası (kartın üstünden önce).
  if (!block) return { type: 'gap', destination: top(blocks.length) };
  if (y < block.span.top) return { type: 'gap', destination: top(index) };

  if (wholeGroup) return { type: 'gap', destination: top(upperHalf(block.span, y) ? index : index + 1) };

  const { face, members } = block;
  if (!face || !members || members.length === 0) {
    const where = band(block.span, y);
    if (where === -1) return { type: 'gap', destination: top(index) };
    if (where === 1) return { type: 'gap', destination: top(index + 1) };
    return { type: 'middle', targetId: block.id, nearest: top(upperHalf(block.span, y) ? index : index + 1) };
  }

  // Grup: yüz (üst bandı grubun önü, alt bandı ilk üyenin önü), üyeler, grubun altı.
  if (y < face.top) return { type: 'gap', destination: top(index) };
  if (y <= face.bottom) {
    const where = band(face, y);
    if (where === -1) return { type: 'gap', destination: top(index) };
    if (where === 1) return { type: 'gap', destination: inGroup(block.id, 0) };
    return { type: 'middle', targetId: block.id, nearest: upperHalf(face, y) ? top(index) : inGroup(block.id, 0) };
  }
  const memberIndex = members.findIndex((member) => y <= member.span.bottom);
  const member = members[memberIndex];
  if (!member) return { type: 'gap', destination: top(index + 1) };
  if (y < member.span.top) return { type: 'gap', destination: inGroup(block.id, memberIndex) };
  const where = band(member.span, y);
  if (where === -1) return { type: 'gap', destination: inGroup(block.id, memberIndex) };
  if (where === 1) return { type: 'gap', destination: inGroup(block.id, memberIndex + 1) };
  return {
    type: 'middle',
    targetId: member.id,
    nearest: inGroup(block.id, upperHalf(member.span, y) ? memberIndex : memberIndex + 1),
  };
}

/** Birleştiren sonuçlar (hap: "Süperset yap", "Ekle · devre olur", "Gruba ekle"). */
export type JoiningOutcome = Extract<CombineOutcome, 'superset' | 'becomes_circuit' | 'join'>;

export function isJoining(outcome: CombineOutcome): outcome is JoiningOutcome {
  return outcome === 'superset' || outcome === 'becomes_circuit' || outcome === 'join';
}

/**
 * Yerin kurallarla sonucu (bırakmadan önce):
 * - `line`: ekleme çizgisinin gösterdiği ve bırakınca uygulanacak boşluk (`moveCheck` `ok`);
 *   öğe yerinde kalacaksa (`same`) ya da olmuyorsa çizgi yok.
 * - `candidate`: orta banttaki hedef ve sonucu (`combineOutcome`); `not_allowed` ise yok.
 *   `full` hedef soluk "Grup dolu (8)" hapını alır ama birleştirmez.
 * - `refusal`: çizginin olmama nedeni duyurulacaksa: `limit` (30 blok) ya da `full` (8 hareket).
 */
export type DropResolution = {
  line: MoveDestination | null;
  candidate: { targetId: string; outcome: CombineOutcome } | null;
  refusal: 'limit' | 'full' | null;
};

const NOTHING: DropResolution = { line: null, candidate: null, refusal: null };

export function resolveHit(blocks: readonly TemplateBlock[], sourceId: string, hit: DropHit): DropResolution {
  if (hit.type === 'outside') return NOTHING;
  const destination = hit.type === 'gap' ? hit.destination : hit.nearest;
  const check = moveCheck(blocks, sourceId, destination);
  const line = check === 'ok' ? destination : null;
  const refusal = check === 'limit' || check === 'full' ? check : null;
  if (hit.type === 'gap') return { line, candidate: null, refusal };
  const outcome = combineOutcome(blocks, sourceId, hit.targetId);
  return { line, candidate: outcome === 'not_allowed' ? null : { targetId: hit.targetId, outcome }, refusal };
}

/** Bırakınca yapılacak iş: birleştirme (orta bantta beklendiyse) ya da taşıma; yoksa iptal. */
export type DropAction =
  | { type: 'combine'; targetId: string; outcome: JoiningOutcome }
  | { type: 'move'; destination: MoveDestination }
  | null;

/** `armedId`: orta bandında 250 ms beklenmiş hedef (yoksa `null`). */
export function dropAction(resolution: DropResolution, armedId: string | null): DropAction {
  const { candidate, line } = resolution;
  if (candidate && candidate.targetId === armedId && isJoining(candidate.outcome)) {
    return { type: 'combine', targetId: candidate.targetId, outcome: candidate.outcome };
  }
  return line ? { type: 'move', destination: line } : null;
}

/** İki boşluk aynı mı (çizgi değişmedikçe yeniden çizilmesin). */
export function sameDestination(a: MoveDestination | null, b: MoveDestination | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.at !== b.at || a.index !== b.index) return false;
  return a.at === 'top' || (b.at === 'group' && a.blockId === b.blockId);
}

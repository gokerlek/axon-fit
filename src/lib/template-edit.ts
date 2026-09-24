import { alternativeForDevice, type AlternativeCandidate } from './alternatives.ts';
import { KIND_EQUIPMENT, type DeviceKind, type DeviceLoadSettings } from './device-loads.ts';
import type { Equipment, Muscle } from '@/lib/schemas/exercise';
import { moveKey, type ReorderTarget } from './reorder.ts';
import {
  backoffPreset,
  pyramidPreset,
  resizeSets,
  straightPreset,
  toggleLastAmrap,
  type SetSpec,
} from './set-plan.ts';
import {
  BLOCK_ROWS,
  DEFAULT_GROUP_REST_SECONDS,
  DEFAULT_REST_SECONDS,
  DEFAULT_TRANSITION_SECONDS,
  FALLBACK_REST_SECONDS,
  TEMPLATE_LIMITS,
  countRows,
  defaultSets,
  kindOptions,
  randomId,
  roundsOf,
  settleKind,
  type BlockKind,
  type PlanExercise,
  type TemplateBlock,
  type TemplateBody,
  type TemplateRow,
} from './template-plan.ts';

/**
 * Şablon düzenleyicinin işlemleri: ekleme, değiştirme, kaldırma, kopyalama, sıralama,
 * gruplama, grubu dağıtma, tür değiştirme, satırın cihazını ve setlerini (sayı, tur,
 * hazır düzenler) değiştirme. Setler satırla birlikte taşınır: gruplama ve gruptan
 * çıkarma hareketin setlerini değiştirmez.
 *
 * Hepsi saf ve değiştirmez (yeni dizi döner); düzenleyici sonucu forma tek seferde
 * yazar. Reddedilen ya da etkisiz işlem aynı diziyi döner (çağıran `===` ile anlar);
 * nedenini bırakmadan önce `moveCheck`, `combineOutcome`, `addToGroupOutcome` ve
 * `canDuplicate` söyler. Satır kimliği yalnız satır oluşurken üretilir: sıralama,
 * gruplama, hareket ya da cihaz değişimi kimliği korur ("Kopyala" yeni kimlik alır).
 * Antrenman kayıtları satıra bu kimlikle bağlanır.
 *
 * Yol takma adıyla çalışma zamanı içe aktarması yapmaz (testler Node'un kendi test
 * aracıyla çalışır); kas aileleri (`familyOf`) çağırandan gelir.
 */

/** Düzenleyicinin egzersiz bilgisi: hesap alanları + muadil alanları. */
export type EditorExercise = PlanExercise & AlternativeCandidate;
/**
 * Kütüphane panelinin egzersizi: egzersiz şemasının tipleriyle (kas yardımcıları için),
 * kural anlatımı için yük adımı ve kaynağı da var.
 */
export type PickerExercise = EditorExercise & {
  equipment: Equipment;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  stabilizerMuscles?: Muscle[];
  loadStepKg: number;
  minLoadKg: number;
  source: 'library' | 'custom';
};
/** Düzenleyicinin cihaz bilgisi (ad ve ağırlık ayarı). */
export type EditorDevice = DeviceLoadSettings & { id: string; name: string };

export type IdSource = (prefix: 'b' | 'r') => string;

/** Kimlik üretici: şablondaki kimlikleri bilir, ürettiklerini de hatırlar; hiçbiri tekrar etmez. */
export function idSource(blocks: readonly TemplateBlock[], random?: (n: number) => Uint8Array): IdSource {
  const taken = new Set(blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)]));
  return (prefix) => {
    const id = randomId(prefix, 6, taken, random);
    taken.add(id);
    return id;
  };
}

/** Yeni ekleme yapılabilir mi (40 hareket, 30 blok sınırı). */
export function canAdd(blocks: readonly TemplateBlock[]): boolean {
  return countRows(blocks) < TEMPLATE_LIMITS.rows && blocks.length < TEMPLATE_LIMITS.blocks;
}

/** Yeni satır: egzersizin aralığıyla düz setler, sayısı türüne göre. */
export function newRow(exercise: PlanExercise, id: string): TemplateRow {
  return { id, exerciseId: exercise.id, sets: defaultSets(exercise) };
}

/** Tek hareketlik yeni blok: setler ve dinlenme egzersizin türüne göre. */
export function newSingle(exercise: PlanExercise, ids: IdSource): TemplateBlock {
  return {
    id: ids('b'),
    kind: 'single',
    restSeconds: DEFAULT_REST_SECONDS[exercise.category],
    rows: [newRow(exercise, ids('r'))],
  };
}

/** Kütüphaneden ekleme: şablonun sonuna tek hareket. */
export function appendExercise(blocks: readonly TemplateBlock[], exercise: PlanExercise, ids: IdSource): TemplateBlock[] {
  if (!canAdd(blocks)) return [...blocks];
  return [...blocks, newSingle(exercise, ids)];
}

type Lookup = ReadonlyMap<string, Pick<PlanExercise, 'category'>>;

function singleRest(row: TemplateRow, exercises: Lookup): number {
  const category = exercises.get(row.exerciseId)?.category;
  return category ? DEFAULT_REST_SECONDS[category] : FALLBACK_REST_SECONDS;
}

/** Tek hareketlik blok (gruptan çıkan satır): setleri kendi setleri, dinlenme türün varsayılanı. */
function singleOf(id: string, row: TemplateRow, exercises: Lookup): TemplateBlock {
  return { id, kind: 'single', restSeconds: singleRest(row, exercises), rows: [row] };
}

/** Türü uygular: istasyon geçişi yalnız devrede (yoksa 15 sn). */
function withKind(block: TemplateBlock, kind: BlockKind): TemplateBlock {
  const { transitionSeconds, ...rest } = block;
  return kind === 'circuit'
    ? { ...rest, kind, transitionSeconds: transitionSeconds ?? DEFAULT_TRANSITION_SECONDS }
    : { ...rest, kind };
}

/** Satırları değişen blok: boşsa düşer, tek satır kaldıysa tekleşir (kimliği korur), yoksa tür uyar. */
function reshape(block: TemplateBlock, rows: TemplateRow[], exercises: Lookup): TemplateBlock | null {
  const [only] = rows;
  if (!only) return null;
  if (rows.length === 1) return block.kind === 'single' ? { ...block, rows } : singleOf(block.id, only, exercises);
  return withKind({ ...block, rows }, settleKind(block.kind, rows.length));
}

function locate(blocks: readonly TemplateBlock[], rowId: string): { blockIndex: number; rowIndex: number } | null {
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const rowIndex = blocks[blockIndex]?.rows.findIndex((row) => row.id === rowId) ?? -1;
    if (rowIndex >= 0) return { blockIndex, rowIndex };
  }
  return null;
}

function copySets(sets: readonly SetSpec[]): SetSpec[] {
  return sets.map((set) => ({ ...set }));
}

function updateRow(blocks: readonly TemplateBlock[], rowId: string, update: (row: TemplateRow) => TemplateRow): TemplateBlock[] {
  return blocks.map((block) =>
    block.rows.some((row) => row.id === rowId)
      ? { ...block, rows: block.rows.map((row) => (row.id === rowId ? update(row) : row)) }
      : block,
  );
}

/**
 * Satırın egzersizi değişir: kimlik ve not kalır, cihaz değişikliği düşer. Kayıt türü
 * aynıysa setler ve kural da kalır; değiştiyse (tekrar ↔ saniye) set sayısı kalır, hedef
 * yeni egzersizin varsayılanı olur (yüzde ve AMRAP düşer).
 */
function rowWithExercise(row: TemplateRow, next: PlanExercise, previous?: Pick<PlanExercise, 'trackingType'>): TemplateRow {
  const sameTracking = previous?.trackingType === next.trackingType;
  return {
    id: row.id,
    exerciseId: next.id,
    sets: sameTracking ? copySets(row.sets) : defaultSets(next, row.sets.length),
    ...(sameTracking && row.rule ? { rule: { ...row.rule } } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}

export function replaceExercise(
  blocks: readonly TemplateBlock[],
  rowId: string,
  next: PlanExercise,
  previous?: PlanExercise,
): TemplateBlock[] {
  return updateRow(blocks, rowId, (row) => rowWithExercise(row, next, previous));
}

/** Satırı yerine koyar (alanları düzenleyici değiştirir: setler, kural, cihaz, not). */
export function setRow(blocks: readonly TemplateBlock[], row: TemplateRow): TemplateBlock[] {
  return updateRow(blocks, row.id, () => row);
}

function without(rows: readonly TemplateRow[], rowId: string): TemplateRow[] {
  return rows.filter((row) => row.id !== rowId);
}

/**
 * Satırı kaldırır. Tek hareketse blok gider; gruptan kalan tek satır tekleşir (grubun
 * kimliğiyle, kendi setleriyle, dinlenme türün varsayılanı); gruplarda tür yeni sayıya uyar.
 */
export function removeRow(blocks: readonly TemplateBlock[], rowId: string, exercises: Lookup): TemplateBlock[] {
  if (!locate(blocks, rowId)) return blocks as TemplateBlock[];
  return blocks.flatMap((block) => {
    if (!block.rows.some((row) => row.id === rowId)) return [block];
    const next = reshape(block, without(block.rows, rowId), exercises);
    return next ? [next] : [];
  });
}

/** Bloğu bütün satırlarıyla kaldırır (grup yüzünde "Sil"). Bilinmeyen kimlikte aynı dizi. */
export function removeBlock(blocks: readonly TemplateBlock[], blockId: string): TemplateBlock[] {
  const next = blocks.filter((block) => block.id !== blockId);
  return next.length === blocks.length ? (blocks as TemplateBlock[]) : next;
}

/** Satırın bağımsız kopyası (setler ve kural da kopyalanır), verilen kimlikle. */
function cloneRow(row: TemplateRow, id: string): TemplateRow {
  return { ...row, id, sets: copySets(row.sets), ...(row.rule ? { rule: { ...row.rule } } : {}) };
}

/**
 * Üyenin kopyası grubun içinde kalır mı: grup, türü değişmeden bir hareket daha alıyorsa
 * (süperset hiç, kompleks 6'ya, devre 8'e kadar). Kopya grubun türünü sessizce değiştirmez.
 */
function copyFitsInGroup(block: TemplateBlock): boolean {
  return block.kind !== 'single' && block.rows.length < BLOCK_ROWS[block.kind].max;
}

/**
 * Kopya sığar mı (⧉ düğmesinin pasifliği; 40 hareket, 30 blok). Blok kimliğinde bütün
 * blok (`duplicateBlock`), satır kimliğinde satır (`duplicateRow`) sorulur.
 */
export function canDuplicate(blocks: readonly TemplateBlock[], id: string): boolean {
  const rows = countRows(blocks);
  const whole = blocks.find((block) => block.id === id);
  if (whole) return blocks.length < TEMPLATE_LIMITS.blocks && rows + whole.rows.length <= TEMPLATE_LIMITS.rows;
  const found = locate(blocks, id);
  const owner = found ? blocks[found.blockIndex] : undefined;
  if (!owner || rows >= TEMPLATE_LIMITS.rows) return false;
  return copyFitsInGroup(owner) || blocks.length < TEMPLATE_LIMITS.blocks;
}

/**
 * Satırı kopyalar (yeni kimlikle). Tek hareketse hemen arkasına aynı ayarlarla yeni blok.
 * Devre ya da kompleks üyesi, grup türü değişmeden sığıyorsa grubun içinde kaynağın
 * arkasına; süperset üyesi (ve sığmayan üye) grubun arkasına tek hareket olur: kendi
 * setleriyle, dinlenme türün varsayılanı (`exercises` verilmezse grubun dinlenmesi).
 * Sığmıyorsa aynı dizi.
 */
export function duplicateRow(blocks: readonly TemplateBlock[], rowId: string, ids: IdSource, exercises?: Lookup): TemplateBlock[] {
  const found = locate(blocks, rowId);
  if (!found || !canDuplicate(blocks, rowId)) return blocks as TemplateBlock[];
  const block = blocks[found.blockIndex] as TemplateBlock;
  const copy = cloneRow(block.rows[found.rowIndex] as TemplateRow, ids('r'));

  const next = [...blocks];
  if (copyFitsInGroup(block)) {
    const rows = [...block.rows];
    rows.splice(found.rowIndex + 1, 0, copy);
    next[found.blockIndex] = { ...block, rows };
    return next;
  }
  const { transitionSeconds: _transition, ...settings } = block;
  const single: TemplateBlock =
    block.kind !== 'single' && exercises
      ? singleOf(ids('b'), copy, exercises)
      : { ...settings, id: ids('b'), kind: 'single', rows: [copy] };
  next.splice(found.blockIndex + 1, 0, single);
  return next;
}

/**
 * Bloğu bütünüyle kopyalar (grup yüzünde ⧉): hemen arkasına, aynı ayarlarla, blok ve
 * satırlar yeni kimlikle. Sığmıyorsa (30 blok, 40 hareket) aynı dizi.
 */
export function duplicateBlock(blocks: readonly TemplateBlock[], blockId: string, ids: IdSource): TemplateBlock[] {
  const index = blocks.findIndex((block) => block.id === blockId);
  const block = blocks[index];
  if (!block || !canDuplicate(blocks, blockId)) return blocks as TemplateBlock[];
  const id = ids('b');
  const copy: TemplateBlock = { ...block, id, rows: block.rows.map((row) => cloneRow(row, ids('r'))) };
  const next = [...blocks];
  next.splice(index + 1, 0, copy);
  return next;
}

/**
 * Sürükle-bırakın verdiği sıraya dizer. Bilinmeyen kimlik yok sayılır, sırada olmayan
 * blok sona eklenir (eski bir sürüklemede kaybolmasın). Sıra aynıysa aynı dizi döner.
 * Eski düzenleyicinin (motion Reorder) işlemi; yerini `moveItem` alır, geçişte kalkar.
 */
export function reorderBlocks(blocks: readonly TemplateBlock[], orderedIds: readonly string[]): TemplateBlock[] {
  const next = inOrder(blocks, orderedIds);
  return next.every((block, index) => block === blocks[index]) ? (blocks as TemplateBlock[]) : next;
}

/** Grubun içinde sıralama (aynı kurallarla). Yerini `moveItem` alır, geçişte kalkar. */
export function reorderRows(blocks: readonly TemplateBlock[], blockId: string, orderedRowIds: readonly string[]): TemplateBlock[] {
  let changed = false;
  const next = blocks.map((block) => {
    if (block.id !== blockId) return block;
    const rows = inOrder(block.rows, orderedRowIds);
    if (rows.every((row, index) => row === block.rows[index])) return block;
    changed = true;
    return { ...block, rows };
  });
  return changed ? next : (blocks as TemplateBlock[]);
}

function inOrder<T extends { id: string }>(items: readonly T[], orderedIds: readonly string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const placed = new Set<string>();
  const result: T[] = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item && !placed.has(id)) {
      result.push(item);
      placed.add(id);
    }
  }
  for (const item of items) if (!placed.has(item.id)) result.push(item);
  return result;
}

/** İki komşu bloğun birleşimi (öncekinin kimliğiyle); olmuyorsa `null`. Her hareket kendi setlerini korur. */
function merged(first: TemplateBlock, second: TemplateBlock): TemplateBlock | null {
  const rows = [...first.rows, ...second.rows];
  if (rows.length > BLOCK_ROWS.circuit.max) return null;
  if (first.kind === 'single' && second.kind === 'single') {
    const kind = settleKind('superset', rows.length);
    return withKind({ id: first.id, kind, restSeconds: DEFAULT_GROUP_REST_SECONDS.superset, rows }, kind);
  }
  // Gruba katılan tek hareket grubun türünü ve dinlenmesini alır; iki grupta öncekininkiler geçer.
  const settings = first.kind === 'single' ? second : first;
  const { transitionSeconds, kind } = settings;
  const base: TemplateBlock = {
    id: first.id,
    kind,
    restSeconds: settings.restSeconds,
    ...(transitionSeconds !== undefined ? { transitionSeconds } : {}),
    rows,
  };
  return withKind(base, settleKind(kind, rows.length));
}

function neighbours(blocks: readonly TemplateBlock[], blockId: string, direction: 'previous' | 'next') {
  const index = blocks.findIndex((block) => block.id === blockId);
  const other = direction === 'previous' ? index - 1 : index + 1;
  if (index < 0 || other < 0 || other >= blocks.length) return null;
  const firstIndex = Math.min(index, other);
  return { firstIndex, first: blocks[firstIndex] as TemplateBlock, second: blocks[firstIndex + 1] as TemplateBlock };
}

/**
 * Komşuyla gruplanabilir mi (komşu var ve toplam en fazla 8 hareket).
 * Eski düzenleyicinin menüsü için; yerini `combineOutcome` alır, geçişte kalkar.
 */
export function canJoin(blocks: readonly TemplateBlock[], blockId: string, direction: 'previous' | 'next'): boolean {
  const pair = neighbours(blocks, blockId, direction);
  return pair !== null && merged(pair.first, pair.second) !== null;
}

/**
 * Komşu blokla gruplar. Satırlar yerlerindeki sırayla (öncekinin satırları önce),
 * sonuç öncekinin kimliğini alır. İki tek hareket süperset olur (dinlenme 90 sn; tur =
 * en çok seti olan hareketinki); gruba katılan tek hareket grubun türünü ve dinlenmesini
 * alır, tür uyar (süperset + tek = devre); iki grupta öncekinin ayarları geçer. Her
 * hareketin set sayısı kendisinde kalır.
 * Eski düzenleyicinin menüsü için; yerini `combineInto` alır (grup gruba girmez), geçişte kalkar.
 */
export function joinBlocks(blocks: readonly TemplateBlock[], blockId: string, direction: 'previous' | 'next'): TemplateBlock[] {
  const pair = neighbours(blocks, blockId, direction);
  const result = pair ? merged(pair.first, pair.second) : null;
  if (!pair || !result) return blocks as TemplateBlock[];
  const next = [...blocks];
  next.splice(pair.firstIndex, 2, result);
  return next;
}

/**
 * Satırı gruptan çıkarır: yeni kimlikli tek hareket olur (kendi setleriyle, dinlenme
 * türün varsayılanı). İlk satır grubun önüne, diğerleri arkasına gider; grupta tek satır
 * kalırsa o da tekleşir (grubun kimliğiyle).
 */
export function ungroupRow(blocks: readonly TemplateBlock[], rowId: string, exercises: Lookup, ids: IdSource): TemplateBlock[] {
  const found = locate(blocks, rowId);
  const block = found ? blocks[found.blockIndex] : undefined;
  if (!found || !block || block.kind === 'single' || block.rows.length < 2) return blocks as TemplateBlock[];
  const row = block.rows[found.rowIndex] as TemplateRow;
  const leaving = singleOf(ids('b'), row, exercises);
  const rest = reshape(block, block.rows.filter((item) => item.id !== rowId), exercises);
  const replacement = found.rowIndex === 0 ? [leaving, ...(rest ? [rest] : [])] : [...(rest ? [rest] : []), leaving];
  const next = [...blocks];
  next.splice(found.blockIndex, 1, ...replacement);
  return next;
}

/** Grubu dağıtır: her satır yerinde tek hareket olur; ilki grubun kimliğini alır. */
export function dissolveGroup(blocks: readonly TemplateBlock[], blockId: string, exercises: Lookup, ids: IdSource): TemplateBlock[] {
  const index = blocks.findIndex((block) => block.id === blockId);
  const block = blocks[index];
  if (!block || block.kind === 'single') return blocks as TemplateBlock[];
  const singles = block.rows.map((row, rowIndex) => singleOf(rowIndex === 0 ? block.id : ids('b'), row, exercises));
  const next = [...blocks];
  next.splice(index, 1, ...singles);
  return next;
}

// Sürükle-bırak ve klavye: tek taşıma işlemi (`moveItem`) ve üstüne bırakıp gruplama (`combineInto`).

/**
 * Sürüklenen ya da hedef öğe. Blok kimliği grubu (yüzü) ya da tek hareketi, satır kimliği
 * tek hareketi ya da grup üyesini gösterir; tek hareketin iki kimliği aynı öğedir.
 */
type Item =
  | { type: 'group'; blockIndex: number; block: TemplateBlock }
  | { type: 'single'; blockIndex: number; block: TemplateBlock }
  | { type: 'member'; blockIndex: number; block: TemplateBlock; rowIndex: number; row: TemplateRow };

function itemOf(blocks: readonly TemplateBlock[], id: string): Item | null {
  const blockIndex = blocks.findIndex((block) => block.id === id);
  const block = blocks[blockIndex];
  if (block) return block.kind === 'single' ? { type: 'single', blockIndex, block } : { type: 'group', blockIndex, block };
  const found = locate(blocks, id);
  const owner = found ? blocks[found.blockIndex] : undefined;
  const row = found ? owner?.rows[found.rowIndex] : undefined;
  if (!found || !owner || !row) return null;
  if (owner.kind === 'single') return { type: 'single', blockIndex: found.blockIndex, block: owner };
  return { type: 'member', blockIndex: found.blockIndex, block: owner, rowIndex: found.rowIndex, row };
}

/** Taşınan satırlar: tek harekette bloğunki (bir satır), üyede kendisi. */
function rowsOf(item: Item): TemplateRow[] {
  return item.type === 'member' ? [item.row] : item.block.rows;
}

/**
 * Taşımanın hedefi: şu anki (henüz değişmemiş) listede bir boşluk. `index`, boşluğun
 * ardındaki öğenin sırasıdır (0 = en baş, uzunluk = en son); sürüklerken kartlar yerinde
 * durduğu için ekleme çizgisi doğrudan bir boşluğu gösterir.
 * - `top`: üst düzeyde bloklar arası.
 * - `group`: grubun içinde satırlar arası.
 */
export type MoveDestination = { at: 'top'; index: number } | { at: 'group'; blockId: string; index: number };

/**
 * Taşıma olur mu (bırakmadan önce; çizgi ve duyuru için):
 * - `ok`: taşınır.
 * - `same`: öğe yerinde kalır (kendi önündeki ya da arkasındaki boşluk).
 * - `not_allowed`: grup gruba giremez; hedef grup değil; öğe, grup ya da boşluk yok.
 * - `full`: hedef grupta 8 hareket var.
 * - `limit`: gruptan çıkan hareket yeni blok olur, şablon 30 blokta.
 */
export type MoveCheck = 'ok' | 'same' | 'not_allowed' | 'full' | 'limit';

function isGap(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= length;
}

/** Boşluk öğenin hemen önünde ya da arkasındaysa taşıma yerinde kalır. */
function besides(gap: number, index: number): boolean {
  return gap === index || gap === index + 1;
}

/** Boşluğa taşınan öğenin, kendisi çıkarıldıktan sonraki sırası. */
function slotAfterRemoval(gap: number, from: number): number {
  return gap > from ? gap - 1 : gap;
}

/** Üyesi ayrılan grup: küçülür, türü uyar, tek satır kalırsa tekleşir (grubun kimliğiyle). */
function leftBehind(member: Extract<Item, { type: 'member' }>, exercises: Lookup): TemplateBlock | null {
  return reshape(member.block, without(member.block.rows, member.row.id), exercises);
}

/** Taşıma olur mu (bırakmadan önce; çizgi ve duyuru için). `sourceId`: blok ya da satır kimliği. */
export function moveCheck(blocks: readonly TemplateBlock[], sourceId: string, destination: MoveDestination): MoveCheck {
  return checkMove(blocks, itemOf(blocks, sourceId), destination);
}

function checkMove(blocks: readonly TemplateBlock[], source: Item | null, destination: MoveDestination): MoveCheck {
  if (!source) return 'not_allowed';
  if (destination.at === 'top') {
    if (!isGap(destination.index, blocks.length)) return 'not_allowed';
    if (source.type !== 'member') return besides(destination.index, source.blockIndex) ? 'same' : 'ok';
    return blocks.length >= TEMPLATE_LIMITS.blocks ? 'limit' : 'ok';
  }
  const groupIndex = blocks.findIndex((block) => block.id === destination.blockId);
  const group = blocks[groupIndex];
  if (!group || group.kind === 'single' || !isGap(destination.index, group.rows.length)) return 'not_allowed';
  if (source.type === 'group') return 'not_allowed';
  if (source.type === 'member' && source.blockIndex === groupIndex) return besides(destination.index, source.rowIndex) ? 'same' : 'ok';
  return group.rows.length + rowsOf(source).length > BLOCK_ROWS.circuit.max ? 'full' : 'ok';
}

/**
 * Öğeyi bir boşluğa taşır (sürükle-bırakta çizgi, klavyede `stepDestination`):
 * - Grup ve tek hareket üst düzeyde sıralanır; grup yalnız üst düzeye gider.
 * - Üye kendi grubunda sıralanır.
 * - Üst düzeye giden üye gruptan çıkar: yeni kimlikli tek hareket olur (kendi setleriyle,
 *   dinlenme türün varsayılanı); grup küçülür, türü uyar, tek satır kalırsa tekleşir
 *   (grubun kimliğiyle).
 * - Başka grubun içine giden tek hareket ya da üye o gruba katılır: grubun ayarları kalır,
 *   tür uyar (süperset + 1 = devre, kompleks 7 = devre); tek hareketin bloğu gider.
 * Satırlar kimliklerini ve setlerini korur. Olmuyorsa (`moveCheck` `ok` değilse) aynı dizi.
 */
export function moveItem(
  blocks: readonly TemplateBlock[],
  sourceId: string,
  destination: MoveDestination,
  exercises: Lookup,
  ids: IdSource,
): TemplateBlock[] {
  const source = itemOf(blocks, sourceId);
  if (!source || checkMove(blocks, source, destination) !== 'ok') return blocks as TemplateBlock[];

  if (destination.at === 'top') {
    if (source.type !== 'member') {
      const next = [...blocks];
      next.splice(source.blockIndex, 1);
      next.splice(slotAfterRemoval(destination.index, source.blockIndex), 0, source.block);
      return next;
    }
    const leaving = singleOf(ids('b'), source.row, exercises);
    const rest = leftBehind(source, exercises);
    const next: TemplateBlock[] = [];
    blocks.forEach((block, index) => {
      if (index === destination.index) next.push(leaving);
      if (index !== source.blockIndex) next.push(block);
      else if (rest) next.push(rest);
    });
    if (destination.index === blocks.length) next.push(leaving);
    return next;
  }

  const groupIndex = blocks.findIndex((block) => block.id === destination.blockId);
  const group = blocks[groupIndex] as TemplateBlock;
  if (source.type === 'member' && source.blockIndex === groupIndex) {
    const rows = [...group.rows];
    rows.splice(source.rowIndex, 1);
    rows.splice(slotAfterRemoval(destination.index, source.rowIndex), 0, source.row);
    return blocks.map((block, index) => (index === groupIndex ? { ...group, rows } : block));
  }
  const rows = [...group.rows];
  rows.splice(destination.index, 0, ...rowsOf(source));
  const joined = withKind({ ...group, rows }, settleKind(group.kind, rows.length));
  const rest = source.type === 'member' ? leftBehind(source, exercises) : null;
  return blocks.flatMap((block, index) => {
    if (index === groupIndex) return [joined];
    if (index === source.blockIndex) return rest ? [rest] : [];
    return [block];
  });
}

function stepGap(keys: readonly string[], key: string, target: ReorderTarget): number | null {
  const moved = moveKey(keys, key, target);
  if (moved === keys) return null;
  const from = keys.indexOf(key);
  const to = moved.indexOf(key);
  return to > from ? to + 1 : to;
}

/**
 * Klavyeyle taşımanın hedefi (Alt+↑/↓, Alt+Home/End), `moveItem`'a verilir: grup ve tek
 * hareket üst düzeyde, üye kendi grubunda kayar (gruptan çıkmak ayrı işlem: Alt+←).
 * Öğe zaten o uçtaysa ya da yoksa `null`.
 */
export function stepDestination(blocks: readonly TemplateBlock[], id: string, target: ReorderTarget): MoveDestination | null {
  const item = itemOf(blocks, id);
  if (!item) return null;
  if (item.type === 'member') {
    const index = stepGap(item.block.rows.map((row) => row.id), item.row.id, target);
    return index === null ? null : { at: 'group', blockId: item.block.id, index };
  }
  const index = stepGap(blocks.map((block) => block.id), item.block.id, target);
  return index === null ? null : { at: 'top', index };
}

/**
 * Üstüne bırakmanın sonucu (bırakmadan önce hapın metni):
 * - `superset`: tekin üstüne tek ya da üye → "Süperset yap".
 * - `becomes_circuit`: süpersete ya da 6 hareketli komplekse → "Ekle · devre olur".
 * - `join`: devreye ya da (sığan) komplekse → "Gruba ekle".
 * - `full`: grupta 8 hareket var → "Grup dolu (8)"; birleştirme olmaz.
 * - `not_allowed`: grup hiçbir şeye katılmaz; öğe kendine ya da kendi grubuna bırakılamaz
 *   (grup içinde sıralamayı çizgiler yapar); öğe yok.
 */
export type CombineOutcome = 'superset' | 'becomes_circuit' | 'join' | 'full' | 'not_allowed';

/** Gruba `incoming` hareket katılınca: sığar mı, türü değişir mi. */
function joinOutcome(group: TemplateBlock, incoming: number): 'join' | 'becomes_circuit' | 'full' {
  const total = group.rows.length + incoming;
  if (total > BLOCK_ROWS.circuit.max) return 'full';
  return settleKind(group.kind, total) === group.kind ? 'join' : 'becomes_circuit';
}

/** `sourceId` ve `targetId`: blok ya da satır kimliği (tek harekette ikisi de olur). */
export function combineOutcome(blocks: readonly TemplateBlock[], sourceId: string, targetId: string): CombineOutcome {
  return outcomeOf(itemOf(blocks, sourceId), itemOf(blocks, targetId));
}

function outcomeOf(source: Item | null, target: Item | null): CombineOutcome {
  if (!source || !target || source.type === 'group' || source.blockIndex === target.blockIndex) return 'not_allowed';
  if (target.type === 'single') return 'superset';
  return joinOutcome(target.block, rowsOf(source).length);
}

/**
 * Üstüne bırakıp gruplar (bırakılan tek hareket ya da üye; hedef önde kalır, bırakılan
 * arkasına girer). Klavyede Alt+→ ("öncekiyle grupla") hedef olarak önceki bloğu verir.
 * - Tekin üstüne: süperset olur, tekin kimliğiyle ve yerinde; dinlenme 90 sn, her hareket
 *   kendi setleriyle.
 * - Grup yüzüne: sona; üyenin üstüne: o üyenin arkasına. Grubun ayarları kalır, tür uyar
 *   (süperset + 1 = devre, kompleks 7 = devre).
 * Bırakılan tek hareketin bloğu gider; üye ayrıldığı grubu küçültür (tek satır kalırsa
 * tekleşir). Olmuyorsa (`combineOutcome` `full` ya da `not_allowed`) aynı dizi.
 */
export function combineInto(
  blocks: readonly TemplateBlock[],
  sourceId: string,
  targetId: string,
  exercises: Lookup,
): TemplateBlock[] {
  const source = itemOf(blocks, sourceId);
  const target = itemOf(blocks, targetId);
  const outcome = outcomeOf(source, target);
  if (outcome === 'full' || outcome === 'not_allowed' || !source || !target) return blocks as TemplateBlock[];

  const moving = rowsOf(source);
  let joined: TemplateBlock;
  if (target.type === 'single') {
    const rows = [...target.block.rows, ...moving];
    const kind = settleKind('superset', rows.length);
    joined = withKind({ id: target.block.id, kind, restSeconds: DEFAULT_GROUP_REST_SECONDS.superset, rows }, kind);
  } else {
    const rows = [...target.block.rows];
    rows.splice(target.type === 'member' ? target.rowIndex + 1 : rows.length, 0, ...moving);
    joined = withKind({ ...target.block, rows }, settleKind(target.block.kind, rows.length));
  }
  const rest = source.type === 'member' ? leftBehind(source, exercises) : null;
  return blocks.flatMap((block, index) => {
    if (index === target.blockIndex) return [joined];
    if (index === source.blockIndex) return rest ? [rest] : [];
    return [block];
  });
}

// "Grup kur" ve "Gruba hareket ekle": boş grup hiç oluşmaz.

/** Sırayla seçilen hareketlerden kurulacak grubun türü: 2 → süperset, 3–8 → devre; olmuyorsa `null`. */
export function newGroupKind(count: number): 'superset' | 'circuit' | null {
  if (count === BLOCK_ROWS.superset.min) return 'superset';
  if (count >= BLOCK_ROWS.circuit.min && count <= BLOCK_ROWS.circuit.max) return 'circuit';
  return null;
}

/** Yeni grubun en çok kaç hareket alabileceği (seçim bunda kilitlenir): 8, şablonun kalan yeri ya da 30 blokta 0. */
export function newGroupCapacity(blocks: readonly TemplateBlock[]): number {
  if (blocks.length >= TEMPLATE_LIMITS.blocks) return 0;
  return Math.max(0, Math.min(BLOCK_ROWS.circuit.max, TEMPLATE_LIMITS.rows - countRows(blocks)));
}

/**
 * Sırayla seçilen hareketlerden grup kurar ve sona ekler ("Grup kur"): 2 hareket süperset
 * (90 sn), 3–8 devre (120 sn, geçiş 15 sn). Setler her hareketin türüne göre. Hareket
 * sayısı uymuyorsa ya da şablona sığmıyorsa aynı dizi.
 */
export function appendGroup(blocks: readonly TemplateBlock[], exercises: readonly PlanExercise[], ids: IdSource): TemplateBlock[] {
  const kind = newGroupKind(exercises.length);
  if (!kind || exercises.length > newGroupCapacity(blocks)) return blocks as TemplateBlock[];
  const id = ids('b');
  const rows = exercises.map((exercise) => newRow(exercise, ids('r')));
  return [...blocks, withKind({ id, kind, restSeconds: DEFAULT_GROUP_REST_SECONDS[kind], rows }, kind)];
}

/**
 * Gruba bir hareket eklenirse ("+ Gruba hareket ekle" sayfası):
 * - `join` / `becomes_circuit`: `combineOutcome` gibi (süperset ve 6'lı kompleks devre olur).
 * - `full`: grupta 8 hareket var → "Grup dolu (8)".
 * - `limit`: şablonda 40 hareket var.
 * - `not_allowed`: blok grup değil ya da yok.
 */
export type AddToGroupOutcome = 'join' | 'becomes_circuit' | 'full' | 'limit' | 'not_allowed';

export function addToGroupOutcome(blocks: readonly TemplateBlock[], blockId: string): AddToGroupOutcome {
  const group = blocks.find((block) => block.id === blockId);
  if (!group || group.kind === 'single') return 'not_allowed';
  const outcome = joinOutcome(group, 1);
  if (outcome === 'full') return outcome;
  return countRows(blocks) >= TEMPLATE_LIMITS.rows ? 'limit' : outcome;
}

/** Grubun sonuna yeni hareket ekler (setleri türüne göre); tür uyar. Olmuyorsa aynı dizi. */
export function addToGroup(blocks: readonly TemplateBlock[], blockId: string, exercise: PlanExercise, ids: IdSource): TemplateBlock[] {
  const outcome = addToGroupOutcome(blocks, blockId);
  if (outcome !== 'join' && outcome !== 'becomes_circuit') return blocks as TemplateBlock[];
  return blocks.map((block) => {
    if (block.id !== blockId) return block;
    const rows = [...block.rows, newRow(exercise, ids('r'))];
    return withKind({ ...block, rows }, settleKind(block.kind, rows.length));
  });
}

/** Satırın setlerini değiştirir; sonuç aynıysa aynı dizi döner. */
export function updateRowSets(
  blocks: readonly TemplateBlock[],
  rowId: string,
  change: (sets: SetSpec[]) => SetSpec[],
): TemplateBlock[] {
  let changed = false;
  const next = updateRow(blocks, rowId, (row) => {
    const sets = change(row.sets);
    if (JSON.stringify(sets) === JSON.stringify(row.sets)) return row;
    changed = true;
    return { ...row, sets };
  });
  return changed ? next : (blocks as TemplateBlock[]);
}

/** Satırın set sayısı (1–10): artarken son set kopyalanır; "son set AMRAP" son sette kalır. */
export function setRowSetCount(blocks: readonly TemplateBlock[], rowId: string, count: number): TemplateBlock[] {
  return updateRowSets(blocks, rowId, (sets) => resizeSets(sets, count));
}

/**
 * Grubun turu: turu dolduran (en çok seti olan) hareketler yeni tura geçer, daha az setli
 * olanlar yeni turu aşmadıkça kendi sayısında kalır. Tek harekette set sayısıdır.
 */
export function setRounds(blocks: readonly TemplateBlock[], blockId: string, rounds: number): TemplateBlock[] {
  const target = Math.min(TEMPLATE_LIMITS.sets, Math.max(1, Math.round(rounds)));
  let changed = false;
  const next = blocks.map((block) => {
    if (block.id !== blockId) return block;
    const current = roundsOf(block);
    let touched = false;
    const rows = block.rows.map((row) => {
      const count = row.sets.length === current ? target : Math.min(row.sets.length, target);
      if (count === row.sets.length) return row;
      touched = true;
      return { ...row, sets: resizeSets(row.sets, count) };
    });
    if (!touched) return block;
    changed = true;
    return { ...block, rows };
  });
  return changed ? next : (blocks as TemplateBlock[]);
}

export type SetPreset = 'straight' | 'pyramid' | 'backoff' | 'lastAmrap';

const PRESETS: Record<SetPreset, (sets: SetSpec[]) => SetSpec[]> = {
  straight: straightPreset,
  pyramid: (sets) => pyramidPreset(sets, TEMPLATE_LIMITS.repsMax),
  backoff: backoffPreset,
  lastAmrap: toggleLastAmrap,
};

/** Hazır düzen: düz, piramit, back-off ya da "son set AMRAP" aç/kapa. */
export function applySetPreset(blocks: readonly TemplateBlock[], rowId: string, preset: SetPreset): TemplateBlock[] {
  return updateRowSets(blocks, rowId, PRESETS[preset]);
}

/** Grubun türünü değiştirir; hareket sayısına uymayan tür reddedilir (değişmez). */
export function changeKind(blocks: readonly TemplateBlock[], blockId: string, kind: BlockKind): TemplateBlock[] {
  return blocks.map((block) =>
    block.id === blockId && block.kind !== kind && kindOptions(block.rows.length).includes(kind) ? withKind(block, kind) : block,
  );
}

export type DeviceSwap =
  /** Cihazda aynı kalıpta muadil var: hareket değişti (egzersiz kimlikleri). */
  | { kind: 'swapped'; row: TemplateRow; from: string; to: string }
  /** Aynı hareket başka cihazda: satıra cihaz yazıldı. */
  | { kind: 'device'; row: TemplateRow }
  /** Egzersizin kendi cihazına dönüldü. */
  | { kind: 'reset'; row: TemplateRow }
  | { kind: 'unavailable' };

type SwapContext = {
  exercises: readonly EditorExercise[];
  devices: ReadonlyMap<string, { kind: DeviceKind }>;
  familyOf: (muscle: string) => string;
};

function withoutDevice(row: TemplateRow): TemplateRow {
  const { deviceId: _device, ...rest } = row;
  return rest;
}

/**
 * Satırın cihazı değişince ne olur (SPEC §7.3):
 * 1. Egzersizin kendi cihazı (ya da boş) → satırdaki cihaz değişikliği kalkar.
 * 2. Cihazda aynı hareket kalıbında muadil varsa (PT'nin sabitledikleri önce) → hareket ona geçer.
 * 3. Cihazın ekipmanı egzersizinkiyle aynıysa → aynı hareket bu cihazda (satıra cihaz yazılır;
 *    geçmiş egzersiz + cihaz olarak ayrı tutulur).
 * 4. Başka kalıpta da olsa muadil varsa → ona geçer.
 * 5. Hiçbiri yoksa bu cihaz seçilemez.
 * Hareket değişince satırın kimliği, notu ve set sayısı kalır; hedefler ve kural yalnız kayıt türü aynıysa.
 */
export function swapDevice(row: TemplateRow, deviceId: string | null, ctx: SwapContext): DeviceSwap {
  const exercise = ctx.exercises.find((item) => item.id === row.exerciseId);
  if (!exercise) return { kind: 'unavailable' };
  if (deviceId === null || deviceId === '' || deviceId === exercise.deviceId) return { kind: 'reset', row: withoutDevice(row) };

  const device = ctx.devices.get(deviceId);
  if (!device) return { kind: 'unavailable' };
  const found = alternativeForDevice(exercise, deviceId, ctx.exercises, ctx.familyOf);
  const alternative = found && found.id !== exercise.id ? found : null;
  const swapped = (to: EditorExercise): DeviceSwap => ({
    kind: 'swapped',
    row: rowWithExercise(row, to, exercise),
    from: exercise.id,
    to: to.id,
  });

  if (alternative && exercise.pattern && alternative.pattern === exercise.pattern) return swapped(alternative);
  if (KIND_EQUIPMENT[device.kind] === exercise.equipment) return { kind: 'device', row: { ...row, deviceId } };
  if (alternative) return swapped(alternative);
  return { kind: 'unavailable' };
}

export type DeviceChoice = { deviceId: string; label: string; result: Exclude<DeviceSwap, { kind: 'unavailable' }> };

/** Satırın cihaz listesi: seçilebilen (sonucu olan) cihazlar, ne olacağını söyleyen etiketle. */
export function deviceChoices(
  row: TemplateRow,
  ctx: SwapContext & { deviceList: readonly { id: string; name: string; kind: DeviceKind }[] },
): DeviceChoice[] {
  const exercise = ctx.exercises.find((item) => item.id === row.exerciseId);
  const byId = new Map(ctx.exercises.map((item) => [item.id, item]));
  const choices: DeviceChoice[] = [];
  for (const device of ctx.deviceList) {
    const result = swapDevice(row, device.id, ctx);
    if (result.kind === 'unavailable') continue;
    const label =
      result.kind === 'reset'
        ? exercise?.deviceId
          ? `Egzersizin cihazı: ${device.name}`
          : 'Cihazsız'
        : result.kind === 'device'
          ? device.name
          : `${device.name} → ${byId.get(result.to)?.title ?? result.to}`;
    choices.push({ deviceId: device.id, label, result });
  }
  return choices;
}

/**
 * Düzenlemeye açarken: artık olmayan cihaza yazılmış satırlar egzersizin kendi cihazına
 * döner (kaydedince kalıcı olur). Hangi satırların değiştiği bildirilir.
 */
export function prepareForEditing(
  template: TemplateBody,
  deviceIds: ReadonlySet<string>,
): { blocks: TemplateBlock[]; droppedDeviceRowIds: string[] } {
  const droppedDeviceRowIds: string[] = [];
  const blocks = template.blocks.map((block) => ({
    ...block,
    rows: block.rows.map((row) => {
      if (row.deviceId === undefined || deviceIds.has(row.deviceId)) return row;
      droppedDeviceRowIds.push(row.id);
      return withoutDevice(row);
    }),
  }));
  return { blocks, droppedDeviceRowIds };
}

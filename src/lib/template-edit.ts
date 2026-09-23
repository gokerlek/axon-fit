import { alternativeForDevice, type AlternativeCandidate } from './alternatives.ts';
import { KIND_EQUIPMENT, type DeviceKind, type DeviceLoadSettings } from './device-loads.ts';
import type { Equipment, Muscle } from '@/lib/schemas/exercise';
import {
  BLOCK_ROWS,
  DEFAULT_GROUP_REST_SECONDS,
  DEFAULT_REST_SECONDS,
  DEFAULT_SETS,
  DEFAULT_TRANSITION_SECONDS,
  FALLBACK_REST_SECONDS,
  TEMPLATE_LIMITS,
  countRows,
  defaultTarget,
  kindOptions,
  randomId,
  settleKind,
  type BlockKind,
  type PlanExercise,
  type TemplateBlock,
  type TemplateBody,
  type TemplateRow,
} from './template-plan.ts';

/**
 * Şablon düzenleyicinin işlemleri: ekleme, değiştirme, kaldırma, kopyalama, sıralama,
 * gruplama, grubu dağıtma, tür değiştirme ve satırın cihazını değiştirme.
 *
 * Hepsi saf ve değiştirmez (yeni dizi döner); düzenleyici sonucu forma tek seferde
 * yazar. Satır kimliği yalnız satır oluşurken üretilir: sıralama, gruplama, hareket ya
 * da cihaz değişimi kimliği korur ("Kopyala" yeni kimlik alır). Antrenman kayıtları
 * satıra bu kimlikle bağlanır.
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

export function newRow(exercise: PlanExercise, id: string): TemplateRow {
  return { id, exerciseId: exercise.id, target: defaultTarget(exercise) };
}

/** Tek hareketlik yeni blok: set ve dinlenme egzersizin türüne göre. */
export function newSingle(exercise: PlanExercise, ids: IdSource): TemplateBlock {
  return {
    id: ids('b'),
    kind: 'single',
    sets: DEFAULT_SETS[exercise.category],
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

/** Tek hareketlik blok (gruptan çıkan satır): set = grubun turu, dinlenme türün varsayılanı. */
function singleOf(id: string, row: TemplateRow, sets: number, exercises: Lookup): TemplateBlock {
  return { id, kind: 'single', sets, restSeconds: singleRest(row, exercises), rows: [row] };
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
  if (rows.length === 1) return block.kind === 'single' ? { ...block, rows } : singleOf(block.id, only, block.sets, exercises);
  return withKind({ ...block, rows }, settleKind(block.kind, rows.length));
}

function locate(blocks: readonly TemplateBlock[], rowId: string): { blockIndex: number; rowIndex: number } | null {
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const rowIndex = blocks[blockIndex]?.rows.findIndex((row) => row.id === rowId) ?? -1;
    if (rowIndex >= 0) return { blockIndex, rowIndex };
  }
  return null;
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
 * aynıysa hedef ve kural da kalır; değiştiyse (tekrar ↔ saniye) yeni egzersizin varsayılanı.
 */
function rowWithExercise(row: TemplateRow, next: PlanExercise, previous?: Pick<PlanExercise, 'trackingType'>): TemplateRow {
  const sameTracking = previous?.trackingType === next.trackingType;
  return {
    id: row.id,
    exerciseId: next.id,
    target: sameTracking ? { ...row.target } : defaultTarget(next),
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

/** Satırı yerine koyar (alanları düzenleyici değiştirir: hedef, kural, cihaz, not). */
export function setRow(blocks: readonly TemplateBlock[], row: TemplateRow): TemplateBlock[] {
  return updateRow(blocks, row.id, () => row);
}

/**
 * Satırı kaldırır. Tek hareketse blok gider; gruptan kalan tek satır tekleşir (grubun
 * kimliği ve turu ile, dinlenme türün varsayılanı); gruplarda tür yeni sayıya uyar.
 */
export function removeRow(blocks: readonly TemplateBlock[], rowId: string, exercises: Lookup): TemplateBlock[] {
  return blocks.flatMap((block) => {
    if (!block.rows.some((row) => row.id === rowId)) return [block];
    const next = reshape(block, block.rows.filter((row) => row.id !== rowId), exercises);
    return next ? [next] : [];
  });
}

/**
 * Satırı kopyalar (yeni kimlikle). Tek hareketse hemen arkasına aynı ayarlarla yeni blok;
 * gruptaysa kaynağın arkasına (tür uyar: süperset devre olur); grup doluysa (8) grubun
 * arkasına tek hareket.
 */
export function duplicateRow(blocks: readonly TemplateBlock[], rowId: string, ids: IdSource): TemplateBlock[] {
  const found = locate(blocks, rowId);
  if (!found || countRows(blocks) >= TEMPLATE_LIMITS.rows) return [...blocks];
  const block = blocks[found.blockIndex] as TemplateBlock;
  const source = block.rows[found.rowIndex] as TemplateRow;
  const copy: TemplateRow = {
    ...source,
    id: ids('r'),
    target: { ...source.target },
    ...(source.rule ? { rule: { ...source.rule } } : {}),
  };

  const next = [...blocks];
  if (block.kind !== 'single' && block.rows.length < BLOCK_ROWS.circuit.max) {
    const rows = [...block.rows];
    rows.splice(found.rowIndex + 1, 0, copy);
    next[found.blockIndex] = withKind({ ...block, rows }, settleKind(block.kind, rows.length));
    return next;
  }
  if (blocks.length >= TEMPLATE_LIMITS.blocks) return next;
  const { transitionSeconds: _transition, ...settings } = block;
  next.splice(found.blockIndex + 1, 0, { ...settings, id: ids('b'), kind: 'single', rows: [copy] });
  return next;
}

/**
 * Sürükle-bırakın verdiği sıraya dizer. Bilinmeyen kimlik yok sayılır, sırada olmayan
 * blok sona eklenir (eski bir sürüklemede kaybolmasın). Sıra aynıysa aynı dizi döner.
 */
export function reorderBlocks(blocks: readonly TemplateBlock[], orderedIds: readonly string[]): TemplateBlock[] {
  const next = inOrder(blocks, orderedIds);
  return next.every((block, index) => block === blocks[index]) ? (blocks as TemplateBlock[]) : next;
}

/** Grubun içinde sıralama (aynı kurallarla). */
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

function shift<T>(items: readonly T[], index: number, delta: -1 | 1): T[] | null {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return null;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

/** Bloğu bir yukarı ya da aşağı taşır; uçlarda değişmez. */
export function moveBlock(blocks: readonly TemplateBlock[], blockId: string, delta: -1 | 1): TemplateBlock[] {
  return shift(blocks, blocks.findIndex((block) => block.id === blockId), delta) ?? (blocks as TemplateBlock[]);
}

/** Satırı grubunun içinde taşır; uçlarda değişmez. */
export function moveRowInGroup(blocks: readonly TemplateBlock[], rowId: string, delta: -1 | 1): TemplateBlock[] {
  const found = locate(blocks, rowId);
  const block = found ? blocks[found.blockIndex] : undefined;
  const rows = found && block ? shift(block.rows, found.rowIndex, delta) : null;
  if (!found || !block || !rows) return blocks as TemplateBlock[];
  const next = [...blocks];
  next[found.blockIndex] = { ...block, rows };
  return next;
}

/** İki komşu bloğun birleşimi (öncekinin kimliğiyle); olmuyorsa `null`. */
function merged(first: TemplateBlock, second: TemplateBlock): TemplateBlock | null {
  const rows = [...first.rows, ...second.rows];
  if (rows.length > BLOCK_ROWS.circuit.max) return null;
  if (first.kind === 'single' && second.kind === 'single') {
    const kind = settleKind('superset', rows.length);
    return withKind(
      { id: first.id, kind, sets: Math.max(first.sets, second.sets), restSeconds: DEFAULT_GROUP_REST_SECONDS.superset, rows },
      kind,
    );
  }
  // Gruba katılan tek hareket grubun ayarlarını alır; iki grupta öncekininkiler geçer.
  const settings = first.kind === 'single' ? second : first;
  const { transitionSeconds, kind } = settings;
  const base: TemplateBlock = {
    id: first.id,
    kind,
    sets: settings.sets,
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

/** Komşuyla gruplanabilir mi (komşu var ve toplam en fazla 8 hareket). */
export function canJoin(blocks: readonly TemplateBlock[], blockId: string, direction: 'previous' | 'next'): boolean {
  const pair = neighbours(blocks, blockId, direction);
  return pair !== null && merged(pair.first, pair.second) !== null;
}

/**
 * Komşu blokla gruplar. Satırlar yerlerindeki sırayla (öncekinin satırları önce),
 * sonuç öncekinin kimliğini alır. İki tek hareket süperset olur (tur = büyük set sayısı,
 * dinlenme 90 sn); gruba katılan tek hareket grubun ayarlarını alır ve tür uyar
 * (süperset + tek = devre); iki grupta öncekinin ayarları geçer.
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
 * Satırı gruptan çıkarır: yeni kimlikli tek hareket olur (set = grubun turu, dinlenme
 * türün varsayılanı). İlk satır grubun önüne, diğerleri arkasına gider; grupta tek satır
 * kalırsa o da tekleşir (grubun kimliğiyle).
 */
export function ungroupRow(blocks: readonly TemplateBlock[], rowId: string, exercises: Lookup, ids: IdSource): TemplateBlock[] {
  const found = locate(blocks, rowId);
  const block = found ? blocks[found.blockIndex] : undefined;
  if (!found || !block || block.kind === 'single' || block.rows.length < 2) return blocks as TemplateBlock[];
  const row = block.rows[found.rowIndex] as TemplateRow;
  const leaving = singleOf(ids('b'), row, block.sets, exercises);
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
  const singles = block.rows.map((row, rowIndex) => singleOf(rowIndex === 0 ? block.id : ids('b'), row, block.sets, exercises));
  const next = [...blocks];
  next.splice(index, 1, ...singles);
  return next;
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
 * Hareket değişince satırın kimliği ve notu kalır; hedef ve kural yalnız kayıt türü aynıysa.
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

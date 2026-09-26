import type { TrackingType } from './progression.ts';
import { isFullLoad, setShape, type SetSpec } from './set-plan.ts';
import { formatRest } from './template-plan.ts';

/**
 * Setlerin danışanın dilinde anlatımı (`/me`, SPEC §6: danışan yalnız telefondan). PT'nin kısa
 * yazımı ("12 / 10 / 8+ tekrar · piramit %80 → %100 · +: yapabildiğin kadar") danışana kısaltma
 * ve işaret okutuyordu; burada aynı plan cümleyle anlatılır:
 * "3 set: 12, 10 tekrar ve son sette yapabildiğin kadar (en az 8) · ağırlık her sette artar ·
 * 1 dk 30 sn dinlenme". Saf; PT'nin yazımı `set-plan.ts` `formatSets`'te kalır.
 */

function count(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('tr-TR') : '?';
}

function range(set: Pick<SetSpec, 'min' | 'max'>): string {
  return set.min === set.max ? count(set.min) : `${count(set.min)}–${count(set.max)}`;
}

/** "a", "a ve b", "a, b ve c". */
function listTr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

function pctOf(set: SetSpec): number {
  return isFullLoad(set) ? 100 : (set.loadPct as number);
}

/** Yüzde yalnız ağırlıklı harekette anlamlı (PT'nin yazımıyla aynı kural). */
function effective(sets: readonly SetSpec[], trackingType: TrackingType): SetSpec[] {
  return trackingType === 'weight_reps' ? [...sets] : sets.map(({ loadPct: _pct, ...rest }) => rest);
}

/** Setlerin kendisi: sayı, tekrar (ya da saniye) ve "yapabildiğin kadar". */
function setsPhrase(list: readonly SetSpec[], unit: string): string {
  const n = list.length;
  const first = list[0] as SetSpec;
  const shape = setShape(list);

  if (shape.kind === 'straight') {
    if (n === 1) return first.amrap ? `1 set: yapabildiğin kadar (en az ${count(first.min)} ${unit})` : `1 set: ${range(first)} ${unit}`;
    if (shape.amrap === 'all') return `${count(n)} set, her sette yapabildiğin kadar (en az ${count(first.min)} ${unit})`;
    const base = `${count(n)} set, her sette ${range(first)} ${unit}`;
    if (shape.amrap === 'last') return `${base}; son sette yapabildiğin kadar`;
    if (shape.amrap === 'some') {
      const positions = list.flatMap((set, index) => (set.amrap ? [`${index + 1}.`] : []));
      return `${base}; ${listTr(positions)} sette yapabildiğin kadar`;
    }
    return base;
  }

  // Setler farklı: tek tek sayılır; birim son düz setin arkasına bir kez yazılır.
  const lastPlain = list.reduce((last, set, index) => (set.amrap ? last : index), -1);
  const items = list.map((set, index) => {
    if (!set.amrap) return index === lastPlain ? `${range(set)} ${unit}` : range(set);
    const where = index === n - 1 ? 'son sette' : `${index + 1}. sette`;
    return `${where} yapabildiğin kadar (en az ${count(set.min)}${lastPlain < 0 ? ` ${unit}` : ''})`;
  });
  return `${count(n)} set: ${listTr(items)}`;
}

/** Yükün seyri, yüzdesiz: piramit, back-off ya da serbest yüzdeler. Düz sette yok. */
function loadPhrase(list: readonly SetSpec[]): string | null {
  const shape = setShape(list);
  const pcts = list.map(pctOf);
  if (shape.kind === 'pyramid') return 'ağırlık her sette artar';
  if (shape.kind === 'backoff') return `ilk set en ağır, sonrakiler %${count(100 - (pcts[1] as number))} daha hafif`;
  if (pcts.some((pct) => pct < 100)) return `ağırlık en ağır sete göre: ${pcts.map((pct) => `%${count(pct)}`).join(', ')}`;
  return null;
}

/**
 * Bir satırın setleri danışana. `restSeconds` yalnız tek harekette verilir (setler arası); grupta
 * dinlenme grubun başlığında anlatılır.
 */
export function clientSetText(sets: readonly SetSpec[], trackingType: TrackingType, restSeconds?: number): string {
  const list = effective(sets, trackingType);
  if (list.length === 0) return '';
  const unit = trackingType === 'duration' ? 'sn' : 'tekrar';
  const rest =
    restSeconds === undefined ? null : restSeconds > 0 ? `${formatRest(restSeconds)} dinlenme` : 'setler arası dinlenme yok';
  return [setsPhrase(list, unit), loadPhrase(list), rest].filter(Boolean).join(' · ');
}

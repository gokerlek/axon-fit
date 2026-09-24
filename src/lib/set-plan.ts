import { isFullLoad, type SetTarget, type TrackingType } from './progression.ts';

/**
 * Satırın setleri — şablon ve program günü ortak (SPEC §7.1, §7.4).
 *
 * Her set kendi hedefini taşır (tekrar ya da süreli harekette saniye), isteğe bağlı bir
 * yük yüzdesi (tam yükteki setin %40–99'u; yalnız ağırlıklı harekette) ve AMRAP
 * ("yapabildiği kadar") işareti. En az bir set tam yüktedir (yüzdesiz): ağırlık artışına
 * onlar karar verir. Isınma setleri saklanmaz.
 *
 * Buradaki fonksiyonlar düzenleyicinin hazır düzenleri (düz, piramit, back-off, son set
 * AMRAP), set sayısı değişimi ve setlerin okunur anlatımıdır. Saf ve değiştirmez; yol
 * takma adıyla çalışma zamanı içe aktarması yapmaz (testler Node'un kendi test aracıyla).
 */

export type SetSpec = SetTarget;

export const SET_LIMITS = { perRow: 10, loadPctMin: 40 } as const;
/** Back-off setlerinin varsayılan yükü. */
export const BACKOFF_PCT = 85;
/** Piramit ve back-off 2'den az sette 3 sete çıkar. */
export const PRESET_MIN_SETS = 3;

export { isFullLoad } from './progression.ts';

export type SetShape = {
  kind: 'straight' | 'pyramid' | 'backoff' | 'custom';
  amrap: 'none' | 'last' | 'all' | 'some';
};

function pctOf(set: SetSpec): number {
  return isFullLoad(set) ? 100 : (set.loadPct as number);
}

function amrapState(sets: readonly SetSpec[]): SetShape['amrap'] {
  const flags = sets.map((set) => Boolean(set.amrap));
  const count = flags.filter(Boolean).length;
  if (count === 0) return 'none';
  if (count === 1 && flags[flags.length - 1]) return 'last';
  return count === sets.length ? 'all' : 'some';
}

/** Bozuk giriş (NaN) kendine eşit sayılır: yazarken düz satır düz kalır. */
function sameValue(a: number, b: number): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

/**
 * Setlerin düzeni. Düz: bütün setlerde aynı aralık, yüzde yok. Piramit: yük yüzdesi artarak
 * tam yüke çıkar, tekrar üst sınırı azalır. Back-off: ilk set tam yük, gerisi aynı yüzdede.
 * AMRAP durumu ayrı: tek sette AMRAP "son set" sayılır.
 */
export function setShape(sets: readonly SetSpec[]): SetShape {
  const amrap = amrapState(sets);
  const first = sets[0];
  const n = sets.length;
  const pcts = sets.map(pctOf);
  if (!first || sets.every((set) => sameValue(set.min, first.min) && sameValue(set.max, first.max) && isFullLoad(set))) {
    return { kind: 'straight', amrap };
  }
  if (n >= 2) {
    const rising = pcts.every((pct, index) => index === 0 || pct > (pcts[index - 1] as number));
    const falling = sets.every((set, index) => index === 0 || set.max <= (sets[index - 1] as SetSpec).max);
    const drops = sets.some((set, index) => index > 0 && set.max < (sets[index - 1] as SetSpec).max);
    if (pcts[n - 1] === 100 && rising && falling && drops) return { kind: 'pyramid', amrap };
    const rest = pcts.slice(1);
    if (pcts[0] === 100 && rest.every((pct) => pct === rest[0] && pct < 100)) return { kind: 'backoff', amrap };
  }
  return { kind: 'custom', amrap };
}

/** Düz mü (AMRAP durumu fark etmez): düzenleyicide tek "Hedef" alanıyla düzenlenir. */
export function isStraight(sets: readonly SetSpec[]): boolean {
  return setShape(sets).kind === 'straight';
}

/** Referans set: ilk tam yük seti (piramitte en ağır basamak, back-off'ta ilk set). */
export function referenceSet(sets: readonly SetSpec[]): SetSpec {
  return sets.find(isFullLoad) ?? sets[0] ?? { min: 1, max: 1 };
}

export function uniformSets(target: { min: number; max: number }, count: number): SetSpec[] {
  return Array.from({ length: count }, () => ({ min: target.min, max: target.max }));
}

function copy(set: SetSpec): SetSpec {
  return { ...set };
}

function withoutAmrap(set: SetSpec): SetSpec {
  const { amrap: _amrap, ...rest } = set;
  return rest;
}

function withoutPct(set: SetSpec): SetSpec {
  const { loadPct: _pct, ...rest } = set;
  return rest;
}

function hadLastAmrap(sets: readonly SetSpec[]): boolean {
  const state = amrapState(sets);
  return state === 'last' || state === 'all';
}

function markLastAmrap(sets: SetSpec[]): SetSpec[] {
  const last = sets.at(-1);
  if (last) sets[sets.length - 1] = { ...last, amrap: true };
  return sets;
}

/** Tam yükte set kalmadıysa en yüksek yüzdeli set tam yüke çıkar. */
function ensureTopSet(sets: SetSpec[]): SetSpec[] {
  if (sets.length === 0 || sets.some(isFullLoad)) return sets;
  let highest = 0;
  sets.forEach((set, index) => {
    if (pctOf(set) > pctOf(sets[highest] as SetSpec)) highest = index;
  });
  sets[highest] = withoutPct(sets[highest] as SetSpec);
  return sets;
}

function clampCount(count: number): number {
  return Math.min(SET_LIMITS.perRow, Math.max(1, Math.round(count)));
}

/**
 * Set sayısını değiştirir (1–10): artarken son set kopyalanır, azalırken baştan kalır.
 * "Son set AMRAP" yeni son sete geçer; tam yükte set kalmadıysa en ağır set tam yük olur.
 */
export function resizeSets(sets: readonly SetSpec[], count: number): SetSpec[] {
  const target = clampCount(count);
  const lastAmrap = amrapState(sets) === 'last';
  const base = sets.map((set, index) => (lastAmrap && index === sets.length - 1 ? withoutAmrap(set) : copy(set)));
  const tail = base.at(-1) ?? { min: 1, max: 1 };
  const next = target <= base.length ? base.slice(0, target) : [...base, ...Array.from({ length: target - base.length }, () => copy(tail))];
  ensureTopSet(next);
  return lastAmrap ? markLastAmrap(next) : next;
}

/** Bir seti siler (tek set silinmez); tam yükte set kalmadıysa en ağır set tam yük olur. */
export function removeSetAt(sets: readonly SetSpec[], index: number): SetSpec[] {
  if (sets.length <= 1 || index < 0 || index >= sets.length) return sets as SetSpec[];
  return ensureTopSet(sets.filter((_, position) => position !== index).map(copy));
}

/** Bu setin hedefini (aralığını) bütün setlere uygular; yüzde ve AMRAP kalır. */
export function targetToAll(sets: readonly SetSpec[], index: number): SetSpec[] {
  const source = sets[index];
  if (!source) return sets as SetSpec[];
  return sets.map((set) => ({ ...set, min: source.min, max: source.max }));
}

/** Düz: aynı sayıda set, referans setin aralığı, yüzde yok; "son set AMRAP" kalır. */
export function straightPreset(sets: readonly SetSpec[]): SetSpec[] {
  const next = uniformSets(referenceSet(sets), Math.max(1, sets.length));
  return hadLastAmrap(sets) ? markLastAmrap(next) : next;
}

/**
 * Piramit: yük artar, tekrar azalır; son set tam yükte referans setin alt sınırıyla. Tekrar
 * üst ucu referansın üst sınırı ya da her basamakta 2 tekrar (hangisi büyükse); yüzde
 * adımı 5 sete kadar 10, fazlasında 5 (en az %40).
 */
export function pyramidPreset(sets: readonly SetSpec[], repsMax = 100): SetSpec[] {
  const n = sets.length >= 2 ? sets.length : PRESET_MIN_SETS;
  const ref = referenceSet(sets);
  const hi = Math.min(repsMax, Math.max(ref.max, ref.min + 2 * (n - 1)));
  const step = n <= 5 ? 10 : 5;
  const next = Array.from({ length: n }, (_, i): SetSpec => {
    const reps = Math.round(hi - ((hi - ref.min) * i) / (n - 1));
    return i < n - 1
      ? { min: reps, max: reps, loadPct: Math.max(SET_LIMITS.loadPctMin, 100 - step * (n - 1 - i)) }
      : { min: reps, max: reps };
  });
  return hadLastAmrap(sets) ? markLastAmrap(next) : next;
}

/** Back-off: ilk set tam yükte, gerisi aynı aralıkta %85; "son set AMRAP" kalır. */
export function backoffPreset(sets: readonly SetSpec[]): SetSpec[] {
  const n = sets.length >= 2 ? sets.length : PRESET_MIN_SETS;
  const ref = referenceSet(sets);
  const next = Array.from({ length: n }, (_, i): SetSpec =>
    i === 0 ? { min: ref.min, max: ref.max } : { min: ref.min, max: ref.max, loadPct: BACKOFF_PCT },
  );
  return hadLastAmrap(sets) ? markLastAmrap(next) : next;
}

/** "Son set AMRAP" aç/kapa: açıkken (ya da hepsi AMRAP'ken) bütün işaretler kalkar. */
export function toggleLastAmrap(sets: readonly SetSpec[]): SetSpec[] {
  if (hadLastAmrap(sets)) return sets.map(withoutAmrap);
  return markLastAmrap(sets.map(withoutAmrap));
}

export function amrapIndexes(sets: readonly SetSpec[]): number[] {
  return sets.flatMap((set, index) => (set.amrap ? [index] : []));
}

/* --- anlatım --- */

/** Düzenleyicide yazılırken boş ya da bozuk değer gelebilir: anlatım çökmesin diye "?". */
function count(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('tr-TR') : '?';
}

function range(set: Pick<SetSpec, 'min' | 'max'>): string {
  return set.min === set.max ? count(set.min) : `${count(set.min)}–${count(set.max)}`;
}

/** Yüzde yalnız ağırlıklı harekette anlamlı: başka türde (elle yazılmış) yüzde yok sayılır. */
function effective(sets: readonly SetSpec[], trackingType: TrackingType): readonly SetSpec[] {
  return trackingType === 'weight_reps' ? sets : sets.map(withoutPct);
}

function positions(indexes: readonly number[]): string {
  return indexes.map((index) => `${index + 1}.`).join(', ');
}

/**
 * Setlerin okunur anlatımı (detay, gün planı, danışan ekranı):
 * "3 × 8–12 tekrar · son set AMRAP", "12 / 10 / 8 tekrar · piramit %80 → %100",
 * "5 / 8 / 8 tekrar · back-off %85", "30–60 / 45+ sn". Danışana "yapabildiğin kadar" yazılır.
 */
export function formatSets(sets: readonly SetSpec[], trackingType: TrackingType, audience: 'pt' | 'client' = 'pt'): string {
  const list = effective(sets, trackingType);
  const shape = setShape(list);
  const unit = trackingType === 'duration' ? 'sn' : 'tekrar';
  const client = audience === 'client';
  const first = list[0];
  if (!first) return '';

  if (shape.kind === 'straight') {
    const base = `${count(list.length)} × ${range(first)} ${unit}`;
    switch (shape.amrap) {
      case 'none':
        return base;
      case 'last':
        if (list.length === 1) return `${base} · ${client ? 'yapabildiğin kadar' : 'AMRAP'}`;
        return `${base} · ${client ? 'son sette yapabildiğin kadar' : 'son set AMRAP'}`;
      case 'all':
        return `${base} · ${client ? 'her sette yapabildiğin kadar' : 'hepsi AMRAP'}`;
      case 'some':
        return `${base} · ${client ? `${positions(amrapIndexes(list))} sette yapabildiğin kadar` : `AMRAP: ${positions(amrapIndexes(list))} set`}`;
    }
  }

  const steps = `${list.map((set) => `${range(set)}${set.amrap ? '+' : ''}`).join(' / ')} ${unit}`;
  const pcts = list.map(pctOf);
  const load =
    shape.kind === 'pyramid'
      ? ` · piramit %${count(pcts[0] as number)} → %100`
      : shape.kind === 'backoff'
        ? ` · back-off %${count(pcts[1] as number)}`
        : pcts.some((pct) => pct < 100)
          ? ` · yük ${pcts.map((pct) => `%${count(pct)}`).join(' / ')}`
          : '';
  const amrapNote = client && shape.amrap !== 'none' ? ' · +: yapabildiğin kadar' : '';
  return `${steps}${load}${amrapNote}`;
}

/**
 * Program geçmişi için kısa biçim: "3×8–12", "3×30–60 sn, son set AMRAP",
 * "12/10/8 (piramit %80/%90/%100)", "5/8/8 (back-off %85)", "8–12/8–12 (yük %70/%100)".
 */
export function setsText(sets: readonly SetSpec[], trackingType: TrackingType): string {
  const list = effective(sets, trackingType);
  const shape = setShape(list);
  const seconds = trackingType === 'duration' ? ' sn' : '';
  const first = list[0];
  if (!first) return '';

  if (shape.kind === 'straight') {
    const base = `${count(list.length)}×${range(first)}${seconds}`;
    switch (shape.amrap) {
      case 'none':
        return base;
      case 'last':
        return list.length === 1 ? `${base}, AMRAP` : `${base}, son set AMRAP`;
      case 'all':
        return `${base}, hepsi AMRAP`;
      case 'some':
        return `${base}, AMRAP: ${positions(amrapIndexes(list))} set`;
    }
  }

  const steps = `${list.map((set) => `${range(set)}${set.amrap ? '+' : ''}`).join('/')}${seconds}`;
  const pcts = list.map(pctOf);
  if (shape.kind === 'pyramid') return `${steps} (piramit ${pcts.map((pct) => `%${count(pct)}`).join('/')})`;
  if (shape.kind === 'backoff') return `${steps} (back-off %${count(pcts[1] as number)})`;
  return pcts.some((pct) => pct < 100) ? `${steps} (yük ${pcts.map((pct) => `%${count(pct)}`).join('/')})` : steps;
}

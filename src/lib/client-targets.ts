import type { ClientTarget, ClientTargets, ProgramChange, ProgramPhase } from './program-plan.ts';
import type { TrackingType } from './progression.ts';
import { isStraight, setShape, setsText, type SetSpec } from './set-plan.ts';
import type { TemplateBlock, TemplateRow } from './template-plan.ts';

/**
 * Danışanın tekrar/süre hedefi (tasarım §6.2) — saf. Bitişte "Evet, güncelle" dendiğinde düz setli
 * satırın hedefi programın kendisine değil ayrı bir katmana yazılır: `program.json` → `clientTargets`
 * (satır kimliğiyle `{ sets, baseSets, sessionId, at }`). **Revision artmaz**: PT'nin açık düzenleyicisi
 * 412 almaz, kaydedilmemiş işi boşa gitmez.
 *
 * - **Geçerli hedef:** satırın setleri hâlâ `baseSets`'e (PT'nin o anki setleri) eşitse `sets`; değilse
 *   PT satırı değiştirmiştir, hedef yok sayılır (`effectiveSets`). Antrenman ekranı, Bugün ve danışanın
 *   programı günü bununla çizer (`withClientTargets`).
 * - **PT kazanır** (`ptTargetsEdit`, PT'nin her kaydında): PT satırın setlerini ya da hareketini
 *   değiştirdiyse danışanın hedefi silinir ve PT'nin kaydına yazılır ("Şınav: danışanın hedefi (10–14)
 *   kaldırıldı"); PT danışanın hedefini aynen aldıysa "programa alındı". Satırı değişmeyen hedef kalır
 *   (öteki değişiklikler hedefi düşürmez); satırı silinen ya da zaten geçersiz hedef sessizce düşer.
 * - **Çakışma güvenliği** (`setClientTarget`): bitişte danışanın gördüğü hedef (`from`) programdaki geçerli
 *   hedefle aynı değilse (PT o arada satırı değiştirdi ya da sildi) yazılmaz; çağıran PT önerisine çevirir.
 */

/** İki setin hedefi aynı mı (aralık, yük yüzdesi, AMRAP). */
function sameSet(a: SetSpec, b: SetSpec): boolean {
  return a.min === b.min && a.max === b.max && (a.loadPct ?? null) === (b.loadPct ?? null) && Boolean(a.amrap) === Boolean(b.amrap);
}

export function sameSets(a: readonly SetSpec[], b: readonly SetSpec[]): boolean {
  return a.length === b.length && a.every((set, index) => sameSet(set, b[index] as SetSpec));
}

function copySets(sets: readonly SetSpec[]): SetSpec[] {
  return sets.map((set) => ({ ...set }));
}

/** Satırın geçerli danışan hedefi: satırın setleri hedefin dayandığı setlere eşitse; yoksa null. */
export function activeClientTarget(row: Pick<TemplateRow, 'id' | 'sets'>, targets: ClientTargets | undefined): ClientTarget | null {
  const target = targets?.[row.id];
  return target && sameSets(row.sets, target.baseSets) ? target : null;
}

/** Satırın geçerli setleri: danışanın hedefi (geçerliyse) ya da PT'ninkiler. */
export function effectiveSets(row: Pick<TemplateRow, 'id' | 'sets'>, targets: ClientTargets | undefined): SetSpec[] {
  return activeClientTarget(row, targets)?.sets ?? row.sets;
}

/** Günün blokları danışanın hedefleriyle (geçerli olanlar). Uygulanacak hedef yoksa aynı dizi. */
export function withClientTargets(blocks: readonly TemplateBlock[], targets: ClientTargets | undefined): TemplateBlock[] {
  if (!targets || Object.keys(targets).length === 0) return blocks as TemplateBlock[];
  let changed = false;
  const next = blocks.map((block) => {
    let touched = false;
    const rows = block.rows.map((row) => {
      const target = activeClientTarget(row, targets);
      if (!target) return row;
      touched = true;
      return { ...row, sets: copySets(target.sets) };
    });
    if (!touched) return block;
    changed = true;
    return { ...block, rows };
  });
  return changed ? next : (blocks as TemplateBlock[]);
}

type Located = { row: TemplateRow; dayName: string; phaseName: string };

function rowsOf(phases: readonly ProgramPhase[]): Map<string, Located> {
  return new Map(
    phases.flatMap((phase) =>
      phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => [row.id, { row, dayName: day.name, phaseName: phase.name }] as const))),
    ),
  );
}

/** Satırın programdaki yeri: satır ve günün adı (kayıt kapsamı); yoksa null. */
export function locateRow(phases: readonly ProgramPhase[], rowId: string): Located | null {
  return rowsOf(phases).get(rowId) ?? null;
}

/** Düz, AMRAP'sız, yüzdesiz setler: danışanın hedefi doğrudan yazılabilir (öteki düzenler PT'ye öneri). */
export function plainSets(sets: readonly SetSpec[]): boolean {
  return isStraight(sets) && setShape(sets).amrap === 'none' && sets.every((set) => set.loadPct === undefined);
}

/** "10–14", "40–60 sn"; düz olmayan setlerde kısa biçim ("12/10/8+"). */
export function targetLabel(sets: readonly SetSpec[], trackingType: TrackingType): string {
  const first = sets[0];
  if (!first) return '';
  if (plainSets(sets)) {
    const range = first.min === first.max ? first.min.toLocaleString('tr-TR') : `${first.min.toLocaleString('tr-TR')}–${first.max.toLocaleString('tr-TR')}`;
    return trackingType === 'duration' ? `${range} sn` : range;
  }
  return setsText(sets, trackingType);
}

/**
 * Programın geçerli danışan hedefleri, satır kimliğiyle: metin ("hedef 10–14"), setler ve dayandığı setler,
 * yazıldığı an. PT'nin program sayfası ve düzenleyicisi rozeti bununla çizer.
 */
export function clientTargetNotes(
  phases: readonly ProgramPhase[],
  targets: ClientTargets | undefined,
  trackingOf: (exerciseId: string) => TrackingType,
): Record<string, { text: string; sets: SetSpec[]; baseSets: SetSpec[]; at: string }> {
  const live = liveClientTargets(phases, targets);
  const rows = rowsOf(phases);
  return Object.fromEntries(
    Object.entries(live ?? {}).flatMap(([rowId, target]) => {
      const found = rows.get(rowId);
      if (!found) return [];
      return [[rowId, { text: `hedef ${targetLabel(target.sets, trackingOf(found.row.exerciseId))}`, sets: target.sets, baseSets: target.baseSets, at: target.at }]];
    }),
  );
}

/**
 * Düzenleyicide satırın bugünkü setleri karşısında danışanın hedefi: `active` (PT dokunmadı, hedef
 * geçerli), `adopted` (PT danışanın hedefini aldı; kaydedince programa yazılır), `replaced` (PT başka
 * bir şey yazdı; kaydedince danışanın hedefi kalkar).
 */
export function clientTargetState(currentSets: readonly SetSpec[], target: Pick<ClientTarget, 'sets' | 'baseSets'>): 'active' | 'adopted' | 'replaced' {
  if (sameSets(currentSets, target.baseSets)) return 'active';
  return sameSets(currentSets, target.sets) ? 'adopted' : 'replaced';
}

/** Program boyunca geçerli hedefler (satırı olan ve setleri tutan); hiç yoksa undefined. */
export function liveClientTargets(phases: readonly ProgramPhase[], targets: ClientTargets | undefined): ClientTargets | undefined {
  if (!targets) return undefined;
  const rows = rowsOf(phases);
  const live = Object.fromEntries(Object.entries(targets).filter(([rowId, target]) => {
    const found = rows.get(rowId);
    return found !== undefined && sameSets(found.row.sets, target.baseSets);
  }));
  return Object.keys(live).length > 0 ? live : undefined;
}

/**
 * PT'nin kaydı (`applyProgramEdit`): PT kazanır. Kayıttaki geçerli hedeflerden satırı değişmeyenler kalır;
 * satırın setleri ya da hareketi değiştiyse hedef düşer ve cümlesi PT'nin kaydına girer (kapsam günün
 * adı, `diffProgram` gibi). `titleOf`: egzersizin adı, `trackingOf`: kayıt türü.
 */
export function ptTargetsEdit(
  storedPhases: readonly ProgramPhase[],
  nextPhases: readonly ProgramPhase[],
  targets: ClientTargets | undefined,
  ctx: { titleOf: (exerciseId: string) => string; trackingOf: (exerciseId: string) => TrackingType; multiPhase: boolean },
): { clientTargets: ClientTargets | undefined; changes: ProgramChange[] } {
  const live = liveClientTargets(storedPhases, targets);
  if (!live) return { clientTargets: undefined, changes: [] };
  const before = rowsOf(storedPhases);
  const after = rowsOf(nextPhases);
  const kept: ClientTargets = {};
  const changes: ProgramChange[] = [];
  for (const [rowId, target] of Object.entries(live)) {
    const old = before.get(rowId);
    const next = after.get(rowId);
    // Satır silindi: farkın "… çıkarıldı" cümlesi yeter.
    if (!old || !next) continue;
    if (next.row.exerciseId === old.row.exerciseId && sameSets(next.row.sets, old.row.sets)) {
      kept[rowId] = target;
      continue;
    }
    const title = ctx.titleOf(old.row.exerciseId);
    const scope = ctx.multiPhase ? `${next.phaseName} · ${next.dayName}` : next.dayName;
    const adopted = next.row.exerciseId === old.row.exerciseId && sameSets(next.row.sets, target.sets);
    changes.push({
      scope,
      text: adopted
        ? `${title}: danışanın hedefi programa alındı`
        : `${title}: danışanın hedefi (${targetLabel(target.sets, ctx.trackingOf(old.row.exerciseId))}) kaldırıldı`,
    });
  }
  return { clientTargets: Object.keys(kept).length > 0 ? kept : undefined, changes };
}

export type SetClientTargetResult =
  | { status: 'set' | 'cleared'; clientTargets: ClientTargets | undefined; row: TemplateRow; dayName: string }
  /** Danışanın gördüğü hedef programdakiyle aynı değil (ya da satır yok): yazılmaz, öneriye döner. */
  | { status: 'conflict' };

/**
 * Bitişte "Evet, güncelle": satırın hedefi danışanın katmanına yazılır. `from` danışanın antrenmanda
 * gördüğü (geçerli) setlerdir; programdakiyle aynı değilse çakışma. Yeni hedef PT'nin setleriyle aynıysa
 * katman silinir (danışan PT'nin hedefine döndü). Yalnız düz, AMRAP'sız ve set sayısı aynı hedef yazılır.
 */
export function setClientTarget(
  phases: readonly ProgramPhase[],
  targets: ClientTargets | undefined,
  input: { rowId: string; from: readonly SetSpec[]; to: readonly SetSpec[]; sessionId: string; at: string },
): SetClientTargetResult {
  const found = locateRow(phases, input.rowId);
  if (!found) return { status: 'conflict' };
  const { row } = found;
  const current = effectiveSets(row, targets);
  if (!sameSets(current, input.from) || !plainSets(row.sets) || !plainSets(input.to) || input.to.length !== row.sets.length) return { status: 'conflict' };
  const { [input.rowId]: _dropped, ...rest } = targets ?? {};
  if (sameSets(input.to, row.sets)) {
    return { status: 'cleared', clientTargets: Object.keys(rest).length > 0 ? rest : undefined, row, dayName: found.dayName };
  }
  const target: ClientTarget = { sets: copySets(input.to), baseSets: copySets(row.sets), sessionId: input.sessionId, at: input.at };
  return { status: 'set', clientTargets: { ...rest, [input.rowId]: target }, row, dayName: found.dayName };
}

import * as v from 'valibot';
import { OWN_PROGRAM_ID_PATTERN } from './program-plan.ts';
import { ownProgramIdOfPath, ownSummaryOf, type OwnProgram } from './own-programs.ts';
import { ownIndexActiveSchema, ownIndexEventSchema, ownIndexItemSchema, ownProgramSchema } from './schemas/own-program.ts';

/**
 * `own-programs-index.json` (`docs/design/kendi-program.md` §5.3) — saf. Programlar listesi, Bugün'ün programı
 * (kalıcı seçim, `active`) ve paylaşılmış programların olayları tek dosyada: Bugün, Programlar, PT'nin Program
 * sekmesi ve Genel bakış'ın özeti programları dosya açmadan bilir.
 *
 * - Index türetilmiş veridir: satır satır okunur, uymayan satır düşer. Okunurken `own-programs/` ağacıyla
 *   karşılaştırılır (`repairOwnIndex`): satırı olmayan ya da `sha`'sı dosyanınkinden farklı dosya okunup satırı
 *   dosyadan kurulur (paylaşım dahil), dosyası olmayan satır düşer. Okunamayan dosya listede ayrıca durur
 *   ("okunamadı", silinebilir); seçilemez.
 * - Her program yazımı (bitiş dahil) index'i aynı commit'te yazar: satırın `sha`'sı dosyanın yeni metninden.
 * - `active` yok olan (ya da okunamayan) programı gösteriyorsa PT'nin programı geçerlidir (`activeProgramId`).
 * - Olaylar yalnız paylaşılmış programlar için (paylaşımı kapattı, sildi): 30 gün, en çok 20.
 *
 * `gitBlobSha` burada çağrılmaz (tarayıcıya `node:crypto` girmesin): `sha`'yı çağıran verir.
 */

export type OwnIndexItem = v.InferOutput<typeof ownIndexItemSchema>;
export type OwnIndexActive = v.InferOutput<typeof ownIndexActiveSchema>;
export type OwnIndexEvent = v.InferOutput<typeof ownIndexEventSchema>;
export type OwnIndex = { version: 1; active?: OwnIndexActive; items: OwnIndexItem[]; events: OwnIndexEvent[] };

export const OWN_EVENT_DAYS = 30;
export const OWN_EVENTS_MAX = 20;
/** Danışanın "Antrenörün düzenledi" satırı ve rozeti bu kadar gün (§7.2). */
export const PT_EDIT_NOTICE_DAYS = 14;

const DAY_MS = 86_400_000;

function time(iso: string | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function emptyOwnIndex(): OwnIndex {
  return { version: 1, items: [], events: [] };
}

/** Satırlar oluşturulma sırasıyla (seçim değişince liste zıplamaz), eşitlikte kimlik. */
function sortItems(items: OwnIndexItem[]): OwnIndexItem[] {
  return items.sort((a, b) => time(a.createdAt) - time(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Hoşgörülü okuma: uymayan satır ve olay düşer (dosyalardan yeniden kurulur); bozuk seçim yok sayılır. */
export function parseOwnIndex(raw: unknown): { index: OwnIndex; dropped: number } {
  const record = isRecord(raw) ? raw : {};
  const items: OwnIndexItem[] = [];
  const events: OwnIndexEvent[] = [];
  let dropped = 0;
  for (const row of Array.isArray(record.items) ? record.items : []) {
    const parsed = v.safeParse(ownIndexItemSchema, row);
    if (parsed.success && !items.some((item) => item.id === parsed.output.id)) items.push(parsed.output);
    else dropped += 1;
  }
  for (const row of Array.isArray(record.events) ? record.events : []) {
    const parsed = v.safeParse(ownIndexEventSchema, row);
    if (parsed.success) events.push(parsed.output);
    else dropped += 1;
  }
  const active = v.safeParse(ownIndexActiveSchema, record.active);
  return { index: { version: 1, ...(active.success ? { active: active.output } : {}), items: sortItems(items), events }, dropped };
}

/** Programın index satırı; `sha` dosyanın blob kimliği. Bildirim anları önceki satırdan kalır. */
export function ownIndexItemOf(program: OwnProgram, sha: string, previous?: Pick<OwnIndexItem, 'ptEditedAt' | 'clientEditedAt'> | null): OwnIndexItem {
  const summary = ownSummaryOf(program);
  return {
    id: program.id,
    name: program.name,
    sha,
    days: summary.days,
    ...(summary.daysPerWeek !== undefined ? { daysPerWeek: summary.daysPerWeek } : {}),
    weekdays: summary.weekdays,
    ...(program.schedule?.at ? { weekdaysAt: program.schedule.at } : {}),
    revision: program.revision,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
    ...(program.shared ? { shared: { at: program.shared.at } } : {}),
    ...(program.shared && previous?.ptEditedAt ? { ptEditedAt: previous.ptEditedAt } : {}),
    ...(program.shared && previous?.clientEditedAt ? { clientEditedAt: previous.clientEditedAt } : {}),
  };
}

/** Satırı ekler ya da değiştirir (kimlikle); sıra oluşturulma anından. */
export function upsertOwnItem(index: OwnIndex, item: OwnIndexItem): OwnIndex {
  return { ...index, items: sortItems([...index.items.filter((row) => row.id !== item.id), item]) };
}

/** Olay ekler: 30 günden eskiler ve en yeni 20'nin dışındakiler düşer. */
export function addOwnEvent(index: OwnIndex, event: OwnIndexEvent, now: Date): OwnIndex {
  const from = now.getTime() - OWN_EVENT_DAYS * DAY_MS;
  const events = [...index.events, event]
    .filter((item) => time(item.at) >= from)
    .sort((a, b) => time(b.at) - time(a.at))
    .slice(0, OWN_EVENTS_MAX);
  return { ...index, events };
}

/**
 * Silme (§3.7): satır düşer; Bugün'ün programıysa seçim PT'nin programına döner (an yenilenir: PT'ye "Antrenörün
 * programına döndü"); paylaşılmışsa `deleted` olayı.
 */
export function removeOwnItem(index: OwnIndex, id: string, now: Date): OwnIndex {
  const item = index.items.find((row) => row.id === id);
  let next: OwnIndex = { ...index, items: index.items.filter((row) => row.id !== id) };
  if (index.active?.programId === id) next = { ...next, active: { programId: null, at: now.toISOString() } };
  if (item?.shared) next = addOwnEvent(next, { kind: 'deleted', id, name: item.name, at: now.toISOString() }, now);
  return next;
}

/** Kalıcı seçim (§3.2): aynıysa null (yazılmaz). */
export function withActive(index: OwnIndex, programId: string | null, now: Date): OwnIndex | null {
  const current = index.active?.programId ?? null;
  if (current === programId && (programId === null || index.items.some((item) => item.id === programId))) return null;
  return { ...index, active: { programId, at: now.toISOString() } };
}

/** Bugün'ün programı: seçili ve listede olan kendi program; yoksa null (PT'nin programı). */
export function activeProgramId(index: OwnIndex | null | undefined): string | null {
  const id = index?.active?.programId ?? null;
  return id && index?.items.some((item) => item.id === id) ? id : null;
}

/**
 * Bugün'de gösterilecek program (yarım antrenman yokken; §2.6, §3.2): adresteki (`pt` ya da listede olan kendi
 * program, "Yalnız bugün"), yoksa kalıcı seçim; null PT'nin programı. `oneOff`: kalıcı seçimden farklı. Kalıcı seçim
 * okunamayan dosyayı gösteriyorsa (onarımda listeden düştü) `broken` onun adıyla: PT'nin programı gösterilir.
 */
export function shownProgram(
  index: OwnIndex,
  unreadable: readonly Pick<UnreadableOwnProgram, 'id' | 'name'>[],
  param: string | null,
): { shown: string | null; oneOff: boolean; broken?: { name: string | null } } {
  const active = activeProgramId(index);
  let shown = active;
  if (param === 'pt') shown = null;
  else if (param && OWN_PROGRAM_ID_PATTERN.test(param) && index.items.some((item) => item.id === param)) shown = param;
  else if (!param) {
    const selected = index.active?.programId;
    const broken = selected ? unreadable.find((item) => item.id === selected) : undefined;
    if (broken) return { shown: null, oneOff: false, broken: { name: broken.name } };
  }
  return { shown, oneOff: shown !== active };
}

export function activeItem(index: OwnIndex | null | undefined): OwnIndexItem | null {
  const id = activeProgramId(index);
  return id ? (index?.items.find((item) => item.id === id) ?? null) : null;
}

/** Okunamayan program dosyası: listede "okunamadı" satırı (silinebilir). */
export type UnreadableOwnProgram = { id: string; name: string | null; problem: string };

export type OwnRepair = {
  index: OwnIndex;
  /** Index'in içeriği değişti mi (bir sonraki program yazımına biner). */
  changed: boolean;
  unreadable: UnreadableOwnProgram[];
  /** Onarımda okunan programlar (kimlikle): çağıran yeniden okumaz. */
  programs: Map<string, OwnProgram>;
};

/** Dosyanın okunmuş hâli: program ya da sorun (bozuk JSON, şemaya uymuyor, kimlik dosya adıyla uyuşmuyor). */
export function parseOwnProgramFile(id: string, raw: unknown): { program: OwnProgram; problem: null } | { program: null; name: string | null; problem: string } {
  const name = isRecord(raw) && typeof raw.name === 'string' ? raw.name : null;
  const parsed = v.safeParse(ownProgramSchema, raw);
  if (!parsed.success) {
    const issue = parsed.issues[0];
    return { program: null, name, problem: `${v.getDotPath(issue) ?? 'dosya'}: ${issue.message}` };
  }
  if (parsed.output.id !== id) return { program: null, name, problem: 'Dosyadaki kimlik dosya adıyla uyuşmuyor.' };
  return { program: parsed.output as OwnProgram, problem: null };
}

/**
 * Index'i `own-programs/` klasörünün dosyalarıyla karşılaştırıp onarır. Yalnız farklı olanlar okunur (blob
 * kimliğiyle); okunamayan dosyanın satırı listeden düşer, `unreadable`'da durur. Dosyası olmayan satır düşer.
 */
export async function repairOwnIndex(
  index: OwnIndex,
  files: readonly { path: string; sha: string }[],
  read: (file: { path: string; sha: string }) => Promise<unknown>,
): Promise<OwnRepair> {
  const rows = new Map(index.items.map((item) => [item.id, item]));
  const items: OwnIndexItem[] = [];
  const unreadable: UnreadableOwnProgram[] = [];
  const programs = new Map<string, OwnProgram>();
  for (const file of files) {
    const id = ownProgramIdOfPath(file.path);
    if (!id) continue;
    const row = rows.get(id);
    if (row && row.sha === file.sha) {
      items.push(row);
      continue;
    }
    let raw: unknown;
    try {
      raw = await read(file);
    } catch {
      unreadable.push({ id, name: row?.name ?? null, problem: 'Dosya JSON olarak okunamadı.' });
      continue;
    }
    const parsed = parseOwnProgramFile(id, raw);
    if (!parsed.program) {
      unreadable.push({ id, name: parsed.name ?? row?.name ?? null, problem: parsed.problem });
      continue;
    }
    programs.set(id, parsed.program);
    items.push(ownIndexItemOf(parsed.program, file.sha, row));
  }
  const repaired: OwnIndex = { ...index, items: sortItems(items) };
  return { index: repaired, changed: JSON.stringify(repaired) !== JSON.stringify(index), unreadable, programs };
}

/* --- bildirimler --- */

/** Danışana: PT'nin son 14 gündeki düzenlemeleri (paylaşılmış programlarda; §7.2), en yeniden eskiye. */
export function ptEdits(index: OwnIndex | null | undefined, now: Date, days = PT_EDIT_NOTICE_DAYS): { id: string; name: string; at: string }[] {
  const from = now.getTime() - days * DAY_MS;
  return (index?.items ?? [])
    .flatMap((item) => (item.shared && item.ptEditedAt && time(item.ptEditedAt) >= from ? [{ id: item.id, name: item.name, at: item.ptEditedAt }] : []))
    .sort((a, b) => time(b.at) - time(a.at));
}

/** Programı olan her kimliğin adı (seçim sheet'i, Geçmiş'in rozeti): listede olanlar. */
export function ownNames(index: OwnIndex | null | undefined): Map<string, string> {
  return new Map((index?.items ?? []).map((item) => [item.id, item.name]));
}

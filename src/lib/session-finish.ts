import * as v from 'valibot';
import { canRecordHealth } from './client-status.ts';
import { todayIn } from './format.ts';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { completeDay } from './program-plan.ts';
import type { Client } from './schemas/client.ts';
import { healthRecordSchema, type HealthRecord } from './schemas/health.ts';
import { programSchema, type Program } from './schemas/program.ts';
import {
  SESSIONS_INDEX_PATH,
  sessionPath,
  type FinishHealth,
  type PatchBody,
  type RotationChoice,
  type SessionDoc,
  type SessionIndex,
  type SessionNotice,
} from './schemas/session.ts';
import { indexRowOf, upsertIndexRow } from './session-index.ts';
import { mergeAll, normalizeSession, sameSessionData, withDeletions } from './session-merge.ts';
import { finishMessage, patchMessage, putMessage } from './session-messages.ts';
import type { TemplateBody } from './template-plan.ts';
import { workoutUnits } from './workout-cursor.ts';

/**
 * Antrenman yazımlarının saf hesapları (tasarım §4.3–§4.7): sunucunun gelen belgeyi nasıl kabul ettiği,
 * `PUT`'ta birleşik belge ve commit mesajı, bitişte tek commit'e giren dosyaların yeni hâlleri, geçmişte
 * düzeltme. Okuma ve yazma `sessions-core.ts`'te.
 *
 * Sunucu telefona güvenmez: tarih ilk yazımda sunucunun saat diliminden (`todayIn`), PUT belgeyi hep
 * etkin sayar (bitiş yalnız bitiş ucundan), bitiş anı akla yatkın değilse sunucunun anı, sağlık ayrıntısı
 * yalnız onay varsa ve yalnız `health.json`'a.
 */

const PROGRAM_PATH = 'program.json';
const HEALTH_PATH = 'health.json';
/** Telefonun saatine tanınan pay. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** Başlangıç anı bu kadar eskiyse tarih ondan değil, sunucunun anından. */
const START_WINDOW_MS = 12 * 60 * 60 * 1000;

function time(iso: string | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

/**
 * Antrenmanın günü (uygulamanın saat diliminde): başlangıç anı akla yatkınsa ondan (gece yarısını geçen
 * antrenman başlangıç gününde kalır), değilse sunucunun anından. Yol kimlikten olduğu için telefonun
 * saati yanlış olsa da ikinci dosya açılmaz.
 */
export function sessionDateFor(startedAt: string, now: Date, timeZone: string): string {
  const started = Date.parse(startedAt);
  const plausible = !Number.isNaN(started) && started <= now.getTime() + CLOCK_SKEW_MS && started >= now.getTime() - START_WINDOW_MS;
  return todayIn(timeZone, plausible ? new Date(started) : now);
}

/** Bitiş anı: telefonun bildirdiği (çevrimdışı bitiş sonra gelir), başlangıçtan önce ya da gelecekteyse şimdi. */
export function finishedAtFor(finishedAt: string | undefined, startedAt: string, now: Date): string {
  const at = finishedAt ? Date.parse(finishedAt) : Number.NaN;
  if (Number.isNaN(at) || at > now.getTime() + CLOCK_SKEW_MS || at < time(startedAt)) return now.toISOString();
  return finishedAt as string;
}

type Context = { now: Date; timeZone: string };

/** Gelen belge sunucunun gözüyle: tarih kayıttaki (yoksa sunucunun), durum etkin, bitiş anı yok. */
export function prepareIncoming(incoming: SessionDoc, stored: SessionDoc | null, ctx: Context): SessionDoc {
  const { finishedAt: _finishedAt, ...rest } = incoming;
  return { ...rest, status: 'active', date: stored?.date ?? sessionDateFor(incoming.startedAt, ctx.now, ctx.timeZone) };
}

/**
 * `PUT`: kayıttakiyle birleşik belge. `changed` false ise yazılmaz (aynı belgeyi yeniden göndermek bedava).
 * `writer` isteğin cihazıdır; karşılaştırmaya girmez.
 */
export function planPut(stored: SessionDoc | null, incoming: SessionDoc, ctx: Context): { doc: SessionDoc; changed: boolean; message: string } {
  const prepared = prepareIncoming(incoming, stored, ctx);
  const merged = { ...(mergeAll(stored ? [stored, prepared] : [prepared]) as SessionDoc), writer: incoming.writer };
  return { doc: merged, changed: !stored || !sameSessionData(stored, merged), message: putMessage(stored, merged) };
}

/* --- bitiş --- */

/** Programdaki gün (bütün evrelerde aranır); bulunamazsa null. */
function dayOf(program: Program | null, dayId: string | undefined): TemplateBody | null {
  if (!program || !dayId) return null;
  for (const phase of program.phases) {
    const day = phase.days.find((item) => item.id === dayId);
    if (day) return { blocks: day.blocks };
  }
  return null;
}

/**
 * Yapılan ve planlanan çalışma setleri: geçilen hareketin setleri de planda sayılır (yarım antrenman).
 * Plan satırının set sayısı o günkü plandan (`plannedSetCount`), yoksa programdaki günden; gün
 * bulunamazsa (program değişti) yalnız kayıttan.
 */
export function completion(doc: Pick<SessionDoc, 'entries' | 'order'>, day: TemplateBody | null): { done: number; planned: number } {
  const members = workoutUnits(day ?? { blocks: [] }, doc).flatMap((unit) => unit.members);
  return {
    done: members.reduce((sum, member) => sum + Math.min(member.done, member.planned), 0),
    planned: members.reduce((sum, member) => sum + member.planned, 0),
  };
}

/** Hazır seçim (§2.7): planın yarısı yapıldıysa sıradaki gün, değilse aynı gün sırada kalır. */
export function defaultRotation(done: number, planned: number): RotationChoice {
  return planned === 0 || done * 2 >= planned ? 'advance' : 'keep';
}

/** Onayın izin verdiği sağlık ayrıntısı; hiçbiri yoksa null. Ağrı `check_in`, hazır oluşluk `readiness` parçası. */
export function allowedHealth(client: Pick<Client, 'modules' | 'consents'>, health: FinishHealth | undefined): FinishHealth | null {
  if (!health) return null;
  const pain = canRecordHealth(client, 'check_in');
  const skippedRows = pain && health.skippedRows?.length ? health.skippedRows : undefined;
  const adjustReason =
    health.adjustReason === 'pain' ? (pain ? 'pain' : undefined) : health.adjustReason === 'readiness' && canRecordHealth(client, 'readiness') ? 'readiness' : undefined;
  if (!skippedRows && !adjustReason) return null;
  return { ...(skippedRows ? { skippedRows } : {}), ...(adjustReason ? { adjustReason } : {}) };
}

/** Seansa bağlı yoklama kaydı: aynı `sessionId`'li kayıt varsa güncellenir (bitişin yeniden denenmesi çoğaltmaz). */
export function withSessionCheckIn(record: HealthRecord, input: { sessionId: string; date: string; health: FinishHealth }): HealthRecord {
  const existing = record.checkIns.find((item) => item.sessionId === input.sessionId);
  const next = {
    ...(existing ?? { date: input.date }),
    sessionId: input.sessionId,
    ...(input.health.skippedRows ? { skippedRows: input.health.skippedRows } : {}),
    ...(input.health.adjustReason ? { adjustReason: input.health.adjustReason } : {}),
  };
  return {
    ...record,
    checkIns: existing ? record.checkIns.map((item) => (item === existing ? next : item)) : [...record.checkIns, next],
  };
}

/** Bozuk health.json yeni kayıtla ezilmesin: okunamayan dosyanın işareti, `planFinish` 'broken' der. */
export const BROKEN_HEALTH = Symbol('broken-health');

export type FinishInput = {
  /** Kayıttaki etkin belge; dosya yoksa null (çevrimdışı bitiş: ilk yazma bitiş). */
  stored: SessionDoc | null;
  incoming: SessionDoc;
  rotation?: RotationChoice | undefined;
  health?: FinishHealth | undefined;
  /** Onarılmış index. */
  index: SessionIndex;
  /** `program.json`'un ham içeriği (yoksa null). */
  program: unknown;
  /** `health.json`'un ham içeriği: yalnız onaylı ayrıntı varsa okunur (yoksa ya da okunmadıysa null; bozuk JSON'sa `BROKEN_HEALTH`). */
  healthFile: unknown;
  client: Pick<Client, 'modules' | 'consents'>;
  now: Date;
  timeZone: string;
};

export type FinishPlan = {
  doc: SessionDoc;
  files: { path: string; content: unknown }[];
  message: string;
  rotation: { choice: RotationChoice; applied: boolean };
  /** Sağlık ayrıntısı: yazıldı, onay olmadığı için atıldı, yoktu, `health.json` okunamadığı için yazılamadı. */
  health: 'written' | 'dropped' | 'none' | 'broken';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withNotice(notices: readonly SessionNotice[], notice: SessionNotice): SessionNotice[] {
  return notices.some((item) => item.kind === notice.kind) ? [...notices] : [...notices, notice];
}

/**
 * Bitişin tek commit'i (§4.7): seans `finished` + index satırı + (rotasyon ilerlediyse) `program.json` +
 * (onaylı sağlık ayrıntısı varsa) `health.json`. Dört dosya ya birlikte yazılır ya hiçbiri.
 *
 * Rotasyon zamanla korunur: `completeDay` yalnız seansın başlangıcı programdaki son tamamlanmadan
 * sonraysa uygulanır; çevrimdışı kuyrukta bekleyip sonraki antrenmandan sonra gelen bitiş sırayı geri
 * almaz. Program dosyası ham hâliyle korunur, yalnız `rotation` değişir (revision artmaz; bilinmeyen
 * alanlar düşmez).
 */
export function planFinish(input: FinishInput): FinishPlan {
  const { now } = input;
  const base = prepareIncoming(input.incoming, input.stored, input);
  const prepared: SessionDoc = { ...base, status: 'finished', finishedAt: finishedAtFor(input.incoming.finishedAt, base.startedAt, now) };
  let doc = { ...(mergeAll(input.stored ? [input.stored, prepared] : [prepared]) as SessionDoc), writer: input.incoming.writer };

  const programParsed = input.program === null ? null : v.safeParse(programSchema, input.program);
  const program = programParsed?.success ? programParsed.output : null;
  const { done, planned } = completion(doc, dayOf(program, doc.program?.dayId));

  const choice = input.rotation ?? doc.rotation?.value ?? defaultRotation(done, planned);
  if (input.rotation || !doc.rotation) doc = { ...doc, rotation: { value: choice, updatedAt: now.toISOString(), by: doc.writer } };

  let notices = doc.notices;
  if (done < planned) notices = withNotice(notices, { kind: 'unfinished', at: doc.finishedAt as string });
  if (doc.program?.plannedDayId && doc.program.plannedDayId !== doc.program.dayId) {
    notices = withNotice(notices, { kind: 'other_day', at: doc.startedAt });
  }
  doc = normalizeSession({ ...doc, notices });

  const files: { path: string; content: unknown }[] = [{ path: sessionPath(doc.id), content: doc }];
  const sha = gitBlobSha(jsonText(doc));
  files.push({ path: SESSIONS_INDEX_PATH, content: upsertIndexRow(input.index, indexRowOf(doc, sha)) });

  let applied = false;
  if (choice === 'advance' && program && doc.program) {
    const last = program.rotation.lastCompletedAt;
    if (!last || time(doc.startedAt) > time(last)) {
      const next = completeDay(program, doc.program.dayId, new Date(doc.finishedAt as string));
      if (next !== program) {
        const raw = isRecord(input.program) && input.program.version === 2 ? input.program : program;
        files.push({ path: PROGRAM_PATH, content: { ...raw, rotation: next.rotation } });
        applied = true;
      }
    }
  }

  let health: FinishPlan['health'] = input.health ? 'dropped' : 'none';
  const allowed = allowedHealth(input.client, input.health);
  if (allowed) {
    const unreadable = input.healthFile === BROKEN_HEALTH;
    const parsed = input.healthFile === null || unreadable ? null : v.safeParse(healthRecordSchema, input.healthFile);
    if (unreadable || (parsed && !parsed.success)) health = 'broken';
    else {
      const record = parsed?.output ?? { conditions: [], checkIns: [], measurements: [], movementScreens: [] };
      files.push({ path: HEALTH_PATH, content: withSessionCheckIn(record, { sessionId: doc.id, date: doc.date, health: allowed }) });
      health = 'written';
    }
  }

  return { doc, files, message: finishMessage(doc), rotation: { choice, applied }, health };
}

/* --- geçmişte düzeltme --- */

/**
 * `PATCH`: silme (kalıcı iz), başka cihazda bitirilen seansa telefondaki setleri ekleme (kimlikle;
 * silinenler geri gelmez), seans zorluğu (son yazan kazanır), su dokunuşları. Hepsi birleştirmeden geçer.
 */
export function applyPatch(stored: SessionDoc, body: PatchBody, now: Date): { doc: SessionDoc; changed: boolean; message: string } {
  const variants: SessionDoc[] = [stored];
  if (body.addSets?.length) variants.push({ ...stored, entries: body.addSets });
  if (body.waterTaps?.length) variants.push({ ...stored, waterTaps: body.waterTaps });
  if (body.effort) {
    const sessionRpe = body.effort.sessionRpe ?? stored.effort?.sessionRpe;
    const durationMin = body.effort.durationMin ?? stored.effort?.durationMin;
    variants.push({
      ...stored,
      effort: { ...(sessionRpe !== undefined ? { sessionRpe } : {}), ...(durationMin !== undefined ? { durationMin } : {}), updatedAt: now.toISOString(), by: body.writer },
    });
  }
  let doc = mergeAll(variants) as SessionDoc;
  if (body.deleteSetIds?.length || body.deleteEntryIds?.length) {
    doc = withDeletions(doc, { setIds: body.deleteSetIds ?? [], entryIds: body.deleteEntryIds ?? [] });
  }
  doc = { ...doc, writer: body.writer };
  return { doc, changed: !sameSessionData(stored, doc), message: patchMessage(stored, doc) };
}

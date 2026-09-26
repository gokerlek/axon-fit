import 'server-only';
import { listDevices } from './devices';
import { listExercises } from './exercises';
import { exerciseSetWeights, isBodyMuscle, summarizeMuscles } from './muscles';
import { readProgramFile } from './programs';
import { readProposals } from './proposals-store';
import type { Muscle } from './schemas/exercise';
import type { Program } from './schemas/program';
import { SESSION_ID_PATTERN, type SessionDoc } from './schemas/session';
import { readIndex, readSession } from './session-files-core';
import { sessionRepo } from './session-files';
import { historyList, type HistoryList } from './session-history';
import { buildWorkoutDay, weekOf } from './workout-plan';
import { readHistory } from './workout-routes';
import { nextTimeLines, sessionChanges, sessionSummary, summaryWeek, type ChangeLine, type NextLine, type SessionSummary } from './workout-summary';

/**
 * Geçmiş ve özet sayfalarının okuması (tasarım §2.8, §2.10) — danışanın repo'suna bağlama. Hesaplar saf
 * modüllerde (`workout-summary.ts`, `session-history.ts`, `session-records.ts`); burada yalnız dosyalar
 * okunur. Index her okumada `sessions/` ağacıyla onarılır (yazılmaz; onarım sonraki commit'e biner).
 * Silme ve düzeltme `PATCH`/`DELETE /api/me/sessions/[id]` ile (`session-routes.ts`).
 */

export type SessionLoad<T> = { status: 'ok'; value: T } | { status: 'missing' | 'deleted' | 'active' };

/** Geçmiş listesi (index'ten, tek okuma). */
export async function loadHistory(clientId: string, timeZone: string): Promise<HistoryList> {
  const { index } = await readIndex(sessionRepo(clientId));
  return historyList(index, new Date(), timeZone);
}

/** Bitmiş antrenmanın belgesi; kimlik biçimi yanlışsa ya da dosya yoksa `missing`, silinmişse `deleted`. */
async function readFinished(clientId: string, id: string): Promise<SessionLoad<SessionDoc>> {
  if (!SESSION_ID_PATTERN.test(id)) return { status: 'missing' };
  const read = await readSession(sessionRepo(clientId), id);
  if (read.status !== 'ok') return { status: read.status };
  return read.doc.status === 'finished' ? { status: 'ok', value: read.doc } : { status: 'active' };
}

/** Antrenmanın program değişiklikleri: danışan kaydı ve önerileri (okunamazsa boş; sayfa durmaz). */
async function changesOf(clientId: string, id: string, program: Program | null): Promise<ChangeLine[]> {
  const proposals = await readProposals(clientId).catch(() => null);
  return sessionChanges({ sessionId: id, log: program?.log ?? [], proposals: proposals?.file.items ?? [] });
}

async function programOf(clientId: string): Promise<Program | null> {
  return (await readProgramFile(clientId).catch(() => null))?.program ?? null;
}

/** Geçmiş detayı: belge ve program değişiklikleri (düzenleme telefonda belgeden yeniden çizilir). */
export async function loadDetail(clientId: string, id: string): Promise<SessionLoad<{ doc: SessionDoc; changes: ChangeLine[] }>> {
  const [loaded, program] = await Promise.all([readFinished(clientId, id), programOf(clientId)]);
  if (loaded.status !== 'ok') return loaded;
  return { status: 'ok', value: { doc: loaded.value, changes: await changesOf(clientId, id, program) } };
}

/**
 * Özet karuseli: antrenman, onarılmış index (rekorlar, geçen sefer, hafta), kütüphane (kaslar), program
 * (hafta hedefi, değişiklikler). "Gelecek sefer" yalnız en yeni bitmiş antrenmanda: öneri motorunun o günün
 * bu antrenman dahil planı (`buildWorkoutDay`, antrenman ekranıyla aynı).
 */
export async function loadSummary(clientId: string, id: string, timeZone: string): Promise<SessionLoad<SessionSummary>> {
  const repo = sessionRepo(clientId);
  const [loaded, repaired, program, exercises] = await Promise.all([readFinished(clientId, id), readIndex(repo), programOf(clientId), listExercises()]);
  if (loaded.status !== 'ok') return loaded;
  const doc = loaded.value;
  const index = repaired.index;
  const now = new Date();
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  let next: NextLine[] | null = null;
  const latest = index.items
    .filter((row) => row.finishedAt)
    .sort((a, b) => Date.parse(b.startedAt ?? b.date) - Date.parse(a.startedAt ?? a.date))[0];
  const dayId = doc.program?.dayId;
  if (program && dayId && latest?.id === doc.id) {
    const [devices, history] = await Promise.all([listDevices(), readHistory(repo, index, new Set(doc.entries.map((entry) => entry.exerciseId)))]);
    const day = buildWorkoutDay({ program, dayId, exercises: byId, devices: new Map(devices.map((device) => [device.id, device])), history });
    if (day?.dayId === dayId) next = nextTimeLines(day, doc);
  }

  const summary = sessionSummary({
    doc,
    index,
    timeZone,
    exercises: byId,
    setWeightsOf: exerciseSetWeights,
    muscleLabels: (muscles) => summarizeMuscles(muscles.filter((muscle): muscle is Muscle => isBodyMuscle(muscle as Muscle)) as Muscle[]),
    week: summaryWeek(index, doc.date, weekOf(index, program, now, timeZone)),
    changes: await changesOf(clientId, id, program),
    next,
  });
  return { status: 'ok', value: summary };
}

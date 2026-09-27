import 'server-only';
import { canRecordHealth } from './client-status';
import { activeConstraints, pendingReports } from './constraints';
import { listExercises } from './exercises';
import { readHealthIfAllowed } from './health';
import {
  currentPain,
  earlierPainSessions,
  painReportOffers,
  painSkippedExercises,
  repeatedPainSkips,
  type PainReportOffer,
} from './pain-report';
import type { Client } from './schemas/client';
import { SESSION_ID_PATTERN } from './schemas/session';
import { readSession } from './session-files-core';
import { sessionRepo } from './session-files';

/**
 * Bitişteki "Antrenörüne kısıt olarak bildir" kısayolunun okuması (tasarım `kisit-tarama.md` §3.7, faz 6); kurallar
 * `pain-report.ts`'te. Yalnız kısıtlar (`conditions`, bildirim) ve ağrı takibi (`check_in`, ağrıyla geçmenin kaydı)
 * onaylıyken; yoksa `health.json` okunmaz. Ucuz sıra: önce `health.json` (bu antrenmanda ağrıyla geçme yoksa biter),
 * sonra yalnız ağrıyla geçme kaydı olan önceki antrenmanların dosyaları (en çok 6). Hata sayfayı durdurmaz: kısayol yok.
 */
export async function loadPainReport(client: Client, sessionId: string): Promise<PainReportOffer[]> {
  if (!SESSION_ID_PATTERN.test(sessionId) || !canRecordHealth(client, 'conditions') || !canRecordHealth(client, 'check_in')) return [];
  try {
    const record = await readHealthIfAllowed(client, ['conditions', 'check_in']);
    if (!record) return [];
    const pain = currentPain(record.checkIns, sessionId);
    if (!pain) return [];
    const earlier = earlierPainSessions(record.checkIns, { sessionId, date: pain.date });
    if (earlier.length === 0) return [];
    const repo = sessionRepo(client.id);
    const [current, previous, exercises] = await Promise.all([
      readSession(repo, sessionId),
      Promise.all(earlier.map((item) => readSession(repo, item.sessionId).catch(() => null))),
      listExercises(),
    ]);
    if (current.status !== 'ok') return [];
    const earlierExercises = earlier.map((item, index) => {
      const read = previous[index];
      return read?.status === 'ok' ? painSkippedExercises(read.doc.entries, item.rowIds).map((exercise) => exercise.exerciseId) : [];
    });
    const repeated = repeatedPainSkips(painSkippedExercises(current.doc.entries, pain.rowIds), earlierExercises);
    if (repeated.length === 0) return [];
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    return painReportOffers(repeated, (id) => byId.get(id), [...activeConstraints(record), ...pendingReports(record)]);
  } catch (error) {
    console.error(`[ağrı kısayolu] ${client.id}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

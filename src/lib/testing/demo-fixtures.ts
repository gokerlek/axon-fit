import { DEVICE_LIBRARY } from '../../data/device-library.ts';
import { EXERCISE_LIBRARY } from '../../data/exercise-library.ts';
import { HEALTH_CONSENT_VERSION, type Client, type HealthField } from '../schemas/client.ts';
import type { Program } from '../schemas/program.ts';
import type { WorkoutDevice, WorkoutExercise } from '../workout-plan.ts';
import { parsedProgram } from './workout-fixtures.ts';

/**
 * Deneme geçmişi testlerinin kalıpları — YALNIZ testler için. Hazır kütüphanenin gerçek hareketleri ve
 * cihazlarıyla üç günlük evresiz program (Pzt/Çar/Cum): halterle squat, bench, row; süperset; süreli
 * plank; makine, kablo ve dambıl; vücut ağırlığı. Bugün 27 Eylül 2026 Pazar, İstanbul.
 */

export const DEMO_NOW = new Date('2026-09-27T09:00:00.000Z');
export const DEMO_TZ = 'Europe/Istanbul';
export const DEMO_TODAY = '2026-09-27';

const letters = 'abcdefghijklmnopqrstuvwxyz';
const idOf = (prefix: string, n: number) => `${prefix}_${letters[Math.floor(n / 26)]}${letters[n % 26]}aaaa`;

type RowSpec = [exerciseId: string, sets: number, min: number, max: number];

/** Günlerin blokları: tek hareket ya da (iki satırlı) süperset. */
export function demoProgramRaw(options: { weekdays?: number[] | null; daysPerWeek?: number; rotation?: { lastDayId?: string } } = {}): Record<string, unknown> {
  let row = 0;
  let block = 0;
  const rowOf = ([exerciseId, sets, min, max]: RowSpec) => ({ id: idOf('r', row++), exerciseId, sets: Array.from({ length: sets }, () => ({ min, max })) });
  const single = (spec: RowSpec, restSeconds = 120) => ({ id: idOf('b', block++), kind: 'single', restSeconds, rows: [rowOf(spec)] });
  const superset = (a: RowSpec, b: RowSpec) => ({ id: idOf('b', block++), kind: 'superset', restSeconds: 90, rows: [rowOf(a), rowOf(b)] });
  const weekdays = options.weekdays === undefined ? [1, 3, 5] : options.weekdays;
  return {
    version: 2,
    phased: false,
    revision: 3,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    phases: [
      {
        id: 'p_aaaaaa',
        name: 'Evre 1',
        ...(options.daysPerWeek !== undefined ? { daysPerWeek: options.daysPerWeek } : {}),
        days: [
          {
            id: 'd_aaaaaa',
            name: 'Gün A',
            blocks: [
              single(['halter-back-squat', 3, 6, 10], 150),
              single(['halter-bench-press', 3, 6, 10]),
              single(['halter-bent-over-row', 3, 8, 12]),
              superset(['dambil-yana-acis', 3, 10, 15], ['triceps-halat-pushdown', 3, 10, 15]),
              single(['plank', 3, 30, 60], 60),
            ],
          },
          {
            id: 'd_bbbbbb',
            name: 'Gün B',
            blocks: [
              single(['romanian-deadlift', 3, 8, 12]),
              single(['lat-pulldown', 3, 8, 12]),
              single(['oturarak-dambil-omuz-press', 3, 8, 12]),
              single(['dead-bug', 3, 8, 12], 60),
            ],
          },
          {
            id: 'd_cccccc',
            name: 'Gün C',
            blocks: [
              single(['leg-press', 3, 10, 15]),
              single(['makine-chest-press', 3, 8, 12]),
              single(['oturarak-kablo-row', 3, 8, 12]),
              single(['hammer-curl', 2, 10, 15], 60),
              single(['sinav', 3, 8, 15], 60),
            ],
          },
        ],
      },
    ],
    current: { phaseId: 'p_aaaaaa', startedAt: '2026-06-01T10:00:00.000Z' },
    rotation: options.rotation ?? {},
    ...(weekdays ? { schedule: { weekdays } } : {}),
    log: [],
  };
}

export function demoProgram(options: Parameters<typeof demoProgramRaw>[0] = {}): Program {
  return parsedProgram(demoProgramRaw(options));
}

export const DEMO_EXERCISES: ReadonlyMap<string, WorkoutExercise> = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));
export const DEMO_DEVICES: ReadonlyMap<string, WorkoutDevice> = new Map(DEVICE_LIBRARY.map((device) => [device.id, device]));

/** Sağlık modülü ve onay: verilen parçalar açık ve onaylı; boşsa modül kapalı. */
export function demoClient(fields: HealthField[] = []): Pick<Client, 'modules' | 'consents' | 'training'> {
  if (fields.length === 0) return { modules: { health: { enabled: false, fields: [] } }, consents: {} };
  return {
    modules: { health: { enabled: true, fields, enabledAt: '2026-06-01T10:00:00.000Z' } },
    consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields, at: '2026-06-02T10:00:00.000Z' } },
  };
}

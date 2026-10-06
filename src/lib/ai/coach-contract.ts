import * as v from 'valibot';
import { EQUIPMENT } from '../schemas/exercise.ts';
import { programFormSchema } from '../schemas/program.ts';
import { type Client } from '../schemas/client.ts';

export const COACH_PATH = 'ai-coach.json';
export const INTENTS = ['overview', 'progress', 'plan', 'measurement', 'support', 'health_question', 'out_of_scope'] as const;
export const intentSchema = v.strictObject({ intent: v.picklist(INTENTS), exerciseIds: v.pipe(v.array(v.string()), v.maxLength(12)) });
export type CoachIntent = v.InferOutput<typeof intentSchema>;
export const conditionsSchema = v.strictObject({
  weekdays: v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7))), v.minLength(1), v.maxLength(7), v.check(days => new Set(days).size === days.length)),
  minutes: v.pipe(v.number(), v.integer(), v.minValue(15), v.maxValue(120)),
  equipment: v.pipe(v.array(v.picklist(EQUIPMENT)), v.minLength(1), v.maxLength(EQUIPMENT.length)),
});
export type CoachConditions = v.InferOutput<typeof conditionsSchema>;
export const COACH_PAGES = ['overview', 'program', 'measurements', 'workout', 'progress', 'settings', 'library', 'health'] as const;
export const coachPreferencesSchema = v.strictObject({ comments: v.boolean(), celebrations: v.boolean(), suggestions: v.boolean() });
export type CoachPreferences = v.InferOutput<typeof coachPreferencesSchema>;
export const DEFAULT_COACH_PREFERENCES: CoachPreferences = { comments: true, celebrations: true, suggestions: true };
export const askSchema = v.strictObject({
  requestId: v.pipe(v.string(), v.uuid()),
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
  conditions: v.optional(conditionsSchema),
  makePlan: v.optional(v.boolean()),
  page: v.optional(v.picklist(COACH_PAGES)),
});
export const decisionSchema = v.strictObject({ id: v.pipe(v.string(), v.uuid()), action: v.picklist(['approve', 'reject']) });
const timestamp = v.pipe(v.string(), v.isoTimestamp());
const messageSchema = v.object({ id: v.string(), requestHash: v.string(), at: timestamp, question: v.string(), answer: v.string(), sources: v.array(v.string()) });
export const proposalSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  status: v.picklist(['pending', 'publishing', 'approved', 'rejected']),
  at: timestamp,
  expiresAt: timestamp,
  decidedAt: v.optional(timestamp),
  baseRevision: v.nullable(v.number()),
  baseCreatedAt: v.optional(timestamp),
  body: programFormSchema,
  exerciseTitles: v.record(v.string(), v.string()),
  rationale: v.array(v.string()),
  conditions: conditionsSchema,
  contextHash: v.string(),
});
export type CoachProposal = v.InferOutput<typeof proposalSchema>;
export const coachStoreSchema = v.object({
  version: v.literal(1),
  pt: v.array(messageSchema),
  client: v.array(messageSchema),
  proposals: v.array(proposalSchema),
  pending: v.optional(v.object({ id: v.string(), at: timestamp, role: v.picklist(['pt', 'client']) })),
});
export type CoachStore = v.InferOutput<typeof coachStoreSchema>;
export const emptyCoach = (): CoachStore => ({ version: 1, pt: [], client: [], proposals: [] });
export function coachAccess(client: Client): 'off' | 'ready' {
  if (client.status !== 'active' || !client.modules.ai?.enabled) return 'off';
  return 'ready';
}
export function coachView(store: CoachStore, role: 'pt' | 'client') {
  return { messages: store[role], proposals: store.proposals.filter(p => role === 'pt' || p.status !== 'publishing'), busy: !!store.pending };
}

export type CoachData = { clientName?: string; access: 'off' | 'ready'; messages: CoachStore['pt']; proposals: CoachProposal[]; connection: 'pt' | 'client' | null; busy?: boolean };

import * as v from 'valibot';
import { MUSCLES, EQUIPMENT } from '../schemas/exercise.ts';
import { programFormSchema } from '../schemas/program.ts';
import { ownProgramIdSchema } from '../schemas/own-program.ts';
import { conditionsSchema } from './coach-contract.ts';
export const ASSISTANT_PATH = 'ai-assistant.json';
export const GOALS = ['general_fitness', 'strength', 'hypertrophy', 'weight_management', 'mobility'] as const;
export const GOAL_LABELS = { general_fitness: 'Daha fit olmak', strength: 'Güç kazanmak', hypertrophy: 'Kas gelişimi', weight_management: 'Kilo yönetimini desteklemek', mobility: 'Hareketlilik' };
export const selectionSchema = v.pipe(v.strictObject({ goal: v.picklist(GOALS), fullBody: v.boolean(), muscles: v.pipe(v.array(v.picklist(MUSCLES)), v.maxLength(MUSCLES.length), v.check(x => new Set(x).size === x.length)), conditions: conditionsSchema }), v.check(x => x.fullBody || x.muscles.length > 0, 'Bütün beden veya en az bir kas seç.'));
export type AssistantSelection = v.InferOutput<typeof selectionSchema>;
export const interpretedSchema = v.strictObject({ intent: v.picklist(['fitness', 'support', 'health_question', 'unclear']), goal: v.nullable(v.picklist(GOALS)), fullBody: v.nullable(v.boolean()), muscles: v.pipe(v.array(v.picklist(MUSCLES)), v.maxLength(MUSCLES.length), v.check(x => new Set(x).size === x.length)), weekdays: v.nullable(v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7))), v.maxLength(7), v.check(x => new Set(x).size === x.length))), minutes: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(15), v.maxValue(120))), equipment: v.nullable(v.pipe(v.array(v.picklist(EQUIPMENT)), v.maxLength(EQUIPMENT.length), v.check(x => new Set(x).size === x.length))) });
export type InterpretedGoal = v.InferOutput<typeof interpretedSchema>;
export const assistantRequestSchema = v.variant('action', [
  v.strictObject({ action: v.literal('review'), requestId: v.pipe(v.string(), v.uuid()) }),
  v.strictObject({ action: v.literal('interpret'), requestId: v.pipe(v.string(), v.uuid()), text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(1500)) }),
  v.strictObject({ action: v.literal('generate'), requestId: v.pipe(v.string(), v.uuid()), kind: v.picklist(['workout', 'program']), selection: selectionSchema }),
]);
const timestamp = v.pipe(v.string(), v.isoTimestamp());
export const assistantDraftSchema = v.object({ id: v.pipe(v.string(), v.uuid()), programId: ownProgramIdSchema, name: v.string(), at: timestamp, kind: v.picklist(['workout', 'program']), selection: selectionSchema, body: programFormSchema, rationale: v.array(v.string()), attention: v.array(v.string()), contextHash: v.string(), permissionHash: v.string(), baseRevision: v.nullable(v.number()), baseCreatedAt: v.optional(timestamp), status: v.picklist(['draft', 'saving', 'saved']), savedHash: v.optional(v.string()), savedRevision: v.optional(v.number()), savedAt: v.optional(timestamp), savedBy: v.optional(v.picklist(['pt', 'client'])) });
export type AssistantDraft = v.InferOutput<typeof assistantDraftSchema>;
export const reviewSchema = v.object({ id: v.string(), at: timestamp, permissionHash: v.string(), text: v.string(), sources: v.array(v.string()), insights: v.optional(v.array(v.object({ title: v.string(), finding: v.string(), next: v.string(), sources: v.array(v.string()) }))) });
export const assistantStoreSchema = v.object({ version: v.literal(1), drafts: v.array(assistantDraftSchema), reviews: v.array(reviewSchema), requests: v.array(v.object({ id: v.string(), hash: v.string(), at: timestamp, interpreted: v.optional(interpretedSchema) })), pending: v.optional(v.object({ id: v.string(), at: timestamp })) });
export type AssistantStore = v.InferOutput<typeof assistantStoreSchema>;
export const emptyAssistant = (): AssistantStore => ({ version: 1, drafts: [], reviews: [], requests: [] });
export type AssistantView = { clientName: string; access: 'off' | 'ready'; connection: 'pt' | 'client' | null; global?: boolean; drafts: AssistantDraft[]; reviews: AssistantStore['reviews']; exercises: { id: string; title: string; equipment: string; trackingType?: string; primaryMuscles: string[] }[]; interpreted?: InterpretedGoal };

import * as v from 'valibot';
import type { CoachInsight } from './coach-review.ts';
import { defaultSets, DEFAULT_REST_SECONDS } from '../template-plan.ts';
import type { PlanExercise } from '../template-plan.ts';
import { programFormSchema } from '../schemas/program.ts';
import type { ProgramBody, ProgramState } from '../program-plan.ts';
import { evaluateCare, hasCare, type CareInput } from '../constraint-filter.ts';
import type { CoachConditions, CoachIntent } from './coach-contract.ts';

export type CoachExercise = PlanExercise & Parameters<typeof evaluateCare>[0] & { pattern?: string };
export type CoachFact = { text: string; source: string; exerciseId?: string; clientName?: string };
export type CoachContext = { facts: CoachFact[]; exercises: CoachExercise[]; care: CareInput; existingExerciseIds: string[]; healthUnavailable: boolean; today: string; global?: boolean; insights?: CoachInsight[] };
export function eligibleExercises(context: CoachContext, conditions?: CoachConditions): CoachExercise[] {
  if (context.healthUnavailable) return [];
  return context.exercises.filter(exercise => {
    if (conditions && !conditions.equipment.includes(exercise.equipment as CoachConditions['equipment'][number])) return false;
    if (!hasCare(context.care)) return true;
    const result = evaluateCare(exercise, context.care);
    return !result.decision && result.unassessed === 0 && !result.untagged;
  });
}
/** The model selects intent/catalog IDs; all numbers, facts and prescriptions come from application rules. */
export function answerCoach(intent: CoachIntent, context: CoachContext, question = ''): { answer: string; sources: string[] } {
  if (intent.intent === 'support') return { answer: 'Bu süreçte seni yargılamıyorum. Egzersiz bir ceza veya yediklerini telafi etme aracı değil. Bugünkü koşullarını birlikte netleştirebilir, antrenörünle paylaşmak istediğin değişiklikleri taslak haline getirebiliriz.', sources: [] };
  if (intent.intent === 'health_question') return { answer: 'Kayıtlardaki bulguları özetleyebilirim; bunlardan tanı veya tedavi çıkaramam. Ağrı ya da yeni bir belirti varsa bunu antrenörüne bildir; antrenörün gerekirse uygun sağlık uzmanına yönlendirir. Kamera açısı tek başına bir bozukluk veya düzeltici egzersiz gereksinimi göstermez.', sources: [] };
  if (intent.intent === 'out_of_scope') return { answer: 'Antrenman geçmişi, ilerleme, kayıtlı ölçümler ve koşullarına uygun program taslakları hakkında yardımcı olabilirim. Hangi hareketi veya kaydı incelememi istersin?', sources: [] };
  if (context.global && intent.intent === 'plan') return { answer: 'Program taslağı belirli bir danışan için hazırlanır. Danışanın sayfasını açıp buradan devam edebilirsin.', sources: [] };
  const names = [...new Set(context.facts.flatMap(f => f.clientName ? [f.clientName] : []))];
  const asked = question.toLocaleLowerCase('tr');
  const words = asked.split(/[^\p{L}]+/u);
  const exact = names.filter(name => asked.includes(name.toLocaleLowerCase('tr')));
  const named = exact.length ? exact : names.filter(name => { const first = name.toLocaleLowerCase('tr').split(/\s+/)[0] ?? ''; return first.length >= 3 && words.includes(first); });
  if (!exact.length && named.length > 1) return { answer: `Bu adla birden fazla danışan var: ${named.join(', ')}. Tam adını yazarak hangisini incelememi istediğini belirtebilirsin.`, sources: [] };
  const scoped = named.length ? context.facts.filter(f => f.clientName && named.includes(f.clientName)) : context.facts;
  const matching = scoped.filter(fact => intent.intent === 'measurement' ? fact.source.startsWith('Ölçüm') : intent.exerciseIds.length ? !!fact.exerciseId && intent.exerciseIds.includes(fact.exerciseId) : !fact.source.startsWith('Ölçüm'));
  const facts = matching.slice(0, context.global ? 100 : 12);
  if (context.global && matching.length > facts.length) facts.push({ text: `Bu yanıtta ${facts.length} kayıt özeti gösterildi. Kalan kayıtları incelemek için belirli bir danışanın adını sor veya danışan sayfasını aç.`, source: 'Yanıt kapsamı' });
  const intro = intent.intent === 'measurement'
    ? 'Kayıtlı ölçümleri aşağıda özetliyorum. Farklı yöntem ve çekim koşullarını eşdeğer saymıyorum; tek açıdan neden veya tanı çıkarmıyorum.'
    : 'Kayıtlarına göre durum şöyle. Verilerin göstermediği bir nedeni varsaymıyorum; sonuçlar seni değerlendiren bir puan değil.';
  return { answer: `${intro}\n\n${facts.length ? facts.map(f => `• ${f.text}`).join('\n') : 'Bu soruyu karşılayacak kayıt henüz yok. Hangi hareketi izlemek istediğini antrenörünle seçip başlangıç değerini kaydedebiliriz.'}`, sources: [...new Set(facts.map(f => f.source))] };
}
export function draftCoachProgram(context: CoachContext, conditions: CoachConditions, requestedIds: readonly string[], id: (prefix: string) => string): { body: ProgramBody; rationale: string[] } | { error: string } {
  const eligible = eligibleExercises(context, conditions);
  if (context.healthUnavailable) return { error: 'Onaylı kısıt kaydı okunamadı. Okunmadan program taslağı hazırlamıyorum.' };
  if (requestedIds.some(requested => !eligible.some(e => e.id === requested))) return { error: 'İstenen hareketlerin bir kısmı seçtiğin ekipman veya kayıtlı kısıtlarla uyuşmuyor. Antrenörünle alternatif seçebiliriz.' };
  // Prefer existing, practiced exercises; keep patterns diverse. No invented equipment/exercise IDs.
  const priority = new Set([...requestedIds, ...context.existingExerciseIds]);
  const ordered = [...eligible].sort((a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id)) || a.id.localeCompare(b.id));
  const patterns = new Set<string>();
  const selected: CoachExercise[] = [];
  const count = Math.min(6, Math.max(2, Math.floor(conditions.minutes / 10)));
  for (const e of ordered) {
    if (e.category === 'warmup' || e.category === 'cooldown') continue;
    const pattern = e.pattern ?? e.primaryMuscles[0] ?? e.id;
    if (patterns.has(pattern)) continue;
    selected.push(e); patterns.add(pattern);
    if (selected.length === count) break;
  }
  if (selected.length < 2) return { error: 'Bu koşullarda yeterli, değerlendirilebilir hareket bulunamadı. Ekipman seçimini kontrol edelim veya PT kütüphaneye uygun bir alternatif eklesin.' };
  const phaseId = id('p');
  const body: ProgramBody = {
    phased: false, currentPhaseId: phaseId, weekdays: conditions.weekdays,
    phases: [{ id: phaseId, name: 'AI taslağı', daysPerWeek: conditions.weekdays.length,
      days: conditions.weekdays.map((_, index) => ({ id: id('d'), name: `Gün ${index + 1}`, blocks: selected.map(e => ({
        id: id('b'), kind: 'single' as const, restSeconds: DEFAULT_REST_SECONDS[e.category],
        rows: [{ id: id('r'), exerciseId: e.id, sets: defaultSets(e, 2) }],
      })) })),
    }],
  };
  const parsed = v.safeParse(programFormSchema, body);
  if (!parsed.success) return { error: 'Taslak program kurallarını karşılamadı; program değiştirilmedi.' };
  return { body: parsed.output, rationale: [
    `${conditions.weekdays.length} gün ve ${conditions.minutes} dakikalık zaman bütçen esas alındı. Süre bir planlama tahminidir.`,
    'Yalnız seçtiğin ekipman ve kısıt filtresinden geçen katalog hareketleri kullanıldı; mevcut programındaki hareketlere öncelik verildi.',
    'Başlangıç taslağında hareket başına iki çalışma seti var. Ağırlıkları mevcut antrenman öneri motoru geçmişe göre belirler; bu taslak ağırlık uydurmaz.',
    'Bu yeni program mevcut PT programının yerini alır. PT, sıklığı, toparlanmayı, setleri ve hareket seçimini inceleyip uygun bulursa yayımlar.',
  ] };
}

/** Stored programs have `current.phaseId`; form payloads have `currentPhaseId`. */
export function coachProgramMatches(current: ProgramState, body: ProgramBody): boolean {
  const parsed = v.safeParse(programFormSchema, { ...current, currentPhaseId: current.current.phaseId, ...(current.schedule ? { weekdays: current.schedule.weekdays } : {}) });
  return parsed.success && JSON.stringify({ ...parsed.output, weekdays: parsed.output.weekdays ? [...parsed.output.weekdays].sort() : undefined }) === JSON.stringify({ ...v.parse(programFormSchema, body), weekdays: body.weekdays ? [...body.weekdays].sort() : undefined });
}

/** Known high-risk wording has a local gate as well as the provider classifier. */
export function coachSensitiveIntent(message: string): 'support' | 'health_question' | null {
  const text = message.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  if (/ceza|punish|telafi|compensat|kusmak|kusuy|yeme bozuk|eating disorder|kendimden nefret|vucudumdan nefret|ac kal|starv|yediklerimi.*yak/.test(text)) return 'support';
  if (/\b(?:tani|teshis|tedavi|diagnos\w*|treatment|agri\w*|pain\w*|ameliyat\w*|surgery)\b/.test(text)) return 'health_question';
  return null;
}

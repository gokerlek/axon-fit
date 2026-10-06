import * as v from 'valibot';
import { eligibleExercises, type CoachContext } from './coach-engine.ts';
import { GOAL_LABELS, type AssistantSelection } from './assistant-contract.ts';
import { MUSCLE_LABELS } from '../schemas/exercise.ts';
import { defaultSets, DEFAULT_REST_SECONDS } from '../template-plan.ts';
import type { ProgramBody } from '../program-plan.ts';
import { programFormSchema } from '../schemas/program.ts';

/** The provider interprets intent; the application owns catalog selection and numerical targets. */
export function assistantProgram(context: CoachContext, selection: AssistantSelection, kind: 'workout' | 'program', id: (prefix: string) => string) {
  if (context.global) return { error: 'Program için bir danışanın sayfasını aç.' };
  if (context.healthUnavailable) return { error: 'İzinli kısıt kayıtları okunamadı. Kayıtlar okunmadan program hazırlanmıyor.' };
  const eligible = eligibleExercises(context, selection.conditions);
  const moves = eligible.filter(e => selection.goal === 'mobility' ? ['warmup', 'cooldown'].includes(e.category) : !['warmup', 'cooldown'].includes(e.category));
  const wanted = new Set<string>(selection.muscles);
  const pool = selection.fullBody ? moves : moves.filter(e => e.primaryMuscles.some(m => wanted.has(m)));
  if (!pool.length) return { error: selection.goal === 'mobility' ? 'Bu koşullarda uygun ısınma/soğuma hareketi yok. Hareketlilik için PT uygun hareketleri kütüphaneye eklemeli.' : 'Seçtiğin kaslar, ekipman ve kısıtlar için uygun katalog hareketi yok. Seçimleri değiştir veya PT’den alternatif iste.' };
  const practiced = new Set(context.existingExerciseIds);
  const ordered = [...pool].sort((a, b) => Number(practiced.has(b.id)) - Number(practiced.has(a.id)) || a.id.localeCompare(b.id));
  const weekdays = [...selection.conditions.weekdays].sort((a, b) => a - b);
  const days = kind === 'workout' ? weekdays.slice(0, 1) : weekdays;
  const count = Math.min(6, Math.max(1, Math.floor(selection.conditions.minutes / 8)));
  const phaseId = id('p');
  const used = new Set<string>();
  const chosenMuscles = new Set<string>();
  const body = {
    phased: false, currentPhaseId: phaseId, weekdays: days,
    phases: [{ id: phaseId, name: GOAL_LABELS[selection.goal], daysPerWeek: days.length, days: days.map((_, index) => {
      const selected: typeof pool = [], patterns = new Set<string>();
      // Cover primary regions first; across days prefer movements not selected yet, then practiced ones.
      const candidates = [...ordered].sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)));
      while (selected.length < Math.min(count, candidates.length)) {
        const remaining = candidates.filter(e => !selected.includes(e));
        remaining.sort((a, b) => {
          const score = (e: typeof a) => Number(!patterns.has(e.pattern ?? e.primaryMuscles[0] ?? e.id)) * 100 + e.primaryMuscles.filter(m => !chosenMuscles.has(m)).length * 10;
          return score(b) - score(a);
        });
        const next = remaining[0]; if (!next) break;
        selected.push(next); used.add(next.id); patterns.add(next.pattern ?? next.primaryMuscles[0] ?? next.id); next.primaryMuscles.forEach(m => chosenMuscles.add(m));
      }
      return { id: id('d'), name: `${['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][days[index]! - 1]} · Gün ${index + 1}`, blocks: selected.map(e => ({ id: id('b'), kind: 'single' as const, restSeconds: DEFAULT_REST_SECONDS[e.category], rows: [{ id: id('r'), exerciseId: e.id, sets: defaultSets(e, e.category === 'warmup' || e.category === 'cooldown' ? 1 : 2) }] })) };
    }) }],
  };
  const parsed = v.safeParse(programFormSchema, body);
  if (!parsed.success) return { error: 'Taslak program kurallarını karşılamadı. Programın değişmedi.' };
  const attention = assistantAttention(context, selection, parsed.output);
  return { body: parsed.output, attention, rationale: [
    `${GOAL_LABELS[selection.goal]} hedefi; ${days.length} gün, seans başına ${selection.conditions.minutes} dakikalık planlama bütçesi. Gerçek süre dinlenmeye ve tempoya bağlıdır.`,
    'Ekipman ve izinli kısıtlara uygun hareketler; hareket geçmişi ve farklı örüntüler esas alındı.',
    'İki set başlangıç taslağı; yükler seanstaki mevcut öneri motorundan gelir. Oluşturucuda setleri ve bileşik blokları düzenleyebilirsin.',
    ...(selection.goal === 'weight_management' ? ['Egzersiz kilo değişimini garanti etmez; program bir kalori telafisi veya görünüş puanı değildir.'] : []),
    ...(selection.goal === 'mobility' ? ['Bu bir katalogdaki ısınma/soğuma taslağıdır; tanı veya düzeltici tedavi programı değildir.'] : []),
  ] };
}

/** Attention is derived again from the body actually saved, including user edits. */
export function assistantAttention(context: CoachContext, selection: AssistantSelection, body: ProgramBody): string[] {
  const ids = new Set(body.phases.flatMap(p => p.days.flatMap(d => d.blocks.flatMap(b => b.rows.map(r => r.exerciseId)))));
  const covered = new Set(context.exercises.filter(e => ids.has(e.id)).flatMap(e => e.primaryMuscles));
  const missing = selection.muscles.filter(m => !covered.has(m));
  const days = body.weekdays ?? [];
  const short = body.phases.some(p => p.days.some(d => d.blocks.flatMap(b => b.rows).length < 4));
  return [
    ...(!context.existingExerciseIds.length ? ['Önceki hareket geçmişi yok; başlangıç yükünü ve tekniği birlikte belirleyin.'] : []),
    ...(missing.length ? [`Seçilen kaslardan programda karşılanamayanlar: ${missing.map(m => MUSCLE_LABELS[m]).join(', ')}.`] : []),
    ...(days.some(d => days.includes(d % 7 + 1)) ? ['Ardışık antrenman günleri var; ortak kasların yükünü ve toparlanmayı gözden geçirin.'] : []),
    ...(selection.fullBody && short ? ['Bazı günlerde tüm beden kapsamı sınırlı; günleri ve hareketleri düzenleyicide kontrol et.'] : []),
  ];
}

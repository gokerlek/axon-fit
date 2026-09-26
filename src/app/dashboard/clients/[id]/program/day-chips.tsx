'use client';

import { getDeepError } from '@formisch/react';
import { Copy, FileText, Plus, Square, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { blankDay, canAddDay, copyDay, programIdSource, addDay, type ProgramPhase } from '@/lib/program-plan';
import { cn } from '@/lib/utils';
import type { PhaseActions, ProgramFormStore } from './program-form';

/** Evrenin günü eklenir: evreyi güncel hâlinden bulur, yeni günü seçer. */
function addDayTo(actions: PhaseActions, phaseId: string, make: (phase: ProgramPhase, all: ProgramPhase[]) => ProgramPhase['days'][number], after?: string) {
  const all = actions.current();
  const phase = all.find((item) => item.id === phaseId);
  if (!phase) return;
  const day = make(phase, all);
  actions.update((phasesNow) => addDay(phasesNow, phaseId, day, after), { select: day.id, announce: `${day.name} eklendi` });
}

/** "+ Gün": boş gün, şablondan, seçili günün kopyası. */
export function AddDayMenu({
  phase,
  phases,
  phased,
  selectedDayId,
  hasTemplates,
  actions,
}: {
  phase: ProgramPhase;
  phases: ProgramPhase[];
  phased: boolean;
  selectedDayId: string | null;
  hasTemplates: boolean;
  actions: PhaseActions;
}) {
  const selectedHere = phase.days.find((day) => day.id === selectedDayId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!canAddDay(phases, phase.id)}
        render={<Button type="button" variant="outline" size="sm" aria-label={phased ? `${phase.name} evresine gün ekle` : 'Programa gün ekle'} />}>
        <Plus data-icon="inline-start" />
        Gün
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52 touch:**:data-[slot=dropdown-menu-item]:min-h-11 touch:**:data-[slot=dropdown-menu-sub-trigger]:min-h-11">
        <DropdownMenuItem onClick={() => addDayTo(actions, phase.id, (target, all) => blankDay(target, programIdSource(all)))}>
          <Square />
          Boş gün
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasTemplates} onClick={() => actions.openAddDay(phase.id)}>
          <FileText />
          {hasTemplates ? 'Şablondan…' : 'Şablondan… (şablon yok)'}
        </DropdownMenuItem>
        {selectedHere ? (
          <DropdownMenuItem
            onClick={() =>
              addDayTo(
                actions,
                phase.id,
                (target, all) => {
                  const source = target.days.find((day) => day.id === selectedHere.id) ?? selectedHere;
                  return copyDay(target, source, programIdSource(all));
                },
                selectedHere.id,
              )
            }>
            <Copy />
            Seçili günün kopyası
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Evrenin (evresizde programın) günleri: seçilebilir çipler; seçili gün aşağıdaki gün
 * düzenleyicide açılır. Sıradaki gün noktayla, hatalı gün kırmızı çerçeveyle işaretlenir.
 * Sonuna `children` (ör. "+ Gün") eklenir.
 */
export function DayChips({
  form,
  phase,
  phaseIndex,
  phased,
  isCurrent,
  selectedDayId,
  nextDayId,
  missingDayIds,
  actions,
  children,
}: {
  form: ProgramFormStore;
  phase: ProgramPhase;
  phaseIndex: number;
  phased: boolean;
  isCurrent: boolean;
  selectedDayId: string | null;
  nextDayId: string | null;
  missingDayIds: ReadonlySet<string>;
  actions: PhaseActions;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {phase.days.map((day, dayIndex) => {
        const selected = day.id === selectedDayId;
        const failing = Boolean(getDeepError(form, { path: ['phases', phaseIndex, 'days', dayIndex] })) || missingDayIds.has(day.id);
        const isNext = isCurrent && day.id === nextDayId;
        return (
          <Button
            key={day.id}
            type="button"
            size="sm"
            variant={selected ? 'default' : 'outline'}
            aria-pressed={selected}
            aria-label={`${phased ? `${phase.name} · ` : ''}${day.name}${isNext ? ', sıradaki gün' : ''}${failing ? ', hatalı' : ''}`}
            className={cn(failing && 'ring-2 ring-destructive')}
            onClick={() => actions.select(day.id)}>
            {failing ? <WarningCircle data-icon="inline-start" className="text-destructive" /> : null}
            {day.name}
            {isNext ? <span className="size-1.5 rounded-full bg-current" title="Sıradaki gün" aria-hidden /> : null}
          </Button>
        );
      })}
      {children}
    </div>
  );
}

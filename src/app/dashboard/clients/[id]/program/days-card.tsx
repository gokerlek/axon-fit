'use client';

import { useFieldArray } from '@formisch/react';
import { Rows } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import type { ProgramPhase } from '@/lib/program-plan';
import { AddDayMenu, DayChips } from './day-chips';
import { FrequencySelect } from './frequency-select';
import type { PhaseActions, ProgramFormStore } from './program-form';

/**
 * Evresiz program: günler sırayla döner (A → B → C), haftada kaç gün ve altında antrenman günleri
 * (`weekdays`), "+ Gün". Uyum, güç gibi dönemler istenirse "Evrelere böl". Program tek, gizli bir evrede
 * durur (`phases[0]`).
 */
export function DaysCard({
  form,
  phases,
  selectedDayId,
  nextDayId,
  missingDayIds,
  hasTemplates,
  actions,
  weekdays,
}: {
  form: ProgramFormStore;
  phases: ProgramPhase[];
  selectedDayId: string | null;
  nextDayId: string | null;
  missingDayIds: ReadonlySet<string>;
  hasTemplates: boolean;
  actions: PhaseActions;
  /** Antrenman günleri alanı (program düzeyinde; `WeekdayField`). */
  weekdays: React.ReactNode;
}) {
  const phasesArray = useFieldArray(form, { path: ['phases'] });
  const daysArray = useFieldArray(form, { path: ['phases', 0, 'days'] });
  const phase = phases[0];
  if (!phase) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Günler</CardTitle>
        <CardDescription>
          Günler sırayla döner (A → B → C); sıradaki gün işaretli. Uyum, güç gibi dönemler istersen programı evrelere böl.
        </CardDescription>
        <CardAction>
          <Button type="button" variant="outline" size="sm" onClick={() => actions.setPhased(true)}>
            <Rows data-icon="inline-start" />
            Evrelere böl
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FrequencySelect
          form={form}
          phaseIndex={0}
          id="program-frequency"
          label="Haftada kaç gün"
          description="Danışanın ekranında ve haftalık kas yükünde kullanılır."
          className="max-w-xs"
        />
        {weekdays}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Günler</span>
          <DayChips
            form={form}
            phase={phase}
            phaseIndex={0}
            phased={false}
            isCurrent
            selectedDayId={selectedDayId}
            nextDayId={nextDayId}
            missingDayIds={missingDayIds}
            actions={actions}>
            <AddDayMenu
              phase={phase}
              phases={phases}
              phased={false}
              selectedDayId={selectedDayId}
              hasTemplates={hasTemplates}
              actions={actions}
            />
          </DayChips>
          <FieldError>{daysArray.errors?.[0] ?? phasesArray.errors?.[0]}</FieldError>
        </div>
      </CardContent>
    </Card>
  );
}

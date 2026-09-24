'use client';

import { useState } from 'react';
import { setInput, useField, useFieldArray } from '@formisch/react';
import { ArrowDown, ArrowRight, ArrowUp, Copy, DotsThreeVertical, Info, Plus, PushPin, Rows, Trash } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { formatDate } from '@/lib/format';
import {
  PROGRAM_LIMITS,
  addPhase,
  blankPhase,
  canAddPhase,
  copyPhase,
  movePhase,
  phaseStatus,
  programIdSource,
  removePhase,
  type ProgramPhase,
} from '@/lib/program-plan';
import { cn } from '@/lib/utils';
import { AddDayMenu, DayChips } from './day-chips';
import { FrequencySelect } from './frequency-select';
import type { PhaseActions, ProgramFormStore, StoredState } from './program-form';
import { UnphaseDialog } from './unphase-dialog';

type Shared = {
  form: ProgramFormStore;
  phases: ProgramPhase[];
  currentPhaseId: string;
  stored: StoredState | null;
  selectedDayId: string | null;
  nextDayId: string | null;
  missingDayIds: ReadonlySet<string>;
  hasTemplates: boolean;
  actions: PhaseActions;
};

/** Evrenin menüsü: taşı, kopyala, şu anki evre yap, sil. */
function PhaseMenu({ phase, index, shared }: { phase: ProgramPhase; index: number; shared: Shared }) {
  const { phases, currentPhaseId, actions } = shared;
  const isCurrent = phase.id === currentPhaseId;
  const copy = () => {
    const all = actions.current();
    const source = all.find((item) => item.id === phase.id);
    if (!source) return;
    const created = copyPhase(all, source, programIdSource(all));
    actions.update((phasesNow) => addPhase(phasesNow, created, phase.id), {
      select: created.days[0]?.id,
      announce: `'${created.name}' evresi eklendi`,
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Evre işlemleri: ${phase.name}`} />}>
        <DotsThreeVertical weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem disabled={index === 0} onClick={() => actions.update((all) => movePhase(all, phase.id, -1))}>
          <ArrowUp />
          Yukarı taşı
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === phases.length - 1} onClick={() => actions.update((all) => movePhase(all, phase.id, 1))}>
          <ArrowDown />
          Aşağı taşı
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canAddPhase(phases, phase.days.length)} onClick={copy}>
          <Copy />
          Kopyala
        </DropdownMenuItem>
        {isCurrent ? null : (
          <DropdownMenuItem onClick={() => actions.setCurrentPhase(phase.id)}>
            <PushPin />
            Şu anki evre yap
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isCurrent || phases.length <= 1}
          onClick={() =>
            actions.updateWithUndo((all) => removePhase(all, phase.id, currentPhaseId), `'${phase.name}' evresi silindi`)
          }>
          <Trash />
          Evreyi sil
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Bir evre: ad, süre, sıklık, durum rozeti, menü; altında günler (seçilebilir çipler) ve "+ Gün". */
function PhaseRow({ phase, index, shared }: { phase: ProgramPhase; index: number; shared: Shared }) {
  const { form, phases, currentPhaseId, stored, selectedDayId, nextDayId, missingDayIds, hasTemplates, actions } = shared;
  const nameField = useField(form, { path: ['phases', index, 'name'] });
  const weeksField = useField(form, { path: ['phases', index, 'weeks'] });
  const daysArray = useFieldArray(form, { path: ['phases', index, 'days'] });
  const isCurrent = phase.id === currentPhaseId;
  const pending = isCurrent && stored !== null && stored.current.phaseId !== phase.id;
  const weeks = typeof weeksField.input === 'number' && !Number.isNaN(weeksField.input) ? weeksField.input : '';

  return (
    <li className={cn('flex flex-col gap-3 rounded-lg border p-3', isCurrent && 'border-primary/40 bg-primary/5')}>
      <div className="flex flex-wrap items-end gap-3">
        <Field data-invalid={Boolean(nameField.errors) || undefined} className="basis-full gap-1.5 sm:max-w-sm sm:flex-1 sm:basis-auto">
          <FieldLabel htmlFor={`phase-name-${phase.id}`} className="text-xs text-muted-foreground">
            Evre adı
          </FieldLabel>
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{index + 1}.</span>
            <Input
              {...nameField.props}
              id={`phase-name-${phase.id}`}
              value={nameField.input ?? ''}
              maxLength={PROGRAM_LIMITS.phaseName}
              aria-invalid={Boolean(nameField.errors) || undefined}
            />
          </div>
        </Field>
        <Field data-invalid={Boolean(weeksField.errors) || undefined} className="w-32 gap-1.5">
          <FieldLabel htmlFor={`phase-weeks-${phase.id}`} className="text-xs text-muted-foreground">
            Süre
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              {...weeksField.props}
              id={`phase-weeks-${phase.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={PROGRAM_LIMITS.weeks}
              placeholder="süresiz"
              className="tabular-nums"
              aria-invalid={Boolean(weeksField.errors) || undefined}
              value={weeks}
              onChange={(event) =>
                setInput(form, {
                  path: ['phases', index, 'weeks'],
                  input: event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber,
                })
              }
            />
            <InputGroupAddon align="inline-end">hafta</InputGroupAddon>
          </InputGroup>
        </Field>
        <FrequencySelect form={form} phaseIndex={index} id={`phase-frequency-${phase.id}`} label="Haftada" compact className="w-32" />
        <div className="flex flex-1 items-center justify-end gap-2 pb-1 sm:flex-none">
          {isCurrent ? <Badge variant="secondary">{pending ? 'Şu an (kaydedince)' : 'Şu an'}</Badge> : null}
          <PhaseMenu phase={phase} index={index} shared={shared} />
        </div>
      </div>
      {nameField.errors || weeksField.errors ? (
        <FieldError>{nameField.errors?.[0] ?? weeksField.errors?.[0]}</FieldError>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Günler</span>
        <DayChips
          form={form}
          phase={phase}
          phaseIndex={index}
          phased
          isCurrent={isCurrent}
          selectedDayId={selectedDayId}
          nextDayId={nextDayId}
          missingDayIds={missingDayIds}
          actions={actions}>
          <AddDayMenu
            phase={phase}
            phases={phases}
            phased
            selectedDayId={selectedDayId}
            hasTemplates={hasTemplates}
            actions={actions}
          />
        </DayChips>
        <FieldError>{daysArray.errors?.[0]}</FieldError>
      </div>
    </li>
  );
}

/** Evre süresi dolduysa sonraki evreye geçiş önerisi (düzenlemede; geçiş kayıtla olur). */
function Suggestion({ shared, now, timeZone }: { shared: Shared; now: string; timeZone: string }) {
  const { phases, currentPhaseId, stored, actions } = shared;
  if (!stored) return null;
  if (currentPhaseId !== stored.current.phaseId) {
    const target = phases.find((phase) => phase.id === currentPhaseId);
    // Kayıttaki evre bu düzenlemede silindiyse geri dönülecek yer yok.
    const canRevert = phases.some((phase) => phase.id === stored.current.phaseId);
    return (
      <Alert>
        <Info />
        <AlertDescription>
          Kaydedince &apos;{target?.name}&apos; evresine geçilir; danışanın sıradaki antrenmanı bu evrenin ilk günü olur.
        </AlertDescription>
        {canRevert ? (
          <div className="col-start-2 mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => actions.setCurrentPhase(stored.current.phaseId)}>
              Vazgeç
            </Button>
          </div>
        ) : null}
      </Alert>
    );
  }
  const status = phaseStatus({ phases, current: stored.current }, new Date(now));
  const phase = phases.find((item) => item.id === stored.current.phaseId);
  if (!phase) return null;
  if (status.kind === 'due') {
    const next = phases.find((item) => item.id === status.nextPhaseId);
    return (
      <Alert>
        <Info />
        <AlertTitle>&apos;{phase.name}&apos; evresinin süresi doldu</AlertTitle>
        <AlertDescription>
          {status.weeks} hafta planlanmıştı, {formatDate(stored.current.startedAt, timeZone)} tarihinde başladı. Sıradaki: &apos;
          {next?.name}&apos;.
        </AlertDescription>
        <div className="col-start-2 mt-2">
          <Button type="button" size="sm" onClick={() => actions.setCurrentPhase(status.nextPhaseId)}>
            <ArrowRight data-icon="inline-start" />
            Sonraki evreye geç
          </Button>
        </div>
      </Alert>
    );
  }
  if (status.kind === 'ended') {
    return (
      <Alert>
        <Info />
        <AlertDescription>
          &apos;{phase.name}&apos; evresinin süresi doldu; sonrası için yeni evre ekleyebilir ya da süreyi uzatabilirsin.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

/**
 * Evreler (program evrelere bölündüyse): ad, süre ve sıklık alanları, evre menüsü, günler.
 * Günler çip olarak seçilir; seçili gün aşağıdaki gün düzenleyicide açılır. Hatalı gün
 * kırmızı çerçeveyle işaretlenir. "Evreleri kaldır" günleri tek listede birleştirir.
 */
export function PhasesCard({ now, timeZone, ...shared }: Shared & { now: string; timeZone: string }) {
  const { form, phases, currentPhaseId, actions } = shared;
  // Formisch kancası: günlerin `getDeepError` okumaları bu bileşenin çizimine bağlansın.
  const phasesArray = useFieldArray(form, { path: ['phases'] });
  const [unphasing, setUnphasing] = useState(false);
  const unphase = () => (phases.length <= 1 ? actions.setPhased(false) : setUnphasing(true));

  const addNewPhase = () => {
    const all = actions.current();
    const created = blankPhase(all, programIdSource(all));
    actions.update((phasesNow) => addPhase(phasesNow, created), {
      select: created.days[0]?.id,
      announce: `'${created.name}' evresi eklendi`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evreler</CardTitle>
        <CardDescription>
          Her evrenin günleri sırayla döner; süre dolunca sonraki evreye geçmeyi önerir. Günü başka evreye günün menüsünden
          taşırsın.
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" disabled={!canAddPhase(phases)} onClick={addNewPhase}>
            <Plus data-icon="inline-start" />
            Evre ekle
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label="Evre seçenekleri" />}>
              <DotsThreeVertical weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={unphase}>
                <Rows />
                Evreleri kaldır…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suggestion shared={shared} now={now} timeZone={timeZone} />
        <ol className="flex flex-col gap-3" aria-label="Evreler">
          {phases.map((phase, index) => (
            <PhaseRow key={phase.id} phase={phase} index={index} shared={shared} />
          ))}
        </ol>
        <FieldError>{phasesArray.errors?.[0]}</FieldError>
      </CardContent>
      <UnphaseDialog
        open={unphasing}
        onOpenChange={setUnphasing}
        phases={phases}
        currentPhaseId={currentPhaseId}
        onConfirm={() => actions.setPhased(false)}
      />
    </Card>
  );
}

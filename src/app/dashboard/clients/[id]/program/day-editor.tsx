'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { getInput, useField } from '@formisch/react';
import { ArrowLeft, ArrowRight, Copy, DotsThreeVertical, FloppyDisk, Trash } from '@phosphor-icons/react';
import { BlockEditor, useBlocks } from '@/components/block-editor/block-editor';
import type { BlocksFormStore } from '@/components/block-editor/block-items';
import { TemplateMuscleMap } from '@/components/muscle-map/template-muscle-map';
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
import { formatDate } from '@/lib/format';
import { exerciseSetWeights } from '@/lib/muscles';
import {
  PROGRAM_LIMITS,
  addDay,
  canAddDay,
  copyDay,
  moveDay,
  programIdSource,
  removeDay,
  type ProgramDay,
  type ProgramPhase,
} from '@/lib/program-plan';
import type { EditorDevice, PickerExercise } from '@/lib/template-edit';
import { templateMuscleLoad } from '@/lib/template-plan';
import type { PhaseActions, ProgramFormStore } from './program-form';

const LOAD_DESCRIPTION =
  'Kas başına çalışma seti: hedef 1, yardımcı 0,5, dengeleyici 0,25 sayılır; ısınma ve soğuma hareketleri sayılmaz.';

/**
 * Seçili gün: adı, geldiği şablon, gün menüsü (taşı, kopyala, şablon olarak kaydet, sil);
 * hareketleri şablonlarla ortak hareket düzenleyicide, altında günün kas yükü.
 */
export function DayEditor({
  form,
  phases,
  phase,
  phaseIndex,
  day,
  dayIndex,
  isNext,
  templateIds,
  exercises,
  devices,
  timeZone,
  actions,
}: {
  form: ProgramFormStore;
  phases: ProgramPhase[];
  phase: ProgramPhase;
  phaseIndex: number;
  day: ProgramDay;
  dayIndex: number;
  isNext: boolean;
  /** Hâlâ var olan şablonlar (kaynağa bağlantı için). */
  templateIds: ReadonlySet<string>;
  exercises: PickerExercise[];
  devices: EditorDevice[];
  timeZone: string;
  actions: PhaseActions;
}) {
  const nameField = useField(form, { path: ['phases', phaseIndex, 'days', dayIndex, 'name'] });
  const path = ['phases', phaseIndex, 'days', dayIndex, 'blocks'] as const;
  const blocksForm = form as unknown as BlocksFormStore;
  const blocks = useBlocks(blocksForm, path);
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const load = useMemo(() => templateMuscleLoad({ blocks }, exerciseById, exerciseSetWeights).load, [blocks, exerciseById]);
  const source = day.source;
  const neighbour = phase.days[dayIndex - 1] ?? phase.days[dayIndex + 1];

  const copy = () => {
    const all = actions.current();
    const target = all.find((item) => item.id === phase.id);
    const current = target?.days.find((item) => item.id === day.id);
    if (!target || !current) return;
    const created = copyDay(target, current, programIdSource(all));
    actions.update((phasesNow) => addDay(phasesNow, phase.id, created, day.id), {
      select: created.id,
      announce: `${created.name} eklendi`,
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {phase.name} · {day.name}
          </CardTitle>
          <CardDescription>
            Evrenin {dayIndex + 1}. günü{isNext ? ' · danışanın sıradaki günü' : ''}
          </CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Gün işlemleri: ${day.name}`} />}>
                <DotsThreeVertical weight="bold" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem
                  disabled={dayIndex === 0}
                  onClick={() => actions.update((all) => moveDay(all, phase.id, day.id, -1), { announce: `${day.name} sola taşındı` })}>
                  <ArrowLeft />
                  Sola taşı
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={dayIndex === phase.days.length - 1}
                  onClick={() => actions.update((all) => moveDay(all, phase.id, day.id, 1), { announce: `${day.name} sağa taşındı` })}>
                  <ArrowRight />
                  Sağa taşı
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canAddDay(phases, phase.id)} onClick={copy}>
                  <Copy />
                  Kopyala
                </DropdownMenuItem>
                <DropdownMenuItem onClick={actions.openSaveTemplate}>
                  <FloppyDisk />
                  Şablon olarak kaydet…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={phase.days.length <= 1}
                  onClick={() =>
                    actions.updateWithUndo((all) => removeDay(all, phase.id, day.id), `${day.name} silindi`, {
                      select: neighbour?.id,
                    })
                  }>
                  <Trash />
                  Günü sil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field data-invalid={Boolean(nameField.errors) || undefined}>
            <FieldLabel htmlFor={`day-name-${day.id}`}>Gün adı</FieldLabel>
            <Input
              {...nameField.props}
              id={`day-name-${day.id}`}
              className="max-w-sm"
              maxLength={PROGRAM_LIMITS.dayName}
              value={nameField.input ?? ''}
              placeholder="Ör. Gün A"
              aria-invalid={Boolean(nameField.errors) || undefined}
            />
            <FieldError>{nameField.errors?.[0]}</FieldError>
          </Field>
          {source ? (
            <p className="text-sm text-muted-foreground">
              {templateIds.has(source.templateId) ? (
                <Link href={`/dashboard/templates/${source.templateId}`} className="underline underline-offset-4">
                  &apos;{source.templateName}&apos; şablonundan
                </Link>
              ) : (
                <>&apos;{source.templateName}&apos; şablonundan (şablon silinmiş)</>
              )}{' '}
              · {formatDate(source.at, timeZone)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <BlockEditor
        key={day.id}
        form={blocksForm}
        path={path}
        exercises={exercises}
        devices={devices}
        newIds={() => programIdSource((getInput(form, { path: ['phases'] }) ?? []) as unknown as ProgramPhase[])}
        noteHint="Danışan antrenmanda görür; yalnız bu programda durur."
        libraryDescription="Ada ya da kasa göre ara; dokununca günün sonuna eklenir."
        listLabel={`${day.name} hareketleri`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Kas yükü</CardTitle>
          <CardDescription>{LOAD_DESCRIPTION}</CardDescription>
        </CardHeader>
        <CardContent>
          {blocks.length > 0 ? (
            <TemplateMuscleMap variant="full" bodyClassName="h-56 lg:h-64" load={load} label={`${day.name} kas yükü`} />
          ) : (
            <p className="text-sm text-muted-foreground">Hareket ekleyince kas yükü burada görünür.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

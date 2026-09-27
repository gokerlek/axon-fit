'use client';

import { useMemo, useState } from 'react';
import { OwnProgramForm, type OwnProgramFormProps } from '@/components/program/own-program-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { newOwnProgramId, OWN_PROGRAM_LIMITS, ownNameProblem, ownStartBody, type OwnStart } from '@/lib/own-programs';
import { formatNumber } from '@/lib/format';
import { programIdSource, type ClientTargets, type ProgramPhase, type TemplateOption } from '@/lib/program-plan';
import type { TemplateBlock } from '@/lib/template-plan';

type StartKind = OwnStart['kind'];

/**
 * Yeni program (`docs/design/kendi-program.md` §2.4): aynı adres iki adım. Önce ad ve başlangıç (boş, antrenörünün
 * programından seçili günler, danışanlara açık bir şablon); "Devam" hiçbir şey yazmaz, düzenleyiciyi oluşturma
 * kipinde açar ("Programı oluştur"). Program kimliği telefonda üretilir (oluşturma idempotent). Kısıtının yasakladığı
 * hareket kopyadan düşmez: seçenekte sayısı yazar, düzenleyicide satır "Sana önerilmiyor" der (`kisit-tarama.md` §3.7).
 */
export function NewProgramFlow({
  form,
  defaultName,
  otherNames,
  ptProgram,
  ptCurrentPhaseId,
  templates,
  initialStart,
  takenIds,
}: {
  /** Düzenleyicinin ortak girdileri (kütüphane, cihazlar, şablonlar, ...). */
  form: Omit<OwnProgramFormProps, 'programId' | 'creating' | 'initial' | 'base' | 'mode' | 'saveUrl' | 'doneHref'>;
  defaultName: string;
  otherNames: string[];
  ptProgram: { phases: ProgramPhase[]; clientTargets?: ClientTargets | undefined } | null;
  ptCurrentPhaseId: string | null;
  templates: TemplateOption[];
  initialStart: { kind: StartKind; dayIds?: string[]; templateId?: string };
  /** Var olan kendi programların kimlikleri (yeni kimlik çakışmasın). */
  takenIds: string[];
}) {
  const [step, setStep] = useState<{ programId: string; initial: OwnProgramFormProps['initial'] } | null>(null);
  const [name, setName] = useState(defaultName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [kind, setKind] = useState<StartKind>(initialStart.kind);
  const ptPhases = ptProgram?.phases ?? [];
  const current = ptPhases.find((phase) => phase.id === ptCurrentPhaseId) ?? ptPhases[0];
  const [dayIds, setDayIds] = useState<string[]>(
    () => initialStart.dayIds ?? current?.days.slice(0, OWN_PROGRAM_LIMITS.days).map((day) => day.id) ?? [],
  );
  const [templateId, setTemplateId] = useState(initialStart.templateId ?? templates[0]?.id ?? '');
  const blockedIds = useMemo(() => new Set(form.exercises.filter((exercise) => exercise.blocked).map((exercise) => exercise.id)), [form.exercises]);
  /** "Sana önerilmeyen 1 hareket; kopyada işaretli kalır." — yoksa null. */
  const blockedNote = (blocks: readonly TemplateBlock[]) => {
    const count = blocks.reduce((sum, block) => sum + block.rows.filter((row) => blockedIds.has(row.exerciseId)).length, 0);
    return count > 0 ? `Sana önerilmeyen ${formatNumber(count)} hareket; kopyada işaretli kalır.` : null;
  };

  if (step) {
    return (
      <OwnProgramForm
        {...form}
        mode="own"
        programId={step.programId}
        creating
        initial={step.initial}
        base={null}
        saveUrl={`/api/me/programs/${step.programId}`}
        doneHref="/me/programlar/{id}"
      />
    );
  }

  const toggleDay = (id: string, on: boolean) =>
    setDayIds((list) => (on ? (list.includes(id) || list.length >= OWN_PROGRAM_LIMITS.days ? list : [...list, id]) : list.filter((item) => item !== id)));

  const next = () => {
    const problem = ownNameProblem(name, otherNames);
    if (problem) {
      setNameError(problem);
      return;
    }
    const template = templates.find((item) => item.id === templateId);
    const start: OwnStart =
      kind === 'pt' && ptProgram && dayIds.length > 0
        ? { kind: 'pt', program: ptProgram, dayIds }
        : kind === 'template' && template
          ? { kind: 'template', template }
          : { kind: 'blank' };
    const body = ownStartBody(start, programIdSource(ptPhases), new Date());
    setStep({ programId: newOwnProgramId(new Set(takenIds)), initial: { name: name.trim(), currentPhaseId: body.currentPhaseId, phases: body.phases, weekdays: [] } });
  };

  const others = ptPhases.filter((phase) => phase.id !== current?.id);
  const dayRow = (day: { id: string; name: string; blocks: readonly TemplateBlock[] }) => {
    const checked = dayIds.includes(day.id);
    return (
      <FieldLabel key={day.id} htmlFor={`start-day-${day.id}`}>
        <Field orientation="horizontal" className="min-h-11">
          <Checkbox
            id={`start-day-${day.id}`}
            checked={checked}
            disabled={!checked && dayIds.length >= OWN_PROGRAM_LIMITS.days}
            onCheckedChange={(value) => toggleDay(day.id, value === true)}
            className="size-5"
          />
          <FieldContent>
            <FieldTitle className="break-words">{day.name}</FieldTitle>
            {blockedNote(day.blocks) ? <FieldDescription>{blockedNote(day.blocks)}</FieldDescription> : null}
          </FieldContent>
        </Field>
      </FieldLabel>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Field data-invalid={Boolean(nameError) || undefined}>
        <FieldLabel htmlFor="new-own-name">Adı</FieldLabel>
        <Input
          id="new-own-name"
          className="h-11 text-base"
          maxLength={OWN_PROGRAM_LIMITS.name}
          value={name}
          aria-invalid={Boolean(nameError) || undefined}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
          }}
        />
        {nameError ? <FieldError>{nameError}</FieldError> : null}
      </Field>

      <div className="flex flex-col gap-2">
        <h2 id="start-title" className="text-sm font-medium">
          Nasıl başlayalım?
        </h2>
        <RadioGroup aria-labelledby="start-title" value={kind} onValueChange={(value) => setKind(value as StartKind)}>
          <FieldLabel htmlFor="start-blank">
            <Field orientation="horizontal" className="min-h-11">
              <RadioGroupItem value="blank" id="start-blank" />
              <FieldContent>
                <FieldTitle>Boş program</FieldTitle>
              </FieldContent>
            </Field>
          </FieldLabel>
          {current ? (
            <FieldLabel htmlFor="start-pt">
              <Field orientation="horizontal" className="min-h-11">
                <RadioGroupItem value="pt" id="start-pt" />
                <FieldContent>
                  <FieldTitle>Antrenörünün programından</FieldTitle>
                  <FieldDescription>Günler senin hedeflerinle kopyalanır; antrenörün sonra değiştirse de kopyan değişmez.</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          ) : null}
          {templates.length > 0 ? (
            <FieldLabel htmlFor="start-template">
              <Field orientation="horizontal" className="min-h-11">
                <RadioGroupItem value="template" id="start-template" />
                <FieldContent>
                  <FieldTitle>Hazır şablondan</FieldTitle>
                </FieldContent>
              </Field>
            </FieldLabel>
          ) : null}
        </RadioGroup>

        {kind === 'pt' && current ? (
          <div className="flex flex-col gap-1 pl-7">
            {current.days.map(dayRow)}
            {others.length > 0 ? (
              <details className="flex flex-col gap-1">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">Öteki evreler</summary>
                {others.map((phase) => (
                  <div key={phase.id} className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-muted-foreground">{phase.name}</p>
                    {phase.days.map(dayRow)}
                  </div>
                ))}
              </details>
            ) : null}
            {dayIds.length === 0 ? <p className="text-sm text-muted-foreground">Gün seçmezsen boş bir günle başlar.</p> : null}
          </div>
        ) : null}

        {kind === 'template' && templates.length > 0 ? (
          <RadioGroup aria-label="Şablon" className="pl-7" value={templateId} onValueChange={(value) => setTemplateId(String(value))}>
            {templates.map((template) => (
              <FieldLabel key={template.id} htmlFor={`start-template-${template.id}`}>
                <Field orientation="horizontal" className="min-h-11">
                  <RadioGroupItem value={template.id} id={`start-template-${template.id}`} />
                  <FieldContent>
                    <FieldTitle className="break-words">{template.name}</FieldTitle>
                    <FieldDescription className="tabular-nums">
                      {template.blocks.reduce((sum, block) => sum + block.rows.length, 0)} hareket
                      {blockedNote(template.blocks as TemplateBlock[]) ? ` · ${blockedNote(template.blocks as TemplateBlock[])}` : ''}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        ) : null}
      </div>

      <Button size="lg" className="h-11 w-full" onClick={next}>
        Devam
      </Button>
    </div>
  );
}

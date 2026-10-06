'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, getInput, setErrors, setInput, useField, useForm } from '@formisch/react';
import { ArrowClockwise, Bandaids, CopySimple, FileText, Plus, Square, Trash, UserCircle, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { BlockEditor } from '@/components/block-editor/block-editor';
import type { BlocksFormStore } from '@/components/block-editor/block-items';
import { DraftAutosave, DraftNotice, useEditorDraft } from '@/components/block-editor/editor-draft';
import { keepLineEnter } from '@/components/block-editor/enter-key';
import { EditorSaveProvider, FloatingSaveButton, SaveButton } from '@/components/block-editor/editor-save';
import { LabeledSelect } from '@/components/labeled-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { showUndoToast } from '@/components/undo-toast';
import { UnsavedChangesGuard, type UnsavedChangesGuardHandle } from '@/components/unsaved-changes-guard';
import { WeekdayToggle } from '@/components/weekday-toggle';
import type { EditorCare } from '@/lib/constraint-filter';
import { dayBlocksPath } from '@/lib/editor-undo';
import { formatNumber } from '@/lib/format';
import { copyPtDays, OWN_PROGRAM_LIMITS, ownNameProblem, type OwnProgramDay, type OwnProgramPhase } from '@/lib/own-programs';
import {
  addDay,
  blankDay,
  copyDay,
  dayFromTemplateForEditing,
  droppedDeviceNotice,
  missingExerciseDays,
  prepareProgramForEditing,
  programIdSource,
  removeDay,
  PROGRAM_LIMITS,
  type ClientTargets,
  type ProgramBase,
  type ProgramPhase,
  type TemplateOption,
} from '@/lib/program-plan';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { ownProgramFormSchema, type OwnProgramFormInput, type OwnProgramFormValues } from '@/lib/schemas/own-program';
import type { EditorDevice, PickerExercise } from '@/lib/template-edit';
import { countRows, type TemplateBlock } from '@/lib/template-plan';
import { normalizeWeekdays } from '@/lib/training-days';
import { cn } from '@/lib/utils';
import { ownProgramDraftKey, PROGRAM_DRAFT_BASE } from '@/lib/unsaved-changes';

/** Sheet'ler telefonda alttan; dokunma hedefleri 44 px. */
const BOTTOM = 'gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))]';
const FREQUENCY_LABELS: Record<string, string> = {
  none: 'Belirtme',
  ...Object.fromEntries(Array.from({ length: PROGRAM_LIMITS.daysPerWeek }, (_, index) => [String(index + 1), `${index + 1} gün`])),
};

/** Formun girdisi: notlar düzenleyicide boş metin (PT'nin program formuyla aynı). */
function toInput(phases: readonly OwnProgramPhase[]): OwnProgramFormInput['phases'] {
  return phases.map((phase) => ({
    ...phase,
    days: phase.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => ({ ...block, rows: block.rows.map((row) => ({ ...row, note: row.note ?? '' })) })),
    })),
  })) as OwnProgramFormInput['phases'];
}

export type OwnProgramFormProps = {
  /** `own`: danışan (telefon, sade düzenleyici); `own-pt`: PT paylaşılmış programı düzenler (ad salt okuma). */
  mode: 'own' | 'own-pt';
  clientId: string;
  /** Programın kimliği (oluştururken telefonda üretilen). */
  programId: string;
  creating: boolean;
  draftIdentity?: string;
  initial: { name: string; currentPhaseId: string; phases: OwnProgramPhase[]; weekdays: number[] };
  /** Yüklenen sürüm (revision ve oluşturulma anı); oluştururken null. */
  base: ProgramBase | null;
  exercises: PickerExercise[];
  devices: EditorDevice[];
  /** "+ Gün → Antrenörünün programından" (danışan): PT'nin programının günleri ve danışanın hedefleri. */
  ptProgram?: { phases: ProgramPhase[]; clientTargets?: ClientTargets | undefined } | null;
  /** "+ Gün → Hazır şablondan": danışanda yalnız açık şablonlar, PT'de hepsi. */
  templates: TemplateOption[];
  /** Danışanın öteki programlarının adları (ad benzersiz olmalı). */
  otherNames: string[];
  timeZone: string;
  saveUrl: string;
  /** Kaydedince gidilecek sayfa (`{id}` programın kimliğiyle değişir). */
  doneHref: string;
  /** Açılışta eklenecek günler (Antrenörünün programından "Kendi programına kopyala"). */
  addPtDayIds?: string[];
  /**
   * PT (`own-pt`): danışanın kısıtları, PT'nin program düzenleyicisiyle aynı (`kisit-tarama.md` §3.2: sheet'te işaret,
   * "Bu danışana önerilmeyenler", "Yine de ekle"; kartta rozet). Danışanda kısıt egzersizlerin işaretindedir
   * (`blocked`, `caution`).
   */
  care?: EditorCare | null;
};

/**
 * Kendi program düzenleyicisi (`docs/design/kendi-program.md` §2.5, §4) — oluşturma ve düzenleme, evresiz tek gün
 * listesi. Danışanda (`own`) telefon öncelikli ve sade (`BlockEditor` `simple`: kural, RIR ve yüzdeli set düzeni yok);
 * PT'de (`own-pt`) tam düzenleyici, ad salt okuma. Günler: 7 günlük seçim, hiç gün seçilmemişse "Gün seçmezsen
 * haftada kaç gün"; çipler ve "+ Gün" sheet'i (boş, antrenörünün programından, hazır şablondan, bu programdan kopya).
 * Kaydet, yüzen Kaydet, yerel taslak (`pulsecoach.draft.own.<danışan>.<program>`), çıkış uyarısı ve 412 / 403 / 404
 * uyarıları PT'nin program düzenleyicisiyle aynı desen.
 */
export function OwnProgramForm(props: OwnProgramFormProps) {
  const { mode, clientId, programId, creating, initial, exercises, devices, templates, timeZone } = props;
  const router = useRouter();
  const own = mode === 'own';
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const deviceIds = useMemo(() => new Set(devices.map((device) => device.id)), [devices]);

  // Açılış: silinmiş cihaza yazılmış satırlar egzersizin cihazına döner; kopyadan gelen günler eklenir.
  const [start] = useState(() => {
    const prepared = prepareProgramForEditing(initial.phases as ProgramPhase[], deviceIds);
    let phases = prepared.phases as OwnProgramPhase[];
    const phase = phases[0];
    if (phase && props.ptProgram && props.addPtDayIds?.length) {
      const copied = copyPtDays(props.ptProgram, props.addPtDayIds, phase.days, programIdSource(phases as ProgramPhase[]), new Date());
      phases = [{ ...phase, days: [...phase.days, ...copied] }];
    }
    const input: OwnProgramFormInput = {
      name: initial.name,
      currentPhaseId: initial.currentPhaseId,
      phases: toInput(phases),
      weekdays: initial.weekdays,
    };
    const added = phases[0]?.days.length !== initial.phases[0]?.days.length;
    return { input, dropped: prepared.droppedDeviceRowIds, added, firstDayId: (added ? phases[0]?.days.at(-1)?.id : phases[0]?.days[0]?.id) ?? '' };
  });
  const form = useForm({ schema: ownProgramFormSchema, initialInput: start.input });
  const phasesInput = useField(form, { path: ['phases'] }).input;
  const phases = useMemo(() => (phasesInput ?? []) as unknown as OwnProgramPhase[], [phasesInput]);
  const weekdaysField = useField(form, { path: ['weekdays'] });
  const weekdays = normalizeWeekdays(weekdaysField.input ?? []);
  const nameField = useField(form, { path: ['name'] });
  const frequencyField = useField(form, { path: ['phases', 0, 'daysPerWeek'] });
  const phase = phases[0];
  const days = useMemo(() => phase?.days ?? [], [phase]);

  const [selectedDayId, setSelectedDayId] = useState(start.firstDayId);
  const [addOpen, setAddOpen] = useState(false);
  const [problem, setProblem] = useState<'stale' | 'unshared' | 'missing' | null>(null);
  const guard = useRef<UnsavedChangesGuardHandle>(null);
  const draftKey = ownProgramDraftKey(clientId, props.draftIdentity ?? (creating ? null : programId));
  const draft = useEditorDraft({ form, schema: ownProgramFormSchema, storageKey: draftKey, base: props.base, baseSchema: PROGRAM_DRAFT_BASE });

  const dayIndex = Math.max(0, days.findIndex((day) => day.id === selectedDayId));
  const selectedDay = days[dayIndex];
  const exerciseIds = useMemo(() => new Set(exercises.map((exercise) => exercise.id)), [exercises]);
  const missing = useMemo(() => missingExerciseDays(phases as ProgramPhase[], exerciseIds), [phases, exerciseIds]);
  const missingRows = missing.reduce((sum, item) => sum + item.rowIds.length, 0);
  // Kısıtının yasakladığı ama programda duran (kopyayla gelmiş) satırlar: sessizce kalmaz (`kisit-tarama.md` §3.7).
  const blockedRows = useMemo(
    () =>
      days.flatMap((day) =>
        day.blocks.flatMap((block) =>
          block.rows.flatMap((row) => {
            const exercise = exerciseById.get(row.exerciseId);
            return exercise?.blocked ? [`${day.name} · ${exercise.title}`] : [];
          }),
        ),
      ),
    [days, exerciseById],
  );
  const rowsText = (blocks: readonly TemplateBlock[]) => {
    const blocked = blocks.reduce((sum, block) => sum + block.rows.filter((row) => exerciseById.get(row.exerciseId)?.blocked).length, 0);
    return `${formatNumber(countRows(blocks))} hareket${blocked > 0 ? ` · sana önerilmeyen ${formatNumber(blocked)}` : ''}`;
  };

  const current = useCallback(() => (getInput(form, { path: ['phases'] }) ?? []) as unknown as OwnProgramPhase[], [form]);
  const write = useCallback((next: OwnProgramPhase[]) => setInput(form, { path: ['phases'], input: toInput(next) }), [form]);
  const change = useCallback(
    (update: (phasesNow: ProgramPhase[]) => ProgramPhase[], select?: string) => {
      const before = current();
      const after = update(before as ProgramPhase[]) as OwnProgramPhase[];
      if (after === (before as unknown)) return false;
      write(after);
      if (select) setSelectedDayId(select);
      return true;
    },
    [current, write],
  );

  const addDayWith = (make: (phase: OwnProgramPhase, all: OwnProgramPhase[]) => OwnProgramDay | null) => {
    const all = current();
    const target = all[0];
    if (!target) return;
    const day = make(target, all);
    if (!day) return;
    if (change((phasesNow) => addDay(phasesNow, target.id, day), day.id)) {
      setAddOpen(false);
      toast(`${day.name} eklendi`);
    }
  };

  const removeSelectedDay = () => {
    const all = current();
    const target = all[0];
    if (!target || !selectedDay || target.days.length <= 1) return;
    const before = all;
    const neighbour = target.days[dayIndex - 1] ?? target.days[dayIndex + 1];
    write(removeDay(all as ProgramPhase[], target.id, selectedDay.id) as OwnProgramPhase[]);
    if (neighbour) setSelectedDayId(neighbour.id);
    const after = JSON.stringify(current());
    showUndoToast(`${selectedDay.name} silindi`, () => {
      if (JSON.stringify(current()) !== after) {
        toast.error('Sonrasında başka değişiklik yapıldı; geri alınamadı.');
        return;
      }
      write(before);
      setSelectedDayId(selectedDay.id);
    });
  };

  const save = useServiceMutation({
    fn: (values: OwnProgramFormValues) =>
      fetchJson<{ id: string; revision: number; unchanged?: true; activated?: true; droppedDevices?: number }>(props.saveUrl, {
        method: 'PUT',
        body: JSON.stringify({
          ...(own ? { name: values.name } : {}),
          currentPhaseId: values.currentPhaseId,
          phases: values.phases,
          weekdays: values.weekdays ?? [],
          // Açılıştaki günler: arada Bugün'den değişen günler ezilmesin (§3.6).
          baseWeekdays: initial.weekdays,
          baseRevision: draft.saveBase?.revision ?? null,
          baseCreatedAt: draft.saveBase?.createdAt,
        }),
      }),
    notify: 'error',
    onError: (error) => {
      if (error.status === 412) setProblem('stale');
      else if (error.status === 403) setProblem('unshared');
      else if (error.status === 404) setProblem('missing');
      else if (applyFieldErrors(form as never, error)) {
        // Satırın hatası (ör. kütüphaneden eklenmiş yasaklı hareket): o gün açılır.
        const index = Object.keys(error.fields)
          .map((key) => key.match(/^phases\.0\.days\.(\d+)\./)?.[1])
          .find((value) => value !== undefined);
        const day = index === undefined ? undefined : current()[0]?.days[Number(index)];
        if (day) setSelectedDayId(day.id);
      }
    },
    onSuccess: async (result) => {
      draft.discard();
      const name = own ? (getInput(form, { path: ['name'] }) ?? initial.name).trim() : initial.name;
      const dropped = result.droppedDevices
        ? { description: `${formatNumber(result.droppedDevices)} satırın cihazı artık yok; egzersizin kendi cihazı kullanıldı.` }
        : undefined;
      if (result.unchanged) toast.success('Değişiklik yoktu; program aynı kaldı.');
      else if (creating && own && !result.activated) {
        // PT'nin programı varken yeni program kendiliğinden seçilmez (§3.2): tek dokunuşla Bugün'ün programı olur.
        toast.success(`${name} oluşturuldu`, {
          action: {
            label: "Bugün'ün programı yap",
            onClick: () => {
              void fetchJson('/api/me/programs/active', { method: 'POST', body: JSON.stringify({ programId: result.id }) }).then(
                () => {
                  toast.success(`Bugün ${name} ile açılır`);
                  router.refresh();
                },
                () => toast.error("Seçilemedi; Programlar'dan yeniden dene."),
              );
            },
          },
        });
      } else if (creating && result.activated) toast.success(`${name} oluşturuldu`, { description: `Bugün ${name} ile açılır.` });
      else toast.success(creating ? `${name} oluşturuldu` : 'Program kaydedildi.', dropped);
      router.push(props.doneHref.replace('{id}', result.id));
      router.refresh();
    },
  });

  const dirty = form.isDirty || start.dropped.length > 0 || start.added;
  const guarded = dirty && !save.isPending && !save.isSuccess;
  const noted = useMemo(() => new Set(start.dropped), [start.dropped]);
  const droppedNotice = droppedDeviceNotice(phases as ProgramPhase[], noted, dirty);

  const submit = (values: OwnProgramFormValues) => {
    // Ad danışanın öteki programlarında olmamalı (sunucu da denetler).
    if (own) {
      const nameProblem = ownNameProblem(values.name, props.otherNames);
      if (nameProblem) {
        setErrors(form, { path: ['name'], errors: [nameProblem] });
        return;
      }
    }
    // Kütüphanede olmayan egzersiz kaydedilmez: satırın altında söylenir, o gün açılır.
    let firstDay: string | null = null;
    values.phases.forEach((phaseValue, i) =>
      phaseValue.days.forEach((day, j) =>
        day.blocks.forEach((block, b) =>
          block.rows.forEach((row, r) => {
            if (exerciseById.has(row.exerciseId)) return;
            firstDay ??= day.id;
            setErrors(form, {
              path: ['phases', i, 'days', j, 'blocks', b, 'rows', r, 'exerciseId'],
              errors: ['Bu egzersiz kütüphanede yok; kartı sil, yerine yenisini ekle.'],
            });
          }),
        ),
      ),
    );
    if (firstDay) {
      setSelectedDayId(firstDay);
      return;
    }
    return save.mutateAsync(values).then(
      () => undefined,
      () => undefined,
    );
  };

  /** 412'de "Sayfayı yenile": değişiklikler gider (metin öyle söylüyor), taslak da atılır, tarayıcı ayrıca sormaz. */
  const reload = () => {
    draft.discard();
    guard.current?.release();
    window.location.reload();
  };

  const canAdd = days.length < OWN_PROGRAM_LIMITS.days;
  const ptDays = (props.ptProgram?.phases ?? []).flatMap((item) => item.days.map((day) => ({ day, phase: item })));
  const multiPhase = (props.ptProgram?.phases.length ?? 0) > 1;
  const programLabel = own ? 'Programı' : 'Danışanın programı';

  return (
    <EditorSaveProvider
      value={{ dirty, pending: save.isPending || save.isSuccess, creating, submitLabel: creating ? 'Programı oluştur' : 'Programı kaydet' }}>
      <Form of={form} className="flex flex-col gap-5" onSubmit={submit}>
        {draft.offer ? <DraftNotice offer={draft.offer} timeZone={timeZone} onRestore={draft.restore} onDismiss={draft.dismiss} /> : null}

        {problem ? <SaveProblem problem={problem} own={own} onReload={reload} /> : null}

        {droppedNotice ? (
          <Alert>
            <WarningCircle />
            <AlertDescription>{droppedNotice}</AlertDescription>
          </Alert>
        ) : null}
        {missingRows > 0 ? (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertDescription>{formatNumber(missingRows)} hareket kütüphanede yok; kaydetmeden önce kartlarını sil, yerine yenisini ekle.</AlertDescription>
          </Alert>
        ) : null}
        {blockedRows.length > 0 ? (
          <Alert>
            <Bandaids />
            <AlertTitle>Kısıtın nedeniyle sana önerilmeyen {formatNumber(blockedRows.length)} hareket</AlertTitle>
            <AlertDescription>
              <p>{blockedRows.join(' · ')}</p>
              <p>Kaydedebilirsin; antrenmanda &apos;Değiştir&apos;den bir muadil seç ya da kartı sil. Emin değilsen antrenörüne sor.</p>
            </AlertDescription>
          </Alert>
        ) : null}

        {own ? (
          <Field data-invalid={Boolean(nameField.errors) || undefined}>
            <FieldLabel htmlFor="own-name">Adı</FieldLabel>
            <Input
              {...nameField.props}
              id="own-name"
              className="h-11 text-base"
              maxLength={OWN_PROGRAM_LIMITS.name}
              value={nameField.input ?? ''}
              placeholder="Ör. Evde"
              aria-invalid={Boolean(nameField.errors) || undefined}
              onKeyDown={keepLineEnter}
            />
            <FieldError>{nameField.errors?.[0]}</FieldError>
          </Field>
        ) : null}

        <Field>
          <FieldLabel id="own-weekdays">Antrenman günleri</FieldLabel>
          <WeekdayToggle id="own-weekdays" value={weekdays} onChange={(next) => setInput(form, { path: ['weekdays'], input: next })} />
          {weekdays.length === 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
              <span className="text-sm text-muted-foreground" id="own-frequency-label">
                Gün seçmezsen haftada kaç gün:
              </span>
              <div className="w-32">
                <LabeledSelect
                  id="own-frequency"
                  value={frequencyField.input === undefined ? 'none' : String(frequencyField.input)}
                  labels={FREQUENCY_LABELS}
                  triggerClassName="h-11"
                  onChange={(value) => setInput(form, { path: ['phases', 0, 'daysPerWeek'], input: value === 'none' ? undefined : Number(value) })}
                />
              </div>
            </div>
          ) : (
            <FieldDescription>Bu hafta sayacın seçtiğin gün sayısı kadar.</FieldDescription>
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground" id="own-days-label">
            Günler
          </span>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-labelledby="own-days-label">
            {days.map((day) => {
              const selected = day.id === selectedDay?.id;
              const failing = missing.some((item) => item.dayId === day.id);
              return (
                <Button
                  key={day.id}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  aria-pressed={selected}
                  className={cn('h-11 shrink-0 px-4', failing && 'ring-2 ring-destructive')}
                  onClick={() => setSelectedDayId(day.id)}>
                  {failing ? <WarningCircle data-icon="inline-start" className="text-destructive" /> : null}
                  {day.name}
                </Button>
              );
            })}
            <Button type="button" variant="outline" className="h-11 shrink-0 border-dashed px-4" disabled={!canAdd} onClick={() => setAddOpen(true)}>
              <Plus data-icon="inline-start" />
              Gün
            </Button>
          </div>
          {!canAdd ? <p className="text-xs text-muted-foreground">En fazla {OWN_PROGRAM_LIMITS.days} gün.</p> : null}
        </div>

        {selectedDay && phase ? (
          <>
            <DayName form={form} dayIndex={dayIndex} dayId={selectedDay.id} />
            <BlockEditor
              key={`${selectedDay.id}.${draft.generation}`}
              form={form as unknown as BlocksFormStore}
              path={['phases', 0, 'days', dayIndex, 'blocks']}
              undoPath={() => dayBlocksPath(current() as ProgramPhase[], selectedDay.id)}
              exercises={exercises}
              devices={devices}
              newIds={() => programIdSource(current() as ProgramPhase[])}
              noteHint={own ? 'Antrenmanda görürsün.' : 'Danışan antrenmanda görür.'}
              libraryDescription={own ? 'Antrenörünün kütüphanesinden hareket ekle.' : 'Ada ya da kasa göre ara; dokununca günün sonuna eklenir.'}
              listLabel={`${selectedDay.name} hareketleri`}
              addLabel={`Hareket ekle: ${selectedDay.name}`}
              variant={own ? 'simple' : 'full'}
              care={props.care ?? null}
            />
            {days.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 self-start px-2 text-destructive hover:text-destructive"
                aria-label={`Günü sil: ${selectedDay.name}`}
                onClick={removeSelectedDay}>
                <Trash data-icon="inline-start" />
                Günü sil
              </Button>
            ) : null}
          </>
        ) : (
          <div className="flex justify-end">
            <SaveButton />
          </div>
        )}

        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetContent side="bottom" showCloseButton={false} className={BOTTOM}>
            <SheetHeader className="gap-1.5 pt-5">
              <SheetTitle className="text-lg font-semibold">Gün ekle</SheetTitle>
              <SheetDescription>
                {programLabel} {formatNumber(days.length)}/{formatNumber(OWN_PROGRAM_LIMITS.days)} gün. Eklenen gün listenin sonuna gelir.
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">
              <ul className="flex flex-col gap-2">
                <li>
                  <Item variant="outline" render={<button type="button" className="w-full text-left" onClick={() => addDayWith((target, all) => blankDay(target, programIdSource(all as ProgramPhase[])))} />}>
                    <ItemMedia variant="icon">
                      <Square />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Boş gün</ItemTitle>
                    </ItemContent>
                  </Item>
                </li>
              </ul>

              {selectedDay ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">Bu programdaki bir günü kopyala</h3>
                  <ul className="flex flex-col gap-2">
                    {days.map((day) => (
                      <li key={day.id}>
                        <Item
                          variant="outline"
                          size="sm"
                          render={
                            <button
                              type="button"
                              className="min-h-11 w-full text-left"
                              onClick={() =>
                                addDayWith((target, all) => {
                                  const source = target.days.find((item) => item.id === day.id);
                                  return source ? copyDay(target, source, programIdSource(all as ProgramPhase[])) : null;
                                })
                              }
                            />
                          }>
                          <ItemMedia variant="icon">
                            <CopySimple />
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>{day.name}</ItemTitle>
                            <ItemDescription>{rowsText(day.blocks)}</ItemDescription>
                          </ItemContent>
                        </Item>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {own && ptDays.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">Antrenörünün programından</h3>
                  <ul className="flex flex-col gap-2">
                    {ptDays.map(({ day, phase: from }) => (
                      <li key={day.id}>
                        <Item
                          variant="outline"
                          size="sm"
                          render={
                            <button
                              type="button"
                              className="min-h-11 w-full text-left"
                              onClick={() =>
                                addDayWith((target, all) =>
                                  props.ptProgram ? (copyPtDays(props.ptProgram, [day.id], target.days, programIdSource(all as ProgramPhase[]), new Date())[0] ?? null) : null,
                                )
                              }
                            />
                          }>
                          <ItemMedia variant="icon">
                            <UserCircle />
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>{multiPhase ? `${from.name} · ${day.name}` : day.name}</ItemTitle>
                            <ItemDescription>{rowsText(day.blocks)}</ItemDescription>
                          </ItemContent>
                        </Item>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {templates.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">{own ? 'Hazır şablondan' : 'Şablondan'}</h3>
                  <ul className="flex flex-col gap-2">
                    {templates.map((template) => (
                      <li key={template.id}>
                        <Item
                          variant="outline"
                          size="sm"
                          render={
                            <button
                              type="button"
                              className="min-h-11 w-full text-left"
                              onClick={() => addDayWith((target, all) => dayFromTemplateForEditing(target, template, programIdSource(all as ProgramPhase[]), new Date(), deviceIds).day)}
                            />
                          }>
                          <ItemMedia variant="icon">
                            <FileText />
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>{template.name}</ItemTitle>
                            <ItemDescription>{rowsText(template.blocks as TemplateBlock[])}</ItemDescription>
                          </ItemContent>
                        </Item>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
            <div className="border-t px-4 pt-3 pb-4">
              <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => setAddOpen(false)}>
                Vazgeç
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <FloatingSaveButton />
      </Form>
      <DraftAutosave form={form} onChange={draft.sync} />
      <UnsavedChangesGuard
        ref={guard}
        active={guarded}
        description={own ? 'Çıkarsan bu değişiklikler kaydedilmez.' : 'Çıkarsan bu değişiklikler kaydedilmez; danışan göremez.'}
        onLeave={draft.leave}
      />
    </EditorSaveProvider>
  );
}

/** Seçili günün adı (programda benzersiz). */
function DayName({ form, dayIndex, dayId }: { form: ReturnType<typeof useForm<typeof ownProgramFormSchema>>; dayIndex: number; dayId: string }) {
  const field = useField(form, { path: ['phases', 0, 'days', dayIndex, 'name'] });
  return (
    <Field data-invalid={Boolean(field.errors) || undefined}>
      <FieldLabel htmlFor={`own-day-${dayId}`}>Gün adı</FieldLabel>
      <Input
        {...field.props}
        id={`own-day-${dayId}`}
        className="h-11 text-base"
        maxLength={PROGRAM_LIMITS.dayName}
        value={field.input ?? ''}
        placeholder="Ör. Gün A"
        aria-invalid={Boolean(field.errors) || undefined}
        onKeyDown={keepLineEnter}
      />
      <FieldError>{field.errors?.[0]}</FieldError>
    </Field>
  );
}

/** Kaydın reddi: o arada değişti (412), paylaşım kapandı (403, PT), program silindi (404). */
function SaveProblem({ problem, own, onReload }: { problem: 'stale' | 'unshared' | 'missing'; own: boolean; onReload: () => void }) {
  const text =
    problem === 'stale'
      ? own
        ? {
            title: 'Bu program sen düzenlerken değişti',
            body: 'Antrenörün ya da başka bir cihazın kaydetti. Değişikliklerin burada duruyor; sayfayı yenilersen gider.',
          }
        : {
            title: 'Bu program başka bir yerde değişti',
            body: 'Sen düzenlerken danışan ya da başka bir sekme kaydetti. Değişikliklerin burada ve taslakta duruyor; sayfayı yenilersen gider.',
          }
      : problem === 'unshared'
        ? { title: 'Danışan bu programın paylaşımını kapattı', body: 'Değişikliklerin bu tarayıcıdaki taslakta kaldı; kaydedilemez.' }
        : { title: 'Program silindi', body: own ? 'Bu program artık yok.' : 'Danışan bu programı sildi; değişiklikler kaydedilemez.' };
  return (
    <Alert variant="destructive" data-form-error>
      <WarningCircle />
      <AlertTitle>{text.title}</AlertTitle>
      <AlertDescription>{text.body}</AlertDescription>
      {problem === 'stale' ? (
        <div className="col-start-2 mt-2">
          <Button type="button" variant="outline" size="sm" className="touch:h-11" onClick={onReload}>
            <ArrowClockwise data-icon="inline-start" />
            Sayfayı yenile
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}

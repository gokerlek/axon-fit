'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Form, getDeepErrorEntry, getInput, setErrors, setInput, useField, useForm, type FormStore } from '@formisch/react';
import { ArrowClockwise, ArrowSquareOut, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { EditorBar, EditorBarProvider } from '@/components/block-editor/editor-bar';
import { LabeledSelect } from '@/components/labeled-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { showUndoToast } from '@/components/undo-toast';
import {
  addDay,
  dayFromTemplate,
  locateDay,
  mergePhases,
  mergePhasesCheck,
  missingExerciseDays,
  moveDayToPhase,
  nextDayId,
  prepareProgramForEditing,
  programIdSource,
  reconcileRotation,
  reIdBlocks,
  replaceDayBlocks,
  type ProgramBody,
  type ProgramPhase,
  type ProgramRotation,
  type TemplateOption,
} from '@/lib/program-plan';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { programFormSchema, type ProgramFormInput, type ProgramFormValues } from '@/lib/schemas/program';
import type { EditorDevice, PickerExercise } from '@/lib/template-edit';
import type { TemplateBlock } from '@/lib/template-plan';
import { AddDayDialog } from './add-day-dialog';
import { DayEditor } from './day-editor';
import { DaysCard } from './days-card';
import { PhasesCard } from './phases-card';
import { SaveTemplateDialog } from './save-template-dialog';

export type ProgramFormStore = FormStore<typeof programFormSchema>;

/** Kayıttaki şu anki evre ve rotasyon (düzenlemede; oluştururken yok). */
export type StoredState = { current: { phaseId: string; startedAt: string }; rotation: ProgramRotation };

/** Evre ve gün işlemlerinin ortak arayüzü (program-form sağlar, evreler ve gün düzenleyici kullanır). */
export type PhaseActions = {
  /** Olay anındaki güncel evreler (ardışık çağrılar birbirini ezmesin). */
  current: () => ProgramPhase[];
  /** Yapısal değişiklik: evreler tek seferde yazılır; istenirse gün seçilir ve ekran okuyucuya duyurulur. */
  update: (change: (phases: ProgramPhase[]) => ProgramPhase[], options?: { select?: string; announce?: string }) => void;
  /** Geri alınabilir yapısal değişiklik (silme, doldurma); bildirimde "Geri al" çıkar. */
  updateWithUndo: (change: (phases: ProgramPhase[]) => ProgramPhase[], message: string, options?: { select?: string }) => void;
  select: (dayId: string) => void;
  setCurrentPhase: (phaseId: string) => void;
  /** Evrelere böl (açık) ya da evreleri kaldır (günler şu anki evrede tek listede birleşir); geri alınabilir. */
  setPhased: (phased: boolean) => void;
  /** Günü başka evreye taşır (sona). */
  moveDay: (dayId: string, phaseId: string) => void;
  openAddDay: (phaseId: string) => void;
  openSaveTemplate: () => void;
};

/** Geri alma için formun yapısal hâli: evre seçimi ve evreler. */
type Snapshot = { phased: boolean; phases: ProgramPhase[] };

const NO_TEMPLATE = 'none';
const DAY_ERROR_KEY = /^phases\.(\d+)\.days\.(\d+)\./;

/** Formun girdisi: notlar düzenleyicide boş metin (şablon formuyla aynı). */
function toInput(phases: readonly ProgramPhase[]): ProgramFormInput['phases'] {
  return phases.map((phase) => ({
    ...phase,
    days: phase.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => ({ ...block, rows: block.rows.map((row) => ({ ...row, note: row.note ?? '' })) })),
    })),
  }));
}

/**
 * Danışana özel program düzenleyici — oluşturma ve düzenleme, kendi sayfasında (SPEC §6).
 *
 * Tek Formisch formu: evre seçimi, evreler, günler ve şu anki evre. Evresiz programda
 * günler tek listededir ("Günler" kartı); "Evrelere böl" evreleri açar. Evre ve gün işlemleri
 * (`program-plan.ts`) evre dizisine tek seferde yazılır; seçili günün hareketleri
 * şablonlarla ortak hareket düzenleyicide (`BlockEditor`). Kimlikler bütün programda
 * benzersiz üretilir. Kayıtta sunucu farkı çıkarır, program geçmişine yazar. "+ Hareket ekle"
 * (seçili güne) ve Kaydet formun sonundaki yapışkan alt çubukta (`EditorBar`).
 */
export function ProgramForm({
  clientId,
  mode,
  initial,
  baseRevision,
  stored,
  templates,
  exercises,
  devices,
  now,
  timeZone,
}: {
  clientId: string;
  mode: 'create' | 'edit';
  initial: ProgramBody;
  baseRevision: number | null;
  stored: StoredState | null;
  templates: TemplateOption[];
  exercises: PickerExercise[];
  devices: EditorDevice[];
  /** Sayfanın yüklendiği an (sunucuda): evre durumu sunucu ve tarayıcıda aynı hesaplansın. */
  now: string;
  timeZone: string;
}) {
  const router = useRouter();
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);

  // Düzenlemede artık olmayan cihaza yazılmış satırlar egzersizin cihazına döner (kaydedince kalıcı).
  const [start] = useState(() => {
    const prepared = prepareProgramForEditing(initial.phases, new Set(devices.map((device) => device.id)));
    const input: ProgramFormInput = { phased: initial.phased, currentPhaseId: initial.currentPhaseId, phases: toInput(prepared.phases) };
    return {
      input,
      dropped: prepared.droppedDeviceRowIds.length,
      skeletonDayId: initial.phases[0]?.days[0]?.id ?? '',
    };
  });
  const form = useForm({ schema: programFormSchema, initialInput: start.input });
  const phases = (useField(form, { path: ['phases'] }).input ?? []) as unknown as ProgramPhase[];
  const currentPhaseId = useField(form, { path: ['currentPhaseId'] }).input ?? '';
  const phased = useField(form, { path: ['phased'] }).input ?? false;
  const exerciseIds = useMemo(() => new Set(exercises.map((exercise) => exercise.id)), [exercises]);
  // Canlı evrelerden: değiştirilen/kaldırılan satır ya da silinen gün uyarıdan hemen düşer.
  const missing = useMemo(() => missingExerciseDays(phases, exerciseIds), [phases, exerciseIds]);

  const [templateList, setTemplateList] = useState(templates);
  const [startChoice, setStartChoice] = useState(NO_TEMPLATE);
  const [announcement, setAnnouncement] = useState('');
  const [stale, setStale] = useState(false);
  const [addDayPhaseId, setAddDayPhaseId] = useState<string | null>(null);
  const [saveBlocks, setSaveBlocks] = useState<TemplateBlock[] | null>(null);
  const [dialogKey, setDialogKey] = useState(0);

  // İlk seçili gün: danışanın sıradaki günü, yoksa şu anki evrenin ilk günü.
  const [selectedDayId, setSelectedDayId] = useState(
    () =>
      nextDayId({
        phases: initial.phases,
        current: { phaseId: initial.currentPhaseId, startedAt: '' },
        rotation: stored?.rotation ?? {},
      }) ?? '',
  );

  // Seçim her çizimde çözülür: silinen gün eski yolla hiç çizilmez (Formisch yolu dizinle bulur).
  const currentIndex = Math.max(0, phases.findIndex((phase) => phase.id === currentPhaseId));
  const located =
    locateDay(phases, selectedDayId) ?? (phases[currentIndex]?.days[0] ? { phaseIndex: currentIndex, dayIndex: 0 } : null);
  const selectedPhase = located ? phases[located.phaseIndex] : undefined;
  const selectedDay = located ? selectedPhase?.days[located.dayIndex] : undefined;

  // Sıradaki gün: şu anki evre kayıttakiyse rotasyon (silinen son gün uzlaştırılarak), değiştiyse yeni evrenin ilk günü.
  const rotation = stored && currentPhaseId === stored.current.phaseId ? reconcileRotation(initial.phases, phases, stored.rotation) : {};
  const next = nextDayId({ phases, current: { phaseId: currentPhaseId, startedAt: '' }, rotation });
  const missingDayIds = useMemo(() => new Set(missing.map((item) => item.dayId)), [missing]);
  const templateIds = useMemo(() => new Set(templateList.map((template) => template.id)), [templateList]);

  const current = useCallback(() => (getInput(form, { path: ['phases'] }) ?? []) as unknown as ProgramPhase[], [form]);
  const write = useCallback((nextPhases: ProgramPhase[]) => setInput(form, { path: ['phases'], input: toInput(nextPhases) }), [form]);

  const update = useCallback<PhaseActions['update']>(
    (change, options) => {
      const before = current();
      const after = change(before);
      if (after === before) return;
      write(after);
      if (options?.select) setSelectedDayId(options.select);
      if (options?.announce) setAnnouncement(options.announce);
    },
    [current, write],
  );

  const snapshot = useCallback(
    (): Snapshot => ({ phased: getInput(form, { path: ['phased'] }) ?? false, phases: current() }),
    [form, current],
  );
  // Evresiz hâlde tek evre olur: sıra, ara hâlde iki evreli evresiz program oluşmasın diye.
  const restore = useCallback(
    (state: Snapshot) => {
      if (state.phased) {
        setInput(form, { path: ['phased'], input: true });
        write(state.phases);
      } else {
        write(state.phases);
        setInput(form, { path: ['phased'], input: false });
      }
    },
    [form, write],
  );

  /**
   * "Geri al" bildirimi (hareket düzenleyicisiyle ortak, aynı anda tek): yalnız bu işlemden
   * sonra başka değişiklik yoksa geçerli; yoksa sonraki düzenlemeler silinirdi.
   */
  const offerUndo = useCallback(
    (before: Snapshot, message: string) => {
      const after = JSON.stringify(snapshot());
      setAnnouncement(message);
      showUndoToast(message, () => {
        if (JSON.stringify(snapshot()) !== after) {
          toast.error('Sonrasında başka değişiklik yapıldı; geri alınamadı.');
          return;
        }
        restore(before);
      });
    },
    [snapshot, restore],
  );

  const updateWithUndo = useCallback<PhaseActions['updateWithUndo']>(
    (change, message, options) => {
      const before = snapshot();
      const after = change(before.phases);
      if (after === before.phases) return;
      write(after);
      if (options?.select) setSelectedDayId(options.select);
      offerUndo(before, message);
    },
    [snapshot, write, offerUndo],
  );

  const setPhased = (next: boolean) => {
    const before = snapshot();
    if (before.phased === next) return;
    if (next) {
      setInput(form, { path: ['phased'], input: true });
      offerUndo(before, "Evrelere bölündü; günleri 'Evreye taşı' ile dağıt.");
      return;
    }
    const check = mergePhasesCheck(before.phases);
    if (!check.ok) {
      toast.error(`Birleşince ${check.days} gün olur; tek listede en fazla 7 gün olabilir. Önce bazı günleri sil.`);
      return;
    }
    const merged = mergePhases(before.phases, getInput(form, { path: ['currentPhaseId'] }) ?? '');
    const mergedId = merged.phases[0]?.id;
    write(merged.phases);
    if (mergedId) setInput(form, { path: ['currentPhaseId'], input: mergedId });
    setInput(form, { path: ['phased'], input: false });
    offerUndo(before, 'Evreler kaldırıldı; günler tek listede sırayla döner.');
  };

  const actions: PhaseActions = {
    current,
    update,
    updateWithUndo,
    select: setSelectedDayId,
    setCurrentPhase: (phaseId) => setInput(form, { path: ['currentPhaseId'], input: phaseId }),
    setPhased,
    moveDay: (dayId, phaseId) => {
      const all = current();
      const day = all.flatMap((phase) => phase.days).find((item) => item.id === dayId);
      const target = all.find((phase) => phase.id === phaseId);
      if (!day || !target) return;
      update((phasesNow) => moveDayToPhase(phasesNow, dayId, phaseId), {
        select: dayId,
        announce: `${day.name} '${target.name}' evresine taşındı`,
      });
    },
    openAddDay: (phaseId) => {
      setDialogKey((key) => key + 1);
      setAddDayPhaseId(phaseId);
    },
    openSaveTemplate: () => {
      if (!located) return;
      const blocks = getInput(form, { path: ['phases', located.phaseIndex, 'days', located.dayIndex, 'blocks'] });
      setDialogKey((key) => key + 1);
      setSaveBlocks((blocks ?? []) as unknown as TemplateBlock[]);
    },
  };

  // Oluştururken: ilk gün ("Gün A") başlangıç şablonuyla dolar ya da boşalır.
  const chooseStart = (value: string) => {
    setStartChoice(value);
    const before = current();
    const dayId = locateDay(before, start.skeletonDayId) ? start.skeletonDayId : before[0]?.days[0]?.id;
    const day = dayId ? before.flatMap((phase) => phase.days).find((item) => item.id === dayId) : undefined;
    if (!dayId || !day) return;
    const template = templateList.find((item) => item.id === value);
    if (template) {
      const ids = programIdSource(before);
      const source = { templateId: template.id, templateName: template.name, at: new Date().toISOString() };
      updateWithUndo(
        (phasesNow) => replaceDayBlocks(phasesNow, dayId, reIdBlocks(template.blocks, ids), source),
        `${day.name} şablonla dolduruldu`,
        { select: dayId },
      );
      return;
    }
    if (day.blocks.length === 0 && !day.source) return;
    updateWithUndo((phasesNow) => replaceDayBlocks(phasesNow, dayId, [], null), `${day.name} boşaltıldı`, { select: dayId });
  };

  const addFromTemplate = (template: TemplateOption) => {
    const before = current();
    const phase = before.find((item) => item.id === addDayPhaseId);
    if (!phase) return;
    const day = dayFromTemplate(phase, template, programIdSource(before), new Date());
    update((phasesNow) => addDay(phasesNow, phase.id, day), {
      select: day.id,
      announce: `${day.name} eklendi ('${template.name}' şablonundan)`,
    });
    setAddDayPhaseId(null);
  };

  /** Sunucunun alan hatalarından ilk günü açar (`phases.1.days.0.…`). */
  const selectFromErrorKeys = (keys: string[]) => {
    for (const key of keys) {
      const match = key.match(DAY_ERROR_KEY);
      const day = match ? phases[Number(match[1])]?.days[Number(match[2])] : undefined;
      if (day) {
        setSelectedDayId(day.id);
        return;
      }
    }
  };

  const save = useServiceMutation({
    fn: (values: ProgramFormValues) =>
      fetchJson<{ revision: number; unchanged?: true }>(`/api/clients/${clientId}/program`, {
        method: 'PUT',
        body: JSON.stringify({ ...values, baseRevision }),
      }),
    notify: 'error',
    onError: (error) => {
      if (error.status === 412) {
        setStale(true);
        return;
      }
      applyFieldErrors(form as never, error);
      selectFromErrorKeys(Object.keys(error.fields));
    },
    onSuccess: (result) => {
      toast.success(
        result.unchanged ? 'Değişiklik yoktu; program aynı kaldı.' : mode === 'create' ? 'Program oluşturuldu.' : 'Program kaydedildi.',
      );
      router.push(`/dashboard/clients/${clientId}/program`);
      router.refresh();
    },
  });

  // Kaydedilmemiş değişiklik varken sekme kapanmasın; cihazı silinmiş satırların düzeltmesi de
  // kaydedilmemiş iştir (çubuk "Kaydedildi" demesin).
  const dirty = form.isDirty || start.dropped > 0;
  const guarded = dirty && !save.isPending && !save.isSuccess;
  useEffect(() => {
    if (!guarded) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [guarded]);

  const submit = (values: ProgramFormValues) => {
    // Kütüphanede olmayan egzersiz kaydedilmez: satırın altında söylenir, o gün açılır.
    let firstDay: string | null = null;
    values.phases.forEach((phase, i) =>
      phase.days.forEach((day, j) =>
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

  // Görünmeyen (başka gündeki) hata: hangi günde olduğu ve oraya gitme.
  const hidden = getDeepErrorEntry(form);
  const hiddenPath = hidden?.path as readonly (string | number)[] | undefined;
  const hiddenPhase = hiddenPath?.[0] === 'phases' && hiddenPath[2] === 'days' ? phases[Number(hiddenPath[1])] : undefined;
  const hiddenDay = hiddenPhase && hiddenPath ? hiddenPhase.days[Number(hiddenPath[3])] : undefined;

  const detailHref = `/dashboard/clients/${clientId}`;
  const programHref = `${detailHref}/program`;
  const missingRows = missing.reduce((sum, item) => sum + item.rowIds.length, 0);
  const dayLabel = (phaseName: string, dayName: string) => (phased ? `${phaseName} · ${dayName}` : dayName);
  const missingLabels = missing
    .map((item) => {
      const phase = phases.find((entry) => entry.id === item.phaseId);
      const day = phase?.days.find((entry) => entry.id === item.dayId);
      return phase && day ? dayLabel(phase.name, day.name) : null;
    })
    .filter(Boolean)
    .join(', ');
  const skeleton = locateDay(phases, start.skeletonDayId);
  const skeletonPhase = skeleton ? phases[skeleton.phaseIndex] : phases[0];
  const skeletonDay = skeleton ? skeletonPhase?.days[skeleton.dayIndex] : skeletonPhase?.days[0];
  const startTarget = skeletonPhase && skeletonDay ? dayLabel(skeletonPhase.name, skeletonDay.name) : 'İlk gün';
  const addDayPhase = phases.find((phase) => phase.id === addDayPhaseId);
  const startLabels: Record<string, string> = {
    [NO_TEMPLATE]: 'Şablonsuz (boş)',
    ...Object.fromEntries(templateList.map((template) => [template.id, template.name])),
  };

  return (
    <EditorBarProvider>
      <Form of={form} className="flex flex-col gap-6" onSubmit={submit}>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {start.dropped > 0 ? (
          <Alert>
            <WarningCircle />
            <AlertDescription>
              {start.dropped} satırın cihazı silinmiş; egzersizin kendi cihazına döndü. Kaydedince kalıcı olur.
            </AlertDescription>
          </Alert>
        ) : null}
        {missingRows > 0 ? (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertDescription>
              {missingRows} hareket kütüphanede yok ({missingLabels}); kaydetmeden önce kartlarını sil, yerine yenisini ekle.
            </AlertDescription>
          </Alert>
        ) : null}

        {mode === 'create' ? (
          <Card>
            <CardHeader>
              <CardTitle>Başlangıç</CardTitle>
              <CardDescription>Bir şablonla başlayıp bu danışana göre değiştirebilirsin.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field className="max-w-sm">
                <FieldLabel htmlFor="startTemplate">Başlangıç şablonu</FieldLabel>
                <LabeledSelect id="startTemplate" value={startChoice} labels={startLabels} onChange={chooseStart} />
                <FieldDescription>
                  {startTarget} bu şablonla dolar. Başka günleri &quot;Gün ekle → Şablondan&quot; ile eklersin.
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>
        ) : null}

        {phased ? (
          <PhasesCard
            form={form}
            phases={phases}
            currentPhaseId={currentPhaseId}
            stored={stored}
            selectedDayId={selectedDay?.id ?? null}
            nextDayId={next}
            missingDayIds={missingDayIds}
            hasTemplates={templateList.length > 0}
            now={now}
            timeZone={timeZone}
            actions={actions}
          />
        ) : (
          <DaysCard
            form={form}
            phases={phases}
            selectedDayId={selectedDay?.id ?? null}
            nextDayId={next}
            missingDayIds={missingDayIds}
            hasTemplates={templateList.length > 0}
            actions={actions}
          />
        )}

        {located && selectedPhase && selectedDay ? (
          <DayEditor
            key={selectedDay.id}
            form={form}
            phases={phases}
            phased={phased}
            phase={selectedPhase}
            phaseIndex={located.phaseIndex}
            day={selectedDay}
            dayIndex={located.dayIndex}
            isNext={selectedPhase.id === currentPhaseId && selectedDay.id === next}
            templateIds={templateIds}
            exercises={exercises}
            devices={devices}
            timeZone={timeZone}
            actions={actions}
          />
        ) : null}

        {stale ? (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertTitle>Bu program başka bir yerde değişti</AlertTitle>
            <AlertDescription>
              Sen düzenlerken program başka bir sekmede ya da cihazda kaydedildi. Değişikliklerin burada duruyor; yeni sürümü
              ayrı sekmede açıp karşılaştırabilir ya da sayfayı yenileyip (değişikliklerin gider) baştan düzenleyebilirsin.
            </AlertDescription>
            <div className="col-start-2 mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={programHref} target="_blank" rel="noopener" />}>
                <ArrowSquareOut data-icon="inline-start" />
                Yeni sekmede aç
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  router.refresh();
                  window.location.reload();
                }}>
                <ArrowClockwise data-icon="inline-start" />
                Sayfayı yenile
              </Button>
            </div>
          </Alert>
        ) : null}

        {hidden ? (
          <Alert variant="destructive" data-form-error>
            <WarningCircle />
            <AlertTitle>Kaydedilemedi</AlertTitle>
            <AlertDescription>
              {hiddenPhase && hiddenDay
                ? `${dayLabel(hiddenPhase.name, hiddenDay.name)} gününde düzeltilecek alan var: ${hidden.errors[0] ?? ''}`
                : hidden.errors[0]}
            </AlertDescription>
            {hiddenDay && hiddenDay.id !== selectedDay?.id ? (
              <div className="col-start-2 mt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedDayId(hiddenDay.id)}>
                  O güne git
                </Button>
              </div>
            ) : null}
          </Alert>
        ) : null}

        <AddDayDialog
          key={`add-${dialogKey}`}
          open={addDayPhase !== undefined}
          onOpenChange={(open) => {
            if (!open) setAddDayPhaseId(null);
          }}
          phaseName={phased ? (addDayPhase?.name ?? '') : null}
          templates={templateList}
          exercises={exerciseById}
          onAdd={addFromTemplate}
        />
        <SaveTemplateDialog
          key={`save-${dialogKey}`}
          open={saveBlocks !== null}
          onOpenChange={(open) => {
            if (!open) setSaveBlocks(null);
          }}
          blocks={saveBlocks ?? []}
          onCreated={(template) => setTemplateList((list) => [...list, template])}
        />

        <EditorBar
          cancelHref={mode === 'edit' ? programHref : detailHref}
          creating={mode === 'create'}
          submitLabel={mode === 'create' ? 'Programı oluştur' : 'Kaydet'}
          dirty={dirty}
          pending={save.isPending || save.isSuccess}
        />
      </Form>
    </EditorBarProvider>
  );
}

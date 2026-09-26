'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Form, getDeepErrorEntry, getInput, setErrors, setInput, useField, useForm, type FormStore } from '@formisch/react';
import { ArrowClockwise, ArrowSquareOut, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { DraftAutosave, DraftNotice, useEditorDraft } from '@/components/block-editor/editor-draft';
import { EditorSaveProvider, FloatingSaveButton, SaveButton } from '@/components/block-editor/editor-save';
import { LabeledSelect } from '@/components/labeled-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { showUndoToast } from '@/components/undo-toast';
import { UnsavedChangesGuard, type UnsavedChangesGuardHandle } from '@/components/unsaved-changes-guard';
import {
  addDay,
  dayFromTemplateForEditing,
  droppedDeviceNotice,
  keepHiddenPhase,
  locateDay,
  mergePhases,
  mergePhasesCheck,
  missingExerciseDays,
  moveDayToPhase,
  nextDayId,
  prepareProgramForEditing,
  programIdSource,
  reconcileRotation,
  replaceDayBlocks,
  savedTemplateOption,
  type ProgramBase,
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
import { PROGRAM_DRAFT_BASE, programDraftKey } from '@/lib/unsaved-changes';
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
 * (seçili güne); Kaydet ("Programı kaydet": evreleri ve günleri de kaydeder) günün "Hareketler"
 * başlığında, yalnız değişiklik varken (`EditorSaveProvider`); telefonda başlık ekran dışındayken
 * dock'un üstünde yüzen kopyası (PT kararı 17). Kaydedilmemiş değişiklik yerel taslakta durur ve
 * sayfadan çıkış sorulur (PT kararı 16).
 */
export function ProgramForm({
  clientId,
  mode,
  initial,
  base,
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
  /** Yüklenen programın sürümü (revision ve oluşturulma anı; kayıtta gönderilir); oluştururken null. */
  base: ProgramBase | null;
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
  const deviceIds = useMemo(() => new Set(devices.map((device) => device.id)), [devices]);

  // Düzenlemede artık olmayan cihaza yazılmış satırlar egzersizin cihazına döner (kaydedince kalıcı).
  const [start] = useState(() => {
    const prepared = prepareProgramForEditing(initial.phases, deviceIds);
    const input: ProgramFormInput = { phased: initial.phased, currentPhaseId: initial.currentPhaseId, phases: toInput(prepared.phases) };
    return {
      input,
      dropped: prepared.droppedDeviceRowIds,
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
  // Cihazı silinmiş satırlar (açılışta, şablondan gelen günde, geri yüklenen taslakta) egzersizin cihazına
  // döner. Uyarı bugünkü hâle bakar (`droppedDeviceNotice`): kaldırılan satır ya da PT'nin cihaz seçtiği satır düşer.
  const [droppedRowIds, setDroppedRowIds] = useState<ReadonlySet<string>>(() => new Set(start.dropped));
  const noteDropped = useCallback((rowIds: readonly string[]) => {
    if (rowIds.length > 0) setDroppedRowIds((previous) => new Set([...previous, ...rowIds]));
  }, []);

  const [templateList, setTemplateList] = useState(templates);
  const [startChoice, setStartChoice] = useState(NO_TEMPLATE);
  const [announcement, setAnnouncement] = useState('');
  const [stale, setStale] = useState(false);
  const [addDayPhaseId, setAddDayPhaseId] = useState<string | null>(null);
  const [saveBlocks, setSaveBlocks] = useState<TemplateBlock[] | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const guard = useRef<UnsavedChangesGuardHandle>(null);
  // Taslak da açılıştaki adımdan geçer (saf): taslaktan sonra silinen cihaz egzersizinkine döner. Açılışta
  // taslağın farkı bu hâliyle ölçülür (tek farkı silinmiş cihaz olan taslak sunulmaz), devam edilince forma bu yazılır.
  const prepareDraft = useCallback(
    (input: ProgramFormInput): ProgramFormInput => ({
      ...input,
      phases: toInput(prepareProgramForEditing(input.phases as unknown as ProgramPhase[], deviceIds).phases),
    }),
    [deviceIds],
  );
  // Oluşturma ve düzenleme aynı taslağı paylaşır; sürüm düzenlemede revision ve oluşturulma anı, oluştururken null.
  const draft = useEditorDraft({
    form,
    schema: programFormSchema,
    storageKey: programDraftKey(clientId),
    base,
    baseSchema: PROGRAM_DRAFT_BASE,
    prepare: prepareDraft,
  });
  // Devam edilen taslakta cihazı düşen satırlar da uyarıda sayılır ("Geri al" ile vazgeçilince düşer).
  const noted = useMemo(() => {
    const restored = draft.restored
      ? prepareProgramForEditing(draft.restored.phases as unknown as ProgramPhase[], deviceIds).droppedDeviceRowIds
      : [];
    return restored.length > 0 ? new Set([...droppedRowIds, ...restored]) : droppedRowIds;
  }, [draft.restored, droppedRowIds, deviceIds]);

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
  // Evresiz program evresiz kalırsa gizli evre kayıttakidir (sunucu da öyle kaydeder): evreler açılıp kapansa da rotasyon sürer.
  const kept = keepHiddenPhase(initial, { phased, currentPhaseId, phases });
  const rotation =
    stored && kept.currentPhaseId === stored.current.phaseId ? reconcileRotation(initial.phases, kept.phases, stored.rotation) : {};
  const next = nextDayId({ phases: kept.phases, current: { phaseId: kept.currentPhaseId, startedAt: '' }, rotation });
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
   * sonra başka değişiklik yoksa geçerli; yoksa sonraki düzenlemeler silinirdi. Cümleyi toast'un
   * canlı bölgesi okur; formun `aria-live` paragrafı yazmaz (tek canlı bölge).
   */
  const offerUndo = useCallback(
    (before: Snapshot, message: string) => {
      const after = JSON.stringify(snapshot());
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
      // Şablondan gün (silinmiş cihaz egzersizinkine döner, düşen satır uyarıda sayılır): bloklar ve kaynak bu güne.
      const filled = dayFromTemplateForEditing({ days: [] }, template, programIdSource(before), new Date(), deviceIds);
      noteDropped(filled.droppedDeviceRowIds);
      updateWithUndo(
        (phasesNow) => replaceDayBlocks(phasesNow, dayId, filled.day.blocks, filled.day.source),
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
    // Şablonun silinmiş cihaza yazılmış satırları açılıştaki gibi egzersizin cihazına döner (uyarıda sayılır).
    const { day, droppedDeviceRowIds } = dayFromTemplateForEditing(phase, template, programIdSource(before), new Date(), deviceIds);
    noteDropped(droppedDeviceRowIds);
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
      fetchJson<{ revision: number; unchanged?: true; droppedDevices?: number }>(`/api/clients/${clientId}/program`, {
        method: 'PUT',
        // Sürüm çift olarak gider: silinip yeniden oluşturulan program (revision yine 1) da 412 verir.
        body: JSON.stringify({
          ...values,
          baseRevision: draft.saveBase?.revision ?? null,
          baseCreatedAt: draft.saveBase?.createdAt,
        }),
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
      draft.discard();
      toast.success(
        result.unchanged ? 'Değişiklik yoktu; program aynı kaldı.' : mode === 'create' ? 'Program oluşturuldu.' : 'Program kaydedildi.',
        // Eski sekmede seçilip o arada silinen cihaz sunucuda egzersizin cihazına döner: sessiz kalmasın.
        result.droppedDevices
          ? { description: `${result.droppedDevices} satırın cihazı artık yok; egzersizin kendi cihazı kullanıldı.` }
          : undefined,
      );
      router.push(`/dashboard/clients/${clientId}/program`);
      router.refresh();
    },
  });

  // Kaydedilmemiş değişiklik varken sayfadan çıkış sorulur; cihazı silinmiş satırların düzeltmesi
  // de kaydedilmemiş iştir (Kaydet görünür).
  const dirty = form.isDirty || start.dropped.length > 0;
  const guarded = dirty && !save.isPending && !save.isSuccess;
  // "Kaydedince kalıcı olur" yalnız Kaydet görünürken (taslak yüklenen hâle döndüyse söylenmez).
  const droppedNotice = droppedDeviceNotice(phases, noted, dirty);

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

  // Formun uyarıları (başka yerde değişti, gizli hata): günün hareket listesinin hemen altında, Kas yükü'nden önce.
  const formEnd = (
    <>
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
                // Değişiklikler gider (metin öyle söylüyor): taslak da atılır, tarayıcı ayrıca sormaz.
                draft.discard();
                guard.current?.release();
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
    </>
  );

  return (
    <EditorSaveProvider
      value={{
        dirty,
        pending: save.isPending || save.isSuccess,
        creating: mode === 'create',
        submitLabel: mode === 'create' ? 'Programı oluştur' : 'Programı kaydet',
      }}>
      <Form of={form} className="flex flex-col gap-6" onSubmit={submit}>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {draft.offer ? <DraftNotice offer={draft.offer} timeZone={timeZone} onRestore={draft.restore} onDismiss={draft.dismiss} /> : null}

        {droppedNotice ? (
          <Alert>
            <WarningCircle />
            <AlertDescription>{droppedNotice}</AlertDescription>
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
            key={`${selectedDay.id}.${draft.generation}`}
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
            footer={formEnd}
          />
        ) : (
          <>
            {formEnd}
            {/* Gün yoksa hareket düzenleyicisi de yok: Kaydet burada. */}
            <div className="flex justify-end">
              <SaveButton />
            </div>
          </>
        )}

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
          // Sunucu şablonu şablon kurallarıyla yazar (egzersizinkine eşit kural ve cihaz düşer): yerel kopya da öyle.
          onCreated={(template) =>
            setTemplateList((list) => [...list, savedTemplateOption(template, { exercises: exerciseById, deviceIds })])
          }
        />

        <FloatingSaveButton />
      </Form>
      <DraftAutosave form={form} onChange={draft.sync} />
      <UnsavedChangesGuard
        ref={guard}
        active={guarded}
        description="Çıkarsan bu değişiklikler kaydedilmez; danışan göremez."
        onLeave={draft.leave}
      />
    </EditorSaveProvider>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getDeepError, getInput, setErrors, setInput, useField, useFieldArray, useForm } from '@formisch/react';
import { ArrowClockwise, ArrowSquareOut, Plus, WarningCircle } from '@phosphor-icons/react';
import { Reorder } from 'motion/react';
import { toast } from 'sonner';
import { TemplateMuscleMap } from '@/components/muscle-map/template-muscle-map';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber } from '@/lib/format';
import { exerciseSetWeights } from '@/lib/muscles';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { templateFormSchema, type Template, type TemplateFormValues, type TemplateInput } from '@/lib/schemas/template';
import {
  appendExercise,
  canAdd,
  idSource,
  prepareForEditing,
  reorderBlocks,
  replaceExercise,
  type EditorDevice,
  type PickerExercise,
} from '@/lib/template-edit';
import { rowLabels, templateMuscleLoad, templateSummary, type TemplateBlock } from '@/lib/template-plan';
import { ExercisePicker, type ReplaceTarget } from './exercise-picker';
import { BlockItem, EditorContext, rowTitle, type Editor } from './template-blocks';

const BLANK: TemplateInput = { name: '', description: '', blocks: [] };

const LOAD_DESCRIPTION =
  'Kas başına çalışma seti: hedef 1, yardımcı 0,5, dengeleyici 0,25 sayılır; ısınma ve soğuma hareketleri sayılmaz.';

/** Tailwind `lg` kırılımı: kütüphane yanda mı (masaüstü) yoksa listenin altında mı (telefon). */
function isWide(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches;
}

function focusLibrary(scroll: boolean) {
  if (scroll) document.getElementById('kutuphane')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('kutuphane-ara')?.focus({ preventScroll: scroll });
}

/**
 * Şablon düzenleyici — kendi sayfasında (modal değil, SPEC §6).
 *
 * Tek Formisch formu: yaprak alanlar (set, dinlenme, hedef, kural, cihaz, not) alan
 * olarak bağlanır; yapısal işlemler (ekleme, sıralama, gruplama…) `template-edit.ts`'teki
 * saf fonksiyonlarla hesaplanıp `blocks` dizisine tek seferde yazılır. Listelerin
 * anahtarları blok ve satır kimlikleridir; sürükle-bırak yalnız sıralama içindir, ekleme
 * kütüphaneden dokunarak yapılır.
 */
export function TemplateForm({
  editing,
  exercises,
  devices,
}: {
  editing: { template: Template; sha: string } | null;
  exercises: PickerExercise[];
  devices: EditorDevice[];
}) {
  const router = useRouter();
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const deviceById = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices]);

  // Düzenlemede artık olmayan cihaza yazılmış satırlar egzersizin cihazına döner (kaydedince kalıcı).
  const [start] = useState(() => {
    if (!editing) return { input: BLANK, dropped: 0 };
    const prepared = prepareForEditing(editing.template, new Set(devices.map((device) => device.id)));
    const input: TemplateInput = {
      name: editing.template.name,
      description: editing.template.description,
      blocks: prepared.blocks.map((block) => ({ ...block, rows: block.rows.map((row) => ({ ...row, note: row.note ?? '' })) })),
    };
    return { input, dropped: prepared.droppedDeviceRowIds.length };
  });
  const form = useForm({ schema: templateFormSchema, initialInput: start.input });
  const blocksField = useField(form, { path: ['blocks'] });
  const blocksArray = useFieldArray(form, { path: ['blocks'] });
  const blocks = (blocksField.input ?? []) as unknown as TemplateBlock[];

  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  /** Formdaki güncel bloklar (olay anında; sürüklemede ardışık çağrılar birbirini ezmesin). */
  const current = useCallback(() => (getInput(form, { path: ['blocks'] }) ?? []) as unknown as TemplateBlock[], [form]);

  const write = useCallback(
    (next: TemplateBlock[]) => setInput(form, { path: ['blocks'], input: next as TemplateInput['blocks'] }),
    [form],
  );

  const update = useCallback<Editor['update']>(
    (change, options) => {
      const before = current();
      const next = change(before);
      if (next === before) return;
      write(next);
      if (options?.highlight) setHighlight(options.highlight);
      if (options?.announce) setAnnouncement(options.announce);
    },
    [current, write],
  );

  const undoToast = useRef<string | number | null>(null);

  const updateWithUndo = useCallback<Editor['updateWithUndo']>(
    (change, message) => {
      const before = current();
      const next = change(before);
      if (next === before) return;
      write(next);
      // Geri al yalnız bu işlemden sonra başka değişiklik yoksa geçerli; yoksa sonraki düzenlemeler silinirdi.
      const after = JSON.stringify(current());
      setAnnouncement(message);
      if (undoToast.current !== null) toast.dismiss(undoToast.current);
      undoToast.current = toast(message, {
        action: {
          label: 'Geri al',
          onClick: () => {
            if (JSON.stringify(current()) !== after) {
              toast.error('Sonrasında başka değişiklik yapıldı; geri alınamadı.');
              return;
            }
            write(before);
          },
        },
        duration: 8000,
      });
    },
    [current, write],
  );

  const startReplace = useCallback((rowId: string) => {
    setReplacingId(rowId);
    // Telefonda kütüphane listenin altında: oraya kaydır; masaüstünde yanda duruyor.
    requestAnimationFrame(() => focusLibrary(!isWide()));
  }, []);

  const toggleExpanded = useCallback(
    (rowId: string) =>
      setExpanded((open) => {
        const next = new Set(open);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      }),
    [],
  );

  const labels = useMemo(() => rowLabels({ blocks }), [blocks]);
  const summary = useMemo(() => templateSummary({ blocks }, exerciseById), [blocks, exerciseById]);
  const load = useMemo(() => templateMuscleLoad({ blocks }, exerciseById, exerciseSetWeights).load, [blocks, exerciseById]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of blocks.flatMap((block) => block.rows)) counts.set(row.exerciseId, (counts.get(row.exerciseId) ?? 0) + 1);
    return counts;
  }, [blocks]);

  const replacingRow = replacingId ? blocks.flatMap((block) => block.rows).find((row) => row.id === replacingId) : undefined;
  const replacing: ReplaceTarget | null = replacingRow
    ? {
        rowId: replacingRow.id,
        label: labels.get(replacingRow.id) ?? '',
        title: rowTitle(replacingRow, exerciseById),
        exerciseId: replacingRow.exerciseId,
      }
    : null;

  const pick = (exercise: PickerExercise) => {
    if (replacing) {
      const rowId = replacing.rowId;
      update((before) => replaceExercise(before, rowId, exercise, exerciseById.get(replacing.exerciseId)), {
        highlight: rowId,
        announce: `${replacing.label} · ${exercise.title} seçildi`,
      });
      setReplacingId(null);
      return;
    }
    const before = current();
    const next = appendExercise(before, exercise, idSource(before));
    const rowId = next.at(-1)?.rows[0]?.id;
    if (next.length === before.length || !rowId) return;
    update(() => next, { highlight: rowId, announce: `${exercise.title} eklendi (${next.length}. sıra)` });
    if (isWide()) {
      requestAnimationFrame(() => document.getElementById(`row-${rowId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    } else {
      toast.success(`${exercise.title} eklendi`, { duration: 1500 });
    }
  };

  const save = useServiceMutation({
    fn: (values: TemplateFormValues) =>
      fetchJson<{ id: string; sha: string }>('/api/templates', {
        method: 'POST',
        body: JSON.stringify({ ...values, ...(editing ? { id: editing.template.id, baseSha: editing.sha } : {}) }),
      }),
    invalidate: [['templates']],
    notify: { success: editing ? 'Şablon güncellendi.' : 'Şablon eklendi.' },
    onError: (error) => {
      if (error.status === 412) setStale(true);
      else applyFieldErrors(form as never, error);
    },
    onSuccess: ({ id }) => {
      router.push(`/dashboard/templates/${id}`);
      router.refresh();
    },
  });

  // Kaydedilmemiş değişiklik varken sekme kapanmasın.
  const dirty = form.isDirty;
  const guarded = dirty && !save.isPending && !save.isSuccess;
  useEffect(() => {
    if (!guarded) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [guarded]);

  const submit = (values: TemplateFormValues) => {
    // Kütüphanede olmayan egzersiz kaydedilmez: satırın altında söylenir.
    let missing = false;
    values.blocks.forEach((block, blockIndex) =>
      block.rows.forEach((row, rowIndex) => {
        if (exerciseById.has(row.exerciseId)) return;
        missing = true;
        setErrors(form, {
          path: ['blocks', blockIndex, 'rows', rowIndex, 'exerciseId'],
          errors: ['Bu egzersiz kütüphanede yok; değiştir ya da kaldır.'],
        });
      }),
    );
    if (missing) return;
    return save.mutateAsync(values).then(
      () => undefined,
      () => undefined,
    );
  };

  const editor: Editor = {
    form,
    blocks,
    update,
    updateWithUndo,
    exercises: exerciseById,
    exerciseList: exercises,
    devices: deviceById,
    deviceList: devices,
    labels,
    expanded,
    toggleExpanded,
    highlight,
    startReplace,
  };

  const hiddenError = getDeepError(form);
  const detailHref = editing ? `/dashboard/templates/${editing.template.id}` : '/dashboard/templates';

  return (
    <EditorContext.Provider value={editor}>
      <Form of={form} className="flex flex-col gap-6" onSubmit={submit}>
        <p id="sira-ipucu" className="sr-only">
          Sürükle ya da yukarı/aşağı ok tuşlarıyla taşı
        </p>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Şablon</CardTitle>
            <CardDescription>Adı ve kısa amacı; danışan antrenman ekranında görür.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <FormField of={form} path={['name']}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="name">Şablon adı</FieldLabel>
                  <Input
                    {...field.props}
                    id="name"
                    className="max-w-sm"
                    value={field.input ?? ''}
                    placeholder="Ör. Alt vücut A"
                    aria-invalid={Boolean(field.errors) || undefined}
                  />
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>
            <FormField of={form} path={['description']}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="description">Açıklama</FieldLabel>
                  <Textarea {...field.props} id="description" rows={2} value={field.input ?? ''} placeholder="Ör. Güç odaklı, haftada iki kez" />
                  <FieldDescription>
                    Danışana özel bilgi yazma: şablonlar uygulama repo&apos;sunda durur ve birden çok danışana atanır.
                  </FieldDescription>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <Card className="overflow-visible">
            <CardHeader>
              <CardTitle>Hareketler</CardTitle>
              <CardDescription>Sürükleyerek sırala; arka arkaya yapılacakları grupla (süperset, devre, kompleks).</CardDescription>
              {blocks.length > 0 ? (
                <CardAction className="text-sm tabular-nums text-muted-foreground">
                  {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈ {formatNumber(summary.minutes)} dk
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {start.dropped > 0 ? (
                <Alert>
                  <WarningCircle />
                  <AlertDescription>
                    {start.dropped} satırın cihazı silinmiş; egzersizin kendi cihazına döndü. Kaydedince kalıcı olur.
                  </AlertDescription>
                </Alert>
              ) : null}

              {blocks.length > 0 ? (
                <Reorder.Group
                  as="ol"
                  axis="y"
                  values={blocks.map((block) => block.id)}
                  onReorder={(ids: string[]) => update((before) => reorderBlocks(before, ids))}
                  className="flex flex-col gap-3"
                  aria-label="Şablondaki hareketler">
                  {blocks.map((block, blockIndex) => (
                    <BlockItem key={block.id} block={block} blockIndex={blockIndex} />
                  ))}
                </Reorder.Group>
              ) : (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>Henüz hareket yok</EmptyTitle>
                    <EmptyDescription>
                      <span className="hidden lg:inline">Sağdaki kütüphaneden ekle.</span>
                      <span className="lg:hidden">Aşağıdaki kütüphaneden ekle.</span>
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              <FieldError>{blocksArray.errors?.[0]}</FieldError>
            </CardContent>
            <CardFooter className="lg:hidden">
              <Button type="button" variant="outline" onClick={() => focusLibrary(true)}>
                <Plus data-icon="inline-start" />
                Hareket ekle
              </Button>
            </CardFooter>
          </Card>

          <Card id="kutuphane" className="scroll-mt-4 lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Kütüphane</CardTitle>
              <CardDescription>Ada ya da kasa göre ara; dokununca şablonun sonuna eklenir.</CardDescription>
            </CardHeader>
            <CardContent>
              <ExercisePicker
                exercises={exercises}
                devices={deviceById}
                usage={usage}
                replacing={replacing}
                disabled={!canAdd(blocks)}
                onPick={pick}
                onCancelReplace={() => setReplacingId(null)}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Kas yükü</CardTitle>
            <CardDescription>{LOAD_DESCRIPTION}</CardDescription>
          </CardHeader>
          <CardContent>
            {blocks.length > 0 ? (
              <TemplateMuscleMap variant="full" bodyClassName="h-56 lg:h-64" load={load} />
            ) : (
              <p className="text-sm text-muted-foreground">Hareket ekleyince kas yükü burada görünür.</p>
            )}
          </CardContent>
        </Card>

        {stale ? (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertTitle>Bu şablon başka bir yerde değişti</AlertTitle>
            <AlertDescription>
              Sen düzenlerken şablon başka bir sekmede ya da cihazda kaydedildi. Değişikliklerin burada duruyor; yeni sürümü
              ayrı sekmede açıp karşılaştırabilir ya da sayfayı yenileyip (değişikliklerin gider) baştan düzenleyebilirsin.
            </AlertDescription>
            <div className="col-start-2 mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={detailHref} target="_blank" rel="noopener" />}>
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

        {hiddenError ? (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertTitle>Form gönderilemedi</AlertTitle>
            <AlertDescription>{hiddenError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" nativeButton={false} render={<Link href={detailHref} />}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </Form>
    </EditorContext.Provider>
  );
}

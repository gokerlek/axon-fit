'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getDeepError, setInput, useForm } from '@formisch/react';
import { WarningCircle } from '@phosphor-icons/react';
import { LabeledSelect } from '@/components/labeled-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DEVICE_KIND_LABELS,
  deviceLoads,
  PULLEY_RATIOS,
  type DeviceKind,
  type DeviceLoadSettings,
  type PulleyRatio,
} from '@/lib/device-loads';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import {
  ADD_ON_OPTIONS,
  deviceFormSchema,
  needsBase,
  needsMax,
  needsStep,
  needsWeights,
  takesAddOns,
  type Device,
  type DeviceInput,
} from '@/lib/schemas/device';

/** Tür seçilince gelen başlangıç ayarları (yaygın değerler; PT değiştirir). */
const KIND_DEFAULTS: Record<DeviceKind, Partial<DeviceInput>> = {
  selectorized: { baseKg: 5, stepKg: 5, maxKg: 100, addOnsKg: [2.5] },
  cable: { baseKg: 5, stepKg: 5, maxKg: 100, addOnsKg: [2.5], pulleyRatio: 1 },
  plate_loaded: { baseKg: 20, stepKg: 5 },
  barbell: { baseKg: 20, stepKg: 2.5 },
  dumbbell: { weightsKg: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
  kettlebell: { weightsKg: [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32] },
  bodyweight: {},
  band: {},
  cardio: {},
};

/** Alan adları türe göre: blokta "ilk blok", plaka yüklemelide "kızak", barda "bar". */
const BASE_LABELS: Partial<Record<DeviceKind, string>> = {
  selectorized: 'İlk blok (kg)',
  cable: 'İlk blok (kg)',
  plate_loaded: 'Kızak ağırlığı (kg)',
  barbell: 'Bar ağırlığı (kg)',
};

const PULLEY_HELP: Record<PulleyRatio, string> = {
  1: 'Tek makara: seçilen ağırlık neyse kolda o hissedilir.',
  2: 'Çift makara: blok yarı yol gider, kolda seçilenin yarısı hissedilir (20 kg → 10 kg).',
  3: '3:1: kolda seçilenin üçte biri hissedilir.',
  4: '4:1: kolda seçilenin dörtte biri hissedilir.',
};

const kgText = (value: number) => value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** "2 4 6 12,5" → [2, 4, 6, 12.5]; ondalıkta virgül ya da nokta. */
function parseWeights(text: string): number[] {
  return text
    .split(/[\s;]+/)
    .map((part) => Number(part.replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0);
}

type FormStart = Partial<DeviceInput> & Pick<DeviceInput, 'name' | 'kind'>;

const BLANK: FormStart = { name: '', kind: 'selectorized', ...KIND_DEFAULTS.selectorized };

/** Sayı alanı: Formisch değeri metin verir, şema sayı bekler. */
function NumberField({
  form,
  path,
  label,
  description,
}: {
  form: ReturnType<typeof useForm<typeof deviceFormSchema>>;
  path: 'baseKg' | 'stepKg' | 'maxKg';
  label: string;
  description?: string;
}) {
  return (
    <FormField of={form} path={[path]}>
      {(field) => (
        <Field data-invalid={Boolean(field.errors) || undefined}>
          <FieldLabel htmlFor={path}>{label}</FieldLabel>
          <Input
            {...field.props}
            id={path}
            type="number"
            step="0.25"
            min="0"
            className="tabular-nums"
            value={field.input ?? ''}
            onChange={(event) =>
              setInput(form, {
                path: [path],
                input: event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber,
              })
            }
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{field.errors?.[0]}</FieldError>
        </Field>
      )}
    </FormField>
  );
}

/**
 * Cihaz ekleme/düzenleme formu — kendi sayfasında (modal değil). Alanlar türe göre
 * değişir; altta cihazda ayarlanabilen ağırlıkların canlı önizlemesi var.
 */
export function DeviceForm({ editing }: { editing: Device | null }) {
  const router = useRouter();
  const start: FormStart = editing ? (({ id: _id, ...rest }) => rest)(editing) : BLANK;
  const form = useForm({ schema: deviceFormSchema, initialInput: start });
  const [weightsText, setWeightsText] = useState((start.weightsKg ?? []).map(kgText).join(' '));

  const save = useServiceMutation({
    fn: (values: DeviceInput) =>
      fetchJson<{ id: string }>('/api/devices', {
        method: 'POST',
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      }),
    invalidate: [['devices'], ['exercises']],
    notify: { success: editing ? 'Cihaz güncellendi.' : 'Cihaz eklendi.' },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: ({ id }) => {
      router.push(`/dashboard/devices/${id}`);
      router.refresh();
    },
  });

  const hiddenError = getDeepError(form);

  return (
    <Form of={form} className="grid gap-x-8 gap-y-6 lg:grid-cols-2" onSubmit={(values) => save.mutateAsync(values as DeviceInput).catch(() => undefined)}>
      <div className="flex flex-col gap-5">
        <FormField of={form} path={['name']}>
          {(field) => (
            <Field data-invalid={Boolean(field.errors) || undefined}>
              <FieldLabel htmlFor="name">Cihaz adı</FieldLabel>
              <Input {...field.props} id="name" value={field.input ?? ''} placeholder="Ör. Technogym chest press" />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>

        <FormField of={form} path={['kind']}>
          {(field) => (
            <Field>
              <FieldLabel htmlFor="kind">Tür</FieldLabel>
              <LabeledSelect
                id="kind"
                value={field.input}
                labels={DEVICE_KIND_LABELS}
                onChange={(kind) => {
                  setInput(form, { path: ['kind'], input: kind });
                  // Yeni türün yaygın ayarları gelsin; PT sonra değiştirir.
                  const defaults = KIND_DEFAULTS[kind];
                  setInput(form, { path: ['baseKg'], input: defaults.baseKg });
                  setInput(form, { path: ['stepKg'], input: defaults.stepKg });
                  setInput(form, { path: ['maxKg'], input: defaults.maxKg });
                  setInput(form, { path: ['addOnsKg'], input: defaults.addOnsKg ? [...defaults.addOnsKg] : undefined });
                  setInput(form, { path: ['pulleyRatio'], input: defaults.pulleyRatio });
                  setInput(form, { path: ['weightsKg'], input: defaults.weightsKg ? [...defaults.weightsKg] : undefined });
                  setWeightsText((defaults.weightsKg ?? []).map(kgText).join(' '));
                }}
              />
            </Field>
          )}
        </FormField>

        <FormField of={form} path={['notes']}>
          {(field) => (
            <Field>
              <FieldLabel htmlFor="notes">Not</FieldLabel>
              <Textarea {...field.props} id="notes" rows={2} value={field.input ?? ''} placeholder="Ör. pim ağırlığı eklenebilir" />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>
      </div>

      <FormField of={form} path={['kind']}>
        {(kindField) => {
          const kind = kindField.input ?? 'selectorized';
          const hasLoads = needsBase(kind) || needsWeights(kind);
          return (
            <FieldSet>
              <FieldLegend>Ağırlık ayarı</FieldLegend>
              {!hasLoads ? (
                <FieldDescription>
                  Bu türde ağırlık ayarı yok; ilerleme tekrar ya da süreyle olur.
                </FieldDescription>
              ) : null}

              {needsBase(kind) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField form={form} path="baseKg" label={BASE_LABELS[kind] ?? 'Başlangıç (kg)'} />
                  {needsStep(kind) ? (
                    <NumberField
                      form={form}
                      path="stepKg"
                      label={kind === 'selectorized' || kind === 'cable' ? 'Blok adımı (kg)' : 'En küçük artış (kg)'}
                      description={kind === 'barbell' || kind === 'plate_loaded' ? 'İki yana birer en küçük plaka: 1,25 kg ise 2,5.' : undefined}
                    />
                  ) : null}
                  {needsMax(kind) || kind === 'plate_loaded' ? (
                    <NumberField
                      form={form}
                      path="maxKg"
                      label={kind === 'plate_loaded' ? 'En çok (kg, isteğe bağlı)' : 'En ağır blok (kg)'}
                    />
                  ) : null}
                </div>
              ) : null}

              {takesAddOns(kind) ? (
                <FormField of={form} path={['addOnsKg']}>
                  {(field) => (
                    <Field>
                      <FieldLabel>Ara ağırlıklar</FieldLabel>
                      <ToggleGroup
                        multiple
                        variant="outline"
                        size="sm"
                        className="flex-wrap justify-start"
                        aria-label="Ara ağırlıklar"
                        value={(field.input ?? []).map(String)}
                        onValueChange={(value) =>
                          setInput(form, { path: ['addOnsKg'], input: (value as string[]).map(Number).sort((a, b) => a - b) })
                        }>
                        {ADD_ON_OPTIONS.map((option) => (
                          <ToggleGroupItem key={option} value={String(option)} className="tabular-nums">
                            +{kgText(option)} kg
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <FieldDescription>
                        Bloğa takılan küçük ağırlıklar. Birlikte de takılabilir; öneriler ara değerleri de kullanır.
                      </FieldDescription>
                      <FieldError>{field.errors?.[0]}</FieldError>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {kind === 'cable' ? (
                <FormField of={form} path={['pulleyRatio']}>
                  {(field) => (
                    <Field>
                      <FieldLabel>Makara</FieldLabel>
                      <ToggleGroup
                        variant="outline"
                        size="sm"
                        spacing={0}
                        aria-label="Makara oranı"
                        value={[String(field.input ?? 1)]}
                        onValueChange={(value) => {
                          const next = Number(value[0]) as PulleyRatio;
                          if (next) setInput(form, { path: ['pulleyRatio'], input: next });
                        }}>
                        {PULLEY_RATIOS.map((ratio) => (
                          <ToggleGroupItem key={ratio} value={String(ratio)} className="px-3 tabular-nums">
                            {ratio === 1 ? 'Tek (1:1)' : ratio === 2 ? 'Çift (2:1)' : `${ratio}:1`}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <FieldDescription>{PULLEY_HELP[(field.input ?? 1) as PulleyRatio]}</FieldDescription>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {needsWeights(kind) ? (
                <FormField of={form} path={['weightsKg']}>
                  {(field) => (
                    <Field data-invalid={Boolean(field.errors) || undefined}>
                      <FieldLabel htmlFor="weightsKg">Setteki ağırlıklar (kg)</FieldLabel>
                      <Textarea
                        id="weightsKg"
                        rows={2}
                        className="tabular-nums"
                        value={weightsText}
                        onChange={(event) => {
                          setWeightsText(event.currentTarget.value);
                          setInput(form, { path: ['weightsKg'], input: parseWeights(event.currentTarget.value) });
                        }}
                        placeholder="2 4 6 8 10 12,5"
                      />
                      <FieldDescription>Boşlukla ayır; ondalık için virgül. Sette olmayan ağırlık önerilmez.</FieldDescription>
                      <FieldError>{field.errors?.[0]}</FieldError>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {hasLoads ? <LoadsPreview form={form} kind={kind} /> : null}
            </FieldSet>
          );
        }}
      </FormField>

      {hiddenError ? (
        <Alert variant="destructive" className="lg:col-span-2">
          <WarningCircle />
          <AlertTitle>Form gönderilemedi</AlertTitle>
          <AlertDescription>{hiddenError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4 lg:col-span-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={editing ? `/dashboard/devices/${editing.id}` : '/dashboard/devices'} />}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
    </Form>
  );
}

/** Cihazda ayarlanabilen ağırlıkların canlı önizlemesi (öneriler bunlardan seçilir). */
function LoadsPreview({ form, kind }: { form: ReturnType<typeof useForm<typeof deviceFormSchema>>; kind: DeviceKind }) {
  return (
    <FormField of={form} path={['baseKg']}>
      {(base) => (
        <FormField of={form} path={['stepKg']}>
          {(step) => (
            <FormField of={form} path={['maxKg']}>
              {(max) => (
                <FormField of={form} path={['addOnsKg']}>
                  {(addOns) => (
                    <FormField of={form} path={['weightsKg']}>
                      {(weights) => {
                        const settings: DeviceLoadSettings = {
                          kind,
                          baseKg: base.input ?? undefined,
                          stepKg: step.input ?? undefined,
                          maxKg: max.input ?? undefined,
                          addOnsKg: (addOns.input ?? []).filter((value): value is number => typeof value === 'number'),
                          weightsKg: (weights.input ?? []).filter((value): value is number => typeof value === 'number'),
                        };
                        const loads = deviceLoads(settings);
                        const shown = loads?.slice(0, 24) ?? [];
                        return (
                          <Field>
                            <FieldLabel>Ayarlanabilen ağırlıklar</FieldLabel>
                            {loads?.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {shown.map((load) => (
                                  <Badge key={load} variant="secondary" className="tabular-nums">
                                    {kgText(load)}
                                  </Badge>
                                ))}
                                {loads.length > shown.length ? (
                                  <Badge variant="outline" className="tabular-nums">
                                    +{loads.length - shown.length} ağırlık daha
                                  </Badge>
                                ) : null}
                              </div>
                            ) : (
                              <FieldDescription>Ayarları doldurunca burada görünür.</FieldDescription>
                            )}
                          </Field>
                        );
                      }}
                    </FormField>
                  )}
                </FormField>
              )}
            </FormField>
          )}
        </FormField>
      )}
    </FormField>
  );
}

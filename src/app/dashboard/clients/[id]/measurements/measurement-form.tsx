'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getDeepError, setInput, useForm } from '@formisch/react';
import { WarningCircle } from '@phosphor-icons/react';
import { LabeledSelect } from '@/components/labeled-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { formatDay } from '@/lib/format';
import { isSided, SIDE_LABELS, SIDES, slotKey, valuesFromSlots, type MeasurementValue } from '@/lib/measurement-log';
import { MEASUREMENT_IDS, MEASUREMENTS, type MeasurementDef, type MeasurementId } from '@/lib/measurements';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { measurementFormSchema, SEX_LABELS, SEX_UNKNOWN, type SexChoice } from '@/lib/schemas/measurement';
import { GROUP_INFO, UNIT_LABELS } from './measurement-text';

type FormStore = ReturnType<typeof useForm<typeof measurementFormSchema>>;

export type MeasurementFormMode =
  /** Yeni: gün seçilir (bugün varsayılan); ölçülmüş günler uyarı için. */
  | { kind: 'new'; today: string; measuredDates: string[] }
  /** Düzenleme: gün adresten gelir, değişmez. */
  | { kind: 'edit'; date: string };

const GROUPS = Object.keys(GROUP_INFO) as MeasurementDef['group'][];

/** Alan açıklaması: önerilen mi, ne sıklıkla, katalogdaki not. */
function describe(def: MeasurementDef): string {
  const tier = def.tier === 'recommended' ? 'Önerilen' : 'İsteğe bağlı';
  return [`${tier} · ${def.frequency}.`, def.note].filter(Boolean).join(' ');
}

const inputId = (key: string) => `m-${key.replace(':', '-')}`;

/** Birimli sayı alanı; boş bırakılan alan kayda girmez. */
function ValueInput({
  form,
  slot,
  id,
  unit,
  label,
  onEdit,
}: {
  form: FormStore;
  slot: string;
  id: string;
  unit: string;
  label?: string;
  onEdit: () => void;
}) {
  return (
    <FormField of={form} path={['values', slot]}>
      {(field) => (
        <Field data-invalid={Boolean(field.errors) || undefined}>
          {label ? (
            <FieldLabel htmlFor={id} className="text-xs font-normal text-muted-foreground">
              {label}
            </FieldLabel>
          ) : null}
          <InputGroup>
            <InputGroupInput
              {...field.props}
              id={id}
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              className="tabular-nums"
              value={field.input ?? ''}
              aria-invalid={Boolean(field.errors) || undefined}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                onEdit();
                setInput(form, {
                  path: ['values', slot],
                  input: event.currentTarget.value === '' || Number.isNaN(value) ? undefined : value,
                });
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{unit}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <FieldError>{field.errors?.[0]}</FieldError>
        </Field>
      )}
    </FormField>
  );
}

function MeasurementField({ form, id, onEdit }: { form: FormStore; id: MeasurementId; onEdit: () => void }) {
  const def = MEASUREMENTS[id];
  const unit = UNIT_LABELS[def.unit];
  if (isSided(id)) {
    return (
      <FieldSet className="gap-2">
        <FieldLegend variant="label" className="mb-0">
          {def.label}
        </FieldLegend>
        <div className="grid grid-cols-2 gap-2">
          {SIDES.map((side) => (
            <ValueInput
              key={side}
              form={form}
              slot={slotKey(id, side)}
              id={inputId(slotKey(id, side))}
              unit={unit}
              label={SIDE_LABELS[side]}
              onEdit={onEdit}
            />
          ))}
        </div>
        <FieldDescription>{describe(def)}</FieldDescription>
      </FieldSet>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={inputId(id)}>{def.label}</FieldLabel>
      <ValueInput form={form} slot={id} id={inputId(id)} unit={unit} onEdit={onEdit} />
      <FieldDescription>{describe(def)}</FieldDescription>
    </div>
  );
}

/**
 * Ölçüm girişi ve bir günün düzenlenmesi — bölüm kartları (SPEC §6): gün (ve bilinmiyorsa
 * cinsiyet), sonra katalog gruplarına göre alanlar. Yalnız doldurulan değerler kaydedilir;
 * düzenlemede boşaltılan alan o günden çıkar.
 */
export function MeasurementForm({
  clientId,
  mode,
  initialValues,
  askSex,
}: {
  clientId: string;
  mode: MeasurementFormMode;
  initialValues: Record<string, number>;
  /** Kayıtta cinsiyet yoksa sorulur (bel-kalça oranı ve dayanıklılık başvuruları için). */
  askSex: boolean;
}) {
  const router = useRouter();
  const base = `/dashboard/clients/${clientId}/measurements`;
  const form = useForm({
    schema: measurementFormSchema,
    initialInput: {
      date: mode.kind === 'new' ? mode.today : mode.date,
      sex: SEX_UNKNOWN,
      values: initialValues,
    },
  });
  const [emptyError, setEmptyError] = useState<string | null>(null);
  // "En az bir ölçüm gir" uyarısı bir değer yazılınca kalkar.
  const clearEmptyError = () => setEmptyError(null);

  const save = useServiceMutation({
    fn: ({ date, sex, values }: { date: string; sex: SexChoice; values: MeasurementValue[] }) => {
      const body = { ...(sex === SEX_UNKNOWN ? {} : { sex }), values };
      return mode.kind === 'new'
        ? fetchJson<{ ok: true }>(`/api/clients/${clientId}/measurements`, { method: 'POST', body: JSON.stringify({ ...body, date }) })
        : fetchJson<{ ok: true }>(`/api/clients/${clientId}/measurements/${mode.date}`, { method: 'PUT', body: JSON.stringify(body) });
    },
    notify: { success: mode.kind === 'new' ? 'Ölçüm kaydedildi.' : 'Ölçüm güncellendi.' },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: () => {
      router.push(base);
      router.refresh();
    },
  });

  const hiddenError = getDeepError(form);

  return (
    <Form
      of={form}
      className="flex flex-col gap-6"
      onSubmit={(output) => {
        const values = valuesFromSlots(output.values);
        if (values.length === 0) {
          setEmptyError(
            mode.kind === 'new'
              ? 'En az bir ölçüm gir; boş alanlar kaydedilmez.'
              : 'Bütün değerleri boşalttın. Bu günü tamamen kaldırmak için başlıktaki “Sil”i kullan.',
          );
          return;
        }
        setEmptyError(null);
        return save.mutateAsync({ date: output.date, sex: output.sex, values }).then(
          () => undefined,
          () => undefined,
        );
      }}>
      {mode.kind === 'new' || askSex ? (
        <Card>
          <CardHeader>
            <CardTitle>{mode.kind === 'new' ? 'Ölçüm günü' : 'Cinsiyet'}</CardTitle>
            <CardDescription>
              {mode.kind === 'new'
                ? 'Ölçümün alındığı gün; bugün varsayılan. Aynı gün birden çok kez girersen değerler o güne eklenir.'
                : 'Kayıtta cinsiyet yok; bel-kalça oranının eşiği buna göre.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {mode.kind === 'new' ? (
              <FormField of={form} path={['date']}>
                {(field) => {
                  const taken = typeof field.input === 'string' && mode.measuredDates.includes(field.input);
                  return (
                    <Field data-invalid={Boolean(field.errors) || undefined} className="max-w-sm">
                      <FieldLabel htmlFor="date">Tarih</FieldLabel>
                      <Input
                        {...field.props}
                        id="date"
                        type="date"
                        max={mode.today}
                        value={field.input ?? ''}
                        aria-invalid={Boolean(field.errors) || undefined}
                      />
                      {taken && typeof field.input === 'string' ? (
                        <FieldDescription>
                          {formatDay(field.input)} tarihinde ölçüm var: aynı ölçümü girersen eskisinin yerine geçer, diğerleri
                          kalır. Değerleri görmek için{' '}
                          <Link href={`${base}/${field.input}/edit`}>o günü düzenle</Link>.
                        </FieldDescription>
                      ) : null}
                      <FieldError>{field.errors?.[0]}</FieldError>
                    </Field>
                  );
                }}
              </FormField>
            ) : null}

            {askSex ? (
              <FormField of={form} path={['sex']}>
                {(field) => (
                  <Field data-invalid={Boolean(field.errors) || undefined} className="max-w-sm">
                    <FieldLabel htmlFor="sex">Cinsiyet</FieldLabel>
                    <LabeledSelect
                      id="sex"
                      value={field.input}
                      labels={SEX_LABELS}
                      onChange={(sex) => setInput(form, { path: ['sex'], input: sex })}
                    />
                    <FieldDescription>
                      Bel-kalça oranı ve gövde dayanıklılığının başvuru değerleri cinsiyete göre. Bir kez girilir.
                    </FieldDescription>
                    <FieldError>{field.errors?.[0]}</FieldError>
                  </Field>
                )}
              </FormField>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {GROUPS.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{GROUP_INFO[group].title}</CardTitle>
            <CardDescription>{GROUP_INFO[group].description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {MEASUREMENT_IDS.filter((id) => MEASUREMENTS[id].group === group).map((id) => (
              <MeasurementField key={id} form={form} id={id} onEdit={clearEmptyError} />
            ))}
          </CardContent>
        </Card>
      ))}

      {emptyError || hiddenError ? (
        <Alert variant="destructive">
          <WarningCircle />
          <AlertTitle>Form gönderilemedi</AlertTitle>
          <AlertDescription>{emptyError ?? hiddenError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" nativeButton={false} render={<Link href={base} />}>
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

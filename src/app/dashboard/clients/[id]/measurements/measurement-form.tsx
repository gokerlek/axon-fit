'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Collapsible } from '@base-ui/react/collapsible';
import { Field as FormField, Form, getDeepError, getDeepErrorEntries, setInput, useField, useForm } from '@formisch/react';
import { CaretDown, Check, WarningCircle } from '@phosphor-icons/react';
import { LabeledSelect } from '@/components/labeled-select';
import { SectionHeader } from '@/components/section-header';
import { UnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { decimalText, measurementFormSchema, SEX_LABELS, SEX_UNKNOWN, type SexChoice } from '@/lib/schemas/measurement';
import { GROUP_INFO, groupSummary, UNIT_LABELS } from './measurement-text';

type FormStore = ReturnType<typeof useForm<typeof measurementFormSchema>>;
type Group = MeasurementDef['group'];

export type MeasurementFormMode =
  /** Yeni: gün seçilir (bugün varsayılan); ölçülmüş günler uyarı için. */
  | { kind: 'new'; today: string; measuredDates: string[] }
  /** Düzenleme: gün adresten gelir, değişmez. */
  | { kind: 'edit'; date: string };

const GROUPS = Object.keys(GROUP_INFO) as Group[];
const FORM_ID = 'measurement-form';

/** Alan açıklaması: ne sıklıkla ve katalogdaki not ("Önerilen" rozeti etikette). */
function describe(def: MeasurementDef): string {
  return [`${def.frequency}.`, def.note].filter(Boolean).join(' ');
}

const inputId = (key: string) => `m-${key.replace(':', '-')}`;

/** "calf_girth:left" → bölümü. */
const groupOfSlot = (key: string): Group | undefined => MEASUREMENTS[key.split(':')[0] as MeasurementId]?.group;

/**
 * Geçersiz gönderimde ilk hataya kaydırır. Hatalı alan katlanmış bölümdeyse bölüm hata yüzünden
 * açılır (`MeasurementForm`); kaydırma o çizildikten sonra.
 */
function revealFirstError(form: HTMLFormElement | null) {
  if (!form) return;
  window.setTimeout(() => {
    const first = form.querySelector<HTMLElement>('[aria-invalid="true"], [data-form-error]');
    if (!first) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    if (first instanceof HTMLInputElement) first.focus({ preventScroll: true });
  }, 120);
}

/** Etiketin yanında: önerilen ölçümler (SPEC §7.5) işaretli; formda bütün ölçümler isteğe bağlı. */
function Recommended({ def }: { def: MeasurementDef }) {
  return def.tier === 'recommended' ? (
    <Badge variant="secondary" className="font-normal">
      Önerilen
    </Badge>
  ) : null;
}

/**
 * Birimli sayı alanı: metin + ondalık klavye. "81,5" de "81.5" de kabul (şema çevirir); boş bırakılan
 * alan kayda girmez, sayı olmayan metin "Sayı gir." der.
 */
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
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="tabular-nums"
              value={field.input ?? ''}
              aria-invalid={Boolean(field.errors) || undefined}
              onChange={(event) => {
                const text = event.currentTarget.value;
                onEdit();
                // Boşaltılan alan "hiç girilmedi"ye döner: kaydedilmez, değişiklik de sayılmaz.
                setInput(form, { path: ['values', slot], input: text === '' ? undefined : text });
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
        <FieldLegend variant="label" className="mb-0 flex flex-wrap items-center gap-2">
          {def.label}
          <Recommended def={def} />
        </FieldLegend>
        {/* Sol ve sağ her genişlikte yan yana. */}
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
      <FieldLabel htmlFor={inputId(id)} className="flex flex-wrap items-center gap-2">
        {def.label}
        <Recommended def={def} />
      </FieldLabel>
      <ValueInput form={form} slot={id} id={inputId(id)} unit={unit} onEdit={onEdit} />
      <FieldDescription>{describe(def)}</FieldDescription>
    </div>
  );
}

/** Bölüm başlığının ikinci satırı: doluysa girilen değerler, boşsa bölümün ne olduğu. */
function GroupSummary({ form, group }: { form: FormStore; group: Group }) {
  const values = useField(form, { path: ['values'] }).input as Record<string, string | undefined>;
  const summary = groupSummary(group, values);
  return (
    <span className="text-sm text-muted-foreground">
      {summary.count > 0 ? (
        <>
          <span className="font-medium text-foreground">{summary.count} değer</span> · {summary.text}
        </>
      ) : (
        GROUP_INFO[group].description
      )}
    </span>
  );
}

/** Telefonda Kaydet'in yanında: kaç değer girildiği. */
function FilledCount({ form }: { form: FormStore }) {
  const values = useField(form, { path: ['values'] }).input as Record<string, string | undefined>;
  const count = GROUPS.reduce((sum, group) => sum + groupSummary(group, values).count, 0);
  return <span className="text-sm text-muted-foreground">{count > 0 ? `${count} değer girildi` : 'Henüz değer yok'}</span>;
}

/**
 * Ölçüm girişi ve bir günün düzenlenmesi — bölüm kartları (SPEC §6): gün (ve bilinmiyorsa
 * cinsiyet), sonra katalog gruplarına göre katlanır bölümler; katlı bölüm girilen değerleri özetler.
 * Yalnız doldurulan değerler kaydedilir; düzenlemede boşaltılan alan o günden çıkar.
 *
 * Kaydet masaüstünde başlıkta, telefonda dock'un üstünde yapışkan çubukta (22 kutuluk formda en alta
 * inmek gerekmesin). Kaydedilmemiş değişiklik varken sayfadan çıkış sorulur (`UnsavedChangesGuard`).
 */
export function MeasurementForm({
  clientId,
  mode,
  initialValues,
  askSex,
  title,
  description,
  actions,
}: {
  clientId: string;
  mode: MeasurementFormMode;
  initialValues: Record<string, number>;
  /** Kayıtta cinsiyet yoksa sorulur (bel-kalça oranı ve dayanıklılık başvuruları için). */
  askSex: boolean;
  title: string;
  description: string;
  /** Başlıkta Kaydet'in yanındaki eylemler (düzenlemede "Sil"). */
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const base = `/dashboard/clients/${clientId}/measurements`;
  const form = useForm({
    schema: measurementFormSchema,
    initialInput: {
      date: mode.kind === 'new' ? mode.today : mode.date,
      sex: SEX_UNKNOWN,
      values: Object.fromEntries(Object.entries(initialValues).map(([key, value]) => [key, decimalText(value)])),
    },
  });
  const [emptyError, setEmptyError] = useState<string | null>(null);
  // "En az bir ölçüm gir" uyarısı bir değer yazılınca kalkar.
  const clearEmptyError = () => setEmptyError(null);

  // Yeni girişte antropometri açık (en sık alınan); düzenlemede değeri olan bölümler.
  const [open, setOpen] = useState<Record<Group, boolean>>(() => {
    const filled = new Set(Object.keys(initialValues).map(groupOfSlot));
    return Object.fromEntries(
      GROUPS.map((group) => [group, mode.kind === 'new' || filled.size === 0 ? group === 'anthropometry' : filled.has(group)]),
    ) as Record<Group, boolean>;
  });
  // Hatalı alanı olan bölüm kapanmaz: hata gizli kalmasın.
  const errorGroups = new Set(getDeepErrorEntries(form, { path: ['values'] }).map((entry) => groupOfSlot(String(entry.path[1]))));

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

  // Telefonda bildirimler yapışkan Kaydet çubuğunun üstünde çıksın (`ui/sonner`, düzenleyiciyle aynı pay).
  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty('--editor-save-space', '4.25rem');
    return () => {
      style.removeProperty('--editor-save-space');
    };
  }, []);

  const hiddenError = getDeepError(form);
  const guarded = form.isDirty && !save.isPending && !save.isSuccess;
  const saveLabel = save.isPending ? 'Kaydediliyor…' : 'Kaydet';
  const saveIcon = save.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />;
  const reveal = (event: React.MouseEvent<HTMLButtonElement>) =>
    revealFirstError(event.currentTarget.form ?? (document.getElementById(FORM_ID) as HTMLFormElement | null));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        back={{ href: base, label: 'Ölçümler' }}
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {/* Telefonda Kaydet alttaki yapışkan çubukta. */}
            <Button type="submit" form={FORM_ID} disabled={save.isPending} className="hidden sm:inline-flex" onClick={reveal}>
              {saveIcon}
              {saveLabel}
            </Button>
          </>
        }
      />

      <Form
        of={form}
        id={FORM_ID}
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
                        <FieldLabel htmlFor="date" className="flex items-baseline gap-2">
                          Tarih <span className="text-xs font-normal text-muted-foreground">zorunlu</span>
                        </FieldLabel>
                        <Input
                          {...field.props}
                          id="date"
                          type="date"
                          required
                          max={mode.today}
                          value={field.input ?? ''}
                          aria-invalid={Boolean(field.errors) || undefined}
                        />
                        {taken && typeof field.input === 'string' ? (
                          <FieldDescription>
                            {formatDay(field.input)} tarihinde ölçüm var: aynı ölçümü girersen eskisinin yerine geçer, diğerleri
                            kalır. Değerleri görmek için <Link href={`${base}/${field.input}/edit`}>o günü düzenle</Link>.
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
                      <FieldLabel htmlFor="sex" className="flex items-baseline gap-2">
                        Cinsiyet <span className="text-xs font-normal text-muted-foreground">isteğe bağlı</span>
                      </FieldLabel>
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
          <Collapsible.Root
            key={group}
            open={open[group] || errorGroups.has(group)}
            onOpenChange={(next) => setOpen((current) => ({ ...current, [group]: next }))}
            render={<Card />}>
            <CardHeader>
              <h3>
                <Collapsible.Trigger className="group/section -mx-2 -my-1 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-heading text-base leading-snug font-medium">{GROUP_INFO[group].title}</span>
                    <GroupSummary form={form} group={group} />
                  </span>
                  <CaretDown
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-160 group-data-[panel-open]/section:rotate-180 motion-reduce:transition-none"
                  />
                </Collapsible.Trigger>
              </h3>
            </CardHeader>
            <Collapsible.Panel keepMounted>
              <CardContent className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {MEASUREMENT_IDS.filter((id) => MEASUREMENTS[id].group === group).map((id) => (
                  <MeasurementField key={id} form={form} id={id} onEdit={clearEmptyError} />
                ))}
              </CardContent>
            </Collapsible.Panel>
          </Collapsible.Root>
        ))}

        {emptyError || hiddenError ? (
          <Alert variant="destructive" data-form-error>
            <WarningCircle />
            <AlertTitle>Form gönderilemedi</AlertTitle>
            <AlertDescription>{emptyError ?? hiddenError}</AlertDescription>
          </Alert>
        ) : null}

        {/* Telefonda Kaydet dock'un üstünde yapışkan (`--dock-clearance`); formun sonunda kendi yerine oturur. */}
        <div className="sticky bottom-(--dock-clearance) z-20 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-2 pl-4 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/85 sm:hidden">
          <FilledCount form={form} />
          <Button type="submit" disabled={save.isPending} className="h-11 px-5" onClick={reveal}>
            {saveIcon}
            {saveLabel}
          </Button>
        </div>
      </Form>

      <UnsavedChangesGuard active={guarded} description="Çıkarsan girdiğin ölçümler kaydedilmez." onLeave={() => undefined} />
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getInput, setInput, useForm } from '@formisch/react';
import {
  BatteryHigh,
  Check,
  FirstAidKit,
  Heartbeat,
  Info,
  PersonSimpleWalk,
  Plus,
  Ruler,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { LabeledSelect } from '@/components/labeled-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { healthConsentState } from '@/lib/client-status';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { cn } from '@/lib/utils';
import {
  CLIENT_NOTE_MAX,
  CLIENT_STATUS_LABELS,
  clientFormSchema,
  HEALTH_FIELD_INFO,
  HEALTH_FIELDS,
  type Client,
  type ClientInput,
  type HealthField,
} from '@/lib/schemas/client';

/** Modül ilk açıldığında seçili gelen parçalar: en az veriyle en çok işe yarayanlar. */
const DEFAULT_HEALTH_FIELDS: HealthField[] = ['conditions', 'readiness'];

const HEALTH_FIELD_ICONS: Record<HealthField, PhosphorIcon> = {
  conditions: FirstAidKit,
  readiness: BatteryHigh,
  check_in: Heartbeat,
  measurements: Ruler,
  screening: PersonSimpleWalk,
};

/**
 * Danışan ekleme/düzenleme. Yeni danışan kaydedilince sunucu özel repo'sunu açar ve
 * PT davet ekranına geçer. Sağlık modülü burada açılır; danışan ilk girişinde onaylar.
 */
/** Seçicide "program yok": Base UI Select boş değeri seçilebilir saymaz. */
const NO_PROGRAM = 'none';

export function ClientForm({ editing, templates }: { editing: Client | null; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const form = useForm({
    schema: clientFormSchema,
    initialInput: {
      name: editing?.name ?? '',
      note: editing?.note ?? '',
      status: editing?.status ?? 'active',
      healthEnabled: editing?.modules.health.enabled ?? false,
      healthFields: editing?.modules.health.fields ?? [],
      templateId: editing?.program?.templateId ?? '',
    },
  });
  const programLabels: Record<string, string> = {
    [NO_PROGRAM]: 'Program yok',
    ...Object.fromEntries(templates.map((template) => [template.id, template.name])),
  };
  // Atanmış şablon silindiyse seçici boş görünmesin.
  const assigned = editing?.program?.templateId;
  if (assigned && !programLabels[assigned]) programLabels[assigned] = 'Silinmiş şablon';
  const consented = editing?.consents.health?.granted ? editing.consents.health.fields : null;
  const consentState = editing ? healthConsentState(editing) : 'off';

  const save = useServiceMutation({
    fn: (values: ClientInput) =>
      fetchJson<{ id: string }>('/api/clients', {
        method: 'POST',
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      }),
    invalidate: [['clients']],
    notify: { success: editing ? 'Danışan güncellendi.' : 'Danışan eklendi, özel repo\'su açıldı.' },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: ({ id }) => {
      // Yeni danışanın ilk işi davet: kod yalnız o ekranda üretilip gösterilir.
      router.push(editing ? `/dashboard/clients/${id}` : `/dashboard/clients/${id}/invite`);
      router.refresh();
    },
  });

  return (
    <Form
      of={form}
      className="flex flex-col gap-6"
      onSubmit={(values) => save.mutateAsync(values as ClientInput).catch(() => undefined)}>
      <Card>
        <CardHeader>
          <CardTitle>Kişi</CardTitle>
          <CardDescription>Ad ve not yalnız danışanın kendi özel repo'sunda durur.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <FormField of={form} path={['name']}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="name">Ad soyad</FieldLabel>
                  <Input
                    {...field.props}
                    id="name"
                    autoComplete="off"
                    value={field.input ?? ''}
                    placeholder="Ör. Ayşe Demir"
                    aria-invalid={Boolean(field.errors) || undefined}
                    onChange={(event) => setInput(form, { path: ['name'], input: event.currentTarget.value })}
                  />
                  <FieldDescription>Danışan kendi ekranında bu adla karşılanır.</FieldDescription>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>

            {editing ? (
              <FormField of={form} path={['status']}>
                {(field) => (
                  <Field data-invalid={Boolean(field.errors) || undefined} className="max-w-sm">
                    <FieldLabel htmlFor="status">Durum</FieldLabel>
                    <LabeledSelect
                      id="status"
                      value={field.input}
                      labels={CLIENT_STATUS_LABELS}
                      onChange={(value) => setInput(form, { path: ['status'], input: value })}
                    />
                    <FieldDescription>Arşivdeki danışan giriş yapamaz, verisi yerinde kalır.</FieldDescription>
                    <FieldError>{field.errors?.[0]}</FieldError>
                  </Field>
                )}
              </FormField>
            ) : null}
          </div>

          <FormField of={form} path={['note']}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="note">Not</FieldLabel>
                <Textarea
                  {...field.props}
                  id="note"
                  rows={5}
                  value={field.input ?? ''}
                  maxLength={CLIENT_NOTE_MAX}
                  placeholder="Hedefi, geçmişi, dikkat edilecekler…"
                  aria-invalid={Boolean(field.errors) || undefined}
                  onChange={(event) => setInput(form, { path: ['note'], input: event.currentTarget.value })}
                />
                <FieldDescription>Senin için; danışan görmez.</FieldDescription>
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Program</CardTitle>
          <CardDescription>
            Danışanın antrenman ekranında bu şablon açılır. Şablonu değiştirmek geçmiş antrenmanlarını etkilemez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField of={form} path={['templateId']}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined} className="max-w-sm">
                <FieldLabel htmlFor="templateId">Şablon</FieldLabel>
                <LabeledSelect
                  id="templateId"
                  value={field.input || NO_PROGRAM}
                  labels={programLabels}
                  onChange={(value) => setInput(form, { path: ['templateId'], input: value === NO_PROGRAM ? '' : value })}
                />
                <FieldDescription>
                  {templates.length === 0 ? (
                    <>
                      Henüz şablon yok.{' '}
                      <Link href="/dashboard/templates/new" className="font-medium text-foreground underline underline-offset-4">
                        Şablon oluştur
                      </Link>
                      .
                    </>
                  ) : (
                    'Sonra da değiştirebilirsin.'
                  )}
                </FieldDescription>
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>
        </CardContent>
      </Card>

      <FormField of={form} path={['healthEnabled']}>
        {(enabledField) => (
          <Card>
            <CardHeader>
              <CardTitle>Sağlık modülü</CardTitle>
              <CardDescription>
                Ağrı, ölçüm ve kısıtlar özel nitelikli veridir. Danışan ilk girişinde seçtiğin parçaları görür ve
                onaylar; onay vermezse hiçbiri tutulmaz.
              </CardDescription>
              <CardAction>
                <Switch
                  aria-label="Sağlık modülü"
                  checked={Boolean(enabledField.input)}
                  onCheckedChange={(checked) => {
                    setInput(form, { path: ['healthEnabled'], input: checked });
                    if (checked) {
                      // İlk açılışta en az bilgiyle başlasın: kısıtlar ve hazır oluşluk.
                      const current = getInput(form, { path: ['healthFields'] }) ?? [];
                      if (current.length === 0) setInput(form, { path: ['healthFields'], input: DEFAULT_HEALTH_FIELDS });
                    }
                  }}
                />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {enabledField.input ? (
                <FormField of={form} path={['healthFields']}>
                  {(field) => {
                    const selected = new Set(field.input ?? []);
                    const needsReconsent = consented !== null && [...selected].some((item) => !consented.includes(item));
                    const toggle = (item: HealthField) =>
                      setInput(form, {
                        path: ['healthFields'],
                        input: HEALTH_FIELDS.filter((value) => (value === item ? !selected.has(item) : selected.has(value))),
                      });
                    return (
                      <Field data-invalid={Boolean(field.errors) || undefined}>
                        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Tutulacak parçalar">
                          {HEALTH_FIELDS.map((item) => {
                            const isOn = selected.has(item);
                            const Icon = HEALTH_FIELD_ICONS[item];
                            return (
                              <li key={item}>
                                <Button
                                  type="button"
                                  variant={isOn ? 'secondary' : 'outline'}
                                  aria-pressed={isOn}
                                  className={cn(
                                    'h-full w-full items-start justify-start gap-3 p-3 text-left whitespace-normal',
                                    isOn && 'ring-1 ring-primary/50',
                                  )}
                                  onClick={() => toggle(item)}>
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                                    <Icon weight="fill" className="size-5 text-muted-foreground" />
                                  </span>
                                  <span className="flex flex-1 flex-col gap-0.5">
                                    <span className="font-medium">{HEALTH_FIELD_INFO[item].label}</span>
                                    <span className="text-xs font-normal text-muted-foreground">
                                      {HEALTH_FIELD_INFO[item].description}
                                    </span>
                                  </span>
                                  {isOn ? <Check className="text-primary" /> : <Plus className="text-muted-foreground" />}
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                        <FieldError>{field.errors?.[0]}</FieldError>
                        {needsReconsent ? (
                          <Alert>
                            <Info weight="fill" />
                            <AlertDescription>
                              Danışanın onayı bu parçaların hepsini kapsamıyor. Kaydedersen bir sonraki girişinde yeniden
                              sorulur; o zamana kadar sağlık kaydı tutulmaz.
                            </AlertDescription>
                          </Alert>
                        ) : null}
                      </Field>
                    );
                  }}
                </FormField>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Kapalı: sağlık ekranları danışana görünmez, hiçbir sağlık kaydı tutulmaz.
                  {consentState === 'granted' || consentState === 'outdated'
                    ? ' Daha önce tutulanlar danışanın repo\'sunda kalır; silmek için danışanı silmen gerekir.'
                    : null}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </FormField>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={editing ? `/dashboard/clients/${editing.id}` : '/dashboard/clients'} />}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? (editing ? 'Kaydediliyor…' : 'Repo açılıyor…') : editing ? 'Kaydet' : 'Danışanı ekle'}
        </Button>
      </div>
    </Form>
  );
}

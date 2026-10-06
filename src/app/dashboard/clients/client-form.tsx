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
import { healthConsentState, healthScopeGrows } from '@/lib/client-status';
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
  TRAINING_EXPERIENCE_LABELS,
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
 * Danışan ekleme/düzenleme: kişisel bilgiler, antrenman geçmişi (öneri motorunun aşama tabanı,
 * `exposure.ts`) ve izinler (sağlık modülü). Yeni danışan
 * kaydedilince sunucu özel repo'sunu açar ve PT davet ekranına geçer. Program ve ölçümler
 * danışanın bir özelliği değil, yapılan iştir: danışanın sayfasından yönetilir.
 */
export function ClientForm({ editing }: { editing: Client | null }) {
  const router = useRouter();
  const form = useForm({
    schema: clientFormSchema,
    initialInput: {
      name: editing?.name ?? '',
      note: editing?.note ?? '',
      status: editing?.status ?? 'active',
      aiEnabled: editing?.modules.ai?.enabled ?? false,
      healthEnabled: editing?.modules.health.enabled ?? false,
      healthFields: editing?.modules.health.fields ?? [],
      trainingExperience: editing?.training?.experience ?? 'new',
    },
  });
  const consented = editing?.consents.health?.granted ? editing.consents.health.fields : null;
  const consentState = editing ? healthConsentState(editing) : 'off';

  const save = useServiceMutation({
    fn: (values: ClientInput) =>
      fetchJson<{ id: string }>('/api/clients', {
        method: 'POST',
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      }),
    invalidate: [['clients']],
    notify: { success: editing ? 'Danışan güncellendi.' : 'Danışan eklendi.' },
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
          <CardDescription>Ad ve not yalnız bu danışana ayrılmış gizli kayıtta durur.</CardDescription>
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

            <FormField of={form} path={['trainingExperience']}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined} className="max-w-sm">
                  <FieldLabel htmlFor="training-experience">Antrenman geçmişi</FieldLabel>
                  <LabeledSelect
                    id="training-experience"
                    value={field.input}
                    labels={TRAINING_EXPERIENCE_LABELS}
                    onChange={(value) => setInput(form, { path: ['trainingExperience'], input: value })}
                  />
                  <FieldDescription>
                    Ağırlık önerileri buna göre başlar: deneyimli danışan her yeni harekette tanışma adımlarını tek
                    antrenmanda geçer.
                  </FieldDescription>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>
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

      <FormField of={form} path={['aiEnabled']}>
        {(field) => <Card>
          <CardHeader>
            <CardTitle>AI koç desteği</CardTitle>
            <CardDescription>Danışan ve sen kayıtlar hakkında soru sorabilir, program taslağı isteyebilirsiniz. Taslaklar yalnız sen onaylayınca uygulanır. Danışanın ayrıca veri kullanımını onaylaması gerekir.</CardDescription>
            <CardAction>
              <label className="-m-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                <Switch aria-label="AI koç desteği" checked={Boolean(field.input)} onCheckedChange={checked => setInput(form, { path: ['aiEnabled'], input: checked })} />
              </label>
            </CardAction>
          </CardHeader>
        </Card>}
      </FormField>

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
                {/* Anahtar küçük: dokunma alanı çevresindeki etiketle 44 px (etikete dokunmak anahtarı çevirir). */}
                <label className="-m-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
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
                </label>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {enabledField.input ? (
                <FormField of={form} path={['healthFields']}>
                  {(field) => {
                    const selected = new Set(field.input ?? []);
                    // Sunucuyla aynı kural (`nextHealthModule`): modül yeniden açılıyor ya da kapsam genişliyorsa
                    // (çıkarılıp geri eklenen parça dahil) onay yeniden sorulur.
                    const needsReconsent =
                      consented !== null &&
                      (healthScopeGrows(editing?.modules.health ?? null, [...selected]) ||
                        [...selected].some((item) => !consented.includes(item)));
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
                                    isOn && 'ring-2 ring-primary-text',
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
                                  {isOn ? <Check className="text-primary-text" /> : <Plus className="text-muted-foreground" />}
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
                              Danışanın onayı bu kapsamdan önce verildi. Kaydedersen bir sonraki girişinde yeniden sorulur;
                              o zamana kadar sağlık kaydı tutulmaz.
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
                    ? ' Daha önce tutulanlar danışanın kaydında kalır; silmek için danışanı silmen gerekir.'
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
          {save.isPending ? (editing ? 'Kaydediliyor…' : 'Ekleniyor…') : editing ? 'Kaydet' : 'Danışanı ekle'}
        </Button>
      </div>
    </Form>
  );
}

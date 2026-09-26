'use client';

import Link from 'next/link';
import { Field as FormField, getInput, setInput, type useForm } from '@formisch/react';
import { ArrowCounterClockwise, Info } from '@phosphor-icons/react';
import { LabeledSelect } from '@/components/labeled-select';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { loadSpecFor } from '@/lib/device-loads';
import { formatNumber } from '@/lib/format';
import { defaultRule, describeRule, PROGRESSION_LABELS, RIR_LABELS, type ProgressionRule } from '@/lib/progression';
import type { Device } from '@/lib/schemas/device';
import type { exerciseFormSchema, TRACKING_TYPES } from '@/lib/schemas/exercise';
import { describeDefaultRule, deviceLoadFields, LIBRARY_IMPACT_NOTE, sameRule } from './exercise-form-logic';

/**
 * "Yük ve ilerleme": kayıt türü, ağırlık adımı ve taban, ilerleme kuralı (SPEC §7.1).
 *
 * Cihaz seçiliyse ve cihaz ağırlık veriyorsa adım ve taban cihazın ayarından gelir (öneri motoru da
 * onları kullanır): alanlar salt okunur görünür. Cihazsız harekette egzersizin kendi değerleri düzenlenir.
 * Kural türün varsayılanıyla açılır; PT isterse değiştirir, "Varsayılan kuralı kullan" geri getirir.
 */

type Form = ReturnType<typeof useForm<typeof exerciseFormSchema>>;
type TrackingType = (typeof TRACKING_TYPES)[number];

const TRACKING_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Ağırlık + tekrar',
  bodyweight_reps: 'Vücut ağırlığı (tekrar)',
  duration: 'Süre',
};

const RIR_ITEMS: Record<string, string> = Object.fromEntries(
  Object.entries(RIR_LABELS).map(([rir, label]) => [rir, rir === '2' ? `${label} (önerilen)` : label]),
);

/** Kütüphanedeki değişikliğin şablon ve programlara geçtiğini söyleyen satır. */
export function LibraryImpactNote() {
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      {LIBRARY_IMPACT_NOTE}
    </p>
  );
}

/** Formisch sayı alanı: kutunun metni sayıya çevrilir (boş kutu NaN → şema "Sayı gir." der). */
function NumberField({
  form,
  path,
  label,
  description,
  step,
  min,
}: {
  form: Form;
  path: ['loadStepKg'] | ['minLoadKg'] | ['progression', 'targetMin'] | ['progression', 'targetMax'];
  label: string;
  description?: string;
  step: string;
  min: string;
}) {
  const id = path.join('-');
  return (
    <FormField of={form} path={path}>
      {(field) => (
        <Field data-invalid={Boolean(field.errors) || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            {...field.props}
            id={id}
            type="number"
            inputMode={step === '1' ? 'numeric' : 'decimal'}
            step={step}
            min={min}
            className="tabular-nums"
            aria-invalid={Boolean(field.errors) || undefined}
            // Dört yolun hepsi sayı alanı; formisch birleşim yolu tek çağrıda daraltamıyor.
            onChange={(event) => setInput(form, { path: path as ['loadStepKg'], input: event.currentTarget.valueAsNumber })}
            value={Number.isNaN(field.input) ? '' : (field.input ?? '')}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{field.errors?.[0]}</FieldError>
        </Field>
      )}
    </FormField>
  );
}

/** Ağırlık adımı ve taban: cihazdan (salt okunur) ya da egzersizin kendi değerleri. */
function LoadStep({ form, deviceById }: { form: Form; deviceById: ReadonlyMap<string, Device> }) {
  return (
    <FormField of={form} path={['deviceId']}>
      {(deviceField) => {
        const device = deviceField.input ? deviceById.get(deviceField.input) : undefined;
        const fromDevice = deviceLoadFields(device);
        if (device && fromDevice) {
          return (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="loadStepKg">Ağırlık adımı (kg)</FieldLabel>
                <Input
                  id="loadStepKg"
                  readOnly
                  aria-describedby="load-from-device"
                  className="bg-muted/50 text-muted-foreground tabular-nums dark:bg-muted/50"
                  value={fromDevice.stepKg === null ? 'Setteki ağırlıklar' : formatNumber(fromDevice.stepKg)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="minLoadKg">Taban ağırlık (kg)</FieldLabel>
                <Input
                  id="minLoadKg"
                  readOnly
                  aria-describedby="load-from-device"
                  className="bg-muted/50 text-muted-foreground tabular-nums dark:bg-muted/50"
                  value={formatNumber(fromDevice.minKg)}
                />
              </Field>
              <FieldDescription id="load-from-device" className="sm:col-span-2">
                Cihazın ayarından geliyor: {device.name} · {fromDevice.summary}. Değiştirmek için{' '}
                <Link href={`/dashboard/devices/${device.id}`}>cihazı gör</Link>.
              </FieldDescription>
            </div>
          );
        }
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              form={form}
              path={['loadStepKg']}
              label="Ağırlık adımı (kg)"
              description="Aletin izin verdiği en küçük artış; öneriler bu adıma yuvarlanır."
              step="0.5"
              min="0"
            />
            <NumberField
              form={form}
              path={['minLoadKg']}
              label="Taban ağırlık (kg)"
              description="Bar ya da aletin kendi ağırlığı; öneri bunun altına inmez."
              step="0.5"
              min="0"
            />
          </div>
        );
      }}
    </FormField>
  );
}

export function LoadFields({
  form,
  deviceById,
  startRule,
}: {
  form: Form;
  deviceById: ReadonlyMap<string, Device>;
  /** Düzenlemede açılıştaki kural: değişirse şablon ve programlara etkisi söylenir. Yenide yok. */
  startRule?: ProgressionRule;
}) {
  return (
    <FormField of={form} path={['trackingType']}>
      {(trackingField) => {
        const tracking = trackingField.input ?? 'weight_reps';
        const unit = tracking === 'duration' ? 'sn' : 'tekrar';
        return (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="trackingType">Kayıt türü</FieldLabel>
                <LabeledSelect
                  id="trackingType"
                  value={trackingField.input}
                  labels={TRACKING_LABELS}
                  onChange={(value) => {
                    setInput(form, { path: ['trackingType'], input: value });
                    // Birim değişir (tekrar ↔ saniye): aralık yeni türün varsayılanına döner.
                    const category = getInput(form, { path: ['category'] }) ?? 'compound';
                    setInput(form, { path: ['progression'], input: defaultRule(category, value) });
                  }}
                />
                <FieldDescription>Danışan bu harekette ne girer: ağırlık + tekrar, yalnız tekrar, süre.</FieldDescription>
              </Field>
            </div>

            {tracking === 'weight_reps' ? <LoadStep form={form} deviceById={deviceById} /> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField of={form} path={['progression', 'scheme']}>
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="progressionScheme">İlerleme</FieldLabel>
                    <LabeledSelect
                      id="progressionScheme"
                      value={field.input}
                      labels={PROGRESSION_LABELS}
                      onChange={(value) => setInput(form, { path: ['progression', 'scheme'], input: value })}
                    />
                  </Field>
                )}
              </FormField>
              {tracking !== 'duration' ? (
                <FormField of={form} path={['progression', 'targetRir']}>
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="targetRir">Yedekte tekrar (RIR)</FieldLabel>
                      <LabeledSelect
                        id="targetRir"
                        value={String(field.input ?? 2)}
                        labels={RIR_ITEMS}
                        onChange={(value) => setInput(form, { path: ['progression', 'targetRir'], input: Number(value) })}
                      />
                      <FieldDescription>
                        Setin sonunda kaç tekrar daha yapabilirdi; öneri motoru buna göre artırır.
                      </FieldDescription>
                    </Field>
                  )}
                </FormField>
              ) : null}
              <NumberField form={form} path={['progression', 'targetMin']} label={`Hedef en az (${unit})`} step="1" min="1" />
              <NumberField form={form} path={['progression', 'targetMax']} label={`Hedef en çok (${unit})`} step="1" min="1" />
            </div>

            {/* Kuralın düz cümleyle anlatımı, türün varsayılanı ve kütüphane etkisi. */}
            <FormField of={form} path={['progression']}>
              {(ruleField) => (
                <FormField of={form} path={['category']}>
                  {(categoryField) => (
                    <FormField of={form} path={['deviceId']}>
                      {(deviceField) => {
                        const rule = ruleField.input as ProgressionRule | undefined;
                        const category = categoryField.input ?? 'compound';
                        const fallback = defaultRule(category, tracking);
                        const isDefault = sameRule(rule, fallback);
                        const device = deviceField.input ? deviceById.get(deviceField.input) : undefined;
                        const spec = loadSpecFor(
                          {
                            trackingType: tracking,
                            loadStepKg: Number(getInput(form, { path: ['loadStepKg'] }) ?? 0),
                            minLoadKg: Number(getInput(form, { path: ['minLoadKg'] }) ?? 0),
                          },
                          device,
                        );
                        const complete = rule && rule.targetMin > 0 && rule.targetMax > 0;
                        return (
                          <div className="flex flex-col gap-3 text-sm">
                            {complete ? <p className="text-muted-foreground">{describeRule(rule, spec)}</p> : null}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <p className="text-muted-foreground">
                                {describeDefaultRule(category, tracking)}
                                {isDefault ? ' (kullanılıyor).' : '.'}
                              </p>
                              {isDefault ? null : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setInput(form, { path: ['progression'], input: fallback })}>
                                  <ArrowCounterClockwise data-icon="inline-start" />
                                  Varsayılan kuralı kullan
                                </Button>
                              )}
                            </div>
                            {startRule && !sameRule(rule, startRule) ? <LibraryImpactNote /> : null}
                          </div>
                        );
                      }}
                    </FormField>
                  )}
                </FormField>
              )}
            </FormField>
          </div>
        );
      }}
    </FormField>
  );
}

'use client';

import { Field as FormField, setInput, type useForm } from '@formisch/react';
import { Plus, X } from '@phosphor-icons/react';
import { GroupedSelect } from '@/components/labeled-select';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet } from '@/components/ui/field';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  CONDITION_QUALIFIERS,
  CONDITION_REGIONS,
  CONDITIONS,
  conditionInfo,
  conditionLabel,
  parseCondition,
  type ConditionId,
  type ConditionRegion,
} from '@/lib/conditions';
import {
  DEEP_MUSCLE_LABELS,
  DEEP_MUSCLE_NOTES,
  DEEP_MUSCLE_REGION_LABELS,
  DEEP_MUSCLE_REGIONS,
  DEEP_MUSCLES,
  type DeepMuscle,
} from '@/lib/deep-muscles';
import {
  AXIAL_LOAD_LABELS,
  AXIAL_LOADS,
  CONTRACTION_TYPE_LABELS,
  CONTRACTION_TYPES,
  JOINT_WINDOW_LABELS,
  JOINT_WINDOWS,
  KINETIC_CHAIN_LABELS,
  KINETIC_CHAINS,
  LOAD_VECTOR_LABELS,
  LOAD_VECTORS,
  RESISTANCE_PROFILE_LABELS,
  RESISTANCE_PROFILES,
  SHEAR_LEVEL_LABELS,
  SHEAR_LEVELS,
  SPINAL_ALIGNMENT_LABELS,
  SPINAL_ALIGNMENTS,
  type JointWindow,
} from '@/lib/exercise-filter';
import type { exerciseFormSchema } from '@/lib/schemas/exercise';

/**
 * Medikal etiketler: sakatlık süzgeci bunlara bakar (`src/lib/exercise-filter.ts`).
 *
 * Hiçbiri zorunlu değil — etiketlenmemiş hareket süzgeçten sessizce geçer ve ekran
 * bunu "değerlendirilemedi" diye söyler. Yanlış etiket, etiketsizden kötüdür.
 */

type Form = ReturnType<typeof useForm<typeof exerciseFormSchema>>;

const REGION_LABELS: Record<ConditionRegion, string> = {
  spine: 'Omurga',
  neck: 'Boyun',
  shoulder: 'Omuz',
  elbow: 'Dirsek',
  wrist: 'El bileği',
  hip: 'Kalça',
  knee: 'Diz',
  ankle: 'Ayak bileği',
  systemic: 'Genel',
};

const QUALIFIER_LABELS: Record<(typeof CONDITION_QUALIFIERS)[number], string> = {
  acute: 'akut',
  reactive: 'reaktif',
  severe: 'şiddetli',
  stable: 'sakin dönem',
  controlled: 'kontrollü',
  uncontrolled: 'kontrolsüz',
  postop: 'ameliyat sonrası',
};

/** Kısıt seçenekleri: her kimlik + (varsa) şiddet/faz varyantı, bölgeye göre gruplu. */
function conditionGroups() {
  return CONDITION_REGIONS.map((region) => ({
    label: REGION_LABELS[region],
    options: (Object.keys(CONDITIONS) as ConditionId[])
      .filter((id) => conditionInfo(id).region === region)
      .flatMap((id) => {
        const info = conditionInfo(id);
        const base = { value: id, label: info.label };
        const variants = (info.qualifiers ?? []).map((qualifier) => ({
          value: `${id}:${qualifier}`,
          label: `${info.label} (${QUALIFIER_LABELS[qualifier]})`,
        }));
        return [base, ...variants];
      }),
  })).filter((group) => group.options.length > 0);
}

/** Tek seçimli etiket alanı; "Belirtilmemiş" seçeneği alanı boşaltır. */
function TagSelect<Value extends string>({
  form,
  path,
  label,
  values,
  labels,
  description,
}: {
  form: Form;
  path: string;
  label: string;
  values: readonly Value[];
  labels: Record<Value, string>;
  description?: string;
}) {
  return (
    <FormField of={form} path={[path as never]}>
      {(field) => (
        <Field data-invalid={Boolean(field.errors) || undefined}>
          <FieldLabel htmlFor={path}>{label}</FieldLabel>
          <GroupedSelect
            id={path}
            value={(field.input as string | undefined) ?? ''}
            groups={[{ label, options: values.map((value) => ({ value, label: labels[value] })) }]}
            empty="Belirtilmemiş"
            onChange={(value) => setInput(form, { path: [path as never], input: (value || undefined) as never })}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{field.errors?.[0]}</FieldError>
        </Field>
      )}
    </FormField>
  );
}

/** Seçilmiş kısıtlar: ekle/çıkar. Aynı kimliğin niteliksiz hali her şiddeti kapsar. */
function ConditionField({
  form,
  path,
  label,
  description,
}: {
  form: Form;
  path: 'contraindications' | 'safeFor';
  label: string;
  description: string;
}) {
  const groups = conditionGroups();

  return (
    <FormField of={form} path={[path]}>
      {(field) => {
        const current = (field.input ?? []).filter((item): item is string => typeof item === 'string');
        const add = (value: string) => {
          if (!value || current.includes(value) || current.length >= 12) return;
          setInput(form, { path: [path], input: [...current, value] });
        };

        return (
          <Field data-invalid={Boolean(field.errors) || undefined}>
            <FieldLabel htmlFor={path}>{label}</FieldLabel>
            {current.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {current.map((value) => {
                  const parsed = parseCondition(value);
                  return (
                    <Button
                      key={value}
                      type="button"
                      variant="secondary"
                      size="xs"
                      aria-label={`${value} kaydını kaldır`}
                      onClick={() => setInput(form, { path: [path], input: current.filter((item) => item !== value) })}>
                      {parsed ? conditionLabel(parsed) : value}
                      <X data-icon="inline-end" />
                    </Button>
                  );
                })}
              </div>
            ) : null}
            <GroupedSelect id={path} value="" groups={groups} empty="Kısıt seç" onChange={add} />
            <FieldDescription>{description}</FieldDescription>
            <FieldError>{field.errors?.[0]}</FieldError>
          </Field>
        );
      }}
    </FormField>
  );
}

export function MedicalFields({ form }: { form: Form }) {
  return (
    <FieldSet>
      <FieldDescription>
        Sakatlık süzgeci bunlara bakar. Hiçbiri zorunlu değil; boş bırakılan hareket süzgeçten sessizce
        geçer ve uygulama bunu “değerlendirilemedi” diye söyler. Emin olmadığın alanı boş bırak.
      </FieldDescription>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TagSelect form={form} path="kineticChain" label="Kinetik zincir" values={KINETIC_CHAINS} labels={KINETIC_CHAIN_LABELS} />
        <TagSelect form={form} path="axialLoading" label="Eksenel yük" values={AXIAL_LOADS} labels={AXIAL_LOAD_LABELS} />
        <TagSelect form={form} path="shearForce" label="Kesme kuvveti" values={SHEAR_LEVELS} labels={SHEAR_LEVEL_LABELS} />
        <TagSelect form={form} path="spinalAlignment" label="Omurga hizası" values={SPINAL_ALIGNMENTS} labels={SPINAL_ALIGNMENT_LABELS} />
        <TagSelect form={form} path="loadVector" label="Yük vektörü" values={LOAD_VECTORS} labels={LOAD_VECTOR_LABELS} />
        <TagSelect form={form} path="contractionType" label="Kasılma tipi" values={CONTRACTION_TYPES} labels={CONTRACTION_TYPE_LABELS} />
        <TagSelect form={form} path="resistanceProfile" label="Direnç profili" values={RESISTANCE_PROFILES} labels={RESISTANCE_PROFILE_LABELS} />
      </div>

      <FormField of={form} path={['jointWindows']}>
        {(field) => {
          const current = (field.input ?? []).filter((item): item is JointWindow => typeof item === 'string');
          return (
            <Field>
              <FieldLabel>Kritik açı pencereleri</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                className="flex-wrap justify-start"
                aria-label="Açı pencereleri"
                value={current}
                onValueChange={(value) => setInput(form, { path: ['jointWindows'], input: value as JointWindow[] })}>
                {JOINT_WINDOWS.map((window) => (
                  <ToggleGroupItem key={window} value={window}>
                    {JOINT_WINDOW_LABELS[window]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                Hareketin geçtiği riskli aralıklar. Sayesinde süzgeç hareketi komple yasaklamak yerine
                “90–45° arasında yap” diyebiliyor.
              </FieldDescription>
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          );
        }}
      </FormField>

      <FormField of={form} path={['internalRotationUnderLoad']}>
        {(field) => (
          <Field>
            <FieldLabel>Yük altında iç rotasyon</FieldLabel>
            <div>
              <Toggle
                pressed={field.input === true}
                onPressedChange={(pressed) => setInput(form, { path: ['internalRotationUnderLoad'], input: pressed })}>
                {field.input === true ? 'Var' : 'Yok'}
              </Toggle>
            </div>
            <FieldDescription>
              Upright row ve “empty can” gibi: kol yük altında iç rotasyondayken kalkıyorsa subakromiyal
              aralık daralır.
            </FieldDescription>
          </Field>
        )}
      </FormField>

      <FormField of={form} path={['activationTargets']}>
        {(field) => {
          const current = (field.input ?? []).filter((item): item is DeepMuscle => typeof item === 'string');
          const toggle = (muscle: DeepMuscle) =>
            setInput(form, {
              path: ['activationTargets'],
              input: current.includes(muscle) ? current.filter((item) => item !== muscle) : [...current, muscle],
            });

          return (
            <Field data-invalid={Boolean(field.errors) || undefined}>
              <FieldLabel>Aktivasyon hedefleri (derin kaslar)</FieldLabel>
              <div className="flex flex-col gap-2">
                {(Object.keys(DEEP_MUSCLE_REGION_LABELS) as (keyof typeof DEEP_MUSCLE_REGION_LABELS)[]).map((region) => {
                  const group = DEEP_MUSCLES.filter((muscle) => DEEP_MUSCLE_REGIONS[muscle] === region);
                  if (group.length === 0) return null;
                  return (
                    <div key={region} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-28 shrink-0 text-xs text-muted-foreground">
                        {DEEP_MUSCLE_REGION_LABELS[region]}
                      </span>
                      {group.map((muscle) => (
                        <Button
                          key={muscle}
                          type="button"
                          variant={current.includes(muscle) ? 'secondary' : 'outline'}
                          size="xs"
                          aria-pressed={current.includes(muscle)}
                          title={DEEP_MUSCLE_NOTES[muscle]}
                          onClick={() => toggle(muscle)}>
                          {current.includes(muscle) ? null : <Plus data-icon="inline-start" />}
                          {DEEP_MUSCLE_LABELS[muscle]}
                        </Button>
                      ))}
                    </div>
                  );
                })}
              </div>
              <FieldDescription>
                Haritada çizilmeyen, hacme sayılmayan derin kaslar: “bu hareket şunu uyandırır”. Rotator
                manşet, multifidus, pelvik taban gibi.
              </FieldDescription>
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          );
        }}
      </FormField>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConditionField
          form={form}
          path="contraindications"
          label="Yaptırma"
          description="Bu kısıtı olan danışanda hareket yasaklanır. Şiddet belirtmezsen her şiddeti kapsar."
        />
        <ConditionField
          form={form}
          path="safeFor"
          label="Sorun yok"
          description="Bu kısıtta uyarıları susturur; kural “yasak” diyorsa yine de yasak kalır."
        />
      </div>
    </FieldSet>
  );
}

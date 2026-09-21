"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Field as FormField,
  FieldArray,
  Form,
  getDeepError,
  insert,
  remove,
  setInput,
  useForm,
} from "@formisch/react";
import { Plus, WarningCircle, X } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchJson } from "@/lib/query/errors";
import { applyFieldErrors } from "@/lib/query/field-errors";
import { useServiceMutation } from "@/lib/query/use-service";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  TRACKING_TYPES,
  exerciseFormSchema,
  type Exercise,
  type ExerciseInput,
  type Muscle,
} from "@/lib/schemas/exercise";

const TRACKING_LABELS: Record<(typeof TRACKING_TYPES)[number], string> = {
  weight_reps: "Ağırlık + tekrar",
  bodyweight_reps: "Vücut ağırlığı (tekrar)",
  duration: "Süre",
};

const BLANK: ExerciseInput = {
  title: "",
  description: "",
  cues: [""],
  category: "compound",
  trackingType: "weight_reps",
  equipment: "barbell",
  targetMuscle: "chest",
  secondaryMuscles: [],
  loadIncrementKg: 2.5,
  minLoadKg: 0,
};

/** Düzenlemede kimlik forma girmez: şemada yok. */
function toInput({ id: _id, ...rest }: Exercise): ExerciseInput {
  return rest;
}

/** Açılır liste: Base UI `items` ile seçili değerin Türkçe etiketini gösterir. */
function LabeledSelect<T extends string>({
  id,
  value,
  labels,
  onChange,
}: {
  id: string;
  value: T | undefined;
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  const items = Object.entries(labels).map(([key, label]) => ({
    value: key,
    label: label as string,
  }));
  return (
    <Select
      items={items}
      value={value ?? null}
      onValueChange={(next) => next && onChange(next as T)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Egzersiz ekleme/düzenleme formu — kendi sayfasında (modal değil, SPEC §6).
 * İpuçları `FieldArray` ile satır satır. Kaydedince PT'nin repo'sundaki
 * `data/exercises.json` güncellenir, liste `invalidate` ile tazelenir.
 */
export function ExerciseForm({ editing }: { editing: Exercise | null }) {
  const router = useRouter();
  const form = useForm({
    schema: exerciseFormSchema,
    initialInput: editing ? toInput(editing) : BLANK,
  });

  const save = useServiceMutation({
    fn: (values: ExerciseInput) =>
      fetchJson<{ id: string }>("/api/exercises", {
        method: "POST",
        // Yeni egzersizde kimlik sunucuda başlıktan üretilir; düzenlemede mevcut kimlik gider.
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      }),
    invalidate: [["exercises"]],
    notify: {
      success: editing ? "Egzersiz güncellendi." : "Egzersiz eklendi.",
    },
    onError: (error) => applyFieldErrors(form as never, error),
    // Yeni kayıtta sunucunun ürettiği kimlikle detay sayfasına geçilir.
    onSuccess: ({ id }) => {
      router.push(`/dashboard/exercises/${id}`);
      router.refresh();
    },
  });

  // Ekranda karşılığı olmayan bir doğrulama hatası kalırsa form sessizce gönderilmez;
  // bu özet o durumu görünür kılar.
  const hiddenError = getDeepError(form);

  return (
    <Form
      of={form}
      className="grid gap-x-8 gap-y-6 lg:grid-cols-2"
      onSubmit={(values) =>
        save.mutateAsync(values as ExerciseInput).catch(() => undefined)
      }
    >
      {/* Sol sütun: hareketin kendisi — ad, açıklama, ipuçları. */}
      <div className="flex flex-col gap-5">
        <FormField of={form} path={["title"]}>
          {(field) => (
            <Field data-invalid={Boolean(field.errors) || undefined}>
              <FieldLabel htmlFor="title">Egzersiz adı</FieldLabel>
              <Input
                {...field.props}
                id="title"
                value={field.input ?? ""}
                aria-invalid={Boolean(field.errors) || undefined}
              />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>

        <FormField of={form} path={["description"]}>
          {(field) => (
            <Field data-invalid={Boolean(field.errors) || undefined}>
              <FieldLabel htmlFor="description">Açıklama</FieldLabel>
              <Textarea
                {...field.props}
                id="description"
                value={field.input ?? ""}
                placeholder="Hareketin ne işe yaradığı, kısa."
                rows={2}
              />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>

        <Field>
          <FieldLabel>İpuçları</FieldLabel>
          <FieldArray of={form} path={["cues"]}>
            {(array) => (
              <div className="flex flex-col gap-2">
                {array.items.map((item, index) => (
                  <div key={item} className="flex gap-2">
                    <FormField of={form} path={["cues", index]}>
                      {(field) => (
                        <Input
                          {...field.props}
                          value={field.input ?? ""}
                          placeholder="Kürek kemiklerini sıkıştır"
                          aria-label={`${index + 1}. ipucu`}
                        />
                      )}
                    </FormField>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${index + 1}. ipucunu sil`}
                      onClick={() =>
                        remove(form, { path: ["cues"], at: index })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                {array.items.length < 6 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      insert(form, { path: ["cues"], initialInput: "" })
                    }
                  >
                    <Plus data-icon="inline-start" />
                    İpucu ekle
                  </Button>
                ) : null}
              </div>
            )}
          </FieldArray>
        </Field>
      </div>

      {/* Sağ sütun: sınıflandırma — kas, ekipman, tür, kayıt, yük. */}
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField of={form} path={["targetMuscle"]}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="targetMuscle">Hedef kas</FieldLabel>
                <LabeledSelect
                  id="targetMuscle"
                  value={field.input}
                  labels={MUSCLE_LABELS}
                  onChange={(value) =>
                    setInput(form, { path: ["targetMuscle"], input: value })
                  }
                />
              </Field>
            )}
          </FormField>
          <FormField of={form} path={["equipment"]}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="equipment">Ekipman</FieldLabel>
                <LabeledSelect
                  id="equipment"
                  value={field.input}
                  labels={EQUIPMENT_LABELS}
                  onChange={(value) =>
                    setInput(form, { path: ["equipment"], input: value })
                  }
                />
              </Field>
            )}
          </FormField>
          <FormField of={form} path={["category"]}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="category">Tür</FieldLabel>
                <LabeledSelect
                  id="category"
                  value={field.input}
                  labels={CATEGORY_LABELS}
                  onChange={(value) =>
                    setInput(form, { path: ["category"], input: value })
                  }
                />
              </Field>
            )}
          </FormField>
          <FormField of={form} path={["trackingType"]}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="trackingType">Kayıt türü</FieldLabel>
                <LabeledSelect
                  id="trackingType"
                  value={field.input}
                  labels={TRACKING_LABELS}
                  onChange={(value) =>
                    setInput(form, { path: ["trackingType"], input: value })
                  }
                />
              </Field>
            )}
          </FormField>
        </div>

        <FormField of={form} path={["secondaryMuscles"]}>
          {(field) => (
            <Field data-invalid={Boolean(field.errors) || undefined}>
              <FieldLabel>Yardımcı kaslar</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                className="flex-wrap justify-start"
                value={(field.input ?? []) as Muscle[]}
                onValueChange={(value) =>
                  setInput(form, {
                    path: ["secondaryMuscles"],
                    input: value as Muscle[],
                  })
                }
              >
                {MUSCLES.map((muscle) => (
                  <ToggleGroupItem key={muscle} value={muscle}>
                    {MUSCLE_LABELS[muscle]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField of={form} path={["loadIncrementKg"]}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="loadIncrementKg">Artış (kg)</FieldLabel>
                <Input
                  {...field.props}
                  id="loadIncrementKg"
                  type="number"
                  step="0.5"
                  className="tabular"
                  value={field.input ?? 0}
                />
                <FieldDescription>
                  Bir sonraki sette önerilecek artış.
                </FieldDescription>
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>
          <FormField of={form} path={["minLoadKg"]}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="minLoadKg">Taban ağırlık (kg)</FieldLabel>
                <Input
                  {...field.props}
                  id="minLoadKg"
                  type="number"
                  step="0.5"
                  className="tabular"
                  value={field.input ?? 0}
                />
                <FieldDescription>
                  Bar ya da aletin kendi ağırlığı.
                </FieldDescription>
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>
        </div>
      </div>

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
          render={
            <Link
              href={
                editing
                  ? `/dashboard/exercises/${editing.id}`
                  : "/dashboard/exercises"
              }
            />
          }
        >
          Vazgeç
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </Form>
  );
}

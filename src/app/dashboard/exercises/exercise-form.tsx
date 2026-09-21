"use client";

import { useEffect, useRef, useState } from "react";
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
import { ImageSquare, Plus, WarningCircle, X } from "@phosphor-icons/react";
import { toast } from "sonner";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VideoEmbed } from "@/components/video-embed";
import { exerciseImageUrl } from "@/lib/exercise-media";
import { ApiError, fetchJson } from "@/lib/query/errors";
import { applyFieldErrors } from "@/lib/query/field-errors";
import { useServiceMutation } from "@/lib/query/use-service";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EXERCISE_IMAGE_MAX_BYTES,
  EXERCISE_IMAGE_TYPES,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  TRACKING_TYPES,
  exerciseFormSchema,
  type Exercise,
  type ExerciseInput,
  type Muscle,
} from "@/lib/schemas/exercise";
import { parseVideoUrl, videoUrl } from "@/lib/video";

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
  videoUrl: "",
};

/**
 * Düzenlemede kimlik ve görsel forma girmez (şemada yok); video, yapıştırılan
 * bağlantı olarak gösterilir.
 */
function toInput({ id: _id, image: _image, video, ...rest }: Exercise): ExerciseInput {
  return { ...rest, videoUrl: video ? videoUrl(video) : "" };
}

/** Görselde ne yapılacak: olduğu gibi kalsın, yenisi yüklensin ya da kaldırılsın. */
type ImageChange =
  | { kind: "keep" }
  | { kind: "upload"; file: File }
  | { kind: "remove" };

/**
 * Görsel seçimi. Tür ve boyut tarayıcıda denetlenir (sunucu da denetler):
 * 1 MB'tan büyük görsel kabul edilmez. Dosya "Kaydet"te, egzersiz kaydedildikten
 * sonra yüklenir.
 */
function ImageField({
  currentUrl,
  change,
  onChange,
  error,
  onError,
}: {
  currentUrl: string | null;
  change: ImageChange;
  onChange: (change: ImageChange) => void;
  error: string | null;
  onError: (error: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Seçilen dosyanın önizlemesi; değişince ya da çıkınca bellekten bırakılır.
  useEffect(() => {
    if (change.kind !== "upload") return setPreview(null);
    const url = URL.createObjectURL(change.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [change]);

  const shown =
    change.kind === "upload" ? preview : change.kind === "keep" ? currentUrl : null;

  function pick(file: File | undefined) {
    if (!file) return;
    if (!EXERCISE_IMAGE_TYPES[file.type]) {
      onError("Yalnız PNG, JPG ya da WebP seçebilirsin.");
      return;
    }
    if (file.size > EXERCISE_IMAGE_MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toLocaleString("tr-TR", {
        maximumFractionDigits: 1,
      });
      onError(`Görsel ${mb} MB; en fazla 1 MB olabilir. Daha küçük bir görsel seç.`);
      return;
    }
    onError(null);
    onChange({ kind: "upload", file });
  }

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor="image">Görsel</FieldLabel>
      <div className="flex items-center gap-3">
        {shown ? (
          // Özel repo'dan uygulama üzerinden gelir; Next görsel iyileştiricisi oturum çerezini taşımaz.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt="Egzersiz görseli önizlemesi"
            className="size-24 shrink-0 rounded-lg border object-cover"
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <ImageSquare data-icon="inline-start" />
            {shown ? "Değiştir" : "Görsel seç"}
          </Button>
          {shown ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onError(null);
                onChange(currentUrl ? { kind: "remove" } : { kind: "keep" });
              }}
            >
              Kaldır
            </Button>
          ) : null}
          {change.kind !== "keep" && currentUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ kind: "keep" })}
            >
              Geri al
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        id="image"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          pick(event.target.files?.[0]);
          // Aynı dosya yeniden seçilebilsin.
          event.target.value = "";
        }}
      />
      <FieldDescription>PNG, JPG ya da WebP; en fazla 1 MB.</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
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

const MUSCLE_ITEMS = MUSCLES.map((muscle) => ({
  value: muscle,
  label: MUSCLE_LABELS[muscle],
}));

/** Hedef kas: 24 kas bölgelere göre gruplu (Göğüs, Omuz, Sırt…). */
function MuscleSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Muscle | undefined;
  onChange: (value: Muscle) => void;
}) {
  return (
    <Select
      items={MUSCLE_ITEMS}
      value={value ?? null}
      onValueChange={(next) => next && onChange(next as Muscle)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MUSCLE_GROUPS.map((group) => (
          <SelectGroup key={group.id}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.muscles.map((muscle) => (
              <SelectItem key={muscle} value={muscle}>
                {MUSCLE_LABELS[muscle]}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Yardımcı kaslar bölge bölge; kardiyo yardımcı kas olamaz. */
const SECONDARY_GROUPS = MUSCLE_GROUPS.filter((group) => group.id !== "other");

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
  const [image, setImage] = useState<ImageChange>({ kind: "keep" });
  const [imageError, setImageError] = useState<string | null>(null);
  const currentImageUrl = editing ? exerciseImageUrl(editing) : null;

  const save = useServiceMutation({
    fn: async (values: ExerciseInput) => {
      const { videoUrl: link, ...rest } = values;
      const video = link ? (parseVideoUrl(link) ?? undefined) : undefined;
      const { id } = await fetchJson<{ id: string }>("/api/exercises", {
        method: "POST",
        // Yeni egzersizde kimlik sunucuda başlıktan üretilir; düzenlemede mevcut kimlik gider.
        body: JSON.stringify({ ...rest, video, ...(editing ? { id: editing.id } : {}) }),
      });

      // Görsel ayrı uca gider. Egzersiz kaydedildiyse görsel hatası kaydı geri almaz:
      // kullanıcı düzenleme sayfasına düşer ve yalnız görseli yeniden dener.
      try {
        if (image.kind === "upload") {
          const body = new FormData();
          body.set("image", image.file);
          await fetchJson(`/api/exercises/${id}/image`, { method: "POST", body });
        } else if (image.kind === "remove") {
          await fetchJson(`/api/exercises/${id}/image`, { method: "DELETE" });
        }
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Görsel yüklenemedi.";
        return { id, imageFailed: message };
      }
      return { id, imageFailed: null };
    },
    invalidate: [["exercises"]],
    notify: {
      success: editing ? "Egzersiz güncellendi." : "Egzersiz eklendi.",
    },
    onError: (error) => applyFieldErrors(form as never, error),
    // Yeni kayıtta sunucunun ürettiği kimlikle detay sayfasına geçilir.
    onSuccess: ({ id, imageFailed }) => {
      if (imageFailed) {
        toast.error(`Egzersiz kaydedildi ama görsel yüklenemedi: ${imageFailed}`);
        router.push(`/dashboard/exercises/${id}/edit`);
      } else {
        router.push(`/dashboard/exercises/${id}`);
      }
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

        <FormField of={form} path={["videoUrl"]}>
          {(field) => {
            const video = field.input ? parseVideoUrl(field.input) : null;
            return (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="videoUrl">Video bağlantısı</FieldLabel>
                <Input
                  {...field.props}
                  id="videoUrl"
                  inputMode="url"
                  autoComplete="off"
                  value={field.input ?? ""}
                  placeholder="https://www.youtube.com/watch?v=…"
                  aria-invalid={Boolean(field.errors) || undefined}
                />
                <FieldDescription>
                  {field.input && !video && !field.errors
                    ? "Bağlantı tanınmadı: YouTube ya da Vimeo video bağlantısı olmalı."
                    : "YouTube ya da Vimeo. Kendi videonu YouTube'a “liste dışı” yükleyip bağlantısını yapıştırabilirsin."}
                </FieldDescription>
                <FieldError>{field.errors?.[0]}</FieldError>
                {video ? (
                  <VideoEmbed
                    provider={video.provider}
                    id={video.id}
                    title="Video önizlemesi"
                  />
                ) : null}
              </Field>
            );
          }}
        </FormField>

        <ImageField
          currentUrl={currentImageUrl}
          change={image}
          onChange={setImage}
          error={imageError}
          onError={setImageError}
        />
      </div>

      {/* Sağ sütun: sınıflandırma — kas, ekipman, tür, kayıt, yük. */}
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField of={form} path={["targetMuscle"]}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="targetMuscle">Hedef kas</FieldLabel>
                <MuscleSelect
                  id="targetMuscle"
                  value={field.input}
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
          {(field) => {
            const selected = (field.input ?? []) as Muscle[];
            return (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel>Yardımcı kaslar</FieldLabel>
                <div className="flex flex-col gap-3">
                  {SECONDARY_GROUPS.map((group) => (
                    <div key={group.id} className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {group.label}
                      </span>
                      <ToggleGroup
                        multiple
                        variant="outline"
                        size="sm"
                        className="flex-wrap justify-start"
                        aria-label={`Yardımcı kaslar: ${group.label}`}
                        value={selected.filter((muscle) =>
                          group.muscles.includes(muscle),
                        )}
                        onValueChange={(value) => {
                          // Bu bölgenin seçimi değişti; diğer bölgeler olduğu gibi kalır.
                          const next = new Set([
                            ...selected.filter(
                              (muscle) => !group.muscles.includes(muscle),
                            ),
                            ...(value as Muscle[]),
                          ]);
                          setInput(form, {
                            path: ["secondaryMuscles"],
                            input: MUSCLES.filter((muscle) => next.has(muscle)),
                          });
                        }}
                      >
                        {group.muscles.map((muscle) => (
                          <ToggleGroupItem key={muscle} value={muscle}>
                            {MUSCLE_LABELS[muscle]}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  ))}
                </div>
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            );
          }}
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
                  className="tabular-nums"
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
                  className="tabular-nums"
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

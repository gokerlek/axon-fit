"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Field as FormField,
  FieldArray,
  Form,
  getDeepError,
  getInput,
  insert,
  remove,
  setInput,
  useForm,
} from "@formisch/react";
import { Heartbeat, Plus, WarningCircle, X } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { GroupedSelect, LabeledSelect } from "@/components/labeled-select";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { VideoEmbed } from "@/components/video-embed";
import { MuscleMap } from "@/components/muscle-map/muscle-map";
import { PATTERN_LABELS } from "@/lib/alternatives";
import {
  ATTACHMENT_LABELS,
  DEVICE_KIND_LABELS,
  DEVICE_KINDS,
  describeDeviceLoads,
  deviceLoads,
  KIND_EQUIPMENT,
  loadSpecFor,
} from "@/lib/device-loads";
import { GRIP_LABELS, GRIP_WIDTH_LABELS } from "@/lib/grips";
import type { Device } from "@/lib/schemas/device";
import {
  isBodyMuscle,
  ROLE_INTENSITY,
  ROLE_LABELS,
  type MuscleIntensity,
  type MuscleRole,
} from "@/lib/muscles";
import {
  defaultRule,
  describeRule,
  EQUIPMENT_LOAD_DEFAULTS,
  progressionOf,
  PROGRESSION_LABELS,
  RIR_LABELS,
  type ProgressionRule,
} from "@/lib/progression";
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
import { parseVideoUrl, videoUrl } from "@/lib/video";

const TRACKING_LABELS: Record<(typeof TRACKING_TYPES)[number], string> = {
  weight_reps: "Ağırlık + tekrar",
  bodyweight_reps: "Vücut ağırlığı (tekrar)",
  duration: "Süre",
};

/** Formun başlangıcı: yeni egzersizde hareket kalıbı boş gelir, seçilmeden kaydedilmez. */
type FormStart = Omit<ExerciseInput, "pattern"> & {
  pattern?: ExerciseInput["pattern"];
};

const BLANK: FormStart = {
  title: "",
  description: "",
  cues: [""],
  category: "compound",
  trackingType: "weight_reps",
  equipment: "barbell",
  primaryMuscles: [],
  stabilizerMuscles: [],
  secondaryMuscles: [],
  ...EQUIPMENT_LOAD_DEFAULTS.barbell,
  progression: defaultRule("compound", "weight_reps"),
  videoUrl: "",
};

/**
 * Düzenlemede kimlik forma girmez (şemada yok); video, yapıştırılan bağlantı olarak
 * gösterilir; kuralı olmayan egzersizde türünün varsayılan kuralı açık yazılır.
 */
function toInput({
  id: _id,
  video,
  alternatives: _alternatives,
  ...rest
}: Exercise): FormStart {
  return {
    ...rest,
    progression: progressionOf(rest),
    videoUrl: video ? videoUrl(video) : "",
  };
}

const RIR_ITEMS: Record<string, string> = Object.fromEntries(
  Object.entries(RIR_LABELS).map(([rir, label]) => [
    rir,
    rir === "2" ? `${label} (önerilen)` : label,
  ]),
);

function sameRule(a: ProgressionRule | undefined, b: ProgressionRule): boolean {
  return (
    a?.scheme === b.scheme &&
    a.targetMin === b.targetMin &&
    a.targetMax === b.targetMax &&
    a.targetRir === b.targetRir
  );
}

/**
 * Egzersiz ekleme/düzenleme formu — kendi sayfasında (modal değil, SPEC §6).
 * İpuçları `FieldArray` ile satır satır. Kaydedince PT'nin repo'sundaki
 * `data/exercises.json` güncellenir, liste `invalidate` ile tazelenir.
 */
export function ExerciseForm({
  editing,
  devices,
}: {
  editing: Exercise | null;
  /** Seçilebilir cihazlar (hazır katalog + PT'nin cihazları). */
  devices: Device[];
}) {
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const deviceGroups = DEVICE_KINDS.map((kind) => ({
    label: DEVICE_KIND_LABELS[kind],
    options: devices
      .filter((device) => device.kind === kind)
      .map((device) => ({ value: device.id, label: device.name })),
  })).filter((group) => group.options.length > 0);
  const router = useRouter();
  const form = useForm({
    schema: exerciseFormSchema,
    initialInput: editing ? toInput(editing) : BLANK,
  });

  const save = useServiceMutation({
    fn: (values: ExerciseInput) => {
      const { videoUrl: link, ...rest } = values;
      const video = link ? (parseVideoUrl(link) ?? undefined) : undefined;
      return fetchJson<{ id: string }>("/api/exercises", {
        method: "POST",
        // Yeni egzersizde kimlik sunucuda başlıktan üretilir; düzenlemede mevcut kimlik gider.
        body: JSON.stringify({ ...rest, video, ...(editing ? { id: editing.id } : {}) }),
      });
    },
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
      </div>

      {/* Sağ sütun: sınıflandırma — kas, ekipman, tür, kayıt, yük. */}
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField of={form} path={["pattern"]}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="pattern">Hareket kalıbı</FieldLabel>
                <LabeledSelect
                  id="pattern"
                  value={field.input}
                  labels={PATTERN_LABELS}
                  placeholder="Seç"
                  onChange={(value) =>
                    setInput(form, { path: ["pattern"], input: value })
                  }
                />
                <FieldDescription>Muadil önerileri buna göre sıralanır.</FieldDescription>
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>
          <FormField of={form} path={["deviceId"]}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="deviceId">Cihaz</FieldLabel>
                <GroupedSelect
                  id="deviceId"
                  value={field.input ?? ""}
                  groups={deviceGroups}
                  empty="Cihazsız"
                  onChange={(value) => {
                    setInput(form, { path: ["deviceId"], input: value || undefined });
                    // Ekipman cihazın türünden gelir.
                    const device = deviceById.get(value);
                    if (device) setInput(form, { path: ["equipment"], input: KIND_EQUIPMENT[device.kind] });
                  }}
                />
                <FieldDescription>Ağırlık önerileri cihazın ayarlanabilen ağırlıklarından seçilir.</FieldDescription>
              </Field>
            )}
          </FormField>
          {/* Aparat yalnız cihazında aparat tanımlıysa görünür. */}
          <FormField of={form} path={["deviceId"]}>
            {(deviceField) => {
              const attachments = deviceField.input ? (deviceById.get(deviceField.input)?.attachments ?? []) : [];
              if (attachments.length === 0) return <></>;
              return (
                <FormField of={form} path={["attachment"]}>
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="attachment">Aparat</FieldLabel>
                      <GroupedSelect
                        id="attachment"
                        value={field.input ?? ""}
                        groups={[
                          {
                            label: "Aparatlar",
                            options: attachments.map((attachment) => ({
                              value: attachment,
                              label: ATTACHMENT_LABELS[attachment],
                            })),
                          },
                        ]}
                        empty="Belirtilmemiş"
                        onChange={(value) =>
                          setInput(form, {
                            path: ["attachment"],
                            input: (value || undefined) as ExerciseInput["attachment"],
                          })
                        }
                      />
                    </Field>
                  )}
                </FormField>
              );
            }}
          </FormField>
          <FormField of={form} path={["grip"]}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="grip">Tutuş</FieldLabel>
                <GroupedSelect
                  id="grip"
                  value={field.input ?? ""}
                  groups={[
                    {
                      label: "Tutuş",
                      options: Object.entries(GRIP_LABELS).map(([value, label]) => ({ value, label })),
                    },
                  ]}
                  empty="Belirtilmemiş"
                  onChange={(value) =>
                    setInput(form, { path: ["grip"], input: (value || undefined) as ExerciseInput["grip"] })
                  }
                />
              </Field>
            )}
          </FormField>
          <FormField of={form} path={["gripWidth"]}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="gripWidth">Tutuş genişliği</FieldLabel>
                <GroupedSelect
                  id="gripWidth"
                  value={field.input ?? ""}
                  groups={[
                    {
                      label: "Genişlik",
                      options: Object.entries(GRIP_WIDTH_LABELS).map(([value, label]) => ({ value, label })),
                    },
                  ]}
                  empty="Belirtilmemiş"
                  onChange={(value) =>
                    setInput(form, { path: ["gripWidth"], input: (value || undefined) as ExerciseInput["gripWidth"] })
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
                  onChange={(value) => {
                    setInput(form, { path: ["equipment"], input: value });
                    // Adım ve taban ekipmana bağlı; PT sonra değiştirebilir.
                    const load = EQUIPMENT_LOAD_DEFAULTS[value];
                    setInput(form, { path: ["loadStepKg"], input: load.loadStepKg });
                    setInput(form, { path: ["minLoadKg"], input: load.minLoadKg });
                  }}
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
                  onChange={(value) => {
                    const tracking = getInput(form, { path: ["trackingType"] }) ?? "weight_reps";
                    const current = getInput(form, { path: ["progression"] }) as
                      | ProgressionRule
                      | undefined;
                    const wasDefault = sameRule(
                      current,
                      defaultRule(field.input ?? "compound", tracking),
                    );
                    setInput(form, { path: ["category"], input: value });
                    // Elle ayarlanmış kurala dokunma; varsayılansa yeni türün varsayılanı gelsin.
                    if (wasDefault) {
                      setInput(form, {
                        path: ["progression"],
                        input: defaultRule(value, tracking),
                      });
                    }
                  }}
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
                  onChange={(value) => {
                    setInput(form, { path: ["trackingType"], input: value });
                    // Birim değişir (tekrar ↔ saniye): aralık yeni türün varsayılanına döner.
                    const category = getInput(form, { path: ["category"] }) ?? "compound";
                    setInput(form, {
                      path: ["progression"],
                      input: defaultRule(category, value),
                    });
                  }}
                />
              </Field>
            )}
          </FormField>
        </div>

        <FormField of={form} path={["primaryMuscles"]}>
          {(primaryField) => (
            <FormField of={form} path={["secondaryMuscles"]}>
              {(secondaryField) => (
                <FormField of={form} path={["stabilizerMuscles"]}>
                  {(stabilizerField) => {
                    // Her kas tek seviyede: hedef > yardımcı > dengeleyici.
                    const primary = (primaryField.input ?? []) as Muscle[];
                    const secondary = ((secondaryField.input ?? []) as Muscle[]).filter(
                      (muscle) => !primary.includes(muscle),
                    );
                    const stabilizer = (
                      (stabilizerField.input ?? []) as Muscle[]
                    ).filter(
                      (muscle) => !primary.includes(muscle) && !secondary.includes(muscle),
                    );
                    const lists: Record<MuscleRole, Muscle[]> = {
                      primary,
                      secondary,
                      stabilizer,
                    };
                    const roleOf = (muscle: Muscle): MuscleRole | null =>
                      primary.includes(muscle)
                        ? "primary"
                        : secondary.includes(muscle)
                          ? "secondary"
                          : stabilizer.includes(muscle)
                            ? "stabilizer"
                            : null;

                    const intensity: MuscleIntensity = {};
                    for (const role of ["stabilizer", "secondary", "primary"] as const) {
                      for (const muscle of lists[role]) {
                        if (isBodyMuscle(muscle)) intensity[muscle] = ROLE_INTENSITY[role];
                      }
                    }

                    // Kaslar sabit sırada saklanır.
                    const save = (next: Record<MuscleRole, Muscle[]>) => {
                      setInput(form, {
                        path: ["primaryMuscles"],
                        input: MUSCLES.filter((muscle) => next.primary.includes(muscle)),
                      });
                      setInput(form, {
                        path: ["secondaryMuscles"],
                        input: MUSCLES.filter((muscle) => next.secondary.includes(muscle)),
                      });
                      setInput(form, {
                        path: ["stabilizerMuscles"],
                        input: MUSCLES.filter((muscle) => next.stabilizer.includes(muscle)),
                      });
                    };
                    const setRole = (muscle: Muscle, role: MuscleRole | null) => {
                      const without = (list: Muscle[]) => list.filter((item) => item !== muscle);
                      const next = {
                        primary: without(primary),
                        secondary: without(secondary),
                        stabilizer: without(stabilizer),
                      };
                      if (role) next[role] = [...next[role], muscle];
                      save(next);
                    };
                    // Dokunuş sırası: boş → hedef → yardımcı → dengeleyici → boş.
                    const NEXT: Record<MuscleRole | "none", MuscleRole | null> = {
                      none: "primary",
                      primary: "secondary",
                      secondary: "stabilizer",
                      stabilizer: null,
                    };
                    const cycle = (muscle: Muscle) => setRole(muscle, NEXT[roleOf(muscle) ?? "none"]);

                    const errors =
                      primaryField.errors ?? secondaryField.errors ?? stabilizerField.errors;
                    const bodySelected = [...primary, ...secondary, ...stabilizer].filter(
                      isBodyMuscle,
                    );

                    return (
                      <Field data-invalid={Boolean(errors) || undefined}>
                        <FieldLabel>Çalışan kaslar</FieldLabel>
                        <FieldDescription>
                          Kasa dokun: hedef (tam renk) → yardımcı (orta) → dengeleyici
                          (açık) → kaldır. Birden çok kas aynı anda hedef olabilir.
                        </FieldDescription>
                        <MuscleMap
                          layout="split"
                          intensity={intensity}
                          selected={bodySelected}
                          onToggle={cycle}
                          describe={(muscle) => {
                            const role = roleOf(muscle);
                            const next = NEXT[role ?? "none"];
                            return `${MUSCLE_LABELS[muscle]} · ${
                              role ? ROLE_LABELS[role].toLocaleLowerCase("tr") : "seçili değil"
                            } — dokun: ${
                              next ? ROLE_LABELS[next].toLocaleLowerCase("tr") + " yap" : "kaldır"
                            }`;
                          }}
                          hint="Kasa dokunarak seç"
                          bodyClassName="h-[22rem] lg:h-[26rem]"
                          label="Çalışan kaslar"
                        />
                        <Toggle
                          variant="outline"
                          size="sm"
                          className="self-start"
                          pressed={primary.includes("cardio")}
                          onPressedChange={(pressed) =>
                            setRole("cardio", pressed ? "primary" : null)
                          }
                        >
                          <Heartbeat data-icon="inline-start" />
                          Kardiyo hareketi
                        </Toggle>
                        {(["primary", "secondary", "stabilizer"] as const).map((role) =>
                          lists[role].length > 0 ? (
                            <div
                              key={role}
                              className="flex flex-wrap items-center gap-1.5"
                              aria-label={`${ROLE_LABELS[role]} kaslar`}
                            >
                              <span className="w-20 text-xs text-muted-foreground">
                                {ROLE_LABELS[role]}
                              </span>
                              {lists[role].map((muscle) => (
                                <Button
                                  key={muscle}
                                  type="button"
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => setRole(muscle, null)}
                                  aria-label={`${MUSCLE_LABELS[muscle]} kasını kaldır`}
                                >
                                  {MUSCLE_LABELS[muscle]}
                                  <X data-icon="inline-end" />
                                </Button>
                              ))}
                            </div>
                          ) : null,
                        )}
                        <FieldError>{errors?.[0]}</FieldError>
                      </Field>
                    );
                  }}
                </FormField>
              )}
            </FormField>
          )}
        </FormField>

        <FormField of={form} path={["trackingType"]}>
          {(trackingField) => (
            <FieldSet>
              <FieldLegend>Yük ve ilerleme</FieldLegend>
              {trackingField.input === "weight_reps" ? (
                <FormField of={form} path={["deviceId"]}>
                  {(deviceField) => {
                    const device = deviceField.input ? deviceById.get(deviceField.input) : undefined;
                    if (device && deviceLoads(device)?.length) {
                      return (
                        <Field>
                          <FieldLabel>Ağırlıklar cihazdan</FieldLabel>
                          <FieldDescription>
                            {device.name}: {describeDeviceLoads(device)}.{" "}
                            <Link href={`/dashboard/devices/${device.id}`} className="underline underline-offset-4">
                              Cihazı gör
                            </Link>
                          </FieldDescription>
                        </Field>
                      );
                    }
                    return (
                <div className="grid gap-4 sm:grid-cols-2">
                      <FormField of={form} path={["loadStepKg"]}>
                        {(field) => (
                          <Field data-invalid={Boolean(field.errors) || undefined}>
                            <FieldLabel htmlFor="loadStepKg">Ağırlık adımı (kg)</FieldLabel>
                            <Input
                              {...field.props}
                              id="loadStepKg"
                              type="number"
                              // Formisch alan değerini metin verir; şema sayı bekler.
                              onChange={(event) =>
                                setInput(form, {
                                  path: ["loadStepKg"],
                                  input: event.currentTarget.valueAsNumber,
                                })
                              }
                              step="0.5"
                              className="tabular-nums"
                              value={field.input ?? 0}
                            />
                            <FieldDescription>
                              Aletin izin verdiği en küçük artış; öneriler bu adıma
                              yuvarlanır.
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
                              // Formisch alan değerini metin verir; şema sayı bekler.
                              onChange={(event) =>
                                setInput(form, {
                                  path: ["minLoadKg"],
                                  input: event.currentTarget.valueAsNumber,
                                })
                              }
                              step="0.5"
                              className="tabular-nums"
                              value={field.input ?? 0}
                            />
                            <FieldDescription>
                              Bar ya da aletin kendi ağırlığı; öneri bunun altına inmez.
                            </FieldDescription>
                            <FieldError>{field.errors?.[0]}</FieldError>
                          </Field>
                        )}
                      </FormField>
                    </div>
                    );
                  }}
                </FormField>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField of={form} path={["progression", "scheme"]}>
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="progressionScheme">İlerleme</FieldLabel>
                      <LabeledSelect
                        id="progressionScheme"
                        value={field.input}
                        labels={PROGRESSION_LABELS}
                        onChange={(value) =>
                          setInput(form, {
                            path: ["progression", "scheme"],
                            input: value,
                          })
                        }
                      />
                    </Field>
                  )}
                </FormField>
                {trackingField.input !== "duration" ? (
                  <FormField of={form} path={["progression", "targetRir"]}>
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="targetRir">Hedef zorluk</FieldLabel>
                        <LabeledSelect
                          id="targetRir"
                          value={String(field.input ?? 2)}
                          labels={RIR_ITEMS}
                          onChange={(value) =>
                            setInput(form, {
                              path: ["progression", "targetRir"],
                              input: Number(value),
                            })
                          }
                        />
                      </Field>
                    )}
                  </FormField>
                ) : null}
                {(["targetMin", "targetMax"] as const).map((key) => (
                  <FormField key={key} of={form} path={["progression", key]}>
                    {(field) => (
                      <Field data-invalid={Boolean(field.errors) || undefined}>
                        <FieldLabel htmlFor={key}>
                          {key === "targetMin" ? "Hedef en az" : "Hedef en çok"} (
                          {trackingField.input === "duration" ? "sn" : "tekrar"})
                        </FieldLabel>
                        <Input
                          {...field.props}
                          id={key}
                          type="number"
                          onChange={(event) =>
                            setInput(form, {
                              path: ["progression", key],
                              input: event.currentTarget.valueAsNumber,
                            })
                          }
                          step="1"
                          min="1"
                          className="tabular-nums"
                          value={field.input ?? 0}
                        />
                        <FieldError>{field.errors?.[0]}</FieldError>
                      </Field>
                    )}
                  </FormField>
                ))}
              </div>

              {/* Kuralın düz cümleyle anlatımı: PT neyi seçtiğini görsün. */}
              <FormField of={form} path={["progression"]}>
                {(ruleField) => (
                  <FormField of={form} path={["loadStepKg"]}>
                    {(stepField) => (
                      <FormField of={form} path={["deviceId"]}>
                        {(deviceField) => {
                          const rule = ruleField.input as ProgressionRule | undefined;
                          // Formisch alanı her zaman bir öğe döndürmeli.
                          if (!rule?.targetMin || !rule.targetMax) return <></>;
                          const device = deviceField.input ? deviceById.get(deviceField.input) : undefined;
                          const spec = loadSpecFor(
                            {
                              trackingType: trackingField.input ?? "weight_reps",
                              loadStepKg: Number(stepField.input ?? 0),
                              minLoadKg: 0,
                            },
                            device,
                          );
                          return <FieldDescription>{describeRule(rule, spec)}</FieldDescription>;
                        }}
                      </FormField>
                    )}
                  </FormField>
                )}
              </FormField>
            </FieldSet>
          )}
        </FormField>
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

"use client";

import Link from "next/link";
import { useState } from "react";
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
import { Heartbeat, Plus, PushPin, WarningCircle, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MedicalFields } from "./medical-fields";
import { PATTERN_LABELS } from "@/lib/alternatives";
import {
  DEVICE_KIND_LABELS,
  DEVICE_KINDS,
  describeDeviceLoads,
  deviceLoads,
  KIND_EQUIPMENT,
  loadSpecFor,
} from "@/lib/device-loads";
import { GRIP_LABELS, GRIP_WIDTH_LABELS } from "@/lib/grips";
import type { Attachment } from "@/lib/schemas/attachment";
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
import { ApiError, fetchJson } from "@/lib/query/errors";
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

/** Formda gösterilecek muadil adayı (sunucuda sıralanır). */
export type AlternativeOption = { id: string; title: string; detail: string };

/**
 * Muadiller: PT'nin sabitledikleri. Egzersiz sayfasında "Senin seçtiklerin" olarak
 * en üstte çıkar; şablonda cihaz değişince önce bunlara bakılır. Sıra, seçim sırasıdır.
 */
function AlternativesField({
  options,
  pinned,
  onToggle,
}: {
  options: AlternativeOption[];
  pinned: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <FieldSet>
      <Field>
        <FieldDescription>
          Seçmezsen uygulama zaten benzerlerini önerir; seçtiklerin listenin başında çıkar (en fazla 12).
        </FieldDescription>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((option) => {
            const isOn = pinned.includes(option.id);
            return (
              <li key={option.id}>
                <Button
                  type="button"
                  variant={isOn ? "secondary" : "outline"}
                  aria-pressed={isOn}
                  className={`h-auto w-full justify-start gap-3 p-2 text-left ${isOn ? "ring-1 ring-primary/50" : ""}`}
                  onClick={() => onToggle(option.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-normal">{option.title}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">{option.detail}</span>
                  </span>
                  {isOn ? <PushPin weight="fill" className="text-primary" /> : <Plus className="text-muted-foreground" />}
                </Button>
              </li>
            );
          })}
        </ul>
      </Field>
    </FieldSet>
  );
}

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
  attachments,
  alternativeOptions = [],
}: {
  editing: Exercise | null;
  /** Seçilebilir cihazlar (hazır katalog + PT'nin cihazları). */
  devices: Device[];
  /** Aparat havuzu; cihazın aparat kimlikleri buradan ada çevrilir. */
  attachments: Attachment[];
  /** Sabitlenebilecek muadiller (yalnız düzenlemede; yeni egzersizde henüz sıralanamaz). */
  alternativeOptions?: AlternativeOption[];
}) {
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
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
  // Muadiller şemada yok; kendi ucundan yazılır (sıra korunur).
  const [pinned, setPinned] = useState<string[]>(editing?.alternatives ?? []);
  const togglePinned = (id: string) =>
    setPinned((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : current.length >= 12 ? current : [...current, id],
    );

  const save = useServiceMutation({
    fn: async (values: ExerciseInput) => {
      const { videoUrl: link, ...rest } = values;
      const video = link ? (parseVideoUrl(link) ?? undefined) : undefined;
      const { id } = await fetchJson<{ id: string }>("/api/exercises", {
        method: "POST",
        // Yeni egzersizde kimlik sunucuda başlıktan üretilir; düzenlemede mevcut kimlik gider.
        body: JSON.stringify({ ...rest, video, ...(editing ? { id: editing.id } : {}) }),
      });
      // Muadiller ayrı uçtan yazılır. Egzersiz kaydedildiyse buradaki hata kaydı geri almaz.
      const changed = pinned.join() !== (editing?.alternatives ?? []).join();
      if (!changed) return { id, pinsFailed: null };
      try {
        await fetchJson(`/api/exercises/${id}/alternatives`, {
          method: "PUT",
          body: JSON.stringify({ alternatives: pinned }),
        });
      } catch (error) {
        return { id, pinsFailed: error instanceof ApiError ? error.message : "Muadiller kaydedilemedi." };
      }
      return { id, pinsFailed: null };
    },
    invalidate: [["exercises"]],
    notify: {
      success: editing ? "Egzersiz güncellendi." : "Egzersiz eklendi.",
    },
    onError: (error) => applyFieldErrors(form as never, error),
    // Yeni kayıtta sunucunun ürettiği kimlikle detay sayfasına geçilir.
    onSuccess: ({ id, pinsFailed }) => {
      if (pinsFailed) {
        toast.error(`Egzersiz kaydedildi ama muadiller güncellenemedi: ${pinsFailed}`);
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
      className="flex flex-col gap-6"
      onSubmit={(values) =>
        save.mutateAsync(values as ExerciseInput).catch(() => undefined)
      }
    >

      <Card>
        <CardHeader>
          <CardTitle>Hareket</CardTitle>
          <CardDescription>Danışanın gördüğü ad, açıklama, ipuçları ve video.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
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

          </div>

          <div className="flex flex-col gap-5">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ekipman, cihaz ve tutuş</CardTitle>
          <CardDescription>Hareketin neyle yapıldığı; ağırlık önerileri cihazın ayarlarından seçilir.</CardDescription>
        </CardHeader>
        <CardContent>
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
            {/* Aparat yalnız cihazına aparat takılıysa görünür; adlar havuzdan gelir. */}
            <FormField of={form} path={["deviceId"]}>
              {(deviceField) => {
                const options = (deviceField.input ? (deviceById.get(deviceField.input)?.attachments ?? []) : []).flatMap((id) => {
                  const found = attachmentById.get(id);
                  return found ? [{ value: found.id, label: found.name }] : [];
                });
                if (options.length === 0) return <></>;
                return (
                  <FormField of={form} path={["attachmentId"]}>
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="attachmentId">Aparat</FieldLabel>
                        <GroupedSelect
                          id="attachmentId"
                          value={field.input ?? ""}
                          groups={[{ label: "Aparatlar", options }]}
                          empty="Belirtilmemiş"
                          onChange={(value) =>
                            setInput(form, {
                              path: ["attachmentId"],
                              input: (value || undefined) as ExerciseInput["attachmentId"],
                            })
                          }
                        />
                        <FieldDescription>
                          Cihaza takılı aparatlar. Listede yoksa cihazı düzenleyip havuzdan ekle.
                        </FieldDescription>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Çalışan kaslar</CardTitle>
          <CardDescription>Hedef, yardımcı ve dengeleyici kaslar — haftalık yük haritası bunları sayar.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yük ve ilerleme</CardTitle>
          <CardDescription>Kayıt türü, ağırlık adımı ve bir sonraki sette ne önerileceği.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Medikal etiketler</CardTitle>
          <CardDescription>Hareketin nasıl çalıştığı: kinetik zincir, yük, açı pencereleri, kısıtlar.</CardDescription>
        </CardHeader>
        <CardContent>
          <MedicalFields form={form} />
        </CardContent>
      </Card>

      {alternativeOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Muadiller</CardTitle>
            <CardDescription>Alet doluysa ya da danışana uygun değilse yerine yapılacaklar.</CardDescription>
          </CardHeader>
          <CardContent>
            <AlternativesField options={alternativeOptions} pinned={pinned} onToggle={togglePinned} />
          </CardContent>
        </Card>
      ) : null}


      {hiddenError ? (
        <Alert variant="destructive">
          <WarningCircle />
          <AlertTitle>Form gönderilemedi</AlertTitle>
          <AlertDescription>{hiddenError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
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

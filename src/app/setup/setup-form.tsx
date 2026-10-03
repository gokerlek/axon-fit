"use client";

import { useRouter } from "next/navigation";
import {
  Field as FormField,
  Form,
  getInput,
  setInput,
  useForm,
} from "@formisch/react";
import { WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchJson } from "@/lib/query/errors";
import { applyFieldErrors } from "@/lib/query/field-errors";
import { useServiceMutation } from "@/lib/query/use-service";
import { RADIUS_OPTIONS, type RadiusKey } from "@/lib/schemas/config";
import {
  setupFormSchema,
  type SetupForm as SetupValues,
} from "@/lib/schemas/setup";
import { PaletteEditor } from "./palette-editor";
import { LogoPicker } from "./logo-picker";
import { AppearancePreview } from "./appearance-preview";
import { useAppearancePreview } from "./use-appearance-preview";

const THEMES = [
  { value: "dark", label: "Koyu" },
  { value: "light", label: "Açık" },
  { value: "system", label: "Sistem" },
] as const;

/**
 * Tema ayarı: uygulama adı, logo, ana renk, köşe yuvarlaklığı, tema.
 *
 * Seçimler tüm ekranda anında önizlenir; Kaydet PT'nin repo'suna yazar.
 * Kaydetmeden ayrılınca önceki görünüm geri gelir.
 */
export function SetupForm({
  initial,
  firstRun,
  hasLogo,
  afterSave = "/dashboard",
}: {
  initial: SetupValues;
  firstRun: boolean;
  hasLogo: boolean;
  /** Kayıttan sonra gidilecek sayfa (sihirbazda panele, ayarlarda aynı sayfada kal). */
  afterSave?: string;
}) {
  const router = useRouter();
  const form = useForm({ schema: setupFormSchema, initialInput: initial });

  const current = getInput(form) as Partial<SetupValues>;
  const rawAccent = current.accent === undefined ? initial.accent : current.accent;
  const accent = rawAccent === null || /^#[0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : initial.accent;
  const appName = current.appName ?? initial.appName;
  const appearance = useAppearancePreview(initial, accent, (current.radius ?? initial.radius ?? "subtle") as RadiusKey, current.palette);

  const save = useServiceMutation({
    fn: (values: SetupValues) =>
      fetchJson<{ ok: true }>("/api/setup/config", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    // Hata balonda değil formda kalır: veri repo'su açık ya da fork gibi Vercel'de
    // düzeltilecek bir sebep, kaybolan bir balonda okunamaz.
    notify: {
      success: firstRun ? "Kurulum tamamlandı." : "Görünüm güncellendi.",
      error: false,
    },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: (_result, values) => {
      appearance.commit(values);
      router.replace(afterSave);
      // Sunucu bileşenleri yeni ayarı okusun (başlık, renk, köşe, tema).
      router.refresh();
    },
  });

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">

      <Card>
        <CardContent>
          <Form
            of={form}
            className="flex flex-col gap-6"
            onSubmit={(values) =>
              save.mutateAsync(values as SetupValues).catch(() => undefined)
            }
          >
            <FormField of={form} path={["appName"]}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="appName">Uygulama adı</FieldLabel>
                  <Input
                    {...field.props}
                    id="appName"
                    value={field.input ?? ""}
                    maxLength={40}
                    placeholder="Ece Kaya Training"
                    aria-invalid={Boolean(field.errors) || undefined}
                  />
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>

            <LogoPicker hasLogo={hasLogo} />

            <PaletteEditor value={current.palette ?? null} onChange={(palette) => setInput(form, { path: ["palette"], input: palette })} onMode={(mode) => appearance.previewTheme(mode)} />

            <FormField of={form} path={["radius"]}>
              {(field) => (
                <Field>
                  <FieldLabel id="setup-radius-label">Köşeler</FieldLabel>
                  <ToggleGroup
                    aria-labelledby="setup-radius-label"
                    variant="outline"
                    value={[field.input ?? "subtle"]}
                    onValueChange={(value) => {
                      const next = value[0] as RadiusKey | undefined;
                      if (next)
                        setInput(form, { path: ["radius"], input: next });
                    }}
                    className="w-full"
                  >
                    {(Object.keys(RADIUS_OPTIONS) as RadiusKey[]).map((key) => (
                      <ToggleGroupItem key={key} value={key} className="flex-1 touch:h-11">
                        {RADIUS_OPTIONS[key].label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              )}
            </FormField>

            <FormField of={form} path={["theme"]}>
              {(field) => (
                <Field>
                  <FieldLabel id="setup-theme-label">Varsayılan tema</FieldLabel>
                  <ToggleGroup
                    aria-labelledby="setup-theme-label"
                    variant="outline"
                    value={[field.input ?? "dark"]}
                    onValueChange={(value) => {
                      const next = value[0] as SetupValues["theme"] | undefined;
                      if (next) {
                        appearance.previewTheme(next);
                        setInput(form, { path: ["theme"], input: next });
                      }
                    }}
                    className="w-full"
                  >
                    {THEMES.map((theme) => (
                      <ToggleGroupItem
                        key={theme.value}
                        value={theme.value}
                        className="flex-1 touch:h-11"
                      >
                        {theme.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldDescription>
                    Salonda koyu tema göz yormaz.
                  </FieldDescription>
                </Field>
              )}
            </FormField>

            {save.error ? (
              <Alert variant="destructive">
                <WarningCircle weight="fill" />
                <AlertDescription>{save.error.message}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="h-11"
              disabled={save.isPending}
            >
              {save.isPending ? <Spinner data-icon="inline-start" /> : null}
              {save.isPending
                ? "Kaydediliyor…"
                : firstRun
                  ? "Kurulumu tamamla"
                  : "Kaydet"}
            </Button>
            {firstRun && <Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate(initial)}>Görünümü şimdilik atla</Button>}
            <p className="text-center text-xs text-muted-foreground">
              Değişiklikler anında görünür. Kalıcı olması için kaydet.
            </p>
          </Form>
        </CardContent>
      </Card>
      <div className="min-w-0 xl:sticky xl:top-6"><AppearancePreview appName={appName} /></div>
    </div>
  );
}

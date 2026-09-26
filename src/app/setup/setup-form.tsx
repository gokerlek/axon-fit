"use client";

import { useRouter } from "next/navigation";
import {
  Field as FormField,
  Form,
  getInput,
  setInput,
  useForm,
} from "@formisch/react";
import { Check, WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { brandStyle, readableOn } from "@/lib/color";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/query/errors";
import { applyFieldErrors } from "@/lib/query/field-errors";
import { useServiceMutation } from "@/lib/query/use-service";
import { RADIUS_OPTIONS, type RadiusKey } from "@/lib/schemas/config";
import {
  ACCENT_PRESETS,
  setupFormSchema,
  type SetupForm as SetupValues,
} from "@/lib/schemas/setup";
import { LogoPicker } from "./logo-picker";

/**
 * "Tema" seçeneğinin düğme değeri. Formda `null`dır; düğmede boş olmayan bir değer
 * gerekir: Base UI `Toggle` boş değeri (`""`) kendi ürettiği bir kimlikle değiştirir,
 * o zaman seçenek hiç seçili görünmez ve seçilince forma geçersiz renk gider.
 */
const THEME_ACCENT = "theme";

const THEMES = [
  { value: "dark", label: "Koyu" },
  { value: "light", label: "Açık" },
  { value: "system", label: "Sistem" },
] as const;

/**
 * Tema ayarı: uygulama adı, logo, ana renk, köşe yuvarlaklığı, tema.
 *
 * Kaydedince PT'nin kendi repo'suna commit edilir. Renk ve köşe seçimi üstteki
 * önizlemede anında görünür (tema değişkenleri önizleme kutusuna uygulanır).
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
    onSuccess: () => {
      router.replace(afterSave);
      // Sunucu bileşenleri yeni ayarı okusun (başlık, renk, köşe, tema).
      router.refresh();
    },
  });

  const current = getInput(form) as Partial<SetupValues>;
  const accent = current.accent === undefined ? initial.accent : current.accent;
  const appName = current.appName ?? initial.appName;
  const radius =
    RADIUS_OPTIONS[(current.radius ?? initial.radius) as RadiusKey].value;

  // Önizleme kutusu vurguyu kendisi ezer (`data-brand`): PT'nin önceki seçimi <html>'de dursa da
  // kutu seçilen rengi, "Tema"da temanın kendi rengini ve ondan türeyen tonları gösterir.
  const previewStyle = {
    ...brandStyle(accent),
    "--radius": radius,
  } as React.CSSProperties;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Canlı önizleme: telefonda üstte, masaüstünde sağda ve kaydırınca yerinde kalır.
          Seçilen renk ve köşe yalnız bu kutuya uygulanır; kaydedince bütün uygulamaya geçer. */}
      <Card
        className="order-first lg:sticky lg:top-6 lg:order-last"
        data-brand
        style={previewStyle}
      >
        <CardHeader>
          <CardTitle>Önizleme</CardTitle>
          <CardDescription>Kaydetmeden nasıl görüneceği</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-11 rounded-md after:rounded-md">
              <AvatarFallback className="rounded-md bg-primary text-lg font-bold text-primary-foreground">
                {(appName || 'P').trim().charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {appName || "Uygulama adı"}
              </p>
              <p className="text-sm text-muted-foreground">Antrenman takibi</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" tabIndex={-1}>
              Antrenmana başla
            </Button>
            <Button type="button" size="sm" variant="outline" tabIndex={-1}>
              Geçmiş
            </Button>
            <Badge>Yeni rekor</Badge>
          </div>
          <Item variant="outline" size="sm">
            <ItemContent>
              <ItemTitle>Bench Press</ItemTitle>
              <ItemDescription className="tabular-nums">4 set · 8 tekrar · 60 kg</ItemDescription>
            </ItemContent>
          </Item>
        </CardContent>
      </Card>

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

            <FormField of={form} path={["accent"]}>
              {(field) => (
                <Field>
                  <FieldLabel id="setup-accent-label">Ana renk</FieldLabel>
                  <ToggleGroup
                    aria-labelledby="setup-accent-label"
                    spacing={2}
                    // Telefonda dört sütun: sekiz kutu 44 px'e sığmaz (SPEC §6 dokunma hedefi).
                    className="grid w-full grid-cols-4 sm:grid-cols-8"
                    // "Tema" seçeneği formda null; düğmede THEME_ACCENT ile temsil edilir.
                    value={[field.input ?? THEME_ACCENT]}
                    onValueChange={(value) => {
                      if (value[0] === undefined) return;
                      setInput(form, {
                        path: ["accent"],
                        input: value[0] === THEME_ACCENT ? null : value[0],
                      });
                    }}
                  >
                    {ACCENT_PRESETS.map((preset) => {
                      const selected = (field.input ?? null) === preset.value;
                      return (
                        <ToggleGroupItem
                          key={preset.label}
                          value={preset.value ?? THEME_ACCENT}
                          aria-label={preset.label}
                          title={preset.label}
                          className={cn(
                            "h-11 w-full border-2 border-transparent p-0 data-pressed:border-foreground sm:aspect-square sm:h-auto",
                            preset.value === null &&
                              // Basılı düğmenin seçili zemini (`bg-primary-strong`) temanın rengini ezmesin.
                              "bg-primary text-primary-foreground hover:bg-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground",
                          )}
                          // "Tema" kutusu temanın kendi rengini gösterir (PT'nin kayıtlı seçimi ezilir).
                          data-brand={preset.value === null || undefined}
                          style={
                            preset.value
                              ? {
                                  background: preset.value,
                                  color: readableOn(preset.value),
                                }
                              : (brandStyle(null) as React.CSSProperties)
                          }
                        >
                          {selected ? (
                            <Check
                              className="size-4"
                              aria-hidden
                            />
                          ) : null}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>

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
                      if (next)
                        setInput(form, { path: ["theme"], input: next });
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
            <p className="text-center text-xs text-muted-foreground">
              Ayarlar kaydedilir; istediğin zaman değiştirebilirsin.
            </p>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

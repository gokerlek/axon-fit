'use client';

import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getInput, setInput, useForm } from '@formisch/react';
import { Check } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { readableOn } from '@/lib/color';
import { cn } from '@/lib/utils';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { RADIUS_OPTIONS, type RadiusKey } from '@/lib/schemas/config';
import { ACCENT_PRESETS, setupFormSchema, type SetupForm as SetupValues } from '@/lib/schemas/setup';
import { LogoPicker } from './logo-picker';

/**
 * Temanın kendi ana rengini (globals.css) geri getirir: sayfada PT'nin önceki seçimi
 * `--primary`'yi ezmiş olabilir. Değerler src/app/globals.css :root ve .dark ile aynı.
 */
const THEME_PRIMARY =
  '[--primary:oklch(0.841_0.238_128.85)] [--primary-foreground:oklch(0.405_0.101_131.063)] dark:[--primary:oklch(0.768_0.233_130.85)]';

const THEMES = [
  { value: 'dark', label: 'Koyu' },
  { value: 'light', label: 'Açık' },
  { value: 'system', label: 'Sistem' },
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
  afterSave = '/dashboard',
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
      fetchJson<{ ok: true }>('/api/setup/config', { method: 'POST', body: JSON.stringify(values) }),
    notify: { success: firstRun ? 'Kurulum tamamlandı.' : 'Görünüm güncellendi.' },
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
  const radius = RADIUS_OPTIONS[(current.radius ?? initial.radius) as RadiusKey].value;

  return (
    <Card>
      <CardContent>
        <Form
          of={form}
          className="flex flex-col gap-6"
          onSubmit={(values) => save.mutateAsync(values as SetupValues).catch(() => undefined)}>
          {/* Canlı önizleme: seçilen renk ve köşe yalnız bu kutuya uygulanır. */}
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg border border-dashed p-4',
              // "Tema" seçiliyken sayfadaki eski seçimi değil temanın kendi rengini göster.
              accent === null && THEME_PRIMARY,
            )}
            style={
              {
                ...(accent ? { '--primary': accent, '--primary-foreground': readableOn(accent) } : {}),
                '--radius': radius,
              } as React.CSSProperties
            }>
            <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-lg font-bold text-primary-foreground">
              {(appName || 'P').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{appName || 'Uygulama adı'}</p>
              <p className="text-sm text-muted-foreground">Danışanların göreceği ad ve renk</p>
            </div>
            <Button type="button" size="sm" tabIndex={-1} aria-hidden>
              Örnek düğme
            </Button>
          </div>

          <FormField of={form} path={['appName']}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="appName">Uygulama adı</FieldLabel>
                <Input
                  {...field.props}
                  id="appName"
                  value={field.input ?? ''}
                  maxLength={40}
                  placeholder="Ece Kaya Training"
                  aria-invalid={Boolean(field.errors) || undefined}
                />
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>

          <LogoPicker hasLogo={hasLogo} />

          <FormField of={form} path={['accent']}>
            {(field) => (
              <Field>
                <FieldLabel>Ana renk</FieldLabel>
                <div className="grid grid-cols-8 gap-2" role="radiogroup" aria-label="Ana renk">
                  {ACCENT_PRESETS.map((preset) => {
                    const selected = (field.input ?? null) === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={preset.label}
                        title={preset.label}
                        onClick={() => setInput(form, { path: ['accent'], input: preset.value })}
                        className={cn(
                          'grid aspect-square place-items-center rounded-md border-2 border-transparent transition-colors aria-checked:border-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                          preset.value === null && `${THEME_PRIMARY} bg-primary text-primary-foreground`,
                        )}
                        style={
                          preset.value ? { background: preset.value, color: readableOn(preset.value) } : undefined
                        }>
                        {selected ? <Check weight="bold" className="size-4" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>

          <FormField of={form} path={['radius']}>
            {(field) => (
              <Field>
                <FieldLabel>Köşeler</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  value={[field.input ?? 'subtle']}
                  onValueChange={(value) => {
                    const next = value[0] as RadiusKey | undefined;
                    if (next) setInput(form, { path: ['radius'], input: next });
                  }}
                  className="w-full">
                  {(Object.keys(RADIUS_OPTIONS) as RadiusKey[]).map((key) => (
                    <ToggleGroupItem key={key} value={key} className="flex-1">
                      {RADIUS_OPTIONS[key].label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            )}
          </FormField>

          <FormField of={form} path={['theme']}>
            {(field) => (
              <Field>
                <FieldLabel>Varsayılan tema</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  value={[field.input ?? 'dark']}
                  onValueChange={(value) => {
                    const next = value[0] as SetupValues['theme'] | undefined;
                    if (next) setInput(form, { path: ['theme'], input: next });
                  }}
                  className="w-full">
                  {THEMES.map((theme) => (
                    <ToggleGroupItem key={theme.value} value={theme.value} className="flex-1">
                      {theme.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>Salonda koyu tema göz yormaz.</FieldDescription>
              </Field>
            )}
          </FormField>

          <Button type="submit" size="lg" className="h-11" disabled={save.isPending}>
            {save.isPending ? 'Kaydediliyor…' : firstRun ? 'Kurulumu tamamla' : 'Kaydet'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Ayarlar senin GitHub repo&apos;na kaydedilir, istediğin zaman değiştirebilirsin.
          </p>
        </Form>
      </CardContent>
    </Card>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { Field, Form, getInput, setInput, useForm } from '@formisch/react';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { ACCENT_PRESETS, setupFormSchema, type SetupForm } from '@/lib/schemas/setup';
import styles from './setup.module.css';

const THEMES = [
  { value: 'dark', label: 'Koyu' },
  { value: 'light', label: 'Açık' },
  { value: 'system', label: 'Sistem' },
] as const;

/**
 * Marka ayarı: uygulama adı, vurgu rengi, tema.
 *
 * Kaydedince ayar PT'nin kendi repo'suna commit edilir. Renk ve tema seçimi
 * anında üstteki önizlemede görünür; kaydetmeden nasıl duracağını görür.
 */
export function SetupForm({ initial, firstRun }: { initial: SetupForm; firstRun: boolean }) {
  const router = useRouter();
  const form = useForm({ schema: setupFormSchema, initialInput: initial });

  const save = useServiceMutation({
    fn: (values: SetupForm) =>
      fetchJson<{ ok: true }>('/api/setup/config', { method: 'POST', body: JSON.stringify(values) }),
    notify: { success: firstRun ? 'Kurulum tamamlandı.' : 'Görünüm güncellendi.' },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: () => {
      router.replace('/dashboard');
      // Sunucu bileşenleri yeni ayarı okusun (başlık, renk, tema).
      router.refresh();
    },
  });

  const current = getInput(form) as Partial<SetupForm>;
  const accent = current.accent ?? initial.accent;
  const appName = current.appName ?? initial.appName;

  return (
    <Form of={form} className={styles.card} onSubmit={(values) => save.mutateAsync(values).catch(() => undefined)}>
      <div className={styles.preview} style={{ ['--accent' as string]: accent }}>
        <div className={styles.previewMark} style={{ background: accent }}>
          {(appName || 'P').trim().charAt(0).toUpperCase()}
        </div>
        <div>
          <strong>{appName || 'Uygulama adı'}</strong>
          <p className={styles.hint}>Danışanların göreceği ad ve renk</p>
        </div>
      </div>

      <Field of={form} path={['appName']}>
        {(field) => (
          <div>
            <label className={styles.label} htmlFor="appName">
              Uygulama adı
            </label>
            <input
              {...field.props}
              id="appName"
              className={styles.input}
              value={field.input ?? ''}
              maxLength={40}
              placeholder="Ece Kaya Training"
            />
            {field.errors ? (
              <p role="alert" className={styles.error}>
                {field.errors[0]}
              </p>
            ) : null}
          </div>
        )}
      </Field>

      <Field of={form} path={['accent']}>
        {(field) => (
          <div>
            <span className={styles.label}>Vurgu rengi</span>
            <div className={styles.swatches}>
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={styles.swatch}
                  aria-pressed={field.input === preset.value}
                  aria-label={preset.label}
                  title={preset.label}
                  onClick={() => setInput(form, { path: ['accent'], input: preset.value })}>
                  <span className={styles.dot} style={{ background: preset.value }} />
                </button>
              ))}
            </div>
            {field.errors ? (
              <p role="alert" className={styles.error}>
                {field.errors[0]}
              </p>
            ) : null}
          </div>
        )}
      </Field>

      <Field of={form} path={['theme']}>
        {(field) => (
          <div>
            <span className={styles.label}>Varsayılan tema</span>
            <div className={styles.segmented}>
              {THEMES.map((theme) => (
                <button
                  key={theme.value}
                  type="button"
                  className={styles.segment}
                  aria-pressed={field.input === theme.value}
                  onClick={() => setInput(form, { path: ['theme'], input: theme.value })}>
                  {theme.label}
                </button>
              ))}
            </div>
            <p className={styles.hint}>Salonda koyu tema göz yormaz.</p>
          </div>
        )}
      </Field>

      <button type="submit" className={styles.primary} disabled={save.isPending}>
        {save.isPending ? 'Kaydediliyor…' : firstRun ? 'Kurulumu tamamla' : 'Kaydet'}
      </button>
      <p className={styles.hint}>Ayarlar senin GitHub repo'na kaydedilir, istediğin zaman değiştirebilirsin.</p>
    </Form>
  );
}

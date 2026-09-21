'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field, Form, useForm } from '@formisch/react';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { kodGirSchema, kodIsteSchema, OTP_LENGTH } from '@/lib/schemas/auth';
import styles from './giris.module.css';

/**
 * Yedek giriş yolu (e-posta kodu).
 *
 * - Alan doğrulaması Formisch + Valibot: kurallar `@/lib/schemas/auth` içinde, sunucuyla ORTAK.
 * - İstek durumu React Query'de: `try/catch` yok, yükleniyor/hata oradan okunur.
 * - Kod adımı `meta.sessiz` ile bildirim çubuğunu susturur; hata alanın altında görünmeli.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  const epostaForm = useForm({ schema: kodIsteSchema });
  const kodForm = useForm({ schema: kodGirSchema });

  const kodGonder = useServiceMutation({
    fn: (adres: string) =>
      fetchJson<{ ok: true }>('/api/giris/kod', { method: 'POST', body: JSON.stringify({ email: adres }) }),
    onSuccess: (_data, adres) => setEmail(adres),
    notify: { success: 'Giriş kodu gönderildi.' },
  });

  const dogrula = useServiceMutation({
    fn: (code: string) =>
      fetchJson<{ ok: true }>('/api/giris/dogrula', { method: 'POST', body: JSON.stringify({ email, code }) }),
    onSuccess: () => router.replace('/panel'),
    // Yanlış kod hatası alanın altında gösterilir; tepede balon çıkmaz.
    notify: 'none',
  });

  if (kodGonder.isSuccess) {
    return (
      <Form
        of={kodForm}
        className={styles.inner}
        onSubmit={async (output) => {
          await dogrula.mutateAsync(output.code).catch(() => undefined);
        }}>
        <Field of={kodForm} path={['code']}>
          {(field) => (
            <div>
              <label className={styles.label} htmlFor="kod">
                {email} adresine gönderilen {OTP_LENGTH} haneli kod
              </label>
              <input
                {...field.props}
                id="kod"
                className={styles.input}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                value={field.input ?? ''}
                placeholder="000000"
                autoFocus
              />
              {field.errors ? (
                <p role="alert" className={styles.error}>
                  {field.errors[0]}
                </p>
              ) : null}
            </div>
          )}
        </Field>

        {dogrula.error ? (
          <p role="alert" className={styles.error}>
            {dogrula.error.message}
          </p>
        ) : null}

        <button className={styles.primary} type="submit" disabled={dogrula.isPending}>
          {dogrula.isPending ? 'Kontrol ediliyor…' : 'Giriş yap'}
        </button>
        <button
          type="button"
          className={styles.google}
          onClick={() => {
            kodGonder.reset();
            dogrula.reset();
          }}>
          Adresi değiştir
        </button>
      </Form>
    );
  }

  return (
    <Form
      of={epostaForm}
      className={styles.inner}
      onSubmit={async (output) => {
        await kodGonder.mutateAsync(output.email).catch(() => undefined);
      }}>
      <Field of={epostaForm} path={['email']}>
        {(field) => (
          <div>
            <label className={styles.label} htmlFor="eposta">
              E-posta adresi
            </label>
            <input
              {...field.props}
              id="eposta"
              className={styles.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={field.input ?? ''}
              placeholder="ornek@eposta.com"
            />
            {field.errors ? (
              <p role="alert" className={styles.error}>
                {field.errors[0]}
              </p>
            ) : null}
          </div>
        )}
      </Field>

      <button className={styles.primary} type="submit" disabled={kodGonder.isPending}>
        {kodGonder.isPending ? 'Gönderiliyor…' : 'Giriş kodu gönder'}
      </button>
      <p className={styles.note}>Kod 5 dakika geçerli, tek kullanımlık.</p>
    </Form>
  );
}

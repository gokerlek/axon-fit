'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field, Form, useForm } from '@formisch/react';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { enterCodeSchema, requestCodeSchema, OTP_LENGTH } from '@/lib/schemas/auth';
import styles from './login.module.css';

/**
 * Yedek giriş yolu (e-posta kodu).
 *
 * - Alan doğrulaması Formisch + Valibot: kurallar `@/lib/schemas/auth` içinde, sunucuyla ORTAK.
 * - İstek durumu React Query'de: `try/catch` yok, yükleniyor/failure oradan okunur.
 * - Kod adımı `meta.sessiz` ile bildirim çubuğunu susturur; failure alanın altında görünmeli.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  const emailForm = useForm({ schema: requestCodeSchema });
  const codeForm = useForm({ schema: enterCodeSchema });

  const sendCode = useServiceMutation({
    fn: (address: string) =>
      fetchJson<{ ok: true }>('/api/auth/otp', { method: 'POST', body: JSON.stringify({ email: address }) }),
    onSuccess: (_data, address) => setEmail(address),
    notify: { success: 'Giriş kodu gönderildi.' },
  });

  const verify = useServiceMutation({
    fn: (code: string) =>
      fetchJson<{ ok: true }>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) }),
    onSuccess: () => router.replace('/dashboard'),
    // Yanlış kod hatası alanın altında gösterilir; tepede balon çıkmaz.
    notify: 'none',
  });

  if (sendCode.isSuccess) {
    return (
      <Form
        of={codeForm}
        className={styles.inner}
        onSubmit={async (output) => {
          await verify.mutateAsync(output.code).catch(() => undefined);
        }}>
        <Field of={codeForm} path={['code']}>
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

        {verify.error ? (
          <p role="alert" className={styles.error}>
            {verify.error.message}
          </p>
        ) : null}

        <button className={styles.primary} type="submit" disabled={verify.isPending}>
          {verify.isPending ? 'Kontrol ediliyor…' : 'Giriş yap'}
        </button>
        <button
          type="button"
          className={styles.google}
          onClick={() => {
            sendCode.reset();
            verify.reset();
          }}>
          Adresi değiştir
        </button>
      </Form>
    );
  }

  return (
    <Form
      of={emailForm}
      className={styles.inner}
      onSubmit={async (output) => {
        await sendCode.mutateAsync(output.email).catch(() => undefined);
      }}>
      <Field of={emailForm} path={['email']}>
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

      <button className={styles.primary} type="submit" disabled={sendCode.isPending}>
        {sendCode.isPending ? 'Gönderiliyor…' : 'Giriş kodu gönder'}
      </button>
      <p className={styles.note}>Kod 5 dakika geçerli, tek kullanımlık.</p>
    </Form>
  );
}

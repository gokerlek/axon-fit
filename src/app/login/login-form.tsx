'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, useForm } from '@formisch/react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { enterCodeSchema, OTP_LENGTH, requestCodeSchema } from '@/lib/schemas/auth';

/**
 * Yedek giriş yolu (e-posta kodu).
 *
 * - Alan doğrulaması Formisch + Valibot: kurallar `@/lib/schemas/auth` içinde, sunucuyla ORTAK.
 * - İstek durumu React Query'de: `try/catch` yok, yükleniyor/hata oradan okunur.
 * - Kod adımı bildirim çubuğunu susturur; yanlış kod hatası alanın altında görünmeli.
 * - Girişten sonra `next` (sunucuda doğrulanmış PT yolu) açılır, yoksa genel bakış.
 */
export function LoginForm({ next = null }: { next?: string | null }) {
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
    onSuccess: () => router.replace(next ?? '/dashboard'),
    notify: 'none',
  });

  if (sendCode.isSuccess) {
    return (
      <Form
        of={codeForm}
        className="flex flex-col gap-3"
        onSubmit={(output) => verify.mutateAsync(output.code).catch(() => undefined)}>
        <FormField of={codeForm} path={['code']}>
          {(field) => (
            <Field data-invalid={Boolean(field.errors || verify.error) || undefined}>
              <FieldLabel htmlFor="code">
                {email} adresine gönderilen {OTP_LENGTH} haneli kod
              </FieldLabel>
              <Input
                {...field.props}
                id="code"
                className="tabular-nums h-11 text-center text-lg tracking-[0.4em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                value={field.input ?? ''}
                placeholder="000000"
                autoFocus
                aria-invalid={Boolean(field.errors || verify.error) || undefined}
              />
              <FieldError>{field.errors?.[0] ?? verify.error?.message}</FieldError>
            </Field>
          )}
        </FormField>
        <Button type="submit" size="lg" className="h-11" disabled={verify.isPending}>
          {verify.isPending ? <Spinner data-icon="inline-start" /> : null}
          {verify.isPending ? 'Kontrol ediliyor…' : 'Giriş yap'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            sendCode.reset();
            verify.reset();
          }}>
          Adresi değiştir
        </Button>
      </Form>
    );
  }

  return (
    <Form
      of={emailForm}
      className="flex flex-col gap-3"
      onSubmit={(output) => sendCode.mutateAsync(output.email).catch(() => undefined)}>
      <FormField of={emailForm} path={['email']}>
        {(field) => (
          <Field data-invalid={Boolean(field.errors) || undefined}>
            <FieldLabel htmlFor="email">E-posta adresi</FieldLabel>
            <Input
              {...field.props}
              id="email"
              className="h-11"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={field.input ?? ''}
              placeholder="ornek@eposta.com"
              aria-invalid={Boolean(field.errors) || undefined}
            />
            <FieldError>{field.errors?.[0]}</FieldError>
          </Field>
        )}
      </FormField>
      <Button type="submit" variant="outline" size="lg" className="h-11" disabled={sendCode.isPending}>
        {sendCode.isPending ? <Spinner data-icon="inline-start" /> : null}
        {sendCode.isPending ? 'Gönderiliyor…' : 'Giriş kodu gönder'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Kod 5 dakika geçerli, tek kullanımlık.</p>
    </Form>
  );
}

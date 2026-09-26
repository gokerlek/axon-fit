'use client';

import { Field as FormField, Form, useForm } from '@formisch/react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { PASSWORD_MIN_LENGTH } from '@/lib/client-status';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { setPasswordSchema, type SetPasswordInput } from '@/lib/schemas/auth';
import { PasswordInput } from './password-input';

/**
 * Şifre belirleme (SPEC §5): kare kodla girişin ikinci adımı (`/join`) ve eski akışla katılmış
 * danışanın `/me` kartı aynı formu kullanır. Tekrar kutusu yazım hatasına karşı; "Göster" ikisini
 * ayrı ayrı açar. Hata alanın altında, bildirim çubuğunda değil.
 */
export function SetPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const form = useForm({ schema: setPasswordSchema, initialInput: { password: '', confirm: '' } });
  const save = useServiceMutation({
    fn: (input: SetPasswordInput) =>
      fetchJson<{ ok: true }>('/api/me/password', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: onDone,
    onError: (error) => applyFieldErrors(form as never, error),
    notify: 'none',
  });
  const busy = save.isPending || save.isSuccess;
  // Alan hatası alanın altında; alana ait olmayan (oturum, GitHub) formun altında.
  const formError = save.error && Object.keys(save.error.fields).length === 0 ? save.error.message : null;

  return (
    <Form of={form} className="flex flex-col gap-5" onSubmit={(output) => save.mutateAsync(output).catch(() => undefined)}>
      <FormField of={form} path={['password']}>
        {(field) => (
          <Field data-invalid={Boolean(field.errors) || undefined}>
            <FieldLabel htmlFor="new-password">Şifre</FieldLabel>
            <PasswordInput
              {...field.props}
              id="new-password"
              autoComplete="new-password"
              value={field.input ?? ''}
              aria-invalid={Boolean(field.errors) || undefined}
            />
            <FieldDescription>
              En az {PASSWORD_MIN_LENGTH} karakter; 12345678 gibi yaygın ya da sıralı şifre olmaz. Unutursan antrenörün yeni
              kare kod verir.
            </FieldDescription>
            <FieldError>{field.errors?.[0]}</FieldError>
          </Field>
        )}
      </FormField>
      <FormField of={form} path={['confirm']}>
        {(field) => (
          <Field data-invalid={Boolean(field.errors) || undefined}>
            <FieldLabel htmlFor="confirm-password">Şifre (tekrar)</FieldLabel>
            <PasswordInput
              {...field.props}
              id="confirm-password"
              autoComplete="new-password"
              value={field.input ?? ''}
              aria-invalid={Boolean(field.errors) || undefined}
            />
            <FieldError>{field.errors?.[0]}</FieldError>
          </Field>
        )}
      </FormField>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy}>
        {busy ? <Spinner data-icon="inline-start" /> : null}
        {submitLabel}
      </Button>
    </Form>
  );
}

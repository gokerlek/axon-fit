'use client';

import { useRouter } from 'next/navigation';
import { Field as FormField, Form, setInput, useForm } from '@formisch/react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { INVITE_CODE_LENGTH } from '@/lib/client-status';
import { joinSchema, type JoinInput } from '@/lib/schemas/auth';

/**
 * Davet kodunu kullanır. Kare koddan gelen kod hazır doldurulur; elle de yazılabilir.
 * Hata bildirim çubuğunda değil alanın altında görünür.
 */
export function JoinForm({ clientId, initialCode }: { clientId: string; initialCode: string }) {
  const router = useRouter();
  const form = useForm({ schema: joinSchema, initialInput: { code: initialCode } });

  const join = useServiceMutation({
    fn: ({ code }: JoinInput) =>
      fetchJson<{ ok: true }>('/api/join', { method: 'POST', body: JSON.stringify({ clientId, code }) }),
    onSuccess: () => router.replace('/me'),
    notify: 'none',
  });

  return (
    <Form of={form} className="flex flex-col gap-4" onSubmit={(output) => join.mutateAsync(output).catch(() => undefined)}>
      <FormField of={form} path={['code']}>
        {(field) => (
          <Field data-invalid={Boolean(field.errors || join.error) || undefined}>
            <FieldLabel htmlFor="code">Davet kodu</FieldLabel>
            <Input
              {...field.props}
              id="code"
              className="h-12 text-center font-mono text-xl tracking-[0.3em] tabular-nums"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={INVITE_CODE_LENGTH + 2}
              value={field.input ?? ''}
              aria-invalid={Boolean(field.errors || join.error) || undefined}
              onChange={(event) => setInput(form, { path: ['code'], input: event.currentTarget.value })}
            />
            <FieldDescription>Antrenörünün verdiği {INVITE_CODE_LENGTH} haneli kod. Bir kez kullanılır.</FieldDescription>
            <FieldError>{field.errors?.[0] ?? join.error?.message}</FieldError>
          </Field>
        )}
      </FormField>
      <Button type="submit" size="lg" className="h-11 w-full" disabled={join.isPending || join.isSuccess}>
        {join.isPending || join.isSuccess ? <Spinner data-icon="inline-start" /> : null}
        Giriş yap
      </Button>
    </Form>
  );
}

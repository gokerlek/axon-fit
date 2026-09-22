'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, setInput, useForm } from '@formisch/react';
import { toast } from 'sonner';
import { ImageField, KEEP, type ImageChange } from '@/components/image-field';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { attachmentImageUrl } from '@/lib/attachment-media';
import { ApiError, fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { attachmentFormSchema, type Attachment, type AttachmentInput } from '@/lib/schemas/attachment';

/**
 * Aparat ekleme/düzenleme formu. Fotoğraf cihazdaki gibi kaydetmede yüklenir:
 * yeni aparatta dosyanın bağlanacağı kimlik ancak kayıttan sonra bellidir.
 */
export function AttachmentForm({ editing }: { editing: Attachment | null }) {
  const router = useRouter();
  const form = useForm({ schema: attachmentFormSchema, initialInput: { name: editing?.name ?? '' } });
  const [image, setImage] = useState<ImageChange>(KEEP);
  const [imageError, setImageError] = useState<string | null>(null);
  const currentImageUrl = editing ? attachmentImageUrl(editing) : null;

  const save = useServiceMutation({
    fn: async (values: AttachmentInput) => {
      const { id } = await fetchJson<{ id: string }>('/api/attachments', {
        method: 'POST',
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      });
      // Fotoğraf ayrı uca gider. Aparat kaydedildiyse fotoğraf hatası kaydı geri almaz.
      try {
        if (image.kind === 'upload') {
          const body = new FormData();
          body.set('image', image.file);
          await fetchJson(`/api/attachments/${id}/image`, { method: 'POST', body });
        } else if (image.kind === 'remove') {
          await fetchJson(`/api/attachments/${id}/image`, { method: 'DELETE' });
        }
      } catch (error) {
        return { id, imageFailed: error instanceof ApiError ? error.message : 'Fotoğraf yüklenemedi.' };
      }
      return { id, imageFailed: null };
    },
    invalidate: [['attachments'], ['devices'], ['exercises']],
    notify: { success: editing ? 'Aparat güncellendi.' : 'Aparat eklendi.' },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: ({ id, imageFailed }) => {
      if (imageFailed) {
        toast.error(`Aparat kaydedildi ama fotoğraf yüklenemedi: ${imageFailed}`);
        router.push(`/dashboard/attachments/${id}/edit`);
      } else {
        router.push('/dashboard/attachments');
      }
      router.refresh();
    },
  });

  return (
    <Form
      of={form}
      className="flex max-w-xl flex-col gap-5"
      onSubmit={(values) => save.mutateAsync(values as AttachmentInput).catch(() => undefined)}>
      <FormField of={form} path={['name']}>
        {(field) => (
          <Field data-invalid={Boolean(field.errors) || undefined}>
            <FieldLabel htmlFor="name">Aparat adı</FieldLabel>
            <Input
              {...field.props}
              id="name"
              value={field.input ?? ''}
              placeholder="Ör. MAG tutamağı"
              onChange={(event) => setInput(form, { path: ['name'], input: event.currentTarget.value })}
            />
            <FieldDescription>Cihazlarda ve egzersizlerde bu adla görünür.</FieldDescription>
            <FieldError>{field.errors?.[0]}</FieldError>
          </Field>
        )}
      </FormField>

      <ImageField
        label="Fotoğraf"
        description="Danışan hangisini takacağını görsün diye. PNG, JPG ya da WebP; en fazla 1 MB."
        currentUrl={currentImageUrl}
        change={image}
        onChange={setImage}
        error={imageError}
        onError={setImageError}
      />

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/attachments" />}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
    </Form>
  );
}

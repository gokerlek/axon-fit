'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/**
 * Logo yükleme. Dosya seçilir seçilmez yüklenir; önce tarayıcıda önizlenir,
 * sunucudan dönünce kalıcı adresle tazelenir. Yüklenemezse önizleme geri alınır ve
 * sebep alanın altında kalır (ör. veri repo'su açık ya da fork, ayar okunamadı).
 */
export function LogoPicker({ hasLogo }: { hasLogo: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(hasLogo ? '/api/brand/logo' : null);

  const upload = useServiceMutation({
    fn: (file: File) => {
      const body = new FormData();
      body.append('logo', file);
      return fetchJson<{ logo: string }>('/api/setup/logo', { method: 'POST', body });
    },
    notify: { success: 'Logo yüklendi.', error: false },
    onSuccess: () => {
      // Aynı adres, yeni içerik: önbelleği atlat.
      setPreview(`/api/brand/logo?v=${Date.now()}`);
      router.refresh();
    },
  });

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>('/api/setup/logo', { method: 'DELETE' }),
    notify: { success: 'Logo kaldırıldı.', error: false },
    onSuccess: () => {
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    },
  });

  const busy = upload.isPending || remove.isPending;
  const error = upload.error ?? remove.error;

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Logo</FieldLabel>
      <div className="flex items-center gap-4">
        <Avatar className="size-16 rounded-lg after:rounded-lg">
          {preview ? <AvatarImage src={preview} alt="Yüklenen logo" className="rounded-lg object-contain" /> : null}
          <AvatarFallback className="rounded-lg">
            <ImageSquare className="size-6" aria-hidden />
          </AvatarFallback>
        </Avatar>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          id="logo"
          // "Dosya seç" düğmesi bu girişi açar: gizli giriş ayrıca (adsız, görünmez) odak durağı olmasın.
          tabIndex={-1}
          aria-hidden
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const previous = preview;
            setPreview(URL.createObjectURL(file));
            remove.reset();
            upload.mutate(file, {
              onError: () => {
                // Yüklenmeyen logo önizlemede kalmasın; aynı dosya yeniden seçilebilsin.
                setPreview(previous);
                if (inputRef.current) inputRef.current.value = '';
              },
            });
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <UploadSimple data-icon="inline-start" />
            {upload.isPending ? 'Yükleniyor…' : preview ? 'Değiştir' : 'Dosya seç'}
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                upload.reset();
                remove.mutate();
              }}
            >
              <Trash data-icon="inline-start" />
              {remove.isPending ? 'Kaldırılıyor…' : 'Kaldır'}
            </Button>
          ) : null}
        </div>
      </div>
      <FieldDescription>PNG, JPG veya WebP · en fazla 512 KB. Sekme ikonu da bundan üretilir.</FieldDescription>
      <FieldError>{error?.message}</FieldError>
    </div>
  );
}

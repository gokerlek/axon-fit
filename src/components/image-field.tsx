'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageSquare } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { imageProblem } from '@/lib/image';

/**
 * Görsel alanı — cihaz görseli ve aparat fotoğrafı için ortak.
 *
 * Dosya hemen yüklenmez: kayıt bittikten sonra ayrı uca gönderilir (yeni kayıtta
 * dosyanın bağlanacağı kimlik ancak o zaman bellidir). Alan yalnız "ne yapılacağını"
 * tutar: olduğu gibi kalsın, yenisi yüklensin ya da kaldırılsın.
 */
export type ImageChange = { kind: 'keep' } | { kind: 'upload'; file: File } | { kind: 'remove' };

/** Değişiklik yokken hep aynı nesne: önizleme etkisi boş yere yeniden çalışmasın. */
export const KEEP: ImageChange = { kind: 'keep' };

/** Seçilen dosyanın önizleme adresi (bellekten; bırakınca geri verilir). */
export function usePreview(change: ImageChange): string | null {
  // Adres hangi dosyanın: dosya değişince (ya da kaldırılınca) eskisinin geri verilmiş adresi gösterilmez.
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    if (change.kind !== 'upload') return;
    // Adres tarayıcının dış kaynağıdır: etkiyle açılır, etkinin temizliğinde geri verilir.
    const url = URL.createObjectURL(change.file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview({ file: change.file, url });
    return () => URL.revokeObjectURL(url);
  }, [change]);

  return change.kind === 'upload' && preview?.file === change.file ? preview.url : null;
}

export function ImageField({
  id = 'image',
  label = 'Görsel',
  description,
  currentUrl,
  change,
  onChange,
  error,
  onError,
}: {
  id?: string;
  label?: string;
  description?: string;
  currentUrl: string | null;
  change: ImageChange;
  onChange: (change: ImageChange) => void;
  error: string | null;
  onError: (error: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = usePreview(change);
  const shown = change.kind === 'upload' ? preview : change.kind === 'keep' ? currentUrl : null;

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return onError(problem);
    onError(null);
    onChange({ kind: 'upload', file });
  }

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        {shown ? (
          // Özel repo'dan uygulama üzerinden gelir; Next görsel iyileştiricisi oturum çerezini taşımaz.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Görsel önizlemesi" className="size-24 shrink-0 rounded-lg border object-cover" />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <ImageSquare data-icon="inline-start" />
            {shown ? 'Değiştir' : 'Görsel seç'}
          </Button>
          {shown ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onError(null);
                onChange(currentUrl ? { kind: 'remove' } : KEEP);
              }}>
              Kaldır
            </Button>
          ) : null}
          {change.kind !== 'keep' && currentUrl ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(KEEP)}>
              Geri al
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

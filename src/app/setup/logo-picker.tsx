'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import styles from './setup.module.css';

/**
 * Logo yükleme.
 *
 * Dosya seçilir seçilmez yüklenir (ayrı bir "yükle" düğmesi beklemeye değmez).
 * Seçilen dosya önce tarayıcıda gösterilir; sunucudan dönen yolla tazelenir.
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
    notify: { success: 'Logo yüklendi.' },
    onSuccess: () => {
      // Önbelleği atlat: aynı adres, yeni içerik.
      setPreview(`/api/brand/logo?v=${Date.now()}`);
      router.refresh();
    },
  });

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>('/api/setup/logo', { method: 'DELETE' }),
    notify: { success: 'Logo kaldırıldı.' },
    onSuccess: () => {
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    },
  });

  const busy = upload.isPending || remove.isPending;

  return (
    <div>
      <span className={styles.label}>Logo</span>
      <div className={styles.logoRow}>
        <div className={styles.logoBox}>
          {preview ? (
            // Sunucudan gelen tek bir marka dosyası; Next/Image'a gerek yok.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Yüklenen logo" className={styles.logoImage} />
          ) : (
            <span className={styles.logoEmpty}>yok</span>
          )}
        </div>

        <div className={styles.logoActions}>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={styles.fileInput}
            id="logo"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setPreview(URL.createObjectURL(file));
              upload.mutate(file);
            }}
          />
          <label htmlFor="logo" className={styles.secondary} aria-disabled={busy}>
            {upload.isPending ? 'Yükleniyor…' : preview ? 'Değiştir' : 'Dosya seç'}
          </label>
          {preview ? (
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => remove.mutate()}>
              {remove.isPending ? 'Kaldırılıyor…' : 'Kaldır'}
            </button>
          ) : null}
        </div>
      </div>
      <p className={styles.hint}>PNG, JPG veya WebP · en fazla 512 KB. Sekme ikonu da bundan üretilir.</p>
    </div>
  );
}

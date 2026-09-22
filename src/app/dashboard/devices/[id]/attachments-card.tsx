'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageSquare } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { DEVICE_IMAGE_MAX_BYTES, DEVICE_IMAGE_TYPES } from '@/lib/schemas/device';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

export type AttachmentRow = { name: string; imageUrl: string | null };

/**
 * Cihazın aparatları ve fotoğrafları. Fotoğraf burada yüklenir (cihaz zaten kayıtlı);
 * hazır bir cihazın aparatına fotoğraf eklemek PT'nin sürümünü oluşturur.
 */
export function AttachmentsCard({ deviceId, rows }: { deviceId: string; rows: AttachmentRow[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useServiceMutation({
    fn: ({ name, file }: { name: string; file: File }) => {
      const body = new FormData();
      body.set('image', file);
      body.set('name', name);
      return fetchJson<{ image: string }>(`/api/devices/${deviceId}/attachments/image`, { method: 'POST', body });
    },
    invalidate: [['devices']],
    notify: { success: 'Aparat görseli güncellendi.' },
    onSuccess: () => router.refresh(),
  });

  const remove = useServiceMutation({
    fn: (name: string) =>
      fetchJson<{ ok: true }>(`/api/devices/${deviceId}/attachments/image?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    invalidate: [['devices']],
    notify: { success: 'Aparat görseli kaldırıldı.' },
    onSuccess: () => router.refresh(),
  });

  const busy = upload.isPending || remove.isPending;

  function pick(file: File | undefined) {
    if (!file || !target) return;
    if (!DEVICE_IMAGE_TYPES[file.type]) return setError('Yalnız PNG, JPG ya da WebP seçebilirsin.');
    if (file.size > DEVICE_IMAGE_MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
      return setError(`Görsel ${mb} MB; en fazla 1 MB olabilir.`);
    }
    setError(null);
    upload.mutate({ name: target, file });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aparatlar</CardTitle>
        <CardDescription>
          Bu cihazdaki tutamaçlar. Danışan hangisini takacağını görsün diye fotoğraf ekleyebilirsin (en fazla 1 MB).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ItemGroup className="gap-2">
          {rows.map((row) => (
            <Item key={row.name} variant="outline" size="sm">
              {row.imageUrl ? (
                <ItemMedia variant="image">
                  {/* Özel repo'dan uygulama üzerinden gelir; Next görsel iyileştiricisi oturum çerezini taşımaz. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.imageUrl} alt="" className="size-full object-cover" />
                </ItemMedia>
              ) : null}
              <ItemContent>
                <ItemTitle>{row.name}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={() => {
                    setTarget(row.name);
                    inputRef.current?.click();
                  }}>
                  <ImageSquare data-icon="inline-start" />
                  {row.imageUrl ? 'Değiştir' : 'Görsel ekle'}
                </Button>
                {row.imageUrl ? (
                  <Button variant="ghost" size="xs" disabled={busy} onClick={() => remove.mutate(row.name)}>
                    Kaldır
                  </Button>
                ) : null}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </CardContent>
    </Card>
  );
}

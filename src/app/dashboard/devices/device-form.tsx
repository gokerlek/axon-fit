'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getDeepError, setInput, useForm } from '@formisch/react';
import { ImageSquare, Plus, WarningCircle, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { LabeledSelect } from '@/components/labeled-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  ATTACHMENTS_MAX,
  ATTACHMENT_NAME_MAX,
  ATTACHMENT_SUGGESTIONS,
  DEVICE_KIND_LABELS,
  deviceLoads,
  PULLEY_RATIOS,
  takesAttachments,
  type DeviceAttachment,
  type DeviceKind,
  type DeviceLoadSettings,
  type PulleyRatio,
} from '@/lib/device-loads';
import { attachmentImageUrl, deviceImageUrl } from '@/lib/device-media';
import { ApiError, fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import {
  ADD_ON_OPTIONS,
  DEVICE_IMAGE_MAX_BYTES,
  DEVICE_IMAGE_TYPES,
  deviceFormSchema,
  needsBase,
  needsMax,
  needsStep,
  needsWeights,
  takesAddOns,
  type Device,
  type DeviceInput,
} from '@/lib/schemas/device';

/** Tür seçilince gelen başlangıç ayarları (yaygın değerler; PT değiştirir). */
const KIND_DEFAULTS: Record<DeviceKind, Partial<DeviceInput>> = {
  selectorized: { baseKg: 5, stepKg: 5, maxKg: 100, addOnsKg: [2.5] },
  cable: { baseKg: 5, stepKg: 5, maxKg: 100, addOnsKg: [2.5], pulleyRatio: 1 },
  plate_loaded: { baseKg: 20, stepKg: 5 },
  barbell: { baseKg: 20, stepKg: 2.5 },
  dumbbell: { weightsKg: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
  kettlebell: { weightsKg: [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32] },
  bodyweight: {},
  band: {},
  cardio: {},
};

/** Alan adları türe göre: blokta "ilk blok", plaka yüklemelide "kızak", barda "bar". */
const BASE_LABELS: Partial<Record<DeviceKind, string>> = {
  selectorized: 'İlk blok (kg)',
  cable: 'İlk blok (kg)',
  plate_loaded: 'Kızak ağırlığı (kg)',
  barbell: 'Bar ağırlığı (kg)',
};

const PULLEY_HELP: Record<PulleyRatio, string> = {
  1: 'Tek makara: seçilen ağırlık neyse kolda o hissedilir.',
  2: 'Çift makara: blok yarı yol gider, kolda seçilenin yarısı hissedilir (20 kg → 10 kg).',
  3: '3:1: kolda seçilenin üçte biri hissedilir.',
  4: '4:1: kolda seçilenin dörtte biri hissedilir.',
};

const kgText = (value: number) => value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** "2 4 6 12,5" → [2, 4, 6, 12.5]; ondalıkta virgül ya da nokta. */
function parseWeights(text: string): number[] {
  return text
    .split(/[\s;]+/)
    .map((part) => Number(part.replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0);
}

/** Görselde ne yapılacak: olduğu gibi kalsın, yenisi yüklensin ya da kaldırılsın. */
type ImageChange = { kind: 'keep' } | { kind: 'upload'; file: File } | { kind: 'remove' };

/** Değişiklik yokken hep aynı nesne: önizleme etkisi boş yere yeniden çalışmasın. */
const KEEP: ImageChange = { kind: 'keep' };

/** Seçilen dosya kurallara uymuyorsa nedeni; uyuyorsa `null`. Sunucu da denetler. */
function imageProblem(file: File): string | null {
  if (!DEVICE_IMAGE_TYPES[file.type]) return 'Yalnız PNG, JPG ya da WebP seçebilirsin.';
  if (file.size > DEVICE_IMAGE_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    return `Görsel ${mb} MB; en fazla 1 MB olabilir. Daha küçük bir görsel seç.`;
  }
  return null;
}

/** Seçilen dosyanın önizleme adresi (bellekten; bırakınca geri verilir). */
function usePreview(change: ImageChange): string | null {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (change.kind !== 'upload') return setPreview(null);
    const url = URL.createObjectURL(change.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [change]);

  return change.kind === 'upload' ? preview : null;
}

/**
 * Cihaz görseli: danışan salonda makineyi tanısın diye tek görsel. Tür ve boyut
 * tarayıcıda da denetlenir (sunucu da denetler): 1 MB'tan büyüğü kabul edilmez.
 * Dosya "Kaydet"te, cihaz kaydedildikten sonra yüklenir.
 */
function ImageField({
  currentUrl,
  change,
  onChange,
  error,
  onError,
}: {
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
      <FieldLabel htmlFor="image">Görsel</FieldLabel>
      <div className="flex items-center gap-3">
        {shown ? (
          // Özel repo'dan uygulama üzerinden gelir; Next görsel iyileştiricisi oturum çerezini taşımaz.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Cihaz görseli önizlemesi" className="size-24 shrink-0 rounded-lg border object-cover" />
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
                onChange(currentUrl ? { kind: 'remove' } : { kind: 'keep' });
              }}>
              Kaldır
            </Button>
          ) : null}
          {change.kind !== 'keep' && currentUrl ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ kind: 'keep' })}>
              Geri al
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        id="image"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <FieldDescription>Salonda tanınsın diye makinenin fotoğrafı. PNG, JPG ya da WebP; en fazla 1 MB.</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

type FormStart = Partial<DeviceInput> & Pick<DeviceInput, 'name' | 'kind'>;

const BLANK: FormStart = { name: '', kind: 'selectorized', ...KIND_DEFAULTS.selectorized };

/**
 * Bir aparat satırı: fotoğrafı, adı ve düğmeleri. Fotoğraf burada seçilir, cihazla
 * birlikte "Kaydet"te yüklenir (yeni cihazda da: kayıt olunca sırayla gönderilir).
 */
function AttachmentRow({
  name,
  currentUrl,
  change,
  onChange,
  onError,
  onRemove,
}: {
  name: string;
  currentUrl: string | null;
  change: ImageChange;
  onChange: (change: ImageChange) => void;
  onError: (error: string | null) => void;
  onRemove: () => void;
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
    <Item variant="outline" size="sm">
      <Button
        type="button"
        variant="outline"
        // Fotoğrafın kendisi düğme: parmakla rahat dokunulacak kadar büyük, boşken kesik çizgili.
        className={`size-12 shrink-0 overflow-hidden p-0 ${shown ? '' : 'border-dashed'}`}
        aria-label={shown ? `${name} görselini değiştir` : `${name} için görsel seç`}
        onClick={() => inputRef.current?.click()}>
        {shown ? (
          // Özel repo'dan uygulama üzerinden gelir; Next görsel iyileştiricisi oturum çerezini taşımaz.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="size-full object-cover" />
        ) : (
          <ImageSquare className="size-5 text-muted-foreground" />
        )}
      </Button>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        {change.kind === 'upload' ? (
          <ItemDescription>Yeni görsel kaydedince yüklenecek.</ItemDescription>
        ) : change.kind === 'remove' ? (
          <ItemDescription>Görsel kaydedince kaldırılacak.</ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions>
        {shown ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              onError(null);
              onChange(currentUrl ? { kind: 'remove' } : KEEP);
            }}>
            Görseli kaldır
          </Button>
        ) : null}
        {change.kind !== 'keep' && currentUrl ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => onChange(KEEP)}>
            Geri al
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-9 sm:size-7"
          aria-label={`${name} aparatını kaldır`}
          onClick={onRemove}>
          <X />
        </Button>
      </ItemActions>
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
    </Item>
  );
}

/**
 * Cihazdaki aparatlar: hazır öneriler tek dokunuşla, kendi aparatın için yazı alanı.
 * Her aparatın fotoğrafı da burada seçilir; cihazla birlikte kaydedilir.
 */
function AttachmentsField({
  form,
  deviceId,
  images,
  onImage,
}: {
  form: ReturnType<typeof useForm<typeof deviceFormSchema>>;
  /** Kayıtlı cihazın kimliği; yeni cihazda yok (henüz yüklü görsel olamaz). */
  deviceId: string | null;
  images: Record<string, ImageChange>;
  /** `null` verilince aparatın bekleyen görsel değişikliği unutulur. */
  onImage: (name: string, change: ImageChange | null) => void;
}) {
  const [draft, setDraft] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);

  return (
    <FormField of={form} path={['attachments']}>
      {(field) => {
        const current: DeviceAttachment[] = (field.input ?? []).flatMap((item) =>
          item && typeof item.name === 'string' ? [{ name: item.name, ...(item.image ? { image: item.image } : {}) }] : [],
        );
        const names = current.map((item) => item.name);
        const set = (next: DeviceAttachment[]) => setInput(form, { path: ['attachments'], input: next });
        const add = (name: string) => {
          const clean = name.trim().slice(0, ATTACHMENT_NAME_MAX);
          if (!clean || names.some((item) => item.toLocaleLowerCase('tr') === clean.toLocaleLowerCase('tr'))) return;
          if (current.length >= ATTACHMENTS_MAX) return;
          set([...current, { name: clean }]);
          setDraft('');
        };

        return (
          <Field data-invalid={Boolean(field.errors) || undefined}>
            <FieldLabel htmlFor="attachment-draft">Aparatlar</FieldLabel>
            {current.length > 0 ? (
              <ItemGroup className="gap-2" aria-label="Cihazdaki aparatlar">
                {current.map((attachment) => (
                  <AttachmentRow
                    key={attachment.name}
                    name={attachment.name}
                    currentUrl={deviceId ? attachmentImageUrl(deviceId, attachment) : null}
                    change={images[attachment.name] ?? KEEP}
                    onChange={(change) => onImage(attachment.name, change)}
                    onError={setImageError}
                    onRemove={() => {
                      set(current.filter((item) => item.name !== attachment.name));
                      onImage(attachment.name, null);
                    }}
                  />
                ))}
              </ItemGroup>
            ) : null}

            <div className="flex gap-2">
              <Input
                id="attachment-draft"
                value={draft}
                maxLength={ATTACHMENT_NAME_MAX}
                placeholder="Kendi aparatın (ör. MAG tutamağı)"
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  // Enter formu göndermesin, aparatı eklesin.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    add(draft);
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={() => add(draft)} disabled={!draft.trim()}>
                <Plus data-icon="inline-start" />
                Ekle
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ATTACHMENT_SUGGESTIONS.filter((suggestion) => !names.includes(suggestion)).map((suggestion) => (
                <Button key={suggestion} type="button" variant="outline" size="xs" onClick={() => add(suggestion)}>
                  <Plus data-icon="inline-start" />
                  {suggestion}
                </Button>
              ))}
            </div>

            <FieldDescription>
              Bu cihazdaki tutamaçlar. Egzersizde hangisiyle yapıldığı seçilir. Danışan hangisini takacağını
              görsün diye soldaki kareye dokunup fotoğraf ekleyebilirsin: PNG, JPG ya da WebP; en fazla 1 MB.
            </FieldDescription>
            <FieldError>{imageError ?? field.errors?.[0]}</FieldError>
          </Field>
        );
      }}
    </FormField>
  );
}

/** Sayı alanı: Formisch değeri metin verir, şema sayı bekler. */
function NumberField({
  form,
  path,
  label,
  description,
}: {
  form: ReturnType<typeof useForm<typeof deviceFormSchema>>;
  path: 'baseKg' | 'stepKg' | 'maxKg';
  label: string;
  description?: string;
}) {
  return (
    <FormField of={form} path={[path]}>
      {(field) => (
        <Field data-invalid={Boolean(field.errors) || undefined}>
          <FieldLabel htmlFor={path}>{label}</FieldLabel>
          <Input
            {...field.props}
            id={path}
            type="number"
            step="0.25"
            min="0"
            className="tabular-nums"
            value={field.input ?? ''}
            onChange={(event) =>
              setInput(form, {
                path: [path],
                input: event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber,
              })
            }
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{field.errors?.[0]}</FieldError>
        </Field>
      )}
    </FormField>
  );
}

/**
 * Cihaz ekleme/düzenleme formu — kendi sayfasında (modal değil). Alanlar türe göre
 * değişir; altta cihazda ayarlanabilen ağırlıkların canlı önizlemesi var.
 */
export function DeviceForm({ editing }: { editing: Device | null }) {
  const router = useRouter();
  // Görsel formun şemasında yok; ayrı uçtan yönetilir.
  const start: FormStart = editing ? (({ id: _id, image: _image, ...rest }) => rest)(editing) : BLANK;
  const form = useForm({ schema: deviceFormSchema, initialInput: start });
  const [weightsText, setWeightsText] = useState((start.weightsKg ?? []).map(kgText).join(' '));
  const [image, setImage] = useState<ImageChange>(KEEP);
  const [imageError, setImageError] = useState<string | null>(null);
  // Aparat görselleri de kaydetmede uygulanır: aparat adına göre bekleyen değişiklik.
  const [attachmentImages, setAttachmentImages] = useState<Record<string, ImageChange>>({});
  const currentImageUrl = editing ? deviceImageUrl(editing) : null;

  const setAttachmentImage = (name: string, change: ImageChange | null) =>
    setAttachmentImages(({ [name]: _dropped, ...rest }) => (change ? { ...rest, [name]: change } : rest));

  const save = useServiceMutation({
    fn: async (values: DeviceInput) => {
      const { id } = await fetchJson<{ id: string }>('/api/devices', {
        method: 'POST',
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      });

      // Görseller ayrı uçlardan gider; her biri repo'ya yazdığı için sırayla gönderilir.
      // Cihaz kaydedildiyse görsel hatası kaydı geri almaz, yalnız bildirilir.
      const failures: string[] = [];
      const send = async (task: () => Promise<unknown>) => {
        try {
          await task();
        } catch (error) {
          failures.push(error instanceof ApiError ? error.message : 'Görsel yüklenemedi.');
        }
      };
      const upload = (path: string, file: File, fields?: Record<string, string>) => {
        const body = new FormData();
        body.set('image', file);
        for (const [key, value] of Object.entries(fields ?? {})) body.set(key, value);
        return fetchJson(path, { method: 'POST', body });
      };

      if (image.kind === 'upload') await send(() => upload(`/api/devices/${id}/image`, image.file));
      else if (image.kind === 'remove') await send(() => fetchJson(`/api/devices/${id}/image`, { method: 'DELETE' }));

      // Listeden çıkarılan aparatın bekleyen görseli boşuna gönderilmesin.
      const kept = new Set((values.attachments ?? []).map((attachment) => attachment.name));
      for (const [name, change] of Object.entries(attachmentImages)) {
        if (!kept.has(name)) continue;
        const path = `/api/devices/${id}/attachments/image`;
        if (change.kind === 'upload') await send(() => upload(path, change.file, { name }));
        else if (change.kind === 'remove') {
          await send(() => fetchJson(`${path}?name=${encodeURIComponent(name)}`, { method: 'DELETE' }));
        }
      }

      return { id, mediaFailed: failures[0] ?? null };
    },
    invalidate: [['devices'], ['exercises']],
    notify: { success: editing ? 'Cihaz güncellendi.' : 'Cihaz eklendi.' },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: ({ id, mediaFailed }) => {
      if (mediaFailed) {
        toast.error(`Cihaz kaydedildi ama görsel yüklenemedi: ${mediaFailed}`);
        router.push(`/dashboard/devices/${id}/edit`);
      } else {
        router.push(`/dashboard/devices/${id}`);
      }
      router.refresh();
    },
  });

  const hiddenError = getDeepError(form);

  return (
    <Form of={form} className="grid gap-x-8 gap-y-6 lg:grid-cols-2" onSubmit={(values) => save.mutateAsync(values as DeviceInput).catch(() => undefined)}>
      <div className="flex flex-col gap-5">
        <FormField of={form} path={['name']}>
          {(field) => (
            <Field data-invalid={Boolean(field.errors) || undefined}>
              <FieldLabel htmlFor="name">Cihaz adı</FieldLabel>
              <Input {...field.props} id="name" value={field.input ?? ''} placeholder="Ör. Technogym chest press" />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>

        <FormField of={form} path={['kind']}>
          {(field) => (
            <Field>
              <FieldLabel htmlFor="kind">Tür</FieldLabel>
              <LabeledSelect
                id="kind"
                value={field.input}
                labels={DEVICE_KIND_LABELS}
                onChange={(kind) => {
                  setInput(form, { path: ['kind'], input: kind });
                  // Yeni türün yaygın ayarları gelsin; PT sonra değiştirir.
                  const defaults = KIND_DEFAULTS[kind];
                  setInput(form, { path: ['baseKg'], input: defaults.baseKg });
                  setInput(form, { path: ['stepKg'], input: defaults.stepKg });
                  setInput(form, { path: ['maxKg'], input: defaults.maxKg });
                  setInput(form, { path: ['addOnsKg'], input: defaults.addOnsKg ? [...defaults.addOnsKg] : undefined });
                  setInput(form, { path: ['pulleyRatio'], input: defaults.pulleyRatio });
                  setInput(form, { path: ['weightsKg'], input: defaults.weightsKg ? [...defaults.weightsKg] : undefined });
                  setWeightsText((defaults.weightsKg ?? []).map(kgText).join(' '));
                }}
              />
            </Field>
          )}
        </FormField>

        <ImageField
          currentUrl={currentImageUrl}
          change={image}
          onChange={setImage}
          error={imageError}
          onError={setImageError}
        />

        <FormField of={form} path={['notes']}>
          {(field) => (
            <Field>
              <FieldLabel htmlFor="notes">Not</FieldLabel>
              <Textarea {...field.props} id="notes" rows={2} value={field.input ?? ''} placeholder="Ör. pim ağırlığı eklenebilir" />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>
      </div>

      <FormField of={form} path={['kind']}>
        {(kindField) => {
          const kind = kindField.input ?? 'selectorized';
          const hasLoads = needsBase(kind) || needsWeights(kind);
          return (
            <FieldSet>
              <FieldLegend>Ağırlık ayarı</FieldLegend>
              {!hasLoads && !takesAttachments(kind) ? (
                <FieldDescription>
                  Bu türde ağırlık ayarı yok; ilerleme tekrar ya da süreyle olur.
                </FieldDescription>
              ) : null}

              {needsBase(kind) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField form={form} path="baseKg" label={BASE_LABELS[kind] ?? 'Başlangıç (kg)'} />
                  {needsStep(kind) ? (
                    <NumberField
                      form={form}
                      path="stepKg"
                      label={kind === 'selectorized' || kind === 'cable' ? 'Blok adımı (kg)' : 'En küçük artış (kg)'}
                      description={kind === 'barbell' || kind === 'plate_loaded' ? 'İki yana birer en küçük plaka: 1,25 kg ise 2,5.' : undefined}
                    />
                  ) : null}
                  {needsMax(kind) || kind === 'plate_loaded' ? (
                    <NumberField
                      form={form}
                      path="maxKg"
                      label={kind === 'plate_loaded' ? 'En çok (kg, isteğe bağlı)' : 'En ağır blok (kg)'}
                    />
                  ) : null}
                </div>
              ) : null}

              {takesAddOns(kind) ? (
                <FormField of={form} path={['addOnsKg']}>
                  {(field) => (
                    <Field>
                      <FieldLabel>Ara ağırlıklar</FieldLabel>
                      <ToggleGroup
                        multiple
                        variant="outline"
                        size="sm"
                        className="flex-wrap justify-start"
                        aria-label="Ara ağırlıklar"
                        value={(field.input ?? []).map(String)}
                        onValueChange={(value) =>
                          setInput(form, { path: ['addOnsKg'], input: (value as string[]).map(Number).sort((a, b) => a - b) })
                        }>
                        {ADD_ON_OPTIONS.map((option) => (
                          <ToggleGroupItem key={option} value={String(option)} className="tabular-nums">
                            +{kgText(option)} kg
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <FieldDescription>
                        Bloğa takılan küçük ağırlıklar. Birlikte de takılabilir; öneriler ara değerleri de kullanır.
                      </FieldDescription>
                      <FieldError>{field.errors?.[0]}</FieldError>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {kind === 'cable' ? (
                <FormField of={form} path={['pulleyRatio']}>
                  {(field) => (
                    <Field>
                      <FieldLabel>Makara</FieldLabel>
                      <ToggleGroup
                        variant="outline"
                        size="sm"
                        spacing={0}
                        aria-label="Makara oranı"
                        value={[String(field.input ?? 1)]}
                        onValueChange={(value) => {
                          const next = Number(value[0]) as PulleyRatio;
                          if (next) setInput(form, { path: ['pulleyRatio'], input: next });
                        }}>
                        {PULLEY_RATIOS.map((ratio) => (
                          <ToggleGroupItem key={ratio} value={String(ratio)} className="px-3 tabular-nums">
                            {ratio === 1 ? 'Tek (1:1)' : ratio === 2 ? 'Çift (2:1)' : `${ratio}:1`}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <FieldDescription>{PULLEY_HELP[(field.input ?? 1) as PulleyRatio]}</FieldDescription>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {takesAttachments(kind) ? (
                <AttachmentsField
                  form={form}
                  deviceId={editing?.id ?? null}
                  images={attachmentImages}
                  onImage={setAttachmentImage}
                />
              ) : null}

              {needsWeights(kind) ? (
                <FormField of={form} path={['weightsKg']}>
                  {(field) => (
                    <Field data-invalid={Boolean(field.errors) || undefined}>
                      <FieldLabel htmlFor="weightsKg">Setteki ağırlıklar (kg)</FieldLabel>
                      <Textarea
                        id="weightsKg"
                        rows={2}
                        className="tabular-nums"
                        value={weightsText}
                        onChange={(event) => {
                          setWeightsText(event.currentTarget.value);
                          setInput(form, { path: ['weightsKg'], input: parseWeights(event.currentTarget.value) });
                        }}
                        placeholder="2 4 6 8 10 12,5"
                      />
                      <FieldDescription>Boşlukla ayır; ondalık için virgül. Sette olmayan ağırlık önerilmez.</FieldDescription>
                      <FieldError>{field.errors?.[0]}</FieldError>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {hasLoads ? <LoadsPreview form={form} kind={kind} /> : null}
            </FieldSet>
          );
        }}
      </FormField>

      {hiddenError ? (
        <Alert variant="destructive" className="lg:col-span-2">
          <WarningCircle />
          <AlertTitle>Form gönderilemedi</AlertTitle>
          <AlertDescription>{hiddenError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4 lg:col-span-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={editing ? `/dashboard/devices/${editing.id}` : '/dashboard/devices'} />}>
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

/** Cihazda ayarlanabilen ağırlıkların canlı önizlemesi (öneriler bunlardan seçilir). */
function LoadsPreview({ form, kind }: { form: ReturnType<typeof useForm<typeof deviceFormSchema>>; kind: DeviceKind }) {
  return (
    <FormField of={form} path={['baseKg']}>
      {(base) => (
        <FormField of={form} path={['stepKg']}>
          {(step) => (
            <FormField of={form} path={['maxKg']}>
              {(max) => (
                <FormField of={form} path={['addOnsKg']}>
                  {(addOns) => (
                    <FormField of={form} path={['weightsKg']}>
                      {(weights) => {
                        const settings: DeviceLoadSettings = {
                          kind,
                          baseKg: base.input ?? undefined,
                          stepKg: step.input ?? undefined,
                          maxKg: max.input ?? undefined,
                          addOnsKg: (addOns.input ?? []).filter((value): value is number => typeof value === 'number'),
                          weightsKg: (weights.input ?? []).filter((value): value is number => typeof value === 'number'),
                        };
                        const loads = deviceLoads(settings);
                        const shown = loads?.slice(0, 24) ?? [];
                        return (
                          <Field>
                            <FieldLabel>Ayarlanabilen ağırlıklar</FieldLabel>
                            {loads?.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {shown.map((load) => (
                                  <Badge key={load} variant="secondary" className="tabular-nums">
                                    {kgText(load)}
                                  </Badge>
                                ))}
                                {loads.length > shown.length ? (
                                  <Badge variant="outline" className="tabular-nums">
                                    +{loads.length - shown.length} ağırlık daha
                                  </Badge>
                                ) : null}
                              </div>
                            ) : (
                              <FieldDescription>Ayarları doldurunca burada görünür.</FieldDescription>
                            )}
                          </Field>
                        );
                      }}
                    </FormField>
                  )}
                </FormField>
              )}
            </FormField>
          )}
        </FormField>
      )}
    </FormField>
  );
}

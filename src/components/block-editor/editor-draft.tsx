'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getInput, setInput, useField, type FormSchema, type FormStore } from '@formisch/react';
import { ClockCounterClockwise } from '@phosphor-icons/react';
import type * as v from 'valibot';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatRecent } from '@/lib/format';
import {
  DRAFT_PREFIX,
  DRAFT_VERSION,
  draftConflict,
  draftDiffers,
  parseDraft,
  serializeDraft,
  type DraftBase,
  type EditorDraft,
} from '@/lib/unsaved-changes';

/**
 * Düzenleyicinin yerel taslağı (tasarım PT kararı 16). Kaydedilmemiş değişiklik varken formun
 * bütün girdisi bu tarayıcıya yazılır (localStorage, ~500 ms bekleyerek); sayfa yenilenir,
 * sekme kapanır ya da geri tuşuyla çıkılırsa iş kaybolmaz. Düzenleyici yeniden açılınca taslak
 * yüklenen hâlden farklıysa formun üstünde sunulur, kendiliğinden hiç uygulanmaz.
 *
 * Depo her erişimde try/catch içinde: gizli pencere ya da dolu depo taslaksız çalışır. Taslak
 * danışana gitmez; yayın yine yalnız Kaydet'le (değişiklik kaydı ve danışanın ekranı).
 */

/** Her tuşta değil, duraklayınca yazılır. */
const WRITE_DELAY = 500;

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Depo kapalı ya da dolu: taslaksız devam (çıkış uyarısı yine tutar).
  }
}

function removeRaw(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Depo kapalı: silinecek taslak da yok.
  }
}

/** Açık düzenleyicilerin durdurucuları: dışarıdan atılan taslağı düzenleyici yeniden yazmasın. */
const stoppers = new Map<string, Set<() => void>>();

/** Taslağı atar, o anahtardaki açık düzenleyici de yazmayı bırakır (ör. program silinince). */
export function discardDraft(key: string): void {
  for (const stop of stoppers.get(key) ?? []) stop();
  removeRaw(key);
}

/** Bütün taslakları atar: PT çıkış yapınca (aynı tarayıcıyı başkası kullanabilir). */
export function discardAllDrafts(): void {
  for (const set of stoppers.values()) for (const stop of set) stop();
  try {
    const store = window.localStorage;
    const keys = Array.from({ length: store.length }, (_, index) => store.key(index)).filter((key) => key?.startsWith(DRAFT_PREFIX));
    for (const key of keys) if (key) store.removeItem(key);
  } catch {
    // Depo kapalı: taslak da yok.
  }
}

export type DraftOffer = {
  savedAt: string;
  /** Taslaktan sonra kayıt başka bir yerde değişti. */
  conflict: boolean;
};

export type EditorDraftController<TBase extends DraftBase> = {
  /** Açılışta bulunan, yüklenen hâlden farklı taslak (karar bekliyor). */
  offer: DraftOffer | null;
  /** "Taslağa devam et": formun girdisi taslak olur, Kaydet belirir. */
  restore: () => void;
  /** "At": sunulan taslak silinir. */
  dismiss: () => void;
  /** Kaydedildi ya da kaydetmeden çıkılıyor: taslak silinir, bu düzenleyici bir daha yazmaz. */
  discard: () => void;
  /**
   * Kayıtta gönderilecek sürüm. Çakışan taslağa devam edildiyse taslağınki: sunucu 412 döner,
   * formun "başka bir yerde değişti" uyarısı çıkar (başkasının kaydı sessizce ezilmez).
   */
  saveBase: TBase;
  /** Taslağa devam edilince artar: düzenleyici baştan çizilsin (`key`). */
  generation: number;
  /** Formun girdisi değişti (`DraftAutosave` çağırır). */
  sync: () => void;
};

export function useEditorDraft<TSchema extends v.GenericSchema<Record<string, unknown>>, TBase extends DraftBase>({
  form,
  schema,
  storageKey,
  base,
  baseSchema,
}: {
  form: FormStore<TSchema>;
  schema: TSchema;
  /** `templateDraftKey` ya da `programDraftKey`. */
  storageKey: string;
  /** Yüklenen verinin sürümü (kayıtta gönderilen). */
  base: TBase;
  baseSchema: v.GenericSchema<unknown, TBase>;
}): EditorDraftController<TBase> {
  const [offer, setOffer] = useState<EditorDraft<TBase> | null>(null);
  const [continued, setContinued] = useState<{ base: TBase } | null>(null);
  const [generation, setGeneration] = useState(0);
  // Zamanlayıcı ve olay dinleyicileri güncel değerleri buradan okur.
  const state = useRef({ offer: null as EditorDraft<TBase> | null, writeBase: base, stopped: false, wasDirty: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const write = useCallback(() => {
    timer.current = null;
    if (state.current.stopped || !form.isDirty) return;
    const savedAt = new Date().toISOString();
    writeRaw(storageKey, serializeDraft({ version: DRAFT_VERSION, base: state.current.writeBase, savedAt, input: getInput(form) }));
  }, [form, storageKey]);

  /** Bekleyen yazımı hemen yapar (sayfa kapanırken, düzenleyiciden çıkarken). */
  const flush = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    write();
  }, [write]);

  const present = useCallback((draft: EditorDraft<TBase> | null) => {
    state.current.offer = draft;
    setOffer(draft);
  }, []);

  // Açılış: depodaki taslak okunur (sunucu çiziminden sonra). Bozuksa ya da yüklenenle aynıysa silinir.
  useEffect(() => {
    const raw = readRaw(storageKey);
    if (raw === null) return;
    const draft = parseDraft(raw, schema, baseSchema);
    if (draft && draftDiffers(draft.input, getInput(form))) present(draft);
    else if (!form.isDirty) removeRaw(storageKey);
  }, [form, schema, baseSchema, storageKey, present]);

  useEffect(() => {
    if (!continued) state.current.writeBase = base;
  }, [base, continued]);

  useEffect(() => {
    const stop = () => {
      state.current.stopped = true;
      cancel();
    };
    const set = stoppers.get(storageKey) ?? new Set();
    set.add(stop);
    stoppers.set(storageKey, set);
    // Yenileme ve sekme kapanması: son değişiklik de yazılsın.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      set.delete(stop);
      if (set.size === 0) stoppers.delete(storageKey);
      // Geri tuşu gibi durdurulamayan çıkış: bekleyen yazım kaybolmasın.
      flush();
    };
  }, [storageKey, cancel, flush]);

  const sync = useCallback(() => {
    const current = state.current;
    if (current.stopped) return;
    if (form.isDirty) {
      current.wasDirty = true;
      cancel();
      timer.current = setTimeout(write, WRITE_DELAY);
      return;
    }
    // Açılıştaki temiz hâl taslağa dokunmaz (sunulan taslak karar bekliyor olabilir).
    if (!current.wasDirty) return;
    // Yüklenen hâle geri dönüldü: kaydedilmemiş iş yok. Karar bekleyen taslak varsa o geri yazılır.
    current.wasDirty = false;
    cancel();
    if (current.offer) writeRaw(storageKey, serializeDraft(current.offer));
    else removeRaw(storageKey);
  }, [form, storageKey, cancel, write]);

  const restore = useCallback(() => {
    const draft = state.current.offer;
    if (!draft) return;
    const saveBase = draftConflict(draft.base, base) ? draft.base : base;
    state.current.writeBase = saveBase;
    setContinued({ base: saveBase });
    present(null);
    setInput(form, { input: draft.input as v.InferInput<TSchema> });
    setGeneration((value) => value + 1);
  }, [form, base, present]);

  const dismiss = useCallback(() => {
    present(null);
    // Bu arada değişiklik yapıldıysa depodaki artık bugünkü iştir; yapılmadıysa sunulan taslak.
    if (form.isDirty) return;
    cancel();
    removeRaw(storageKey);
  }, [form, storageKey, cancel, present]);

  const discard = useCallback(() => {
    state.current.stopped = true;
    cancel();
    removeRaw(storageKey);
    present(null);
  }, [storageKey, cancel, present]);

  return {
    offer: offer ? { savedAt: offer.savedAt, conflict: draftConflict(offer.base, base) } : null,
    restore,
    dismiss,
    discard,
    saveBase: continued ? continued.base : base,
    generation,
    sync,
  };
}

/**
 * Formun bütün girdisine abone olur ve her değişiklikte taslağı eşitler; kendisi bir şey
 * çizmez. Formisch'te boş yol formun köküdür: `.input` okumak bütün alanlara abone eder, böylece
 * her tuşta düzenleyici değil yalnız bu bileşen yeniden çizilir.
 */
export function DraftAutosave<TSchema extends FormSchema>({ form, onChange }: { form: FormStore<TSchema>; onChange: () => void }) {
  const input = useField(form, { path: [] as never }).input;
  useEffect(() => {
    onChange();
  }, [input, onChange]);
  return null;
}

/** Formun üstündeki taslak uyarısı: [Taslağa devam et] [At]. */
export function DraftNotice({
  offer,
  timeZone,
  onRestore,
  onDismiss,
}: {
  offer: DraftOffer;
  timeZone: string;
  onRestore: () => void;
  onDismiss: () => void;
}) {
  return (
    <Alert>
      <ClockCounterClockwise />
      <AlertTitle>Kaydedilmemiş bir taslağın var · {formatRecent(offer.savedAt, timeZone)}</AlertTitle>
      {offer.conflict ? (
        <AlertDescription>Bu arada başka bir yerde kaydedildi; devam edersen kaydederken çakışma uyarısı çıkar.</AlertDescription>
      ) : null}
      <div className="col-start-2 mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" className="touch:h-11" onClick={onRestore}>
          Taslağa devam et
        </Button>
        <Button type="button" variant="outline" size="sm" className="touch:h-11" onClick={onDismiss}>
          At
        </Button>
      </div>
    </Alert>
  );
}

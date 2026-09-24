'use client';

import { createContext, useContext } from 'react';
import type { FormStore } from '@formisch/react';
import type { blocksHostSchema } from '@/lib/schemas/template';
import type { EditorDevice, IdSource, PickerExercise } from '@/lib/template-edit';
import type { TemplateBlock, TemplateRow } from '@/lib/template-plan';

/** Blokları kökte tutan form tipi. Gerçek form başka şekilde olabilir (program); yol öneki `path`'tedir. */
export type BlocksFormStore = FormStore<typeof blocksHostSchema>;

/** Blok dizisinin formdaki yolu (sonu her zaman 'blocks'). */
export type BlocksPath = readonly ['blocks'] | readonly ['phases', number, 'days', number, 'blocks'];

/** Formisch yolu: tip, blokları kökte tutan forma göre denetlenir; çalışma zamanında gerçek önek kullanılır. */
export function blockField<const T extends readonly (string | number)[]>(path: BlocksPath, ...rest: T): ['blocks', ...T] {
  return [...path, ...rest] as unknown as ['blocks', ...T];
}

/** Set tablosunda odaklanılabilen sütunlar. */
export type SetColumn = 'min' | 'max' | 'pct';

/** Set tablosundaki kutunun DOM kimliği (Enter ile sonraki sete geçiş, "Set ekle" sonrası odak). */
export function setInputId(rowId: string, index: number, column: SetColumn): string {
  return `set-${rowId}-${index}-${column}`;
}

/** Düzenleyicinin ortak durumu: form, bloklar ve yapısal işlemler (block-editor.tsx sağlar). */
export type Editor = {
  form: BlocksFormStore;
  /** Blok dizisinin formdaki yolu (şablonda `['blocks']`, programda günün blokları). */
  path: BlocksPath;
  /** Yeni blok ve satır kimlikleri: şablonda şablonun, programda bütün programın kimliklerini bilir. */
  newIds: (blocks: readonly TemplateBlock[]) => IdSource;
  /** Satır notunun altındaki açıklama. */
  noteHint: string;
  /** Ekrandaki bloklar (çizim için). İşlemler `update` ile olay anındaki güncel bloklara uygulanır. */
  blocks: TemplateBlock[];
  /** Blokları günceller ve forma tek seferde yazar; satır vurgusu ve ekran okuyucu duyurusu isteğe bağlı. */
  update: (change: (blocks: TemplateBlock[]) => TemplateBlock[], options?: { highlight?: string; announce?: string }) => void;
  /** Geri alınabilir güncelleme: önceki hâl saklanır, bildirimde "Geri al" çıkar. */
  updateWithUndo: (change: (blocks: TemplateBlock[]) => TemplateBlock[], message: string) => void;
  exercises: ReadonlyMap<string, PickerExercise>;
  exerciseList: readonly PickerExercise[];
  devices: ReadonlyMap<string, EditorDevice>;
  deviceList: readonly EditorDevice[];
  labels: ReadonlyMap<string, string>;
  /** Ayrıntıları (kural, cihaz, not) açık satırlar. */
  expanded: ReadonlySet<string>;
  toggleExpanded: (rowId: string) => void;
  /** Set tablosu açık satırlar. */
  expandedSets: ReadonlySet<string>;
  toggleSets: (rowId: string) => void;
  openSets: (rowId: string) => void;
  /** Set tablosundaki bir kutuya odaklanır (çizimden sonra). */
  focusSet: (rowId: string, index: number, column: SetColumn) => void;
  highlight: string | null;
  startReplace: (rowId: string) => void;
};

export const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('Hareket düzenleyicinin içinde kullanılmalı.');
  return editor;
}

/** Satırın başlığı: egzersizin adı; kütüphanede yoksa "Silinmiş egzersiz". */
export function rowTitle(row: TemplateRow, exercises: ReadonlyMap<string, PickerExercise>): string {
  return exercises.get(row.exerciseId)?.title ?? 'Silinmiş egzersiz';
}

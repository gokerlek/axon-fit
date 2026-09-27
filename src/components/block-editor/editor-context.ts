'use client';

import { createContext, useContext } from 'react';
import type { FormStore } from '@formisch/react';
import type { EditorCare } from '@/lib/constraint-filter';
import type { ReorderTarget } from '@/lib/reorder';
import type { blocksHostSchema } from '@/lib/schemas/template';
import type { SetSpec } from '@/lib/set-plan';
import type { EditorDevice, IdSource, PickerExercise } from '@/lib/template-edit';
import { BLOCK_KIND_LABELS, type TemplateBlock, type TemplateRow } from '@/lib/template-plan';

/** Blokları kökte tutan form tipi. Gerçek form başka şekilde olabilir (program); yol öneki `path`'tedir. */
export type BlocksFormStore = FormStore<typeof blocksHostSchema>;

/** Blok dizisinin formdaki yolu (sonu her zaman 'blocks'). */
export type BlocksPath = readonly ['blocks'] | readonly ['phases', number, 'days', number, 'blocks'];

/** Formisch yolu: tip, blokları kökte tutan forma göre denetlenir; çalışma zamanında gerçek önek kullanılır. */
export function blockField<const T extends readonly (string | number)[]>(path: BlocksPath, ...rest: T): ['blocks', ...T] {
  return [...path, ...rest] as unknown as ['blocks', ...T];
}

/** Set satırlarında odaklanılabilen sütunlar. */
export type SetColumn = 'min' | 'max' | 'pct';

/** Set satırındaki kutunun DOM kimliği (Enter ile sonraki sete geçiş). */
export function setInputId(rowId: string, index: number, column: SetColumn): string {
  return `set-${rowId}-${index}-${column}`;
}

/**
 * Kartın yüzünün DOM kimliği. Öğe kimliği: tek harekette ve üyede satırın, grupta bloğun
 * kimliği (taşıma, gruplama ve gruptan çıkarma satır kimliğini korur; odak ona döner).
 */
export function faceId(itemId: string): string {
  return `face-${itemId}`;
}

/** "Hareketler" başlığının DOM kimliği (odaklanabilir): taslak uyarısı kalkınca, kart yoksa odak buraya. */
export const EDITOR_HEADING_ID = 'editor-heading';

/**
 * Düzenleyicinin başına odaklanır (çizimden sonra): ilk kartın yüzü, kart yoksa "Hareketler" başlığı.
 * Taslak uyarısındaki [Taslağa devam et] / [At] sonrası odak `<body>`'ye düşmesin.
 */
export function focusEditorStart(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target =
        document.querySelector<HTMLElement>('[data-editor-list] button[id^="face-"]') ?? document.getElementById(EDITOR_HEADING_ID);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    }),
  );
}

/** Kartın açık gövdesinin DOM kimliği (`aria-controls`). */
export function bodyId(itemId: string): string {
  return `body-${itemId}`;
}

/** Geri alınabilir güncellemenin seçenekleri. */
export type UndoOptions = {
  /** Sonra vurgulanacak öğe (1,2 sn). */
  highlight?: string;
  /** Çizimden sonra yüzüne odaklanılacak öğe. */
  focus?: string;
};

/**
 * Satırın danışan hedefi (programda, tasarım §6.2): metin ("hedef 10–14 · 26 Eyl"), danışanın setleri ve
 * dayandığı (PT'nin) setler. Satırın bugünkü setleri dayandığı setlere eşitken hedef geçerlidir.
 */
export type RowClientTarget = { text: string; sets: SetSpec[]; baseSets: SetSpec[] };

/** Kartın işlemleri (kaydırma panelleri, açık gövdedeki düğmeler, yüzdeki klavye kısayolları). */
export type ItemActions = {
  /** 🗑: tek hareket, üye ya da grubun tamamı (8 sn "Geri al"). */
  remove: (itemId: string) => void;
  /** Üyeyi gruptan çıkarır. */
  ungroup: (rowId: string) => void;
  /** Grubu dağıtır (her üye tek hareket olur). */
  dissolve: (blockId: string) => void;
  /** Klavyeyle taşıma (Alt+↑/↓, Alt+Home/End). */
  step: (itemId: string, target: ReorderTarget) => void;
  /** Alt+→: önceki blokla gruplar. */
  groupWithPrevious: (itemId: string) => void;
  /** Alt+←: üyede gruptan çıkar, grup yüzünde grubu dağıt. */
  split: (itemId: string) => void;
};

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
  /** Olay anındaki güncel bloklar (formdan). */
  current: () => TemplateBlock[];
  /** Blokları günceller ve forma tek seferde yazar; satır vurgusu ve ekran okuyucu duyurusu isteğe bağlı. */
  update: (change: (blocks: TemplateBlock[]) => TemplateBlock[], options?: { highlight?: string; announce?: string }) => void;
  /** Geri alınabilir güncelleme: önceki hâl saklanır, bildirimde "Geri al" çıkar (8 sn); cümleyi toast'un canlı bölgesi okur (tek canlı bölge). */
  updateWithUndo: (change: (blocks: TemplateBlock[]) => TemplateBlock[], message: string, options?: UndoOptions) => void;
  /** Ekran okuyucuya kibarca duyurur (sheet açıksa kapanınca). */
  announce: (text: string) => void;
  exercises: ReadonlyMap<string, PickerExercise>;
  exerciseList: readonly PickerExercise[];
  devices: ReadonlyMap<string, EditorDevice>;
  deviceList: readonly EditorDevice[];
  labels: ReadonlyMap<string, string>;
  /** Açık kartlar (öğe kimliği). lg altında aynı anda tek kart açık. */
  open: ReadonlySet<string>;
  toggleOpen: (itemId: string) => void;
  /** Kartı kapatır (bırakınca kart kapalı oturur). */
  close: (itemId: string) => void;
  /** Kartı kapatır ve odağı yüzüne verir (Esc). */
  closeAndFocus: (itemId: string) => void;
  /** "Setleri ayrı düzenle": kullanıcının açıp kapattıkları (yoksa setlerin düzenine göre). */
  setsOpen: ReadonlyMap<string, boolean>;
  setSetsOpen: (rowId: string, open: boolean) => void;
  /** "Ayrıntılar · (cihaz ·) kural · not" açık satırlar. */
  detailsOpen: ReadonlySet<string>;
  toggleDetails: (rowId: string) => void;
  /**
   * Kart yüzündeki "Cihazı değiştir" (meta satırındaki cihaz): kartı ve Ayrıntılar'ı açar, cihaz
   * seçicisi görünür yere kaydırılıp açılır (salonda cihaz doluyken iki dokunuş: cihaz, yenisi).
   */
  openDevice: (rowId: string) => void;
  /** Açılmayı bekleyen cihaz seçicisi (satır kimliği; her istekte yeni `nonce`); seçici açınca `settleDevice`. */
  deviceRequest: { rowId: string; nonce: number } | null;
  settleDevice: () => void;
  /** Set satırlarındaki bir kutuya odaklanır (çizimden sonra). */
  focusSet: (rowId: string, index: number, column: SetColumn) => void;
  highlight: string | null;
  actions: ItemActions;
  /**
   * Seçim modu (tasarım §5): kartlarda onay kutusu; sürükleme, kaydırma, Alt kısayolları,
   * akordeon ve "+ Gruba hareket ekle" kapalı.
   */
  selecting: boolean;
  /** Seçili bloklar (blok kimliği; silinenler ayıklanmış). */
  selected: ReadonlySet<string>;
  /** Kartın kabına dokunma: seçer ya da bırakır; `range` (Shift) ise son dokunulandan buraya kadar seçer. */
  toggleSelect: (blockId: string, range: boolean) => void;
  /** Grubun sonundaki "+ Gruba hareket ekle": kütüphane sheet'ini grubun kipinde açar. */
  openAddToGroup: (blockId: string, event: React.MouseEvent<HTMLElement>) => void;
  /** İlk kullanımda bir kez sola "göz kırpacak" kart (öğe kimliği; dokunmatikte). */
  nudgeId: string | null;
  onNudged: () => void;
  /** Danışanın satır hedefleri (yalnız programda; satır kimliğiyle). */
  clientTargets: Readonly<Record<string, RowClientTarget>>;
  /** Danışanın kısıtları (yalnız programda): kart yüzünde rozet, egzersiz kimliğiyle. */
  care: EditorCare | null;
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

/** Grubun adı: türü ve sırası ("Süperset 2"). */
export function groupTitle(block: TemplateBlock, blockIndex: number): string {
  return `${BLOCK_KIND_LABELS[block.kind]} ${blockIndex + 1}`;
}

/**
 * Öğenin adı (duyurular, toast'lar, düğme adları): satırda hareketin adı, grupta türü ve
 * sırası. Bilinmeyen kimlikte boş.
 */
export function itemTitle(blocks: readonly TemplateBlock[], itemId: string, exercises: ReadonlyMap<string, PickerExercise>): string {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.id === itemId) {
      const only = block.rows[0];
      return block.kind === 'single' && only ? rowTitle(only, exercises) : groupTitle(block, blockIndex);
    }
    const row = block.rows.find((item) => item.id === itemId);
    if (row) return rowTitle(row, exercises);
  }
  return '';
}

/** Bloğun öğe kimliği: tek harekette satırın, grupta bloğun kimliği. */
export function blockItemId(block: TemplateBlock): string {
  return block.kind === 'single' ? (block.rows[0]?.id ?? block.id) : block.id;
}

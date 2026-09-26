'use client';

import { toast } from 'sonner';

let current: string | number | null = null;

/**
 * Dokunmatikte "Geri al" ve kapatma düğmesi 44 px (SPEC §6): düğme yüksekliği büyür, 20 px'lik ×'in
 * dokunma alanı görünmez bir katmanla genişler. Sonner'ın kendi ölçüleri özgül seçicide: `min-h` ve
 * `!` ile ezilir. Telefonda bildirimler altta, dock'un üstünde (`ui/sonner.tsx`).
 */
const TOUCH_CLASSES = {
  actionButton: 'touch:min-h-11 touch:px-3! touch:text-sm!',
  closeButton: "touch:before:absolute touch:before:-inset-3 touch:before:content-['']",
};

/**
 * "Geri al" bildirimi (8 sn). Aynı anda tek bildirim: yenisi öncekini kapatır (hareket
 * düzenleyicisi ve program formu ortak). "Sonrasında başka değişiklik yapıldı" denetimi
 * çağıranın `onUndo`'sundadır.
 */
export function showUndoToast(message: string, onUndo: () => void): void {
  if (current !== null) toast.dismiss(current);
  current = toast(message, { action: { label: 'Geri al', onClick: onUndo }, duration: 8000, classNames: TOUCH_CLASSES });
}

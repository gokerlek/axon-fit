'use client';

import { toast } from 'sonner';

let current: string | number | null = null;

/**
 * "Geri al" bildirimi (8 sn). Aynı anda tek bildirim: yenisi öncekini kapatır (hareket
 * düzenleyicisi ve program formu ortak). "Sonrasında başka değişiklik yapıldı" denetimi
 * çağıranın `onUndo`'sundadır.
 */
export function showUndoToast(message: string, onUndo: () => void): void {
  if (current !== null) toast.dismiss(current);
  current = toast(message, { action: { label: 'Geri al', onClick: onUndo }, duration: 8000 });
}

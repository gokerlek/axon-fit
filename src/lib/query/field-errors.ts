'use client';

import { setErrors, type FormStore } from '@formisch/react';
import { ApiError } from './errors';

/**
 * Sunucunun alan bazlı hatalarını forma basar (ör. "bu isim zaten kullanılıyor").
 *
 * Şema doğrulaması tarayıcıda yapılıyor ama bazı kurallar yalnız sunucuda bilinir;
 * o hatalar da alanın altında görünmeli, ekranın tepesinde balon olarak değil.
 */
export function applyFieldErrors(form: FormStore<never>, error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;

  const entries = Object.entries(error.fields);
  if (entries.length === 0) return false;

  for (const [path, message] of entries) {
    // @ts-expect-error — yol çalışma zamanında sunucudan gelir, şemadan türetilemez.
    setErrors(form, { path: path.split('.'), errors: [message] });
  }
  return true;
}

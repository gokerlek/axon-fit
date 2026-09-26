'use client';

import { useEffect } from 'react';
import { rememberClient } from '@/app/giris/remembered-client';

/**
 * `/me` her açıldığında kimlik telefona yazılır (yalnız kimlik; SPEC §5): eski akışla katılmış
 * danışan da çıkıştan sonra `/giris`'te kimlik yazmadan şifresiyle girer.
 */
export function RememberClient({ id }: { id: string }) {
  useEffect(() => rememberClient(id), [id]);
  return null;
}

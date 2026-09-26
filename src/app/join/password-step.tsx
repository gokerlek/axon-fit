'use client';

import { useRouter } from 'next/navigation';
import { SetPasswordForm } from '@/app/giris/set-password-form';

/** Kare kodla girişin ikinci adımı: şifre kaydedilince programa. */
export function JoinPasswordStep() {
  const router = useRouter();
  return <SetPasswordForm submitLabel="Şifreyi kaydet ve devam et" onDone={() => router.replace('/me')} />;
}

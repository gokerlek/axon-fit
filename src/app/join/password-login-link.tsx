'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useRememberedClient } from '@/app/giris/remembered-client';

/**
 * "Zaten hesabın var mı? Şifreyle gir": kimlik adresten ya da telefonda saklanandan biliniyorsa.
 * Kimlik bilinmiyorsa hiç çizilmez (danışan kimlik yazmaz).
 */
export function PasswordLoginLink({ clientId }: { clientId: string | null }) {
  const remembered = useRememberedClient();
  const id = clientId ?? remembered;
  if (!id) return null;
  return (
    <div className="flex flex-col items-center gap-1 border-t pt-4 text-center">
      <span className="text-sm text-muted-foreground">Zaten hesabın var mı?</span>
      <Button
        variant="outline"
        className="h-11 w-full"
        nativeButton={false}
        render={<Link href={clientId ? `/giris?c=${encodeURIComponent(clientId)}` : '/giris'} />}>
        Şifreyle gir
      </Button>
    </div>
  );
}

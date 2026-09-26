'use client';

import { SignOut } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/**
 * Çıkış (SPEC §5): sayfanın altında, ikincil; yanlış dokunuşla oturum kapanmasın diye onay
 * sorulur. Çıkış POST'tur (bağlantı önizlemesi tetiklemesin) ve yalnız danışan çerezini siler;
 * telefonda saklanan kimlik kalır, `/giris` şifreyle açılır. Şifresi olmayan danışana yeniden
 * girmek için yeni kare kod gerekeceği söylenir.
 */
export function LogoutButton({ hasPassword }: { hasPassword: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" className="h-11 w-full text-muted-foreground" />}>
        <SignOut data-icon="inline-start" weight="fill" />
        Çıkış
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Çıkış yapılsın mı?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasPassword
              ? 'Tekrar girmek için şifren gerekir; şifreni unuttuysan antrenörüne söyle.'
              : 'Henüz şifre belirlemedin: tekrar girmek için antrenöründen yeni bir kare kod istemen gerekir. İstersen önce yukarıdan şifre belirle.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Vazgeç</AlertDialogCancel>
          <form action="/api/auth/logout" method="post" className="contents">
            <input type="hidden" name="rol" value="danisan" />
            <Button type="submit" variant="destructive" className="h-11">
              Çıkış yap
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

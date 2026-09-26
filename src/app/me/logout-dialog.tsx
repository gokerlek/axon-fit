'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/**
 * Çıkış onayı (SPEC §5): avatar menüsündeki "Çıkış yap" açar; yanlış dokunuşla oturum kapanmasın
 * diye sorulur. Çıkış POST'tur (bağlantı önizlemesi tetiklemesin) ve yalnız danışan çerezini siler;
 * telefonda saklanan kimlik kalır, `/giris` şifreyle açılır. Şifresi olmayan danışana yeniden girmek
 * için yeni kare kod gerekeceği söylenir.
 */
export function LogoutDialog({
  open,
  onOpenChange,
  hasPassword,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPassword: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Çıkış yapılsın mı?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasPassword
              ? 'Tekrar girmek için şifren gerekir; şifreni unuttuysan antrenörüne söyle.'
              : "Henüz şifre belirlemedin: tekrar girmek için antrenöründen yeni bir kare kod istemen gerekir. İstersen önce Ayarlar'dan şifre belirle."}
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

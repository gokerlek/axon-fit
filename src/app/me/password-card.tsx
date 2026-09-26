'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Key } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { SetPasswordForm } from '@/app/giris/set-password-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Şifre kartı (SPEC §5): eski akışla (yalnız kare kodla) katılmış ya da kare koddan sonra şifre
 * adımını kapatmış danışan için; PT'nin sıfırlamasından (yeni kare kod) sonra da çıkar. Zorunlu
 * değil ama görünür: şifresi olmayan çıkış yaparsa yeniden girmek için yeni kare kod gerekir.
 * Telefonda programı aşağı itmesin diye form dokununca açılır.
 */
export function PasswordCard({ reset }: { reset: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key weight="fill" className="size-5 text-primary" />
          {reset ? 'Yeni şifreni belirle' : 'Bir dahaki girişin için şifre belirle'}
        </CardTitle>
        <CardDescription>
          {reset
            ? 'Yeni kare kodla girdin; eski şifren artık açmaz. Yeni şifreni belirle.'
            : 'Şifren olmazsa çıkış yapınca yeniden girmek için antrenöründen yeni kare kod istemen gerekir.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {open ? (
          <SetPasswordForm
            submitLabel="Şifreyi kaydet"
            onDone={() => {
              toast.success('Şifren kaydedildi.');
              router.refresh();
            }}
          />
        ) : (
          <Button className="h-11 w-full" onClick={() => setOpen(true)}>
            Şifre belirle
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

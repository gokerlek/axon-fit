'use client';

import { useRouter } from 'next/navigation';
import { FirstAidKit } from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { HealthConsentState } from '@/lib/client-status';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { HEALTH_CONSENT_VERSION, HEALTH_FIELD_INFO, type HealthField } from '@/lib/schemas/client';

/**
 * Sağlık verisi onayı (SPEC §9.4). PT modülü açsa da danışan onaylamadan hiçbir sağlık
 * kaydı tutulmaz; onay istendiği an geri çekilebilir. Metnin sürümü değişirse
 * (`HEALTH_CONSENT_VERSION`) yeniden sorulur.
 */
export function ConsentCard({ state, fields }: { state: Exclude<HealthConsentState, 'off'>; fields: HealthField[] }) {
  const router = useRouter();
  const decide = useServiceMutation({
    fn: (granted: boolean) =>
      fetchJson<{ ok: true }>('/api/me/consent', {
        method: 'POST',
        // Gösterilen liste ve metin sürümü: PT bu arada değiştirdiyse sunucu reddeder.
        body: JSON.stringify({ granted, fields, version: HEALTH_CONSENT_VERSION }),
      }),
    onSuccess: (_data, granted) => {
      toast.success(granted ? 'Onayın kaydedildi.' : 'Tercihin kaydedildi.');
      router.refresh();
    },
    // Liste değiştiyse güncelini göster.
    onError: () => router.refresh(),
  });

  const list = (
    <ul className="flex flex-col gap-3">
      {fields.map((field) => (
        <li key={field} className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{HEALTH_FIELD_INFO[field].label}</span>
          <span className="text-sm text-muted-foreground">{HEALTH_FIELD_INFO[field].description}</span>
        </li>
      ))}
    </ul>
  );

  if (state === 'granted') {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Sağlık takibi açık</CardTitle>
          <CardDescription>Onayın geçerli. Geri çekersen yeni sağlık kaydı tutulmaz.</CardDescription>
        </CardHeader>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Onayı geri çek</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Onayını geri çekmek istiyor musun?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bundan sonra ağrı, ölçüm ve kısıt bilgisi tutulmaz; antrenmanların kaydedilmeye devam eder. Daha önce
                  tutulanların silinmesini antrenöründen isteyebilirsin.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                <AlertDialogAction disabled={decide.isPending} onClick={() => decide.mutate(false)}>
                  {decide.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Geri çek
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    );
  }

  if (state === 'declined') {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Sağlık takibi kapalı</CardTitle>
          <CardDescription>Onay vermedin; sağlık bilgisi tutulmuyor. İstersen şimdi açabilirsin.</CardDescription>
        </CardHeader>
        <CardContent>{list}</CardContent>
        <CardFooter>
          <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            {decide.isPending ? <Spinner data-icon="inline-start" /> : null}
            Onaylıyorum
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FirstAidKit weight="fill" className="size-5 text-primary" />
          Sağlık bilgilerin
        </CardTitle>
        <CardDescription>
          {state === 'outdated'
            ? 'Antrenörün yeni bir bilgi eklemek istiyor ya da metin güncellendi. Yeniden onaylayana kadar sağlık kaydı tutulmaz.'
            : 'Antrenörün programını güvenle ayarlamak için şu bilgileri tutmak istiyor:'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list}
        <p className="text-sm text-muted-foreground">
          Bu bilgiler yalnız senin için açılmış gizli bir kayıtta durur ve yalnız antrenörün görür. Onay vermezsen hiçbiri
          tutulmaz, antrenmanların yine kaydedilir. Onayını istediğin an buradan geri çekebilirsin.
        </p>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          {decide.isPending && decide.variables ? <Spinner data-icon="inline-start" /> : null}
          Onaylıyorum
        </Button>
        <Button variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
          Şimdi değil
        </Button>
      </CardFooter>
    </Card>
  );
}

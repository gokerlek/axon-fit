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

/** Onay kartının cümlesi için kısa adlar: "antrenörün ağrı ve ölçüm kayıtlarını görebilir". */
const SHORT_NAMES: Record<HealthField, string> = {
  conditions: 'kısıt',
  readiness: 'hazır oluşluk',
  check_in: 'ağrı',
  measurements: 'ölçüm',
  screening: 'hareket taraması',
};

function listTr(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

/**
 * Sağlık verisi onayı (SPEC §9.4). PT modülü açsa da danışan onaylamadan hiçbir sağlık
 * kaydı tutulmaz; onay istendiği an geri çekilebilir. Metnin sürümü değişirse
 * (`HEALTH_CONSENT_VERSION`) yeniden sorulur. Telefon: karar düğmeleri 44 px, onaydan sonra da
 * kapsam listesi görünür (danışan neyin tutulduğunu her zaman görür).
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
          <CardTitle>Sağlık takibi</CardTitle>
          <CardDescription>
            Sağlık takibi açık: antrenörün {listTr(fields.map((field) => SHORT_NAMES[field]))} kayıtlarını görebilir.
            İstediğin zaman kapatabilirsin.
          </CardDescription>
        </CardHeader>
        <CardContent>{list}</CardContent>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" className="h-11 w-full" />}>Onayı geri çek</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Onayını geri çekmek istiyor musun?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bundan sonra ağrı, ölçüm ve kısıt bilgisi tutulmaz; antrenmanların kaydedilmeye devam eder. Daha önce
                  tutulanların silinmesini antrenöründen isteyebilirsin.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Vazgeç</AlertDialogCancel>
                <AlertDialogAction className="h-11" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
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
          <Button className="h-11 w-full" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
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
            ? 'Antrenörün sağlık takibini yeniden başlattı, yeni bir bilgi eklemek istiyor ya da metin güncellendi. Yeniden onaylayana kadar sağlık kaydı tutulmaz.'
            : 'Antrenörün programını güvenle ayarlamak için şu bilgileri tutmak istiyor:'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list}
        <p className="text-sm text-muted-foreground">
          Bu bilgileri yalnız antrenörün görür. Onay vermezsen hiçbiri tutulmaz; antrenmanların yine kaydedilir. İstediğin
          zaman kapatabilirsin.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button className="h-11 w-full" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          {decide.isPending && decide.variables ? <Spinner data-icon="inline-start" /> : null}
          Onaylıyorum
        </Button>
        <Button variant="outline" className="h-11 w-full" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
          Şimdi değil
        </Button>
      </CardFooter>
    </Card>
  );
}

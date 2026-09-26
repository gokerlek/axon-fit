import type { Metadata } from 'next';
import { FirstAidKit, Key } from '@phosphor-icons/react/dist/ssr';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canSetPassword, hasPassword, healthConsentState } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { readClientSession } from '@/lib/session';
import { ClientHeader } from '../client-header';
import { ConsentCard } from '../consent-card';
import { PasswordCard } from '../password-card';

export const metadata: Metadata = { title: 'Ayarlar' };

/**
 * Danışanın ayarları (avatar menüsünden): sağlık takibi onayı (ver / geri çek) ve şifre. Ana sayfada
 * yalnız karar bekleyenler durur (onay sorusu, şifresi olmayana şifre kartı); verilmiş kararlar burada.
 * Sayfa yetkiyi kendisi denetler (SPEC §5): kapatılmış erişim, arşiv ya da eski kuşak giremez.
 */
export default async function ClientSettingsPage() {
  const [client, config, session] = await Promise.all([currentClient(), readAppConfig(), readClientSession()]);
  const health = healthConsentState(client);
  const passwordSet = hasPassword(client.access);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <ClientHeader client={client} appName={config.appName} title="Ayarlar" back={{ href: '/me', label: 'Programım' }} />

      {health === 'off' ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FirstAidKit weight="fill" className="size-5 text-muted-foreground" />
              Sağlık takibi
            </CardTitle>
            <CardDescription>Kapalı: antrenörün sağlık takibini açmadı, sağlık kaydı tutulmuyor.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ConsentCard state={health} fields={client.modules.health.fields} />
      )}

      {canSetPassword(client.access, session ?? {}, new Date()) ? (
        <PasswordCard reset={Boolean(client.access.passwordSetAt)} />
      ) : (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key weight="fill" className="size-5 text-muted-foreground" />
              Şifre
            </CardTitle>
            <CardDescription>
              {passwordSet
                ? 'Şifren belirli. Unutursan ya da değiştirmek istersen antrenörüne söyle: yeni kare kodla girip yeni şifreni belirlersin.'
                : 'Şifre belirlemek için antrenöründen yeni bir kare kod iste.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}

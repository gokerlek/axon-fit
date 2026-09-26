import type { Metadata } from 'next';
import { canSetPassword, hasPassword, healthConsentState } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { readClientSession } from '@/lib/session';
import { ConsentCard } from './consent-card';
import { LogoutButton } from './logout-button';
import { PasswordCard } from './password-card';
import { ProgramCard } from './program-card';
import { RememberClient } from './remember-client';

export const metadata: Metadata = { title: 'Programım' };

/**
 * Danışan alanı. PT ekranlarıyla hiçbir adres paylaşmaz (SPEC §5). Yalnız telefon: tek sütun,
 * dokunma hedefleri en az 44 px. Yetki çerezden okunur ve her açılışta kayıtla karşılaştırılır:
 * PT erişimi kapattıysa ya da danışanı arşivlediyse buraya giremez.
 */
export default async function MePage() {
  const [client, config, session] = await Promise.all([currentClient(), readAppConfig(), readClientSession()]);
  const health = healthConsentState(client);
  const firstName = client.name.split(/\s+/)[0] ?? client.name;
  const asking = health === 'pending' || health === 'outdated';
  const password = hasPassword(client.access);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <RememberClient id={client.id} />
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{config.appName}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Merhaba, {firstName}</h1>
      </header>

      {/* Onay bekliyorsa ilk iş o: karar verilmeden sağlık ekranları açılmaz. */}
      {asking ? <ConsentCard state={health} fields={client.modules.health.fields} /> : null}

      {/* Şifresi yoksa ya da bu oturum yeni kare kodla açıldıysa (60 dk): zorunlu değil ama görünür. */}
      {canSetPassword(client.access, session ?? {}, new Date()) ? (
        <PasswordCard reset={Boolean(client.access.passwordSetAt)} />
      ) : null}

      <ProgramCard clientId={client.id} />

      {health === 'granted' || health === 'declined' ? (
        <ConsentCard state={health} fields={client.modules.health.fields} />
      ) : null}

      <footer className="mt-auto pt-4">
        <LogoutButton hasPassword={password} />
      </footer>
    </main>
  );
}

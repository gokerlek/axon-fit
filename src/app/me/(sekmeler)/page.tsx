import type { Metadata } from 'next';
import { canSetPassword, healthConsentState } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { readClientSession } from '@/lib/session';
import { ClientHeader } from '../client-header';
import { ConsentCard } from '../consent-card';
import { PasswordCard } from '../password-card';
import { ProgramCard } from '../program-card';
import { RememberClient } from '../remember-client';

export const metadata: Metadata = { title: 'Bugün' };

/**
 * Danışanın Bugün sekmesi (dock'ta ilk sekme; kabuk `layout.tsx`). PT ekranlarıyla hiçbir adres
 * paylaşmaz (SPEC §5). Yalnız telefon: tek sütun, dokunma hedefleri en az 44 px. Yetki çerezden
 * okunur ve her açılışta kayıtla karşılaştırılır: PT erişimi kapattıysa ya da danışanı arşivlediyse
 * buraya giremez. Sağ üstte avatar menüsü (ayarlar, çıkış); ana sayfada yalnız karar bekleyenler
 * durur, verilmiş sağlık onayı Ayarlar'da.
 */
export default async function MePage() {
  const [client, config, session] = await Promise.all([currentClient(), readAppConfig(), readClientSession()]);
  const health = healthConsentState(client);
  const firstName = client.name.split(/\s+/)[0] ?? client.name;
  const asking = health === 'pending' || health === 'outdated';

  return (
    <main className="flex flex-col gap-6">
      <RememberClient id={client.id} />
      <ClientHeader client={client} appName={config.appName} title={`Merhaba, ${firstName}`} />

      {/* Onay bekliyorsa ilk iş o: karar verilmeden sağlık ekranları açılmaz. */}
      {asking ? <ConsentCard state={health} fields={client.modules.health.fields} /> : null}

      {/* Şifresi yoksa ya da bu oturum yeni kare kodla açıldıysa (60 dk): zorunlu değil ama görünür. */}
      {canSetPassword(client.access, session ?? {}, new Date()) ? (
        <PasswordCard reset={Boolean(client.access.passwordSetAt)} />
      ) : null}

      <ProgramCard clientId={client.id} />
    </main>
  );
}

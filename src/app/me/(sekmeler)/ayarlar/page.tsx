import type { Metadata } from 'next';
import { FirstAidKit, Key } from '@phosphor-icons/react/dist/ssr';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canRecordHealth, canSetPassword, hasPassword, healthConsentState, outdatedHealthFields } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { activeItem } from '@/lib/own-program-index';
import { readOwnOverview, readOwnProgramOf } from '@/lib/own-programs-store';
import { readClientSession } from '@/lib/session';
import { scheduleOf, type PlanProgram } from '@/lib/workout-plan';
import { ClientHeader } from '../../client-header';
import { ConsentCard } from '../../consent-card';
import { PasswordCard } from '../../password-card';
import { TrainingDaysCard } from '../../schedule-sheet';

export const metadata: Metadata = { title: 'Ayarlar' };

/**
 * Danışanın ayarları (avatar menüsünden; dock'ta yok, dock'ta etkin sekme de yok): antrenman günleri
 * (program varsa; Bugün'deki "Günlerini değiştir"le aynı sheet, tasarım §2.11), sağlık takibi onayı
 * (ver / geri çek) ve şifre. Ana sayfada yalnız karar bekleyenler durur (onay sorusu, şifresi olmayana
 * şifre kartı); verilmiş kararlar burada.
 * Sayfa yetkiyi kendisi denetler (SPEC §5): kapatılmış erişim, arşiv ya da eski kuşak giremez.
 */
export default async function ClientSettingsPage() {
  const [client, config, session] = await Promise.all([currentClient(), readAppConfig(), readClientSession()]);
  const health = healthConsentState(client);
  const passwordSet = hasPassword(client.access);
  // Bugün'ün programının (kalıcı seçim; kendi programsa onun) günleri. Okunamıyorsa ya da yoksa satır çıkmaz (Bugün
  // sorunu anlatır).
  const overview = await readOwnOverview(client.id).catch(() => null);
  const selected = activeItem(overview?.state.index);
  const own = selected ? await readOwnProgramOf(client.id, selected.id).catch(() => null) : null;
  const program: PlanProgram | null = own?.status === 'ok' ? own.program : selected ? null : (overview?.pt?.program ?? null);
  const activeAt = overview?.state.index.active?.at;

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title="Ayarlar" back={{ href: '/me', label: 'Bugün' }} />

      {program ? (
        <TrainingDaysCard
          schedule={scheduleOf(program, { client, timeZone: config.timeZone, activeAt })}
          own={own?.status === 'ok' ? { programId: own.program.id, name: own.program.name } : null}
        />
      ) : null}

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
        <ConsentCard
          state={health}
          fields={client.modules.health.fields}
          outdated={outdatedHealthFields(client)}
          continuing={client.modules.health.fields.filter((field) => canRecordHealth(client, field))}
          healthPage={canRecordHealth(client, 'conditions') || canRecordHealth(client, 'screening')}
        />
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

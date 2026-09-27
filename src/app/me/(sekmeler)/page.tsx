import type { Metadata } from 'next';
import { loadCareStamp } from '@/lib/client-care';
import { canRecordHealth, canSetPassword, healthConsentState, outdatedHealthFields } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { isOwnProgramId } from '@/lib/own-programs';
import { readClientSession } from '@/lib/session';
import { AfterCheck } from '../after-check';
import { ClientHeader } from '../client-header';
import { ConsentCard } from '../consent-card';
import { PasswordCard } from '../password-card';
import { ProgramCard } from '../program-card';
import { ProposalOutcomes } from '../proposal-outcomes';
import { RememberClient } from '../remember-client';
import { TodayWorkout, WaterCard, WorkoutProgramProvider } from '../today-workout';

export const metadata: Metadata = { title: 'Bugün' };

/**
 * Danışanın Bugün sekmesi (dock'ta ilk sekme; kabuk `layout.tsx`). PT ekranlarıyla hiçbir adres
 * paylaşmaz (SPEC §5). Yalnız telefon: tek sütun, dokunma hedefleri en az 44 px. Yetki çerezden
 * okunur ve her açılışta kayıtla karşılaştırılır: PT erişimi kapattıysa ya da danışanı arşivlediyse
 * buraya giremez. Sağ üstte avatar menüsü (ayarlar, çıkış); ana sayfada yalnız karar bekleyenler
 * durur, verilmiş sağlık onayı Ayarlar'da. Altında sıradaki antrenman ("Antrenmana başla", "bu hafta
 * x/3") ya da yarım kalan antrenman, ve bugünkü su (tasarım §0, §2.1); antrenörünün önerilerine kararı
 * (tasarım §6.4). Antrenmandan 10 dk – 24 saat sonra üstte "Antrenman ne kadar zordu?" kartı (§2.9).
 */
export default async function MePage({ searchParams }: { searchParams: Promise<{ program?: string | string[] }> }) {
  const [client, config, session, query] = await Promise.all([currentClient(), readAppConfig(), readClientSession(), searchParams]);
  const careStamp = await loadCareStamp(client);
  // "Yalnız bugün" (docs/design/kendi-program.md §2.6): `?program=op_…|pt`; hiçbir şey yazmaz, sekmeden çıkınca düşer.
  const program = typeof query.program === 'string' && (query.program === 'pt' || isOwnProgramId(query.program)) ? query.program : null;
  const health = healthConsentState(client);
  const firstName = client.name.split(/\s+/)[0] ?? client.name;
  const asking = health === 'pending' || health === 'outdated';

  return (
    <main className="flex flex-col gap-6">
      <RememberClient id={client.id} />
      <ClientHeader client={client} appName={config.appName} title={`Merhaba, ${firstName}`} />

      {/* Onay bekliyorsa ilk iş o: karar verilmeden sağlık ekranları açılmaz. */}
      {asking ? (
        <ConsentCard
          state={health}
          fields={client.modules.health.fields}
          outdated={outdatedHealthFields(client)}
          continuing={client.modules.health.fields.filter((field) => canRecordHealth(client, field))}
        />
      ) : null}

      {/* Şifresi yoksa ya da bu oturum yeni kare kodla açıldıysa (60 dk): zorunlu değil ama görünür. */}
      {canSetPassword(client.access, session ?? {}, new Date()) ? (
        <PasswordCard reset={Boolean(client.access.passwordSetAt)} />
      ) : null}

      {/* Antrenmandan 10 dk – 24 saat sonra "Antrenman ne kadar zordu?" (§2.9); yoklamanın girdisini de telefona alır. */}
      <AfterCheck clientId={client.id} />

      {/* Yarım antrenman varsa sıradaki antrenman kartının yerine onun kartı (telefondaki kayıt istemcide okunur). */}
      <WorkoutProgramProvider program={program}>
        <TodayWorkout clientId={client.id}>
          <ProgramCard clientId={client.id} programParam={program} timeZone={config.timeZone} careStamp={careStamp}>
            <WaterCard clientId={client.id} />
          </ProgramCard>
        </TodayWorkout>
      </WorkoutProgramProvider>

      <ProposalOutcomes clientId={client.id} timeZone={config.timeZone} />
    </main>
  );
}

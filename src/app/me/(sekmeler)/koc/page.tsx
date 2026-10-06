import { currentClient } from '@/lib/guards';
import { readAppConfig } from '@/lib/config';
import { ClientHeader } from '../../client-header';
import { CoachPanel } from '@/components/coach/coach-panel';
export const metadata = { title: 'AI koç' };
export default async function ClientCoachPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);
  return <main className="flex flex-col gap-6"><ClientHeader client={client} appName={config.appName} title="AI koç" back={{ href: '/me', label: 'Bugün' }} /><CoachPanel clientId={client.id} role="client" /></main>;
}

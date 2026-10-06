import { requireClient } from '@/lib/guards';
import { CoachLauncher } from '@/components/coach/coach-launcher';
export default async function ClientCoachLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClient();
  return <>{children}<CoachLauncher role="client" clientId={session.clientId} /></>;
}

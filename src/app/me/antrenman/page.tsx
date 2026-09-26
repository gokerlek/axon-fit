import type { Metadata } from 'next';
import { currentClient } from '@/lib/guards';
import { WorkoutScreen } from './workout-screen';

export const metadata: Metadata = { title: 'Antrenman' };

/**
 * Etkin antrenman (docs/design/antrenman-ekrani.md §0, §2.4): tam ekran, dock ve avatar menüsü yok;
 * bu yüzden sekmeler grubunun (`(sekmeler)/layout.tsx`) dışında. Sayfa yetkiyi kendisi denetler
 * (SPEC §5); antrenman telefonda yürür (`WorkoutScreen`). `?day=d_…` başka bir günü açar,
 * `?bitir=1` (Bugün'deki yarım antrenman kartından) bitirme sorusunu hemen açar.
 */
export default async function WorkoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [client, params] = await Promise.all([currentClient(), searchParams]);
  const day = typeof params.day === 'string' ? params.day : null;
  return <WorkoutScreen clientId={client.id} dayParam={day} finishOnOpen={params.bitir === '1'} />;
}

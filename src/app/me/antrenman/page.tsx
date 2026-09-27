import type { Metadata } from 'next';
import { currentClient } from '@/lib/guards';
import { isOwnProgramId } from '@/lib/own-programs';
import { WorkoutScreen } from './workout-screen';

export const metadata: Metadata = { title: 'Antrenman' };

/**
 * Etkin antrenman (docs/design/antrenman-ekrani.md §0, §2.4): tam ekran, dock ve avatar menüsü yok;
 * bu yüzden sekmeler grubunun (`(sekmeler)/layout.tsx`) dışında. Sayfa yetkiyi kendisi denetler
 * (SPEC §5); antrenman telefonda yürür (`WorkoutScreen`). `?day=d_…` başka bir günü açar,
 * `?program=op_…|pt` Bugün'ün tek seferlik program seçimiyle ("Yalnız bugün", `docs/design/kendi-program.md`
 * §2.6) açar, `?bitir=1` (Bugün'deki yarım antrenman kartından) bitirme sorusunu hemen açar.
 */
export default async function WorkoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [client, params] = await Promise.all([currentClient(), searchParams]);
  const day = typeof params.day === 'string' ? params.day : null;
  const program = typeof params.program === 'string' && (params.program === 'pt' || isOwnProgramId(params.program)) ? params.program : null;
  return <WorkoutScreen clientId={client.id} dayParam={day} programParam={program} finishOnOpen={params.bitir === '1'} />;
}

import type { BodyMuscle } from '@/lib/muscles';

/**
 * Kas gruplarımızın haritadaki parçaları (`paths.ts` kimlikleri, sol/sağ eki olmadan).
 *
 * Harita bizim 12 grubumuzdan daha ayrıntılı; bir grup birden çok parçayı yakar.
 * Burada olmayan parçalar (baş, boyun, el, ayak, diz, dirsek, omurga, iç bacak)
 * gri siluet olarak çizilir ve tıklanmaz.
 */
export const MUSCLE_REGIONS: Record<BodyMuscle, readonly string[]> = {
  chest: ['chest-upper', 'chest-lower'],
  back: [
    'traps-upper',
    'traps-mid',
    'traps-lower',
    'lats-upper',
    'lats-mid',
    'lats-lower',
    'lower-back-erectors',
    'lower-back-ql',
  ],
  shoulders: ['shoulder-front', 'shoulder-side', 'deltoid-rear'],
  biceps: ['biceps'],
  triceps: ['triceps-long', 'triceps-lateral'],
  forearms: ['forearm', 'forearm-flexors', 'forearm-extensors'],
  quadriceps: ['quads', 'hip-flexor'],
  hamstrings: ['hamstrings-medial', 'hamstrings-lateral'],
  glutes: ['gluteus-maximus', 'gluteus-medius'],
  calves: ['tibialis-anterior', 'calves-gastroc-medial', 'calves-gastroc-lateral', 'calves-soleus'],
  core: ['abs-upper', 'abs-lower', 'obliques', 'serratus-anterior'],
};

const REGION_TO_MUSCLE = new Map<string, BodyMuscle>(
  (Object.entries(MUSCLE_REGIONS) as [BodyMuscle, readonly string[]][]).flatMap(([muscle, regions]) =>
    regions.map((region) => [region, muscle] as const),
  ),
);

/** `biceps-left` → `biceps`; grubu olmayan parça için `null`. */
export function muscleOfPath(id: string): BodyMuscle | null {
  return REGION_TO_MUSCLE.get(id.replace(/-(left|right)$/, '')) ?? null;
}

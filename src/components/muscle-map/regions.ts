import type { BodyMuscle } from '@/lib/muscles';

/**
 * Kaslarımızın haritadaki parçaları (`paths.ts` kimlikleri, sol/sağ eki olmadan).
 *
 * Kas listesi haritaya göre kuruldu: çoğu kas tek parça, bazıları haritada
 * birkaç parçaya bölünmüş (ör. kanat üst/orta/alt). Burada olmayan parçalar
 * (baş, yüz, el, ayak, diz, dirsek, omurga) kas değildir; gri siluet olarak
 * çizilir ve tıklanmaz.
 */
export const MUSCLE_REGIONS: Record<BodyMuscle, readonly string[]> = {
  upper_chest: ['chest-upper'],
  chest: ['chest-lower'],
  front_delts: ['shoulder-front'],
  side_delts: ['shoulder-side'],
  rear_delts: ['deltoid-rear'],
  upper_traps: ['traps-upper'],
  mid_back: ['traps-mid', 'traps-lower'],
  lats: ['lats-upper', 'lats-mid', 'lats-lower'],
  lower_back: ['lower-back-erectors', 'lower-back-ql'],
  biceps: ['biceps'],
  triceps: ['triceps-long', 'triceps-lateral'],
  forearms: ['forearm', 'forearm-flexors', 'forearm-extensors'],
  abs: ['abs-upper', 'abs-lower'],
  obliques: ['obliques'],
  serratus: ['serratus-anterior'],
  glutes: ['gluteus-maximus'],
  glute_medius: ['gluteus-medius'],
  hip_flexors: ['hip-flexor'],
  quadriceps: ['quads'],
  adductors: ['adductors'],
  hamstrings: ['hamstrings-medial', 'hamstrings-lateral'],
  calves: ['calves-gastroc-medial', 'calves-gastroc-lateral', 'calves-soleus'],
  tibialis: ['tibialis-anterior'],
  neck: ['neck', 'nape'],
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

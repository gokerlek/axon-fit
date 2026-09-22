import type { BodyMuscle } from '@/lib/muscles';

/**
 * Kaslarımızın haritadaki parçaları (`paths.ts` kimlikleri, sol/sağ eki olmadan).
 *
 * Kas listesi haritanın parçalarıyla bire bir (sol ve sağ birlikte seçilir). İstisnalar:
 * ön görünümdeki "forearm" bükücü taraftır, bükücülerle birleşir; köprücük üstü
 * (`traps-front`) trapezin önden görünen kısmıdır, üst trapezle birlikte yanar.
 * Burada olmayan parçalar (baş, yüz, el, ayak, diz, dirsek, omurga) kas değildir;
 * gri siluet olarak çizilir ve tıklanmaz.
 */
export const MUSCLE_REGIONS: Record<BodyMuscle, readonly string[]> = {
  chest_upper: ['chest-upper'],
  chest_lower: ['chest-lower'],
  delt_front: ['deltoid-front'],
  delt_side: ['deltoid-side'],
  delt_rear: ['deltoid-rear'],
  traps_upper: ['traps-upper', 'traps-front'],
  traps_mid: ['traps-mid'],
  traps_lower: ['traps-lower'],
  lats_upper: ['lats-upper'],
  lats_mid: ['lats-mid'],
  lats_lower: ['lats-lower'],
  erectors: ['lower-back-erectors'],
  quadratus: ['lower-back-ql'],
  biceps: ['biceps'],
  triceps_long: ['triceps-long'],
  triceps_lateral: ['triceps-lateral'],
  forearm_flexors: ['forearm', 'forearm-flexors'],
  forearm_extensors: ['forearm-extensors'],
  abs_upper: ['abs-upper'],
  abs_lower: ['abs-lower'],
  obliques: ['obliques'],
  serratus: ['serratus-anterior'],
  glutes: ['gluteus-maximus'],
  glute_medius: ['gluteus-medius'],
  hip_flexors: ['hip-flexor'],
  quadriceps: ['quads'],
  adductors: ['adductors'],
  hamstrings_medial: ['hamstrings-medial'],
  hamstrings_lateral: ['hamstrings-lateral'],
  gastroc_medial: ['calves-gastroc-medial'],
  gastroc_lateral: ['calves-gastroc-lateral'],
  soleus: ['calves-soleus'],
  tibialis: ['tibialis-anterior'],
  neck: ['neck'],
  nape: ['nape'],
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

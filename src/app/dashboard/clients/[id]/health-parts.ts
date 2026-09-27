import type { HealthField } from '@/lib/schemas/client';

/**
 * Danışan sayfasındaki "Sağlık" sekmesinin parçaları (tasarım `kisit-tarama.md` §1), şeritteki sırayla: sekmenin
 * bağlantısı modülde seçili ilk parçadır.
 */
export const HEALTH_PARTS: readonly { field: HealthField; path: string; label: string }[] = [
  { field: 'conditions', path: 'constraints', label: 'Kısıtlar' },
  { field: 'measurements', path: 'measurements', label: 'Ölçümler' },
  { field: 'screening', path: 'screening', label: 'Tarama' },
];

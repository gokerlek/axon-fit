import { ClientTabSkeleton } from '../../route-skeleton';

/**
 * Danışanın sekmeleri arasında geçişte: sınır danışan düzeninin (`layout.tsx`) içinde olduğu için
 * adı, durumu ve sekmeler yerinde kalır, yalnız sekmenin içeriği iskelete döner.
 */
export default function Loading() {
  return <ClientTabSkeleton />;
}

import { notFound } from 'next/navigation';
import { requirePt } from '@/lib/guards';

/**
 * Panelde hiçbir sayfaya uymayan adres. Kök `not-found.tsx` kabuksuz çizilirdi; buradan
 * `notFound()` ile `dashboard/not-found.tsx`'e düşer ve dock yerinde kalır.
 */
export default async function UnknownDashboardPage() {
  await requirePt();
  notFound();
}

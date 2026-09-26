import { NotFoundView } from '@/components/not-found-view';

/**
 * Uygulamanın hiçbir sayfasına uymayan adres (Next'in İngilizce varsayılanı yerine). Panelin
 * içindeki olmayan adresler ve kayıtlar `dashboard/not-found.tsx`'e düşer (dock ile).
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-8">
      <NotFoundView />
    </main>
  );
}

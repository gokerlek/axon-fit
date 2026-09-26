import { NotFoundView } from '@/components/not-found-view';

/**
 * Panelde olmayan kayıt (`notFound()`: silinmiş egzersiz, yanlış danışan kimliği…) ya da olmayan
 * adres (`[...rest]`). Kabuğun içinde çizilir: dock ve kullanıcı menüsü yerinde, geri yol açık.
 */
export default function DashboardNotFound() {
  return <NotFoundView />;
}

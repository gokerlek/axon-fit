import { redirect } from 'next/navigation';

export default function HomePage() {
  // Oturum kontrolü Faz 0'ın ikinci adımında buraya gelecek; şimdilik herkes girişe düşer.
  redirect('/giris');
}

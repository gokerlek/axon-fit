import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';

export default async function DashboardPage() {
  const session = await requirePt();
  const config = await readAppConfig();
  // Kurulum yapılmadıysa önce sihirbaz.
  if (!config.setupCompleted) redirect('/setup');

  return (
    <main style={{ padding: 'var(--space-xl)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <h1 style={{ fontSize: 24 }}>{config.appName}</h1>
      <p style={{ color: 'var(--text-secondary)' }}>Giriş yapıldı: {session.subject}</p>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
        Sıradaki adım: egzersiz kütüphanesi ve danışan listesi.
      </p>
      <p style={{ display: 'flex', gap: 'var(--space-lg)' }}>
        <Link href="/dashboard/exercises" style={{ color: 'var(--accent-text)' }}>
          Egzersizler
        </Link>
        <Link href="/setup" style={{ color: 'var(--accent-text)' }}>
          Görünüm ayarları
        </Link>
      </p>
    </main>
  );
}

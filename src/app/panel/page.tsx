import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';

export default async function PanelPage() {
  const session = await requirePt();
  const config = await readAppConfig();

  return (
    <main style={{ padding: 'var(--space-xl)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <h1 style={{ fontSize: 24 }}>{config.appName}</h1>
      <p style={{ color: 'var(--text-secondary)' }}>Giriş yapıldı: {session.subject}</p>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
        Faz 1: kurulum sihirbazı ve danışan listesi buraya gelecek.
      </p>
    </main>
  );
}

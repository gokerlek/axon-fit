import { requireClient } from '@/lib/guards';

/** Danışan alanı. PT ekranlarıyla hiçbir address paylaşmaz (SPEC §5). */
export default async function BenPage() {
  const session = await requireClient();

  return (
    <main style={{ padding: 'var(--space-xl)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <h1 style={{ fontSize: 24 }}>Antrenmanın</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
        Faz 3-4: bugünün antrenmanı ve antrenman ekranı buraya gelecek. ({session.clientId})
      </p>
    </main>
  );
}

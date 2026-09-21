import { requireClient } from '@/lib/guards';

/** Danışan alanı. PT ekranlarıyla hiçbir adres paylaşmaz (SPEC §5). Telefon odaklı. */
export default async function MePage() {
  const session = await requireClient();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-2 px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Antrenmanın</h1>
      <p className="text-sm text-muted-foreground">
        Bugünün antrenmanı ve antrenman ekranı buraya gelecek. ({session.clientId})
      </p>
    </main>
  );
}

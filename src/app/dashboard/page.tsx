import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listExercises } from '@/lib/exercises';
import { listClientIds } from '@/lib/github/repos';
import { requirePt } from '@/lib/guards';

/**
 * Genel bakış. Şimdilik sayılar; danışan ve antrenman ekranları geldikçe
 * "şu an antrenmanda olanlar" (canlı) ve "bugün" burada yer alacak.
 */
export default async function DashboardPage() {
  await requirePt();
  const [exercises, clientIds] = await Promise.all([
    listExercises(),
    listClientIds().catch(() => [] as string[]),
  ]);
  const custom = exercises.filter((item) => item.source === 'custom').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Genel bakış" description="Danışanların, şablonların ve egzersiz kütüphanen." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/clients" className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardDescription>Danışan</CardDescription>
              <CardTitle className="tabular-nums text-4xl">{clientIds.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Her biri kendi özel repo'sunda.</CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardDescription>Şu an antrenmanda</CardDescription>
            <CardTitle className="tabular-nums text-4xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Canlı görünüm antrenman ekranıyla gelecek.</CardContent>
        </Card>

        <Link href="/dashboard/exercises" className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardDescription>Egzersiz</CardDescription>
              <CardTitle className="tabular-nums text-4xl">{exercises.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{custom} tanesi senin.</CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

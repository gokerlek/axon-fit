import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';
import { listExercises } from '@/lib/exercises';
import { listClientIds } from '@/lib/github/repos';
import { requirePt } from '@/lib/guards';

export const metadata: Metadata = { title: 'Genel bakış' };

/**
 * Genel bakış. Şimdilik sayılar; her sayı kartı kendi listesine götürür. Danışan ve antrenman
 * ekranları geldikçe "şu an antrenmanda olanlar" (canlı) ve "bugün" burada yer alacak.
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
        <CountCard href="/dashboard/clients" label="Danışan" count={clientIds.length} hint="Danışan listesini aç" />
        <CountCard
          href="/dashboard/exercises"
          label="Egzersiz"
          count={exercises.length}
          hint={`${formatNumber(custom)} tanesi senin · kütüphaneyi aç`}
        />

        <Card>
          <CardHeader>
            <CardDescription>Şu an antrenmanda</CardDescription>
            <CardTitle className="tabular-nums text-4xl text-muted-foreground">—</CardTitle>
            <CardAction>
              <Badge variant="secondary">yakında</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Danışanın antrenman ekranı gelince kimin çalıştığı burada canlı görünür.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Tıklanınca listesine giden sayı kartı; bağlantı olduğu ok ve alt satırdan okunur. */
function CountCard({ href, label, count, hint }: { href: string; label: string; count: number; hint: string }) {
  return (
    <Link href={href} className="group/count rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="h-full transition-colors group-hover/count:bg-muted/50">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="tabular-nums text-4xl">{formatNumber(count)}</CardTitle>
          <CardAction>
            <CaretRight
              weight="fill"
              aria-hidden
              className="size-4 text-muted-foreground transition-transform duration-160 group-hover/count:translate-x-0.5"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
      </Card>
    </Link>
  );
}

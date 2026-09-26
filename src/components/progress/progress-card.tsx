import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProgressViewer } from '@/lib/progress-text';
import { cn } from '@/lib/utils';

/**
 * İlerleme bölümlerinin ortak kartı ve başlık düzeyleri (danışanın `/me/ilerleme`'si ve PT'nin danışan
 * sayfasındaki İlerleme sekmesi). Danışanda sayfa başlığı h1, bölümler h2; PT'de danışanın adı h1, sekmenin
 * başlığı h2, bölümler h3. Kanca yok: sunucu ve istemci bileşenleri birlikte kullanır.
 */

/** Bölüm başlığı: danışanda h2, PT'de h3. */
export function SectionHeading({ viewer, ...props }: React.ComponentProps<'h2'> & { viewer: ProgressViewer }) {
  return viewer === 'pt' ? <h3 {...props} /> : <h2 {...props} />;
}

/** Bölümün içindeki alt başlık ("En çok gelişen kaslar", "En iyilerin"): danışanda h3, PT'de h4. */
export function SubHeading({ viewer, ...props }: React.ComponentProps<'h3'> & { viewer: ProgressViewer }) {
  return viewer === 'pt' ? <h4 {...props} /> : <h3 {...props} />;
}

export function ProgressCard({
  viewer,
  title,
  titleId,
  description,
  className,
  contentClassName,
  children,
}: {
  viewer: ProgressViewer;
  title: React.ReactNode;
  titleId?: string;
  description?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <SectionHeading viewer={viewer} id={titleId} className="font-heading text-lg font-semibold">
            {title}
          </SectionHeading>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn('flex flex-col gap-3', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

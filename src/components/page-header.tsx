import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { USER_MENU_GUTTER } from './user-menu-spot';

type Crumb = { label: string; href?: string };

/**
 * Sayfa başlığı: shadcn Breadcrumb + başlık + açıklama + eylemler.
 * Detay ve form ekranları kendi sayfasındadır (SPEC §6); bu başlık nerede
 * olunduğunu ve geri yolunu gösterir.
 *
 * Sağ üstteki kullanıcı menüsü en üst satırla aynı hizada durur: o satır sağda
 * menüye pay bırakır (`USER_MENU_GUTTER`). Eylemler bir alt satırda, içerik sütununun sağ kenarına dayalı.
 */
export function PageHeader({
  crumbs,
  title,
  description,
  actions,
}: {
  crumbs?: Crumb[];
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const hasCrumbs = Boolean(crumbs?.length);

  return (
    <header className="flex flex-col gap-3">
      {hasCrumbs ? (
        <Breadcrumb className={USER_MENU_GUTTER}>
          <BreadcrumbList>
            {crumbs?.map((crumb, index) => (
              <Fragment key={crumb.label}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className={cn('font-heading text-2xl font-semibold tracking-tight', !hasCrumbs && USER_MENU_GUTTER)}>{title}</h1>
        {description || actions ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {description ? <p className="flex-[1_1_20rem] text-muted-foreground">{description}</p> : null}
            {actions ? <div className="ml-auto flex shrink-0 gap-2">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

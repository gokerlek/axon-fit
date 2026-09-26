'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { notFoundBackLink } from '@/lib/navigation';

/**
 * "Böyle bir sayfa yok": olmayan adres ya da silinmiş kayıt (`notFound()`). Dönüş bağlantısı
 * adresin bölümüne gider (`/dashboard/exercises/yok` → Egzersizler); panelde dock ve kullanıcı
 * menüsü yerinde kalır (`dashboard/not-found.tsx`).
 */
export function NotFoundView() {
  const back = notFoundBackLink(usePathname());
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MagnifyingGlass />
        </EmptyMedia>
        <EmptyTitle>
          <h1 className="text-lg font-semibold">Böyle bir sayfa yok</h1>
        </EmptyTitle>
        <EmptyDescription>Adres yanlış yazılmış ya da kayıt silinmiş olabilir.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button nativeButton={false} render={<Link href={back.href} />}>
          {back.label}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

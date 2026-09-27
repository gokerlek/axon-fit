import Link from 'next/link';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { canRecordHealth, hasPassword } from '@/lib/client-status';
import type { Client } from '@/lib/schemas/client';
import { ClientMenu } from './client-menu';

/**
 * Danışan sayfalarının başı: solda uygulama adı ve başlık (alt sayfada üstünde "‹" geri bağlantısı),
 * sağ üstte avatar menüsü (ayarlar, çıkış). Yalnız telefon; geri bağlantısının dokunma alanı 44 px.
 */
export function ClientHeader({
  client,
  appName,
  title,
  back,
}: {
  client: Client;
  appName: string;
  title: string;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {back ? (
          <Link
            href={back.href}
            className="relative flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 before:absolute before:top-1/2 before:left-1/2 before:h-full before:min-h-11 before:w-full before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2">
            <CaretLeft weight="fill" className="size-3.5" />
            {back.label}
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">{appName}</p>
        )}
        <h1 className="font-heading text-2xl font-semibold tracking-tight break-words">{title}</h1>
      </div>
      <ClientMenu
        clientId={client.id}
        name={client.name}
        appName={appName}
        hasPassword={hasPassword(client.access)}
        health={canRecordHealth(client, 'conditions') || canRecordHealth(client, 'screening')}
      />
    </header>
  );
}

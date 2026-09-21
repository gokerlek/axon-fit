import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignOut } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { DashboardDock } from './nav';

/**
 * PT kabuğu (SPEC §6): üstte marka ve hesap, altta dock. Masaüstü odaklı, telefonda da çalışır.
 * Kurulum tamamlanmadıysa hiçbir PT ekranı açılmaz, önce sihirbaz.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePt();
  const config = await readAppConfig();
  if (!config.setupCompleted) redirect('/setup');

  const initial = config.appName.trim().charAt(0).toUpperCase() || 'P';

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b bg-background/85 px-4 py-3 backdrop-blur-lg md:px-8">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-primary text-sm font-bold text-primary-foreground">
            {config.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/api/brand/logo" alt="" className="size-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <span className="truncate font-semibold">{config.appName}</span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground md:inline">@{session.subject}</span>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="outline" size="sm">
              <SignOut data-icon="inline-start" />
              Çıkış
            </Button>
          </form>
        </div>
      </header>

      {/* Alttaki dock içeriğin son satırını örtmesin. */}
      <main className="px-4 pt-6 pb-32 md:px-8 md:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <DashboardDock />
    </>
  );
}

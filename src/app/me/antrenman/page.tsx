import type { Metadata } from 'next';
import Link from 'next/link';
import { Barbell, CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { currentClient } from '@/lib/guards';

export const metadata: Metadata = { title: 'Antrenman' };

/**
 * Etkin antrenman (docs/design/antrenman-ekrani.md §0, §2.4): tam ekran, dock ve avatar menüsü yok;
 * bu yüzden sekmeler grubunun (`(sekmeler)/layout.tsx`) dışında. Şimdilik iskelet: üstte 52 px'lik
 * çubukta Bugün'e dönüş, altında boş durum. Hareket ekranı, dinlenme ve su Faz 3'te; o zamana kadar
 * Bugün'deki "Antrenmana başla" kapalı. Sayfa yetkiyi kendisi denetler (SPEC §5).
 */
export default async function WorkoutPage() {
  await currentClient();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-backdrop-filter:bg-background/85">
        <div className="mx-auto grid h-13 w-full max-w-md grid-cols-[1fr_auto_1fr] items-center px-2">
          <Button variant="ghost" className="h-11 justify-self-start px-2" nativeButton={false} render={<Link href="/me" />}>
            <CaretLeft data-icon="inline-start" weight="bold" />
            Bugün
          </Button>
          <h1 className="font-heading text-base font-semibold">Antrenman</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Barbell weight="fill" />
            </EmptyMedia>
            <EmptyTitle>Antrenman ekranı yakında</EmptyTitle>
            <EmptyDescription>
              Antrenmanını burada hareket hareket yapacaksın: her seti tek dokunuşla kaydedecek, setler arasında dinlenme
              sayacını ve içtiğin suyu göreceksin. Kayıtların antrenörüne anında gider.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="lg" className="h-11 w-full" nativeButton={false} render={<Link href="/me" />}>
              Bugün&apos;e dön
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    </div>
  );
}

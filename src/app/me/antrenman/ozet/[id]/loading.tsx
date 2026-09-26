import { Skeleton } from '@/components/ui/skeleton';

/**
 * Özet yüklenirken (danışanın repo'su okunuyor): üst satır, ilk kartın dört sayısı ve alttaki düğme yerinde.
 * Tam ekran, dock yok.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col gap-3 px-4 pt-[env(safe-area-inset-top)] pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-busy="true">
      <span role="status" className="sr-only">
        Özet hazırlanıyor…
      </span>
      <div className="flex h-13 items-center justify-between">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-4 w-8" />
      </div>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-8 w-52" />
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-22 rounded-xl" />
        <Skeleton className="h-22 rounded-xl" />
        <Skeleton className="h-22 rounded-xl" />
        <Skeleton className="h-22 rounded-xl" />
      </div>
      <div className="flex-1" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="mx-auto h-5 w-24" />
    </div>
  );
}

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Sekme değişirken anında görünen iskelet (shadcn Skeleton): başlık ve avatar yerinde, altında
 * kart. Dock layout'ta olduğu için yerinde kalır ve dokunulan sekme hemen etkin görünür.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        Sayfa yükleniyor…
      </span>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="my-0.5 h-4 w-24" />
          <Skeleton className="my-0.5 h-7 w-44" />
        </div>
        <Skeleton className="size-11 shrink-0 rounded-full" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

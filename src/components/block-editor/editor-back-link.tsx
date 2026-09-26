import Link from 'next/link';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { cn } from '@/lib/utils';

/**
 * Düzenleyici sayfalarının "‹" dönüş bağlantısı ("‹ Program", "‹ Alt vücut A", "‹ Şablonlar"): şablon ve
 * program düzenleyicisinde (oluşturma ve düzenleme) aynı yerde ve aynı biçimde, başlığın hemen üstünde.
 * Kaydet "Hareketler" başlığında, "Vazgeç" yok; kaydedilmemiş değişiklik varken çıkış uyarısı bu
 * bağlantıyı da yakalar (`UnsavedChangesGuard`). Dokunmatikte 44 px (satırın yüksekliği değişmez).
 */
export function EditorBackLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0', className)}>
      <Link
        href={href}
        className="flex max-w-full min-w-0 items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 touch:-my-3 touch:min-h-11 touch:pr-2">
        <CaretLeft weight="fill" className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    </div>
  );
}

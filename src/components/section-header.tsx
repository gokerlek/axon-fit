import Link from 'next/link';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';

/**
 * Sekmeli bir bölümün içindeki sayfa başlığı (ör. danışanın Program sekmesi). Sayfa yolu ve
 * asıl başlık bölümün düzeninde (`layout.tsx`) durur; burada yalnız bu sayfanın adı, tek
 * cümlelik açıklaması ve eylemleri. Alt sayfada (düzenle, yeni) `back` sekmenin ana sayfasına döner.
 */
export function SectionHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      {back ? (
        <Link
          href={back.href}
          // Telefonda dokunma alanı en az 44×44 px (SPEC §6); görünen bağlantı aynı kalır.
          className="relative flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 touch:before:absolute touch:before:top-1/2 touch:before:left-1/2 touch:before:h-full touch:before:min-h-11 touch:before:w-full touch:before:min-w-11 touch:before:-translate-x-1/2 touch:before:-translate-y-1/2">
          <CaretLeft weight="fill" className="size-3.5" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-[1_1_20rem] flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="ml-auto flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

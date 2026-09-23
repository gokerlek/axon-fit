import Link from 'next/link';
import { PencilSimple } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';

/**
 * Detay sayfasının tek eylemi: düzenlemeye götürür. Silme ve varsayılana dönme
 * düzenleme sayfasındadır — detay yalnız gösterir (SPEC §6).
 */
export function EditButton({ href }: { href: string }) {
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
      <PencilSimple data-icon="inline-start" weight="fill" />
      Düzenle
    </Button>
  );
}

import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * PT dosyasında şemaya uymayan kayıtlar ve aynı kimliğin ikinci kayıtları (`src/lib/stored-list.ts`):
 * listede görünmezler ama dosyadan da düşmezler; düzeltilene kadar o kimliklere yazılmaz (409).
 * Egzersiz, cihaz ve aparat listelerinde ortak.
 */
export function UnreadableRecordsAlert({ count, path }: { count: number; path: string }) {
  if (count === 0) return null;
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>
        {count} kayıt okunamadı (<code>{path}</code>)
      </AlertTitle>
      <AlertDescription>
        Şemaya uymayan ya da aynı kimlikle ikinci kez yazılmış kayıtlar düzeltilene kadar listede görünmez ve o
        kimliklerle kayıt yapılamaz; dosyada olduğu gibi korunurlar. GitHub&apos;da düzeltebilirsin.
      </AlertDescription>
    </Alert>
  );
}

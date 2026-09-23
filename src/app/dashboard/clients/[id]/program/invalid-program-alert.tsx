import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** Okunamayan program dosyası: ne olduğu ve nasıl düzeltileceği (görünüm ve düzenleme ortak). */
export function InvalidProgramAlert({ problem }: { problem: string }) {
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>
        <code>program.json</code> geçersiz
      </AlertTitle>
      <AlertDescription>
        {problem} — GitHub&apos;da düzeltebilir ya da düzenleme sayfasından silip yeniden oluşturabilirsin.
      </AlertDescription>
    </Alert>
  );
}

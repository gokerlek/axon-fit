import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** Okunamayan şablon dosyası: ne olduğu ve nasıl düzeltileceği (detay ve düzenleme ortak). */
export function InvalidTemplateAlert({ id, problem }: { id: string; problem: string }) {
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>
        <code>data/templates/{id}.json</code> geçersiz
      </AlertTitle>
      <AlertDescription>
        {problem} — GitHub&apos;da düzeltebilir ya da düzenleme sayfasından silebilirsin.
      </AlertDescription>
    </Alert>
  );
}

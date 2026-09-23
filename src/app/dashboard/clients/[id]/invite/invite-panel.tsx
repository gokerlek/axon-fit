'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, QrCode as QrIcon, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { QrCode } from '@/components/qr-code';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { formatInviteCode } from '@/lib/client-status';
import { formatDateTime } from '@/lib/format';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

type Issued = { code: string; expiresAt: string; url: string };

/**
 * Davet kodu üretir ve gösterir. Kod yalnız bu bileşenin belleğinde yaşar: repo'ya
 * özeti yazılır, sayfadan çıkınca bir daha gösterilemez — gerekirse yenisi üretilir.
 */
export function InvitePanel({
  clientId,
  clientName,
  hasPending,
  timeZone,
}: {
  clientId: string;
  clientName: string;
  /** Geçerli, kullanılmamış bir davet var: yenisi onu geçersiz kılar. */
  hasPending: boolean;
  /** Uygulama ayarındaki saat dilimi: son kullanma saati PT'nin saatiyle yazılır. */
  timeZone: string;
}) {
  const router = useRouter();
  const [issued, setIssued] = useState<Issued | null>(null);

  const issue = useServiceMutation({
    fn: () => fetchJson<Issued>(`/api/clients/${clientId}/invite`, { method: 'POST' }),
    onSuccess: (result) => {
      setIssued(result);
      // Sağdaki durum kartı yeni daveti göstersin; bu bileşenin durumu korunur.
      router.refresh();
    },
  });

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      toast.success('Bağlantı kopyalandı.');
    } catch {
      toast.error('Kopyalanamadı. Bağlantıyı elle seç.');
    }
  };

  const generateButton = (
    <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
      {issue.isPending ? <Spinner data-icon="inline-start" /> : <QrIcon data-icon="inline-start" weight="fill" />}
      {issued || hasPending ? 'Yeni kod üret' : 'Davet kodu üret'}
    </Button>
  );

  if (!issued) {
    return (
      <Card>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <QrIcon weight="fill" />
              </EmptyMedia>
              <EmptyTitle>{hasPending ? 'Bekleyen bir davet var' : 'Kare kodu üret'}</EmptyTitle>
              <EmptyDescription>
                {hasPending
                  ? 'Kodun kendisi saklanmadığı için yeniden gösterilemez. Yeni kod üretirsen eskisi anında geçersiz olur.'
                  : `${clientName} kodu okutunca kendi ekranına girer. Kod tek kullanımlıktır.`}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{generateButton}</EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{clientName} için davet</CardTitle>
        <CardDescription>Son kullanma: {formatDateTime(issued.expiresAt, timeZone)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5">
        <QrCode value={issued.url} label={`${clientName} için davet kare kodu`} className="w-full max-w-64 border" />

        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">Kod</span>
          <span className="font-mono text-3xl font-semibold tracking-widest tabular-nums">
            {formatInviteCode(issued.code)}
          </span>
        </div>

        <InputGroup className="w-full">
          <InputGroupInput readOnly value={issued.url} aria-label="Davet bağlantısı" onFocus={(e) => e.currentTarget.select()} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={copy} aria-label="Bağlantıyı kopyala">
              <Copy weight="fill" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <Alert>
          <WarningCircle weight="fill" />
          <AlertDescription>
            Bu kod bir daha gösterilmez. Bağlantıyı yalnız {clientName} ile paylaş: kimde olursa o girer.
          </AlertDescription>
        </Alert>

        {generateButton}
      </CardContent>
    </Card>
  );
}

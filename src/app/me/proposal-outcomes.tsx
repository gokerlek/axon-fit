import { CheckCircle, HourglassMedium, WarningCircle, XCircle } from '@phosphor-icons/react/dist/ssr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, formatRecent } from '@/lib/format';
import { clientOutcomes, OUTCOME_LABELS, type Proposal } from '@/lib/proposals';
import { readProposals } from '@/lib/proposals-store';

const ICONS = {
  approved: <CheckCircle weight="fill" className="size-5 shrink-0 text-primary" aria-hidden />,
  declined: <XCircle weight="fill" className="size-5 shrink-0 text-muted-foreground" aria-hidden />,
  stale: <WarningCircle weight="fill" className="size-5 shrink-0 text-muted-foreground" aria-hidden />,
} as const;

/**
 * Bugün'de önerilerinin sonucu (tasarım §6.4): bitişte antrenörüne giden set sayısı ve yapı önerileri.
 * Son 14 günde karara bağlananlar ("Antrenörün önerini onayladı: Leg Press 3 → 4 set" ve varsa notu) ve
 * onay bekleyenler. Gösterilecek bir şey yoksa kart yok; öneriler okunamazsa da sessizce yok.
 */
export async function ProposalOutcomes({ clientId, timeZone }: { clientId: string; timeZone: string }) {
  const stored = await readProposals(clientId).catch(() => null);
  if (!stored || stored.broken) return null;
  const now = new Date();
  const { decided, pending } = clientOutcomes(stored.file, now);
  if (decided.length === 0 && pending.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Program önerilerin</CardTitle>
        <CardDescription>Antrenman bitişinde antrenörüne gönderdiğin değişiklikler.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {decided.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {decided.map((item) => (
              <Outcome key={item.id} item={item} timeZone={timeZone} now={now} />
            ))}
          </ul>
        ) : null}
        {pending.length > 0 ? (
          <div className="flex gap-3">
            <HourglassMedium weight="fill" className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">Antrenörünün onayında: {formatNumber(pending.length)} öneri</span>
              <ul className="flex flex-col text-sm text-muted-foreground">
                {pending.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Outcome({ item, timeZone, now }: { item: Proposal; timeZone: string; now: Date }) {
  const status = item.status === 'pending' ? 'stale' : item.status;
  return (
    <li className="flex gap-3">
      {ICONS[status]}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[0.8125rem] text-muted-foreground">
          {OUTCOME_LABELS[status]}
          {item.decidedAt ? ` · ${formatRecent(item.decidedAt, timeZone, now)}` : ''}
        </span>
        <span className="font-medium">{item.text}</span>
        {item.ptNote ? <span className="text-sm text-muted-foreground italic">“{item.ptNote}”</span> : null}
      </div>
    </li>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ChoiceChips } from '@/components/choice-chips';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  afterReportText,
  REPORT_SAFETY,
  SEVERITIES,
  SEVERITY_LABELS,
  type ClientConstraintView,
  type Severity,
} from '@/lib/constraints';
import { formatDayShort } from '@/lib/format';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { ReportSheet, type ReportDraft } from './report-sheet';

const EMPTY: ReportDraft = { triggers: [], note: '' };

function stateLine(view: ClientConstraintView): string {
  const day = formatDayShort(view.at.slice(0, 10));
  switch (view.state) {
    case 'pending':
      return 'Antrenörüne iletildi · bekliyor';
    case 'confirmed':
      return `Antrenörün onayladı · ${day}`;
    case 'seen':
      return `Antrenörün gördü · ${day}`;
    case 'declined':
      return `Antrenörün kısıt olarak almadı · ${day}`;
    default:
      return `Kapandı · ${day}`;
  }
}

function useReportAction(id: string, success: string) {
  const router = useRouter();
  return useServiceMutation({
    fn: (body: Record<string, unknown> | null) =>
      body === null
        ? fetchJson<{ ok: true }>(`/api/me/constraints/${id}`, { method: 'DELETE' })
        : fetchJson<{ ok: true }>(`/api/me/constraints/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    notify: { success },
    onSuccess: () => router.refresh(),
  });
}

/**
 * Onaylı kısıtta "Kötüleşti": şimdikinden yüksek şiddet sorulur, hemen yazılır. Diyalog bildirim sheet'inin ikinci
 * güvenlik kademesini de gösterir; gönderince yeni bildirimdeki gibi şiddete göre ne yapacağı söylenir.
 */
function WorseButton({ view, onWorse }: { view: ClientConstraintView; onWorse: (text: string) => void }) {
  const [severity, setSeverity] = useState<Severity | undefined>(undefined);
  const worse = useReportAction(view.id, 'Antrenörüne iletildi.');
  const rank = view.severity ? SEVERITIES.indexOf(view.severity) : -1;
  const choices = SEVERITIES.filter((_item, index) => index > rank);
  if (choices.length === 0) return null;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" className="h-11 flex-1" />}>Kötüleşti</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{view.title}: ne kadar etkiliyor?</AlertDialogTitle>
          <AlertDialogDescription>
            Antrenörüne hemen iletilir. Yeni uyuşma ya da güç kaybı varsa beklemeden acil servise başvur. {REPORT_SAFETY.other}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ChoiceChips
          label="Şiddet"
          value={severity}
          options={choices.map((item) => ({ value: item, label: SEVERITY_LABELS[item] }))}
          onChange={setSeverity}
          itemClassName="flex-1"
        />
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Vazgeç</AlertDialogCancel>
          <AlertDialogAction
            className="h-11"
            disabled={!severity || worse.isPending}
            onClick={() =>
              severity && worse.mutate({ action: 'worse', severity }, { onSuccess: () => onWorse(afterReportText({ severity, type: view.typeId })) })
            }
          >
            {worse.isPending ? <Spinner data-icon="inline-start" /> : null}
            Gönder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BetterButton({ view }: { view: ClientConstraintView }) {
  const better = useReportAction(view.id, 'Antrenörüne iletildi.');
  return (
    <Button variant="outline" className="h-11 flex-1" disabled={better.isPending} onClick={() => better.mutate({ action: 'better' })}>
      {better.isPending ? <Spinner data-icon="inline-start" /> : <CheckCircle data-icon="inline-start" />}
      Düzeldi
    </Button>
  );
}

function WithdrawButton({ view }: { view: ClientConstraintView }) {
  const withdraw = useReportAction(view.id, 'Bildirim geri çekildi.');
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" className="h-11 flex-1" />}>Geri çek</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bildirimini geri çekmek istiyor musun?</AlertDialogTitle>
          <AlertDialogDescription>Antrenörün bu bildirimi artık görmez; zorlayan hareketlerdeki notlar da kalkar.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Vazgeç</AlertDialogCancel>
          <AlertDialogAction className="h-11" disabled={withdraw.isPending} onClick={() => withdraw.mutate(null)}>
            {withdraw.isPending ? <Spinner data-icon="inline-start" /> : null}
            Geri çek
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConstraintCard({
  view,
  onEdit,
  onWorse,
}: {
  view: ClientConstraintView;
  onEdit: (view: ClientConstraintView) => void;
  onWorse: (text: string) => void;
}) {
  const meta = [view.type, view.severity ? SEVERITY_LABELS[view.severity].toLocaleLowerCase('tr') : null].filter(Boolean).join(' · ');
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{view.title}</CardTitle>
        <CardDescription className="flex flex-col gap-0.5">
          {view.diagnosis ? <span className="text-foreground">{view.diagnosis}</span> : null}
          <span>{meta}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 text-sm">
        {view.clientNote ? <p>“{view.clientNote}”</p> : null}
        {view.reportNote ? <p className="text-muted-foreground">Notun: “{view.reportNote}”</p> : null}
        {view.declinedNote ? <p>Antrenörün: “{view.declinedNote}”</p> : null}
        <p className="text-muted-foreground">{stateLine(view)}</p>
        {view.change === 'better' ? <p className="text-muted-foreground">Düzeldi dedin; antrenörün bakınca kapanır.</p> : null}
        {view.change === 'worse' ? <p className="text-muted-foreground">Kötüleşti dedin; antrenörüne iletildi.</p> : null}
      </CardContent>
      {view.state === 'pending' ? (
        <CardFooter className="gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => onEdit(view)}>
            Düzelt
          </Button>
          <WithdrawButton view={view} />
        </CardFooter>
      ) : view.state === 'confirmed' || view.state === 'seen' ? (
        <CardFooter className="gap-2">
          <WorseButton view={view} onWorse={onWorse} />
          {view.change !== 'better' ? <BetterButton view={view} /> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

/**
 * Danışanın kısıtları (tasarım `kisit-tarama.md` §5.2): bölge · taraf · tür · şiddet · antrenörün notu; tanı adı yalnız
 * hekim kaynaklıysa ve niteleyicisiz. Bekleyen bildirim düzeltilir ya da geri çekilir; onaylıda Kötüleşti / Düzeldi.
 * "+ Yeni bir şey bildir" sheet'i açar; gönderince şiddete göre ne yapacağı söylenir.
 */
export function HealthConstraints({ open, closed }: { open: ClientConstraintView[]; closed: ClientConstraintView[] }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ editing: string | null; initial: ReportDraft } | null>(null);
  const [after, setAfter] = useState<string | null>(null);

  const edit = (view: ClientConstraintView) =>
    setSheet({
      editing: view.id,
      initial: {
        region: view.region,
        ...(view.side ? { side: view.side } : {}),
        type: view.typeId,
        ...(view.severity ? { severity: view.severity } : {}),
        triggers: view.triggers ?? [],
        note: view.reportNote ?? '',
      },
    });

  return (
    <section aria-labelledby="constraints-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="constraints-heading" className="font-heading text-lg font-semibold">
          Kısıtların
        </h2>
        <p className="text-sm text-muted-foreground">Antrenörün programını bunlara göre yazar.</p>
      </div>
      {after ? (
        <Alert>
          <CheckCircle weight="fill" />
          <AlertDescription>{after}</AlertDescription>
        </Alert>
      ) : null}
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kayıtlı kısıtın yok. Bir sakatlık ya da rahatsızlığın varsa bildir.</p>
      ) : (
        open.map((view) => <ConstraintCard key={view.id} view={view} onEdit={edit} onWorse={setAfter} />)
      )}
      <Button variant="outline" className="h-11 w-full" onClick={() => setSheet({ editing: null, initial: EMPTY })}>
        <Plus data-icon="inline-start" />
        Yeni bir şey bildir
      </Button>
      {closed.length > 0 ? (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">Kapananlar ({closed.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {closed.map((view) => (
              <li key={view.id} className="flex flex-col">
                <span>{view.title}</span>
                <span className="text-muted-foreground">{stateLine(view)}</span>
                {view.declinedNote ? <span className="text-muted-foreground">Antrenörün: “{view.declinedNote}”</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <ReportSheet
        open={sheet !== null}
        onOpenChange={(next) => (next ? undefined : setSheet(null))}
        editing={sheet?.editing ?? null}
        initial={sheet?.initial ?? EMPTY}
        onSent={(draft) => {
          const text = draft.severity && draft.type ? afterReportText({ severity: draft.severity, type: draft.type, ...(draft.since ? { since: draft.since } : {}) }) : 'Antrenörüne iletildi.';
          setSheet(null);
          setAfter(sheet?.editing ? 'Bildirimin düzeltildi.' : text);
          toast.success(sheet?.editing ? 'Bildirimin düzeltildi.' : 'Antrenörüne iletildi.');
          router.refresh();
        }}
      />
    </section>
  );
}

import { Trophy } from '@phosphor-icons/react/dist/ssr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDayShort } from '@/lib/format';
import type { RecordItem } from '@/lib/progress';
import { recordLabel, recordPrevious, recordValue } from '@/lib/progress-text';

/**
 * Son rekorlar (tasarım §2.8 kuralları): bir antrenmanda bir hareketin kırdığı rekorlar tek satır,
 * öne en önemlisi (en ağır set, tahmini maksimum, aynı ağırlıkta tekrar…) ve önceki en iyi; ötekiler
 * altında kısaca. En yeni önce.
 */
export function RecordsCard({ items, total, today }: { items: RecordItem[]; total: number; today: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-heading text-lg font-semibold">Rekorlar</h2>
        </CardTitle>
        <CardDescription>
          {total > items.length ? `Toplam ${total} rekor; son ${items.length} tanesi.` : 'Bir hareketteki en iyini geçtiğin antrenmanlar.'} Bir
          hareketin ilk kaydı başlangıç noktasıdır, rekor sayılmaz.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            Henüz rekor yok. Bir harekette daha ağır kaldırdığında ya da aynı ağırlıkta daha çok tekrar yaptığında burada görünür.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {items.map((item) => {
              const [primary, ...others] = item.events;
              if (!primary) return null;
              const withYear = item.date.slice(0, 4) !== today.slice(0, 4);
              return (
                <li key={`${item.sessionId}-${item.key}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <Trophy weight="fill" className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">
                        {item.title}
                        {item.deviceName ? <span className="font-normal text-muted-foreground"> · {item.deviceName}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDayShort(item.date, withYear)}</span>
                    </div>
                    <p className="text-sm">
                      {recordLabel(primary.kind, item.trackingType)}: <span className="font-medium tabular-nums">{recordValue(primary)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">{recordPrevious(primary)}</p>
                    {others.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Ayrıca:{' '}
                        {others.map((event) => `${recordLabel(event.kind, item.trackingType).toLocaleLowerCase('tr')} ${recordValue(event)}`).join(' · ')}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

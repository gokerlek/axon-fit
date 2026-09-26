'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CaretRight, Trophy } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { firstHistoryRows, HISTORY_PAGE, type HistoryMonth, type HistoryRow } from '@/lib/session-history';

/**
 * Geçmiş listesi (tasarım §2.10): aylara bölünmüş kartlar; ilk 20 antrenman, altında "Daha fazla göster (n)".
 * Satır 64 px'ten yüksek, bütünü bağlantı (detay). Rekor, "başka gün" ve "yarım" rozetleri metinle.
 */
export function HistoryList({ months }: { months: HistoryMonth[] }) {
  const [count, setCount] = useState(HISTORY_PAGE);
  const total = months.reduce((sum, month) => sum + month.rows.length, 0);
  const shown = firstHistoryRows(months, count);
  return (
    <div className="flex flex-col gap-5">
      {shown.map((month) => (
        <section key={month.key} aria-labelledby={`ay-${month.key}`} className="flex flex-col gap-2">
          <h2 id={`ay-${month.key}`} className="text-xs font-semibold tracking-wide text-muted-foreground">
            {month.label}
          </h2>
          <ul className="flex flex-col gap-2">
            {month.rows.map((row) => (
              <li key={row.id}>
                <HistoryItem row={row} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {total > count ? (
        <Button variant="ghost" className="h-11 self-center text-muted-foreground" onClick={() => setCount(count + HISTORY_PAGE)}>
          Daha fazla göster ({formatNumber(total - count)})
        </Button>
      ) : null}
    </div>
  );
}

function HistoryItem({ row }: { row: HistoryRow }) {
  return (
    <Link
      href={`/me/gecmis/${row.id}`}
      className="flex min-h-16 items-center gap-3.5 rounded-xl bg-card py-3 pr-2.5 pl-3.5 ring-1 ring-foreground/10 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/60">
      <span className="flex w-9 shrink-0 flex-col items-center leading-tight" aria-hidden>
        <span className="font-heading text-xl font-semibold tabular-nums">{row.dayOfMonth}</span>
        <span className="text-xs text-muted-foreground">{row.weekday}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          <span className="sr-only">
            {row.dayOfMonth} {row.weekday} ·{' '}
          </span>
          {row.title}
          {row.prs > 0 ? (
            <Badge className="bg-primary/15 text-primary-text">
              <Trophy weight="fill" data-icon="inline-start" />
              {formatNumber(row.prs)} rekor
            </Badge>
          ) : null}
          {row.otherDay ? <Badge variant="secondary">başka gün</Badge> : null}
          {row.unfinished ? <Badge variant="outline">yarım</Badge> : null}
        </span>
        <span className="text-[0.8125rem] text-muted-foreground tabular-nums">{row.meta}</span>
      </span>
      <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

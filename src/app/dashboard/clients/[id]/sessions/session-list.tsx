'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CaretRight, Trophy } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { formatNumber } from '@/lib/format';
import { firstHistoryRows, HISTORY_PAGE, type HistoryMonth, type HistoryRow } from '@/lib/session-history';

/**
 * PT'nin Antrenmanlar sekmesindeki liste: danışanın Geçmiş'iyle aynı satırlar (`historyList`: gün, süre, set,
 * toplam ağırlık; rekor, "başka gün", "yarım" rozetleri), aylara bölünmüş; masaüstünde iki sütun. İlk 20
 * antrenman, altında "Daha fazla göster (n)". Satır antrenmanın detayını açar (yalnız okuma).
 */
export function SessionList({ clientId, months }: { clientId: string; months: HistoryMonth[] }) {
  const [count, setCount] = useState(HISTORY_PAGE);
  const total = months.reduce((sum, month) => sum + month.rows.length, 0);
  return (
    <div className="flex flex-col gap-5">
      {firstHistoryRows(months, count).map((month) => (
        <section key={month.key} aria-labelledby={`ay-${month.key}`} className="flex flex-col gap-2">
          <h3 id={`ay-${month.key}`} className="text-xs font-semibold tracking-wide text-muted-foreground">
            {month.label}
          </h3>
          <ul className="grid gap-2 lg:grid-cols-2">
            {month.rows.map((row) => (
              <li key={row.id}>
                <SessionRow clientId={clientId} row={row} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {total > count ? (
        <Button variant="ghost" className="self-center text-muted-foreground touch:h-11" onClick={() => setCount(count + HISTORY_PAGE)}>
          Daha fazla göster ({formatNumber(total - count)})
        </Button>
      ) : null}
    </div>
  );
}

/** Antrenmanın satırı (liste ve Genel'in Antrenmanlar kartı): bütünü detayın bağlantısı. */
export function SessionRow({ clientId, row }: { clientId: string; row: HistoryRow }) {
  return (
    <Item variant="outline" size="sm" className="h-full touch:min-h-11" render={<Link href={`/dashboard/clients/${clientId}/sessions/${row.id}`} />}>
      <ItemMedia className="w-9 flex-col gap-0 leading-tight" aria-hidden>
        <span className="font-heading text-lg font-semibold tabular-nums">{row.dayOfMonth}</span>
        <span className="text-xs text-muted-foreground">{row.weekday}</span>
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none flex-wrap gap-1.5">
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
          {/* Danışanın kendi programından (adı başlıkta, "Evde · Gün A"). */}
          {row.program ? <Badge variant="outline">Kendi programı</Badge> : null}
          {row.otherDay ? <Badge variant="secondary">başka gün</Badge> : null}
          {row.unfinished ? <Badge variant="outline">yarım</Badge> : null}
        </ItemTitle>
        <ItemDescription className="tabular-nums">{row.meta}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <CaretRight className="size-4 text-muted-foreground" aria-hidden />
      </ItemActions>
    </Item>
  );
}

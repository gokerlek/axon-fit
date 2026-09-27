'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { ownLogLabel } from '@/lib/own-program-text';
import { groupChanges } from '@/lib/program-diff';
import { LOG_KIND_LABELS, type ProgramLogEntry } from '@/lib/program-plan';

/**
 * Program geçmişi: her kayıtta otomatik yazılan özet, en yenisi üstte. Aynı günün
 * ardışık değişiklikleri tek satırda ("Gün A: … · …"). Uzun geçmiş parça parça açılır.
 * Kendi programda (`viewer`) etiketler görene göre: "Antrenörün düzenledi", "Danışan düzenledi"
 * (`docs/design/kendi-program.md` §7.3).
 */
export function ChangeLog({
  entries,
  timeZone,
  initial = entries.length,
  step = 20,
  viewer,
}: {
  entries: readonly ProgramLogEntry[];
  timeZone: string;
  initial?: number;
  step?: number;
  viewer?: 'client' | 'pt';
}) {
  const [shown, setShown] = useState(initial);
  const visible = entries.slice(0, shown);

  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y">
        {visible.map((entry) => (
          <li key={`${entry.revision}-${entry.at}`} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <time dateTime={entry.at} className="text-sm text-muted-foreground tabular-nums">
                {formatDateTime(entry.at, timeZone)}
              </time>
              <Badge variant={entry.kind === 'edit' ? 'outline' : 'secondary'}>{viewer ? ownLogLabel(entry, viewer) : LOG_KIND_LABELS[entry.kind]}</Badge>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {groupChanges(entry.changes).map((group, index) => (
                <li key={index}>
                  {group.scope ? <span className="font-medium">{group.scope}:</span> : null}
                  {group.scope ? ' ' : null}
                  {group.texts.join(' · ')}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {entries.length > shown ? (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setShown((count) => count + step)}>
          Daha eskileri göster
        </Button>
      ) : null}
    </div>
  );
}

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LabeledSelect } from '@/components/labeled-select';
import { formatDay } from '@/lib/format';

const NONE = 'yok';

/** "Karşılaştır: [12 Eyl] ile [1 Ağu]" — aynı protokoldeki iki gün, adreste (`?gun=&onceki=`). */
export function CompareSelect({ dates, current, previous }: { dates: string[]; current: string; previous: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const labels = Object.fromEntries(dates.map((date) => [date, formatDay(date)]));
  const go = (gun: string, onceki: string | null) => router.replace(`${pathname}?gun=${gun}${onceki ? `&onceki=${onceki}` : `&onceki=${NONE}`}`, { scroll: false });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Karşılaştır:</span>
      <LabeledSelect id="compare-current" value={current} labels={labels} onChange={(gun) => go(gun, previous && previous < gun ? previous : null)} triggerClassName="w-44" />
      <span className="text-muted-foreground">ile</span>
      <LabeledSelect
        id="compare-previous"
        value={previous ?? NONE}
        labels={{ [NONE]: 'Karşılaştırma yok', ...Object.fromEntries(dates.filter((date) => date < current).map((date) => [date, formatDay(date)])) }}
        onChange={(onceki) => go(current, onceki === NONE ? null : onceki)}
        triggerClassName="w-44"
      />
    </div>
  );
}

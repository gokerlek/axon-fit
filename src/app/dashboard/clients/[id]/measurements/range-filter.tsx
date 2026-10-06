import { DatePicker } from '@/components/date-picker';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { isCalendarDate } from '@/lib/measurement-log';
import { RANGE_PRESETS, rangeStart, type RangePreset } from '@/lib/trend';

export type DateRange = {
  /** Hazır aralık; özel aralıkta null. */
  preset: RangePreset | null;
  from?: string;
  to?: string;
};

const PRESETS = Object.keys(RANGE_PRESETS) as RangePreset[];

/**
 * Adresten tarih aralığı: `?aralik=4h|3a|6a|1y|tumu` ya da `?bas=YYYY-AA-GG&bit=YYYY-AA-GG`.
 * Özel aralık hazır olanı ezer; geçersiz değer sessizce "tümü"ne düşer. Adreste durduğu için
 * sayfa yenilenince ya da bağlantı paylaşılınca aynı görünüm açılır.
 */
export function parseRange(params: { aralik?: string; bas?: string; bit?: string }, today: string): DateRange {
  const from = params.bas && isCalendarDate(params.bas) ? params.bas : undefined;
  const to = params.bit && isCalendarDate(params.bit) ? params.bit : undefined;
  if (from || to) {
    // Uçlar ters girildiyse çevrilir.
    if (from && to && from > to) return { preset: null, from: to, to: from };
    return { preset: null, from, to };
  }
  const preset = PRESETS.includes(params.aralik as RangePreset) ? (params.aralik as RangePreset) : 'tumu';
  return { preset, from: rangeStart(preset, today) };
}

/**
 * Seçili aralık: seçili durum tonu (`--primary-strong`, komşu düğme ve yüzeyden ≥3:1; üstünde okunur
 * yazı), içinde zemin renginde halka (yalnız renk değil şekil de) — `ui/toggle`'ın basılı durumuyla aynı.
 */
const SELECTED = [
  'aria-[current=page]:border-primary-strong aria-[current=page]:bg-primary-strong aria-[current=page]:text-primary-strong-foreground',
  'aria-[current=page]:inset-ring-2 aria-[current=page]:inset-ring-background aria-[current=page]:hover:bg-primary-strong',
  // Çerçeveli düğmenin koyu tema zemini (`dark:bg-input/30`) daha özgül: seçili ton koyuda da yazılır.
  'dark:aria-[current=page]:border-primary-strong dark:aria-[current=page]:bg-primary-strong dark:aria-[current=page]:hover:bg-primary-strong',
].join(' ');

/** Hazır aralıklar bağlantı, özel aralık shadcn takvim seçicisiyle GET formu olarak gönderilir. */
export function RangeFilter({ base, range }: { base: string; range: DateRange }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <nav aria-label="Tarih aralığı" className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const active = range.preset === preset;
          return (
            <Button
              key={preset}
              size="sm"
              variant="outline"
              className={SELECTED}
              aria-current={active ? 'page' : undefined}
              nativeButton={false}
              render={<Link href={preset === 'tumu' ? base : `${base}?aralik=${preset}`} scroll={false} />}>
              {RANGE_PRESETS[preset].label}
            </Button>
          );
        })}
      </nav>
      <form method="get" action={base} className="flex flex-wrap items-end gap-2" aria-label="Özel tarih aralığı">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Başlangıç
          <DatePicker aria-label="Başlangıç tarihi" name="bas" defaultValue={range.preset === null ? range.from : undefined} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Bitiş
          <DatePicker aria-label="Bitiş tarihi" name="bit" defaultValue={range.preset === null ? range.to : undefined} className="w-40" />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Uygula
        </Button>
      </form>
    </div>
  );
}

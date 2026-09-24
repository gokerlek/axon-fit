'use client';

import { TemplateMuscleMap } from '@/components/muscle-map/template-muscle-map';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumber } from '@/lib/format';

/**
 * Evrenin (evresizde programın) planlanan kas yükü. Sıklık varsa iki görünüm: haftalık
 * (bir tur × sıklık ÷ gün sayısı; varsayılan) ve bir tur (bütün günler birer kez).
 * Programdan hesaplanır; gerçekleşen yük set kayıtlarından ayrıca gelecek (Faz 4c).
 */
export function PhaseLoad({
  cycle,
  weekly,
  factor,
  daysPerWeek,
  dayCount,
  label,
}: {
  cycle: Record<string, number>;
  weekly: Record<string, number> | null;
  factor: number | null;
  daysPerWeek?: number;
  dayCount: number;
  label: string;
}) {
  const cycleCaption = `Bir tur: ${formatNumber(dayCount)} gün birer kez; kas başına çalışma seti.`;
  if (!weekly || factor === null || daysPerWeek === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <TemplateMuscleMap variant="full" bodyClassName="h-56" load={cycle} label={`${label}: bir tur`} />
        <p className="text-center text-xs text-muted-foreground">
          {cycleCaption} Haftalık görünüm için &apos;haftada kaç gün&apos; ekle.
        </p>
      </div>
    );
  }
  return (
    <Tabs defaultValue="weekly">
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="weekly" className="flex-none">
          Haftalık (plan)
        </TabsTrigger>
        <TabsTrigger value="cycle" className="flex-none">
          Bir tur
        </TabsTrigger>
      </TabsList>
      <TabsContent value="weekly" className="flex flex-col gap-2 pt-3">
        <TemplateMuscleMap variant="full" bodyClassName="h-56" load={weekly} label={`${label}: planlanan haftalık`} />
        <p className="text-center text-xs text-muted-foreground">
          Planlanan haftalık yük: haftada {formatNumber(daysPerWeek)} gün, {formatNumber(dayCount)} günlük döngü → her gün haftada{' '}
          {formatNumber(factor)} kez. Kas başına set; programdan hesaplanır, antrenman kayıtlarından değil.
        </p>
      </TabsContent>
      <TabsContent value="cycle" className="flex flex-col gap-2 pt-3">
        <TemplateMuscleMap variant="full" bodyClassName="h-56" load={cycle} label={`${label}: bir tur`} />
        <p className="text-center text-xs text-muted-foreground">{cycleCaption}</p>
      </TabsContent>
    </Tabs>
  );
}

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDayShort } from '@/lib/format';
import { templateSummary, type PlanExercise, type TemplateBlock } from '@/lib/template-plan';
import { ClientDayPlan } from '../../client-day-plan';

type Day = { id: string; name: string; blocks: readonly TemplateBlock[] };

/**
 * Programın günleri, salt okuma (`docs/design/kendi-program.md` §2.2, §2.3): her gün bir kart, başlıkta "sıradaki"
 * ya da "son: 22 Eyl", setler danışanın dilinde (`ClientDayPlan`). `action` günün altına (PT programında
 * "Kendi programına kopyala"). Kütüphanede olmayan hareket çizilmez (Bugün'deki gibi).
 */
export function ProgramDays({
  days,
  exercises,
  nextId,
  lastByDay,
  action,
}: {
  days: readonly Day[];
  exercises: ReadonlyMap<string, PlanExercise>;
  nextId: string | null;
  lastByDay: ReadonlyMap<string, string>;
  action?: (day: Day) => React.ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {days.map((day) => {
        const summary = templateSummary({ blocks: day.blocks }, exercises);
        const last = lastByDay.get(day.id);
        const status = [day.id === nextId ? 'sıradaki' : null, last ? `son: ${formatDayShort(last)}` : null].filter(Boolean).join(' · ');
        return (
          <li key={day.id}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="break-words">
                  {day.name}
                  {status ? <span className="font-normal text-muted-foreground"> · {status}</span> : null}
                </CardTitle>
                <CardDescription className="tabular-nums">
                  {summary.rows} hareket · {summary.workingSets} set · ≈ {summary.minutes} dk
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary.rows > 0 ? (
                  <ClientDayPlan blocks={day.blocks} exercises={exercises} />
                ) : (
                  <p className="text-sm text-muted-foreground">Bu günde hareket yok.</p>
                )}
              </CardContent>
              {action ? <CardFooter>{action(day)}</CardFooter> : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

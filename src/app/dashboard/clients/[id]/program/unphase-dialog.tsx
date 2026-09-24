'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PROGRAM_LIMITS, frequencyLabel, mergePhases, mergePhasesCheck, type ProgramPhase } from '@/lib/program-plan';

/**
 * Evreleri kaldırma onayı (birden çok evrede): günler program sırasıyla tek listede
 * birleşir, aynı adlı gün "… 2" olur, evre adları ve süreleri silinir, sıklık şu anki
 * evreden kalır. Birleşince 7 günü aşacaksa kaldırılamaz.
 */
export function UnphaseDialog({
  open,
  onOpenChange,
  phases,
  currentPhaseId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phases: ProgramPhase[];
  currentPhaseId: string;
  onConfirm: () => void;
}) {
  const check = mergePhasesCheck(phases);
  const { phases: merged, renamed } = mergePhases(phases, currentPhaseId);
  const current = phases.find((phase) => phase.id === currentPhaseId) ?? phases[0];
  const names = merged[0]?.days.map((day) => day.name).join(', ') ?? '';
  const phaseOf = (dayId: string) => phases.find((phase) => phase.days.some((day) => day.id === dayId))?.name ?? '';
  const frequency = frequencyLabel(current?.daysPerWeek)?.toLocaleLowerCase('tr');

  return (
    <AlertDialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Evreler kaldırılsın mı?</AlertDialogTitle>
          <AlertDialogDescription>
            {check.ok ? (
              <>
                {phases.length} evredeki {check.days} gün tek listede birleşir ve sırayla döner: {names}. Evre adları ve süreleri
                silinir; sıklık &apos;{current?.name}&apos; evresinden kalır
                {frequency ? ` (${frequency})` : ' (belirtilmemiş)'}.
              </>
            ) : (
              <>
                Birleşince {check.days} gün olur; tek listede en fazla {PROGRAM_LIMITS.daysPerPhase} gün olabilir. Önce bazı günleri
                sil.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {check.ok && renamed.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Aynı adlı günler yeniden adlanır:</span>
            <ul className="flex flex-col gap-0.5">
              {renamed.map((item) => (
                <li key={item.dayId}>
                  {phaseOf(item.dayId)} · {item.from} → {item.to}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction
            disabled={!check.ok}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}>
            Evreleri kaldır
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

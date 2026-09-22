'use client';

import { MUSCLE_LABELS, type Exercise } from '@/lib/schemas/exercise';
import {
  exerciseIntensity,
  isBodyMuscle,
  ROLE_LABELS,
  roleOf,
  summarizeMuscles,
  type BodyMuscle,
  type MuscleRole,
} from '@/lib/muscles';
import { cn } from '@/lib/utils';
import { MuscleMap } from './muscle-map';

type ExerciseMuscleMapProps = Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles' | 'stabilizerMuscles'> & {
  bodyClassName?: string;
};

/** Açıklama kutusundaki renk noktası: haritadaki tonla aynı. */
const DOT: Record<MuscleRole, string> = {
  primary: 'bg-primary',
  secondary: 'bg-primary/60',
  stabilizer: 'bg-primary/35',
};

/**
 * Bir egzersizin çalıştırdığı kaslar: ön ve arka yan yana; hedef tam renk, yardımcı
 * orta, dengeleyici açık ton. Yalnız gösterim; tıklanmaz.
 */
export function ExerciseMuscleMap({ primaryMuscles, secondaryMuscles, stabilizerMuscles, bodyClassName }: ExerciseMuscleMapProps) {
  const exercise = { primaryMuscles, secondaryMuscles, stabilizerMuscles };
  const lists: Record<MuscleRole, typeof primaryMuscles> = {
    primary: primaryMuscles,
    secondary: secondaryMuscles.filter((muscle) => roleOf(exercise, muscle) === 'secondary'),
    stabilizer: stabilizerMuscles.filter((muscle) => roleOf(exercise, muscle) === 'stabilizer'),
  };

  const describe = (muscle: BodyMuscle) => {
    const role = roleOf(exercise, muscle);
    return `${MUSCLE_LABELS[muscle]} · ${role ? ROLE_LABELS[role].toLocaleLowerCase('tr') : 'çalışmıyor'}`;
  };

  const worked = summarizeMuscles([...lists.primary, ...lists.secondary, ...lists.stabilizer].filter(isBodyMuscle));
  const label = worked.length > 0 ? `Çalışan kaslar: ${worked.join(', ')}` : 'Belirli bir kas grubu işaretlenmedi';

  return (
    <div className="flex flex-col items-center gap-4">
      <MuscleMap
        layout="split"
        intensity={exerciseIntensity(exercise)}
        describe={describe}
        bodyClassName={bodyClassName}
        label={label}
      />
      <dl className="flex flex-col gap-2 text-sm">
        {(['primary', 'secondary', 'stabilizer'] as const).map((role) =>
          lists[role].length > 0 ? (
            <div key={role} className="flex items-baseline gap-2">
              <span className={cn('size-2.5 shrink-0 rounded-full', DOT[role])} aria-hidden />
              <dt className="text-muted-foreground">{ROLE_LABELS[role]}</dt>
              <dd>{summarizeMuscles(lists[role]).join(', ')}</dd>
            </div>
          ) : null,
        )}
      </dl>
    </div>
  );
}

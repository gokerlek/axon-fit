'use client';

import { MUSCLE_LABELS, type Exercise } from '@/lib/schemas/exercise';
import { exerciseIntensity, isBodyMuscle, type BodyMuscle } from '@/lib/muscles';
import { MuscleMap } from './muscle-map';

type ExerciseMuscleMapProps = Pick<Exercise, 'targetMuscle' | 'secondaryMuscles'> & {
  bodyClassName?: string;
};

/**
 * Bir egzersizin çalıştırdığı kaslar: ön ve arka yan yana, hedef kas tam renk,
 * yardımcı kaslar yarı saydam. Yalnız gösterim; tıklanmaz.
 */
export function ExerciseMuscleMap({ targetMuscle, secondaryMuscles, bodyClassName }: ExerciseMuscleMapProps) {
  const secondary = secondaryMuscles.filter((muscle) => muscle !== targetMuscle);

  const describe = (muscle: BodyMuscle) => {
    const role = muscle === targetMuscle ? 'hedef kas' : secondary.includes(muscle) ? 'yardımcı kas' : 'çalışmıyor';
    return `${MUSCLE_LABELS[muscle]} · ${role}`;
  };

  const worked = [targetMuscle, ...secondary].filter(isBodyMuscle).map((muscle) => MUSCLE_LABELS[muscle]);
  const label = worked.length > 0 ? `Çalışan kaslar: ${worked.join(', ')}` : 'Belirli bir kas grubu işaretlenmedi';

  return (
    <div className="flex flex-col items-center gap-4">
      <MuscleMap
        layout="split"
        intensity={exerciseIntensity({ targetMuscle, secondaryMuscles })}
        describe={describe}
        bodyClassName={bodyClassName}
        label={label}
      />
      <dl className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <dt className="text-muted-foreground">Hedef</dt>
          <dd>{MUSCLE_LABELS[targetMuscle]}</dd>
        </div>
        {secondary.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
            <dt className="text-muted-foreground">Yardımcı</dt>
            <dd>{secondary.map((muscle) => MUSCLE_LABELS[muscle]).join(', ')}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
